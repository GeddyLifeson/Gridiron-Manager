// D6.2.1, D6.2.2, D6.1.2, D6.5.1 and P3.2.3 storage tests.
import { describe, expect, it } from 'vitest';
import { PersonView } from '@gm/schema';
import {
  ceilingLookVariance, COLOR_TIER_SCALE, confidenceOf, DECIMAL_SCALE, DEFAULT_SCALE_ID, formatForty, formatGrade, formatHeight,
  fromBelief, grade, gradeCells, legendFor, LETTER_SCALE, makePrior, parseScale, project, projectionLookSd, RAW_SCALE,
  relativeIss, roleGrade, scaleById, SHIPPED_SCALES, toBelief, toPersonView, TWENTY_EIGHTY_SCALE, update, varianceOf,
  type Estimate,
} from '../../src/scouting/index.ts';

const D0 = { seasonYear: 2030, dayIndex: 100 };
const sdForHalf = (h: number) => (h / 1.28) * (h / 1.28);

describe('D6.2.1 scales', () => {
  it('default is the decimal scale: ISS 40, 50, 60, 80 read 6.0, 6.5, 7.0, 8.0', () => {
    expect(DEFAULT_SCALE_ID).toBe('decimal_5_9');
    expect([40, 50, 60, 80].map((x) => grade(DECIMAL_SCALE, x).text)).toEqual(['6.0', '6.5', '7.0', '8.0']);
  });
  it('limits the decimal scale to 5.0 to 9.0 and marks the cut', () => {
    expect(grade(DECIMAL_SCALE, 10)).toEqual({ value: 5, text: '5.0', cut: 'low' });
    expect(grade(DECIMAL_SCALE, 110)).toEqual({ value: 9, text: '9.0', cut: 'high' });
  });
  it('20 to 80 rounds to 5 and limits; 0 to 100 is ISS as is', () => {
    expect(grade(TWENTY_EIGHTY_SCALE, 52.4).text).toBe('50');
    expect(grade(TWENTY_EIGHTY_SCALE, 53).text).toBe('55');
    expect(grade(TWENTY_EIGHTY_SCALE, 12).text).toBe('20');
    expect(grade(RAW_SCALE, 47.4).text).toBe('47');
  });
  it('color tiers and letters follow the D6.2.1 bands', () => {
    expect([70, 65, 60, 50, 40, 30].map((x) => grade(COLOR_TIER_SCALE, x).text)).toEqual(['Blue', 'Blue', 'Red', 'Purple', 'Orange', 'None']);
    expect(LETTER_SCALE.tiers).toHaveLength(12);
    expect([80, 75, 74, 50, 20, 19].map((x) => grade(LETTER_SCALE, x).text)).toEqual(['A+', 'A+', 'A', 'B-', 'D-', 'F']);
  });
  it('the legend explains bands in words', () => {
    expect(legendFor(DECIMAL_SCALE, 50)).toBe('solid starter');
    expect(legendFor(DECIMAL_SCALE, 40)).toBe('backup who can start in a pinch');
    expect(legendFor(DECIMAL_SCALE, 85)).toBe('rare talent');
    expect(legendFor(DECIMAL_SCALE, 5)).toBe('not a pro player');
    expect(legendFor(LETTER_SCALE, 50)).toBeNull();
  });
  it('a custom scale file loads without a rebuild; a non-monotonic one is rejected', () => {
    const custom = parseScale({
      id: 'stars', name: 'Stars', kind: 'numeric', points: [[0, 0], [40, 1], [70, 5]], min: 0, max: 5, step: 0.5, decimals: 1,
      legend: [{ from: 4, label: 'great' }, { from: 0, label: 'other' }],
    });
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    expect(grade(custom.scale, 55).text).toBe('3.0');
    expect(scaleById('stars', [custom.scale]).id).toBe('stars');
    expect(scaleById('missing').id).toBe(DEFAULT_SCALE_ID);
    const bad = parseScale({ id: 'bad', name: 'Bad', kind: 'numeric', points: [[0, 5], [50, 3], [100, 9]], min: 0, max: 9, step: 1, decimals: 0 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problems.join(' ')).toMatch(/monotonic/);
    const badTiers = parseScale({ id: 'bt', name: 'BT', kind: 'tiers', tiers: [{ minIss: 40, label: 'a' }, { minIss: 60, label: 'b' }], below: 'c' });
    expect(badTiers.ok).toBe(false);
    expect(parseScale('nope').ok).toBe(false);
  });
  it('every shipped scale passes its own file check', () => {
    for (const s of SHIPPED_SCALES) expect(parseScale(JSON.parse(JSON.stringify(s))).ok, s.id).toBe(true);
  });
  it('relative-to-level view uses the same formula with the level starter mean', () => {
    // A college starter at ISS 30 where the level starter mean is 30 reads like a pro starter does at 50.
    expect(grade(DECIMAL_SCALE, relativeIss(30, 30)).text).toBe('6.5');
  });
});

describe('D6.1.1 grade text with a band', () => {
  it('formats "7.1 (6.8 to 7.4)" style text, the band never hidden', () => {
    const g = formatGrade(DECIMAL_SCALE, 62, sdForHalf(6));
    expect(g.text).toBe('7.1 (6.8 to 7.4)');
  });
  it('marks a band cut at the scale limit', () => {
    const g = formatGrade(DECIMAL_SCALE, 22, sdForHalf(10));
    expect(g.text).toBe('5.1 (<5.0 to 5.6)');
  });
  it('shows a projection arrow only on scales that use one', () => {
    expect(formatGrade(COLOR_TIER_SCALE, 60, 4, 'rising').text).toBe('Red ↑ (Red)');
    expect(formatGrade(DECIMAL_SCALE, 60, 4, 'rising').text.includes('↑')).toBe(false);
  });
});

describe('D6.1.2 exact and reported measurables', () => {
  it('draws no band for an exact field and marks a reported test', () => {
    expect(formatForty(4.52, 'exact')).toEqual({ text: '4.52 s', band: null, reported: false });
    const r = formatForty(4.45, 'reported');
    expect(r.reported).toBe(true);
    expect(r.text).toBe('4.45 s (reported)');
    // The organisation reads a school's 4.45 as about 4.50 (D6.1.2 bias of -0.05 s).
    expect((r.band!.low + r.band!.high) / 2).toBeCloseTo(4.5, 9);
    expect(formatHeight(74)).toBe('6-2');
  });
});

describe('switching scale changes no stored data (D6.2.1 acceptance)', () => {
  it('formatting on every scale leaves the stored view byte-identical', () => {
    const view = toPersonView({ observerTeamId: 3, personId: 9, estimates: { pass_set: makePrior(48, 7, D0) } });
    const before = JSON.stringify(view);
    for (const scale of SHIPPED_SCALES) gradeCells(view, { scale, asOf: D0, age: 25 });
    expect(JSON.stringify(view)).toBe(before);
  });
});

describe('D6.2.2 role grade', () => {
  it('is the weighted mean, with the weighted sum of variances', () => {
    const est = { a: { mean: 60, variance: 16 }, b: { mean: 40, variance: 36 } };
    expect(roleGrade(est, { a: 0.75, b: 0.25 })).toEqual({ mean: 55, variance: 21 });
    expect(() => roleGrade(est, { a: 0.5, b: 0.4 })).toThrow(/sum/);
    expect(() => roleGrade(est, { a: 0.5, c: 0.5 })).toThrow(/prior/);
  });
});

describe('D6.5.1 projection', () => {
  const cur = { mean: 30, variance: 64 };
  const ceil = { mean: 45, variance: 100 };
  it('look noise falls from 14 at 17 to 6 by 23', () => {
    expect(projectionLookSd(17)).toBe(14);
    expect(projectionLookSd(20)).toBe(10);
    expect(projectionLookSd(23)).toBe(6);
    expect(ceilingLookVariance(17, 50)).toBeCloseTo((14 * 1.1) * (14 * 1.1), 9);
  });
  it('projects to the ceiling at peak, rises on the arrow, widens 3 ISS sd per level up', () => {
    const peak = project({ current: cur, ceiling: ceil, age: 19, horizon: { kind: 'peak' } })!;
    expect(peak.mean).toBe(45);
    expect(peak.arrow).toBe('rising');
    const up = project({ current: cur, ceiling: ceil, age: 19, horizon: { kind: 'peak' }, levelsUp: 1 })!;
    expect(Math.sqrt(up.variance)).toBeCloseTo(Math.sqrt(peak.variance) + 3, 9);
    const two = project({ current: cur, ceiling: ceil, age: 21, horizon: { kind: 'years', years: 2 } })!;
    expect(two.mean).toBeCloseTo(30 + 15 * (2 / 6), 9);
  });
  it('steady inside 3 ISS, never projects decline from a low ceiling read, and none past 28', () => {
    expect(project({ current: cur, ceiling: { mean: 32, variance: 50 }, age: 22, horizon: { kind: 'peak' } })!.arrow).toBe('steady');
    expect(project({ current: cur, ceiling: { mean: 20, variance: 50 }, age: 22, horizon: { kind: 'peak' } })!.mean).toBe(30);
    expect(project({ current: cur, ceiling: ceil, age: 29, horizon: { kind: 'peak' } })).toBeNull();
  });
  it('one look at 17 by an average staff correlates 0.45 to 0.65 with the true ceiling; a strong staff higher', async () => {
    const { stream, seedFromNumber } = await import('@gm/engine-core');
    const corr = (skill: number) => {
      const r = stream(seedFromNumber(17), 'projection', [skill]);
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < 4000; i++) {
        const trueCeil = 35 + r.normal() * 12;
        let e: Estimate = makePrior(35, 12, D0);
        const v = ceilingLookVariance(17, skill);
        e = update(e, { attribute: 'ceiling', value: trueCeil + r.normal() * Math.sqrt(v), variance: v, units: 1, date: D0, evaluator: { id: 1, line: 's' } }, 17, () => skill);
        xs.push(project({ current: { mean: 20, variance: 64 }, ceiling: e, age: 17, horizon: { kind: 'peak' } })!.mean);
        ys.push(trueCeil);
      }
      const m = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      const mx = m(xs); const my = m(ys);
      let sxy = 0; let sxx = 0; let syy = 0;
      for (let i = 0; i < xs.length; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) * (xs[i]! - mx); syy += (ys[i]! - my) * (ys[i]! - my); }
      return sxy / Math.sqrt(sxx * syy);
    };
    const avg = corr(50);
    expect(avg).toBeGreaterThanOrEqual(0.45);
    expect(avg).toBeLessThanOrEqual(0.65);
    expect(corr(85)).toBeGreaterThan(avg);
  });
});

describe('P3.2.3 storage in PersonView', () => {
  it('confidence encodes variance invertibly; the no-information prior reads 0.5', () => {
    expect(confidenceOf(144)).toBe(0.5);
    for (const v of [1, 12.25, 64, 400]) expect(varianceOf(confidenceOf(v))).toBeCloseTo(v, 9);
  });
  it('round trips an estimate and validates against the world contract', () => {
    const e = update(makePrior(40, 12, D0), { attribute: 'anchor', value: 50, variance: 50, units: 30, date: D0, evaluator: { id: 7, line: 'ol' } }, 25, () => 60);
    const back = fromBelief(toBelief(e), e.contributors);
    expect(back.mean).toBeCloseTo(e.mean, 9);
    expect(back.variance).toBeCloseTo(e.variance, 9);
    expect(back.evidenceCount).toBe(30);
    const view = toPersonView({ observerTeamId: 3, personId: 9, estimates: { anchor: e } });
    expect(PersonView.safeParse(view).success).toBe(true);
    expect(view.sourceStaffIds).toEqual([7]);
  });
});
