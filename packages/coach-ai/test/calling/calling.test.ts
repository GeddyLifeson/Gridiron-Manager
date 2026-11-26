// Tests for bible K4 (G-58). Each describe names the leaf it covers.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber, DMATH } from '@gm/engine-core';
import { ParamFile, scanForbiddenJson } from '@gm/schema';
import { generateCoachProfile, type CoachProfile } from '../../src/profile/index.ts';
import {
  beliefShares, callSpecialTeams, callTime, candidatesFor, chooseTempo, considerConductAct, createCaller, drawIndex, floorPossible,
  leanDimension, lockSheet, mislabelChance, noHuddleChance, param, PARAMS, passLean, PASS_LEAN_SOURCE, priorStrength, readinessCheck,
  selfScoutKappa, selfScoutPenalty, solveMix, solveZeroSum, specialTeamsMix, startBelief, tacticalFoulCandidates, tilt, updateBelief, wantedPassShare, worstCase,
  type CallerSetup, type CallingSheet, type CallRequest, type CallSituation, type DrawKind, type DrawSource, type SheetCall,
} from '../../src/calling/index.ts';

const SEED = seedFromNumber(20261126);
const math = DMATH;
/** The `coachAI` stream keyed by game, play, team and decision type (J13.2.1). */
const drawsAt = (game: number, play: number, team = 0): DrawSource => (kind: DrawKind) => stream(SEED, 'coachAI', [game, play, team, kind]);
const rng = (tag: string) => stream(SEED, 'worldgen', ['g58-test', tag]);

const LOOKS = ['pressure', 'oneHigh', 'twoHigh'];
const call = (callId: string, lookClass: string, tags: SheetCall['tags'], personnel: SheetCall['personnel'] = 'p11', tempoMenu = false): SheetCall =>
  ({ callId, lookClass, tags, personnel, planWeight: 1, tempoMenu });
const CALLS: Record<string, SheetCall> = {
  inside: call('inside', 'run.middle', {}, 'p12', true),
  outside: call('outside', 'run.right', {}, 'p11'),
  quick: call('quick', 'quick_pass.middle', { pass: true }, 'p11', true),
  boot: call('boot', 'play_action.right', { pass: true, playAction: true }, 'p12'),
  deep: call('deep', 'dropback.left', { pass: true, deepShot: true }, 'p11'),
  screen: call('screen', 'screen.left', { pass: true, screen: true }, 'p11', true),
};
//                    pressure oneHigh twoHigh  (the coach's estimates, expected points)
const PAY: Record<string, number[]> = {
  inside: [0.05, -0.10, 0.20], outside: [0.10, -0.05, 0.12], quick: [0.25, 0.05, -0.02],
  boot: [-0.20, 0.30, 0.05], deep: [-0.35, 0.40, -0.25], screen: [0.45, -0.15, -0.05],
};
const pay = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, PAY[id]!]));
const ALL = Object.keys(CALLS);

function sheet(extra: Partial<CallingSheet> = {}): CallingSheet {
  return lockSheet({
    side: 'offense', looks: LOOKS, calls: CALLS,
    boxes: [
      { bucketId: 'two_minute', parentId: 'first10', rule: { twoMinute: true }, callIds: ['quick', 'deep', 'screen'], payoff: pay(['quick', 'deep', 'screen']), clock: true, scriptable: false },
      { bucketId: 'third_xlong', parentId: 'third_long', rule: { downs: [3], minDistanceYd: 12 }, callIds: [], payoff: {}, clock: false, scriptable: false },
      { bucketId: 'third_long', parentId: 'first10', rule: { downs: [3], minDistanceYd: 7 }, callIds: ['quick', 'deep', 'screen', 'boot'], payoff: pay(['quick', 'deep', 'screen', 'boot']), clock: false, scriptable: false },
      { bucketId: 'second_med', parentId: 'first10', rule: { downs: [2], minDistanceYd: 4, maxDistanceYd: 7 }, callIds: ALL, payoff: pay(ALL), clock: false, scriptable: true },
      { bucketId: 'first10', parentId: null, rule: {}, callIds: ALL, payoff: pay(ALL), clock: false, scriptable: true },
    ],
    baseBoxByDown: { '0': 'first10' }, script: [], sequences: [], follows: [], contingencies: [], ...extra,
  });
}

function profile(over: Partial<CoachProfile['behavior']> = {}, tag = 'a'): CoachProfile {
  const p = generateCoachProfile({ personId: `coach-${tag}`, level: 'pro', role: 'offensiveCoordinator', age: 45, playedSide: 'offense', seasonsCalling: 6, seasonsAsHeadCoach: 0 }, rng(`coach-${tag}`));
  return { ...p, behavior: { callFit: 0, preparation: 0, adjustment: 0, selfScout: 0, clockManagement: 0, teaching: 0, evaluation: 0, ...over } };
}
const NEUTRAL = { leadProtection: 0, deficitUrgency: 0, lateDefenseRisk: 0 };
const setup = (p: CoachProfile, s: CallingSheet, over: Partial<CallerSetup> = {}): CallerSetup =>
  ({ profile: p, headCoach: NEUTRAL, zBoothEvaluation: 3, sheet: s, scout: [], opponentCallerId: null, ownWindow: {}, math, ...over });
const sit = (over: Partial<CallSituation> = {}): CallSituation =>
  ({ down: 1, distanceYd: 10, yardsToGoal: 60, period: 1, regulationPeriods: 4, overtime: false, insideTwoMinute: false, margin: 0, ...over });
