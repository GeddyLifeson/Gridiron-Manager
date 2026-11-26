// J6.1 common forms and J6.8.1 parameter file.
import { describe, expect, it } from 'vitest';
import { ParamFile, RuleKeyManifest } from '@gm/schema';
import {
  CONTEST_MATH, PARAMS, RULE_KEYS, clampProbability, contestParamTable, createContests, engagementResult,
  issToZ, readContestRules, speedFactor, zAttrMix,
} from '../../src/contest/index.ts';
import { band, contestStream, contests, countingTable, fixtureRules, math, paramValue, runEngagement, share } from './helpers.ts';

describe('contest parameter file (J6.8.1)', () => {
  it('is a valid parameter file with unique names and every value inside its range', () => {
    const file = ParamFile.parse(PARAMS);
    expect(new Set(file.params.map((p) => p.name)).size).toBe(file.params.length);
    for (const p of file.params) {
      expect(p.min, p.name).toBeLessThanOrEqual(p.value);
      expect(p.max, p.name).toBeGreaterThanOrEqual(p.value);
      expect(p.leaf, p.name).toMatch(/^J6\.\d\.\d$/);
      expect(p.constrainedBy.length, p.name).toBeGreaterThan(0);
    }
  });

  it('has no orphan: every row is read by the contest library, and the library reads no other name', () => {
    const { table, read } = countingTable();
    createContests(table, math); // throws on a name that is not in the file
    expect(PARAMS.params.map((p) => p.name).filter((n) => !read.has(n))).toEqual([]);
  });

  it('refuses a value outside its range and an unknown name', () => {
    expect(() => contestParamTable({ 'contest.passBlock.kappa': 99 })).toThrow(/outside/);
    expect(() => contestParamTable({ 'contest.nope.x': 1 })).toThrow(/unknown/);
    expect(contestParamTable({ 'contest.passBlock.kappa': 1.2 }).num('contest.passBlock.kappa')).toBe(1.2);
    expect(() => createContests(contestParamTable({ 'contest.common.pFloor': 0.001 }), math)).toThrow(/J6\.1\.3/);
  });

  it('carries the starting values J6 states', () => {
    const want: Record<string, number> = {
      'passBlock.kappa': 0.9, 'passBlock.lambda': 0.3, 'passBlock.sigma': 0.45, 'passBlock.gEven': 0.35,
      'runBlock.kappa': 0.8, 'runBlock.lambda': 0.4, 'runBlock.sigma': 0.4, 'release.kappa': 1.6, 'release.lambda': 0,
      'release.sigma': 0.6, 'stunt.beta0': 1.2, 'sack.beta0': 1.4, 'catch.beta0': 3.0, 'tackle.beta0': 1.7,
      'fumble.beta0': -5.0, 'recovery.fall': 0.85, 'recovery.scoop': 0.55, 'separation.baseS': 0.25, 'separation.floorS': 0.08,
    };
    for (const k of Object.keys(want)) expect(paramValue(k), k).toBe(want[k]);
    for (const p of PARAMS.params) if (Object.keys(want).includes(p.name.replace('contest.', ''))) expect(p.basis).toBe('bible');
  });

  it('declares its rule keys and reads them from a rule set', () => {
    expect(RuleKeyManifest.parse(RULE_KEYS)).toHaveLength(3);
    const withZone = readContestRules(fixtureRules({ 'foul.illegal_contact.exists': true, 'foul.illegal_contact.zone_yards': 7, 'catch.feet_required': 3 }));
    expect(withZone).toEqual({ contactZoneYd: 7, feetRequired: 3 });
    const without = readContestRules(fixtureRules({ 'foul.illegal_contact.exists': false, 'catch.feet_required': 3 }));
    expect(without.contactZoneYd).toBeNull();
  });
});

