// E3.3 guarantees, termination, offset, buyouts and settlements.
import { roundCents, type Cents } from './money.ts';
import { yearPay } from './draft.ts';
import { contractYearAt, contractYearStart } from './pay.ts';
import { cparam } from './params.ts';
import { CURABLE_GROUNDS, monthIndex, type CauseGround, type CoachContract, type ContractRandom } from './types.ts';

export interface MonthAmount { readonly month: number; readonly cents: Cents }

/** Salary as 12 even monthly amounts per contract year, from `from` (inclusive) to `to` (exclusive). */
export function monthlySalary(c: CoachContract, from: number, to: number): MonthAmount[] {
  const out: MonthAmount[] = [];
  c.salary.forEach((y, i) => {
    const start = contractYearStart(c, i);
    // Cumulative rounding: any run of months to the year end sums to the exact pro-rated remainder.
    const total = yearPay(y);
    for (let k = 0; k < 12; k++) {
      const m = start + k;
      if (m >= from && m < to) out.push({ month: m, cents: roundCents((total * (k + 1)) / 12) - roundCents((total * k) / 12) });
    }
  });
  return out;
}

export function termEnd(c: CoachContract): number {
  return contractYearStart(c, c.salary.length);
}

function guaranteedEnd(c: CoachContract): number {
  return Math.min(termEnd(c), contractYearStart(c, c.guarantee.guaranteedThroughYear - c.startYear + 1));
}

/** Scale a schedule by a share so the total is the rounded share of the total (no per-month drift), the
 *  leftover cents going to the earliest months. */
function scale(list: readonly MonthAmount[], share: number): MonthAmount[] {
  const target = roundCents(list.reduce((x, y) => x + y.cents, 0) * share);
  const out = list.map((x) => ({ month: x.month, cents: Math.floor(x.cents * share) }));
  let rest = target - out.reduce((x, y) => x + y.cents, 0);
  for (let i = 0; rest > 0 && out.length > 0; i = (i + 1) % out.length) { out[i] = { month: out[i]!.month, cents: out[i]!.cents + 1 }; rest--; }
  return out;
}

export const sum = (list: readonly MonthAmount[]): Cents => list.reduce((x, y) => x + y.cents, 0);

export type EndReason = 'fired_without_cause' | 'head_coach_changed' | 'head_coach_left_voluntarily' | 'death_or_disability';

export interface OwedSchedule { readonly owedCents: Cents; readonly schedule: readonly MonthAmount[]; readonly state: 'terminated_paying' | 'expired' }

/** E3.3.1: what the employer owes from `month` when the job ends for a reason other than cause or resignation.
 *  Unearned incentives are not owed; perquisites end. Paid on the original monthly rhythm (E3.2.3 rule 4). */
export function owedOnEnd(c: CoachContract, month: number, reason: EndReason): OwedSchedule {
  const rest = monthlySalary(c, month, termEnd(c));
  let schedule: MonthAmount[];
  if (reason === 'death_or_disability') {
    const yearEnd = contractYearStart(c, contractYearAt(c, month) + cparam('deathPayYears'));
    schedule = rest.filter((x) => x.month < yearEnd);
  } else if (c.guarantee.form === 'head_coach_change_months') {
    schedule = reason === 'head_coach_changed' || reason === 'head_coach_left_voluntarily' ? rest.slice(0, c.guarantee.months) : [];
  } else if (c.guarantee.form === 'current_year') {
    const yearEnd = contractYearStart(c, contractYearAt(c, month) + 1);
    schedule = scale(rest.filter((x) => x.month < yearEnd), c.guarantee.share);
  } else {
    const g = scale(rest.filter((x) => x.month < guaranteedEnd(c)), c.guarantee.share);
    schedule = reason === 'head_coach_left_voluntarily' && c.seat === 'assistant' ? g.slice(0, cparam('assistantHeadCoachLeftMonths')) : g;
  }
  return { owedCents: sum(schedule), schedule, state: schedule.length ? 'terminated_paying' : 'expired' };
}

/** New income in one month while the old employer still pays (E3.3.2 rule 2). */
export interface NewIncome { readonly coachingCents: Cents; readonly otherFootballCents: Cents; readonly nonFootballCents: Cents }

export interface OffsetContext {
  /** Annual salary of the new coaching job and the band median for its rung (rule 4 market floor). */
  readonly newAnnualSalaryCents: Cents;
  readonly newBandMedianCents: Cents;
}

export interface OffsetResult { readonly paidCents: Cents; readonly offsetCents: Cents; readonly marketFloorUsed: boolean; readonly arbitrationEvent: boolean }

/** E3.3.2: reduce one scheduled old-employer payment by offsetting income in the same month, floor zero.
 *  A new salary under the floor share of band median is replaced by the median, inside the contract or by a
 *  league arbitration event, as the contract's market floor says. */
