// Player pay (T7): the school pool and football's share (T7.1.1), outside deals and the clearinghouse
// (T7.2.1), the roster budget sheet and market value (T7.3.1), agreement terms (T7.3.2). School
// payments above the football budget are refused because the athletic department issues them (the
// institution rejects the act); money promised beyond it through outside deals is an act for
// compliance, never blocked.
import { possible } from '@gm/schema';
import type { CollegeRules } from './keys.ts';
import { clamp01, param, pow2, U } from './params.ts';
import type { Stream } from './types.ts';

export type BudgetTier = 'top' | 'middle' | 'lower' | 'not_opted_in';

export interface PoolSplit {
  readonly football: number;
  readonly mensBasketball: number;
  readonly womensBasketball: number;
  readonly other: number;
  /** Share held back as a reserve the head coach can ask for in January (T7.1.1). */
  readonly reserve: number;
}

/** The starting split an AI athletic director uses (T7.1.1), with the reserve taken off the top. */
export function startingSplit(reserveShare = 0): PoolSplit {
  const r = Math.min(Math.max(0, reserveShare), param('adReserveMax'));
  const rest = 1 - r;
  return {
    football: param('adFootballShare') * rest, mensBasketball: param('adMensBasketballShare') * rest,
    womensBasketball: param('adWomensBasketballShare') * rest, other: param('adOtherShare') * rest, reserve: r,
  };
}

/**
 * Share of the cap a school funds (T7.1.1 by tier). Middle and lower tiers have a range; `position`
 * 0 to 1 places the school inside it (a generated program's budget strength).
 */
export function fundedFraction(tier: BudgetTier, position = 0): number {
  const t = clamp01(position);
  switch (tier) {
    case 'top': return param('fundedTop');
    case 'middle': return param('fundedMiddleLow') + (param('fundedMiddleHigh') - param('fundedMiddleLow')) * t;
    case 'lower': return param('fundedLowerLow') + (param('fundedLowerHigh') - param('fundedLowerLow')) * t;
    case 'not_opted_in': return 0;
  }
}

export interface FootballBudget {
  readonly cap: number;
  /** Room for payments after any scholarship cost counted against the cap that year. */
  readonly paymentRoom: number;
  readonly schoolPool: number;
  readonly football: number;
  /** The athletic department's January reserve; football may ask for some of it. */
  readonly reserve: number;
}

/** T7.1.1: from the year's cap to football's player-pay budget. */
export function footballBudget(rules: CollegeRules, tier: BudgetTier, tierPosition: number, split: PoolSplit = startingSplit()): FootballBudget {
  const cap = rules.pay?.revenueShareCap ?? 0;
  const room = Math.max(0, cap - (rules.pay?.scholarshipCredit ?? 0));
  const pool = Math.round(room * fundedFraction(tier, tierPosition));
  return { cap, paymentRoom: room, schoolPool: pool, football: Math.round(pool * split.football), reserve: Math.round(pool * split.reserve) };
}

export type PayPosition = 'QB' | 'OT' | 'EDGE' | 'DT' | 'WR' | 'CB' | 'IOL' | 'RB' | 'S' | 'LB' | 'TE' | 'K' | 'P' | 'LS';
export const PAY_POSITIONS: readonly PayPosition[] = ['QB', 'OT', 'EDGE', 'DT', 'WR', 'CB', 'IOL', 'RB', 'S', 'LB', 'TE', 'K', 'P', 'LS'];

export interface MarketInput {
  readonly position: PayPosition;
  /** The staff's D6 grade of the player (an estimate, never truth: K9). */
  readonly grade: number;
  readonly seasonsLeft: number;
  /** Programs believed to want him, including his own. */
  readonly programsInterested: number;
  /** This program's football budget against a top-tier budget (1 at a top-tier program). */
  readonly budgetScale: number;
}

/** T7.3.1 starting market-value formula: position base x quality x eligibility x demand. */
export function marketValue(i: MarketInput): number {
  const base = param(`positionBase${i.position}`) * Math.max(0, i.budgetScale);
  const quality = pow2((i.grade - param('typicalStarterGrade')) / param('qualityDoublingGrade'));
  const elig = i.seasonsLeft > 1 ? 1 : param('eligibilityOneLeft');
  const demand = Math.min(param('demandCap'), 1 + param('demandPerProgram') * Math.max(0, i.programsInterested - 1));
  return Math.round(base * quality * elig * demand);
}

export interface SheetLine {
  readonly personId: number;
  readonly position: PayPosition;
  /** School payment for the year (USD). */
  readonly amount: number;
}

export type SheetVerdict =
  | { readonly ok: true; readonly total: number; readonly left: number; readonly byPosition: Readonly<Record<PayPosition, number>>; readonly quarterbackShare: number }
  | { readonly ok: false; readonly reason: 'over_budget' | 'negative_amount' | 'over_aid_limit'; readonly total: number; readonly budget: number };

/**
 * T7.3.1: the head coach's sheet (or whoever holds final say, T9.1.1). Refused when school payments
 * exceed the football budget plus any reserve released to football.
 */
