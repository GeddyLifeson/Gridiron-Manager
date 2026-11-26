// A scrimmage play snapped from a kicking formation (F12.7.1, I4.6.1; `PlaySetup.kickLook`): fake punts
// and fake field goals run by the kicking unit itself. FIXTURE units, calls, parameters and rule values,
// so these check the mechanism (who gets the long snap and when, that nobody kicks, that the punter or
// holder becomes a runner or a passer, determinism), not football rates. Rates are WP-26's.
import { describe, expect, it } from 'vitest';
import {
  SLOT_COUNT, SLOTS_PER_TEAM, deadBallOf, eventsOf, playTruthProblems,
  type Assignment, type OffenseCall, type ParamTable, type PlayInput, type PlayResult,
} from '@gm/schema';
import { canonicalBytes } from '../../src/canonical.ts';
import { basePlay, type QbPlay } from '../../src/qb/index.ts';
import { availablePlugs, createTickResolver, qbTargetOf, type KickLook, type PlayContentPort, type PlaySetup } from '../../src/tick-resolver/index.ts';
import { asg as presnapAsg, defenseInput, input as presnapInput, offenseInput } from '../presnap/support.ts';
import { ALL_RULES, ALL_TABLE, CONTENT, playInput, unitsOf } from './support.ts';

type Fake = 'punt_protector_run' | 'punt_punter_run' | 'punt_punter_pass' | 'fg_holder_run' | 'fg_holder_pass';
const FAKES: readonly Fake[] = ['punt_protector_run', 'punt_punter_run', 'punt_punter_pass', 'fg_holder_run', 'fg_holder_pass'];
const fromPunt = (f: Fake): boolean => f.startsWith('punt');
const isPass = (f: Fake): boolean => f.endsWith('pass');

/** Team slots of the fixture kicking units: nine across the front with the long snapper in the middle, then the two deep men. */
const LS = 4, WING_L = 8, WING_R = 0, UP = 9, DEEP = 10;
/** Jerseys that make the fixture kicking formation legal under the fixture's pro bands: ends and backs eligible, the five inside 50 to 79. */
const KICK_JERSEYS = [41, 88, 60, 61, 63, 64, 65, 87, 42, 30, 4];
const ID = (teamSlot: number): number => 100 + teamSlot;

const asg = (...args: Parameters<typeof presnapAsg>): Assignment => ({ ...presnapAsg(...args), gaze: 'key' });
const route = (a: Assignment, pts: readonly [number, number, 'through' | 'cut' | 'settle'][]): Assignment =>
  ({ ...a, behavior: { ...a.behavior, type: 'route', path: pts.map(([px, py, kind]) => ({ px, py, kind, landmark: null })) } });

/** FIXTURE fake: the kicking unit's own alignment, with run blocks or a pass set up front and the wings released on a pass. */
function fakeUnit(f: Fake): Assignment[] {
  const pass = isPass(f), out: Assignment[] = [];
  for (let i = 0; i < 9; i++) {
    const py = (i - 4) * 1.4;
    if (i === LS) out.push(asg('LS', 'snapper', -0.4, 0, true));
    else if (pass && (i === WING_R || i === WING_L)) out.push(route(asg(`P${i}`, 'route', -1.5, py, false), [[6, py, 'cut'], [6, py * 1.6, 'settle']]));
    else out.push(asg(`P${i}`, pass ? 'passSet' : 'runBlock', i >= 1 && i <= 7 ? -0.4 : -1.5, py, i >= 1 && i <= 7));
  }
  if (fromPunt(f)) {
    out.push(asg('PP', f === 'punt_protector_run' ? 'ballCarrier' : pass ? 'passSet' : 'runBlock', -6, 1, false), asg('P', 'kicker', -14, 0, false));
  } else {
    out.push(asg('H', 'holder', -7.5, 0.4, false), asg('K', 'kicker', -9.5, -1.5, false));
  }
  return out;
}
const UNITS = new Map<Fake, Assignment[]>();
const unitOf = (f: Fake): Assignment[] => { let u = UNITS.get(f); if (!u) { u = fakeUnit(f); UNITS.set(f, u); } return u; };
const lookOf = (f: Fake): KickLook => ({ kind: fromPunt(f) ? 'punt' : 'field_goal', snapTo: f === 'punt_protector_run' || !fromPunt(f) ? UP : DEEP });
function qbOf(f: Fake, O: readonly Assignment[]): QbPlay | null {
  if (!isPass(f)) return null;
  const passer = lookOf(f).snapTo;
  const reads = [WING_L, WING_R].map((s) => ({ kind: 'receiver' as const, target: qbTargetOf(s, O[s]!), priorValue: 0.5 }));
  // He throws from about where he takes the long snap: a punter is not walked up to a quarterback's launch point.
  return { ...basePlay(passer, 'gunQuick', reads), launchPx: O[passer]!.preSnap.align.px + 1.5 };
}

