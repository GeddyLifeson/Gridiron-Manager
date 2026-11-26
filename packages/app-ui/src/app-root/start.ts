// Starts the career's season from what the new-game picker hands over (or a quick start for checks): the
// season session from app-services, adapted to the career root's port.
import { play, weekLoop, type newgame } from '@gm/app-services';
import { careerPortFromSeason, type SeasonPortHost } from './season-port.ts';
import type { CareerPort, SeatWorld } from './port.ts';
import { DEFAULT_KEYMAP } from '../shell/keymap.ts';
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
  /** The picker's whole world and the user's person id, for the team screens (absent on a quick start). */
  readonly live?: { readonly world: newgame.StartedWorld; readonly userPersonId: number | null };
}

/** What the shell host supplies. Without `consoleConfig` the console calls from the football desk's sheets. */
export type CareerHost = Omit<SeasonPortHost, 'level' | 'seasonYear' | 'consoleConfig' | 'football'> & {
  readonly consoleConfig?: SeasonPortHost['consoleConfig'];
  /** Key bindings for the desk's console setup (sheet key hints skip the console's own keys). */
  readonly bindings?: readonly { readonly context: string; readonly keys: readonly string[] }[];
};

export function startCareerSeason(content: LeagueContent, s: CareerSeasonStart, host: CareerHost): CareerPort {
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
  // The seat's football desk (plan item 2b): the football screens and, unless the host overrides it, the console read it.
  // The port gets no bindings, so the console takes this setup rather than the week loop's own staff sheets: an edit
  // on the call sheet is the sheet called on game day.
  const football = new play.FootballDesk({ teamId: sp.seatTeamId, ruleSetId: s.ruleSetId, level: s.level });
  const { bindings = DEFAULT_KEYMAP.bindings, consoleConfig, ...rest } = host;
  const port = careerPortFromSeason(sp, {
    colours: (key) => strips.get(key) ?? null, ...(weekRules ? { weekRules } : {}), venues: weekLoop.venuesOf(content, s.level), marketOf: (key) => markets.get(key) ?? null,
    ...rest, level: s.level, seasonYear: s.seasonYear, football,
    consoleConfig: consoleConfig ?? ((gameId) => football.consoleConfig(gameId, bindings)),
  });
  // Screens that edit hub state (the football desk) ask the root to redraw through the port's subscription.
  const redraws = new Set<() => void>();
  const changed = () => { for (const f of redraws) f(); };
  // The hubs' route sources, built once: the new-game seat hands over the generated world (its history).
  const world = s.live?.world ?? ('world' in s.seat && isStartedWorld(s.seat.world) ? s.seat.world : null);
  const sources = hubSources({ season: sp, content, world, football, changed, print: () => globalThis.print?.() });
  const hub = { ...port, sources: () => sources, subscribe: (f: () => void) => { redraws.add(f); return () => { redraws.delete(f); }; } };
  const live = s.live;
  if (!live || !('world' in s.seat)) return hub;
  const seat: SeatWorld = {
    world: live.world, teamId: s.seat.teamId, userPersonId: live.userPersonId, level: s.level,
    leagueRules: s.level === 'pro' ? c.proLeagueRules : c.collegeLeagueRules,
  };
  return { ...hub, seatWorld: () => seat };
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