describe('effective z (J6.1.1)', () => {
  it('maps the internal skill scale to z and mixes attributes by weight', () => {
    expect(issToZ(50)).toBe(0);
    expect(issToZ(70)).toBe(2);
    expect(issToZ(30)).toBe(-2);
    expect(zAttrMix([70, 50], [0.5, 0.5])).toBe(1);
    expect(() => zAttrMix([70, 50], [0.5, 0.4])).toThrow();
  });

  it('equals zAttr for a fresh, healthy, prepared player with neutral technique and leverage', () => {
    expect(CONTEST_MATH.effectiveZ({ zAttr: 1.3, dFatigue: 0, dInjury: 0, dKnowledge: 0, mTechnique: 0, mLeverage: 0 })).toBe(1.3);
    expect(CONTEST_MATH.effectiveZ({ zAttr: 1, dFatigue: 0.2, dInjury: 0.3, dKnowledge: 0.1, mTechnique: 0.25, mLeverage: -0.05 })).toBeCloseTo(0.6, 12);
  });

  it('fatigue penalty is 0.8 f^2', () => {
    expect(contests.fatiguePenaltyZ(0)).toBe(0);
    expect(contests.fatiguePenaltyZ(0.5)).toBeCloseTo(0.2, 12);
    expect(contests.fatiguePenaltyZ(1)).toBeCloseTo(0.8, 12);
  });

  it('each term alone moves a 5,000-trial contest win rate in the expected direction', () => {
    const p = contests.passRush.engagement('edge');
    const base = { zAttr: 0, dFatigue: 0, dInjury: 0, dKnowledge: 0, mTechnique: 0, mLeverage: 0 };
    // Offensive win rate: the blocker is ahead at 2.5 s. The same seeds are used for every variant.
    const winRate = (offense: typeof base) => {
      const dz = CONTEST_MATH.effectiveZ(offense) - CONTEST_MATH.effectiveZ(base);
      return share(5000, (i) => runEngagement(p, dz, 0, 25, contestStream(i, 'passBlock')).a > 0);
    };
    const even = winRate(base);
    expect(winRate({ ...base, dFatigue: 0.5 })).toBeLessThan(even);
    expect(winRate({ ...base, dInjury: 0.5 })).toBeLessThan(even);
    expect(winRate({ ...base, dKnowledge: 0.5 })).toBeLessThan(even);
    expect(winRate({ ...base, mTechnique: 0.5 })).toBeGreaterThan(even);
    expect(winRate({ ...base, mTechnique: -0.5 })).toBeLessThan(even);
    expect(winRate({ ...base, mLeverage: 0.3 })).toBeGreaterThan(even);
    expect(winRate({ ...base, zAttr: 1 })).toBeGreaterThan(even);
  });
});

// Independent reference for the engagement contest: the exact distribution of the Markov chain on a
// grid, with the mass beyond each bound absorbed every tick. It shares no code with the engine.
function referenceWinShare(kappa: number, lambda: number, sigma: number, dz: number, ticks: number): { offense: number; defense: number } {
  const dt = 0.1, sd = sigma * Math.sqrt(dt), N = 801, h = 2 / N;
  const xs = Array.from({ length: N }, (_, i) => -1 + (i + 0.5) * h);
  const cdf = (z: number) => { // Abramowitz and Stegun 26.2.17
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp(-z * z / 2);
    const q = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z >= 0 ? 1 - q : q;
  };
  let mass = new Float64Array(N);
  const start = (N - 1) / 2;
  mass[start] = 1;
  let offense = 0, defense = 0;
  for (let t = 0; t < ticks; t++) {
    const next = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const m = mass[i] as number;
      if (m === 0) continue;
      const mean = (xs[i] as number) + kappa * dz * dt - lambda * (xs[i] as number) * dt;
      offense += m * (1 - cdf((1 - mean) / sd));
      defense += m * cdf((-1 - mean) / sd);
      for (let j = 0; j < N; j++) {
        const lo = (xs[j] as number) - h / 2, hi = lo + h;
        next[j] = (next[j] as number) + m * (cdf((hi - mean) / sd) - cdf((lo - mean) / sd));
      }
    }
    mass = next;
  }
  return { offense, defense };
}