const fakeOf = (input: PlayInput): Fake | null => {
  const c = input.calls.snapping;
  const id = c.unit === 'offense' ? c.playContentId : null;
  return id !== null && id.startsWith('fixture.fake.') ? (id.slice('fixture.fake.'.length) as Fake) : null;
};
/** FIXTURE content port: the fixture's own for every other play, and the fake's setup with its kicking look. `over` replaces the look. */
function contentWith(over?: (f: Fake) => KickLook | null | undefined): PlayContentPort {
  return {
    setup(input: PlayInput): PlaySetup | null {
      const f = fakeOf(input);
      if (f === null) return CONTENT.setup(input);
      // "Safe" (I4.4.2, I4.2.3): the regular defense stays on, so the other call is a defensive call.
      const O = unitOf(f), D = unitsOf(input.calls.opposing.unit === 'defense' ? 'run' : fromPunt(f) ? 'punt' : 'field_goal').D, look = lookOf(f);
      const replaced = over ? over(f) : undefined;
      return {
        presnap: presnapInput({
          shotgun: true, snapFoulPhase: isPass(f) ? 'pass_play' : 'running_play',
          offense: offenseInput({ assignments: O, signalCaller: look.snapTo }), defense: defenseInput({ assignments: D, manMatch: {} }),
        }),
        slots: Array.from({ length: SLOT_COUNT }, () => ({ conceptId: `fixture.fake.${f}` })),
        context: isPass(f) ? { qbSlot: look.snapTo } : {}, qb: qbOf(f, O),
        perception: Array.from({ length: SLOT_COUNT }, (_, s) => (s >= SLOTS_PER_TEAM ? { readsKeys: true, boxDefender: s < SLOTS_PER_TEAM + 6 } : {})),
        kickLook: replaced === undefined ? look : replaced,
      };
    },
  };
}

interface Spec { seed?: number; params?: ParamTable; grade?: (slot: number) => Record<string, number>; detail?: 'full' | 'summary'; safe?: boolean }
/** The kicking unit's eleven on an offensive call, against the kick-defending unit's return call, as the special-teams menu builds a fake. */
function fakeInput(f: Fake, spec: Spec = {}): PlayInput {
  const seed = spec.seed ?? 1;
  const base = playInput({
    kind: fromPunt(f) ? 'punt' : 'field_goal', seed, playNumber: seed, params: spec.params ?? ALL_TABLE, attackDir: seed % 2 === 0 ? 1 : -1, ballX: 40 + (seed % 3) * 10,
    ...(spec.grade ? { grade: spec.grade } : {}), ...(spec.detail ? { detail: spec.detail } : {}),
  });
  base.teams[0].players.forEach((p, i) => { p.jersey = KICK_JERSEYS[i]!; });
  const O = unitOf(f);
  const snapping: OffenseCall = {
    unit: 'offense', playContentId: `fixture.fake.${f}`, contentHash: null, kind: isPass(f) ? 'quick_pass' : 'run', personnelCode: '11', formationId: null, strength: null,
    motionId: null, protectionId: null, tags: ['fake', fromPunt(f) ? 'from_punt' : 'from_field_goal'], runDirection: null, shotgun: false, tempo: 'huddle',
    players: O.map((a, i) => ({ playerId: ID(i), role: a.role })),
  };
  const opposing = spec.safe ? playInput({ kind: 'run' }).calls.opposing : base.calls.opposing;
  return { ...base, rules: ALL_RULES, calls: { snapping, opposing } };
}
const hex = (r: PlayResult): string => Buffer.from(canonicalBytes({ truth: r.truth, deltas: r.deltas, live: r.liveDurationTenths })).toString('hex');
const snapped = (r: PlayResult): boolean => eventsOf(r.truth, 'snap').length === 1;
const tableWith = (over: Record<string, number>): ParamTable => ({ version: 'test', has: (n) => ALL_TABLE.has(n), num: (n) => (over[n] ?? ALL_TABLE.num(n)) });

const resolver = createTickResolver({ content: contentWith(), plugs: availablePlugs() });
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

