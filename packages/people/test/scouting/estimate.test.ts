// D6.1.1, D6.4.1 to D6.4.5 acceptance tests for the estimator.
import { describe, expect, it } from 'vitest';
import { seedFromNumber, stream } from '@gm/engine-core';
import {
  ageTo, band, evidenceItem, evidenceVariance, floorSd, halfWidth, makePrior, NO_LEAN, observe, opponentVarianceMultiplier,
  p, PARAMS, priorFor, update, updateAll, userGradeItem, widenForMajorInjury,
  type Contributor, type Estimate, type LookContext,
} from '../../src/scouting/index.ts';

const D0 = { seasonYear: 2030, dayIndex: 100 };
const day = (n: number) => ({ seasonYear: 2030, dayIndex: 100 + n });
const COACH: Contributor = { id: 11, line: 'offense' };
const SCOUT: Contributor = { id: 21, line: 'personnel' };
const skill50 = () => 50;
const rng = (n: number, name = 'scouting-test') => stream(seedFromNumber(n), name, [n]);

function look(over: Partial<LookContext> = {}): LookContext {
  return {
    attribute: 'pass_set', source: 'game_film', units: 1, date: day(1), evaluator: COACH,
    skill: 50, estimateMean: 50, opponent: null, ...over,
  };
}

describe('D6.1.1 precision-weighted update', () => {
  it('follows new variance = 1/(1/old + 1/ev) and new mean = var (old/oldVar + x/ev)', () => {
    const prior = makePrior(40, 10, D0);
    const item = { ...evidenceItem(look({ units: 1, date: D0 }), 60), variance: 100 };
    const e = update(prior, item, 25, () => 100);
    expect(e.variance).toBeCloseTo(50, 9);
    expect(e.mean).toBeCloseTo(50, 9);
    expect(e.evidenceCount).toBe(1);
    expect(e.lastEvidence).toEqual(D0);
  });
  it('shows an 80 percent band: mean plus and minus 1.28 sd', () => {
    expect(halfWidth(100)).toBeCloseTo(12.8, 9);
    expect(band({ mean: 50, variance: 4 })).toEqual({ mean: 50, low: 50 - 2.56, high: 50 + 2.56 });
  });
  it('converges on the true value with unbiased evidence', () => {
    const r = rng(1);
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      const truth = 50 + r.normal() * 10;
      let e = priorFor({ positionLevelMean: 50, publicImplied: null, information: 'none', date: D0 });
      for (let g = 0; g < 40; g++) e = update(e, observe(truth, look({ units: 60, date: day(g), estimateMean: e.mean }), NO_LEAN, r), 26, skill50);
      worst = Math.max(worst, Math.abs(e.mean - truth));
    }
    // 2,400 film snaps: sampling sd under 1.2 ISS, so no one is 5 ISS off.
    expect(worst).toBeLessThan(5);
  });
});

/** Coverage of the 80 percent band across a population (D6.1.1 acceptance: 76 to 84 percent). */
function coverage(trials: number, run: (r: ReturnType<typeof rng>) => { truth: number; e: Estimate }, seed: number): number {
  const r = rng(seed, 'coverage');
  let inside = 0;
  for (let i = 0; i < trials; i++) {
    const { truth, e } = run(r);
    const b = band(e);
    if (truth >= b.low && truth <= b.high) inside++;
  }
  return inside / trials;
}

describe('D6.1.1 acceptance: 80 percent of true values inside the band (76 to 84)', () => {
  it('holds with unbiased evidence at several evidence levels and evaluator skills', () => {
    for (const snaps of [0, 10, 40]) {
      const c = coverage(4000, (r) => {
        const truth = 45 + r.normal() * 12;
        const skill = 30 + r.uniform() * 50;
        let e = priorFor({ positionLevelMean: 45, publicImplied: null, information: 'none', date: D0 });
        if (snaps > 0) e = update(e, observe(truth, look({ units: snaps, skill }), NO_LEAN, r), 26, () => skill);
        return { truth, e };
      }, 7 + snaps);
      expect(c, `snaps ${snaps}`).toBeGreaterThanOrEqual(0.76);
      expect(c, `snaps ${snaps}`).toBeLessThanOrEqual(0.84);
    }
  });
});