export function applyOffset(c: CoachContract, scheduledCents: Cents, income: NewIncome, ctx: OffsetContext): OffsetResult {
  if (!c.offset.on) return { paidCents: scheduledCents, offsetCents: 0, marketFloorUsed: false, arbitrationEvent: false };
  let coaching = income.coachingCents;
  let floorUsed = false;
  const lowPaid = ctx.newAnnualSalaryCents > 0 && ctx.newAnnualSalaryCents < cparam('offsetFloorShareOfMedian') * ctx.newBandMedianCents;
  if (lowPaid && c.offset.marketFloor !== 'none') { coaching = roundCents(ctx.newBandMedianCents / 12); floorUsed = true; }
  const offsetting = coaching + (c.offset.income === 'football_related' ? income.otherFootballCents : 0);
  const offsetCents = Math.min(scheduledCents, offsetting);
  return { paidCents: scheduledCents - offsetCents, offsetCents, marketFloorUsed: floorUsed, arbitrationEvent: floorUsed && c.offset.marketFloor === 'arbitration' };
}

/** Duty to report (E3.3.2 rule 7): payments stop when new pay goes unreported past the window. */
export function reportOverdue(c: CoachContract, acceptedOnDay: number, todayDay: number, reported: boolean): boolean {
  return !reported && todayDay - acceptedOnDay > c.reportNewJobDays;
}

// ---- E3.3.3 termination for cause ----

/** Losing games is never a ground (Texas 2016 says so in words, F-contract-0017); the type has no record ground. */
export type NoticeGround = CauseGround | 'win_loss_record';

export type CauseOutcome =
  | { readonly kind: 'invalid'; readonly reason: 'not_a_ground' | 'not_in_contract' | 'no_conduct_event' }
  | { readonly kind: 'cured' }
  | { readonly kind: 'suspended'; readonly days: number; readonly unpaidCents: Cents }
  | { readonly kind: 'terminated'; readonly payThroughMonth: number };

export interface CauseNotice {
  readonly ground: NoticeGround;
  /** Id of the logged conduct event (L9, C11). No event, no notice (E3.3.3 acceptance 1). */
  readonly conductEventId: number | null;
  readonly month: number;
  /** Days the coach took to cure, or null when not cured. */
  readonly curedInDays: number | null;
  /** The employer chooses an unpaid suspension instead of firing (rule 4). */
  readonly suspendDays: number | null;
}

export function causeNotice(c: CoachContract, n: CauseNotice): CauseOutcome {
  if (n.ground === 'win_loss_record') return { kind: 'invalid', reason: 'not_a_ground' };
  if (n.conductEventId === null) return { kind: 'invalid', reason: 'no_conduct_event' };
  if (!c.causeGrounds.includes(n.ground)) return { kind: 'invalid', reason: 'not_in_contract' };
  if (CURABLE_GROUNDS.includes(n.ground) && n.curedInDays !== null && n.curedInDays <= c.cureDays) return { kind: 'cured' };
  if (n.suspendDays !== null && n.suspendDays > 0 && n.suspendDays <= c.maxUnpaidSuspensionDays) {
    const y = c.salary[contractYearAt(c, n.month)];
    const daily = y ? y.baseCents / 365 : 0;
    return { kind: 'suspended', days: n.suspendDays, unpaidCents: roundCents(daily * n.suspendDays) };
  }
  // Rule 5: pay stops at the end of that month; earned salary and earned bonuses are still paid.
  return { kind: 'terminated', payThroughMonth: n.month };
}

export type EvidenceKind = 'league_or_association_finding' | 'criminal_charge_pending' | 'conduct_unbecoming_only';

export interface DisputeResult { readonly employerWins: boolean; readonly delayMonths: number; readonly legalCostCents: Cents }

/** Rule 7: a disputed notice resolves after a delay by a draw weighted by the evidence, with legal cost to the coach. */
export function resolveCauseDispute(rng: ContractRandom, evidence: EvidenceKind, amountInDisputeCents: Cents): DisputeResult {
  const p = evidence === 'league_or_association_finding' ? cparam('causeWinFinding') : evidence === 'criminal_charge_pending' ? cparam('causeWinCharge') : cparam('causeWinConduct');
  const employerWins = rng.next() < p;
  const dMin = cparam('causeDelayMinMonths'), dMax = cparam('causeDelayMaxMonths');
  const delayMonths = dMin + Math.floor(rng.next() * (dMax - dMin + 1));
  const cost = cparam('causeLegalCostMin') + (cparam('causeLegalCostMax') - cparam('causeLegalCostMin')) * rng.next();
  return { employerWins, delayMonths, legalCostCents: roundCents(amountInDisputeCents * cost) };
}

// ---- E3.3.4 the coach leaves early ----

