// Year-end settlement, carryover and the cash floor (C6.2.3, C6.2.4; CBA Art. 13 s.6(b)(v), s.6(c)(ii)-(iii), Art. 12 s.9).
import type { RuleSet } from '@gm/schema';
import type { CapContract } from './contract.ts';
import { pctOf } from './params.ts';

export interface SettlementInput {
  /** Room at the end of the club's final regular season game. */
  readonly roomCents: number;
  /** Carryover the owner named, or 'all' for all room (CBA Art. 13 s.6(b)(v)(2): dollars or a share of room). */
  readonly carryoverRequest: number | 'all';
  /** Likely-to-be-earned incentives counted this year but not earned. */
  readonly likelyNotEarnedCents: number;
  /** Not-likely incentives earned this year (never counted). */
  readonly unlikelyEarnedCents: number;
}

export interface SettlementResult {
  /** Carryover charged this year and credited next year; capped at room (s.6(b)(v)(2)). */
  readonly carryoverCents: number;
  /** Room left after the carryover charge, the room the netting uses (s.6(c)(ii), (iii)). */
  readonly roomAfterCarryoverCents: number;
  /** Incentive netting for next year, signed: positive is a credit, negative a charge. */
  readonly incentiveAdjustmentCents: number;
  /** Total change to next year's team salary room, signed. */
  readonly nextYearAdjustmentCents: number;
}

/**
 * Year-end close (C6.2.4). The CBA text nets incentives against room: a net overage of unearned likely
 * incentives is credited only to the extent it exceeds room after carryover (s.6(c)(iii)), and a net excess
 * of earned unlikely incentives is charged only to the extent it puts the club over the cap (s.6(c)(ii)).
 * C6.2.4 rule 1 states the netting without the room test; this follows the primary text (flagged in the PR).
 */
export function settleYear(s: SettlementInput): SettlementResult {
  const room = Math.max(0, s.roomCents);
  const carryoverCents = s.carryoverRequest === 'all' ? room : Math.min(Math.max(0, s.carryoverRequest), room);
  const roomAfter = room - carryoverCents;
  const net = s.likelyNotEarnedCents - s.unlikelyEarnedCents;
  const incentiveAdjustmentCents = net > 0 ? Math.max(0, net - roomAfter) : -Math.max(0, -net - roomAfter);
  return { carryoverCents, roomAfterCarryoverCents: roomAfter, incentiveAdjustmentCents, nextYearAdjustmentCents: carryoverCents + incentiveAdjustmentCents };
}

/** Cash a contract pays in a league year if every likely item is earned: salary, bonuses, tranches paid that year (C6.2.3 rule 1). */
export function cashInYear(c: CapContract, leagueYear: number): number {
  const y = c.years.find((x) => x.leagueYear === leagueYear);
  const salary = y ? y.base.amountCents + y.datedRosterBonuses.reduce((t, b) => t + b.amountCents, 0) + y.perGameRosterCents + y.workoutBonusCents + y.likelyIncentivesCents : 0;
  return salary + c.tranches.filter((t) => t.paidLeagueYear === leagueYear).reduce((t, b) => t + b.amountCents, 0);
}

export interface FloorResult { readonly requiredCents: number; readonly spentCents: number; readonly shortfallCents: number }

/** Minimum team cash spending over a period (C6.2.3 rule 2): a percent of the summed caps; the shortfall goes to the players. */
export function cashFloor(capsCents: readonly number[], cashSpentCents: readonly number[], rules: RuleSet): FloorResult {
  const requiredCents = pctOf(capsCents.reduce((t, v) => t + v, 0), rules.num('cap.min_cash_spend_pct'));
  const spentCents = cashSpentCents.reduce((t, v) => t + v, 0);
  return { requiredCents, spentCents, shortfallCents: Math.max(0, requiredCents - spentCents) };
}
