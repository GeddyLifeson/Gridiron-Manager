// E6.3.1 lifestyle tiers. The tier has no effect of any kind on football (rule 6).
import { param, TIERS, type LifestyleTier } from './params.ts';
import { dollars, type Cents } from './money.ts';

export interface Household { readonly partner: boolean; readonly children: number }

export function householdFactor(h: Household): number {
  return 1 + (h.partner ? param('householdPartnerAdd') : 0) + param('householdChildAdd') * h.children;
}

/** Rule 1: tier_base * cost_of_living_index * household_factor. Housing is separate (E6.4). */
export function monthlyLivingCost(tier: LifestyleTier, costOfLivingIndex: number, h: Household): Cents {
  return dollars(param(`tierBase.${tier}`) * costOfLivingIndex * householdFactor(h));
}

export interface LifestyleState {
  readonly tier: LifestyleTier;
  /** A downward move waiting out its delay (rule 3). */
  readonly pending?: { readonly tier: LifestyleTier; readonly monthsLeft: number };
}

/** Rule 3: moving up is immediate; moving down takes effect after the configured delay. */
export function chooseTier(s: LifestyleState, next: LifestyleTier): LifestyleState {
  if (TIERS.indexOf(next) >= TIERS.indexOf(s.tier)) return { tier: next };
  return { tier: s.tier, pending: { tier: next, monthsLeft: param('tierDownDelayMonths') } };
}

/** Advance one month; a pending downward move lands when its delay runs out. */
export function tickTier(s: LifestyleState): LifestyleState {
  if (!s.pending) return s;
  const left = s.pending.monthsLeft - 1;
  return left <= 0 ? { tier: s.pending.tier } : { tier: s.tier, pending: { tier: s.pending.tier, monthsLeft: left } };
}

/** The tier whose monthly cost is the largest that fits inside half of take-home pay (suggestion only). */
export function suggestedTier(monthlyTakeHome: Cents, costOfLivingIndex: number, h: Household): LifestyleTier {
  let best: LifestyleTier = 'bare';
  for (const t of TIERS) if (monthlyLivingCost(t, costOfLivingIndex, h) * 2 <= monthlyTakeHome) best = t;
  return best;
}