export interface LeaveContext {
  readonly month: number;
  /** The new job is a head coach job, or a coordinator job with full play-calling duties (promotion waiver). */
  readonly isPromotion: boolean;
  /** The month falls inside the contract's resignation window (from the calendar). */
  readonly insideWindow: boolean;
  readonly retiring: boolean;
}

export type LeaveResult =
  | { readonly kind: 'needs_release'; readonly note: 'club_holds_rights_trade_L5_2_5' }
  | { readonly kind: 'free'; readonly why: 'retired' | 'no_buyout' | 'promotion_waiver' }
  | { readonly kind: 'owes'; readonly amountCents: Cents; readonly dueInDays: number; readonly breach: boolean };

/** E3.3.4 ladder stage for assistant_ladder: 0 before August 1 of the first season, 1 until the next February 1, 2 after. */
export function ladderStage(c: CoachContract, month: number): 0 | 1 | 2 {
  const AUG = 8, FEB = 2;
  const firstAug = monthIndex(c.startMonth <= AUG ? c.startYear : c.startYear + 1, AUG);
  if (month < firstAug) return 0;
  const nextFeb = monthIndex(Math.floor(firstAug / 12) + 1, FEB);
  return month < nextFeb ? 1 : 2;
}

export function leaveEarly(c: CoachContract, ctx: LeaveContext): LeaveResult {
  if (ctx.retiring) return { kind: 'free', why: 'retired' };
  if (c.releaseHeldByClub) return { kind: 'needs_release', note: 'club_holds_rights_trade_L5_2_5' };
  const rest = monthlySalary(c, ctx.month, termEnd(c));
  const remaining = sum(rest);
  const due = cparam('buyoutDueDays');
  if (ctx.insideWindow && c.resignationWindow !== 'none') {
    // Breach (Assumption): the employer may claim the whole remaining guaranteed salary.
    return { kind: 'owes', amountCents: roundCents(sum(rest.filter((x) => x.month < guaranteedEnd(c))) * c.guarantee.share), dueInDays: due, breach: true };
  }
  const b = c.buyout;
  switch (b.form) {
    case 'none': return { kind: 'free', why: 'no_buyout' };
    case 'fixed_by_year': return { kind: 'owes', amountCents: b.fixedByYearCents[contractYearAt(c, ctx.month)] ?? 0, dueInDays: due, breach: false };
    case 'per_remaining_year': return { kind: 'owes', amountCents: roundCents(b.perRemainingYearCents * rest.length / 12), dueInDays: due, breach: false };
    case 'pct_remaining': return { kind: 'owes', amountCents: roundCents(remaining * b.share), dueInDays: due, breach: false };
    case 'assistant_ladder': {
      if (b.promotionWaiver && ctx.isPromotion) return { kind: 'free', why: 'promotion_waiver' };
      const share = b.ladder?.[ladderStage(c, ctx.month)] ?? 0;
      return { kind: 'owes', amountCents: roundCents(sum(rest.filter((x) => x.month < guaranteedEnd(c))) * c.guarantee.share * share), dueInDays: due, breach: false };
    }
  }
}

/** E3.3.4 rule 8: whether the new employer pays the buyout, and the tax gross-up it adds when it does. */
export function buyoutPayer(rng: ContractRandom, amountCents: Cents, newEmployerWillingShare = cparam('newEmployerPaysShare')): { payer: 'new_employer' | 'coach'; totalCents: Cents } {
  return rng.next() < newEmployerWillingShare
    ? { payer: 'new_employer', totalCents: roundCents(amountCents * (1 + cparam('buyoutGrossUp'))) }
    : { payer: 'coach', totalCents: amountCents };
}

// ---- E3.3.5 settlements ----

/** Offer share of the nominal amount owed: top - slope * expected offset / owed, floored. */
export function settlementOfferShare(owedCents: Cents, expectedOffsetCents: Cents): number {
  if (owedCents <= 0) return 0;
  return Math.max(cparam('settlementFloor'), cparam('settlementTop') - cparam('settlementSlope') * (expectedOffsetCents / owedCents));
}

export function settlementOffer(owedCents: Cents, expectedOffsetCents: Cents): Cents {
  return roundCents(owedCents * settlementOfferShare(owedCents, expectedOffsetCents));
}

/** The coach (AI, or the agent's advice) uses the same expectation: take the lump sum when it beats what the
 *  payments are expected to be worth after offset. */
export function coachAcceptsSettlement(offerCents: Cents, owedCents: Cents, expectedOffsetCents: Cents): boolean {
  return offerCents >= owedCents - expectedOffsetCents;
}

/** Accepting closes the contract: no further scheduled payments and no offset. */
export function settle(c: CoachContract): CoachContract {
  return { ...c, state: 'settled', offset: { ...c.offset, on: false } };
}
