// Q1.1.2 enforcement property tests: laws that must hold for every foul in every situation, checked
// over generated plays for both FIXTURE rule sets (fixture.ts). Every law reads its numbers from the
// rule set. Volume: 10,000 situations per rule set on every change (Q1.9 table); set GM_Q112_RUNS to
// 100000 for the full nightly volume.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { EnforcementOption, FoulRecord, PlayOutcome } from '@gm/schema';
import { FOUL_IDS, foulRules, downAfterPenalty, periodExtension, enforcementProfile } from '../../src/fouls/index.ts';
import { bench, foul, play, type Bench } from './fixture.ts';

const RUNS = Number(process.env.GM_Q112_RUNS ?? 10_000);
const INCH = 1 / 36;
const EPS = 1e-9;

interface Gen {
  dir: 1 | -1; ball: number; down: number; toGo: number; kind: 'run' | 'incomplete' | 'interception' | 'touchdown' | 'kickoff' | 'punt' | 'field_goal' | 'try_good' | 'try_failed';
  gain: number; ret: number; twoMinute: boolean; running: boolean; lastPlay: boolean;
  fouls: { id: string; by: 'A' | 'B'; timing: 'before_snap' | 'live' | 'dead_ball' | 'between_downs'; at: number; late: boolean; flagrant: boolean }[];
}

const ids = FOUL_IDS.map((f) => f.id);
const genFoul = fc.record({
  id: fc.constantFrom(...ids), by: fc.constantFrom<'A' | 'B'>('A', 'B'),
  timing: fc.constantFrom<'before_snap' | 'live' | 'dead_ball' | 'between_downs'>('before_snap', 'live', 'live', 'live', 'dead_ball', 'between_downs'),
  at: fc.integer({ min: -5, max: 105 }), late: fc.boolean(), flagrant: fc.boolean(),
});
const gen: fc.Arbitrary<Gen> = fc.record({
  dir: fc.constantFrom<1 | -1>(1, -1), ball: fc.integer({ min: 1, max: 99 }), down: fc.integer({ min: 1, max: 4 }),
  toGo: fc.integer({ min: 1, max: 25 }), kind: fc.constantFrom<Gen['kind']>('run', 'run', 'incomplete', 'interception', 'touchdown', 'kickoff', 'punt', 'field_goal', 'try_good', 'try_failed'),
  gain: fc.integer({ min: -10, max: 60 }), ret: fc.integer({ min: 0, max: 40 }), twoMinute: fc.boolean(), running: fc.boolean(), lastPlay: fc.boolean(),
  fouls: fc.array(genFoul, { minLength: 1, maxLength: 3 }),
});

interface Built { b: Bench; outcome: PlayOutcome; fouls: FoulRecord[] }

function build(g: Gen, level: 'pro' | 'college'): Built {
  const kickoff = g.kind === 'kickoff';
  const isTry = g.kind === 'try_good' || g.kind === 'try_failed';
  const kick = g.kind === 'punt' || g.kind === 'field_goal';
  const ball = isTry ? (g.twoMinute ? 98 : 85) : g.ball;
  const toGo = Math.min(g.toGo, 100 - ball);
  const b = bench({ level, dir: g.dir, ball, down: g.down, toGo, playKind: kickoff ? 'kickoff' : isTry ? 'try' : 'scrimmage',
    insideTwoMinute: g.twoMinute, clockRunning: g.running, period: 2, untimedDown: g.lastPlay });
  const clamp = (p: number) => Math.min(99, Math.max(1, p));
  const changed = g.kind === 'interception' || kickoff || g.kind === 'punt';
  let outcome: PlayOutcome;
  if (g.kind === 'run') outcome = play(b, { end: clamp(ball + g.gain) });
  else if (g.kind === 'incomplete') outcome = play(b, { end: ball, result: 'pass_incomplete', incomplete: true });
  else if (g.kind === 'touchdown') outcome = play(b, { end: 100, score: 'touchdown' });
  else if (g.kind === 'field_goal') outcome = play(b, { end: ball, result: 'field_goal_good', score: 'field_goal' });
  else if (g.kind === 'try_good') outcome = play(b, { end: ball, result: 'try_good', score: g.twoMinute ? 'try_two' : 'try_kick' });
  else if (g.kind === 'try_failed') outcome = play(b, { end: ball, result: 'try_failed' });
  else outcome = play(b, { end: clamp(ball + g.gain + g.ret / 2), to: 'B', result: kickoff ? 'kickoff' : g.kind === 'punt' ? 'punt' : 'interception' });
  const fouls = g.fouls.filter((f) => foulRules.catalogue(f.id, b.ctx).exists).map((f) => {
    const afterChange = changed && f.late && f.timing === 'live';
    const phase = isTry ? 'try' : afterChange ? 'after_change_of_possession' : kickoff ? 'free_kick' : kick ? 'scrimmage_kick'
      : g.kind === 'run' || g.kind === 'touchdown' ? 'running_play' : 'pass_play';
    return foul(b, f.id, f.by, { timing: f.timing, at: f.at, phase, afterChange, flagrant: f.flagrant });
  });
  return { b, outcome, fouls };
}

