// Bindings of battery items to the engine: which two policies run and which measure is read (Q3.1.1).
// A binding is admitted here only when both policies and the measure exist in the engine as the item
// states them. None do yet, so the list is empty and the battery reports every item NOT RUN: an honest
// INCOMPLETE, never a pass. What each group waits for is listed so the owning packages can wire it.
import type { ItemBinding } from './paired.ts';

export const ADMITTED_BINDINGS: readonly ItemBinding[] = [];

/** What the items of each leaf wait for before they can be bound. */
export const BINDING_NEEDS: Readonly<Record<string, string>> = {
  'Q3.2.1': 'concept-against-coverage contests in the tick engine (WP-23) and expected points on play-by-play rows (models, N2)',
  'Q3.2.2': 'rush counts and protection rules resolved by the tick engine (WP-23), with the pressure definition of J6.2.5',
  'Q3.2.3': 'box counts and blocking assignments resolved by the tick engine (WP-23)',
  'Q3.2.4': 'the engine-built win probability model (models, N2) and coach AI game management as a policy seat (G-59)',
  'Q3.2.5': 'install readiness and practice effects in games (G5, H3 through G-68), scouting-driven belief tracking in play calling (G-58 with G-66), and front fatigue in contests (D10 through WP-18)',
  'Q3.2.6': 'the long histories of Q2.5.1 (30-season runs, G-88) with a generated coach population (K2)',
};