describe('D6.4.1 priors', () => {
  it('starts at 12, 8 or 6 ISS sd by public information and is marked public only', () => {
    const at = (information: 'none' | 'production' | 'established_starter') =>
      priorFor({ positionLevelMean: 30, publicImplied: 50, information, date: D0 });
    expect(Math.sqrt(at('none').variance)).toBe(12);
    expect(Math.sqrt(at('production').variance)).toBe(8);
    expect(Math.sqrt(at('established_starter').variance)).toBe(6);
    expect(at('none').publicOnly).toBe(true);
    expect(at('none').mean).toBe(30 + p('prior.publicRegression') * 20);
  });
  it('is unbiased across a population when the position mean is the population mean (within 1 ISS)', () => {
    const r = rng(3);
    let err = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      const truth = 40 + r.normal() * 12;
      err += priorFor({ positionLevelMean: 40, publicImplied: null, information: 'none', date: D0 }).mean - truth;
    }
    expect(Math.abs(err / n)).toBeLessThan(1);
  });
});

describe('D6.4.2 evidence sources and the tuning target', () => {
  it('applies skill: noise sd multiplier 1.6 - skill/100 (80 gives 0.8, 30 gives 1.3)', () => {
    const v80 = evidenceVariance({ source: 'workout', units: 1, skill: 80, estimateMean: 50, opponent: null });
    const v30 = evidenceVariance({ source: 'workout', units: 1, skill: 30, estimateMean: 50, opponent: null });
    expect(Math.sqrt(v80)).toBeCloseTo(12 * 0.8, 9);
    expect(Math.sqrt(v30)).toBeCloseTo(12 * 1.3, 9);
  });
  it('keeps the D6.4.2 ratios between per-snap sources', () => {
    const sd = (source: LookContext['source']) => Math.sqrt(evidenceVariance({ source, units: 1, skill: 50, estimateMean: 50, opponent: null }));
    expect(sd('game_live') / sd('game_film')).toBeCloseTo(25 / 18, 9);
    expect(sd('practice_full') / sd('opponent_film')).toBeCloseTo(28 / 22, 9);
  });
  it('halves a new starter band in about 4 games, 250 snaps (within 20 percent)', () => {
    // Scenario (assumption, README S-03): prior sd 8 (public production), film graded by his position coach
    // (skill 50), and his main attribute used on 60 percent of 250 snaps.
    const USAGE = 0.6;
    let e = priorFor({ positionLevelMean: 50, publicImplied: null, information: 'production', date: D0 });
    const sd0 = Math.sqrt(e.variance);
    for (let g = 0; g < 4; g++) e = update(e, evidenceItem(look({ units: 62.5 * USAGE, date: day(7 * g) }), 50), 26, skill50);
    const ratio = Math.sqrt(e.variance) / sd0;
    expect(ratio).toBeGreaterThanOrEqual(0.5 * 0.8);
    expect(ratio).toBeLessThanOrEqual(0.5 * 1.2);
    // After one game the band has not halved yet: the target is about 4 games, not 1.
    let one = priorFor({ positionLevelMean: 50, publicImplied: null, information: 'production', date: D0 });
    one = update(one, evidenceItem(look({ units: 62.5 * USAGE }), 50), 26, skill50);
    expect(Math.sqrt(one.variance) / sd0).toBeGreaterThan(0.6);
  });
  it('an attribute with no qualifying snaps keeps its prior variance', () => {
    const e = priorFor({ positionLevelMean: 50, publicImplied: null, information: 'none', date: D0 });
    expect(updateAll(e, [], 25, skill50).variance).toBe(144);
  });
});

