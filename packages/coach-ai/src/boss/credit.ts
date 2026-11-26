// S4.4.2 credit and blame: whose name is on a success or a failure. By default credit flows up and blame
// flows down, more so under a low-loyalty boss. Returns reputation shares by audience (E5 applies them).
import { B, clamp, share } from './params.ts';
import type { Boss } from './types.ts';

export type CreditChoice = 'let_boss' | 'claim' | 'give_down';

export interface CreditOutcome {
  /** Share of the outside credit (coaches, media) that lands on the junior, 0 to 1. */
  readonly outsideShare: number;
  /** Share of the blame for a failure that lands on the junior, 0 to 1. */
  readonly blameShare: number;
  /** Credit inside the building: the boss knows who did the work. */
  readonly buildingShare: number;
  readonly relationshipDelta: number;
  /** Standing with his own juniors (L4). */
  readonly juniorsDelta: number;
}

/** The boss's share of credit by default: high at low loyalty, lower when he names his assistants. */
export function bossCreditShare(boss: Boss): number {
  const lo = B('credit_up_low'), hi = B('credit_up_high');
  return lo + (hi - lo) * share(boss.facets.loyaltyToStaff);
}

/**
 * One notable result. `workShare` is the junior's part of the work behind it, 0 to 1, from the
 * consequence links in his grade records.
 */
export function credit(boss: Boss, workShare: number, choice: CreditChoice): CreditOutcome {
  const w = clamp(workShare, 0, 1);
  const up = bossCreditShare(boss);
  let outside = w * (1 - up), rel = 0, juniors = 0;
  if (choice === 'claim') { outside = clamp(outside + B('credit_claim_gain') * w, 0, 1); rel = -B('credit_claim_cost'); }
  if (choice === 'give_down') { outside = outside / 2; juniors = B('credit_give_gain'); }
  // Blame flows down: the mirror of credit flowing up.
  // A disloyal boss also lets blame for others' work spill onto the junior.
  const blame = clamp(w * up + (1 - w) * up * (1 - share(boss.facets.loyaltyToStaff)), 0, 1);
  return { outsideShare: outside, blameShare: blame, buildingShare: w, relationshipDelta: rel, juniorsDelta: juniors };
}
