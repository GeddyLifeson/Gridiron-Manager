// E6.1.1, E6.1.2 and E6.11.1 acceptance through the autopilot.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import { autopilotYear, openingSheet, loadTaxTable, loadStateProfiles, reconcile, closeMonth, emptySheet, dollars, targetAllocation, monthlyLivingCost, type BalanceSheet, type CoachMoneySettings, type PaySchedule, type LedgerEntry, type StateProfile } from '../../src/wealth/index.ts';

const T = loadTaxTable();
const TX = loadStateProfiles().get('TX') as StateProfile;
const NC = loadStateProfiles().get('NC') as StateProfile;
const flat = (yearly: number): PaySchedule => Array.from({ length: 12 }, () => dollars(yearly / 12));
const NONE: PaySchedule = Array.from({ length: 12 }, () => 0);
/** Graduate assistant stipend: $1,000 a month in academic months, nothing June to August (E6.1.3 rule 4). */
const STIPEND: PaySchedule = [1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1].map((x) => x * dollars(1000));

const BASE: CoachMoneySettings = { filing: 'single', work: TX, tier: 'bare', costOfLivingIndex: 1, household: { partner: false, children: 0 }, riskLevel: 3, savingsRate: 0.2, retirementShare: 0.05, age: 30 };

/** Run years on autopilot, checking every month ties out; returns all entries and month-end cash. */
function run(sheet: BalanceSheet, years: number, payFor: (y: number) => PaySchedule, s: CoachMoneySettings, seed = 1) {
  const rng = stream(seedFromNumber(seed), 'wealth.market', []);
  let settle = 0;
  const cash: number[] = [];
  const events: string[] = [];
  const all: LedgerEntry[] = [];
  let costs = 0;
  for (let y = 0; y < years; y++) {
    const r = autopilotYear(sheet, y * 12, payFor(y), NONE, s, T, rng, settle);
    // Reconcile the whole year in one go: opening + every entry = closing, per account.
    expect(reconcile(sheet, r.sheet, r.entries), `year ${y}`).toEqual([]);
    sheet = r.sheet;
    settle = r.settlementDueCents;
    cash.push(...r.monthEndCash);
    events.push(...r.events.map((e) => `${e.kind}@${e.month}`));
    all.push(...r.entries);
    costs = r.monthlyCostsCents;
  }
  return { sheet, cash, events, entries: all, monthlyCosts: costs };
}

