// E6.9.2 the target number and security status. Read only by the coach's own choices (E2.7.2, E2.8.1,
// E8.5); never by E2.4, E4, J or K3 to K6 (E6.12.1).
import tablesJson from './tables.json' with { type: 'json' };
import { factNumber } from './facts.ts';
import { param } from './params.ts';
import { roundCents, type Cents } from './money.ts';

export type SecurityStatus = 'insecure' | 'short_runway' | 'comfortable' | 'secure';

export interface SecurityInput {
  /** Cash and liquid investments (taxable and retirement). */
  readonly investableCents: Cents;
  /** Present value of guaranteed income: termination pay subject to offset, pension (rule 2). */
  readonly guaranteedPvCents: Cents;
  readonly yearlySpendingCents: Cents;
}

export interface SecurityView {
  readonly targetCents: Cents;
  readonly runwayYears: number;
  readonly status: SecurityStatus;
  /** The safe withdrawal rate used and its fact id (2 of 3, PROVISIONAL). */
  readonly withdrawalRate: number;
  readonly factId: string;
}

export function security(inp: SecurityInput, file = tablesJson): SecurityView {
  const swr = factNumber(file.safeWithdrawalRate);
  const target = roundCents(inp.yearlySpendingCents / swr);
  const have = inp.investableCents + inp.guaranteedPvCents;
  const runway = inp.yearlySpendingCents > 0 ? have / inp.yearlySpendingCents : Number.POSITIVE_INFINITY;
  let status: SecurityStatus;
  if (have >= target) status = 'secure';
  else if (have >= target * param('securityComfortableShare')) status = 'comfortable';
  else if (runway < param('shortRunwayYears')) status = 'insecure';
  else status = 'short_runway';
  return { targetCents: target, runwayYears: runway, status, withdrawalRate: swr, factId: file.safeWithdrawalRate };
}
