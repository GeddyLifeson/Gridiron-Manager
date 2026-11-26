// X11.3.1 weekly top-up conditions on D13.3.6's pool refill: fill from people who already exist first,
// generate only when fewer than 3 qualifying candidates exist at the position, cap generation per
// position per week across the world, and never back-date a top-up person's history.
import type { RandomStream, WorldEvent } from '@gm/schema';
import { param } from './params.ts';

export interface TopUpNeed {
  readonly teamId: number;
  readonly position: string;
  /** People already in the world (released, unsigned undrafted, practice squad) who meet the team's minimum. */
  readonly existingCandidates: readonly number[];
  /** True for the college walk-on age band, false for the pro free-agent band. Read from the competition's rule file. */
  readonly walkOnBand: boolean;
}

export type TopUpFill =
  | { readonly kind: 'existing'; readonly personId: number }
  | { readonly kind: 'generate'; readonly ageYears: number }
  | { readonly kind: 'unfilled'; readonly reason: string };

/**
 * X11.3.1 order of fill for one week. Needs are handled in the order given; `generatedThisWeek` counts
 * generated people per position already this week across the world and is updated in place.
 */
export function fillTopUp(needs: readonly TopUpNeed[], s: RandomStream, generatedThisWeek: Map<string, number> = new Map()): TopUpFill[] {
  const taken = new Set<number>();
  return needs.map((n): TopUpFill => {
    const free = n.existingCandidates.filter((id) => !taken.has(id));
    if (free.length >= param('topUpMinPool') || (free.length > 0 && atCap(n.position, generatedThisWeek))) {
      taken.add(free[0]!);
      return { kind: 'existing', personId: free[0]! };
    }
    if (atCap(n.position, generatedThisWeek)) return { kind: 'unfilled', reason: `X11.3.1 cap of generated people at ${n.position} this week` };
    generatedThisWeek.set(n.position, (generatedThisWeek.get(n.position) ?? 0) + 1);
    const ageYears = n.walkOnBand
      ? s.int(param('topUpWalkOnAgeMin'), param('topUpWalkOnAgeMax'))
      : s.int(param('topUpProAgeMin'), param('topUpProAgeMax'));
    return { kind: 'generate', ageYears };
  });
}

function atCap(position: string, counts: Map<string, number>): boolean {
  return (counts.get(position) ?? 0) >= param('topUpMaxPerPositionWeek');
}

/** X11.3.1 acceptance: no top-up person has an event dated before his creation. */
export function backdatedEvents(personId: number, created: { seasonYear: number; dayIndex: number }, events: readonly WorldEvent[]): number[] {
  return events
    .filter((e) => e.actors.some((a) => a.personId === personId) || e.subjects.some((x) => x.kind === 'person' && x.id === personId))
    .filter((e) => e.when.date.seasonYear < created.seasonYear || (e.when.date.seasonYear === created.seasonYear && e.when.date.dayIndex < created.dayIndex))
    .map((e) => e.id);
}

/** X11.3.1 acceptance: at least 80 percent of in-season signings are people who existed before the week. */
export function existingShareInBand(existingSignings: number, generatedSignings: number): boolean {
  const n = existingSignings + generatedSignings;
  return n === 0 || existingSignings / n >= param('topUpExistingShareMin');
}
