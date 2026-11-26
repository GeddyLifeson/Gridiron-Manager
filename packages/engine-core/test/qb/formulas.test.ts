// WP-20 quarterback model: the parameter file, the formulas of J7 and the Q1.7.3 rating-response sweeps.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ParamFile, RuleKeyManifest, issToZ } from '@gm/schema';
import { DMATH } from '../../src/index.ts';
import * as qb from '../../src/qb/index.ts';
import { P } from './helpers.ts';

const GRADES = Array.from({ length: 21 }, (_, i) => i * 5);
const SRC = join(__dirname, '../../src/qb');

describe('quarterback parameter file', () => {
  it('is a valid parameter file: unique names, values inside ranges, J7 leaves (J6.2.5 for the arrival rows), a constraint on every row', () => {
    const file = ParamFile.parse(qb.PARAMS);
    expect(new Set(file.params.map((p) => p.name)).size).toBe(file.params.length);
    for (const p of file.params) {
      expect(p.min, p.name).toBeLessThanOrEqual(p.value);
      expect(p.max, p.name).toBeGreaterThanOrEqual(p.value);
      expect(p.leaf, p.name).toMatch(/^J[67]\.\d\.\d$/);
      expect(p.constrainedBy.length, p.name).toBeGreaterThan(0);
    }
  });

  it('has no orphan row: every parameter is read somewhere in the module source', () => {
    const code = readdirSync(SRC).filter((f) => f.endsWith('.ts') && f !== 'params.ts').map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n');
    const unread = qb.PARAMS.params.map((p) => p.name.slice('qb.'.length)).filter((n) => !code.includes(`'${n}'`));
    expect(unread).toEqual([]);
  });

  it('declares the rule keys it reads, and reads no other', () => {
    const manifest = RuleKeyManifest.parse(qb.RULE_KEYS);
    const code = readFileSync(join(SRC, 'stage.ts'), 'utf8');
    const read = [...code.matchAll(/rules\.(?:num|bool|opt)\('([a-z_.]+)'\)/g)].map((m) => m[1]!).sort();
    expect([...new Set(read)]).toEqual(manifest.map((k) => k.key).sort());
  });

  it('carries the bible starting values of J7 unchanged', () => {
    expect([P['drop.gunQuick.setS'], P['drop.gun3.setS'], P['drop.uc3.setS'], P['drop.uc5.setS'], P['drop.uc7.setS']]).toEqual([0.9, 1.5, 1.6, 2.1, 2.7]);
    expect([P['read.tReadBaseS'], P['read.tReadPerZS'], P['read.tReadFloorS']]).toEqual([0.55, 0.08, 0.3]);
    expect([P['scramble.s0'], P['scramble.s1'], P['scramble.s2'], P['scramble.s3'], P['scramble.s4'], P['scramble.s5'], P['scramble.s6']]).toEqual([-2.4, 0.5, 1.0, 0.8, 1.0, 0.5, 1.0]); // s0 is an Assumption row, tuned from -3.6 against the scramble share
    expect([P['acc.sdShortYd'], P['acc.sdMidYd'], P['acc.sdDeepYd']]).toEqual([0.6, 1.0, 2.6]); // the deep value is tuned from the bible's 1.8 against completion by depth (an Assumption row now)
    expect([P['throw.releaseBaseS'], P['throw.vBallBaseYps'], P['kneel.liveS'], P['kneel.lossYd']]).toEqual([0.4, 26, 2, 1]);
  });
});