describe('E6.1.1 the balance sheet and the monthly cycle', () => {
  it('for any month, opening balances plus ledger entries equal closing balances to the cent (acceptance 1)', () => {
    const s0: BalanceSheet = { ...emptySheet(dollars(5000)), liabilities: [{ id: 'loan', kind: 'personal', balanceCents: dollars(8000), annualRate: 0.09, monthlyPaymentCents: dollars(300) }] };
    const ret = { cash: 0.0342, bonds: -0.1, index: 0.25, singleStocks: -0.4, realEstate: 0.05 };
    const r = closeMonth(s0, { month: 0, wagesCents: dollars(9000), otherIncomeCents: dollars(1234.56), withholdingCents: dollars(2100.13), retirementContribCents: dollars(450), livingCostCents: dollars(3500), feesCents: dollars(25), taxSettlementCents: 0, savingsRate: 0.3, target: targetAllocation(4), returns: ret });
    expect(reconcile(s0, r.sheet, r.entries)).toEqual([]);
  });
  it('a 40-season autopilot career never ends a month below zero cash without a logged shortfall event (acceptance 2)', () => {
    const pay = (y: number) => (y < 3 ? STIPEND : y < 8 ? flat(60000) : y < 15 ? flat(250000) : y < 25 ? flat(1_500_000) : flat(4_000_000));
    const r = run(openingSheet({ kind: 'graduate_assistant', studentDebtCents: dollars(20000) }), 40, pay, BASE, 11);
    r.cash.forEach((c, m) => { if (c < 0) expect(r.events, `month ${m}`).toContain(`cash_shortfall@${m}`); });
  });
  it('a default fires on the third consecutive short month and never earlier (E6.6.4 acceptance)', () => {
    const ret = { cash: 0, bonds: 0, index: 0, singleStocks: 0, realEstate: 0 };
    let s = emptySheet(0);
    const kinds: string[][] = [];
    for (let m = 0; m < 3; m++) {
      const r = closeMonth(s, { month: m, wagesCents: 0, otherIncomeCents: 0, withholdingCents: 0, retirementContribCents: 0, livingCostCents: dollars(100), feesCents: 0, taxSettlementCents: 0, savingsRate: 0, target: targetAllocation(1), returns: ret });
      s = r.sheet;
      kinds.push(r.events.map((e) => e.kind));
    }
    expect(kinds).toEqual([['cash_shortfall'], ['cash_shortfall'], ['cash_shortfall', 'default']]);
  });
  it('a shortfall first sells taxable holdings, most liquid first (rule 4)', () => {
    const ret = { cash: 0, bonds: 0, index: 0, singleStocks: 0, realEstate: 0 };
    const s0 = { ...emptySheet(0), taxable: { bonds: dollars(50), index: dollars(1000) } };
    const r = closeMonth(s0, { month: 0, wagesCents: 0, otherIncomeCents: 0, withholdingCents: 0, retirementContribCents: 0, livingCostCents: dollars(100), feesCents: 0, taxSettlementCents: 0, savingsRate: 0, target: targetAllocation(1), returns: ret });
    expect(r.events).toEqual([]);
    expect(r.sheet.cash).toBe(0);
    expect(r.sheet.taxable.bonds).toBe(0);
    expect(r.sheet.taxable.index).toBe(dollars(950));
  });
  it('income without withholding becomes a tax bill at settlement (E6.2.1 rule 3)', () => {
    const rng = stream(seedFromNumber(3), 'wealth.market', []);
    const outside = flat(60000);
    const r = autopilotYear(emptySheet(dollars(50000)), 0, flat(200000), outside, { ...BASE, work: NC }, T, rng);
    expect(r.settlementDueCents).toBeGreaterThan(dollars(60000 * 0.24));
  });
});

describe('E6.1.2 opening money by start mode', () => {
  it('every start mode yields a sheet whose first three months of autopilot do not default', () => {
    const living = monthlyLivingCost('bare', 1, { partner: false, children: 0 });
    const modes = [
      { mode: openingSheet({ kind: 'student', studentDebtCents: dollars(40000) }), pay: flat(30000) },
      { mode: openingSheet({ kind: 'graduate_assistant', studentDebtCents: 0 }), pay: STIPEND },
      { mode: openingSheet({ kind: 'quality_control', monthlyCostsCents: living, yearsCoached: 2, studentDebtCents: dollars(10000) }), pay: flat(60000) },
      { mode: openingSheet({ kind: 'head_coach', monthlyCostsCents: dollars(20000), priorPayCents: [dollars(300000), dollars(900000), dollars(2_000_000)] }), pay: flat(5_000_000) },
    ];
    for (const { mode, pay } of modes) {
      const r = run(mode, 1, () => pay, BASE);
      expect(r.events.filter((e) => e.startsWith('default@') && Number(e.split('@')[1]) < 3)).toEqual([]);
    }
  });
});

describe('E6.11.1 money by career stage', () => {
  it('rung 1 on the default sheet and bare tier has a month below one month of costs; rung 9 never does (acceptance)', () => {
    const ga = run(openingSheet({ kind: 'graduate_assistant', studentDebtCents: 0 }), 1, () => STIPEND, BASE);
    const costs1 = monthlyLivingCost('bare', 1, BASE.household);
    expect(ga.cash.some((c) => c < costs1)).toBe(true);
    const hcSettings = { ...BASE, tier: 'affluent' as const };
    const hc = run(openingSheet({ kind: 'head_coach', monthlyCostsCents: monthlyLivingCost('affluent', 1, BASE.household), priorPayCents: [dollars(1_000_000), dollars(2_000_000)] }), 1, () => flat(6_000_000), hcSettings);
    const costs9 = monthlyLivingCost('affluent', 1, BASE.household);
    expect(hc.cash.every((c) => c >= costs9)).toBe(true);
  });
});