describe('a play from a kicking look: the long snap', () => {
  it('snaps to the man the look names, from the legal kicking formation, and nobody kicks', () => {
    for (const f of FAKES) for (const seed of SEEDS) {
      const r = resolver.simulatePlay(fakeInput(f, { seed })), where = `${f} seed ${seed}`;
      expect(playTruthProblems(r.truth), where).toEqual([]);
      expect(deadBallOf(r.truth).reason, where).not.toBe('engine_fault');
      expect(eventsOf(r.truth, 'kick'), where).toHaveLength(0);
      // J10.4.3 edge case: on a fake the kicker is a runner and the kicker's protections end.
      expect(eventsOf(r.truth, 'foul_committed').filter((x) => x.foulId === 'roughing_kicker' || x.foulId === 'running_into_kicker' || x.foulId === 'roughing_holder'), where).toHaveLength(0);
      if (!snapped(r)) continue;
      const snap = eventsOf(r.truth, 'snap')[0]!;
      expect(snap.snapperId, where).toBe(ID(LS));
      expect(snap.toPlayerId, where).toBe(ID(lookOf(f).snapTo));
      expect(eventsOf(r.truth, 'foul_committed').filter((x) => x.foulId === 'illegal_formation'), where).toHaveLength(0);
      // The look is on the truth record, once, so film, statistics and scouting can find the fake.
      const code = `kickOp.look.${lookOf(f).kind}`;
      expect(eventsOf(r.truth, 'detail').filter((d) => d.code === code), where).toHaveLength(1);
    }
  }, 240_000);

  it('takes a long snap\'s time to reach him: about 0.7 s to a punter 14 yd deep, about 0.3 s to the protector, about 0.4 s to the holder', () => {
    const band: Record<Fake, [number, number]> = {
      punt_punter_run: [0.65, 0.76], punt_punter_pass: [0.65, 0.76], punt_protector_run: [0.25, 0.35], fg_holder_run: [0.32, 0.42], fg_holder_pass: [0.32, 0.42],
    };
    for (const f of FAKES) {
      let clean = 0;
      for (const seed of SEEDS) {
        const r = resolver.simulatePlay(fakeInput(f, { seed }));
        if (!snapped(r) || eventsOf(r.truth, 'snap')[0]!.quality !== 'clean') continue;
        clean++;
        const got = eventsOf(r.truth, 'possession')[0]!;
        expect(got.how, `${f} seed ${seed}`).toBe('snap');
        expect(got.playerId, `${f} seed ${seed}`).toBe(ID(lookOf(f).snapTo));
        expect(got.t, `${f} seed ${seed}`).toBeGreaterThanOrEqual(band[f][0]);
        expect(got.t, `${f} seed ${seed}`).toBeLessThanOrEqual(band[f][1]);
        // Nothing he does with the ball is dated before he has it.
        for (const e of r.truth.events) {
          if (e.type === 'pass_release' || e.type === 'tackle_attempt') expect(e.t, `${f} seed ${seed} ${e.type}`).toBeGreaterThanOrEqual(got.t);
          if (e.type === 'detail' && (e.code === 'tick.carrier.no_procedure' || e.code.startsWith('qb.'))) expect(e.t, `${f} seed ${seed} ${e.code}`).toBeGreaterThanOrEqual(got.t);
        }
      }
      expect(clean, f).toBeGreaterThan(SEEDS.length / 2);
    }
  }, 240_000);

  it('uses the real long snapper: a better one gets the ball there sooner', () => {
    const arrival = (grade: number): number => {
      const r = resolver.simulatePlay(fakeInput('punt_punter_run', { seed: 2, grade: (slot): Record<string, number> => (slot === LS ? { long_snap: grade } : {}) }));
      expect(eventsOf(r.truth, 'snap')[0]!.quality).toBe('clean');
      return eventsOf(r.truth, 'possession')[0]!.t;
    };
    expect(arrival(80)).toBeLessThan(arrival(20));
  });

  it('an off-target long snap arrives late; a loose one is a live ball behind the formation and nobody is handed it', () => {
    let late = 0;
    const off = createTickResolver({ content: contentWith(), plugs: availablePlugs() });
    for (const seed of SEEDS) {
      const r = off.simulatePlay(fakeInput('punt_punter_run', { seed, params: tableWith({ 'presnap.snap.offTargetShotgun': 0.97, 'presnap.snap.looseShotgun': 0.0001 }) }));
      if (!snapped(r) || eventsOf(r.truth, 'snap')[0]!.quality !== 'off_target') continue;
      late++;
      expect(eventsOf(r.truth, 'possession')[0]!.t, `seed ${seed}`).toBeGreaterThanOrEqual(0.85);
    }
    expect(late).toBeGreaterThan(SEEDS.length / 2);
    let loose = 0;
    for (const seed of SEEDS) {
      const r = off.simulatePlay(fakeInput('punt_punter_run', { seed, params: tableWith({ 'presnap.snap.looseShotgun': 0.97 }) }));
      if (!snapped(r) || eventsOf(r.truth, 'snap')[0]!.quality !== 'loose') continue;
      loose++;
      const where = `seed ${seed}`;
      expect(playTruthProblems(r.truth), where).toEqual([]);
      const fumble = eventsOf(r.truth, 'fumble')[0]!;
      expect(fumble.kind, where).toBe('bad_snap');
      expect(fumble.t, where).toBeGreaterThan(0.6);
      expect(eventsOf(r.truth, 'possession').filter((p) => p.how === 'snap'), where).toHaveLength(0);
    }
    expect(loose).toBeGreaterThan(SEEDS.length / 2);
  }, 240_000);
});

