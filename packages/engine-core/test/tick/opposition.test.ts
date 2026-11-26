// The other side of a skill term (ruling of 2026-11-26: one pro scale, no level of play). Each term that used to
// read one man's grade alone now reads it against the men testing it. These tests hold the two promises of that:
// two sides of the same grade get the 50 v 50 value at any grade, and a man's own grade still counts in full.
import { describe, expect, it } from 'vitest';
import { BEHAVIORS, SLOT_COUNT, SLOTS_PER_TEAM, type Behavior, type TickWorld } from '@gm/schema';
import * as qb from '../../src/qb/index.ts';
import { COVERING, READING, RUSHING, bodyZ, opposingElevenZ, opposingZ } from '../../src/tick/opposition.ts';
import { contests } from '../contest/helpers.ts';
import { P } from '../qb/helpers.ts';

const LEVELS = [-2.5, -1, 0, 1, 2.5];

/** A world of 22 men with only what the helper reads: grades, behaviors and the body penalties. */
function world(grade: (slot: number, attr: string) => number, behavior: (slot: number) => Behavior, fatigueZ: (slot: number) => number = () => 0): TickWorld {
  const slots = Array.from({ length: SLOT_COUNT }, (_, s) => ({ slot: s, player: { attributes: new Proxy({}, { get: (_t, a) => grade(s, String(a)) }) } }));
  return {
    slots,
    players: {
      behavior: Uint8Array.from({ length: SLOT_COUNT }, (_, s) => BEHAVIORS.indexOf(behavior(s))),
      dFatigueZ: Float64Array.from({ length: SLOT_COUNT }, (_, s) => fatigueZ(s)), dInjuryZ: new Float64Array(SLOT_COUNT),
    },
  } as unknown as TickWorld;
}

describe('who is on the other side', () => {
  // Defense in slots 11 to 21: four rushers at 70, seven in coverage at 30. Offense all 50.
  const w = world((s) => (s < SLOTS_PER_TEAM ? 50 : s < SLOTS_PER_TEAM + 4 ? 70 : 30), (s) => (s < SLOTS_PER_TEAM ? 'route' : s < SLOTS_PER_TEAM + 4 ? 'passRush' : 'zoneDrop'));

  it('reads only the men doing the job: rushers for the rush, coverage men for the coverage', () => {
    expect(opposingZ(w, 0, RUSHING, ['get_off'])).toBeCloseTo(2, 10);
    expect(opposingZ(w, 0, COVERING, READING)).toBeCloseTo(-2, 10);
  });

  it('falls back to the whole eleven when nobody is doing the job', () => {
    expect(opposingZ(w, SLOTS_PER_TEAM, RUSHING, ['get_off'])).toBeCloseTo(0, 10);
    expect(opposingElevenZ(w, 0, READING)).toBeCloseTo((4 * 2 + 7 * -2) / 11, 10);
    expect(opposingElevenZ(w, SLOTS_PER_TEAM + 3, READING)).toBeCloseTo(0, 10);
  });

  it('takes a tired man at what he has left, and a missing grade as 50', () => {
    const tired = world((s, a) => (a === 'get_off' ? 60 : (undefined as unknown as number)), () => 'passRush', (s) => (s === 12 ? 0.5 : 0));
    expect(bodyZ(tired, 12, ['get_off'])).toBeCloseTo(0.5, 10);
    expect(bodyZ(tired, 13, ['get_off', 'not_a_grade'])).toBeCloseTo(0.5, 10);
  });
});

describe('quarterback clocks and ball speed against the other side', () => {
  const at50 = { set: qb.setTimeS('gun3', 0, 0, 0, P), read: qb.readTimeS(0, P), release: qb.releaseTimeS(0, P), ball: qb.maxBallSpeedYps(0, P) };

  it('equal grades on both sides give the 50 v 50 value at every level', () => {
    for (const z of LEVELS) {
      expect(qb.setTimeS('gun3', z, 0, 0, P, z)).toBeCloseTo(at50.set, 10);
      expect(qb.readTimeS(z, P, z)).toBeCloseTo(at50.read, 10);
      expect(qb.releaseTimeS(z, P, z)).toBeCloseTo(at50.release, 10);
      expect(qb.maxBallSpeedYps(z, P, z)).toBeCloseTo(at50.ball, 10);
    }
  });

  it('his own grade still counts in full against a given opponent, and a better opponent costs him', () => {
    for (const opp of LEVELS) {
      expect(qb.readTimeS(1, P, opp)).toBeLessThanOrEqual(qb.readTimeS(0, P, opp));
      expect(qb.setTimeS('uc5', 1, 0, 0, P, opp)).toBeLessThan(qb.setTimeS('uc5', 0, 0, 0, P, opp));
      expect(qb.maxBallSpeedYps(1, P, opp) - qb.maxBallSpeedYps(0, P, opp)).toBeCloseTo(P['throw.vBallPerZYps'], 6);
    }
    expect(qb.readTimeS(0, P, 1)).toBeGreaterThan(qb.readTimeS(0, P, 0));
    expect(qb.releaseTimeS(0, P, 1)).toBeGreaterThan(qb.releaseTimeS(0, P, 0));
    expect(qb.maxBallSpeedYps(0, P, 1)).toBeLessThan(qb.maxBallSpeedYps(0, P, 0));
  });

  it('with no opponent given, a formula is the leaf formula (J7.1.1, J7.2.1, J7.6.1)', () => {
    expect(qb.readTimeS(-1, P)).toBeCloseTo(P['read.tReadBaseS'] + P['read.tReadPerZS'], 10);
    expect(qb.releaseTimeS(1, P)).toBeCloseTo(P['throw.releaseBaseS'] - P['throw.releasePerZS'], 10);
  });

  it('keeps the floors: no opponent is so poor that a read or a release takes no time', () => {
    expect(qb.readTimeS(3, P, -3)).toBe(P['read.tReadFloorS']);
    expect(qb.releaseTimeS(3, P, -5)).toBe(P['throw.releaseFloorS']);
  });
});

describe('the contested ball', () => {
  const probs = (zReceiver: number, zDefender: number): number[] => contests.catchPoint.contestedProbabilities({
    zContestedCatch: zReceiver, zBallSkills: zDefender, position: 'inPhase', ballLocated: true, placementError: 0.3, hitAtCatch: false, wet: false,
  });

  it('two men of the same grade contest it the same way at any level: catch, breakup and interception', () => {
    const even = probs(0, 0);
    for (const z of LEVELS) probs(z, z).forEach((p, k) => expect(p).toBeCloseTo(even[k]!, 10));
  });

  it('a better defender still takes more of them away, and a better receiver gives fewer up', () => {
    expect(probs(0, 1)[2]!).toBeGreaterThan(probs(0, 0)[2]!);
    expect(probs(1, 0)[2]!).toBeLessThan(probs(0, 0)[2]!);
  });
});
