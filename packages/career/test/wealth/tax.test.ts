// E6.2.1 and E6.2.2 acceptance. Expected federal tax is worked from the Rev. Proc. 2025-32 tables in their
// own "base amount plus rate on the excess" form, independently of the engine's bracket loop.
import { describe, expect, it } from 'vitest';
import tablesJson from '../../src/wealth/tables.json' with { type: 'json' };
import { loadTaxTable, loadStateProfiles, yearTax, takeHome, progressive, stateTaxByDays, stateTaxWorkAndResidence, indexTaxTable, ltcgTax, dollars, type FilingStatus, type StateProfile } from '../../src/wealth/index.ts';

const T = loadTaxTable();
const S = loadStateProfiles();
const st = (id: string) => S.get(id)! as StateProfile;

// Rev. Proc. 2025-32 section 4.01, Tables 1 and 3: [over, base tax, rate].
const REV_PROC: Record<FilingStatus, [number, number, number][]> = {
  single: [[0, 0, 0.10], [12400, 1240, 0.12], [50400, 5800, 0.22], [105700, 17966, 0.24], [201775, 41024, 0.32], [256225, 58448, 0.35], [640600, 192979.25, 0.37]],
  married_joint: [[0, 0, 0.10], [24800, 2480, 0.12], [100800, 11600, 0.22], [211400, 35932, 0.24], [403550, 82048, 0.32], [512450, 116896, 0.35], [768700, 206583.50, 0.37]],
};
function handTax(status: FilingStatus, taxable: number): number {
  const rows = REV_PROC[status];
  let row = rows[0]!;
  for (const r of rows) if (taxable > r[0]) row = r;
  return row[1] + (taxable - row[0]) * row[2];
}
const STD: Record<FilingStatus, number> = { single: 16100, married_joint: 32200 };

describe('E6.2.1 federal tax engine', () => {
  const salaries = [9600, 18000, 28500, 45000, 69500, 85000, 120000, 150000, 210000, 260000, 350000, 455000, 640000, 800000, 1_000_000, 1_500_000, 2_500_000, 6_000_000, 13_283_000, 20_000_000];
  it('20 test incomes match hand calculation from the loaded table to the dollar (acceptance 1)', () => {
    expect(salaries.length).toBe(20);
    for (const status of ['single', 'married_joint'] as const) for (const s of salaries) {
      const got = yearTax(T, status, { wagesCents: dollars(s) }).federalIncomeCents / 100;
      const want = handTax(status, Math.max(0, s - STD[status]));
      expect(Math.abs(got - want), `${status} ${s}`).toBeLessThan(1);
    }
  });
  it('replacing the table file changes results with no code change (acceptance 2)', () => {
    const swapped = { ...tablesJson, federal: { ...tablesJson.federal, single: tablesJson.federal.married_joint } };
    const t2 = loadTaxTable(swapped);
    const a = yearTax(T, 'single', { wagesCents: dollars(300000) }).federalIncomeCents;
    const b = yearTax(t2, 'single', { wagesCents: dollars(300000) }).federalIncomeCents;
    expect(b).toBeLessThan(a);
  });
  it('payroll: OASDI stops at the wage base, Medicare on all wages, 0.9% above the filing threshold', () => {
    const y = yearTax(T, 'single', { wagesCents: dollars(500000) });
    expect(y.oasdiCents).toBe(dollars(184500 * 0.062));
    expect(y.medicareCents).toBe(dollars(500000 * 0.0145));
    expect(y.additionalMedicareCents).toBe(dollars(300000 * 0.009));
    const j = yearTax(T, 'married_joint', { wagesCents: dollars(500000) });
    expect(j.additionalMedicareCents).toBe(dollars(250000 * 0.009));
    const low = yearTax(T, 'single', { wagesCents: dollars(100000) });
    expect(low.oasdiCents).toBe(dollars(6200));
    expect(low.additionalMedicareCents).toBe(0);
  });
  it('retirement contributions reduce taxable income up to the 2026 limit (+ catch-up at 50)', () => {
    const base = yearTax(T, 'single', { wagesCents: dollars(200000) });
    const capped = yearTax(T, 'single', { wagesCents: dollars(200000), retirementContribCents: dollars(100000) });
    expect(capped.retirementContribCents).toBe(dollars(24500));
    expect(base.taxableOrdinaryCents - capped.taxableOrdinaryCents).toBe(dollars(24500));
    const older = yearTax(T, 'single', { wagesCents: dollars(200000), retirementContribCents: dollars(100000), age: 55 });
    expect(older.retirementContribCents).toBe(dollars(32500));
  });
  it('long-term gains stack on ordinary income at 0/15/20', () => {
    // Taxable ordinary 40,000 single: first 9,450 of gains at 0%, rest at 15%.
    expect(ltcgTax(dollars(40000), dollars(20000), T.federal.single.ltcg)).toBe(dollars((20000 - 9450) * 0.15));
    expect(ltcgTax(dollars(600000), dollars(100000), T.federal.single.ltcg)).toBe(dollars(100000 * 0.20));
  });
  it('a lump sum year can push income into the top bracket (edge case)', () => {
    const normal = yearTax(T, 'married_joint', { wagesCents: dollars(400000) }).federalIncomeCents;
    const lump = yearTax(T, 'married_joint', { wagesCents: dollars(4400000) }).federalIncomeCents;
    expect(lump - normal).toBeGreaterThan(dollars(4000000 * 0.35));
  });
  it('thresholds index with inflation; the additional Medicare threshold does not', () => {
    const t1 = indexTaxTable(T, 1, 0.025);
    expect(t1.federal.single.standardDeductionCents).toBe(dollars(Math.round(16100 * 1.025)));
    expect(t1.federal.single.additionalMedicareThresholdCents).toBe(T.federal.single.additionalMedicareThresholdCents);
    expect(progressive(dollars(100000), t1.federal.single.brackets)).toBeLessThan(progressive(dollars(100000), T.federal.single.brackets));
  });
});

describe('E6.2.2 state and local tax by location', () => {
  it('a no-wage-tax location gives more take-home than a flat-tax one, by exactly the table amount (acceptance 1)', () => {
    const salary = dollars(1_000_000);
    const tx = takeHome(T, 'single', salary, st('TX'));
    const co = takeHome(T, 'single', salary, st('CO'));
    expect(tx - co).toBe(dollars(1_000_000 * 0.044));
  });
  it('residence in a different taxing state: the higher of the two rates applies', () => {
    expect(stateTaxWorkAndResidence(st('TX'), st('NC'), dollars(100000))).toBe(dollars(3990));
    expect(stateTaxWorkAndResidence(st('AZ'), st('KY'), dollars(100000))).toBe(dollars(3500));
  });
  it('a move in mid-year splits the year by days', () => {
    const split = stateTaxByDays([{ profile: st('FL'), days: 181 }, { profile: st('IN'), days: 184 }], dollars(365000));
    expect(split).toBe(dollars(184000 * 0.0295));
  });
  it('every shipped state id resolves to a profile', () => {
    for (const s of tablesJson.states) expect(S.get(s.id)?.id).toBe(s.id);
  });
});
