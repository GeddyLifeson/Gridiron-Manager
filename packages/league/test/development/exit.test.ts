// D8.4.1 exits and D8.5.1 outlook.
import { describe, expect, it } from 'vitest';
import { retirementChance, retireShare, measuredExitRate, midSeasonRetirementChance, comebackChance, agingOutlook } from '../../src/development/index.ts';
import { MATH, N } from './helpers.ts';
import { PROB_FLOOR } from '@gm/schema';

const base = { family: 'RB' as const, ageYears: 30, majorInjuryLastYear: false, lostStartingJob: false, contenderWantsHim: false, facets: {} };

describe('D8.4.1 exit hazard', () => {
  it('reads the measured table, interpolates between ages, and skips n/a cells', () => {
    expect(measuredExitRate(N, 'RB', 30)).toBeCloseTo(0.26, 9);
    expect(measuredExitRate(N, 'RB', 31)).toBeCloseTo(0.295, 9);
    expect(measuredExitRate(N, 'CB', 36)).toBeCloseTo(0.25, 9);
    expect(measuredExitRate(N, 'EDGE', 32)).toBeCloseTo(0.28, 9);
  });
  it('choosing to retire is 0 at 27 and about one third of the total exit rate from 30', () => {
    expect(retireShare(N, 27)).toBe(0);
    expect(retireShare(N, 30)).toBeCloseTo(1 / 3, 3);
    expect(retirementChance(N, { ...base, ageYears: 26 })).toBe(PROB_FLOOR);
    expect(retirementChance(N, base)).toBeCloseTo(0.26 / 3, 3);
  });
  it('modifiers: major injury x2, lost starting job x1.5, contender x0.6, high competitiveness x0.7, love of football x1.3 to x0.7', () => {
    const b = retirementChance(N, base);
    expect(retirementChance(N, { ...base, majorInjuryLastYear: true }) / b).toBeCloseTo(2, 9);
    expect(retirementChance(N, { ...base, lostStartingJob: true }) / b).toBeCloseTo(1.5, 9);
    expect(retirementChance(N, { ...base, contenderWantsHim: true }) / b).toBeCloseTo(0.6, 9);
    expect(retirementChance(N, { ...base, facets: { competitiveness: 90 } }) / b).toBeCloseTo(0.7, 9);
    expect(retirementChance(N, { ...base, facets: { love_of_football: 0 } }) / b).toBeCloseTo(1.3, 9);
    expect(retirementChance(N, { ...base, facets: { love_of_football: 100 } }) / b).toBeCloseTo(0.7, 9);
    expect(midSeasonRetirementChance(N, base) / b).toBeCloseTo(0.25, 9);
    expect(comebackChance(N, 33, true)).toBeCloseTo(0.03, 9);
    expect(comebackChance(N, 35, true)).toBe(PROB_FLOOR);
    expect(comebackChance(N, 30, false)).toBe(PROB_FLOOR);
  });
});

describe('D8.5.1 aging outlook', () => {
  it('rises with age and position risk and reads no hidden trait', () => {
    const young = agingOutlook(N, MATH, { family: 'RB', estimatedAgeNext: 24, observedTrendPercent: null, trendSdPoints: 1 });
    const old = agingOutlook(N, MATH, { family: 'RB', estimatedAgeNext: 34, observedTrendPercent: null, trendSdPoints: 1 });
    const qb = agingOutlook(N, MATH, { family: 'QB', estimatedAgeNext: 34, observedTrendPercent: null, trendSdPoints: 1 });
    expect(young.label).toBe('low');
    expect(old.chance).toBeGreaterThan(young.chance);
    expect(old.chance).toBeGreaterThan(qb.chance);
    const none = agingOutlook(N, MATH, { family: 'WR', estimatedAgeNext: 31, observedTrendPercent: null, trendSdPoints: 0.2 });
    const falling = agingOutlook(N, MATH, { family: 'WR', estimatedAgeNext: 31, observedTrendPercent: -5, trendSdPoints: 0.2 });
    const fallingPoorStaff = agingOutlook(N, MATH, { family: 'WR', estimatedAgeNext: 31, observedTrendPercent: -5, trendSdPoints: 3 });
    expect(falling.chance).toBeGreaterThan(fallingPoorStaff.chance);
    expect(fallingPoorStaff.chance).toBeGreaterThan(none.chance);
    expect(falling.label).toBe('high');
  });
});
