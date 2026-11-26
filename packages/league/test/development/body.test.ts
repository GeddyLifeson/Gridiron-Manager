// D8.1.1 and T8.1.1 growth; D8.2.1 curves; D8.3.1 order of loss; D8.3.2 injury losses.
import { describe, expect, it } from 'vitest';
import type { PlayingBlock } from '@gm/schema';
import {
  rollover, curvePercent, applyInjuryLoss, HIDDEN, hiddenNum, growthShares, POSITION_FAMILIES, issPerPercent, num, developYear, defaultYearPlan,
  type PositionFamily,
} from '../../src/development/index.ts';
import { MATH, N, makePlayer, meanOf, rng } from './helpers.ts';

/** Age a player from `from` to `to` (exclusive) through yearly rollovers only. */
function ageThrough(p: PlayingBlock, family: PositionFamily, from: number, to: number, seed: number): PlayingBlock[] {
  const out = [p];
  let q = p;
  for (let a = from + 1; a <= to; a++) { q = rollover(N, { position: family, ageYears: a, playing: q, facets: {} }, rng(seed, 'roll', a)); out.push(q); }
  return out;
}

describe('D8.1.1 growth 14 to 23', () => {
  it('a class aged from 14 to 23 with average programs reaches adult values within 1 percent', () => {
    for (const f of ['OL', 'WR', 'QB'] as const) {
      const young = makePlayer(rng(10, f), { family: f, ageYears: 14, neutral: true });
      const adultH = hiddenNum(young, HIDDEN.adultHeightIn, 0);
      const adultW = hiddenNum(young, HIDDEN.adultWeightLb, 0);
      const start = { ...young, heightIn: adultH * growthShares(N, 14, f).height, weightLb: adultW * growthShares(N, 14, f).weight };
      const last = ageThrough(start, f, 14, 23, 10).at(-1)!;
      expect(Math.abs(last.heightIn / adultH - 1)).toBeLessThan(0.01);
      expect(Math.abs(last.weightLb / adultW - 1)).toBeLessThan(0.01);
    }
  });
  it('mean weight gain from 18 to 22 falls within 4 to 7 percent (D8.1.1, T8.1.1)', () => {
    const gains: number[] = [];
    for (const f of POSITION_FAMILIES) {
      const sh18 = growthShares(N, 18, f).weight;
      gains.push(growthShares(N, 22, f).weight / sh18 - 1);
    }
    const m = meanOf(gains);
    expect(m).toBeGreaterThanOrEqual(0.04);
    expect(m).toBeLessThanOrEqual(0.07);
  });
  it('four-year strength gains: linemen about 18 percent, receivers and backs about 34 (T8.1.1, within 20 percent)', () => {
    const g = (f: PositionFamily) => growthShares(N, 22, f).strength / growthShares(N, 18, f).strength - 1;
    expect(Math.abs(g('OL') / 0.18 - 1)).toBeLessThan(0.2);
    expect(Math.abs(g('DL') / 0.18 - 1)).toBeLessThan(0.2);
    expect(Math.abs(g('WR') / 0.34 - 1)).toBeLessThan(0.2);
    expect(Math.abs(g('CB') / 0.34 - 1)).toBeLessThan(0.2);
    // Front-loaded: about 60 percent in years 1 and 2.
    const s18 = growthShares(N, 18, 'WR').strength, s20 = growthShares(N, 20, 'WR').strength, s22 = growthShares(N, 22, 'WR').strength;
    expect((s20 - s18) / (s22 - s18)).toBeCloseTo(0.6, 6);
  });
  it('mean change in 40-yard time across a college career is under 0.05 s (T8.1.1)', () => {
    const d: number[] = [];
    for (let i = 0; i < 60; i++) {
      const f = POSITION_FAMILIES[i % POSITION_FAMILIES.length]!;
      const p = makePlayer(rng(11, i), { family: f, ageYears: 18 });
      const path = ageThrough(p, f, 18, 22, 11 + i);
      d.push(p.tests.fortyS - path.at(-1)!.tests.fortyS);
    }
    expect(meanOf(d)).toBeGreaterThanOrEqual(0);
    expect(meanOf(d)).toBeLessThan(0.05);
  });
});