describe('D6.4.3 evaluator bias and the floor', () => {
  it('one evaluator of skill 50 never goes below a half-width of 4.5 ISS', () => {
    let e = priorFor({ positionLevelMean: 50, publicImplied: null, information: 'established_starter', date: D0 });
    for (let g = 0; g < 100; g++) e = update(e, evidenceItem(look({ units: 500, date: day(g % 300) }), 50), 26, skill50);
    expect(floorSd([COACH], skill50)).toBeCloseTo(3.5, 9);
    expect(halfWidth(e.variance)).toBeCloseTo(1.28 * 3.5, 9);
    expect(halfWidth(e.variance)).toBeGreaterThanOrEqual(4.48 - 1e-9);
  });
  it('a second independent evaluator narrows it; a second evaluator on the same line does not', () => {
    const run = (second: Contributor) => {
      let e = priorFor({ positionLevelMean: 50, publicImplied: null, information: 'established_starter', date: D0 });
      for (let g = 0; g < 50; g++) {
        e = update(e, evidenceItem(look({ units: 500 }), 50), 26, skill50);
        e = update(e, evidenceItem(look({ units: 500, evaluator: second }), 50), 26, skill50);
      }
      return halfWidth(e.variance);
    };
    const independent = run(SCOUT);
    const sameLine = run({ id: 12, line: 'offense' });
    expect(independent).toBeLessThan(sameLine);
    expect(independent).toBeCloseTo(1.28 * 3.5 / Math.SQRT2, 9);
    expect(floorSd([COACH, SCOUT, { id: 31, line: 'x' }, { id: 41, line: 'y' }], () => 100)).toBe(p('floor.minimum'));
  });
  it('the user grade enters with exactly the value given and the median evaluator weight for every user', () => {
    const userA = userGradeItem({ ...look(), evaluator: { id: 1, line: 'user' } }, 63.7);
    const userB = userGradeItem({ ...look(), evaluator: { id: 2, line: 'user' } }, 41.2);
    expect(userA.value).toBe(63.7);
    expect(userB.value).toBe(41.2);
    expect(userA.variance).toBe(userB.variance);
    expect(userA.variance).toBe(evidenceVariance({ source: 'game_film', units: 1, skill: p('skill.userTerm'), estimateMean: 50, opponent: null }));
  });
  it('the floor keeps bands honest for biased evaluators: coverage well above the noise-only band', () => {
    // Evaluator leniency does not average out (D6.4.3). Compare the shown band with a band built from noise
    // alone on the same population: the floor must recover most of the lost coverage.
    const r = rng(99, 'biased');
    let shown = 0;
    let noiseOnly = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const truth = 50 + r.normal() * 10;
      const lean = { leniency: r.normal() * p('bias.leniencySd'), playerOffset: 0, schemeOffset: 0 };
      let e = priorFor({ positionLevelMean: 50, publicImplied: null, information: 'none', date: D0 });
      for (let g = 0; g < 8; g++) e = update(e, observe(truth, look({ units: 60, date: day(g), estimateMean: e.mean }), lean, r), 26, skill50);
      if (Math.abs(truth - e.mean) <= halfWidth(e.variance)) shown++;
      if (Math.abs(truth - e.mean) <= halfWidth(e.noiseVariance)) noiseOnly++;
    }
    expect(shown / n).toBeGreaterThan(noiseOnly / n + 0.1);
    expect(shown / n).toBeGreaterThan(0.7);
  });
});