const req = (game: number, play: number, s: CallSituation, over: Partial<CallRequest> = {}): CallRequest =>
  ({ situation: s, available: () => true, readiness: () => 1, draws: drawsAt(game, play), ...over });

describe('K4.3.1 the matrix game and stored mixes', () => {
  it('worst-case payoff of the mix equals the game value for 1,000 random matrices', () => {
    const r = rng('matrices');
    for (let k = 0; k < 1000; k++) {
      const m = 2 + Math.floor(r.uniform() * 11), n = 2 + Math.floor(r.uniform() * 7);
      const a = Array.from({ length: m }, () => Array.from({ length: n }, () => r.uniform() * 2 - 1));
      const row = solveZeroSum(a);
      expect(Math.abs(row.mix.reduce((x, y) => x + y, 0) - 1)).toBeLessThan(1e-9);
      expect(Math.abs(worstCase(a, row.mix) - row.value)).toBeLessThan(0.001);
      // Duality: the column player's own best guarantee meets it, so the value is the game value.
      const col = solveZeroSum(Array.from({ length: n }, (_, j) => a.map((rw) => -rw[j]!)));
      expect(Math.abs(col.value + row.value)).toBeLessThan(0.001);
    }
  });
  it('a dominant estimate never produces a pure strategy', () => {
    const s = lockSheet({ ...sheet(), boxes: [{ bucketId: 'b', parentId: null, rule: {}, callIds: ['inside', 'quick', 'deep'], payoff: { inside: [1, 1, 1], quick: [0, 0, 0], deep: [0, 0, 0] }, clock: false, scriptable: true }] });
    expect(s.boxes[0]!.storedMix).toEqual({ inside: 0.9, quick: 0.05, deep: 0.05 });
  });
  it('solveMix is the plan-lock entry: one probability per candidate, the floor only for planned calls', () => {
    expect(solveMix([[1, 1], [0, 0], [0, 0]], [true, true, false])).toEqual([0.95, 0.05, 0]);
    const m = solveMix([[1, -1], [-1, 1]]);
    expect(m[0]).toBeCloseTo(0.5, 9);
    expect(m[1]).toBeCloseTo(0.5, 9);
  });
  it('rejects a sheet over the size limits', () => {
    expect(() => lockSheet({ ...sheet(), looks: Array.from({ length: 9 }, (_, i) => `l${i}`) })).toThrow(/limit/);
  });
});

describe('K4.1.1 situation bucket and candidate list', () => {
  const s = sheet();
  it('10,000 random legal states return a bucket and at least 2 candidates, none unavailable', () => {
    const r = rng('states');
    for (let k = 0; k < 10000; k++) {
      const hurt = new Set(ALL.filter(() => r.uniform() < 0.3));
      if (hurt.size > ALL.length - 2) hurt.clear();
      const state = sit({ down: 1 + Math.floor(r.uniform() * 4), distanceYd: 1 + Math.floor(r.uniform() * 25), yardsToGoal: 1 + Math.floor(r.uniform() * 99), insideTwoMinute: r.uniform() < 0.1 });
      const list = candidatesFor({ sheet: s, situation: state, available: (c) => !hurt.has(c.callId) });
      expect(list.bucketId).toBeTruthy();
      expect(list.calls.length).toBeGreaterThanOrEqual(2);
      expect(list.calls.every((c) => !hurt.has(c.callId))).toBe(true);
    }
  });
  it('first match in sheet order, and an empty box falls back to its parent', () => {
    const list = candidatesFor({ sheet: s, situation: sit({ down: 3, distanceYd: 15 }), available: () => true });
    expect(list.bucketId).toBe('third_xlong');
    expect(list.box.bucketId).toBe('third_long');
    expect(candidatesFor({ sheet: s, situation: sit({ down: 2, distanceYd: 5 }), available: () => true }).bucketId).toBe('second_med');
  });
  it('adds base calls when fewer than 2 remain, and the K5 constraint filters first', () => {
    const list = candidatesFor({ sheet: s, situation: sit({ down: 3, distanceYd: 8 }), available: (c) => c.callId !== 'deep' && c.callId !== 'screen' && c.callId !== 'boot' });
    expect(list.calls.length).toBeGreaterThanOrEqual(2);
    expect(list.changed).toBe(true);
    const runs = candidatesFor({ sheet: s, situation: sit(), constraint: { keepClockRunning: true, allows: (c) => !c.tags.pass }, available: () => true });
    expect(runs.calls.map((c) => c.callId).sort()).toEqual(['inside', 'outside']);
  });
});

describe('K4.2.1 starting belief', () => {
  it('prior strength runs from 3 to 12 plays', () => {
    expect(priorStrength(3)).toBe(3);
    expect(priorStrength(0)).toBe(7.5);
    expect(priorStrength(-3)).toBe(12);
  });
  it('an 80% charted share over 40 plays starts between 70% and 80%, and nothing is certain', () => {
    const rows = [{ bucketId: 'first10', look: 'oneHigh', count: 32 }, { bucketId: 'first10', look: 'twoHigh', count: 8 }, { bucketId: 'third_long', look: 'pressure', count: 20 }, { bucketId: 'third_long', look: 'twoHigh', count: 20 }];
    const b = startBelief(LOOKS, ['first10', 'third_long'], rows, [], 0);
    const sh = beliefShares(b, 'first10');
    expect(sh[1]).toBeGreaterThanOrEqual(0.7);
    expect(sh[1]).toBeLessThanOrEqual(0.8);
    expect(Math.min(...sh)).toBeGreaterThan(0);
    // A look never charted anywhere still has a share (rule 4).
    const never = startBelief(LOOKS, ['first10'], [{ bucketId: 'first10', look: 'oneHigh', count: 50 }], [], 0);
    expect(beliefShares(never, 'first10')[0]).toBeGreaterThan(0.02);
  });
  it('opponent notes add counts at their weights', () => {
    const base = beliefShares(startBelief(LOOKS, ['first10'], [], [], 0), 'first10')[0]!;
    const noted = beliefShares(startBelief(LOOKS, ['first10'], [], [{ bucket: 'first10', observed: 'pressure', count: 6, worked: 3, lastSeason: 1, lastWeek: 1, weight: 4 }], 0), 'first10')[0]!;
    expect(noted).toBeGreaterThan(base);
  });
});

