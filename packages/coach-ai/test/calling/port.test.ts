// Tests for the K5 to K4 join and the K4 caller behind the K6 CallerPort (CR-G58-3).
import { describe, expect, it } from 'vitest';
import { DMATH } from '@gm/engine-core';
import { flow } from '@gm/engine-game';
import { createStaffDecider, DUTY, type AnyCall, type CallContext, type DecisionView, type StaffDeciderConfig } from '../../src/staff/index.ts';
import { createCallerPort, joinK5, lockSheet, SHORT_YARDAGE_BOX, type CallerPortConfig, type CallingSheet, type SheetCall } from '../../src/calling/index.ts';
import {
  DC, GAME_READY, GEOMETRY, LAST_DOWN, OC, conservative, draws, fakeManager, fullStaff, gameDeps, gameInput, isOvertimeFault, newLog,
  profile, safeOppose, safeSnap, silent, staffer, view,
} from '../staff/fixtures.ts';

const LOOKS = ['pressure', 'oneHigh', 'twoHigh'];
const sc = (callId: string, lookClass: string, tags: SheetCall['tags'], personnel: SheetCall['personnel']): SheetCall =>
  ({ callId, lookClass, tags, personnel, planWeight: 1, tempoMenu: true });
const OFF: Record<string, SheetCall> = {
  inside: sc('inside', 'run.middle', {}, 'p12'), quick: sc('quick', 'quick_pass.middle', { pass: true }, 'p11'),
  deep: sc('deep', 'dropback.left', { pass: true, deepShot: true }, 'p11'), kneel: sc('kneel', 'kneel', {}, 'p11'),
};
const DEF: Record<string, SheetCall> = {
  cover2: sc('cover2', 'two_high', { twoHigh: true }, null), blitz: sc('blitz', 'pressure', { blitz: true }, null), cover3: sc('cover3', 'one_high', {}, null),
};
const box = (ids: string[], rows: number[][]) => ({
  bucketId: 'all', parentId: null, rule: {}, callIds: ids, payoff: Object.fromEntries(ids.map((id, i) => [id, rows[i]!])), clock: false, scriptable: true,
});
const offSheet: CallingSheet = lockSheet({
  side: 'offense', looks: LOOKS, calls: OFF, baseBoxByDown: { '0': 'all' }, script: [], sequences: [], follows: [], contingencies: [],
  boxes: [
    { ...box(['inside', 'quick'], [[0.3, 0.1, 0.2], [0.2, 0.2, 0.1]]), bucketId: 'short', rule: { constraintId: SHORT_YARDAGE_BOX } },
    box(['inside', 'quick', 'deep', 'kneel'], [[0.05, -0.1, 0.2], [0.25, 0.05, -0.02], [-0.35, 0.4, -0.25], [-1, -1, -1]]),
  ],
});
const defSheet: CallingSheet = lockSheet({
  side: 'defense', looks: ['run.middle', 'quick_pass.middle', 'dropback.left'], calls: DEF, baseBoxByDown: { '0': 'all' }, script: [], sequences: [], follows: [], contingencies: [],
  boxes: [box(['cover2', 'blitz', 'cover3'], [[0.1, -0.1, 0.2], [-0.1, 0.3, -0.3], [0.05, 0.05, 0.05]])],
});

/** Content stand-in: a sheet call becomes the conservative call with the matching play kind. */
function build(c: SheetCall, v: DecisionView, side: 'offense' | 'defense'): AnyCall {
  if (side === 'defense') return { ...safeOppose(v), ...({ defenseContentId: c.callId } as object) } as AnyCall;
  const base = safeSnap(v);
  if (base.unit !== 'offense') return base;
  return { ...base, playContentId: c.callId, kind: c.callId === 'kneel' ? 'kneel' : c.tags.pass ? 'dropback_pass' : 'run' };
}
const contentOf = (a: AnyCall): string | null => (a.unit === 'offense' ? a.playContentId : (a as { defenseContentId?: string }).defenseContentId ?? null);

