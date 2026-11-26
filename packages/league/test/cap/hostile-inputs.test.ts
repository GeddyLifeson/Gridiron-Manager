// Regressions from the break test (plans/break-test-report.md #6 to #8): history years, ended contracts and
// money that is not whole cents.
import { describe, expect, it } from 'vitest';
import { extend, minimumSalary, payCut, plainYear, releaseCharges, restructure, type CapContract } from '../../src/cap/index.ts';
import { M, capRules } from './fixtures.ts';

const rules = capRules();
const deal = (): CapContract => ({ id: 1, form: 'veteran' as CapContract['form'], years: [plainYear(2026, M(10)), plainYear(2027, M(10))], tranches: [], offset: false });

describe('cap module against hostile inputs', () => {
  it('a history year uses the first minimum-salary table instead of throwing', () => {
    expect(minimumSalary(rules, 1996, 3)).toBe(minimumSalary(rules, 2026, 3));
    expect(minimumSalary(rules, 1869, 0)).toBe(minimumSalary(rules, 2026, 0));
  });
  it('an extension signed after the contract ended is refused', () => {
    expect(extend(deal(), 2028, [plainYear(2028, M(5))], M(1)).ok).toBe(false);
    expect(extend(deal(), 2027, [plainYear(2028, M(5))], M(1)).ok).toBe(true);
  });
  it('money that is not whole non-negative cents is refused everywhere', () => {
    for (const bad of [NaN, Infinity, -1, 0.5]) {
      expect(restructure(deal(), 2026, bad, 5, rules).ok).toBe(false);
      expect(extend(deal(), 2026, [plainYear(2028, M(5))], bad).ok).toBe(false);
      expect(extend(deal(), 2026, [plainYear(2028, bad)], 0).ok).toBe(false);
      expect(payCut(deal(), 2026, new Map([[2026, bad]]), 5, rules).ok).toBe(false);
      const rel = { leagueYear: 2026, timing: 'after_june1' as const, reason: 'skill' as const, june1Designation: false, designationsUsed: 0 };
      expect(releaseCharges(deal(), { ...rel, basePaidCents: bad, earnedThisYearCents: 0 }, rules).ok).toBe(false);
      expect(releaseCharges(deal(), { ...rel, basePaidCents: 0, earnedThisYearCents: bad }, rules).ok).toBe(false);
    }
  });
});