describe('a play from a kicking look: the men with the ball', () => {
  it('a punter or holder with no procedure is a runner from the moment he has the ball', () => {
    for (const f of ['punt_punter_run', 'fg_holder_run'] as const) {
      let handed = 0, live = 0;
      for (const seed of SEEDS) {
        const r = resolver.simulatePlay(fakeInput(f, { seed }));
        if (!snapped(r) || eventsOf(r.truth, 'snap')[0]!.quality === 'loose') continue;
        live++;
        if (eventsOf(r.truth, 'detail').some((d) => d.code === 'tick.carrier.no_procedure' && d.playerIds.includes(ID(lookOf(f).snapTo)))) handed++;
      }
      expect(handed, f).toBe(live);
      expect(live, f).toBeGreaterThan(SEEDS.length / 2);
    }
  }, 120_000);

  it('the protector takes a direct snap and runs: the play ends on the ground, out of bounds or across the goal line', () => {
    const reasons = new Set<string>();
    let advanced = 0;
    for (const seed of SEEDS) {
      const input = fakeInput('punt_protector_run', { seed }), r = resolver.simulatePlay(input);
      if (!snapped(r)) continue;
      const dead = deadBallOf(r.truth);
      reasons.add(dead.reason);
      if ((dead.spot.x - input.situation.ballX) * input.situation.attackDir > -6) advanced++;
    }
    for (const reason of reasons) expect(['down_by_contact', 'forward_progress_stopped', 'runner_out_of_bounds', 'ball_across_goal_line_in_possession', 'loose_ball_at_rest', 'ball_out_of_bounds', 'gave_himself_up']).toContain(reason);
    // He was 6 yd deep when he took it: he ran forward with it.
    expect(advanced).toBeGreaterThan(SEEDS.length / 2);
  }, 120_000);

  it('a punter or holder with a procedure throws like the passer he is, from where he took the snap', () => {
    for (const f of ['punt_punter_pass', 'fg_holder_pass'] as const) {
      let throws = 0;
      const passer = lookOf(f).snapTo, depth = unitOf(f)[passer]!.preSnap.align.px;
      for (const seed of SEEDS) {
        const input = fakeInput(f, { seed }), r = resolver.simulatePlay(input);
        for (const p of eventsOf(r.truth, 'pass_release')) {
          throws++;
          expect(p.passerId, `${f} seed ${seed}`).toBe(ID(passer));
          const px = (p.releaseSpot.x - input.situation.ballX) * input.situation.attackDir;
          if (!p.throwaway) expect(Math.abs(px - depth), `${f} seed ${seed}: released ${px} yd from the line`).toBeLessThan(6);
        }
      }
      expect(throws, f).toBeGreaterThan(SEEDS.length / 3);
    }
  }, 240_000);

  it('uses the real passer: a punter with an arm completes more than one without', () => {
    const completions = (grade: number): number => {
      let n = 0;
      for (const seed of SEEDS) {
        const r = resolver.simulatePlay(fakeInput('punt_punter_pass', { seed, grade: (slot): Record<string, number> => (slot === DEEP ? { accuracy_short: grade, accuracy_intermediate: grade, accuracy_under_pressure: grade, arm_strength: grade, release_time: grade } : {}) }));
        n += eventsOf(r.truth, 'possession').filter((p) => p.how === 'catch' && p.side === 0).length;
      }
      return n;
    };
    expect(completions(85)).toBeGreaterThanOrEqual(completions(15));
  }, 240_000);
});

