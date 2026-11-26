// X11.2.1 cohort targets with their status. Measured anchors are fact rows (./data/facts.json) whose
// status is computed from their sources (Q6.1.2), never typed. Sizes for a world scale by its own team
// counts and draft length; derived multipliers are named starting values in ./params.ts.
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import factsJson from './data/facts.json' with { type: 'json' };
import { param } from './params.ts';
import type { CohortKind } from './kinds.ts';

export const COHORT_FACTS: readonly FactRow[] = FactFile.parse(factsJson).rows;

export function cohortFact(id: string): FactRow {
  const r = COHORT_FACTS.find((f) => f.id === id);
  if (!r) throw new Error(`unknown cohort fact ${id}`);
  return r;
}

/** Status of a fact row as computed from its sources. */
export function factStatus(id: string): FactStatus {
  return computeStatus(cohortFact(id));
}

/**
 * F-cohort-0004: age at the draft, 2015 to 2025 (shares of drafted players with an age). Ages outside
 * 20 to 26 are folded into the ends. Used as the age mix of the pro entry pool (X11.1.2 rule 1).
 */
export const PRO_ENTRY_AGE_SHARES: readonly (readonly [number, number])[] = [
  [20, 0.005], [21, 0.1698], [22, 0.3599], [23, 0.3474], [24, 0.102], [25, 0.0142], [26, 0.0018],
];

/** What a world tells the target table about itself. */
export interface WorldScale {
  /** Teams at the top college level in this world (T2.1). */
  readonly topCollegeTeams: number;
  /** Players the era's draft takes (C7, B12): rounds x pro teams plus compensatory picks. */
  readonly draftedCount: number;
  /** Open bottom-rung coach and staff chairs on the cohort date (X8.4.2). */
  readonly openEntryChairs: number;
  /** Retired players this year whose goal is to coach (X11.1.3 rule 1). */
  readonly retiredWouldBeCoaches: number;
  /** World-size preset share, 1 for a world of real size (X11.2.1: smaller presets scale by share). */
  readonly presetShare?: number;
}

export interface CohortTarget {
  readonly kind: CohortKind;
  readonly size: number;
  /** Weakest status among the facts and starting values behind the size. */
  readonly status: FactStatus;
  readonly basis: string;
}

const ORDER: readonly FactStatus[] = ['Verified', 'Rulebook only', '2 of 3', '1 of 3', 'Unverified', 'Conflict', 'Assumption'];
export function weakest(...s: FactStatus[]): FactStatus {
  return s.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), 'Verified' as FactStatus);
}

/** X11.2.1 target size of one cohort kind for one world and season. */
export function cohortTarget(kind: CohortKind, w: WorldScale): CohortTarget {
  const share = w.presetShare ?? 1;
  const signees = param('topSigneesPerTeam') * w.topCollegeTeams;
  switch (kind) {
    case 'recruit_class':
      return { kind, size: Math.round(signees * param('recruitTrackedPerSignee') * share), status: weakest(factStatus('F-cohort-0005'), 'Assumption'), basis: 'top-level signees per team x teams x recruitTrackedPerSignee' };
    case 'college_walk_on':
      return { kind, size: Math.round(signees * param('walkOnPerSignee') * share), status: 'Assumption', basis: 'no source read (T5 research owed)' };
    case 'pro_entry_pool':
      return { kind, size: Math.round(w.draftedCount * param('proPoolPerDrafted') * share), status: weakest(factStatus('F-cohort-0001'), 'Assumption'), basis: 'drafted count x proPoolPerDrafted' };
    case 'undrafted_pool':
      return { kind, size: Math.round(w.draftedCount * param('undraftedPerDrafted') * share), status: weakest(factStatus('F-cohort-0006'), 'Assumption'), basis: 'drafted count x undraftedPerDrafted' };
    case 'coach_staff_entry':
      return { kind, size: coachEntrySize(w.openEntryChairs, w.retiredWouldBeCoaches), status: 'Assumption', basis: 'X11.1.3 rule 1' };
  }
}

/** X11.1.3 rule 1: open chairs x surplus, rounded up, plus retired would-be coaches regardless of openings. */
export function coachEntrySize(openChairs: number, retiredWouldBeCoaches: number): number {
  return Math.ceil(openChairs * param('coachSurplus') - 1e-9) + retiredWouldBeCoaches;
}

/** X11.2.2: a cohort's size passes when within sizeTolShare of its target. */
export function sizeWithinTolerance(size: number, target: number): boolean {
  if (target === 0) return size === 0;
  return Math.abs(size - target) <= param('sizeTolShare') * target + 1e-9;
}
