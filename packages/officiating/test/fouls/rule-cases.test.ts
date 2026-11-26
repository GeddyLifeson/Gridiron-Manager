// Q1.1.1 rule-case suite for B8 (fouls and enforcement), with the kick cases of B6.6.1, the try cases
// of B7.3.3 and the college cases of B13.5 and B13.8. Each case is the acceptance criterion or the
// worked example of the leaf named in its title, run on the FIXTURE rule set (fixture.ts). The
// real-value run of Q1.1.1 follows integration with WP-01. Every case runs attacking both ways.
import { describe, expect, it } from 'vitest';
import { RuleKeyDef, type EnforcementOption, type FoulRecord, type PlayTruth } from '@gm/schema';
import {
  foulRules, RULE_KEYS, PARAMS, FOUL_IDS, optionsFromTruth, optionsWithFacts, factsFromOutcome, downAfterPenalty,
  periodExtension, candidates,
} from '../../src/fouls/index.ts';
import { bench, fixtureKeyProblems, fixtureRules, foul, play, type Bench } from './fixture.ts';

const DIRS = [1, -1] as const;
const label = (k: string) => `penalty.option.${k}`;
const pick = (opts: EnforcementOption[], kind: string): EnforcementOption => {
  const o = opts.find((x) => x.labelKey === label(kind));
  if (!o) throw new Error(`no option ${kind} among ${opts.map((x) => x.labelKey).join(', ')}`);
  return o;
};
const at = (b: Bench, o: EnforcementOption) => b.yardA(o.outcome.spotX);
const next = (b: Bench, o: EnforcementOption, fouls: FoulRecord[]) => downAfterPenalty(o.outcome, fouls, b.ctx)!;

