// The staff relationship record and needs (L4.3.1). Staff reuse the player record of L1.1.1
// `{trust, respect, familiarity, role_belief}`; G-46 (player relationships) owns that type and is not
// merged yet, so this file declares the same four fields (contract note in the README: replace with the
// G-46 export when it lands). The only staff-specific addition is the need list. No staff member has a
// charisma, motivation or rating number (L4.3.1 acceptance); loyalty is derived (L4.4.3), never stored.
import { clamp, param } from './params.ts';

/** L1.1.1 relationship record, each 0 to 100. Truth: shown to the user as a band in words. */
export interface RelationRecord {
  readonly trust: number;
  readonly respect: number;
  readonly familiarity: number;
  readonly roleBelief: number;
}

/** L4.3.1 staff need types (starting set). */
export const STAFF_NEEDS = ['autonomy', 'credit', 'advancement', 'security', 'heard', 'family_time', 'loyalty_returned'] as const;
export type StaffNeed = (typeof STAFF_NEEDS)[number];

/** Weight of each need, 0 to 1, from his facets and values (D5 structure via U). Truth. */
export type NeedWeights = Readonly<Record<StaffNeed, number>>;

/** Weeks each need has gone unmet. */
export type NeedClock = Readonly<Record<StaffNeed, number>>;

export const freshClock = (): NeedClock => Object.fromEntries(STAFF_NEEDS.map((n) => [n, 0])) as NeedClock;

/** L4.3.1 `buy_in` toward the head coach: 0.5 trust + 0.3 respect + 0.2 role_belief (the L1 formula). */
export function buyIn(r: RelationRecord): number {
  return param('buyIn.trust') * r.trust + param('buyIn.respect') * r.respect + param('buyIn.roleBelief') * r.roleBelief;
}

export interface NeedWeekResult {
  readonly clock: NeedClock;
  readonly record: RelationRecord;
  /** Needs past the unmet line this week: each adds stress through the L1.1.5 / X5 mechanics (people.needs). */
  readonly stressFrom: readonly StaffNeed[];
}

/**
 * One week of needs (L4.3.1). A need that matters to him (weight at or above the floor) and went unmet
 * for the starting 6 weeks adds stress and costs 1 trust per week while it stays unmet.
 */
export function needWeek(record: RelationRecord, clock: NeedClock, weights: NeedWeights, metThisWeek: ReadonlySet<StaffNeed>): NeedWeekResult {
  const next: Record<string, number> = {};
  const stressFrom: StaffNeed[] = [];
  for (const n of STAFF_NEEDS) {
    const matters = weights[n] >= param('need.weightMin');
    next[n] = !matters || metThisWeek.has(n) ? 0 : clock[n] + 1;
    if (matters && next[n]! >= param('need.unmetWeeks')) stressFrom.push(n);
  }
  const trust = clamp(record.trust - stressFrom.length * param('need.trustLossPerWeek'), 0, 100);
  return { clock: next as NeedClock, record: { ...record, trust }, stressFrom };
}

/** Words for a 0 to 100 band (the user never sees the number, K9). */
export function band(x: number): 'poor' | 'cool' | 'steady' | 'warm' | 'strong' {
  if (x < 20) return 'poor';
  if (x < 40) return 'cool';
  if (x < 60) return 'steady';
  if (x < 80) return 'warm';
  return 'strong';
}
