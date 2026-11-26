import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RULE_KEYS, academicYearSuffix, collegeRules, revenueShareCapFor, PARAMS, pow2 } from '../../src/college/index.ts';
import { FIXTURE, RULES, ruleSet } from './helpers.ts';

const g10 = JSON.parse(readFileSync(fileURLToPath(new URL('../../../rules-data/data/league/collegeleague_2026.json', import.meta.url)), 'utf8')) as { values: { key: string; value: unknown; factId: string }[] };

describe('college rule keys (every value read by key)', () => {
  it('every key read is declared in RULE_KEYS', () => {
    const declared = new Set(RULE_KEYS.map((k) => k.key));
    for (const k of RULES.keysRead) expect(declared.has(k), k).toBe(true);
  });

  it('the fixture cites G-10 rows with the same value wherever G-10 already has the key', () => {
    for (const row of g10.values) {
      const f = FIXTURE.values[row.key];
      if (!f) continue;
      expect(f[0], row.key).toEqual(row.value);
      expect(f[1], row.key).toBe(row.factId);
    }
  });

  it('every declared key has a fixture value, so tests exercise each one', () => {
    for (const k of RULE_KEYS) expect(FIXTURE.values[k.key], k.key).toBeDefined();
  });

  it('groups switch off when their keys are absent (no level test)', () => {
    const r = collegeRules(ruleSet({ 'academic.term_min_hours': undefined, 'transfer.coach_change_window_days': undefined, 'draft.min_years_from_high_school': undefined, 'pay.nil_report_threshold_usd': undefined }));
    expect(r.academic).toBeNull(); expect(r.transfer).toBeNull(); expect(r.draft).toBeNull(); expect(r.pay).toBeNull();
  });

  it('an unknown eligibility model is refused', () => {
    expect(() => collegeRules(ruleSet({ 'eligibility.model': 'made_up' }))).toThrow(/eligibility.model/);
  });
});

describe('revenue-sharing cap by year (T7.1.1)', () => {
  it('suffix names the academic year', () => {
    expect(academicYearSuffix(2026)).toBe('2026_27');
    expect(academicYearSuffix(2099)).toBe('2099_00');
    expect(academicYearSuffix(2008)).toBe('2008_09');
  });
  it('2026-27 reads 21.3 million; 2025-26 reads 20.5 million', () => {
    expect(revenueShareCapFor(ruleSet(), 2026)).toBe(21300000);
    expect(revenueShareCapFor(ruleSet(), 2025)).toBe(20500000);
    expect(RULES.pay!.revenueShareCap).toBe(21300000);
  });
  it('a year with no key grows the latest by the growth key', () => {
    expect(revenueShareCapFor(ruleSet(), 2027)).toBe(Math.round(21300000 * 1.04));
    expect(revenueShareCapFor(ruleSet(), 2028)).toBe(Math.round(21300000 * 1.04 * 1.04));
  });
  it('rule sets before 2025 have no school pool', () => {
    expect(revenueShareCapFor(ruleSet(), 2024)).toBe(0);
  });
  it('scholarship cost counts toward the cap in 2025-26 and not from 2026-27', () => {
    expect(collegeRules(ruleSet({}, 2025)).pay!.scholarshipCredit).toBe(2500000);
    expect(RULES.pay!.scholarshipCredit).toBe(0);
  });
});

describe('params and arithmetic', () => {
  it('every parameter names a leaf and a test', () => {
    for (const p of PARAMS.params) {
      expect(p.leaf).toMatch(/^T\d/);
      expect(p.constrainedBy).toMatch(/Test "/);
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
    }
  });
  it('pow2 matches the platform within 1e-12 across the range used', () => {
    for (let x = -6; x <= 6; x += 0.137) expect(Math.abs(pow2(x) - 2 ** x) / 2 ** x).toBeLessThan(1e-12);
    expect(pow2(0)).toBe(1); expect(pow2(1)).toBe(2); expect(pow2(-1)).toBe(0.5);
  });
});