describe('K4.2.2 updating belief during the game', () => {
  const repeatsToHalfway = (zAdj: number): number => {
    const b = startBelief(LOOKS, ['first10'], [{ bucketId: 'first10', look: 'oneHigh', count: 30 }, { bucketId: 'first10', look: 'twoHigh', count: 30 }], [], zAdj);
    const prior = beliefShares(b, 'first10')[0]!;
    for (let k = 1; k <= 40; k++) {
      updateBelief(b, { bucketId: 'first10', look: 'pressure', neighbours: [], hurt: false, scriptedProbe: false, mislabel: 0 }, rng(`rep${zAdj}-${k}`));
      if (beliefShares(b, 'first10')[0]! >= (prior + 1) / 2 - 1e-9) return k;
    }
    return 99;
  };
  it('the quickest adjuster is half-way by the 3rd repeat, the slowest by the 12th', () => {
    expect(repeatsToHalfway(3)).toBe(3);
    expect(repeatsToHalfway(-3)).toBe(12);
  });
  it('a mislabel adds to the wrong class, neighbours get half, and being hurt counts 1.5', () => {
    const b = startBelief(LOOKS, ['first10', 'second_med'], [], [], 0);
    const before = [...b.counts.get('first10')!], nb = [...b.counts.get('second_med')!];
    const logged = updateBelief(b, { bucketId: 'first10', look: 'pressure', neighbours: ['second_med'], hurt: true, scriptedProbe: false, mislabel: 1 }, rng('mis'));
    expect(logged).not.toBe('pressure');
    const j = LOOKS.indexOf(logged);
    expect(b.counts.get('first10')![j]! - before[j]!).toBeCloseTo(1.5, 9);
    expect(b.counts.get('second_med')![j]! - nb[j]!).toBeCloseTo(0.75, 9);
    expect(b.counts.get('first10')![0]).toBe(before[0]);
  });
  it('booth error runs from 5% to 20% by the booth coach', () => {
    expect(mislabelChance(3)).toBeCloseTo(0.05, 9);
    expect(mislabelChance(-3)).toBeCloseTo(0.2, 9);
  });
});

describe('K4.3.2 tilt toward the read, and call fit', () => {
  const ids = ALL, rows = ids.map((id) => PAY[id]!);
  const sigma = solveZeroSum(rows).mix;
  const share = (zCallFit: number, plays: number): number => {
    const b = [0.02 + 0, 0.02, 0.02].map((x, j) => (j === 0 ? 7.5 / 3 + plays : 7.5 / 3) + x);
    const t = b.reduce((a, x) => a + x, 0);
    return tilt({ sigma, payoff: rows, belief: b.map((x) => x / t), zCallFit, evidence: plays, n0: 7.5, lastEpa: ids.map(() => 0) }, math).mix[ids.indexOf('screen')]!;
  };
  it('the best counter rises with plays observed and with call fit', () => {
    expect(share(0, 4)).toBeGreaterThan(share(0, 0));
    expect(share(0, 12)).toBeGreaterThan(share(0, 4));
    expect(share(2, 12)).toBeGreaterThan(share(0, 12));
    expect(share(0, 12)).toBeGreaterThan(share(-2, 12));
  });
  it('with no evidence the mix is the stored mix', () => {
    expect(tilt({ sigma, payoff: rows, belief: [1 / 3, 1 / 3, 1 / 3], zCallFit: 1, evidence: 0, n0: 7.5, lastEpa: ids.map(() => 0) }, math).mix).toEqual(sigma);
  });
  it('a weak caller goes back to what just worked', () => {
    const lastEpa = ids.map((id) => (id === 'inside' ? 2 : 0));
    const at = ids.indexOf('inside');
    const weak = (epa: number[]) => tilt({ sigma, payoff: rows, belief: [1 / 3, 1 / 3, 1 / 3], zCallFit: -2, evidence: 6, n0: 7.5, lastEpa: epa }, math).mix[at]!;
    expect(weak(lastEpa)).toBeGreaterThan(weak(ids.map(() => 0)));
    const strong = (epa: number[]) => tilt({ sigma, payoff: rows, belief: [1 / 3, 1 / 3, 1 / 3], zCallFit: 2, evidence: 6, n0: 7.5, lastEpa: epa }, math).mix[at]!;
    expect(strong(lastEpa)).toBe(strong(ids.map(() => 0)));
  });
});

