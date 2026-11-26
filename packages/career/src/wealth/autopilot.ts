// E6.1.1 rule 6: autopilot pays everything and follows the chosen allocation, so a user who ignores the
// Money screen gets a sensible result. AI coaches use the same path with K2-chosen settings.
import { closeMonth, closeYear, type BalanceSheet, type LedgerEntry, type WealthEvent } from './ledger.ts';
import { yearTax, monthlyWithholding, type TaxTable, type FilingStatus, type StateProfile } from './tax.ts';
import { monthlyLivingCost, type Household } from './lifestyle.ts';
import { rebalance, targetAllocation, drawMarketYear, panicPrompt, type WealthRandom, type YearReturns } from './invest.ts';
import { param, type LifestyleTier } from './params.ts';
import { roundCents, type Cents } from './money.ts';

export interface CoachMoneySettings {
  readonly filing: FilingStatus;
  readonly work: StateProfile;
  readonly residence?: StateProfile;
  readonly tier: LifestyleTier;
  readonly costOfLivingIndex: number;
  readonly household: Household;
  readonly riskLevel: 1 | 2 | 3 | 4 | 5;
  readonly savingsRate: number;
  /** Share of wages put in the employer plan before tax (capped by the table). */
  readonly retirementShare: number;
  readonly age: number;
}

/** Wages by month of a year, index 0 = January (stipends that stop in summer have zeros). */
export type PaySchedule = readonly Cents[];

export interface YearRun {
  readonly sheet: BalanceSheet;
  readonly entries: readonly LedgerEntry[];
  readonly events: readonly WealthEvent[];
  readonly monthEndCash: readonly Cents[];
  readonly monthlyCostsCents: Cents;
  readonly returns: YearReturns;
}

/**
 * Run one year on autopilot. `firstMonth` is the absolute month index of January.
 * Withholding is the yearly estimate / 12 (E6.2.1 rule 3); the true-up for last year arrives in the
 * settlement month as `priorYearSettlementCents`.
 */
export function autopilotYear(sheet0: BalanceSheet, firstMonth: number, pay: PaySchedule, otherIncome: PaySchedule, s: CoachMoneySettings, table: TaxTable, rng: WealthRandom, priorYearSettlementCents: Cents = 0): YearRun & { settlementDueCents: Cents } {
  const returns = drawMarketYear(rng);
  const target = targetAllocation(s.riskLevel);
  const yearlyWages = pay.reduce((a, b) => a + b, 0);
  const yearlyOther = otherIncome.reduce((a, b) => a + b, 0);
  const yearlyContrib = Math.min(roundCents(yearlyWages * s.retirementShare), table.electiveDeferralLimitCents);
  const withholding = monthlyWithholding(table, s.filing, yearlyWages, yearlyContrib, s.work, s.residence, s.age);
  const living = monthlyLivingCost(s.tier, s.costOfLivingIndex, s.household);
  let sheet = sheet0;
  const entries: LedgerEntry[] = [];
  const events: WealthEvent[] = [];
  const monthEndCash: Cents[] = [];
  let withheld = 0;
  for (let i = 0; i < 12; i++) {
    const wages = pay[i] ?? 0;
    const w = wages > 0 && yearlyWages > 0 ? roundCents((withholding * 12 * wages) / yearlyWages) : 0;
    withheld += w;
    const contrib = yearlyWages > 0 ? roundCents((yearlyContrib * wages) / yearlyWages) : 0;
    const r = closeMonth(sheet, {
      month: firstMonth + i, wagesCents: wages, otherIncomeCents: otherIncome[i] ?? 0, withholdingCents: w,
      retirementContribCents: contrib, livingCostCents: living, feesCents: 0,
      taxSettlementCents: i + 1 === param('taxSettlementMonth') ? priorYearSettlementCents : 0,
      savingsRate: s.savingsRate, target, returns,
    });
    sheet = r.sheet;
    entries.push(...r.entries);
    events.push(...r.events);
    monthEndCash.push(sheet.cash);
  }
  if (panicPrompt(returns)) events.push({ kind: 'panic_prompt', month: firstMonth + 11 });
  const y = closeYear(sheet, firstMonth + 11, target, returns.realEstate, rebalance);
  sheet = y.sheet;
  entries.push(...y.entries);
  const owed = yearTax(table, s.filing, { wagesCents: yearlyWages, otherOrdinaryCents: yearlyOther, retirementContribCents: yearlyContrib, age: s.age }, { work: s.work, residence: s.residence }).totalCents - withheld;
  const monthlyCosts = living + sheet.leases.reduce((x, l) => x + l.monthlyRentCents, 0) + sheet.homes.reduce((x, h) => x + h.monthlyPaymentCents, 0);
  return { sheet, entries, events, monthEndCash, monthlyCostsCents: monthlyCosts, returns, settlementDueCents: owed };
}