describe('foul catalogue and manifest (B8.1.1, B8.1.2)', () => {
  it('every manifest key is a valid key definition, named once, and the fixtures hold exactly those keys', () => {
    const seen = new Set<string>();
    for (const k of RULE_KEYS) { expect(RuleKeyDef.safeParse(k).success).toBe(true); expect(seen.has(k.key)).toBe(false); seen.add(k.key); }
    expect(fixtureKeyProblems('pro')).toEqual([]);
    expect(fixtureKeyProblems('college')).toEqual([]);
    expect(PARAMS.params).toEqual([]);
  });

  it('B8.1.2: every foul id has a catalogue row with no missing field in both fixture sets', () => {
    for (const level of ['pro', 'college'] as const) {
      const src = { rules: fixtureRules(level), params: bench({ ball: 30 }).ctx.params };
      for (const f of FOUL_IDS) {
        const row = foulRules.catalogue(f.id, src);
        expect(row.id).toBe(f.id);
        expect(row.yards).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('B8.1.2 rows read back as written: holding 10 and no first down, defensive holding 5 and a first down', () => {
    const b = bench({ ball: 30 });
    expect(foulRules.catalogue('offensive_holding', b.ctx)).toMatchObject({ yards: 10, afd: false, lod: false, foulClass: 'other' });
    expect(foulRules.catalogue('def_holding', b.ctx)).toMatchObject({ yards: 5, afd: true });
    expect(foulRules.catalogue('running_into_kicker', b.ctx)).toMatchObject({ yards: 5, afd: false, foulClass: 'other' });
    expect(foulRules.catalogue('helmet_weapon', b.ctx)).toMatchObject({ yards: 15, dq: 'automatic' });
    expect(() => foulRules.catalogue('not_a_foul', b.ctx)).toThrow();
  });

  it('B8.1.1: candidates carry catalogue fields, clean-hands timing and the same-act link; borderline acts and fouls that do not exist are left out', () => {
    const ev = (foulId: string, side: 0 | 1, t: number, playerId: number, extra: object = {}) => ({ type: 'foul_committed' as const, t, foulId, side, playerId,
      spot: { x: 50, y: 20 }, timing: 'live' as const, phase: 'pass_play' as const, severity: 0.5, visibility: 'open' as const,
      atPointOfAttack: true, flagrant: false, borderline: false, ordered: false, ...extra });
    const truth: PlayTruth = { resolverId: 'reference', resolverVersion: '0', gameId: 1, playNumber: 1, originX: 40, originY: 26, attackDir: 1,
      liveDurationTenths: 60, endZoneImpetus: null, events: [
        ev('illegal_contact', 1, 1, 21),
        ev('dpi', 1, 2, 24), ev('unnecessary_roughness', 1, 2, 24),
        ev('def_holding', 1, 2.5, 30, { borderline: true }),
        { type: 'possession', t: 3, side: 1, playerId: 24, spot: { x: 60, y: 20 }, how: 'interception' },
        ev('illegal_block_in_back', 1, 4, 31, { phase: 'after_change_of_possession' }),
        ev('taunting', 1, 5, 24),
        { type: 'dead_ball', t: 6, marginYd: null, marginS: null, visibility: 'open', reason: 'down_by_contact', spot: { x: 55, y: 20 }, side: 1, carrierId: 24 },
      ] };
    const pro = candidates(truth, bench({ ball: 30 }).ctx);
    expect(pro.map((r) => r.foulId)).toEqual(['illegal_contact', 'dpi', 'unnecessary_roughness', 'illegal_block_in_back', 'taunting']);
    expect(pro.every((r) => !r.called && !r.correct)).toBe(true);
    expect(pro[1]!.sameAct).toBe(2); expect(pro[2]!.sameAct).toBe(1);
    expect(pro.map((r) => r.beforeChangeOfPossession)).toEqual([true, true, true, false, false]);
    expect(pro[4]!.timing).toBe('dead_ball');
    expect(pro[0]).toMatchObject({ yards: 5, afd: true, eventIndex: 0 });
    const college = candidates(truth, bench({ ball: 30, level: 'college' }).ctx);
    expect(college.map((r) => r.foulId)).not.toContain('illegal_contact');
  });
});

describe.each(DIRS)('Q1.1.1 rule cases for B8, attack direction %i', (dir) => {
  it('no called foul: one option holding the called outcome unchanged', () => {
    const b = bench({ ball: 30, dir });
    const o = play(b, { end: 38 });
    const opts = foulRules.options(o, [foul(b, 'offensive_holding', 'A', { called: false })], b.ctx);
    expect(opts).toHaveLength(1);
    expect(opts[0]!.outcome).toBe(o);
  });

  it('B8.5.2: offensive holding 3 yards behind the line on a run that gains 8 nets minus 10 from the previous spot', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'offensive_holding', 'A', { at: 27 })];
    const opts = foulRules.options(play(b, { end: 38 }), fouls, b.ctx);
    const o = pick(opts, 'previous_spot');
    expect(at(b, o)).toBe(20);
    expect(o.outcome.noPlay).toBe(true);
    expect(next(b, o, fouls)).toMatchObject({ down: 1, distanceYd: 20, possession: b.A });
  });

  it('B8.5.2: offensive holding 6 yards downfield on a 15-yard run is marked from the spot of the foul, a net of minus 4', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'offensive_holding', 'A', { at: 36 })];
    const o = pick(foulRules.options(play(b, { end: 45 }), fouls, b.ctx), 'spot_of_foul');
    expect(at(b, o)).toBe(26);
    expect(o.outcome.enforcement).toMatchObject({ yardsWalked: -10, replayDown: true });
    expect(next(b, o, fouls)).toMatchObject({ down: 1, distanceYd: 14 });
  });

  it('B8.5.2: offensive holding beyond the end of the run is marked from the basic spot', () => {
    const b = bench({ ball: 30, dir });
    const o = pick(foulRules.options(play(b, { end: 34 }), [foul(b, 'offensive_holding', 'A', { at: 40 })], b.ctx), 'basic_spot');
    expect(at(b, o)).toBe(24);
  });

  it('B8.5.2: a defensive face mask on a 12-yard run adds 15 from the dead-ball spot', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'face_mask', 'B', { at: 40 })];
    const o = pick(foulRules.options(play(b, { end: 42 }), fouls, b.ctx), 'basic_spot');
    expect(at(b, o)).toBe(57);
    expect(o.outcome.noPlay).toBe(false);
    expect(next(b, o, fouls)).toMatchObject({ down: 1, distanceYd: 10, firstDownAwarded: true });
  });

  it('B8.5.2 exception 3: a defensive foul on a run stopped behind the line goes from the previous spot', () => {
    const b = bench({ ball: 30, dir });
    const o = pick(foulRules.options(play(b, { end: 27 }), [foul(b, 'face_mask', 'B', { at: 28 })], b.ctx), 'previous_spot');
    expect(at(b, o)).toBe(45);
  });

  it('B8.5.2 exception 7: a defensive personal foul on a completed pass goes from the dead-ball spot when that is better', () => {
    const b = bench({ ball: 30, dir });
    const o = play(b, { end: 48, result: 'pass_complete' });
    const opts = foulRules.options(o, [foul(b, 'roughing_passer', 'B', { phase: 'pass_play' })], b.ctx);
    expect(at(b, pick(opts, 'dead_ball_spot'))).toBe(63);
    const short = foulRules.options(play(b, { end: 26, result: 'pass_complete' }), [foul(b, 'roughing_passer', 'B', { phase: 'pass_play' })], b.ctx);
    expect(at(b, pick(short, 'previous_spot'))).toBe(45);
  });

  it('B8.5.2 exception 8: an offensive personal foul before an interception is marked from the dead-ball spot and the defense keeps the ball', () => {
    const b = bench({ ball: 30, dir });
    const o = play(b, { end: 50, to: 'B', result: 'interception' });
    const opts = foulRules.options(o, [foul(b, 'unnecessary_roughness', 'A', { phase: 'pass_play' })], b.ctx);
    const keep = pick(opts, 'dead_ball_spot');
    expect(at(b, keep)).toBe(35);
    expect(keep.outcome.possessionAfter).toBe(b.B);
  });

  it('B8.5.2 exception 9: a defensive foul before a fumble is lost returns the ball to the offense', () => {
    const b = bench({ ball: 30, dir });
    const o = play(b, { end: 44, to: 'B', result: 'fumble_lost' });
    const facts = { ...factsFromOutcome(o, b.ctx), lostAt: 41 };
    const fouls = [foul(b, 'face_mask', 'B', { at: 38 })];
    const opt = pick(optionsWithFacts(o, fouls, facts, b.ctx), 'basic_spot');
    expect(at(b, opt)).toBe(56);
    expect(opt.outcome.possessionAfter).toBe(b.A);
    expect(next(b, opt, fouls)).toMatchObject({ down: 1, possession: b.A });
  });

  it('B8.5.3: defensive offside at its own 4 moves the ball to the 2', () => {
    const b = bench({ ball: 96, dir, toGo: 4 });
    const o = pick(foulRules.options(play(b, { end: 96, result: 'no_play' }), [foul(b, 'offside', 'B', { t: 0 })], b.ctx), 'previous_spot');
    expect(at(b, o)).toBe(98);
    expect(o.outcome.enforcement!.halfDistanceApplied).toBe(true);
  });

  it('B8.5.3: a 15-yard foul at the offender\'s 6 moves the ball 3 yards', () => {
    const b = bench({ ball: 6, dir });
    const o = pick(foulRules.options(play(b, { end: 6 }), [foul(b, 'unnecessary_roughness', 'A', { timing: 'dead_ball' })], b.ctx), 'succeeding_spot');
    expect(at(b, o)).toBe(3);
    expect(o.outcome.enforcement).toMatchObject({ yardsWalked: -3, halfDistanceApplied: true });
  });

  it('B8.5.3: offensive holding in its own end zone offers a safety', () => {
    const b = bench({ ball: 3, dir });
    const o = play(b, { end: 9, result: 'pass_complete' });
    const opts = foulRules.options(o, [foul(b, 'offensive_holding', 'A', { at: -2, phase: 'pass_play' })], b.ctx);
    const s = pick(opts, 'safety');
    expect(s.outcome.score).toEqual({ type: 'safety', side: b.B, points: 2, scorerId: null });
    expect(at(b, pick(opts, 'previous_spot'))).toBe(1.5);
  });

  it('B8.5.4: third and 12, defensive holding gives first and 10 five yards ahead', () => {
    const b = bench({ ball: 40, dir, down: 3, toGo: 12 });
    const fouls = [foul(b, 'def_holding', 'B', { phase: 'pass_play', at: 45 })];
    const o = pick(foulRules.options(play(b, { end: 40, result: 'pass_incomplete', incomplete: true }), fouls, b.ctx), 'previous_spot');
    expect(at(b, o)).toBe(45);
    expect(next(b, o, fouls)).toMatchObject({ down: 1, distanceYd: 10, firstDownAwarded: true });
  });

  it('B8.5.4: defensive offside on third and 3 gives a first down, on third and 8 it is third and 3', () => {
    for (const [toGo, down, dist] of [[3, 1, 10], [8, 3, 3]] as const) {
      const b = bench({ ball: 40, dir, down: 3, toGo });
      const fouls = [foul(b, 'offside', 'B', { t: 0 })];
      const o = pick(foulRules.options(play(b, { end: 40, result: 'pass_incomplete', incomplete: true }), fouls, b.ctx), 'previous_spot');
      expect(next(b, o, fouls)).toMatchObject({ down, distanceYd: dist });
    }
  });

  it('B8.5.4: intentional intentional_grounding on fourth down gives the defense the ball after the yardage', () => {
    const b = bench({ ball: 40, dir, down: 4, toGo: 10 });
    const fouls = [foul(b, 'intentional_grounding', 'A', { phase: 'pass_play', at: 33 })];
    const o = pick(foulRules.options(play(b, { end: 40, result: 'pass_incomplete', incomplete: true }), fouls, b.ctx), 'previous_spot');
    expect(at(b, o)).toBe(30);
    expect(o.outcome.enforcement!.lossOfDown).toBe(true);
    expect(next(b, o, fouls)).toMatchObject({ possession: b.B, down: 1, turnoverOnDowns: true });
  });

  it('B8.1.2: intentional_grounding from farther back than the yardage is marked at the spot of the pass; from the end zone it is a safety', () => {
    const b = bench({ ball: 40, dir, down: 2 });
    const fouls = [foul(b, 'intentional_grounding', 'A', { phase: 'pass_play', at: 26 })];
    const o = pick(foulRules.options(play(b, { end: 40, result: 'pass_incomplete', incomplete: true }), fouls, b.ctx), 'spot_of_foul');
    expect(at(b, o)).toBe(26);
    expect(next(b, o, fouls)).toMatchObject({ down: 3, distanceYd: 24 });
    const deep = bench({ ball: 4, dir });
    const s = foulRules.options(play(deep, { end: 4, incomplete: true }), [foul(deep, 'intentional_grounding', 'A', { phase: 'pass_play', at: -3 })], deep.ctx);
    expect(pick(s, 'safety').outcome.score!.side).toBe(deep.B);
  });

  it('B8.5.5 rule 1: with two fouls by one team the offended team picks one', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'offside', 'B', { t: 0 }), foul(b, 'roughing_passer', 'B', { phase: 'pass_play' })];
    const opts = foulRules.options(play(b, { end: 30, incomplete: true }), fouls, b.ctx);
    expect(opts.map((o) => at(b, o)).sort((x, y) => x - y)).toEqual([30, 35, 45]);
    expect(opts[0]!.optionId).toBe('decline');
    for (const o of opts) expect(o.outcome.enforcement!.enforced.length).toBeLessThanOrEqual(1);
  });

  it('B8.5.5 rule 2: fouls by both teams with no change of possession offset and the down is replayed; nobody may decline', () => {
    const b = bench({ ball: 30, dir, down: 2, toGo: 7 });
    const fouls = [foul(b, 'offensive_holding', 'A', { at: 31 }), foul(b, 'def_holding', 'B', { at: 40 })];
    const opts = foulRules.options(play(b, { end: 52 }), fouls, b.ctx);
    expect(opts).toHaveLength(1);
    expect(opts[0]!.outcome).toMatchObject({ noPlay: true, possessionAfter: b.A });
    expect(at(b, opts[0]!)).toBe(30);
    expect(opts[0]!.outcome.enforcement).toMatchObject({ offsetting: true, replayDown: true, yardsWalked: 0 });
    expect(next(b, opts[0]!, fouls)).toMatchObject({ down: 2, distanceYd: 7 });
  });

  it('B8.5.5 rule 3: a false start and defensive unnecessary roughness after the whistle is 15 on the defense from the previous spot', () => {
    const b = bench({ ball: 30, dir, down: 2, toGo: 7 });
    const fouls = [foul(b, 'false_start', 'A', { timing: 'before_snap' }), foul(b, 'unnecessary_roughness', 'B', { timing: 'dead_ball' })];
    const opts = foulRules.options(play(b, { end: 30, result: 'no_play', noPlay: true }), fouls, b.ctx);
    expect(opts).toHaveLength(1);
    expect(at(b, opts[0]!)).toBe(45);
    expect(opts[0]!.outcome.enforcement).toMatchObject({ enforced: [1], declined: [0], offsetting: false, automaticFirstDown: true });
    expect(next(b, opts[0]!, fouls)).toMatchObject({ down: 1, distanceYd: 10 });
  });

  it('B8.5.5 rule 3 does not apply when the minor foul carries the runoff: the fouls offset', () => {
    const b = bench({ ball: 30, dir, insideTwoMinute: true, clockRunning: true });
    const fouls = [foul(b, 'false_start', 'A', { timing: 'before_snap' }), foul(b, 'unnecessary_roughness', 'B', { timing: 'dead_ball' })];
    const opts = foulRules.options(play(b, { end: 30, result: 'no_play', noPlay: true }), fouls, b.ctx);
    expect(opts[0]!.outcome.enforcement!.offsetting).toBe(true);
    expect(at(b, opts[0]!)).toBe(30);
  });

  it('B8.5.5 rule 4: the spiking team may take its delay penalty instead of the offset', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'def_holding', 'B', { at: 35 }), foul(b, 'delay_of_game_spike', 'A', { timing: 'dead_ball' })];
    const opts = foulRules.options(play(b, { end: 48 }), fouls, b.ctx);
    expect(opts[0]!.outcome.enforcement!.offsetting).toBe(true);
    const spike = opts.find((o) => o.optionId.startsWith('spike'))!;
    expect(spike.side).toBe(b.A);
    expect(at(b, spike)).toBe(43);
  });

  it('B8.5.5 rule 5: dead-ball fouls by both teams offset at the succeeding spot and the down counts', () => {
    const b = bench({ ball: 30, dir, down: 2, toGo: 10 });
    const fouls = [foul(b, 'unnecessary_roughness', 'A', { timing: 'dead_ball' }), foul(b, 'taunting', 'B')];
    const opts = foulRules.options(play(b, { end: 34 }), fouls, b.ctx);
    expect(opts).toHaveLength(1);
    expect(at(b, opts[0]!)).toBe(34);
    expect(opts[0]!.outcome).toMatchObject({ noPlay: false });
    expect(next(b, opts[0]!, fouls)).toMatchObject({ down: 3, distanceYd: 6 });
  });

  it('B8.5.5 rule 6: no clean hands (the intercepting team was offside before the throw) offsets and replays', () => {
    const b = bench({ ball: 30, dir, down: 2 });
    const fouls = [foul(b, 'offside', 'B', { t: 0, phase: 'pass_play' }), foul(b, 'illegal_block_in_back', 'A', { at: 50, afterChange: true })];
    const opts = foulRules.options(play(b, { end: 50, to: 'B', result: 'interception' }), fouls, b.ctx);
    expect(opts).toHaveLength(1);
    expect(opts[0]!.outcome).toMatchObject({ noPlay: true, possessionAfter: b.A, changeOfPossession: false });
    expect(at(b, opts[0]!)).toBe(30);
  });

  it('B8.5.5 rule 6: clean hands (holding before the throw, block in the back on the return) keeps the ball with the intercepting team and enforces its own foul', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'offensive_holding', 'A', { at: 28, phase: 'pass_play' }), foul(b, 'illegal_block_in_back', 'B', { at: 55, afterChange: true })];
    const opts = foulRules.options(play(b, { end: 50, to: 'B', result: 'interception' }), fouls, b.ctx);
    expect(opts).toHaveLength(1);
    expect(opts[0]!.outcome.possessionAfter).toBe(b.B);
    expect(at(b, opts[0]!)).toBe(65);
    expect(opts[0]!.outcome.enforcement).toMatchObject({ enforced: [1], declined: [0], offsetting: false });
    expect(next(b, opts[0]!, fouls)).toMatchObject({ possession: b.B, down: 1, distanceYd: 10 });
  });

  it('B8.5.5 rule 6 (2024): a personal foul by the offense before the change offsets, and the ball stays where the other foul would be marked from', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'unnecessary_roughness', 'A', { phase: 'pass_play' }), foul(b, 'illegal_block_in_back', 'B', { at: 55, afterChange: true })];
    const opts = foulRules.options(play(b, { end: 50, to: 'B', result: 'interception' }), fouls, b.ctx);
    expect(opts[0]!.outcome.enforcement!.offsetting).toBe(true);
    expect(opts[0]!.outcome.possessionAfter).toBe(b.B);
    expect(at(b, opts[0]!)).toBe(55);
  });

  it('B8.5.5 rule 7: both teams foul after the change: offset, the team in possession keeps the ball where its foul would be marked from', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'face_mask', 'A', { at: 52, afterChange: true }), foul(b, 'illegal_block_in_back', 'B', { at: 55, afterChange: true })];
    const opts = foulRules.options(play(b, { end: 50, to: 'B', result: 'interception' }), fouls, b.ctx);
    expect(opts).toHaveLength(1);
    expect(opts[0]!.outcome.enforcement!.offsetting).toBe(true);
    expect(opts[0]!.outcome.possessionAfter).toBe(b.B);
    expect(at(b, opts[0]!)).toBe(55);
  });

  it('B8.5.6: a late hit out of bounds after a first-down run is 15 from the end of the run, first and 10', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'unnecessary_roughness', 'B', { timing: 'dead_ball', at: 42 })];
    const o = pick(foulRules.options(play(b, { end: 42 }), fouls, b.ctx), 'succeeding_spot');
    expect(at(b, o)).toBe(57);
    expect(next(b, o, fouls)).toMatchObject({ down: 1, distanceYd: 10 });
  });

  it('B8.5.6: third-down incompletion then defensive taunting: the down counts, then 15 yards and a first down', () => {
    const b = bench({ ball: 30, dir, down: 3, toGo: 10 });
    const fouls = [foul(b, 'taunting', 'B')];
    const o = pick(foulRules.options(play(b, { end: 30, result: 'pass_incomplete', incomplete: true }), fouls, b.ctx), 'succeeding_spot');
    expect(at(b, o)).toBe(45);
    expect(o.outcome.noPlay).toBe(false);
    expect(next(b, o, fouls)).toMatchObject({ down: 1, distanceYd: 10, firstDownAwarded: true });
  });

  it('B8.5.6 rule 1: a dead-ball foul by the defense after a failed fourth down is marked off after the ball goes over', () => {
    const b = bench({ ball: 30, dir, down: 4, toGo: 10 });
    const fouls = [foul(b, 'unnecessary_roughness', 'B', { timing: 'dead_ball' })];
    const o = pick(foulRules.options(play(b, { end: 33 }), fouls, b.ctx), 'succeeding_spot');
    expect(o.outcome.possessionAfter).toBe(b.B);
    expect(at(b, o)).toBe(48);
    expect(next(b, o, fouls)).toMatchObject({ possession: b.B, down: 1 });
  });

  it('B8.5.4 rule 8: an offensive foul between downs after a first-down play is first and 25; a dead-ball foul is first and 10 after enforcement', () => {
    const b = bench({ ball: 30, dir });
    const between = [foul(b, 'unsportsmanlike', 'A', { timing: 'between_downs' })];
    const o1 = foulRules.options(play(b, { end: 45 }), between, b.ctx).find((o) => o.outcome.enforcement!.enforced.length === 1)!;
    expect(at(b, o1)).toBe(30);
    expect(next(b, o1, between)).toMatchObject({ down: 1, distanceYd: 25 });
    const dead = [foul(b, 'unnecessary_roughness', 'A', { timing: 'dead_ball' })];
    const o2 = pick(foulRules.options(play(b, { end: 45 }), dead, b.ctx), 'succeeding_spot');
    expect(next(b, o2, dead)).toMatchObject({ down: 1, distanceYd: 10 });
  });

  it('B8.5.6 rule 4: a personal foul after the last play of a half goes to the next kickoff', () => {
    const b = bench({ ball: 30, dir, period: 2, untimedDown: true });
    const o = pick(foulRules.options(play(b, { end: 36 }), [foul(b, 'unnecessary_roughness', 'B', { timing: 'dead_ball' })], b.ctx), 'carry_kickoff');
    expect(at(b, o)).toBe(36);
    expect(o.outcome.enforcement!.carriedTo).toBe('kickoff');
  });

  it('B8.5.7: roughing the passer on a touchdown pass: the touchdown stands and 15 yards go to the try or the kickoff', () => {
    const b = bench({ ball: 70, dir });
    const o = play(b, { end: 100, result: 'pass_complete', score: 'touchdown' });
    const opts = foulRules.options(o, [foul(b, 'roughing_passer', 'B', { phase: 'pass_play' })], b.ctx);
    for (const kind of ['carry_try', 'carry_kickoff']) {
      const c = pick(opts, kind);
      expect(c.outcome.score).toEqual(o.score);
      expect(c.outcome.enforcement).toMatchObject({ enforced: [0], carriedTo: kind === 'carry_try' ? 'try' : 'kickoff' });
    }
    expect(opts[0]!.optionId).toBe('decline');
  });

  it('B8.5.7: defensive offside on a made field goal on fourth and 3: the coach may take the first down instead of the points', () => {
    const b = bench({ ball: 77, dir, down: 4, toGo: 3 });
    const o = play(b, { end: 77, result: 'field_goal_good', score: 'field_goal' });
    const fouls = [foul(b, 'offside', 'B', { t: 0, phase: 'scrimmage_kick' })];
    const opts = foulRules.options(o, fouls, b.ctx);
    expect(opts[0]!.outcome.score).toEqual(o.score);
    const take = pick(opts, 'previous_spot');
    expect(take.outcome.score).toBeNull();
    expect(at(b, take)).toBe(82);
    expect(next(b, take, fouls)).toMatchObject({ down: 1, firstDownAwarded: true });
  });

  it('B8.5.7 rule 6: a live-ball foul by the scoring team nullifies the score', () => {
    const b = bench({ ball: 80, dir });
    const o = play(b, { end: 100, score: 'touchdown' });
    const opt = pick(foulRules.options(o, [foul(b, 'offensive_holding', 'A', { at: 85 })], b.ctx), 'spot_of_foul');
    expect(opt.outcome.score).toBeNull();
    expect(at(b, opt)).toBe(75);
  });

  it('B8.5.7 rule 5: a taunt by the scoring team after the score with a live-ball minor foul by the opponent: the score counts and the taunt is carried', () => {
    const b = bench({ ball: 80, dir });
    const o = play(b, { end: 100, score: 'touchdown' });
    const opts = foulRules.options(o, [foul(b, 'offside', 'B', { t: 0 }), foul(b, 'taunting', 'A')], b.ctx);
    expect(opts.every((c) => c.outcome.score !== null)).toBe(true);
    expect(opts.some((c) => c.outcome.enforcement!.carriedTo === 'try' && c.outcome.enforcement!.enforced.includes(1))).toBe(true);
  });

  it('B8.5.8: a declined penalty leaves the play result untouched; a disqualified player is removed even then (B8.4.2 rule 5)', () => {
    const b = bench({ ball: 30, dir });
    const o = play(b, { end: 38 });
    const opts = foulRules.options(o, [foul(b, 'unnecessary_roughness', 'B', { timing: 'dead_ball', flagrant: true, playerId: 55 })], b.ctx);
    const d = opts[0]!;
    expect(d.optionId).toBe('decline');
    expect({ ...d.outcome, enforcement: null }).toEqual(o);
    expect(d.outcome.enforcement).toMatchObject({ enforced: [], declined: [0], disqualified: [55] });
    expect(opts[1]!.outcome.enforcement!.disqualified).toEqual([55]);
  });

  it('B8.5.8 rule 6 and B1.6.1: inside two minutes with time in, a false start offers the yardage with or without the runoff', () => {
    const b = bench({ ball: 30, dir, insideTwoMinute: true, clockRunning: true });
    const o = play(b, { end: 30, result: 'no_play', noPlay: true });
    const opts = foulRules.options(o, [foul(b, 'false_start', 'A', { timing: 'before_snap' })], b.ctx);
    expect(opts.map((c) => c.outcome.enforcement!.runoffTaken)).toEqual([false, false, true]);
    expect(at(b, opts[2]!)).toBe(25);
    const calm = bench({ ball: 30, dir });
    expect(foulRules.options(play(calm, { end: 30, noPlay: true }), [foul(calm, 'false_start', 'A', { timing: 'before_snap' })], calm.ctx)).toHaveLength(2);
  });

  it('B8.5.8 rule 2: the yardage of a loss-of-down foul may be declined while the down is kept', () => {
    const b = bench({ ball: 40, dir, down: 3 });
    const fouls = [foul(b, 'intentional_grounding', 'A', { phase: 'pass_play', at: 33 })];
    const o = pick(foulRules.options(play(b, { end: 40, incomplete: true }), fouls, b.ctx), 'no_yardage');
    expect(at(b, o)).toBe(40);
    expect(next(b, o, fouls)).toMatchObject({ down: 4 });
  });

  it('B8.3.3: running into the kicker on fourth and 8 is fourth and 3; on fourth and 4 it is a first down; roughing is 15 and a first down', () => {
    for (const [id, toGo, spot, down] of [['running_into_kicker', 8, 35, 4], ['running_into_kicker', 4, 35, 1], ['roughing_kicker', 8, 45, 1]] as const) {
      const b = bench({ ball: 30, dir, down: 4, toGo });
      const o = play(b, { end: 70, to: 'B', result: 'punt' });
      const fouls = [foul(b, id, 'B', { phase: 'scrimmage_kick', at: 18 })];
      const facts = { ...factsFromOutcome(o, b.ctx), kickEnd: 75, kickCrossedLine: true };
      const opt = pick(optionsWithFacts(o, fouls, facts, b.ctx), 'previous_spot');
      expect(at(b, opt)).toBe(spot);
      expect(next(b, opt, fouls)).toMatchObject({ down, possession: b.A });
    }
  });

  it('B6.6.1 rule 8: a block in the back by the return team is marked from the end of the kick when that is worse', () => {
    const b = bench({ ball: 30, dir, down: 4 });
    const o = play(b, { end: 60, to: 'B', result: 'punt' });
    const fouls = [foul(b, 'illegal_block_in_back', 'B', { phase: 'scrimmage_kick', at: 70 })];
    const truth: PlayTruth = { resolverId: 'reference', resolverVersion: '0', gameId: 1, playNumber: 1, originX: b.x(30), originY: 26, attackDir: dir,
      liveDurationTenths: 90, endZoneImpetus: null, events: [
        { type: 'kick', t: 2, kickKind: 'punt', kickerId: 4, kickSpot: { x: b.x(16), y: 26 }, landingSpot: { x: b.x(75), y: 20 }, hangTimeS: 4.4, crossedLine: true, blockedById: null },
        { type: 'possession', t: 6.4, side: b.B, playerId: 80, spot: { x: b.x(75), y: 20 }, how: 'kick_catch' },
        { type: 'dead_ball', t: 9, marginYd: null, marginS: null, visibility: 'open', reason: 'down_by_contact', spot: { x: b.x(60), y: 22 }, side: b.B, carrierId: 80 },
      ] };
    const opt = pick(optionsFromTruth(truth, o, fouls, b.ctx), 'post_possession');
    expect(at(b, opt)).toBe(85);
    expect(opt.outcome.possessionAfter).toBe(b.B);
    expect(next(b, opt, fouls)).toMatchObject({ possession: b.B, down: 1 });
  });

  it('B6.6.1 rule 6: a kicking-team foul on a punt the receivers keep: replay after enforcement or yardage added to the dead-ball spot', () => {
    const b = bench({ ball: 30, dir, down: 4 });
    const o = play(b, { end: 60, to: 'B', result: 'punt' });
    const opts = foulRules.options(o, [foul(b, 'illegal_formation', 'A', { phase: 'scrimmage_kick', t: 0 })], b.ctx);
    expect(at(b, pick(opts, 'previous_spot'))).toBe(25);
    const add = pick(opts, 'dead_ball_spot');
    expect(at(b, add)).toBe(55);
    expect(add.outcome.possessionAfter).toBe(b.B);
  });

  it('B6.6.1 rule 2: kicking team offside on a kickoff returned to the B45: re-kick from the A30 or the ball at the 50', () => {
    const b = bench({ ball: 35, dir, playKind: 'kickoff' });
    const o = play(b, { end: 55, to: 'B', result: 'kickoff' });
    const opts = foulRules.options(o, [foul(b, 'free_kick_offside', 'A', { phase: 'free_kick', t: 0 })], b.ctx);
    const rekick = pick(opts, 'previous_spot');
    expect(at(b, rekick)).toBe(30);
    expect(rekick.outcome).toMatchObject({ noPlay: true, possessionAfter: b.A });
    const add = pick(opts, 'dead_ball_spot');
    expect(at(b, add)).toBe(50);
    expect(add.outcome.possessionAfter).toBe(b.B);
  });

  it('B7.3.3: defense offside on a good kick try: keep the point with 5 yards on the kickoff, or try again after enforcement', () => {
    const b = bench({ ball: 85, dir, playKind: 'try' });
    const o = play(b, { end: 85, result: 'try_good', score: 'try_kick' });
    const opts = foulRules.options(o, [foul(b, 'offside', 'B', { phase: 'try', t: 0 })], b.ctx);
    const keep = pick(opts, 'carry_kickoff');
    expect(keep.outcome.score).toEqual(o.score);
    const again = pick(opts, 'previous_spot');
    expect(again.outcome.score).toBeNull();
    expect(at(b, again)).toBe(90);
  });

  it('B7.3.3: offensive holding on a good two-point try is replayed from the 12; a loss-of-down foul fails the try', () => {
    const b = bench({ ball: 98, dir, playKind: 'try' });
    const o = play(b, { end: 100, result: 'try_good', score: 'try_two' });
    const again = pick(foulRules.options(o, [foul(b, 'offensive_holding', 'A', { phase: 'try', at: 97 })], b.ctx), 'previous_spot');
    expect(at(b, again)).toBe(88);
    expect(again.outcome.score).toBeNull();
    const fails = pick(foulRules.options(o, [foul(b, 'illegal_forward_pass', 'A', { phase: 'try', at: 99 })], b.ctx), 'try_fails');
    expect(fails.outcome.score).toBeNull();
    expect(fails.outcome.noPlay).toBe(false);
  });

  it('B7.3.3 rule 8: a foul after the try is enforced on the kickoff', () => {
    const b = bench({ ball: 85, dir, playKind: 'try' });
    const o = play(b, { end: 85, result: 'try_good', score: 'try_kick' });
    const c = pick(foulRules.options(o, [foul(b, 'taunting', 'A')], b.ctx), 'carry_kickoff');
    expect(c.outcome.score).toEqual(o.score);
  });

  it('B8.1.2 and B13.5.1: interference 40 yards downfield is 40 yards in the pro set and 15 in the college set', () => {
    for (const [level, spot] of [['pro', 70], ['college', 45]] as const) {
      const b = bench({ ball: 30, dir, level, down: 3 });
      const fouls = [foul(b, 'dpi', 'B', { phase: 'pass_play', at: 70 })];
      const o = pick(foulRules.options(play(b, { end: 30, incomplete: true }), fouls, b.ctx), 'spot_of_foul');
      expect(at(b, o)).toBe(spot);
      expect(next(b, o, fouls)).toMatchObject({ down: 1, firstDownAwarded: true });
    }
  });

  it('B8.1.2 and B13.5.1: interference in the end zone: the 1 or halfway in the pro set; 15 yards, the 2, or halfway in the college set', () => {
    const run = (level: 'pro' | 'college', ball: number) => {
      const b = bench({ ball, dir, level, toGo: Math.min(10, 100 - ball) });
      return at(b, pick(foulRules.options(play(b, { end: ball, incomplete: true }), [foul(b, 'dpi', 'B', { phase: 'pass_play', at: 105 })], b.ctx), 'spot_of_foul'));
    };
    expect(run('pro', 70)).toBe(99);
    expect(run('pro', 98.5)).toBe(99.25);
    expect(run('college', 70)).toBe(85);
    expect(run('college', 90)).toBe(98);
    expect(run('college', 98)).toBe(99);
  });

  it('B8.1.2: interference that is also a personal foul has both enforced', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'dpi', 'B', { phase: 'pass_play', at: 50, sameAct: 1 }), foul(b, 'unnecessary_roughness', 'B', { phase: 'pass_play', at: 50, sameAct: 0 })];
    const opts = foulRules.options(play(b, { end: 30, incomplete: true }), fouls, b.ctx);
    const both = opts.find((o) => o.outcome.enforcement!.enforced.length === 2)!;
    expect(at(b, both)).toBe(65);
  });

  it('B13.5.4: college intentional_grounding from 8 yards behind the line costs 8 yards and the down', () => {
    const b = bench({ ball: 40, dir, level: 'college', down: 2 });
    const fouls = [foul(b, 'intentional_grounding', 'A', { phase: 'pass_play', at: 32 })];
    const o = pick(foulRules.options(play(b, { end: 40, incomplete: true }), fouls, b.ctx), 'spot_of_foul');
    expect(at(b, o)).toBe(32);
    expect(next(b, o, fouls)).toMatchObject({ down: 3, distanceYd: 18 });
  });

  it('B13.5.2: college defensive holding is 10 yards and a first down', () => {
    const b = bench({ ball: 30, dir, level: 'college', down: 3, toGo: 15 });
    const fouls = [foul(b, 'def_holding', 'B', { phase: 'pass_play' })];
    const o = pick(foulRules.options(play(b, { end: 30, incomplete: true }), fouls, b.ctx), 'previous_spot');
    expect(at(b, o)).toBe(40);
    expect(next(b, o, fouls)).toMatchObject({ down: 1 });
  });

  it('B13.8.1: targeting is 15 yards, a first down and a disqualification in the college set', () => {
    const b = bench({ ball: 30, dir, level: 'college' });
    const fouls = [foul(b, 'targeting', 'B', { at: 40, playerId: 9 })];
    const o = pick(foulRules.options(play(b, { end: 42 }), fouls, b.ctx), 'basic_spot');
    expect(at(b, o)).toBe(57);
    expect(o.outcome.enforcement!.disqualified).toEqual([9]);
  });

  it('B8.5.1 step 2: a foul against an official is enforced on its own, in addition to an offset', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'offensive_holding', 'A', { at: 31 }), foul(b, 'def_holding', 'B', { at: 40 }), foul(b, 'foul_against_official', 'B', { timing: 'dead_ball', playerId: 91 })];
    const opts = foulRules.options(play(b, { end: 52 }), fouls, b.ctx);
    expect(opts).toHaveLength(1);
    expect(at(b, opts[0]!)).toBe(45);
    expect(opts[0]!.outcome.enforcement).toMatchObject({ offsetting: true, disqualified: [91] });
  });

  it('B1.7.2 (a): an accepted live-ball defensive foul lets the period be extended; a declined or carried one does not', () => {
    const b = bench({ ball: 30, dir });
    const fouls = [foul(b, 'def_holding', 'B', { phase: 'pass_play' })];
    const opts = foulRules.options(play(b, { end: 30, incomplete: true }), fouls, b.ctx);
    expect(periodExtension(opts[0]!.outcome, fouls, b.ctx)).toBe(false);
    expect(periodExtension(pick(opts, 'previous_spot').outcome, fouls, b.ctx)).toBe(true);
  });
});