describe('K4.3.7 system habits and game-state lean', () => {
  it('reads the measured table: the lean is a fourth-quarter effect', () => {
    expect(PASS_LEAN_SOURCE.status).toBe('1 of 3');
    expect(passLean(-12, 4, 4, false)).toBeCloseTo(0.811 - 0.592, 9);
    expect(passLean(12, 4, 4, false)).toBeCloseTo(0.386 - 0.592, 9);
    expect(passLean(0, 4, 4, false)).toBe(0);
    expect(Math.abs(passLean(-12, 1, 4, false))).toBeLessThan(0.05);
  });
  it('wanted pass share rises with the deficit late, more for an urgent head coach', () => {
    const late = (margin: number, urgency = 0) => wantedPassShare(0.57, sit({ period: 4, margin }), { deficitUrgency: urgency, leadProtection: 0 });
    expect(late(-12)).toBeGreaterThan(late(-5));
    expect(late(-5)).toBeGreaterThan(late(0));
    expect(late(0)).toBeGreaterThan(late(12));
    expect(late(-12, 2)).toBeGreaterThan(late(-12, 0));
  });
  it('a habit pulls part of the way, skips a missing tag and never revives a removed call', () => {
    const mix = [0.5, 0.5, 0];
    const out = leanDimension(mix, [true, false, true], [true, true, true], 0.8, math);
    expect(out[0]).toBeGreaterThan(0.5);
    expect(out[0]).toBeLessThan(0.8);
    expect(out[2]).toBe(0);
    expect(leanDimension(mix, [false, false, false], [true, true, true], 0.8, math)).toEqual(mix);
    expect(leanDimension(mix, [true, false, false], [true, true, true], 1, math).every(Number.isFinite)).toBe(true);
  });
  it('two callers identical except play action 0.15 and 0.30 differ that way over 2,000 plays', () => {
    const s = sheet();
    const share = (pa: number): number => {
      const p = profile();
      const c = createCaller(setup({ ...p, system: { ...p.system, offenseRates: { ...p.system.offenseRates, playAction: pa } } }, s));
      let n = 0, passes = 0;
      for (let k = 1; k <= 2000; k++) {
        const r = c.call(req(7, k, sit()))!;
        if (r.call.tags.pass) passes++;
        if (r.call.tags.playAction) n++;
      }
      return n / passes;
    };
    expect(share(0.3)).toBeGreaterThan(share(0.15) + 0.02);
  });
  it('pass rate rises with the deficit band in the fourth quarter', () => {
    const s = sheet();
    const rate = (margin: number): number => {
      const c = createCaller(setup(profile(), s));
      let passes = 0;
      for (let k = 1; k <= 1500; k++) if (c.call(req(8, k, sit({ period: 4, margin })))!.call.tags.pass) passes++;
      return passes / 1500;
    };
    const behind = rate(-12), level = rate(0), ahead = rate(12);
    expect(behind).toBeGreaterThan(level);
    expect(level).toBeGreaterThan(ahead);
  });
});

describe('K4.3.3 self-scout penalty', () => {
  const calls = [CALLS.inside!, CALLS.quick!];
  it('is zero at z = -2 and grows with selfScout', () => {
    expect(selfScoutKappa(-2)).toBe(0);
    expect(selfScoutKappa(-3)).toBe(0);
    expect(selfScoutKappa(0)).toBe(4);
    expect(selfScoutKappa(4)).toBe(10);
    const own = { 'run.middle': 18, 'quick_pass.middle': 2 };
    const careless = selfScoutPenalty([0.5, 0.5], calls, own, -2, math);
    const careful = selfScoutPenalty([0.5, 0.5], calls, own, 2, math);
    expect(careless).toEqual([0.5, 0.5]);
    expect(careful[0]).toBeLessThan(0.5);
    expect(careful[0]).toBeGreaterThan(0); // it bends the mix, it does not forbid the call
  });
  it('over a season, strong own tendencies fall as selfScout rises', () => {
    const s = sheet();
    const topShare = (zSelf: number): number => {
      const c = createCaller(setup(profile({ selfScout: zSelf }), s, { ownWindow: { first10: { 'run.middle': 30, 'quick_pass.middle': 6 } } }));
      let n = 0;
      for (let k = 1; k <= 1000; k++) if (c.call(req(9, k, sit()))!.call.lookClass === 'run.middle') n++;
      return n / 1000;
    };
    expect(topShare(3)).toBeLessThan(topShare(-3));
  });
});

describe('K4.3.4 sequencing', () => {
  it('after the trigger, the constraint is called at least 1.3 times as often for the next 3 matching snaps', () => {
    const s = sheet({ sequences: [{ baseId: 'inside', complementId: null, constraintId: 'boot', trigger: 'pressure' }] });
    const count = (trigger: boolean): number => {
      let boots = 0;
      for (let g = 1; g <= 400; g++) {
        const c = createCaller(setup(profile(), s));
        const obs = { bucketId: 'first10', down: 1, look: trigger ? 'pressure' : 'twoHigh', ownCallId: 'inside', epa: 0, gainYd: 2, hurt: false };
        c.observe(obs, drawsAt(g, 1));
        c.observe(obs, drawsAt(g, 2));
        for (let k = 3; k <= 5; k++) if (c.call(req(g, k, sit()))!.call.callId === 'boot') boots++;
      }
      return boots;
    };
    expect(count(true)).toBeGreaterThanOrEqual(1.3 * count(false));
  });
  it('a queued second call is used at once and takes less time', () => {
    const s = sheet({ follows: [{ afterCallId: 'inside', minGainYd: 4, thenCallId: 'boot' }] });
    let queued = 0, tQ = 0, tM = 0, nM = 0;
    for (let g = 1; g <= 300; g++) {
      const c = createCaller(setup(profile(), s));
      const first = c.call(req(g, 1, sit()))!;
      tM += first.callTimeS; nM++;
      if (first.call.callId !== 'inside') continue;
      c.observe({ bucketId: 'first10', down: 1, look: 'oneHigh', ownCallId: 'inside', epa: 0.3, gainYd: 6, hurt: false }, drawsAt(g, 1));
      const second = c.call(req(g, 2, sit({ down: 2, distanceYd: 4 }), { substitutionInProgress: true }))!; // a huddle snap: the tempo menu does not hold the queued call
      expect(second.record.path).toBe('queued');
      expect(second.call.callId).toBe('boot');
      queued++; tQ += second.callTimeS;
    }
    expect(queued).toBeGreaterThan(10);
    expect(tQ / queued).toBeLessThan(tM / nM);
  });
});

