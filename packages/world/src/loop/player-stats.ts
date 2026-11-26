// Player statistics kept by the world (D14.2, X13.1.1 "box score and season lines kept"): each person's
// season totals, regular season and postseason apart (X3.4.1 rule 1), and his career totals folded in when
// the next season's first game is played. Fed by the games step from `GamePlayed.lines`, which only a port
// whose rosters are world people reports (world/gameday). Records, notability and honours read these; the
// books themselves belong to the statistics step (X3.4.1).
//
// `games_played` is the world's own count: a person with any credit in a game (a snap is a credit, D14.1.1)
// played in it. Plain data only: it is folded into `worldHash`.
import type { GameLine, LiveWorld } from './types.ts';

/** `LiveWorld.systemState` key of the player statistics. */
export const PLAYER_STATS_KEY = 'players.stats';
export const GAMES_PLAYED = 'games_played';

export type StatTotals = Record<string, number>;
export interface PersonSeason { teamId: number; regular: StatTotals; postseason: StatTotals }
export interface PersonCareer { seasons: number; regular: StatTotals; postseason: StatTotals }

export interface PlayerStats {
  /** Season the `season` totals belong to (null before the first reported game). */
  seasonYear: number | null;
  /** Person id to his totals this season (the last club he played for). */
  season: Record<string, PersonSeason>;
  /** Person id to his career totals through the last finished season. */
  careers: Record<string, PersonCareer>;
}

export function playerStatsOf(world: LiveWorld): PlayerStats {
  let s = world.systemState.get(PLAYER_STATS_KEY) as PlayerStats | undefined;
  if (!s) { s = { seasonYear: null, season: {}, careers: {} }; world.systemState.set(PLAYER_STATS_KEY, s); }
  return s;
}

function add(into: StatTotals, from: StatTotals): void {
  for (const k of Object.keys(from).sort()) into[k] = (into[k] ?? 0) + from[k]!;
}

/** Folds the held season into the careers and empties it. Called when a new season's first lines arrive. */
export function closeStatSeason(s: PlayerStats): void {
  for (const id of Object.keys(s.season).sort((a, b) => Number(a) - Number(b))) {
    const row = s.season[id]!;
    const c = s.careers[id] ??= { seasons: 0, regular: {}, postseason: {} };
    c.seasons++;
    add(c.regular, row.regular);
    add(c.postseason, row.postseason);
  }
  s.season = {};
}

/** Adds one game's lines to the season totals (and the game counts). */
export function addGameLines(world: LiveWorld, kind: 'regular' | 'postseason', lines: readonly GameLine[]): void {
  const s = playerStatsOf(world);
  const year = world.date.seasonYear;
  if (s.seasonYear !== year) {
    if (s.seasonYear !== null) closeStatSeason(s);
    s.seasonYear = year;
  }
  const played = new Set<number>();
  for (const l of lines) {
    const row = s.season[l.personId] ??= { teamId: l.teamId, regular: {}, postseason: {} };
    row.teamId = l.teamId;
    const t = kind === 'postseason' ? row.postseason : row.regular;
    t[l.statId] = (t[l.statId] ?? 0) + l.value;
    if (!played.has(l.personId)) {
      played.add(l.personId);
      t[GAMES_PLAYED] = (t[GAMES_PLAYED] ?? 0) + 1;
    }
  }
}

/** A person's totals this season, or null when he has not played. */
export function seasonLineOf(world: LiveWorld, personId: number): PersonSeason | null {
  return (world.systemState.get(PLAYER_STATS_KEY) as PlayerStats | undefined)?.season[personId] ?? null;
}

/** A person's career totals through the last finished season, or null when he has none. */
export function careerOf(world: LiveWorld, personId: number): PersonCareer | null {
  return (world.systemState.get(PLAYER_STATS_KEY) as PlayerStats | undefined)?.careers[personId] ?? null;
}
