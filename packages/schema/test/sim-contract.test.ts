import { describe, expect, it } from 'vitest';
import {
  simSchemas, simPublicSchemas, walkFields, toPlay, toField, PlayTruth, playTruthProblems, deadBallOf,
  targetTierProblems, CalibrationTarget, STREAM_NAMES, STREAM_SCOPE, foulKey, otherSide, issToZ,
  type PlayFrame,
} from '../src/index.ts';

describe('simulation contract (plans/engine-build-plan.md)', () => {
  it('public contract schemas hold no truth field (P1.1.4, Q1.4.2)', () => {
    const hits: string[] = [];
    for (const [name, s] of Object.entries(simPublicSchemas())) walkFields(s, (f) => { if (f.meta?.vis === 'truth') hits.push(name + f.path); });
    expect(hits).toEqual([]);
  });

  it('every public contract schema is also registered for the lints', () => {
    const all = simSchemas();
    for (const name of Object.keys(simPublicSchemas())) expect(all[name]).toBeDefined();
  });

  it('play frame and field frame convert exactly both ways (J1.1.2)', () => {
    for (const attackDir of [1, -1] as const) {
      const f: PlayFrame = { originX: 37, originY: 23.58, attackDir, fieldSide: 'left', lineToGainPx: 10, goalLinePx: 63 };
      const p = { x: 51.25, y: 12.5 };
      expect(toField(f, toPlay(f, p))).toEqual(p);
      expect(toPlay(f, { x: f.originX, y: f.originY })).toEqual({ px: 0, py: 0 });
    }
    const east: PlayFrame = { originX: 37, originY: 20, attackDir: 1, fieldSide: 'left', lineToGainPx: 10, goalLinePx: 63 };
    expect(toPlay(east, { x: 42, y: 22 })).toEqual({ px: 5, py: 2 });
    expect(toPlay({ ...east, attackDir: -1 }, { x: 42, y: 22 })).toEqual({ px: -5, py: -2 });
  });

  it('a play truth record parses and its structural promises are checked (J1.6.2)', () => {
    const dead = { type: 'dead_ball', t: 4.2, marginYd: null, marginS: null, visibility: 'open',
      reason: 'down_by_contact', spot: { x: 41, y: 20 }, side: 0, carrierId: 7 };
    const base = { resolverId: 'reference', resolverVersion: '0', gameId: 1, playNumber: 1, originX: 37, originY: 20,
      attackDir: 1, liveDurationTenths: 42, endZoneImpetus: null };
    const good = PlayTruth.parse({ ...base, events: [dead] });
    expect(playTruthProblems(good)).toEqual([]);
    expect(deadBallOf(good).spot.x).toBe(41);
    const none = PlayTruth.parse({ ...base, events: [] });
    expect(playTruthProblems(none).length).toBe(1);
    const disorder = PlayTruth.parse({ ...base, events: [dead, { ...dead, t: 1 }] });
    expect(playTruthProblems(disorder).length).toBeGreaterThan(1);
    expect(PlayTruth.safeParse({ ...base, events: [{ ...dead, extra: 1 }] }).success).toBe(false);
  });

  it('only a Verified target may certify; a target with no fact row may only be watched (J15.1.1)', () => {
    const t = CalibrationTarget.parse({ id: 'game.pointsPerTeam', ruleSetId: 'pro', leaf: 'J15.2.1', layer: 'game', kind: 'mean',
      quantity: 'points per team per game', unit: 'points', filter: 'regular season', definition: 'see J15.2.1', value: 1, n: null,
      seasons: '', tolerance: { type: 'rel', value: 0, low: null, high: null }, factId: 'F-measured-rate-0001', tier: 'certify',
      ruleSetDependent: false, note: null });
    expect(targetTierProblems(t, 'Verified')).toEqual([]);
    expect(targetTierProblems(t, '2 of 3').length).toBe(1);
    expect(targetTierProblems({ ...t, factId: null, tier: 'tune' }, null).length).toBe(1);
    expect(targetTierProblems({ ...t, factId: null, tier: 'watch' }, null)).toEqual([]);
  });

  it('every stream has a scope that starts with the game, and small helpers behave (J13.2.1)', () => {
    for (const n of STREAM_NAMES) expect(STREAM_SCOPE[n][0]).toBe('game');
    expect(foulKey('holding_offense', 'yards')).toBe('foul.holding_offense.yards');
    expect(otherSide(0)).toBe(1);
    expect(issToZ(50)).toBe(0);
  });
});
