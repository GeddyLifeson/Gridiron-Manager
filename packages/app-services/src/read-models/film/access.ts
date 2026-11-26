// Film access and time (N1.6.1). What film exists and when, and what watching it costs out of the
// week's hours (E7). Watching is free up to a weekly allowance; past it each play costs a little.
// Delegated film costs the user nothing and comes back with the staff's accuracy.
import { param } from './params.ts';

export type FilmKind = 'own_game' | 'own_practice' | 'opponent_game' | 'league_game';

/**
 * Whether film is available on `day` (calendar day index): own game film right after the game, practice
 * film the same day, opponent and league film once the game is played (league film exchange
 * assumption, N1.2.1 edge case; college exchange rules are a T9 item).
 */
export function filmAvailable(_kind: FilmKind, playedDay: number, day: number): boolean {
  return day >= playedDay;
}

export interface WeekFilmWork {
  readonly playsWatched: number;
  /** Player-games the user graded himself. */
  readonly sheetsGradedByUser: number;
  /** Opponent games the user charted himself; the rest go to quality control. */
  readonly gamesChartedByUser: number;
  readonly gamesChartedByStaff: number;
}

export interface FilmHours { readonly userHours: number; readonly staffHours: number }

const MIN_PER_H = 60;

/** Hours of the week's film work, for the weekly time ledger (N1.6.1 acceptance). */
export function filmHours(w: WeekFilmWork): FilmHours {
  const paid = Math.max(0, w.playsWatched - param('time.freePlays'));
  const watch = (paid * param('time.minutesPerPlay')) / MIN_PER_H;
  return {
    userHours: watch + w.sheetsGradedByUser * param('time.gradeHours') + w.gamesChartedByUser * param('time.chartStaffHours'),
    staffHours: w.gamesChartedByStaff * param('time.chartStaffHours'),
  };
}