function portConfig(over: Partial<CallerPortConfig> = {}): CallerPortConfig {
  return {
    geometry: GEOMETRY, regulationPeriods: 4,
    setupFor: (ctx, side) => ({
      profile: profile(ctx.caller.personId, side === 'offense' ? 'offensiveCoordinator' : 'defensiveCoordinator'), headCoach: { leadProtection: 0, deficitUrgency: 0, lateDefenseRisk: 0 },
      zBoothEvaluation: 0, sheet: side === 'offense' ? offSheet : defSheet, scout: [], opponentCallerId: null, ownWindow: {}, math: DMATH,
    }),
    build, playClockStartTenths: () => 400,
    draws: (v, ctx, kind) => draws([v.situation.gameId, v.situation.playNumber, ctx.caller.personId, kind]),
    ...over,
  };
}
const ctxFor = (personId: number, permits: (c: AnyCall) => boolean = () => true, duty: string = DUTY.callOffense): CallContext => ({
  caller: staffer(personId, personId === OC ? 'offensiveCoordinator' : 'defensiveCoordinator'), duty, sheet: { sheetId: null, builtById: null }, mayAdd: false, permits,
  draws: draws(['ctx', personId]),
});

describe('K5 to K4 join (K4.1.1 rule 5, K5.4.1)', () => {
  const isKneel = (c: SheetCall) => c.callId === 'kneel';
  it('maps each K5 output to the constraint field the caller reads', () => {
    expect(joinK5({ clock: null })).toBeUndefined();
    expect(joinK5({ clock: null, shortYardage: true })).toEqual({ id: 'go.short' });
    expect(joinK5({ clock: { mode: 'burn', kneel: false, spike: false, constraints: [] } })).toEqual({ keepClockRunning: true });
    expect(joinK5({ clock: { mode: 'save', kneel: false, spike: false, constraints: [] } })).toEqual({ saveClock: true });
  });
  it('a kneel order lets only kneels through; clock constraints narrow together; an unknown test filters nothing', () => {
    const k = joinK5({ clock: { mode: 'burn', kneel: true, spike: false, constraints: ['stay_in_bounds'] }, fits: { kneel: isKneel, constraint: { stay_in_bounds: () => false } } })!;
    expect(Object.values(OFF).filter(k.allows!).map((c) => c.callId)).toEqual(['kneel']);
    const both = joinK5({ clock: { mode: 'neutral', kneel: false, spike: false, constraints: ['stay_in_bounds', 'avoid_incompletion'] }, fits: { constraint: { stay_in_bounds: (c) => c.callId !== 'deep', avoid_incompletion: (c) => !c.tags.pass } } })!;
    expect(Object.values(OFF).filter(both.allows!).map((c) => c.callId)).toEqual(['inside', 'kneel']);
    expect(joinK5({ clock: { mode: 'neutral', kneel: false, spike: false, constraints: ['stay_in_bounds'] } })).toBeUndefined();
  });
});

