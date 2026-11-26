// Shapes shared by the legends read models (G-84, bible X3). Every view is a query over X2 event rows
// that the observer filter has already passed (X3.1.3); nothing here is stored or authored.
import type { WorldEvent } from '@gm/schema';

export type EventRow = WorldEvent;
export type PersonId = number;
export type TeamId = number;

/** Page kinds of X3.1.1. */
export const PAGE_KINDS = ['person', 'team', 'game', 'competition_season', 'trophy', 'record', 'position'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/** A link resolves by id, never by name (X3.1.1 rule 5). */
export interface Link { readonly kind: PageKind; readonly id: number }

/**
 * Event type ids the legends views read. Other packages own the types; the integrator can bind other ids.
 * Defaults follow the names the world modules already use (G-22 reversals, G-43 honours).
 */
export interface LegendsTypes {
  readonly gameResult: string;
  readonly title: string;
  readonly conferenceTitle: string;
  /** Hires and departures; a change counts as a head coach change when payload `role` equals `headCoachRole`. */
  readonly coachChanges: readonly string[];
  /** The hire among `coachChanges`: it starts a staff stint (trees, head coaches per decade). */
  readonly coachHired: string;
  readonly headCoachRole: string;
  readonly record: string;
  readonly award: string;
  readonly vacated: readonly string[];
}

export const DEFAULT_TYPES: LegendsTypes = {
  gameResult: 'game_result',
  title: 'title_won',
  conferenceTitle: 'conference_title_won',
  coachChanges: ['coach_hired', 'coach_fired', 'coach_resigned'],
  coachHired: 'coach_hired',
  headCoachRole: 'head_coach',
  record: 'record_set',
  award: 'season_award',
  vacated: ['result_vacated', 'stat_corrected', 'award_rescinded'],
};

/** Where a day falls in a competition's year (C4, T4 calendars). Supplied by the calendar module. */
export type Section = 'preseason' | 'week' | 'postseason' | 'offseason';
export interface DayPlace { readonly section: Section; readonly week: number }
export type CalendarOf = (competitionId: number | null, seasonYear: number, dayIndex: number) => DayPlace;

/** Payload of a game result as the legends views read it. */
export interface GameScore {
  readonly eventId: number;
  readonly gameId: number;
  readonly seasonYear: number;
  readonly dayIndex: number;
  readonly competitionId: number | null;
  readonly homeTeamId: TeamId;
  readonly awayTeamId: TeamId;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly venueId: number | null;
  readonly postseason: boolean;
  readonly notability: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Reads a `game_result` row. Rows missing a score are skipped (null), never guessed. */
export function scoreOf(e: EventRow): GameScore | null {
  const p = e.payload;
  const home = num(p['homeTeamId']), away = num(p['awayTeamId']), hs = num(p['homeScore']), as = num(p['awayScore']);
  if (home === null || away === null || hs === null || as === null) return null;
  const game = e.subjects.find((s) => s.kind === 'game');
  return {
    eventId: e.id, gameId: game?.id ?? e.id, seasonYear: e.when.date.seasonYear, dayIndex: e.when.date.dayIndex, competitionId: e.competitionId,
    homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, venueId: e.where.venueId, postseason: p['postseason'] === true, notability: e.notability,
  };
}

/** Ids of rows a reversal names (X2.1.3); applied at read time (X3.4.1). */
export function reversedIds(rows: readonly EventRow[], types: LegendsTypes = DEFAULT_TYPES): Set<number> {
  const out = new Set<number>();
  for (const e of rows) if (types.vacated.includes(e.type) && e.causeId !== null) out.add(e.causeId);
  return out;
}

/** Every person an event names (actors and person subjects). */
export function personsOf(e: EventRow): number[] {
  const s = new Set<number>(e.actors.map((a) => a.personId));
  for (const x of e.subjects) if (x.kind === 'person') s.add(x.id);
  return [...s].sort((a, b) => a - b);
}

/** Every team an event names. */
export function teamsOf(e: EventRow): number[] {
  const s = new Set<number>();
  if (e.where.teamId !== null) s.add(e.where.teamId);
  for (const x of e.subjects) if (x.kind === 'team') s.add(x.id);
  for (const k of ['homeTeamId', 'awayTeamId', 'teamId', 'fromTeamId', 'toTeamId']) {
    const v = num(e.payload[k]);
    if (v !== null) s.add(v);
  }
  return [...s].sort((a, b) => a - b);
}

export const byDate = (a: EventRow, b: EventRow): number =>
  a.when.date.seasonYear - b.when.date.seasonYear || a.when.date.dayIndex - b.when.date.dayIndex || a.id - b.id;

/** Higher notability first, then date, then id (X4 ordering; unscored rows last). */
export const byNotability = (a: EventRow, b: EventRow): number => (b.notability ?? -1) - (a.notability ?? -1) || byDate(a, b);
