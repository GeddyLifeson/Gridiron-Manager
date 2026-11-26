// Ceremonial home games (T3.8.1): which home date is homecoming and which is senior day. Senior day is
// the last regular-season home game. Homecoming is picked by the athletic director: the home game
// against the opponent the school expects to beat, preferring non-conference or flexible slots (rule 1).
// The duties, choices and effects of the two days belong to the week and game-day modules (H1, H7, I1).
import { flag } from '../standings/params.ts';
import type { RuleValues, TeamId } from '../standings/types.ts';
import { KEY } from './params.ts';

export interface HomeDate {
  readonly gameId: number;
  readonly week: number;
  readonly opponent: TeamId;
  readonly conferenceGame: boolean;
  /** The athletic director's estimate of the opponent's strength (an observed value, never truth). */
  readonly opponentStrengthEstimate: number;
}

export interface CeremonialDates { readonly homecomingGameId: number; readonly seniorDayGameId: number }

/** Null when the level has no such days (`ceremony.home_dates` false) or the team has no home game. */
export function ceremonialDates(homeGames: readonly HomeDate[], rules: RuleValues): CeremonialDates | null {
  if (!flag(rules, KEY.ceremonyHomeDates) || homeGames.length === 0) return null;
  const byWeek = [...homeGames].sort((a, b) => a.week - b.week || a.gameId - b.gameId);
  const senior = byWeek[byWeek.length - 1]!;
  // Prefer a date other than senior day when there is a choice, so the two ceremonies are apart.
  const candidates = byWeek.length > 1 ? byWeek.filter((g) => g.gameId !== senior.gameId) : byWeek;
  const nonConf = candidates.filter((g) => !g.conferenceGame);
  const pool = nonConf.length ? nonConf : candidates;
  const home = [...pool].sort((a, b) => a.opponentStrengthEstimate - b.opponentStrengthEstimate || a.week - b.week)[0]!;
  return { homecomingGameId: home.gameId, seniorDayGameId: senior.gameId };
}
