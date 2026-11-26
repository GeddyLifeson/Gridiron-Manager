// E3.2.3 payment schedule and E3.6.1 agent fee: salary to cash flow that the wealth module (E6) reads.
import { roundCents, type Cents } from '../wealth/index.ts';
import { yearPay } from './draft.ts';
import { monthIndex, type CoachContract } from './types.ts';

export type PayStream = 'base' | 'supplemental' | 'signing_bonus' | 'incentive' | 'termination';

export interface Payment {
  readonly contractId: number;
  /** monthIndex of the pay date. */
  readonly month: number;
  readonly stream: PayStream;
  readonly grossCents: Cents;
  /** Agent fee taken as the payment is received (E3.6.1 acceptance). */
  readonly agentFeeCents: Cents;
  /** Base and termination pay are wages with withholding; supplemental pay to the coach's company is not (E3.2.3 rule 2). */
  readonly withheld: boolean;
}

/** Split an amount into n equal instalments that sum exactly, earlier instalments taking the leftover cents. */
export function splitEven(total: Cents, n: number): Cents[] {
  const base = Math.floor(total / n);
  let rest = total - base * n;
  return Array.from({ length: n }, () => { const x = base + (rest > 0 ? 1 : 0); if (rest > 0) rest--; return x; });
}

export function agentFee(c: CoachContract, grossCents: Cents): Cents {
  return c.agentId === null ? 0 : roundCents(grossCents * c.agentFeeShare);
}

export function contractYearStart(c: CoachContract, i: number): number {
  return monthIndex(c.startYear, c.startMonth) + 12 * i;
}

export function contractYearAt(c: CoachContract, month: number): number {
  return Math.floor((month - monthIndex(c.startYear, c.startMonth)) / 12);
}

const QUARTERS = 4;

/** Every scheduled payment of contract year i: base in `payPeriods` equal instalments, supplemental quarterly. */
export function yearPayments(c: CoachContract, i: number): Payment[] {
  const y = c.salary[i];
  if (!y) return [];
  const start = contractYearStart(c, i);
  const out: Payment[] = [];
  splitEven(y.baseCents, c.payPeriods).forEach((g, k) => out.push({ contractId: c.id, month: start + Math.floor((k * 12) / c.payPeriods), stream: 'base', grossCents: g, agentFeeCents: agentFee(c, g), withheld: true }));
  if (y.supplementalCents > 0) splitEven(y.supplementalCents, QUARTERS).forEach((g, k) => out.push({ contractId: c.id, month: start + 2 + 3 * k, stream: 'supplemental', grossCents: g, agentFeeCents: agentFee(c, g), withheld: false }));
  if (i === 0 && c.signingBonusCents > 0) out.push({ contractId: c.id, month: start, stream: 'signing_bonus', grossCents: c.signingBonusCents, agentFeeCents: agentFee(c, c.signingBonusCents), withheld: true });
  return out;
}

/** All scheduled payments over the term (E3.1.1 acceptance: they sum to the salary fields plus any signing bonus). */
export function scheduledPayments(c: CoachContract): Payment[] {
  return c.salary.flatMap((_, i) => yearPayments(c, i));
}

export function totalSalary(c: CoachContract): Cents {
  return c.salary.reduce((x, y) => x + yearPay(y), 0);
}

/** Sum payments in one month into the shape the wealth month close reads (MonthInputs wages, other income, fees). */
export function monthCashFlow(payments: readonly Payment[], month: number): { wagesCents: Cents; otherIncomeCents: Cents; feesCents: Cents } {
  let wagesCents = 0, otherIncomeCents = 0, feesCents = 0;
  for (const p of payments) {
    if (p.month !== month) continue;
    if (p.withheld) wagesCents += p.grossCents; else otherIncomeCents += p.grossCents;
    feesCents += p.agentFeeCents;
  }
  return { wagesCents, otherIncomeCents, feesCents };
}