describe('engagement contests (J6.1.2)', () => {
  const p = contests.passRush.engagement('edge');

  it('steps by the stated form and clamps at the bounds', () => {
    expect(CONTEST_MATH.stepEngagement(0.2, 1, { kappa: 0.9, lambda: 0.3, sigma: 0.45 }, 0)).toBeCloseTo(0.2 + 0.09 - 0.006, 12);
    expect(CONTEST_MATH.stepEngagement(0, 0, { kappa: 0.9, lambda: 0.3, sigma: 0.45 }, 1)).toBeCloseTo(0.45 * Math.sqrt(0.1), 12);
    expect(CONTEST_MATH.stepEngagement(0.99, 4, p, 3)).toBe(1);
    expect(CONTEST_MATH.stepEngagement(-0.99, -4, p, -3)).toBe(-1);
    expect(engagementResult(1)).toBe('offenseWin');
    expect(engagementResult(-1)).toBe('defenseWin');
    expect(engagementResult(0.4)).toBeNull();
  });

  it('with dz = 0 the win split over 100,000 trials is 50 to 50 within 0.5 points', () => {
    let offense = 0, defense = 0;
    for (let i = 0; i < 100_000; i++) {
      const r = runEngagement(p, 0, 0, 3000, contestStream(i, 'passBlock'));
      if (r.a >= 1) offense++; else if (r.a <= -1) defense++;
    }
    expect(offense + defense).toBe(100_000);
    expect(Math.abs(offense / 100_000 - 0.5)).toBeLessThan(0.005);
  });

  it('with dz = +1 the offensive win share at 2.5 s matches the exact reference within 1 point', () => {
    const ref = referenceWinShare(p.kappa, p.lambda, p.sigma, 1, 25);
    let offense = 0, defense = 0;
    const trials = 100_000;
    for (let i = 0; i < trials; i++) {
      const r = runEngagement(p, 1, 0, 25, contestStream(i, 'passBlock', 7));
      if (r.a >= 1) offense++; else if (r.a <= -1) defense++;
    }
    expect(ref.offense).toBeGreaterThan(0.2); // the check is not vacuous
    expect(Math.abs(offense / trials - ref.offense)).toBeLessThan(0.01);
    expect(Math.abs(defense / trials - ref.defense)).toBeLessThan(0.01);
  });

  it('a 4 z gap dominates without breaking (J6.1.1)', () => {
    const win = share(2000, (i) => runEngagement(p, 4, 0, 25, contestStream(i, 'passBlock')).a >= 1);
    expect(win).toBeGreaterThan(0.95);
    expect(Number.isFinite(CONTEST_MATH.stepEngagement(0, 40, p, 0))).toBe(true);
  });

  it('speed factor passes through its three points and never rises with A', () => {
    expect(speedFactor(-1, 1, 0.35, 0)).toBe(1);
    expect(speedFactor(0, 1, 0.35, 0)).toBe(0.35);
    expect(speedFactor(1, 1, 0.35, 0)).toBe(0);
    let last = 2;
    for (let a = -1; a <= 1.0001; a += 0.05) { const g = speedFactor(a, 1, 0.35, 0); expect(g).toBeLessThanOrEqual(last); last = g; }
  });
});

describe('event contests (J6.1.3)', () => {
  const row = { beta0: -1, beta1: 0.5, gamma: { wet: -0.3, help: 0.4 } };

  it('is the logistic of the linear form', () => {
    expect(CONTEST_MATH.eventProbability(0, {}, row, math)).toBeCloseTo(1 / (1 + Math.exp(1)), 12);
    expect(CONTEST_MATH.eventProbability(2, { wet: 1, help: 2 }, row, math)).toBeCloseTo(1 / (1 + Math.exp(-(-1 + 1 - 0.3 + 0.8))), 12);
    expect(CONTEST_MATH.eventProbability(1, { help: 1, wet: 1 }, row, math)).toBe(CONTEST_MATH.eventProbability(1, { wet: 1, help: 1 }, row, math));
    expect(() => CONTEST_MATH.eventProbability(0, { typo: 1 }, row, math)).toThrow(/typo/);
  });

  it('clamps to 0.0005 and 0.9995', () => {
    expect(CONTEST_MATH.eventProbability(100, {}, row, math)).toBe(0.9995);
    expect(CONTEST_MATH.eventProbability(-100, {}, row, math)).toBe(0.0005);
    expect(clampProbability(0)).toBe(0.0005);
  });

  it('softmax gives one probability per outcome, summing to 1, none certain or impossible', () => {
    const p = CONTEST_MATH.outcomeProbabilities([1, 0, -1], math);
    expect(p[0]! + p[1]! + p[2]!).toBeCloseTo(1, 12);
    expect(p[0]! / p[1]!).toBeCloseTo(Math.E, 9);
    const extreme = CONTEST_MATH.outcomeProbabilities([50, 0, -50], math);
    expect(extreme[2]!).toBeGreaterThan(0.0004);
    expect(extreme[0]!).toBeLessThan(0.9996);
    expect(extreme.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(CONTEST_MATH.outcomeProbabilities([3], math)).toEqual([1]);
  });

  it('reproduces its beta0 rate in a neutral 100,000-draw test', () => {
    const s = contestStream(1, 'tackle');
    const want = 1 / (1 + Math.exp(1));
    const got = share(100_000, () => s.uniform() < CONTEST_MATH.eventProbability(0, {}, row, math));
    expect(Math.abs(got - want)).toBeLessThan(band(want, 100_000));
  });
});
