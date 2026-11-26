// Volume control and the always-shown floor (C10.7.1 rule 4, C10.3.1 rule 4), and the public injury
// view (C10.2.1): what a club filed, when inactives become public, and the staff's note on an opponent's
// filing record, which is a description of a record, never a rating. No true injury state is read here.
import type { NewsItem } from '@gm/schema';
import { param } from './params.ts';

export interface InboxContext {
  readonly clubId: number;
  readonly opponentId: number | null;
  /** People linked to the user: edges in his network (X7), his staff and players. */
  readonly linkedPersonIds: ReadonlySet<number>;
  /** Notability of a news item's source events (X4). */
  readonly notabilityOf: (item: NewsItem) => number;
}

/** C10.7.1 rule 4: the floor (club, opponent, linked people) always shows; the rest by X4 score. */
export function selectForInbox(items: readonly NewsItem[], ctx: InboxContext): NewsItem[] {
  return items.filter((i) =>
    i.subjectTeamIds.includes(ctx.clubId) ||
    (ctx.opponentId !== null && i.subjectTeamIds.includes(ctx.opponentId)) ||
    i.subjectPersonIds.some((p) => ctx.linkedPersonIds.has(p)) ||
    ctx.notabilityOf(i) >= param('inboxNotabilityFloor'));
}

/** C10.2.1 rule 4: inactive lists become public this many minutes before kickoff. Returns [day, minute]. */
export function inactivesPublicAt(kickoffDay: number, kickoffMinute: number, minutesPerDay: number): readonly [number, number] {
  const t = kickoffDay * minutesPerDay + kickoffMinute - param('inactivesLeadMinutes');
  const d = Math.floor(t / minutesPerDay);
  return [d, t - d * minutesPerDay];
}

/** One past filing of a club for a player (C11.3.1 statuses) against whether he then played. */
export interface FilingRecord { readonly status: string; readonly played: boolean }

export interface StaffNote {
  readonly status: string;
  readonly listed: number;
  readonly playedAfter: number;
  readonly filings: number;
}

/**
 * C10.2.1 rule 3: the staff's read on an opponent coach's filings, as counts ("listed questionable in 9
 * of the last 11 weeks and played each time"). Null below the starting minimum of past filings.
 */
export function staffNote(filings: readonly FilingRecord[], status: string): StaffNote | null {
  if (filings.length < param('staffNoteMinFilings')) return null;
  const listed = filings.filter((f) => f.status === status);
  return { status, listed: listed.length, playedAfter: listed.filter((f) => f.played).length, filings: filings.length };
}
