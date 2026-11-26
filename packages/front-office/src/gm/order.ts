// K7.8.1 fixed order after each commit. Front-office steps run in club-id order unless a league rule sets the
// order (waiver priority, draft order); simultaneous markets run in rounds from one snapshot; random streams
// are scoped by date, club and decision type, so worker count cannot change a transaction log.
import { P } from './params.ts';
import type { ClubId } from './types.ts';

export const DECISIONS = ['needs', 'legality', 'injury', 'claims', 'practice_squad', 'trades', 'contracts', 'free_agency', 'draft', 'cutdown'] as const;
export type Decision = typeof DECISIONS[number];

/** Rule 1. `ruleOrder` is the league's own order where a rule defines one; clubs it omits follow in id order. */
export function actingOrder(clubIds: readonly ClubId[], ruleOrder: readonly ClubId[] = []): ClubId[] {
  const listed = ruleOrder.filter((c) => clubIds.includes(c));
  const seen = new Set(listed);
  return [...listed, ...[...clubIds].filter((c) => !seen.has(c)).sort((a, b) => a - b)];
}

/** Rule 4: the scope values of the stream for one club's decision on one date. */
export function streamScope(seasonYear: number, dayIndex: number, clubId: ClubId, decision: Decision): readonly (string | number)[] {
  return ['frontOffice', seasonYear, dayIndex, clubId, decision];
}

/**
 * Rule 3: tier 1 and 2 clubs run everything. Tier 3 clubs run needs and mandatory legality every week and
 * the markets at a coarser step (X13.1.2 owns the detail; the step is a starting value).
 */
export function runsToday(tier: number, decision: Decision, dayIndex: number): boolean {
  if (tier < P('order.reducedTier')) return true;
  if (decision === 'needs' || decision === 'legality' || decision === 'injury' || decision === 'draft' || decision === 'cutdown') return true;
  return dayIndex % P('order.tier3MarketStepDays') === 0;
}

/** Rule 2: one market round. Every club forms offers from the same snapshot, then the players decide, then the snapshot advances. */
export function marketRound<S, O>(snapshot: S, clubIds: readonly ClubId[], offersOf: (clubId: ClubId, snapshot: S) => readonly O[], settle: (snapshot: S, offers: readonly O[]) => S): S {
  const offers = actingOrder(clubIds).flatMap((c) => offersOf(c, snapshot));
  return settle(snapshot, offers);
}
