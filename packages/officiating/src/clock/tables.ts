// Decision tables of B1 that the game flow calls between downs: the interrupted play clock (B1.3.2),
// the runoff choices (B1.6.1), the last-seconds rule for the defense (B1.6.3), the automatic late-half
// stop between downs (B1.4.4, B13.3.2), injury timeouts (B1.5) and the phases in which the play clock
// runs (B1.3.1). Each is a pure function of its arguments and reads its numbers from rule keys.
import type { ClockStatus, GameFlowPhase, GameState, NumberSources, Tenths } from '@gm/schema';
import { periodTiming, tenthsOf } from './clock.ts';

/** Why the play clock was stopped before the snap (B1.3.2). */
export type StoppageCause =
  | 'runoff'
  | 'replay_reversal_no_runoff' | 'foul_nullified_no_runoff' | 'excess_timeout_defense' | 'defensive_foul_conserving_time'
  | 'team_timeout' | 'two_minute' | 'period_end' | 'replay_administration' | 'penalty_enforcement'
  | 'excess_timeout_offense_no_runoff' | 'excess_timeout_both'
  | 'referee_timeout' | 'injury' | 'other';

const TO_FULL: ReadonlySet<StoppageCause> = new Set<StoppageCause>(['replay_reversal_no_runoff', 'foul_nullified_no_runoff', 'excess_timeout_defense', 'defensive_foul_conserving_time']);
const TO_ADMIN: ReadonlySet<StoppageCause> = new Set<StoppageCause>(['team_timeout', 'two_minute', 'period_end', 'penalty_enforcement', 'excess_timeout_offense_no_runoff', 'excess_timeout_both']);

/**
 * The play clock after a stoppage before the snap (B1.3.2). When several causes apply the first match
 * wins in the order runoff value, full clock, administrative clock, floor, resume. That order is the
 * bible's Assumption for determinism; the rule text gives none.
 */
export function playClockAfterStoppage(causes: readonly StoppageCause[], stoppedAtTenths: Tenths, src: NumberSources): Tenths {
  const rules = src.rules;
  const admin = tenthsOf(rules.num('clock.play_clock_after_stoppage_s'));
  if (causes.includes('runoff')) return tenthsOf(rules.num('clock.play_clock_after_runoff_s'));
  if (causes.some((c) => TO_FULL.has(c))) return tenthsOf(rules.num('clock.play_clock_s'));
  if (causes.some((c) => TO_ADMIN.has(c))) return admin;
  // Replay administration resets only a clock that shows less than the administrative value.
  if (causes.includes('replay_administration') && stoppedAtTenths < admin) return admin;
  const floor = tenthsOf(rules.num('clock.play_clock_floor_s'));
  return stoppedAtTenths < floor ? floor : stoppedAtTenths;
}

export type RunoffChoice = 'runoff' | 'timeout_instead' | 'declined';

export interface RunoffResult {
  readonly clockTenths: Tenths;
  readonly status: ClockStatus;
  readonly playClockTenths: Tenths;
  /** The runoff emptied the clock: the half ends (B1.6.1 rule 4). */
  readonly halfEnds: boolean;
  readonly timeoutCharged: boolean;
}

/**
 * B1.6.1 rule 2, an act by the offense that conserves time while time is in: the three ways it can
 * be settled. `runoff`: the seconds come off and the clock starts on the ready signal. `timeout_instead`:
 * the offense spends a timeout and the clock starts on the snap. `declined`: the defense declines the
 * yardage, and the runoff with it; the clock starts on the snap.
 */
export function settleRunoff(choice: RunoffChoice, clockTenths: Tenths, src: NumberSources): RunoffResult {
  const rules = src.rules;
  const admin = tenthsOf(rules.num('clock.play_clock_after_stoppage_s'));
  if (choice !== 'runoff') {
    return { clockTenths, status: 'stopped_start_on_snap', playClockTenths: admin, halfEnds: false, timeoutCharged: choice === 'timeout_instead' };
  }
  const left = Math.max(0, clockTenths - tenthsOf(rules.num('clock.runoff_s')));
  return { clockTenths: left, status: 'stopped_start_on_ready', playClockTenths: tenthsOf(rules.num('clock.play_clock_after_runoff_s')), halfEnds: left === 0, timeoutCharged: false };
}

/**
 * B1.6.1 rule 3 and B1.6.3, an act by the defense that conserves time while time is in. There is never
 * a runoff against the defense. Inside the last window of a half, a defense with no timeout left gives
 * the offense the choice to end the half.
 */
export function defenseConservesTime(clockTenths: Tenths, defenseTimeoutsLeft: number, src: NumberSources): { status: ClockStatus; playClockTenths: Tenths; offenseMayEndHalf: boolean } {
  const rules = src.rules;
  const inWindow = clockTenths <= tenthsOf(rules.num('clock.defense_half_end_window_s'));
  return { status: 'stopped_start_on_ready', playClockTenths: tenthsOf(rules.num('clock.play_clock_s')), offenseMayEndHalf: inWindow && defenseTimeoutsLeft <= 0 };
}

