// League hub sources (unstarted-work item 2a): the six league pages and the legends browser fed from the
// running season. The league pages read the season session through app-services' `LiveLeague` (standings,
// schedule, team pages, the wire, news, awards and records, with polls, rankings and bowls when the season
// computes them); the legends browser reads the generated world the career began from. A page whose source
// is missing gets no route (the shell shows its placeholder), so a quick-start season without a world
// shows legends as not yet available rather than an empty browser.
import { leaguePages, legends as legendsModels, newgame, type play } from '@gm/app-services';
import type { RouteSources } from '../../routes.ts';
import type { ScreenProps } from '../../shell/index.ts';
import type { LegendsData } from '../../screens/legends/types.ts';
import { st, stOrNull } from './text.ts';

/** What every hub's sources are built from: the season session, the league content and the world, if any. */
export interface HubSourceInput {
  readonly season: play.SeasonPlay;
  /** The four league files the season was built from (`LeagueContent`). */
  readonly content: Parameters<typeof play.SeasonPlay.start>[0];
  /** The generated world the career began from (new-game picker), or null for a quick start. */
  readonly world?: newgame.StartedWorld | null;
}

const TEXT: leaguePages.LiveLeagueText = {
  collegeCompetition: st('sources.league.collegeCompetition'),
  collegeGuests: st('sources.league.collegeGuests'),
  independents: st('sources.league.independents'),
  division: (conference, label) => st('sources.league.division', { conference, label: stOrNull(`sources.league.label.${label}`) ?? label }),
};

const intOf = (s: string | undefined): number | null => (s !== undefined && /^\d+$/.test(s) ? Number(s) : null);
const PAGE_KINDS: readonly string[] = legendsModels.PAGE_KINDS;

/** The legends query of a route's view options (`tab`, `kind`, `id`, `q`). */
export function legendsQuery(view: Readonly<Record<string, string>>): newgame.DraftLegendsQuery {
  const id = intOf(view.id);
  const link = view.kind && PAGE_KINDS.includes(view.kind) && id !== null ? { kind: view.kind as newgame.DraftLink['kind'], id } : null;
  return { ...(link ? { link } : {}), ...(view.tab === 'search' ? { search: view.q ?? '' } : {}) };
}

export function leagueSources(input: HubSourceInput): Pick<RouteSources, 'league' | 'legends'> {
  const live = new leaguePages.LiveLeague({ season: input.season, content: input.content, history: input.world ?? null, text: TEXT });
  const w = input.world ?? null;
  // Event line templates of the world's history log, as the legends browser words them.
  const lines: Record<string, string> = w ? newgame.draftLegends(w, {}).lineText : {};
  const text = (key: string): string | undefined => lines[key];
  const out: { -readonly [K in 'league' | 'legends']?: RouteSources[K] } = {
    league: {
      standings: () => live.standings(),
      schedule: (_p: ScreenProps, teamId: number | null) => live.schedule(teamId),
      team: (_p: ScreenProps, teamId: number) => live.team(teamId),
      transactions: () => live.transactions(),
      news: () => live.news(),
      records: (_p: ScreenProps, seasonYear: number | null) => live.records(seasonYear),
      text,
    },
  };
  if (w) {
    let index: ReturnType<typeof newgame.draftSearchIndex> | null = null;
    out.legends = {
      load: (p: ScreenProps): LegendsData => {
        const q = legendsQuery(p.location.view);
        if (q.search !== undefined && !index) index = newgame.draftSearchIndex(w);
        return newgame.draftLegends(w, q, index ?? undefined) as unknown as LegendsData;
      },
    };
  }
  return out as Pick<RouteSources, 'league' | 'legends'>;
}