describe('a play from a kicking look: resolved on its merits', () => {
  it('the same fake pass is caught more often against a kick rush than against the regular defense left on the field (F12.7.1 acceptance, as a direction on fixtures)', () => {
    const caught = (f: Fake, safe: boolean): number => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const r = resolver.simulatePlay(fakeInput(f, { seed, safe }));
        if (eventsOf(r.truth, 'possession').some((p) => p.how === 'catch' && p.side === 0)) n++;
      }
      return n;
    };
    for (const f of ['punt_punter_pass', 'fg_holder_pass'] as const) expect(caught(f, false), f).toBeGreaterThan(caught(f, true));
  }, 240_000);
});

describe('a play from a kicking look: determinism and honesty', () => {
  it('gives identical bytes for the same input, on one resolver or two, in any order of plays', () => {
    const fresh = createTickResolver({ content: contentWith(), plugs: availablePlugs() });
    for (const f of FAKES) for (const seed of [3, 4, 5]) {
      const a = hex(resolver.simulatePlay(fakeInput(f, { seed })));
      resolver.simulatePlay(playInput({ kind: 'punt', seed: 9, params: ALL_TABLE }));
      expect(hex(fresh.simulatePlay(fakeInput(f, { seed }))), `${f} ${seed}`).toBe(a);
      expect(hex(resolver.simulatePlay(fakeInput(f, { seed, detail: 'full' }))), `${f} ${seed} full`).toBe(a);
    }
  }, 240_000);

  it('leaves the real kick and the ordinary snap as they were: a play with no look has the ball in hand at tick 0', () => {
    for (const kind of ['pass', 'run', 'punt', 'field_goal'] as const) {
      const r = resolver.simulatePlay({ ...playInput({ kind, seed: 6, params: ALL_TABLE }), rules: ALL_RULES });
      if (!snapped(r) || eventsOf(r.truth, 'snap')[0]!.quality === 'loose') continue;
      expect(eventsOf(r.truth, 'possession')[0]!.t, kind).toBe(0);
      expect(eventsOf(r.truth, 'detail').some((d) => d.code.startsWith('kickOp.look.')), kind).toBe(false);
    }
  });

  it('refuses a look it cannot run instead of inventing a play', () => {
    const bad = (look: KickLook) => createTickResolver({ content: contentWith(() => look), plugs: availablePlugs() });
    expect(() => bad({ kind: 'punt', snapTo: LS }).simulatePlay(fakeInput('punt_punter_run'))).toThrow(/snaps the ball to the snapper/);
    expect(() => bad({ kind: 'punt', snapTo: 11 }).simulatePlay(fakeInput('punt_punter_run'))).toThrow(/not one of the eleven/);
    // A kick call is the kick: a look on it is a content error.
    const onKick: PlayContentPort = { setup: (input) => ({ ...CONTENT.setup(input)!, kickLook: { kind: 'punt', snapTo: DEEP } }) };
    expect(() => createTickResolver({ content: onKick, plugs: availablePlugs() }).simulatePlay({ ...playInput({ kind: 'punt', params: ALL_TABLE }), rules: ALL_RULES })).toThrow(/kicking look on a kick call/);
  });

  it('runs from the kick look on a try too, and records which look it was (I4.6.1: a fake on a try is a two-point play)', () => {
    const onTry = createTickResolver({ content: contentWith(() => ({ kind: 'try_kick', snapTo: UP })), plugs: availablePlugs() });
    const base = fakeInput('fg_holder_run', { seed: 3 });
    const r = onTry.simulatePlay({ ...base, situation: { ...base.situation, playKind: 'try' } });
    expect(playTruthProblems(r.truth)).toEqual([]);
    expect(eventsOf(r.truth, 'detail').filter((d) => d.code === 'kickOp.look.try_kick')).toHaveLength(1);
    expect(eventsOf(r.truth, 'kick')).toHaveLength(0);
  });

  it('without the look the same call is an ordinary snap to the punter at tick 0 (what the engine did before)', () => {
    const plain = createTickResolver({ content: contentWith(() => null), plugs: availablePlugs() });
    const r = plain.simulatePlay(fakeInput('punt_punter_run', { seed: 2 }));
    expect(eventsOf(r.truth, 'possession')[0]!.t).toBe(0);
  });
});
