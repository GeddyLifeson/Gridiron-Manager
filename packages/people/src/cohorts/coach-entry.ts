// X11.1.3 the entry-level coach and staff cohort: size from open chairs plus a surplus, the background
// mix of generated entrants, the yearly decay of the unplaced pool, and the soak checks (unplaced share,
// ladder speed). Former players who retire with the goal to coach enter with their own record (they are
// not new people, X11.1.2 edge case), so only the generated part is drawn here.
import type { RandomStream } from '@gm/schema';
import { param } from './params.ts';
import { coachEntrySize } from './targets.ts';
import { median } from './day-one.ts';

export const COACH_BACKGROUNDS = ['college_only', 'former_pro', 'never_played'] as const;
export type CoachBackground = (typeof COACH_BACKGROUNDS)[number];

export interface CoachEntryPlan {
  /** Total cohort size (X11.1.3 rule 1). */
  readonly size: number;
  /** Former players entering with their identity (counted in size, never generated). */
  readonly formerPlayerIds: readonly number[];
  /** Backgrounds of the generated entrants, one per new person, in slot order. */
  readonly generated: readonly CoachBackground[];
}

/** X11.1.3 rules 1 and 2. One pick per generated entrant from `s`. */
export function planCoachEntry(openChairs: number, retiredWouldBeCoachIds: readonly number[], s: RandomStream): CoachEntryPlan {
  const size = coachEntrySize(openChairs, retiredWouldBeCoachIds.length);
  const nGen = Math.max(0, size - retiredWouldBeCoachIds.length);
  const w = [param('coachMixCollegeOnly'), param('coachMixFormerPro'), param('coachMixNeverPlayed')];
  const generated: CoachBackground[] = [];
  for (let i = 0; i < nGen; i++) generated.push(COACH_BACKGROUNDS[s.pick(w)]!);
  return { size, formerPlayerIds: [...retiredWouldBeCoachIds], generated };
}

/** X11.1.3 rule 4: each unplaced entrant leaves football with this chance per year unplaced. Returns those who leave. */
export function unplacedLeavers(unplacedIds: readonly number[], s: RandomStream): number[] {
  const p = param('coachUnplacedLeaveChance');
  return unplacedIds.filter(() => s.chance(p));
}

/** X11.1.3 acceptance: the yearly unplaced count stays within 10 to 40 percent of the cohort. */
export function unplacedShareInBand(unplaced: number, cohortSize: number): boolean {
  if (cohortSize === 0) return unplaced === 0;
  const share = unplaced / cohortSize;
  return share >= param('coachUnplacedBandLow') - 1e-9 && share <= param('coachUnplacedBandHigh') + 1e-9;
}

/** X11.1.3 rule 5: years from first coaching job to first top-level college head job; median 13 to 18. */
export function ladderSpeedInBand(yearsToFirstHeadJob: readonly number[]): boolean {
  if (yearsToFirstHeadJob.length === 0) return false;
  const m = median(yearsToFirstHeadJob);
  return m >= param('ladderYearsMedianLow') && m <= param('ladderYearsMedianHigh');
}
