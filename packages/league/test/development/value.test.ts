// Whole-player value (value.ts) and the fitted D8.2.1 curve: speed counts, and the prime runs past 25.
import { describe, expect, it } from 'vitest';
import { TABLES, adultTestKey, speedTerm, wholePlayerValue, workedMean, CURVE_GROUP } from '../../src/development/index.ts';
import { N, makePlayer, rng } from './helpers.ts';

describe('whole-player value', () => {
  const p = makePlayer(rng(3, 'value'), { family: 'WR', ageYears: 27, ceilingMean: 50, gapMean: 5 });
  const adult = p.tests.fortyS;
  const withAdult = { ...p, hidden: { ...p.hidden, [adultTestKey('fortyS')]: adult } };

  it('is the worked mean at the adult forty', () => {
    expect(speedTerm(N, withAdult, 'WR')).toBeCloseTo(0, 9);
    expect(wholePlayerValue(N, withAdult, 'WR')).toBeCloseTo(workedMean(withAdult, 'WR'), 9);
  });

  it('counts one combine standard deviation of forty as 10 ISS', () => {
    const sdPct = TABLES.speedValue.fortySdPercent['WR']!;
    const slower = { ...withAdult, tests: { ...withAdult.tests, fortyS: adult * (1 + sdPct / 100) } };
    expect(speedTerm(N, slower, 'WR')).toBeCloseTo(-10, 6);
  });

  it('gives specialists a quarter of the speed term', () => {
    const k = makePlayer(rng(3, 'k'), { family: 'K', ageYears: 30, ceilingMean: 50, gapMean: 5 });
    const sdPct = TABLES.speedValue.fortySdPercent['K']!;
    const base = { ...k, hidden: { ...k.hidden, [adultTestKey('fortyS')]: k.tests.fortyS } };
    const slow = { ...base, tests: { ...base.tests, fortyS: base.tests.fortyS * (1 + sdPct / 100) } };
    expect(speedTerm(N, slow, 'K')).toBeCloseTo(-10 * TABLES.speedValue.weight['K']!, 6);
  });
});

describe('fitted curve', () => {
  it('ends every prime after 25, the skill positions near 28 and quarterbacks in the thirties', () => {
    const pe = TABLES.curves.primeEnd;
    for (const g of new Set(Object.values(CURVE_GROUP))) expect(pe[g]!).toBeGreaterThan(25);
    expect(pe['RB']!).toBeLessThanOrEqual(pe['QB']!);
    expect(pe['QB']!).toBeGreaterThanOrEqual(31);
  });
});