describe('D6.4.4 aging of evidence', () => {
  it('adds (yearly drift sd)^2 x years by age band, and once for a major injury', () => {
    const e = makePrior(50, 5, D0);
    expect(ageTo(e, { seasonYear: 2031, dayIndex: 100 }, 21).variance).toBeCloseTo(25 + 16, 9);
    expect(ageTo(e, { seasonYear: 2032, dayIndex: 100 }, 26).variance).toBeCloseTo(25 + 8, 9);
    expect(ageTo(e, { seasonYear: 2031, dayIndex: 100 }, 31).variance).toBeCloseTo(25 + 9, 9);
    expect(ageTo(e, { seasonYear: 2031, dayIndex: 100 }, 31, true).variance).toBe(25);
    expect(widenForMajorInjury(e).variance).toBeCloseTo(50, 9);
    // Drift is not applied twice for the same span.
    const once = ageTo(e, { seasonYear: 2031, dayIndex: 100 }, 26);
    expect(ageTo(once, { seasonYear: 2031, dayIndex: 100 }, 26).variance).toBe(once.variance);
  });
  it('keeps 80 percent coverage for players unseen 1, 2 and 3 years', () => {
    for (const years of [1, 2, 3]) {
      const c = coverage(4000, (r) => {
        const age = 21 + Math.floor(r.uniform() * 12);
        let truth = 45 + r.normal() * 12;
        let e = priorFor({ positionLevelMean: 45, publicImplied: null, information: 'none', date: D0 });
        e = update(e, observe(truth, look({ units: 30, date: D0 }), NO_LEAN, r), age, skill50);
        // True values change at the D6.4.4 drift rate (sized to D7 and D8), year by year.
        let a = age;
        for (let y = 0; y < years; y++) {
          const sd = a < 23 ? 4 : a >= 30 ? 3 : 2;
          truth += r.normal() * sd;
          e = ageTo(e, { seasonYear: D0.seasonYear + y + 1, dayIndex: D0.dayIndex }, a);
          a++;
        }
        return { truth, e };
      }, 50 + years);
      expect(c, `unseen ${years} years`).toBeGreaterThanOrEqual(0.76);
      expect(c, `unseen ${years} years`).toBeLessThanOrEqual(0.84);
    }
  });
});

describe('D6.4.5 one scale and the competition discount', () => {
  it('cuts information above opponent + 10: variance x 1 + ((est - opp - 10)/10)^2 for a full-skill evaluator', () => {
    expect(opponentVarianceMultiplier(50, 45, 100)).toBe(1);
    expect(opponentVarianceMultiplier(50, 30, 100)).toBeCloseTo(2, 9);
    expect(opponentVarianceMultiplier(50, 20, 100)).toBeCloseTo(5, 9);
    expect(opponentVarianceMultiplier(50, 20, 50)).toBeCloseTo(3, 9);
    expect(opponentVarianceMultiplier(50, null, 100)).toBe(1);
  });
  it('evidence against weak opposition narrows the band less than the same evidence against peers', () => {
    const run = (opponent: number) => {
      let e = makePrior(50, 12, D0);
      for (let g = 0; g < 10; g++) e = update(e, evidenceItem(look({ units: 30, opponent, estimateMean: e.mean }), 50), 21, skill50);
      return e.variance;
    };
    expect(run(25)).toBeGreaterThan(run(48));
  });
  it('low-skill staff overrate a player from a weak schedule; strong staff much less', () => {
    const meanError = (skill: number) => {
      const r = rng(5);
      let err = 0;
      const n = 400;
      for (let i = 0; i < n; i++) {
        const truth = 45 + r.normal() * 5;
        let e = makePrior(35, 12, D0);
        for (let g = 0; g < 12; g++) e = update(e, observe(truth, look({ units: 40, skill, opponent: 20, date: day(g), estimateMean: e.mean }), NO_LEAN, r), 21, () => skill);
        err += e.mean - truth;
      }
      return err / n;
    };
    const weakStaff = meanError(30);
    const strongStaff = meanError(85);
    expect(weakStaff).toBeGreaterThan(1);
    expect(weakStaff).toBeGreaterThan(strongStaff + 1);
  });
});

describe('parameter file', () => {
  it('every row is inside its own range and names a leaf', () => {
    for (const row of PARAMS.params) {
      expect(row.value, row.name).toBeGreaterThanOrEqual(row.min);
      expect(row.value, row.name).toBeLessThanOrEqual(row.max);
      expect(row.leaf).toMatch(/^[A-Z]\d/);
    }
    expect(() => p('no.such')).toThrow();
  });
});
