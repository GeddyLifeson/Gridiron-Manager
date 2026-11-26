// S4.1.2 assignments: the boss's weekly plan (K3) needs a fixed set of products; each goes to the staff
// member whose duty set and trust fit best. The same procedure assigns AI juniors and the user.
import type { Draws } from '../profile/index.ts';
import { B, chance, share } from './params.ts';
import type { Boss } from './types.ts';

export interface ProductNeed {
  readonly productId: string;
  readonly family: string;
  /** Hours the product takes at a normal pace (G-55 duty `hoursEst`). */
  readonly hours: number;
}

export interface Junior {
  readonly personId: number;
  /** Families his seat may work (G-55 duty list for his rung). */
  readonly families: readonly string[];
  readonly trust: number;
  readonly available: boolean;
}

export interface WorkAssignment {
  readonly productId: string;
  readonly personId: number | null;
  readonly hours: number;
  /** Arrived after the staff meeting (a Thursday night request). */
  readonly late: boolean;
}

/** Hours a boss asks for a product: a sane estimate scaled up by his hours culture (S4.1.2). */
export function assignedHours(boss: Boss, hours: number): number {
  return hours * (1 + B('hours_culture_slope') * share(boss.facets.hoursCulture));
}

/**
 * Assign every product. Best fit = a junior whose seat covers the family, highest trust, then lowest
 * person id (a fixed order, so the draw never depends on input order). Nobody fits: the boss keeps it.
 */
export function assignWeek(boss: Boss, needs: readonly ProductNeed[], staff: readonly Junior[], draws: Draws): WorkAssignment[] {
  const pLate = chance(B('late_request_max') * share(boss.facets.hoursCulture));
  const pool = staff.filter((j) => j.available).slice().sort((a, b) => b.trust - a.trust || a.personId - b.personId);
  return needs.map((n) => {
    const who = pool.find((j) => j.families.includes(n.family)) ?? null;
    return { productId: n.productId, personId: who ? who.personId : null, hours: assignedHours(boss, n.hours), late: draws.uniform() < pLate };
  });
}

/** Total hours one person was handed this week. */
export function hoursFor(personId: number, list: readonly WorkAssignment[]): number {
  return list.reduce((s, a) => s + (a.personId === personId ? a.hours : 0), 0);
}

/** S4.1.2 edge case: two bosses can over-assign the same hours. True when the total passes the week cap. */
export function overAssigned(personId: number, lists: readonly (readonly WorkAssignment[])[]): boolean {
  return lists.reduce((s, l) => s + hoursFor(personId, l), 0) > B('week_hours_cap');
}

/** Asking once for more time (S4.1.2): costs a little standing with a high-standards boss, nothing with others. */
export function moreTimeCost(boss: Boss): number {
  return boss.facets.standards >= B('more_time_standards') ? B('more_time_trust_cost') : 0;
}