describe('D8.2.1 prime and decline by position', () => {
  it('the cohort mean yearly change of the physical index matches the curve table per band', () => {
    const bands = [24, 26, 28, 30, 32, 34, 36];
    for (const f of ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'K'] as const) {
      for (const age of bands) {
        const d: number[] = [];
        for (let i = 0; i < 300; i++) {
          const p = makePlayer(rng(12, f, age, i), { family: f, ageYears: age - 1 });
          const q = developYear(N, MATH, { position: f, ageYears: age, playing: p, facets: {} }, defaultYearPlan(N, 'starter'), (k) => rng(12, 'y', f, age, i, k));
          d.push((hiddenNum(q, HIDDEN.agingIndex, 1) / hiddenNum(p, HIDDEN.agingIndex, 1) - 1) * 100);
        }
        const expected = curvePercent(N, f, age);
        // Mean trait 1, noise sd 0.4: standard error about 0.03 points with 300 players, plus trait spread.
        expect(Math.abs(meanOf(d) - expected), `${f} ${age}`).toBeLessThan(0.06 + 0.25 * Math.abs(expected) / Math.sqrt(300) * 3);
      }
    }
  });
  it('shape: no decline before 26; running backs fall first and fastest; kickers last (D8.2.1 cross-checks)', () => {
    for (const f of POSITION_FAMILIES) expect(curvePercent(N, f, 24)).toBe(0);
    for (const age of [27, 29, 31, 33]) {
      expect(curvePercent(N, 'RB', age)).toBeLessThan(curvePercent(N, 'WR', age));
      expect(curvePercent(N, 'QB', age)).toBeGreaterThan(curvePercent(N, 'WR', age));
      expect(curvePercent(N, 'K', age)).toBeGreaterThanOrEqual(curvePercent(N, 'QB', age));
    }
  });
  it('a heavy-load season adds 0.1 to next year\'s multiplier', () => {
    const p = makePlayer(rng(13, 'h'), { family: 'RB', ageYears: 29, neutral: true });
    const a = rollover(N, { position: 'RB', ageYears: 30, playing: p, facets: {} }, rng(13, 'r'), false);
    const b = rollover(N, { position: 'RB', ageYears: 30, playing: p, facets: {} }, rng(13, 'r'), true);
    const da = hiddenNum(a, HIDDEN.agingYearDelta, 0), db = hiddenNum(b, HIDDEN.agingYearDelta, 0);
    expect(db - da).toBeCloseTo(curvePercent(N, 'RB', 30) * 0.1, 9);
  });
});

describe('D8.3.1 how decline shows', () => {
  it('speed and burst go before strength; technique and mind do not decline by age', () => {
    const p = makePlayer(rng(14, 'w'), { family: 'WR', ageYears: 29, neutral: true });
    const path = ageThrough(p, 'WR', 29, 33, 14);
    const last = path.at(-1)!;
    const fortyPct = last.tests.fortyS / p.tests.fortyS - 1;
    const strengthPct = (p.attributes.play_strength! - last.attributes.play_strength!) / (issPerPercent(N, 'play_strength') * 100);
    expect(fortyPct).toBeGreaterThan(0);
    expect(fortyPct).toBeGreaterThan(strengthPct);
    expect(last.attributes.route_running_short).toBe(p.attributes.route_running_short);
    expect(last.attributes.play_recognition).toBe(p.attributes.play_recognition);
  });
  it('a quarterback\'s mobility fades while his accuracy holds (D8.3.1 acceptance, ability side)', () => {
    const p = makePlayer(rng(15, 'q'), { family: 'QB', ageYears: 27, neutral: true });
    const last = ageThrough(p, 'QB', 27, 31, 15).at(-1)!;
    expect(last.attributes.scramble_and_run_skill!).toBeLessThan(p.attributes.scramble_and_run_skill!);
    expect(last.attributes.accuracy_intermediate).toBe(p.attributes.accuracy_intermediate);
  });
  it('removing decline (all curves zero) leaves a veteran\'s speed flat apart from noise', () => {
    const flat = { ...N.tables, curves: { ...N.tables.curves, groups: Object.fromEntries(Object.keys(N.tables.curves.groups).map((k) => [k, [0, 0, 0, 0, 0, 0, 0]])) } };
    const n0 = { params: N.params, tables: flat };
    const d: number[] = [];
    for (let i = 0; i < 100; i++) {
      const p = makePlayer(rng(16, i), { family: 'RB', ageYears: 31 });
      const q = rollover(n0, { position: 'RB', ageYears: 32, playing: p, facets: {} }, rng(16, 'r', i));
      d.push(q.tests.fortyS / p.tests.fortyS - 1);
    }
    expect(Math.abs(meanOf(d))).toBeLessThan(0.002);
  });
});

describe('D8.3.2 injury losses', () => {
  it('the same tear costs more at 31 than at 24, and a repeat to the same joint costs 1.3 times more', () => {
    const p = makePlayer(rng(17, 'i'), { family: 'RB', ageYears: 24, neutral: true });
    const young = 1 - hiddenNum(applyInjuryLoss(N, p, 24, 5, false), HIDDEN.agingIndex, 1);
    const old = 1 - hiddenNum(applyInjuryLoss(N, p, 31, 5, false), HIDDEN.agingIndex, 1);
    const repeat = 1 - hiddenNum(applyInjuryLoss(N, p, 31, 5, true), HIDDEN.agingIndex, 1);
    expect(old / young).toBeCloseTo(1.4 / 0.7, 9);
    expect(repeat / old).toBeCloseTo(num(N, 'injury.sameJointMultiplier'), 9);
  });
});