export function validateSheet(lines: readonly SheetLine[], budget: FootballBudget, rules: CollegeRules, reserveReleased = 0): SheetVerdict {
  const available = budget.football + Math.min(Math.max(0, reserveReleased), budget.reserve);
  const total = lines.reduce((n, l) => n + l.amount, 0);
  if (lines.some((l) => l.amount < 0)) return { ok: false, reason: 'negative_amount', total, budget: available };
  if (total > available) return { ok: false, reason: 'over_budget', total, budget: available };
  if (lines.filter((l) => l.amount > 0).length > rules.aidLimit) return { ok: false, reason: 'over_aid_limit', total, budget: available };
  const byPosition = Object.fromEntries(PAY_POSITIONS.map((p) => [p, 0])) as Record<PayPosition, number>;
  for (const l of lines) byPosition[l.position] += l.amount;
  return { ok: true, total, left: available - total, byPosition, quarterbackShare: available > 0 ? byPosition.QB / available : 0 };
}

export interface OutsideDeal {
  readonly amount: number;
  /** From a booster or group tied to the school (only these are tested for market value). */
  readonly associated: boolean;
  /** The player's market value as the reviewer sees it (T7.3.1 formula). */
  readonly marketValue: number;
}

/** Must the deal be reported (T7.2.1)? */
export function mustReport(deal: OutsideDeal, rules: CollegeRules): boolean {
  return rules.pay !== null && deal.amount >= rules.pay.nilReportThreshold;
}

/** T7.2.1 starting review model: chance the clearinghouse does not clear a reported deal. */
export function rejectionChance(deal: OutsideDeal): number {
  const over = deal.marketValue > 0 ? Math.max(0, deal.amount / deal.marketValue - 1) : 0;
  if (!deal.associated) return possible(param('rejectNonAssociated')); // brands with no tie are not tested for market value
  return possible(Math.min(param('rejectCap'), param('rejectAssociatedBase') + param('rejectAssociatedSlope') * over));
}

export interface ReviewResult { readonly cleared: boolean; readonly days: number }

/** One review: cleared or not, and how many days it took (half in a day, 80 percent in two weeks, the rest within a month). */
export function reviewDeal(deal: OutsideDeal, rng: Stream): ReviewResult {
  const cleared = rng.uniform() >= rejectionChance(deal);
  const t = rng.uniform();
  const d1 = param('reviewShareDay1'), d14 = param('reviewShareDay14');
  const fast = param('reviewDaysFast'), mid = param('reviewDaysMid'), max = param('reviewDaysMax');
  const days = t < d1 ? fast : t < d14 ? Math.round(fast + ((t - d1) / (d14 - d1)) * (mid - fast)) : Math.round(mid + ((t - d14) / (1 - d14)) * (max - mid));
  return { cleared, days };
}

/** A rejected deal taken to arbitration: does the player win (T7.2.1)? */
export function arbitrationPlayerWins(rng: Stream): boolean {
  return rng.uniform() >= param('arbitrationCommissionWins');
}

export type PaySchedule = 'monthly_hold_december' | 'bowl_month_bonus' | 'half_and_half';

export interface Agreement {
  readonly personId: number;
  readonly amountPerYear: number;
  readonly years: number;
  readonly schedule: PaySchedule;
  /** Buyout owed if he transfers (USD); 0 for none. */
  readonly buyout: number;
  /** T7.3.2 rule 3a optional clauses. */
  readonly clauses: readonly ('performance_pay' | 'health_disclosure' | 'injury_breach' | 'conduct_fines')[];
  /** Agent fee as a share of an endorsement contract, in percent; null with no agent. */
  readonly agentFeePct: number | null;
}

export type AgreementVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: 'length' | 'negative' | 'agent_fee_over_cap' };

/** T7.3.2: length one to the rule set's maximum (one when multi-year agreements are off); agent fee under a cap in force. */
export function validateAgreement(a: Agreement, rules: CollegeRules): AgreementVerdict {
  const p = rules.pay;
  const max = p ? (p.multiYear ? p.agreementMaxYears : 1) : 1;
  if (a.years < 1 || a.years > max || !Number.isInteger(a.years)) return { ok: false, reason: 'length' };
  if (a.amountPerYear < 0 || a.buyout < 0) return { ok: false, reason: 'negative' };
  if (p?.agentFeeCapPct != null && a.agentFeePct !== null && a.agentFeePct > p.agentFeeCapPct) return { ok: false, reason: 'agent_fee_over_cap' };
  return { ok: true };
}

/**
 * Payments by month of the agreement year (T7.3.2 rule 3), as shares that sum to 1. The starting form
 * is equal months; the month the school holds until the last game is still an equal share.
 */
export function paymentShares(schedule: PaySchedule, months: number, bowlMonthIndex: number): readonly number[] {
  const out = new Array<number>(months).fill(0);
  if (schedule === 'half_and_half') { out[0] = 1 / (1 + 1); out[months - 1] = 1 / (1 + 1); return out; }
  if (schedule === 'bowl_month_bonus') {
    const bonus = (1 + 1 / (1 + 1)); // the bowl month at 150 percent of a regular month
    const unit = 1 / (months - 1 + bonus);
    for (let m = 0; m < months; m++) out[m] = m === bowlMonthIndex ? unit * bonus : unit;
    return out;
  }
  for (let m = 0; m < months; m++) out[m] = 1 / months;
  return out;
}

/** Whether a buyout is enforced when the player leaves (T7.3.2 rule 2: case by case, no ruling yet). */
export function buyoutEnforced(rng: Stream): boolean {
  return rng.uniform() < param('buyoutEnforcedChance');
}

/** Share of the academic year as a fraction (percent helper for screens). */
export const toPercent = (share: number): number => share * U.percent;
