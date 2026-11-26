// League pages screen package entry (unbuilt-work item 5). The exports integrator adds
// `if (s.league) putAll(leagueRoutes(s.league))` to buildRoutes, a `league?: Args<typeof leagueRoutes>[0]`
// field to RouteSources, and re-exports this folder from @gm/app-ui. A page whose loader the host does not
// supply gets no route, so it stays a placeholder until its read model is wired.
import { createElement } from 'react';
import type { RouteTable, ScreenProps } from '../../shell/index.ts';
import {
  NewsScreen, RecordsScreen, ScheduleScreen, StandingsScreen, TeamPage, TransactionsScreen,
  parseRecordsTab, parseStandingsTab, parseWireFilter, type TextOf,
} from './LeagueScreens.tsx';
import type { NewsView, RecordsView, ScheduleView, StandingsView, TeamPageView, TransactionsView } from './types.ts';

export * from './types.ts';
export * from './LeagueScreens.tsx';

/** Registry screen ids this package fills (screens.json hub league). */
export const LEAGUE_SCREEN_IDS = {
  standings: 'league.standings', schedule: 'league.schedule', team: 'league.team',
  transactions: 'league.transactions', news: 'league.news', records: 'league.records',
} as const;

/** Route path of a team page (screens.json `/league/team/:teamId`). */
export const teamPath = (teamId: number): string => `/league/team/${teamId}`;

const intOf = (s: string | undefined): number | null => (s !== undefined && /^\d+$/.test(s) ? Number(s) : null);

/**
 * What the composition root supplies. Each loader returns the current read-model data (leagueStandings,
 * leagueSchedule, leagueTeam, leagueTransactions, leagueNews, leagueRecords) for the route's view options.
 */
export interface LeagueHost {
  standings?(p: ScreenProps): StandingsView | null;
  schedule?(p: ScreenProps, teamId: number | null): ScheduleView | null;
  team?(p: ScreenProps, teamId: number): TeamPageView | null;
  transactions?(p: ScreenProps): TransactionsView | null;
  news?(p: ScreenProps): NewsView | null;
  records?(p: ScreenProps, seasonYear: number | null): RecordsView | null;
  text?: TextOf;
}

export function leagueRoutes(host: LeagueHost): RouteTable {
  const t: RouteTable = {};
  const open = (p: ScreenProps) => (teamId: number) => p.navigate(teamPath(teamId));
  const txt = host.text ? { text: host.text } : {};
  if (host.standings) {
    const load = host.standings;
    t[LEAGUE_SCREEN_IDS.standings] = { render: (p) => createElement(StandingsScreen, { view: load(p), tab: parseStandingsTab(p.location.view.tab), onTab: (tab) => p.setView({ ...p.location.view, tab }), onOpen: open(p), ...txt }) };
  }
  if (host.schedule) {
    const load = host.schedule;
    t[LEAGUE_SCREEN_IDS.schedule] = {
      render: (p) => createElement(ScheduleScreen, {
        view: load(p, intOf(p.location.view.team)), week: intOf(p.location.view.week),
        onWeek: (week) => p.setView({ ...p.location.view, week: String(week) }),
        onTeam: (teamId) => {
          const { team: _drop, ...rest } = p.location.view;
          p.setView(teamId === null ? rest : { ...rest, team: String(teamId) });
        },
        onOpen: open(p),
      }),
    };
  }
  if (host.team) {
    const load = host.team;
    t[LEAGUE_SCREEN_IDS.team] = {
      render: (p) => {
        const id = intOf(p.location.params.teamId);
        return createElement(TeamPage, {
          view: id === null ? null : load(p, id), loaded: true, onOpen: open(p),
          onSchedule: (teamId) => p.navigate(`/league/schedule?team=${teamId}`), ...txt,
        });
      },
    };
  }
  if (host.transactions) {
    const load = host.transactions;
    t[LEAGUE_SCREEN_IDS.transactions] = { render: (p) => createElement(TransactionsScreen, { view: load(p), filter: parseWireFilter(p.location.view.filter), onFilter: (filter) => p.setView({ ...p.location.view, filter }), onOpen: open(p), ...txt }) };
  }
  if (host.news) {
    const load = host.news;
    t[LEAGUE_SCREEN_IDS.news] = {
      render: (p) => createElement(NewsScreen, {
        view: load(p), kind: p.location.view.kind ?? null, onOpen: open(p), ...txt,
        onKind: (kind) => { const { kind: _drop, ...rest } = p.location.view; p.setView(kind === null ? rest : { ...rest, kind }); },
      }),
    };
  }
  if (host.records) {
    const load = host.records;
    t[LEAGUE_SCREEN_IDS.records] = {
      render: (p) => createElement(RecordsScreen, {
        view: load(p, intOf(p.location.view.season)), tab: parseRecordsTab(p.location.view.tab), onOpen: open(p), ...txt,
        onTab: (tab) => p.setView({ ...p.location.view, tab }),
        onSeason: (season) => { const { season: _drop, ...rest } = p.location.view; p.setView(season === null ? rest : { ...rest, season: String(season) }); },
      }),
    };
  }
  return t;
}