/** The laws of Q1.1.2. Returns one line per law an option breaks. */
function lawProblems(c: Built, options: EnforcementOption[]): string[] {
  const { b, outcome, fouls } = c;
  const r = b.ctx.rules;
  const out: string[] = [];
  const length = 100;
  if (options.length === 0) out.push('no option returned');
  options.forEach((opt, k) => {
    const o = opt.outcome;
    const e = o.enforcement;
    const spot = b.yardA(o.spotX);
    const tag = `option ${k} (${opt.optionId})`;
    if (e === null) {
      // With no called foul the single option is the called outcome itself.
      if (fouls.some((f) => f.called) || o !== outcome || options.length !== 1) out.push(`${tag}: no enforcement summary`);
      return;
    }

    // Law 1: no distance penalty moves the ball more than the rule set's share of the distance to the offender's goal line.
    if (r.bool('enforce.half_distance.applies') && e.enforced.length === 1 && e.fromSpot !== null && !e.offsetting) {
      const f = fouls[e.enforced[0]!]!;
      const exempt = enforcementProfile(f.foulId, r) !== 'standard';
      const from = b.yardA(e.fromSpot.x);
      const room = f.side === b.A ? from : length - from;
      const towardOffender = f.side === b.A ? -e.yardsWalked : e.yardsWalked;
      if (!exempt && towardOffender > room * r.num('enforce.half_distance.fraction') + EPS) out.push(`${tag}: walked ${towardOffender} with ${room} to the goal line`);
      if (!exempt && towardOffender < -EPS) out.push(`${tag}: the penalty moved the ball in the offender's favour`);
    }

    // Law 2: the ball is in the field of play, or a score or a touchback is declared.
    if (!(spot > 0 && spot < length) && o.score === null && !o.touchback) out.push(`${tag}: ball at ${spot} with no score`);

    // Law 3: down and distance are consistent.
    const d = downAfterPenalty(o, fouls, b.ctx);
    if (d !== null) {
      if (!(d.down >= 1 && d.down <= r.num('series.downs'))) out.push(`${tag}: down ${d.down}`);
      if (!(d.distanceYd >= INCH - EPS)) out.push(`${tag}: distance ${d.distanceYd}`);
      if (d.distanceYd > r.num('series.yards_to_gain') + length) out.push(`${tag}: distance ${d.distanceYd}`);
    } else if (o.score === null && b.ctx.situation.playKind === 'scrimmage') {
      out.push(`${tag}: no down after a scrimmage play without a score`);
    }

    // Law 4: declining every foul gives the result of the play.
    if (opt.optionId === 'decline') {
      if (e.enforced.length !== 0) out.push(`${tag}: a declined option enforced a foul`);
      if (JSON.stringify({ ...o, enforcement: null }) !== JSON.stringify(outcome)) out.push(`${tag}: declining changed the play result`);
    }

    // Law 5: offsetting fouls replay the down at the previous spot, unless the result stands by rule.
    if (e.offsetting && o.noPlay) {
      if (Math.abs(o.spotX - o.previousSpotX) > EPS && e.enforced.every((i) => fouls[i]!.timing !== 'between_downs' && fouls[i]!.foulId !== 'foul_against_official' && fouls[i]!.foulId !== 'challenge_without_timeout' && fouls[i]!.foulId !== 'excess_injury_timeout')) out.push(`${tag}: offset replay away from the previous spot`);
      if (o.possessionAfter !== o.snappingSide || o.score !== null) out.push(`${tag}: offset replay changed possession or kept a score`);
    }

    // Law 6: the runoff is offered only in a legal clock state, and never against the defense.
    if (e.runoffTaken) {
      const s = b.ctx.situation;
      const ok = s.insideTwoMinute && e.enforced.some((i) => fouls[i]!.runoffEligible && fouls[i]!.side === b.A);
      if (!ok) out.push(`${tag}: runoff offered outside the rule`);
    }

    // Law 7: a half cannot end on an accepted live-ball defensive foul unless the rule data says so.
    const defensive = e.enforced.some((i) => fouls[i]!.side === b.B && fouls[i]!.timing === 'live');
    if (defensive && e.carriedTo === null && !e.offsetting && r.bool('enforce.defensive_foul_extends_period') && !periodExtension(o, fouls, b.ctx)) {
      out.push(`${tag}: accepted defensive foul without the right to extend the period`);
    }

    // Bookkeeping: every called foul is either enforced or declined, never both.
    const called = fouls.map((f, i) => (f.called ? i : -1)).filter((i) => i >= 0);
    const both = [...e.enforced, ...e.declined].sort((x, y) => x - y);
    if (JSON.stringify(both) !== JSON.stringify(called)) out.push(`${tag}: enforced ${e.enforced} and declined ${e.declined} do not cover ${called}`);
  });
  // The option ids are distinct, so a choice names exactly one outcome (B8.5.8 acceptance).
  if (new Set(options.map((x) => x.optionId)).size !== options.length) out.push('duplicate option ids');
  return out;
}

