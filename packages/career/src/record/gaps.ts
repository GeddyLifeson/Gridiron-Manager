// What a rung cannot show (S8.3.1, E9.5.1 rule 6) and when a recommendation is scored (E9.4.5 rule 1).
import type { WorldDate } from '@gm/schema';
import { DUTY_FAMILIES, type DutyFamilyId } from './families.ts';
import { dayNumber } from './record.ts';
import { param } from './params.ts';

/** A past seat's duty set (S3.1.1 O and R marks). */
export interface HeldSeat { readonly duties: readonly DutyFamilyId[] }

/** Every duty family he has held in any seat. */
export function dutiesHeld(seats: readonly HeldSeat[]): Set<DutyFamilyId> {
  const out = new Set<DutyFamilyId>();
  for (const s of seats) for (const d of s.duties) out.add(d);
  return out;
}

/**
 * S8.3.1 "new to you" list: duty families of the new seat absent from his history, in S3.1.1 order. A
 * statement of fact: no penalty, no cover (rule 2). `paperDuties` are those a higher start's generated
 * history covers (S8.3.1 edge case): left off the list while his record still reads "no record" for them.
 */
export function newToYou(seatDuties: readonly DutyFamilyId[], held: ReadonlySet<DutyFamilyId>, paperDuties: readonly DutyFamilyId[] = []): DutyFamilyId[] {
  const paper = new Set(paperDuties);
  const want = new Set(seatDuties);
  return DUTY_FAMILIES.filter((d) => want.has(d) && !held.has(d) && !paper.has(d));
}

// ---- E9.4.5 rule 1: one score per recommendation, when its window closes ----

export type RecommendationKind = 'grade' | 'recommendation' | 'prospect' | 'recruit';

export interface PendingRecommendation {
  /** Id of the event that logged the recommendation. */
  readonly eventId: number;
  readonly kind: RecommendationKind;
  readonly madeOn: WorldDate;
  /** End of the season it was made in (H6.6.2: 4 weeks or season end, whichever first). */
  readonly seasonEnd: WorldDate;
  /** For draft and recruit grades: the player's first season with the team, or null if he never joined. */
  readonly firstSeason: number | null;
}

/** The date the outcome window closes, or null when it cannot close yet (prospect never joined). */
export function windowCloses(r: PendingRecommendation): { seasonYear: number; dayIndex: number } | null {
  if (r.kind === 'prospect' || r.kind === 'recruit') {
    if (r.firstSeason === null) return null;
    // After the player's second season: the window closes when the season after it begins.
    return { seasonYear: r.firstSeason + param('prospectWindowSeasons'), dayIndex: 0 };
  }
  const span = param('daysPerSeasonYear');
  const byDays = dayNumber(r.madeOn) + param('recommendationWindowDays');
  const close = Math.min(byDays, dayNumber(r.seasonEnd));
  return { seasonYear: Math.floor(close / span), dayIndex: close % span };
}

/**
 * Recommendations due for their single score on `now`, in event id order. Ones already scored are never
 * returned again (E9.4.5 acceptance: each is scored exactly once).
 */
export function dueForScoring(pending: readonly PendingRecommendation[], now: WorldDate, scored: ReadonlySet<number>): number[] {
  const today = dayNumber(now);
  const out: number[] = [];
  for (const r of pending) {
    if (scored.has(r.eventId)) continue;
    const c = windowCloses(r);
    if (c !== null && today >= c.seasonYear * param('daysPerSeasonYear') + c.dayIndex) out.push(r.eventId);
  }
  return out.sort((a, b) => a - b);
}
