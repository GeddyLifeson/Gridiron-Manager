// S4.5.1 the boss's decision each offseason, and K6.5.2: the same procedure for every assistant. Turns the
// evaluation into what happens next: promoted, kept with a raise, kept, role reduced, not renewed, or
// "come with me" when the boss himself leaves.
import type { Draws } from '../profile/index.ts';
import { B, chance, clamp, share } from './params.ts';
import { perks } from './trust.ts';
import type { Boss } from './types.ts';

export type OffseasonDecision =
  | { readonly kind: 'promoted'; readonly seatId: string }
  | { readonly kind: 'kept_with_raise' }
  | { readonly kind: 'kept' }
  | { readonly kind: 'role_reduced' }
  | { readonly kind: 'not_renewed'; readonly reason: 'standards' | 'breach' | 'term_limit' }
  | { readonly kind: 'come_with_me'; readonly seatId: string }
  | { readonly kind: 'left_behind' };

export interface DecisionInput {
  readonly workerId: number;
  /** This season's evaluation overall, and last season's under this boss (null in his first). */
  readonly overall: number;
  readonly lastOverall: number | null;
  readonly trust: number;
  /** A seat one rung up on this staff, open now, or null. */
  readonly openSeatUp: string | null;
  /** Best outside candidate the boss knows for that seat, on the same 0 to 100 scale, or null. */
  readonly bestOutsideScore: number | null;
  /** He holds an outside offer (S6). */
  readonly outsideOffer: boolean;
  readonly seriousBreach: boolean;
  /** S4.5.1 edge case: a graduate assistant at his term limit must be promoted or leave. */
  readonly atTermLimit: boolean;
  /** Budget allows a raise (T9 or the pro staff budget). */
  readonly raiseBudget: boolean;
  /** The boss himself is leaving: the seat he could offer on the new staff, or null if he is simply gone. */
  readonly bossLeavingSeat: string | null | undefined;
}

/** The evaluation floor below which a boss stops renewing (S4.5.1): rises with his standards. */
export function standardsFloor(boss: Boss): number {
  return B('floor_base') + B('floor_slope') * boss.facets.standards;
}

/** Margin an outside candidate must beat the junior by: the boss's loyalty to his own staff. */
export function loyaltyMargin(boss: Boss): number {
  return B('loyalty_margin') * share(boss.facets.loyaltyToStaff);
}

/** Chance a leaving boss takes him along (S4.5.1: follows trust and loyalty_to_staff). */
export function comeWithMeChance(boss: Boss, trust: number): number {
  const t = clamp(trust / B('trust_max'), 0, 1);
  return chance(B('come_with_me_base') + B('come_with_me_span') * t * share(boss.facets.loyaltyToStaff));
}

export function offseasonDecision(boss: Boss, i: DecisionInput, draws: Draws): OffseasonDecision {
  if (i.bossLeavingSeat !== undefined) {
    if (i.bossLeavingSeat !== null && draws.uniform() < comeWithMeChance(boss, i.trust)) return { kind: 'come_with_me', seatId: i.bossLeavingSeat };
    return { kind: 'left_behind' };
  }
  const floor = standardsFloor(boss);
  const promotable = i.openSeatUp !== null && perks(boss, i.trust).nextRungDuty
    && (i.bestOutsideScore === null || i.bestOutsideScore <= i.overall + loyaltyMargin(boss));
  if (i.seriousBreach) return { kind: 'not_renewed', reason: 'breach' };
  if (promotable && i.overall >= floor) return { kind: 'promoted', seatId: i.openSeatUp! };
  if (i.atTermLimit) return { kind: 'not_renewed', reason: 'term_limit' };
  const below = i.overall < floor;
  if (below && i.lastOverall !== null && i.lastOverall < floor) return { kind: 'not_renewed', reason: 'standards' };
  if (below) return { kind: 'role_reduced' };
  if (i.outsideOffer && i.raiseBudget && i.trust >= B('raise_trust')) return { kind: 'kept_with_raise' };
  return { kind: 'kept' };
}