describe('K4.3.5 readiness check', () => {
  it('calls under 0.4 estimated readiness are under 1% of calls, yet never impossible', () => {
    const c = createCaller(setup(profile(), sheet()));
    let unready = 0, floorSeen = 1;
    for (let k = 1; k <= 4000; k++) {
      const r = c.call(req(11, k, sit(), { readiness: (x) => (x.callId === 'deep' || x.callId === 'boot' ? 0.3 : 0.9) }))!;
      if (r.call.callId === 'deep' || r.call.callId === 'boot') unready++;
      floorSeen = Math.min(floorSeen, ...r.record.mix4);
    }
    expect(unready / 4000).toBeLessThan(0.01);
    expect(floorSeen).toBeGreaterThan(0);
  });
  it('keeps unready calls when the box would hold fewer than 2 ready ones', () => {
    const out = readinessCheck([0.5, 0.5], [0.3, 0.9], math);
    expect(out[0]).toBeCloseTo(0.09 / (0.09 + 0.81), 9);
    expect(readinessCheck([0.4, 0.3, 0.3], [0, 0.9, 0.9], math)[0]).toBe(0);
    expect(floorPossible([0, 0.5, 0.5])[0]).toBeGreaterThan(0);
  });
});

describe('K4.3.6 the draw and the call record', () => {
  it('replaying the same snaps reproduces every call, and every candidate keeps a chance', () => {
    const run = (): string[] => {
      const c = createCaller(setup(profile({ callFit: 1 }), sheet(), { scout: [{ bucketId: 'first10', look: 'pressure', count: 20 }] }));
      const out: string[] = [];
      for (let k = 1; k <= 200; k++) {
        const s = sit({ down: 1 + (k % 3), distanceYd: 3 + (k % 9), period: 1 + (k % 4), margin: (k % 7) - 3 });
        const r = c.call(req(12, k, s))!;
        expect(r.record.mix4.every((p) => p > 0)).toBe(true);
        expect(Math.abs(r.record.mix4.reduce((a, x) => a + x, 0) - 1)).toBeLessThan(1e-9);
        out.push(`${r.call.callId}@${r.callTimeS}`);
        c.observe({ bucketId: r.record.bucketId, down: s.down, look: LOOKS[k % 3]!, ownCallId: r.call.callId, epa: ((k % 5) - 2) / 4, gainYd: k % 12, hurt: k % 11 === 0 }, drawsAt(12, k));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
  it('one uniform selects from the mix', () => {
    expect(drawIndex([0.2, 0.3, 0.5], 0.1)).toBe(0);
    expect(drawIndex([0.2, 0.3, 0.5], 0.49)).toBe(1);
    expect(drawIndex([0.2, 0.3, 0.5], 0.9999)).toBe(2);
  });
  it('the request has no field for the opponent call (K4.3.6 rule 2, K4.4.1 acceptance)', () => {
    const allowed = ['situation', 'constraint', 'available', 'readiness', 'defenseFavourable', 'substitutionInProgress', 'facingTempo', 'draws'];
    const r: Required<CallRequest> = { situation: sit(), constraint: {}, available: () => true, readiness: () => 1, defenseFavourable: false, substitutionInProgress: false, facingTempo: false, draws: drawsAt(1, 1) };
    expect(Object.keys(r).sort()).toEqual([...allowed].sort());
    // @ts-expect-error the offensive call object cannot be handed to a caller
    const leak: CallRequest = { ...r, offenseCall: { formationId: 'trips' } };
    const c1 = createCaller(setup(profile(), sheet())), c2 = createCaller(setup(profile(), sheet()));
    expect(c1.call(r)!.call.callId).toBe(c2.call(leak)!.call.callId);
  });
});

describe('K4.4.1 calling defense', () => {
  const D: Record<string, SheetCall> = {
    fire: call('fire', 'pressure.one_high.man', { blitz: true, man: true }, null, true),
    sim: call('sim', 'no_pressure.one_high.zone', { simulatedPressure: true }, null, true),
    quarters: call('quarters', 'no_pressure.two_high.zone', { twoHigh: true }, null, true),
    tampa: call('tampa', 'no_pressure.two_high.zone', { twoHigh: true }, null, true),
    cover1: call('cover1', 'no_pressure.one_high.man', { man: true }, null, true),
    zero: call('zero', 'pressure.zero_high.man', { blitz: true, man: true }, null, false),
  };
  const looks = ['run', 'quick', 'deep'];
  const P: Record<string, number[]> = { fire: [0.1, -0.2, 0.3], sim: [0.0, 0.1, 0.1], quarters: [-0.1, 0.0, 0.3], tampa: [-0.05, 0.05, 0.2], cover1: [0.1, 0.0, -0.1], zero: [0.2, -0.4, 0.4] };
  const ds = lockSheet({ side: 'defense', looks, calls: D, boxes: [{ bucketId: 'base', parentId: null, rule: {}, callIds: Object.keys(D), payoff: P, clock: false, scriptable: false }], baseBoxByDown: { '0': 'base' }, script: [], sequences: [], follows: [], contingencies: [] });
  it('against tempo only the tempo menu of 4 calls can be sent', () => {
    const c = createCaller(setup(profile(), ds));
    const r = c.call(req(13, 1, sit(), { facingTempo: true }))!;
    expect(r.record.candidates.length).toBe(4);
    expect(r.record.candidates).not.toContain('zero');
  });
  it('protecting a late lead means fewer blitzes and more two-high', () => {
    const rate = (margin: number): { blitz: number; two: number } => {
      const c = createCaller(setup(profile(), ds));
      let blitz = 0, two = 0;
      for (let k = 1; k <= 1500; k++) { const r = c.call(req(14, k, sit({ period: 4, margin })))!; if (r.call.tags.blitz) blitz++; if (r.call.tags.twoHigh) two++; }
      return { blitz, two };
    };
    const ahead = rate(12), level = rate(0);
    expect(ahead.blitz).toBeLessThan(level.blitz);
    expect(ahead.two).toBeGreaterThan(level.two);
  });
});

describe('K4.1.2 thinking time and K4.5.2 tempo', () => {
  it('a call is never produced in zero time; queued and tempo calls are quicker', () => {
    const mean = (path: 'mix' | 'queued', tempo: 'huddle' | 'no_huddle', surprised = false): number => {
      let t = 0;
      for (let k = 0; k < 2000; k++) {
        const x = callTime({ path, tempo, candidates: 8, personnelChange: false, surprised, zCallFit: 0 }, rng(`t-${path}-${tempo}-${surprised}-${k}`));
        expect(x).toBeGreaterThanOrEqual(param('time.minS'));
        t += x;
      }
      return t / 2000;
    };
    const normal = mean('mix', 'huddle');
    expect(mean('queued', 'huddle')).toBeLessThan(normal);
    expect(mean('mix', 'no_huddle')).toBeLessThan(mean('queued', 'huddle'));
    expect(mean('mix', 'huddle', true)).toBeGreaterThan(normal + 2);
  });
  it('tempo follows the system, the last gain, the defense and the K5 clock constraint', () => {
    const base = { noHuddleShare: 0.1, lastGainYd: null, defenseFavourable: false, keepClockRunning: false, saveClock: false, substitutionInProgress: false };
    expect(noHuddleChance(base)).toBeCloseTo(0.1, 9);
    expect(noHuddleChance({ ...base, lastGainYd: 20 })).toBeCloseTo(0.2, 9);
    expect(noHuddleChance({ ...base, lastGainYd: 20, defenseFavourable: true })).toBeCloseTo(0.3, 9);
    const run = noHuddleChance({ ...base, keepClockRunning: true });
    expect(run).toBeGreaterThan(0);
    expect(run).toBeLessThan(0.01);
    expect(noHuddleChance({ ...base, saveClock: true, substitutionInProgress: true })).toBe(0);
    expect(chooseTempo({ ...base, saveClock: true }, rng('tempo'))).toBe('hurry_up');
  });
});

describe('K4.5.1 the opening script', () => {
  it('on the opening drive at least 80% of first-and-10 and second-and-medium calls come from the script', () => {
    const script = Array.from({ length: 12 }, (_, i) => (i % 2 === 0
      ? { callId: ['inside', 'quick', 'boot'][(i / 2) % 3]!, downs: [1], minDistanceYd: 10, maxDistanceYd: 10 }
      : { callId: ['outside', 'screen', 'deep'][((i - 1) / 2) % 3]!, downs: [2], minDistanceYd: 4, maxDistanceYd: 7 }));
    const s = sheet({ script });
    let scripted = 0, total = 0;
    for (let g = 1; g <= 200; g++) {
      const c = createCaller(setup(profile(), s));
      for (let k = 0; k < 6; k++) {
        const r = c.call(req(g, k + 1, k % 2 === 0 ? sit() : sit({ down: 2, distanceYd: 5 })))!;
        total++;
        if (r.record.path === 'script') scripted++;
      }
    }
    expect(scripted / total).toBeGreaterThanOrEqual(0.8);
    expect(scripted).toBeLessThan(total); // a caller can leave his script
  });
  it('is held in a two-minute box and a call is dropped on third and long', () => {
    const s = sheet({ script: [{ callId: 'boot', downs: [1], minDistanceYd: 10, maxDistanceYd: 10 }, { callId: 'inside', downs: [1], minDistanceYd: 10, maxDistanceYd: 10 }] });
    const c = createCaller(setup(profile(), s));
    expect(c.call(req(15, 1, sit({ insideTwoMinute: true })))!.record.path).toBe('mix');
    expect(c.call(req(15, 2, sit({ down: 3, distanceYd: 9 })))!.record.path).toBe('mix');
    const next = c.call(req(15, 4, sit()))!;
    expect(next.record.path).toBe('script');
    expect(next.call.callId).toBe('inside');
  });
});

describe('K4.5.3 series-break and halftime adjustments', () => {
  const cont = [
    { id: 'c1', bucketId: 'first10', addCallIds: [], removeCallIds: ['deep'], inPlan: true },
    { id: 'c2', bucketId: 'first10', addCallIds: [], removeCallIds: ['boot'], inPlan: false },
    { id: 'c3', bucketId: 'first10', addCallIds: [], removeCallIds: ['outside'], inPlan: true },
    { id: 'c4', bucketId: 'first10', addCallIds: [], removeCallIds: ['screen'], inPlan: true },
    { id: 'c5', bucketId: 'second_med', addCallIds: [], removeCallIds: ['deep'], inPlan: true },
  ];
  const s = sheet({ contingencies: cont });
  const losing = (zAdj: number, g: number) => {
    const c = createCaller(setup(profile({ adjustment: zAdj }), s, { zBoothEvaluation: zAdj }));
    for (let k = 1; k <= 6; k++) {
      const r = c.call(req(g, k, sit()))!;
      c.observe({ bucketId: 'first10', down: 1, look: 'pressure', ownCallId: r.call.callId, epa: -1, gainYd: -2, hurt: true }, drawsAt(g, k));
    }
    return c;
  };
  it('a better adjusting staff finds the true problem more often (40% to 90%)', () => {
    const found = (zAdj: number): number => {
      let n = 0;
      for (let g = 1; g <= 400; g++) if (losing(zAdj, g).adjust('series', 9, drawsAt(g, 99)).some((a) => a.identifiedTrueProblem)) n++;
      return n / 400;
    };
    const hi = found(3), lo = found(-3);
    expect(hi).toBeGreaterThan(0.84);
    expect(hi).toBeLessThan(0.95);
    expect(lo).toBeGreaterThan(0.33);
    expect(lo).toBeLessThan(0.47);
  });
  it('one change between series, 2 to 4 at halftime, never more than the players can carry', () => {
    let seriesMax = 0, halfHi = 0, halfLo = 9, capped = 0;
    for (let g = 1; g <= 60; g++) {
      seriesMax = Math.max(seriesMax, losing(3, g).adjust('series', 9, drawsAt(g, 99)).length);
      const a = losing(3, g).adjust('halftime', 9, drawsAt(g, 99));
      if (a.some((x) => x.identifiedTrueProblem)) { halfHi = Math.max(halfHi, a.length); expect(a.find((x) => x.contingency.id === 'c2')!.errorFactor).toBeGreaterThan(1); }
      const b = losing(-3, g).adjust('halftime', 9, drawsAt(g, 99));
      if (b.some((x) => x.identifiedTrueProblem)) halfLo = Math.min(halfLo, b.length);
      capped = Math.max(capped, losing(3, g).adjust('halftime', 1, drawsAt(g, 99)).length);
    }
    expect(seriesMax).toBe(1);
    expect(halfHi).toBe(4);
    expect(halfLo).toBe(2);
    expect(capped).toBe(1);
  });
  it('a change removes the call from the box and the mix is re-solved', () => {
    const c = losing(3, 3);
    const applied = c.adjust('series', 9, drawsAt(3, 99));
    if (applied[0]?.identifiedTrueProblem) expect(c.call(req(3, 50, sit()))!.record.candidates).not.toContain('deep');
  });
});

describe('K4.6.1 kicking-game calls', () => {
  const menu = [
    { callId: 'punt.left', estimatedGain: 0.004, fake: false },
    { callId: 'punt.right', estimatedGain: 0.0, fake: false },
    { callId: 'fake.pass', estimatedGain: 0.02, fake: true, fakeShare: 0.01 },
  ];
  it('fakes are called rarely but not never, and only at the floor when he rates them a loss', () => {
    const mix = specialTeamsMix(menu, math);
    expect(mix[2]).toBeCloseTo(0.01, 3);
    expect(mix[0]).toBeGreaterThan(mix[1]!);
    const losing = specialTeamsMix([menu[0]!, menu[1]!, { ...menu[2]!, estimatedGain: -0.05 }], math);
    expect(losing[2]).toBeGreaterThan(0);
    expect(losing[2]).toBeLessThan(0.001);
    let fakes = 0;
    for (let k = 0; k < 5000; k++) if (callSpecialTeams(menu, rng(`st-${k}`), math).callId === 'fake.pass') fakes++;
    expect(fakes).toBeGreaterThan(20);
    expect(fakes).toBeLessThan(90);
  });
});

describe('K4.8.1 deliberate fouls and gamesmanship', () => {
  it('a tactical foul is a candidate only when it beats the alternative in his estimate', () => {
    const out = tacticalFoulCandidates([{ actId: 'delay.punt_room', winProbabilityWith: 0.52, winProbabilityWithout: 0.5 }, { actId: 'hold.last_play', winProbabilityWith: 0.4, winProbabilityWithout: 0.45 }]);
    expect(out.map((o) => o.actId)).toEqual(['delay.punt_room']);
  });
  it('a conduct act happens only through the K2.8.2 decision, and never for an imported real coach', () => {
    const acts = [{ actId: 'feign.injury', estimatedGain: 0.03 }];
    let asked = 0;
    expect(considerConductAct({ personId: 'p1', imported: false }, acts, () => { asked++; return false; })).toBeNull();
    expect(considerConductAct({ personId: 'p1', imported: false }, acts, () => { asked++; return true; })?.actId).toBe('feign.injury');
    expect(asked).toBe(2);
    expect(considerConductAct({ personId: 'p2', imported: true }, acts, () => { asked++; return true; })).toBeNull();
    expect(asked).toBe(2);
  });
});

describe('K4.7.1 the exploit boundary', () => {
  it('repeating one look brings the counter, sooner against a quick adjuster', () => {
    const counterBy = (zAdj: number): number => {
      let total = 0;
      for (let g = 1; g <= 150; g++) {
        const c = createCaller(setup(profile({ adjustment: zAdj, callFit: 1 }), sheet()));
        for (let k = 1; k <= 6; k++) {
          const r = c.call(req(g, k, sit()))!;
          if (k > 3 && r.call.callId === 'screen') total++;
          c.observe({ bucketId: 'first10', down: 1, look: 'pressure', ownCallId: r.call.callId, epa: 0, gainYd: 3, hurt: false }, drawsAt(g, k));
        }
      }
      return total;
    };
    expect(counterBy(3)).toBeGreaterThan(counterBy(-3));
  });
});

describe('parameters and data', () => {
  it('the parameter table matches the schema and holds no forbidden key', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(scanForbiddenJson('coachAi.calling', PARAMS)).toEqual([]);
    expect(new Set(PARAMS.params.map((p) => p.name)).size).toBe(PARAMS.params.length);
    for (const p of PARAMS.params) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
  });
});

describe('K6.2.1 suggest: preview without calling', () => {
  const busy = () => sheet({
    script: [{ callId: 'boot', downs: [1], minDistanceYd: 10, maxDistanceYd: 10 }, { callId: 'outside', downs: [2], minDistanceYd: 4, maxDistanceYd: 7 }],
    sequences: [{ baseId: 'inside', complementId: null, constraintId: 'boot', trigger: 'pressure' }],
    follows: [{ afterCallId: 'inside', minGainYd: 4, thenCallId: 'quick' }],
  });
  const snaps = (k: number): CallSituation => [sit(), sit({ down: 2, distanceYd: 5 }), sit({ down: 3, distanceYd: 8 }), sit({ insideTwoMinute: true, period: 2 })][k % 4]!;
  const run = (g: number, withPreview: boolean) => {
    const c = createCaller(setup(profile({ callFit: 1 }), busy(), { scout: [{ bucketId: 'first10', look: 'pressure', count: 12 }] }));
    const out: unknown[] = [];
    for (let k = 1; k <= 30; k++) {
      const s = snaps(k);
      if (withPreview) for (let i = 0; i < 3; i++) { c.preview({ situation: s, available: () => true, readiness: () => 1 }); c.preview({ situation: s, available: () => true, readiness: () => 1, tempo: 'no_huddle' }); }
      const r = c.call(req(g, k, s));
      out.push(r);
      const look = LOOKS[(g + k) % 3]!;
      c.observe({ bucketId: r?.record.bucketId ?? 'first10', down: s.down, look, ownCallId: r?.call.callId ?? null, epa: 0.1, gainYd: (k * 3) % 9, hurt: false, late: k % 5 === 0 }, drawsAt(g, k));
    }
    return out;
  };
  it('any number of previews leaves every later call unchanged (script, sequences, queue, self-scout, late reports)', () => {
    for (let g = 1; g <= 40; g++) expect(run(g, true)).toEqual(run(g, false));
  });
  it('the previewed mix is the mix the next call draws from, ranked best first', () => {
    let compared = 0;
    for (let g = 1; g <= 60; g++) {
      const c = createCaller(setup(profile(), sheet(), { scout: [{ bucketId: 'first10', look: 'oneHigh', count: 20 }] }));
      const s = sit({ down: 2, distanceYd: 5 });
      const p = c.preview({ situation: s, available: () => true, readiness: (x) => (x.callId === 'deep' ? 0.2 : 1) })!;
      const r = c.call(req(g, 1, s, { readiness: (x) => (x.callId === 'deep' ? 0.2 : 1), substitutionInProgress: true }))!;
      expect(p.candidates.map((x) => x.callId)).toEqual(r.record.candidates);
      expect(p.mix4).toEqual(r.record.mix4);
      for (let i = 1; i < p.ranked.length; i++) expect(p.ranked[i - 1]!.weight).toBeGreaterThanOrEqual(p.ranked[i]!.weight);
      expect(p.ranked.find((l) => l.call.callId === 'deep')!.weight).toBeGreaterThan(0); // ruling 22: never impossible
      compared++;
    }
    expect(compared).toBe(60);
  });
  it('names the scripted and queued calls without using them up', () => {
    const c = createCaller(setup(profile(), busy()));
    const look = { situation: sit(), available: () => true, readiness: () => 1 };
    expect(c.preview(look)!.scriptedCallId).toBe('boot');
    expect(c.preview(look)!.scriptedCallId).toBe('boot');
    expect(c.preview({ ...look, tempo: 'no_huddle' })!.scriptedCallId).toBeNull(); // the script waits at tempo
    const q = createCaller(setup(profile(), sheet({ follows: [{ afterCallId: 'inside', minGainYd: 4, thenCallId: 'quick' }] })));
    for (let g = 1; g <= 50; g++) {
      const first = q.call(req(g, 1, sit()))!;
      q.observe({ bucketId: 'first10', down: 1, look: 'oneHigh', ownCallId: first.call.callId, epa: 0.2, gainYd: 6, hurt: false }, drawsAt(g, 1));
      const p = q.preview({ situation: sit({ down: 2, distanceYd: 4 }), available: () => true, readiness: () => 1 })!;
      expect(p.queuedCallId).toBe(first.call.callId === 'inside' ? 'quick' : null);
      if (first.call.callId === 'inside') return;
    }
    throw new Error('inside never called in 50 snaps');
  });
  it('returns null when nothing can be sent, as call does', () => {
    const c = createCaller(setup(profile(), sheet()));
    expect(c.preview({ situation: sit(), available: () => false, readiness: () => 1 })).toBeNull();
  });
});
