// E6.1.2 opening money by start mode. All values are the bible's placeholders (no source).
import { emptySheet, type BalanceSheet } from './ledger.ts';
import { dollars, roundCents, type Cents } from './money.ts';

export type StartMode =
  | { readonly kind: 'student'; readonly studentDebtCents: Cents }
  | { readonly kind: 'graduate_assistant'; readonly studentDebtCents: Cents }
  | { readonly kind: 'quality_control'; readonly monthlyCostsCents: Cents; readonly yearsCoached: number; readonly studentDebtCents: Cents }
  | { readonly kind: 'head_coach'; readonly monthlyCostsCents: Cents; readonly priorPayCents: readonly Cents[] };

const STUDENT_DEBT_RATE = 0.065; // Assumption: E6.6.4 says rates are config by type, no value given.
const STUDENT_DEBT_MONTHS = 120; // Assumption: a ten-year repayment term.

function studentDebt(c: Cents): BalanceSheet['liabilities'] {
  if (c <= 0) return [];
  const r = STUDENT_DEBT_RATE / 12;
  let f = 1;
  for (let i = 0; i < STUDENT_DEBT_MONTHS; i++) f *= 1 + r;
  return [{ id: 'student-debt', kind: 'student', balanceCents: c, annualRate: STUDENT_DEBT_RATE, monthlyPaymentCents: roundCents((c * r) / (1 - 1 / f)) }];
}

/** Savings share of each prior year's pay, compounded at a flat rate (rows "position coach" to "head coach"). */
function compoundedSavings(pay: readonly Cents[], share: number, rate: number): Cents {
  let v = 0;
  for (const p of pay) v = v * (1 + rate) + p * share;
  return roundCents(v);
}

const HEAD_COACH_SAVE_SHARE = 0.15; // E6.1.2 table, placeholder
const HEAD_COACH_CASH_MONTHS = 12; // E6.1.2 table, placeholder
const SAVINGS_GROWTH = 0.05; // Assumption: growth used to compound past savings
const QC_PER_YEAR = 5000; // E6.1.2 table, placeholder (USD per year coached)
const QC_CASH_MONTHS = 2; // E6.1.2 table, placeholder

export function openingSheet(mode: StartMode): BalanceSheet {
  switch (mode.kind) {
    case 'student': return { ...emptySheet(dollars(1500)), liabilities: studentDebt(mode.studentDebtCents) };
    case 'graduate_assistant': return { ...emptySheet(dollars(1000)), liabilities: studentDebt(mode.studentDebtCents) };
    case 'quality_control': return { ...emptySheet(mode.monthlyCostsCents * QC_CASH_MONTHS), taxable: { index: dollars(QC_PER_YEAR * mode.yearsCoached) }, liabilities: studentDebt(mode.studentDebtCents) };
    case 'head_coach': return { ...emptySheet(mode.monthlyCostsCents * HEAD_COACH_CASH_MONTHS), taxable: { index: compoundedSavings(mode.priorPayCents, HEAD_COACH_SAVE_SHARE, SAVINGS_GROWTH) } };
  }
}