describe('J7 formulas', () => {
  it('J7.1.1: set time is the table time less 0.05 s per z of footwork, plus play action and a bad snap', () => {
    expect(qb.setTimeS('uc5', 0, 0, 0, P)).toBeCloseTo(2.1, 12);
    expect(qb.setTimeS('uc5', 1, 0, 0, P)).toBeCloseTo(2.05, 12);
    expect(qb.setTimeS('gun3', 0, 0.5, 0.3, P)).toBeCloseTo(2.3, 12);
  });
  it('J7.2.1: read time is 0.55 s at grade 50, 0.08 s per z, floored at 0.30 s', () => {
    expect(qb.readTimeS(0, P)).toBeCloseTo(0.55, 12);
    expect(qb.readTimeS(1, P)).toBeCloseTo(0.47, 12);
    expect(qb.readTimeS(9, P)).toBe(0.3);
  });
  it('J7.3.2: the threshold falls with time since set, with pressure, and with a risk-taking quarterback', () => {
    const base = qb.throwThresholdEp(0.3, 0, 0, false, P);
    expect(qb.throwThresholdEp(0.3, 0, 1, false, P)).toBeLessThan(base);
    expect(qb.throwThresholdEp(0.3, 0, 0, true, P)).toBeCloseTo(base - 0.15, 12);
    expect(qb.riskOffsetEp(60, 'normal', P)).toBeCloseTo(0.04, 12);
    expect(qb.riskOffsetEp(50, 'shots', P)).toBeGreaterThan(0);
    expect(qb.riskOffsetEp(50, 'protect', P)).toBeLessThan(0);
  });
  it('J7.3.2: the interception ceiling is 0.25, and 0.40 when trailing by more than a score late in the last period', () => {
    expect(qb.interceptionCeiling(14, 8, 4, 300, P)).toBe(0.4);
    expect(qb.interceptionCeiling(8, 8, 4, 300, P)).toBe(0.25);
    expect(qb.interceptionCeiling(14, 8, 3, 300, P)).toBe(0.25);
    expect(qb.interceptionCeiling(14, 8, 4, 600, P)).toBe(0.25);
  });
  it('J7.4.1: false pressure needs hits and a composure grade under 50', () => {
    expect(qb.falsePressureChance(0, 20, P)).toBe(0);
    expect(qb.falsePressureChance(4, 60, P)).toBe(0);
    expect(qb.falsePressureChance(2, 30, P)).toBeGreaterThan(0);
    expect(qb.falsePressureChance(50, 0, P)).toBe(P['pressure.falseMax']);
  });
  it('J7.5.1: the scramble chance follows the leaf equation term by term', () => {
    const base = { zScrambleTendency: 0, laneQuality: 0, manCoverageBacksTurned: false, spyPresent: false, yardsNeededShort: false, instruction: 0 };
    const c = (o: Partial<qb.ScrambleInputs>): number => qb.scrambleChance({ ...base, ...o }, P, DMATH);
    expect(c({})).toBeCloseTo(1 / (1 + Math.exp(-P['scramble.s0'])), 9);
    expect(c({ laneQuality: 1 })).toBeGreaterThan(c({}));
    expect(c({ manCoverageBacksTurned: true })).toBeGreaterThan(c({}));
    expect(c({ spyPresent: true })).toBeLessThan(c({}));
    expect(c({ yardsNeededShort: true })).toBeGreaterThan(c({}));
    expect(c({ instruction: 1 })).toBeGreaterThan(c({}));
    expect(c({ instruction: -1 })).toBeLessThan(c({}));
  });
  it('J7.6.2: platform multipliers stack, and the matching attribute trims only the excess over 1', () => {
    const set = qb.platformMultiplier(qb.SET_PLATFORM, 0, 0, 1, P);
    expect(set).toBe(1);
    const moving = qb.platformMultiplier({ ...qb.SET_PLATFORM, moving: true }, 0, 0, 1, P);
    expect(moving).toBeCloseTo(1.3, 12);
    expect(qb.platformMultiplier({ ...qb.SET_PLATFORM, moving: true, toThrowingSide: true }, 0, 0, 1, P)).toBeCloseTo(1.15, 12);
    expect(qb.platformMultiplier({ ...qb.SET_PLATFORM, moving: true, hit: true }, 0, 0, 1, P)).toBeCloseTo(1.3 * P['acc.hitMult'], 12);
    expect(qb.platformMultiplier({ ...qb.SET_PLATFORM, moving: true }, 30, 0, 1, P)).toBe(1);
    expect(qb.platformMultiplier(qb.SET_PLATFORM, 0, 0, 1.2, P)).toBeCloseTo(1.2, 12);
  });
  it('the reading-time flight estimate is the closed form of a ball slowed by drag', () => {
    expect(qb.flightTimeEstimateS(20, 20, 0, DMATH)).toBe(1);
    expect(qb.flightTimeEstimateS(20, 20, 0.01, DMATH)).toBeCloseTo((Math.exp(0.2) - 1) / 0.2, 9);
    expect(qb.insideRadiusShare(1, 0, DMATH)).toBe(1);
    expect(qb.insideRadiusShare(1, 1, DMATH)).toBeCloseTo(1 - Math.exp(-0.5), 9);
  });
});

