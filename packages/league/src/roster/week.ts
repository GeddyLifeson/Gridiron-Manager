// The weekly roster cycle (H6.1.1) and who decides each move (H6.1.2). Marker offsets are starting
// values from params.json; transaction times come from the rule keys.
import type { RosterRules } from './keys.ts';
import { MINUTES_PER_HOUR, P } from './params.ts';
import { absHour, fromAbsHour } from './engine.ts';
import type { Instant, Transaction } from './types.ts';

export type MarkerType = 'injury_review' | 'tryouts' | 'protections' | 'trade_deadline_meeting' | 'last_transactions' | 'inactives' | 'elevations_revert';

export interface RosterMarker {
  readonly type: MarkerType;
  readonly opensAt: Instant;
  readonly deadline: Instant;
}

export interface WeekInput {
  /** Kickoff of this week's game. */
  readonly kickoff: Instant;
  /** Day index of the club's previous game, or null for the first game of the season. */
  readonly previousGameDay: number | null;
  /** This is the week of the trade deadline (C5.5.2). */
  readonly tradeDeadlineWeek: boolean;
}

/**
 * Markers for one game week (H6.1.1 rule 1). Rule 2: markers keep their day offsets from the game;
 * a short week drops the tryout marker and clamps markers to after the previous game.
 */
export function weeklyRosterMarkers(week: WeekInput, rules: RosterRules): RosterMarker[] {
  const gameDay = week.kickoff.dayIndex;
  const deadlineHour = rules.dailyDeadlineHour ?? week.kickoff.hour;
  const floorDay = week.previousGameDay === null ? null : week.previousGameDay + 1;
  const day = (offset: number) => (floorDay === null ? gameDay - offset : Math.max(floorDay, gameDay - offset));
  const at = (dayIndex: number, hour: number): Instant => ({ dayIndex, hour });
  const startOfDay = (dayIndex: number): Instant => at(dayIndex, 0);
  const short = week.previousGameDay !== null && gameDay - week.previousGameDay < P.normalWeekDays;
  const out: RosterMarker[] = [];
  const review = day(P.markerInjuryReviewDaysBeforeGame);
  out.push({ type: 'injury_review', opensAt: startOfDay(review), deadline: at(review, deadlineHour) });
  if (!short) {
    const t = day(P.markerTryoutDaysBeforeGame);
    out.push({ type: 'tryouts', opensAt: startOfDay(t), deadline: at(t, deadlineHour) });
  }
  if (rules.practiceSquad) {
    const pd = day(P.markerProtectionDaysBeforeGame);
    out.push({ type: 'protections', opensAt: startOfDay(review), deadline: at(pd, deadlineHour) });
  }
  if (week.tradeDeadlineWeek && rules.tradeDeadlineAfterWeek !== null) {
    out.push({ type: 'trade_deadline_meeting', opensAt: startOfDay(review), deadline: at(day(P.markerProtectionDaysBeforeGame), deadlineHour) });
  }
  const last = day(P.markerLastTransactionDaysBeforeGame);
  out.push({ type: 'last_transactions', opensAt: startOfDay(review), deadline: at(last, deadlineHour) });
  if (rules.gameDay) {
    const lockHours = rules.gameDay.lockMinutes / MINUTES_PER_HOUR;
    const lock = fromAbsHour(absHour(week.kickoff) - Math.ceil(lockHours));
    out.push({ type: 'inactives', opensAt: startOfDay(last), deadline: lock });
  }
  if (rules.practiceSquad) {
    const rv = gameDay + P.markerRevertDaysAfterGame;
    out.push({ type: 'elevations_revert', opensAt: week.kickoff, deadline: at(rv, deadlineHour) });
  }
  return out;
}

export type MarkerStatus = 'not_open' | 'open' | 'amber' | 'red' | 'closed';

/** Marker colour (H6.1.1: amber 24 game-hours before the deadline, red at 2). */
export function markerStatus(m: RosterMarker, now: Instant): MarkerStatus {
  const t = absHour(now);
  if (t < absHour(m.opensAt)) return 'not_open';
  const left = absHour(m.deadline) - t;
  if (left <= 0) return 'closed';
  if (left <= P.markerRedHours) return 'red';
  if (left <= P.markerAmberHours) return 'amber';
  return 'open';
}


// ---------------------------------------------------------------- who decides (H6.1.2)

/** L5.2.1 arrangements as H6.1.2 rule 1 lists them. */
export type PowerArrangement = 'coach_final_say' | 'split_to_owner' | 'gm_final_say' | 'owner_final_say';
export type Decider = 'coach' | 'gm' | 'owner' | 'joint';

/** Move types the deciders table covers: every club transaction plus the game-day list and depth chart. */
export type DecidedMove = Transaction['type'] | 'game_day_list' | 'depth_chart';

const COACH_SIDE: readonly DecidedMove[] = ['game_day_list', 'depth_chart', 'elevate'];

/**
 * H6.1.2 rule 1. Coach final say: every move is the coach's. Split: game-day list, depth chart and
 * elevations are the coach's, the rest the general manager's. General manager or owner final say: the
 * same split with the holder deciding personnel moves (coach-side moves start as the coach's, an
 * Assumption pending R35). A contract clause (E3) overrides single move types either way.
 */
export function deciderFor(move: DecidedMove, arrangement: PowerArrangement, clauses: Partial<Record<DecidedMove, Decider>> = {}): Decider {
  const clause = clauses[move];
  if (clause) return clause;
  if (arrangement === 'coach_final_say') return 'coach';
  if (COACH_SIDE.includes(move)) return 'coach';
  return arrangement === 'owner_final_say' ? 'owner' : 'gm';
}

/** The button a transaction screen ends in (H6.1.2 acceptance 4). */
export function moveButton(decider: Decider): 'do_it' | 'ask' {
  return decider === 'coach' ? 'do_it' : 'ask';
}
