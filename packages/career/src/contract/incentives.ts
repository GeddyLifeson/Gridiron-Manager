// E3.2.2 incentives: a triggered bonus posts once, on the event date, and is paid after the bonus delay.
import type { Cents } from '../wealth/index.ts';
import { agentFee, contractYearAt, type Payment } from './pay.ts';
import { cparam } from './params.ts';
import type { CoachContract, TriggerId } from './types.ts';

export interface SeasonEvent {
  readonly trigger: TriggerId;
  /** monthIndex of the event (game, award, or season end). */
  readonly month: number;
  /** For win_threshold: the win count reached by this game. For playoff_win: the round number. */
  readonly count: number;
}

export interface IncentiveContext {
  readonly employedOnEventMonth: (month: number) => boolean;
  readonly employedOnPayMonth: (month: number) => boolean;
  /** E3.2.2 rule 4: a pending major rules investigation holds every bonus when the clause is on. */
  readonly pendingInvestigation: boolean;
}

export interface IncentiveResult {
  readonly payments: readonly Payment[];
  /** Keys already posted, so an event never pays twice. */
  readonly posted: ReadonlySet<string>;
  readonly withheld: readonly { key: string; reason: 'not_employed_on_event' | 'not_employed_on_pay' | 'investigation' | 'cap' }[];
}

const DAYS_PER_MONTH = 30;

export function eventKey(c: CoachContract, e: SeasonEvent): string {
  return `${c.id}:${contractYearAt(c, e.month)}:${e.trigger}:${e.count}`;
}

/** Evaluate season events against the contract. `alreadyPosted` carries earlier keys; `paidThisYear` the incentive
 *  cents already paid per contract year, for the annual cap. */
export function evaluateIncentives(c: CoachContract, events: readonly SeasonEvent[], ctx: IncentiveContext, alreadyPosted: ReadonlySet<string> = new Set(), paidThisYear: ReadonlyMap<number, Cents> = new Map()): IncentiveResult {
  const posted = new Set(alreadyPosted);
  const paid = new Map(paidThisYear);
  const payments: Payment[] = [];
  const withheld: { key: string; reason: 'not_employed_on_event' | 'not_employed_on_pay' | 'investigation' | 'cap' }[] = [];
  const delay = Math.ceil(cparam('bonusPayDays') / DAYS_PER_MONTH);
  for (const e of [...events].sort((a, b) => a.month - b.month)) {
    const inc = c.incentives.find((i) => i.trigger === e.trigger && (i.fromWins === null || e.count >= i.fromWins));
    if (!inc) continue;
    const key = eventKey(c, e);
    if (posted.has(key)) continue;
    posted.add(key);
    const payMonth = e.month + delay;
    if (c.bonusRequiresEmploymentOnEventDate && !ctx.employedOnEventMonth(e.month)) { withheld.push({ key, reason: 'not_employed_on_event' }); continue; }
    if (c.bonusRequiresEmploymentOnPayDate && !ctx.employedOnPayMonth(payMonth)) { withheld.push({ key, reason: 'not_employed_on_pay' }); continue; }
    if (c.bonusComplianceCondition && ctx.pendingInvestigation) { withheld.push({ key, reason: 'investigation' }); continue; }
    const yr = contractYearAt(c, e.month);
    const before = paid.get(yr) ?? 0;
    const room = c.incentiveCapCents > 0 ? Math.max(0, c.incentiveCapCents - before) : inc.amountCents;
    const amount = Math.min(inc.amountCents, room);
    if (amount <= 0) { withheld.push({ key, reason: 'cap' }); continue; }
    paid.set(yr, before + amount);
    payments.push({ contractId: c.id, month: payMonth, stream: 'incentive', grossCents: amount, agentFeeCents: agentFee(c, amount), withheld: true });
  }
  return { payments, posted, withheld };
}
