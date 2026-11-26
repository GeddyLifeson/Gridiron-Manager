// Starts the career's season from what the new-game picker hands over (or a quick start for checks): the
// season session from app-services, adapted to the career root's port.
import { play, type newgame } from '@gm/app-services';
import { careerPortFromSeason, type SeasonPortHost } from './season-port.ts';
import type { CareerPort, SeatWorld } from './port.ts';

/** The four league files the season is built from (world season `LeagueContent`); the shell host imports them. */
export type LeagueContent = Parameters<typeof play.SeasonPlay.start>[0];

export interface CareerSeasonStart {
  readonly level: 'pro' | 'college';
  readonly ruleSetId: string;
  readonly seasonYear: number;
  readonly seedHex: string;
  /** The seat: a content key, or a team of the generated world (the picker's LiveWorld). */
  readonly seat: { readonly key: string } | { readonly world: play.WorldTeams; readonly teamId: number };
  /** A season saved earlier (the career save): the season continues from it instead of starting fresh. */
  readonly restore?: play.SeasonPlaySave;
  /** The picker's whole world and the user's person id, for the team screens (absent on a quick start). */
  readonly live?: { readonly world: newgame.StartedWorld; readonly userPersonId: number | null };
}

export interface CareerSeasonHost extends Omit<SeasonPortHost, 'level' | 'seasonYear'> {
  /** Called with the season's save after every step the career takes (game day reached, game recorded, game delegated). */
  onSeasonChange?(save: play.SeasonPlaySave): void;
}

export function startCareerSeason(content: LeagueContent, s: CareerSeasonStart, host: CareerSeasonHost): CareerPort {
  const base = { ruleSetId: s.ruleSetId, seasonYear: s.seasonYear, seedHex: s.seedHex };
  const sp = s.restore ? play.SeasonPlay.restore(content, s.restore) : 'key' in s.seat
    ? play.SeasonPlay.start(content, { ...base, seatTeamKey: s.seat.key })
    : play.SeasonPlay.fromWorld(content, s.seat.world, { ...base, seatTeamId: s.seat.teamId });
  // Team strips from the content (club and school primary and secondary colours).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = content as any;
  const strips = new Map<string, { primary: string; alternate: string }>();
  for (const t of [...(c.proLeague?.league?.clubs ?? []), ...(c.college?.schools ?? [])]) if (t.primaryColour && t.secondaryColour) strips.set(t.id, { primary: t.primaryColour, alternate: t.secondaryColour });
  const { onSeasonChange, ...portHost } = host;
  const base0 = careerPortFromSeason(sp, { colours: (key) => strips.get(key) ?? null, ...portHost, level: s.level, seasonYear: s.seasonYear });
  // Every step that moves the season hands its save to the host (the career save writes it).
  const saved = <A extends unknown[]>(f: (...a: A) => void) => (...a: A) => { f(...a); onSeasonChange?.(sp.save()); };
  const port: CareerPort = onSeasonChange ? { ...base0, advanceToGameDay: saved(base0.advanceToGameDay), finishGame: saved(base0.finishGame), delegateGame: saved(base0.delegateGame) } : base0;
  const live = s.live;
  if (!live || !('world' in s.seat)) return port;
  const seat: SeatWorld = {
    world: live.world, teamId: s.seat.teamId, userPersonId: live.userPersonId, level: s.level,
    leagueRules: s.level === 'pro' ? c.proLeagueRules : c.collegeLeagueRules,
  };
  return { ...port, seatWorld: () => seat };
}

/** First team of the level in the content: the quick start's seat (a check entry, not a career choice). */
export function firstTeamKey(content: LeagueContent, level: 'pro' | 'college'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = content as any;
  const rows: { id: string }[] = level === 'pro' ? c.proLeague?.league?.clubs ?? [] : c.college?.schools ?? [];
  if (!rows[0]) throw new Error(`no ${level} team in the league content`);
  return rows[0].id;
}
