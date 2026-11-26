// Starts the career's season from what the new-game picker hands over (or a quick start for checks): the
// season session from app-services, adapted to the career root's port.
import { play, weekLoop } from '@gm/app-services';
import { careerPortFromSeason, type SeasonPortHost } from './season-port.ts';
import type { CareerPort } from './port.ts';

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
  const markets = new Map<string, number>();
  for (const t of c.proLeague?.league?.clubs ?? []) if (typeof t.marketTier === 'number') markets.set(t.id, t.marketTier);
  for (const t of c.college?.schools ?? []) if (typeof t.sizeTier === 'number') markets.set(t.id, t.sizeTier);
  // The league rules the week screens check the week against (H1.1.2), from the same file the season is built on.
  const ruleFile = s.level === 'pro' ? c.proLeagueRules : c.collegeLeagueRules;
  const weekRules = ruleFile?.values ? weekLoop.weekRules(ruleFile.values, s.level) : undefined;
  return careerPortFromSeason(sp, { colours: (key) => strips.get(key) ?? null, ...(weekRules ? { weekRules } : {}), venues: weekLoop.venuesOf(content, s.level), marketOf: (key) => markets.get(key) ?? null, ...host, level: s.level, seasonYear: s.seasonYear });
}

/** First team of the level in the content: the quick start's seat (a check entry, not a career choice). */
export function firstTeamKey(content: LeagueContent, level: 'pro' | 'college'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = content as any;
  const rows: { id: string }[] = level === 'pro' ? c.proLeague?.league?.clubs ?? [] : c.college?.schools ?? [];
  if (!rows[0]) throw new Error(`no ${level} team in the league content`);
  return rows[0].id;
}
