// Read-model specs (P1.3.2) of the six league pages. app-services may not import zod (CR-G27-4), so each
// spec takes its data schema as a parameter, as the office and people specs do; the draft schemas sit in
// the test folder until the schema integrator moves them into @gm/schema. Every page is public (career
// ladder screens.json: kind public), so no task id gates them; they are Read for every seat.
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildStandings, type StandingsSource } from './standings.ts';
import { buildSchedule } from './schedule.ts';
import { buildTeamPage } from './team.ts';
import { buildNews, buildTransactions, type WireContext } from './wire.ts';
import { buildRecords, type RecordsSource } from './records.ts';
import type { NewsView, RecordsView, ScheduleView, StandingsView, TeamPageView, TransactionsView } from './types.ts';

export const LEAGUE_MODELS = {
  standings: 'leagueStandings', schedule: 'leagueSchedule', team: 'leagueTeam',
  transactions: 'leagueTransactions', news: 'leagueNews', records: 'leagueRecords',
} as const;

/** Registry screen id of each page (app-ui shell/screens.json). */
export const LEAGUE_SCREEN_IDS = {
  standings: 'league.standings', schedule: 'league.schedule', team: 'league.team',
  transactions: 'league.transactions', news: 'league.news', records: 'league.records',
} as const;

export type LeagueSchemas = Readonly<Record<keyof typeof LEAGUE_MODELS, Schema>>;

/** What the season side supplies: league tables computed with seeded draws, record books, and the viewer's context. */
export interface LeagueSources {
  standings(competitionId: number, seasonYear: number): StandingsSource;
  records?(competitionId: number): RecordsSource;
  /** The viewer's club, this week's opponent and ready list, for the wire filters (C10.1). */
  context?(): WireContext;
}

type CS = { competitionId: number; seasonYear: number };

export function leagueSpecs(data: LeagueSchemas, src: LeagueSources): {
  standings: ReadModelSpec<CS, StandingsView>;
  schedule: ReadModelSpec<CS & { teamId: number | null }, ScheduleView>;
  team: ReadModelSpec<{ teamId: number; seasonYear: number }, TeamPageView | null>;
  transactions: ReadModelSpec<{ competitionId: number | null }, TransactionsView>;
  news: ReadModelSpec<Record<string, never>, NewsView>;
  records: ReadModelSpec<{ competitionId: number; seasonYear: number | null }, RecordsView>;
} {
  return {
    standings: { name: LEAGUE_MODELS.standings, data: data.standings, build: (w, p) => ({ data: buildStandings(w, p.competitionId, p.seasonYear, src.standings(p.competitionId, p.seasonYear)) }) },
    schedule: { name: LEAGUE_MODELS.schedule, data: data.schedule, build: (w, p) => ({ data: buildSchedule(w, p.competitionId, p.seasonYear, p.teamId) }) },
    team: { name: LEAGUE_MODELS.team, data: data.team, build: (w, p) => ({ data: buildTeamPage(w, p.teamId, p.seasonYear) }) },
    transactions: { name: LEAGUE_MODELS.transactions, data: data.transactions, build: (w, p) => ({ data: buildTransactions(w, p.competitionId, src.context?.() ?? {}) }) },
    news: { name: LEAGUE_MODELS.news, data: data.news, build: (w) => ({ data: buildNews(w, src.context?.() ?? {}) }) },
    records: { name: LEAGUE_MODELS.records, data: data.records, build: (w, p) => ({ data: buildRecords(w, p.competitionId, p.seasonYear, src.records?.(p.competitionId) ?? {}) }) },
  };
}