// Q1.7.3: sweep each attribute 0 to 100 in steps of 5 with everything else fixed. The quantity must move
// the right way at every step where it is not on a stated floor or ceiling, and differ end to end.
describe('Q1.7.3 rating-response sweeps', () => {
  const sweeps: [string, 'up' | 'down', (z: number, grade: number) => number][] = [
    ['footwork_and_drop -> set time', 'down', (z) => qb.setTimeS('uc5', z, 0, 0, P)],
    ['processing_speed -> read time', 'down', (z) => qb.readTimeS(z, P)],
    ['anticipation -> how early he may throw', 'up', (z) => qb.anticipationEarlyS(z, P)],
    ['coverage_reading_post_snap -> separation error', 'down', (z) => qb.separationSdYd(z, P)],
    ['coverage_reading_post_snap -> key read right', 'up', (z) => qb.keyReadChance(z, P, DMATH)],
    ['decision_risk -> threshold offset', 'up', (_z, g) => qb.riskOffsetEp(g, 'normal', P)],
    ['blitz_recognition -> hot seen', 'up', (z) => qb.hotSeenChance(z, false, P, DMATH)],
    ['pocket_movement -> blindside feel', 'up', (z) => qb.blindsideFeelChance(z, P)],
    ['pocket_movement -> eyes stay downfield', 'up', (z) => qb.eyesDownfieldChance(z, P)],
    ['composure -> false pressure', 'down', (_z, g) => qb.falsePressureChance(3, g, P)],
    ['composure -> risky dump', 'down', (z) => qb.riskyDumpChance(z, P, DMATH)],
    ['scramble_and_run_skill -> scramble chance', 'up', (z) => qb.scrambleChance({ zScrambleTendency: z, laneQuality: 0.5, manCoverageBacksTurned: false, spyPresent: false, yardsNeededShort: false, instruction: 0 }, P, DMATH)],
    ['football_intelligence -> knows the grounding rule', 'up', (z) => qb.knowsGroundingChance(z, P, DMATH)],
    ['football_intelligence -> sees the free play', 'up', (z) => qb.freePlaySeenChance(z, P, DMATH)],
    ['release_time -> release time', 'down', (z) => qb.releaseTimeS(z, P)],
    ['arm_strength -> ball speed', 'up', (z) => qb.maxBallSpeedYps(z, P)],
    ['accuracy_short -> error', 'down', (z) => qb.accuracySdYd('short', z, P)],
    ['accuracy_intermediate -> error', 'down', (z) => qb.accuracySdYd('intermediate', z, P)],
    ['accuracy_deep -> error', 'down', (z) => qb.accuracySdYd('deep', z, P)],
    ['accuracy_on_the_move -> moving error', 'down', (z) => qb.platformMultiplier({ ...qb.SET_PLATFORM, moving: true }, z, 0, 1, P)],
    ['accuracy_under_pressure -> hit error', 'down', (z) => qb.platformMultiplier({ ...qb.SET_PLATFORM, hit: true }, 0, z, 1, P)],
    ['play_fake_and_ball_handling -> fumbled exchange', 'down', (z) => qb.meshFumbleChance(z, true, false, P, DMATH)],
    ['play_fake_and_ball_handling -> pump fake used', 'up', (z) => qb.pumpFakeChance(z, P, DMATH)],
    ['play_recognition -> mesh read right', 'up', (z) => qb.meshReadChance(z, 0, P, DMATH)],
  ];
  for (const [name, dir, f] of sweeps) {
    it(name, () => {
      const v = GRADES.map((g) => f(issToZ(g), g));
      for (let i = 1; i < v.length; i++) {
        if (dir === 'up') expect(v[i]!, `${name} at grade ${GRADES[i]}`).toBeGreaterThanOrEqual(v[i - 1]!);
        else expect(v[i]!, `${name} at grade ${GRADES[i]}`).toBeLessThanOrEqual(v[i - 1]!);
      }
      if (dir === 'up') expect(v[20]!).toBeGreaterThan(v[0]!); else expect(v[20]!).toBeLessThan(v[0]!);
      // No cliff: the largest single step is under half the whole range (Q1.7.3 smoothness).
      const range = Math.abs(v[20]! - v[0]!);
      for (let i = 1; i < v.length; i++) expect(Math.abs(v[i]! - v[i - 1]!), `${name} step at ${GRADES[i]}`).toBeLessThanOrEqual(range / 2);
    });
  }
  it('a late decision and a wet ball both raise the chance of a fumbled exchange, and it is never 0 or 1', () => {
    const base = qb.meshFumbleChance(0, false, false, P, DMATH);
    expect(qb.meshFumbleChance(0, true, false, P, DMATH)).toBeGreaterThan(base);
    expect(qb.meshFumbleChance(0, false, true, P, DMATH)).toBeGreaterThan(base);
    expect(base).toBeGreaterThan(0);
    expect(qb.meshFumbleChance(-5, true, true, P, DMATH)).toBeLessThan(1);
  });
  it('a better defender discipline makes the mesh read harder', () => {
    expect(qb.meshReadChance(0, 1, P, DMATH)).toBeLessThan(qb.meshReadChance(0, -1, P, DMATH));
  });
});