describe('K4 behind the K6 CallerPort (CR-G58-3)', () => {
  const v = (playNumber: number, over: Parameters<typeof view>[0] = {}) => view({ deadline: null, ...over, situation: { down: 1, distanceYd: 10, playNumber, ...over.situation } });
  it('answers with the built call, his tempo, and the play clock when he made the call; same seed, same answers', () => {
    const a = createCallerPort(portConfig()), b = createCallerPort(portConfig());
    for (let k = 1; k <= 60; k++) {
      const x = a.snappingCall(v(k), ctxFor(OC))!, y = b.snappingCall(v(k), ctxFor(OC))!;
      expect(x).toEqual(y);
      expect(x.call.unit).toBe('offense');
      expect(contentOf(x.call)).toMatch(/inside|quick|deep|kneel/);
      expect(x.acceptedAtPlayClockTenths!).toBeLessThan(400); // a call is never made in zero time (K4.1.2)
      expect(x.acceptedAtPlayClockTenths!).toBeGreaterThanOrEqual(0);
      const d = a.opposingCall(v(k, { type: 'opposing_call', side: 1 }), ctxFor(DC, undefined, DUTY.callDefense))!;
      expect(contentOf(d.call)).toMatch(/cover2|blitz|cover3/);
    }
  });
  it('never returns a call the standing instructions forbid (K6.1.2)', () => {
    const port = createCallerPort(portConfig());
    const noPass = (c: AnyCall) => !(c.unit === 'offense' && c.kind === 'dropback_pass');
    for (let k = 1; k <= 300; k++) expect(noPass(port.snappingCall(v(k), ctxFor(OC, noPass))!.call)).toBe(true);
  });
  it('the K5 join reaches the caller: short yardage reads the go.short box, a kneel order sends a kneel', () => {
    const short = createCallerPort(portConfig({ constraint: () => joinK5({ clock: null, shortYardage: true }) }));
    for (let k = 1; k <= 100; k++) expect(contentOf(short.snappingCall(v(k), ctxFor(OC))!.call)).toMatch(/inside|quick/);
    const plain = createCallerPort(portConfig()); // control: without the hint the base box, with the deep shot, is read
    expect(Array.from({ length: 100 }, (_, k) => contentOf(plain.snappingCall(v(k + 1), ctxFor(OC))!.call)).some((id) => id === 'deep')).toBe(true);
    const kneel = createCallerPort(portConfig({ constraint: () => joinK5({ clock: { mode: 'burn', kneel: true, spike: false, constraints: [] }, fits: { kneel: (c) => c.callId === 'kneel' } }) }));
    for (let k = 1; k <= 50; k++) {
      const c = kneel.snappingCall(v(k), ctxFor(OC))!.call;
      expect(c.unit === 'offense' && c.kind).toBe('kneel');
    }
  });
  it('suggest is his preview, best first, built and filtered, and leaves the next call unchanged', () => {
    const a = createCallerPort(portConfig()), b = createCallerPort(portConfig());
    for (let k = 1; k <= 40; k++) {
      const s = a.suggest(v(k), ctxFor(OC), 2);
      expect(s.length).toBe(2);
      expect(s[0]!.weight).toBeGreaterThanOrEqual(s[1]!.weight);
      expect(a.snappingCall(v(k), ctxFor(OC))).toEqual(b.snappingCall(v(k), ctxFor(OC)));
    }
    expect(a.suggest(v(1), ctxFor(OC), 0)).toEqual([]);
  });
  it('kicks without a special-teams menu get no answer, so the default applies (J11.6.1)', () => {
    const port = createCallerPort(portConfig());
    expect(port.snappingCall(v(1, { situation: { playKind: 'punt' as never, down: null, distanceYd: null } }), ctxFor(OC))).toBeNull();
    expect(port.snappingCall(v(1), ctxFor(OC, undefined, DUTY.callSpecialTeams))).toBeNull();
  });
});

describe('whole game: the staff decider runs real K4 callers', () => {
  it.skipIf(!GAME_READY)('a game finishes with offensive and defensive calls coming from K4', () => {
    const asked: string[] = [];
    const port = createCallerPort(portConfig({ build: (c, vw, side) => { asked.push(c.callId); return build(c, vw, side); } }));
    const cfg = (): StaffDeciderConfig => ({
      side: 0, chart: fullStaff(), geometry: GEOMETRY, lastDown: LAST_DOWN, instructions: [], caller: port, manager: fakeManager(newLog()), user: null, draws, conservative,
    });
    for (let i = 0; i < 20; i++) {
      try {
        const input = gameInput(i);
        const result = flow.simulateGame(input, gameDeps(input, [createStaffDecider(cfg()), silent(1)]));
        expect(result).toBeTruthy();
        expect(asked.some((id) => id in OFF)).toBe(true);
        expect(asked.some((id) => id in DEF)).toBe(true);
        return;
      } catch (e) { if (!isOvertimeFault(e)) throw e; }
    }
    throw new Error('no game finished in 20 tries');
  });
});
