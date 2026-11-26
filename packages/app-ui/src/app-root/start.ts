// Starts the career's season from what the new-game picker hands over (or a quick start for checks): the
// season session from app-services, adapted to the career root's port.
import { play, type newgame } from '@gm/app-services';
import { careerPortFromSeason, type SeasonPortHost } from './season-port.ts';
import type { CareerPort } from './port.ts';
import { hubSources } from './sources/index.ts';

/** The four league files the season is built from (world season `LeagueContent`); the shell host imports them. */
export type LeagueContent = Parameters<typeof play.SeasonPlay.start>[0];

export interface CareerSeasonStart {
  readonly level: 'pro' | 'college';
  readonly ruleSetId: string;
  readonly seasonYear: number;
  readonly seedHex: string;
  /** The seat: a content key, or a team of the generated world (the picker's LiveWorld). */
  readonly seat: { readonly key: string } | { readonly world: play.WorldTeams; readonly teamId: number };
}

export function startCareerSeason(content: LeagueContent, s: CareerSeasonStart, host: Omit<SeasonPortHost, 'level' | 'seasonYear'>): CareerPort {
  const base = { ruleSetId: s.ruleSetId, seasonYear: s.seasonYear, seedHex: s.seedHex };
  const sp = 'key' in s.seat
    ? play.SeasonPlay.start(content, { ...base, seatTeamKey: s.seat.key })
    : play.SeasonPlay.fromWorld(content, s.seat.world, { ...base, seatTeamId: s.seat.teamId });
  // Team strips from the content (club and school primary and secondary colours).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = content as any;
  const strips = new Map<string, { primary: string; alternate: string }>();
  for (const t of [...(c.proLeague?.league?.clubs ?? []), ...(c.college?.schools ?? [])]) if (t.primaryColour && t.secondaryColour) strips.set(t.id, { primary: t.primaryColour, alternate: t.secondaryColour });
  const port = careerPortFromSeason(sp, { colours: (key) => strips.get(key) ?? null, ...host, level: s.level, seasonYear: s.seasonYear });
  // The hubs' route sources, built once: the new-game seat hands over the generated world (its history).
  const world = 'world' in s.seat && isStartedWorld(s.seat.world) ? s.seat.world : null;
  const sources = hubSources({ season: sp, content, world });
  return { ...port, sources: () => sources };
}

/** The new-game picker's seat world is the whole generated world; a bare team list is not. */
function isStartedWorld(w: play.WorldTeams): w is newgame.StartedWorld {
  const x = w as Partial<newgame.StartedWorld>;
  return x.people instanceof Map && x.jobs instanceof Map && x.log !== undefined && Array.isArray(x.seasons);
}

/** First team of the level in the content: the quick start's seat (a check entry, not a career choice). */
export function firstTeamKey(content: LeagueContent, level: 'pro' | 'college'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = content as any;
  const rows: { id: string }[] = level === 'pro' ? c.proLeague?.league?.clubs ?? [] : c.college?.schools ?? [];
  if (!rows[0]) throw new Error(`no ${level} team in the league content`);
  return rows[0].id;
}
