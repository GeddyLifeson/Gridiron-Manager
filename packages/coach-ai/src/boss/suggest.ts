// K6.5.1 decisions the junior does not own. The boss runs the standard procedures (K3, K4, K5); where a
// procedure consumes a staff product the junior's duty produces, the junior's actual product is the input.
// The boss cannot see the truth behind it: a wrong tag becomes a wrong belief and the game result follows.
import type { Draws } from '../profile/index.ts';
import { acceptChance } from './trust.ts';
import type { Boss } from './types.ts';

export interface ProductSource<P> {
  /** The junior's product, or null when he missed the deadline. */
  readonly submitted: P | null;
  /** The fallback another staff member makes at that person's quality (K6.5.1 rule 3). */
  fallback(): P;
}

export interface ProductUsed<P> {
  readonly product: P;
  /** True when the deadline was missed and the fallback went in (graded as missing, S4.3.1). */
  readonly fallbackUsed: boolean;
}

/** K6.5.1 rules 1 and 3: the junior's product is the input; a miss puts the fallback in. */
export function productForBoss<P>(src: ProductSource<P>): ProductUsed<P> {
  return src.submitted === null ? { product: src.fallback(), fallbackUsed: true } : { product: src.submitted, fallbackUsed: false };
}

export interface SuggestionResult {
  readonly accepted: boolean;
  readonly chance: number;
}

/**
 * K6.5.1 rule 4: a suggestion is weighed like any staff member's. `ownScore` (0 to 1) is how well it
 * scores in the boss's own estimates, never in truth.
 */
export function weighSuggestion(boss: Boss, trust: number, ownScore: number, draws: Draws): SuggestionResult {
  const p = acceptChance(boss, trust, ownScore);
  return { accepted: draws.uniform() < p, chance: p };
}