describe.each(['pro', 'college'] as const)('Q1.1.2 enforcement properties, fixture rule set %s', (level) => {
  it(`all laws hold over ${RUNS} generated situations`, () => {
    fc.assert(fc.property(gen, (g) => {
      const c = build(g, level);
      const options = foulRules.options(c.outcome, c.fouls, c.b.ctx);
      expect(lawProblems(c, options)).toEqual([]);
    }), { numRuns: RUNS, seed: 20261126 });
  });

  it('the same input gives the same options (pure function)', () => {
    fc.assert(fc.property(gen, (g) => {
      const c = build(g, level);
      expect(foulRules.options(c.outcome, c.fouls, c.b.ctx)).toEqual(foulRules.options(c.outcome, c.fouls, c.b.ctx));
    }), { numRuns: 500, seed: 7 });
  });

  it('mirror: attacking the other way gives the same yardage, down and choices', () => {
    fc.assert(fc.property(gen, (g) => {
      const east = build({ ...g, dir: 1 }, level);
      const west = build({ ...g, dir: -1 }, level);
      const view = (c: Built) => foulRules.options(c.outcome, c.fouls, c.b.ctx).map((o) => [o.optionId, o.labelKey, c.b.yardA(o.outcome.spotX),
        o.outcome.possessionAfter, o.outcome.noPlay, o.outcome.score?.type ?? null, o.outcome.enforcement?.yardsWalked ?? null]);
      expect(view(west)).toEqual(view(east));
    }), { numRuns: 2000, seed: 11 });
  });
});

describe('Q1.1.2 acceptance: a deliberately broken enforcement is caught', () => {
  it('a full 15 yards from the 10 breaks the half-the-distance law', () => {
    const b = bench({ ball: 10 });
    const outcome = play(b, { end: 10 });
    const fouls = [foul(b, 'unnecessary_roughness', 'A', { timing: 'dead_ball' })];
    const c: Built = { b, outcome, fouls };
    const good = foulRules.options(outcome, fouls, b.ctx);
    expect(lawProblems(c, good)).toEqual([]);
    expect(b.yardA(good[1]!.outcome.spotX)).toBe(5);
    const broken = good.map((o, k) => (k === 1 ? { ...o, outcome: { ...o.outcome, spotX: b.x(-5), enforcement: { ...o.outcome.enforcement!, yardsWalked: -15 } } } : o));
    const problems = lawProblems(c, broken);
    expect(problems.some((p) => p.includes('walked 15'))).toBe(true);
    expect(problems.some((p) => p.includes('with no score'))).toBe(true);
  });
});
