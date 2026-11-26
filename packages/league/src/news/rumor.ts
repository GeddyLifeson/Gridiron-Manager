// X12.2.2 rumor against fact. A rumor is a delivery with no event behind it, created only by L6 media
// speculation. It never enters the X2 log and never counts as label evidence. It is shown "Reported"
// with its source, then "Confirmed" when a matching public event follows, or "Did not happen" once a
// cycle passes without one. About an imported (protected) person, speculation may only report football
// results (X14.1.2).
import type { PersonOrigin, WorldEvent } from '@gm/schema';
import { param } from './params.ts';

export type RumorStatus = 'reported' | 'confirmed' | 'did_not_happen';

/** Claim kinds L6 may raise. `football_result` is the only kind allowed about an imported person. */
export const RUMOR_CLAIMS = ['football_result', 'hot_seat', 'job_interest', 'player_interest', 'release_coming', 'locker_room', 'injury_worse'] as const;
export type RumorClaim = (typeof RUMOR_CLAIMS)[number];

export interface Rumor {
  readonly id: number;
  readonly claim: RumorClaim;
  readonly aboutPersonIds: readonly number[];
  readonly aboutTeamIds: readonly number[];
  readonly outletId: number;
  readonly reportedDay: number;
  /** Event type that would confirm it (for example a firing for `hot_seat`). */
  readonly confirmingType: string;
  readonly status: RumorStatus;
  readonly resolvedDay: number | null;
  readonly confirmedByEventId: number | null;
}

/** X14.1.2 / X12.2.2: may this rumor be raised at all? */
export function rumorAllowed(claim: RumorClaim, aboutPersonIds: readonly number[], originOf: (id: number) => PersonOrigin | undefined): boolean {
  if (claim === 'football_result') return true;
  return !aboutPersonIds.some((p) => originOf(p) === 'imported');
}

/**
 * Resolve open rumors against the log on `today`. A matching public event of the confirming type about
 * any named person or team, dated on or after the report, confirms it; with none, it is marked "Did not
 * happen" once `rumorCycleDays` have passed. Resolved rumors are returned unchanged.
 */
export function resolveRumors(rumors: readonly Rumor[], rows: readonly WorldEvent[], dayOf: (e: WorldEvent) => number, today: number): Rumor[] {
  return rumors.map((r) => {
    if (r.status !== 'reported') return r;
    const hit = rows.find((e) =>
      e.type === r.confirmingType && e.witnesses.kind === 'public' && dayOf(e) >= r.reportedDay && dayOf(e) <= today &&
      (e.actors.some((a) => r.aboutPersonIds.includes(a.personId)) ||
        e.subjects.some((s) => (s.kind === 'person' && r.aboutPersonIds.includes(s.id)) || (s.kind === 'team' && r.aboutTeamIds.includes(s.id))) ||
        (e.where.teamId !== null && r.aboutTeamIds.includes(e.where.teamId))));
    if (hit) return { ...r, status: 'confirmed', resolvedDay: dayOf(hit), confirmedByEventId: hit.id };
    if (today - r.reportedDay >= param('rumorCycleDays')) return { ...r, status: 'did_not_happen', resolvedDay: today, confirmedByEventId: null };
    return r;
  });
}