/**
 * A running clock between downs in the last period of a half: it stops when it reaches the automatic
 * stop value (B1.4.4 edge case, B13.3.2). Returns the clock after `elapsedTenths` and whether it stopped there.
 */
export function advanceBetweenDowns(state: GameState, elapsedTenths: Tenths, src: NumberSources): { clockTenths: Tenths; twoMinuteStop: boolean } {
  if (state.clockStatus !== 'running') return { clockTenths: state.clockTenths, twoMinuteStop: false };
  const after = Math.max(0, state.clockTenths - elapsedTenths);
  const mark = tenthsOf(src.rules.num('clock.two_minute_s'));
  const applies = src.rules.bool('clock.two_minute_timeout') && periodTiming(state.period, src.rules).lastOfHalf && !state.insideTwoMinute;
  if (applies && state.clockTenths > mark && after <= mark) return { clockTenths: mark, twoMinuteStop: true };
  return { clockTenths: after, twoMinuteStop: false };
}

export interface InjuryTimeoutInput {
  readonly insideTwoMinute: boolean;
  /** The injured player's team is the team in possession. */
  readonly offense: boolean;
  readonly timeoutsLeft: number;
  /** The game clock was running when play was stopped. */
  readonly timeIn: boolean;
  /** B1.5.2 rule 2: no charge when an opponent's foul caused the injury, or on a down with a change of possession, a score, a free kick or a try. */
  readonly exception: 'none' | 'opponent_foul' | 'exempt_down';
  /** Players of both teams were hurt on the down (B1.5.2 rule 7). */
  readonly bothTeams: boolean;
  /** A foul by either team on the down already stopped the clock (B1.5.2 rule 8). */
  readonly foulOnDown: boolean;
  /** Excess timeouts this team has already had in the half (B1.5.2 rule 4). */
  readonly excessThisHalf: number;
  /** Mode the clock would have had with no injury (B1.5.1 rule 3). */
  readonly restartWithout: ClockStatus;
}

export interface InjuryTimeoutResult {
  readonly timeoutCharged: boolean;
  readonly excessTimeout: boolean;
  /** Delay of game from the succeeding spot for a second or later excess timeout (B1.5.2 rule 4). Yardage is the foul catalogue's. */
  readonly delayFoul: boolean;
  /** The defense may take the runoff (B1.5.2 rule 6). */
  readonly runoffOffered: boolean;
  readonly status: ClockStatus;
  /** New play-clock value, or null when it resumes where it stopped. */
  readonly playClockTenths: Tenths | null;
  /** The player must leave for one down (B1.5.1 rule 2, B1.5.2 rule 3). */
  readonly sitsOneDown: boolean;
}

/** B1.5.1 and B1.5.2 as one table. A running clock restarts on the ready signal "as if it had not occurred". */
export function injuryTimeout(i: InjuryTimeoutInput, src: NumberSources): InjuryTimeoutResult {
  const rules = src.rules;
  const asIf: ClockStatus = i.restartWithout === 'running' ? 'stopped_start_on_ready' : i.restartWithout;
  const sits = i.exception !== 'opponent_foul';
  const none = { timeoutCharged: false, excessTimeout: false, delayFoul: false, runoffOffered: false, status: asIf, playClockTenths: null, sitsOneDown: sits };
  if (!i.insideTwoMinute || i.exception !== 'none') return none;
  if (i.timeoutsLeft > 0) {
    // A charged timeout: clock on the snap, administrative play clock, and the player may stay (B1.4.1 rule 5, B1.5.2 rule 3).
    return { ...none, timeoutCharged: true, status: 'stopped_start_on_snap', playClockTenths: tenthsOf(rules.num('clock.play_clock_after_stoppage_s')), sitsOneDown: false };
  }
  const runoffOffered = i.offense && i.timeIn && !i.bothTeams && !i.foulOnDown;
  const playClock = i.offense ? tenthsOf(rules.num('clock.play_clock_after_stoppage_s')) : tenthsOf(rules.num('clock.play_clock_s'));
  return {
    timeoutCharged: false, excessTimeout: true, delayFoul: i.excessThisHalf >= 1 && !i.bothTeams, runoffOffered,
    status: i.timeIn ? 'stopped_start_on_ready' : asIf, playClockTenths: i.foulOnDown && !i.offense ? null : playClock, sitsOneDown: true,
  };
}

/**
 * Phases of the game flow in which the play clock counts down (B1.3.1, J11.4.2, I2.1.2). After a normal
 * dead ball the full play clock starts at once and runs through the spotting delay; after a stoppage
 * the administrative clock starts on the Referee's whistle, which opens the call window. It never
 * runs while the ball is live, during a ruling, a review, a timeout or an intermission. No setting
 * slows or pauses it in a game.
 */
export const PLAY_CLOCK_RUNS: Readonly<Record<GameFlowPhase, boolean>> = {
  pre_game: false, kickoff_setup: true, call_window: true, pre_snap: true, play: false, ruling: false, penalty_decision: false,
  challenge_window: false, review: false, dead_ball: true, try_decision: false, timeout: false, period_end: false, overtime_toss: false, final: false,
};
