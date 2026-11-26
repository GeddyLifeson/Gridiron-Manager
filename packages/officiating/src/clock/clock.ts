// Game clock, play clock, timeouts and period ends (B1.2 to B1.7, B13.3, J11.4.1, J11.8.1).
// Clock values are integer tenths of a second (contract decision D-02). Every duration is a rule key.
// One rule engine serves both levels: the branches below test rule keys, never the level.
import {
  TICKS_PER_SECOND,
  type ClockResult, type ClockRules, type ClockStatus, type GameFlowPhase, type GameState, type NumberSources,
  type PeriodTransition, type PlayClockReason, type PlayOutcome, type PlayResultType, type RuleSet, type RulingContext,
  type Side, type Tenths,
} from '@gm/schema';
import { downVerdict } from '../series/series.ts';
import { NO_CLOCK_FACTS, type ClockFacts } from './facts.ts';
import units from './units.json' with { type: 'json' };

/** Seconds from a rule key to integer tenths. */
export function tenthsOf(seconds: number): Tenths { return Math.round(seconds * TICKS_PER_SECOND); }

const STOPPED_SNAP: ClockStatus = 'stopped_start_on_snap';
const STOPPED_READY: ClockStatus = 'stopped_start_on_ready';

/** Downs that begin with a kick: the clock stops at the end of each (B1.2.2 a, b, i). */
const KICK_RESULTS: ReadonlySet<PlayResultType> = new Set<PlayResultType>([
  'punt', 'field_goal_good', 'field_goal_missed', 'kickoff', 'safety_kick', 'fair_catch_kick',
]);

/** Where a period sits in the game (B1.1.1). Overtime periods take the timing of the last period (B5.6.2 rule 8, B10). */
export interface PeriodTiming {
  readonly regulation: boolean;
  /** Last period of a half, or an overtime period. */
  readonly lastOfHalf: boolean;
  readonly firstHalf: boolean;
  readonly lastOfRegulation: boolean;
}

export function periodTiming(period: number, rules: RuleSet): PeriodTiming {
  const periods = rules.num('clock.periods');
  const perHalf = rules.num('clock.periods_per_half');
  const regulation = period <= periods;
  return { regulation, lastOfHalf: !regulation || period % perHalf === 0, firstHalf: regulation && period <= perHalf, lastOfRegulation: period === periods };
}

/** "After the two-minute warning of the first half, or inside the last five minutes of the second" (B1.2.3). */
function lateWindow(t: PeriodTiming, insideTwoMinute: boolean, clock: Tenths, rules: RuleSet): boolean {
  if (!t.lastOfHalf) return false;
  if (t.firstHalf) return insideTwoMinute;
  // B1.2.3 edge case: the boundary is "less than or equal to" the window (an Assumption in the bible).
  return clock <= tenthsOf(rules.num('clock.late_window_second_half_s'));
}

function outOfBoundsOnSnap(t: PeriodTiming, insideTwoMinute: boolean, clock: Tenths, rules: RuleSet): boolean {
  if (rules.opt('clock.out_of_bounds_restart') === 'signal_before_2min_snap_after') return t.lastOfHalf && insideTwoMinute;
  return lateWindow(t, insideTwoMinute, clock, rules);
}

function atSnap(_clockTenths: Tenths, status: ClockStatus, ctx: RulingContext): ClockStatus {
  // B1.2.1: the clock never runs during a try or an untimed down, and never during an intermission.
  if (status === 'untimed' || status === 'intermission') return status;
  if (ctx.situation.playKind === 'try' || ctx.situation.untimedDown || ctx.before.untimedDownOwed) return 'untimed';
  return 'running';
}

function playClockTenths(reason: PlayClockReason, src: NumberSources): Tenths {
  return tenthsOf(src.rules.num(reason === 'normal' ? 'clock.play_clock_s' : 'clock.play_clock_after_stoppage_s'));
}

/**
 * B1.7.2 c: a touchdown on the last play of a period is followed by its try, except when the down
 * ended the last period of regulation and a successful try could not change who wins.
 */
function tryStillPlayed(outcome: PlayOutcome, t: PeriodTiming, ctx: RulingContext): boolean {
  const score = outcome.score;
  if (score === null || !t.lastOfRegulation) return true;
  const other: Side = score.side === 0 ? 1 : 0;
  const margin = ctx.situation.score[score.side] + score.points - ctx.situation.score[other];
  return margin <= 0 && margin >= -ctx.rules.num('try.two_point_points');
}

/**
 * The clock after a down (B1.2.2 stop list, B1.2.3 restart mode, B1.3.1 play clock, B1.4.4, B1.7).
 * `facts` is optional detail the outcome cannot carry yet; without it a ball out of bounds is taken
 * to be a runner out of bounds.
 */
export function afterPlayWithFacts(outcome: PlayOutcome, liveDurationTenths: Tenths, ctx: RulingContext, facts: ClockFacts): ClockResult {
  const sit = ctx.situation;
  const rules = ctx.rules;
  const t = periodTiming(sit.period, rules);
  const timed = atSnap(sit.clockTenths, sit.clockStatus, ctx) === 'running';
  const enf = outcome.enforcement;
  const runoffTaken = timed && enf !== null && enf.runoffTaken;
  // A down that never counted with no foul is replayed with the clock reset to the snap (B3.2.3 rules 4 and 6).
  const resetToSnap = outcome.noPlay && enf === null;

  let clock = sit.clockTenths;
  if (timed && !resetToSnap) clock = Math.max(0, clock - liveDurationTenths);
  if (runoffTaken) clock = Math.max(0, clock - tenthsOf(rules.num('clock.runoff_s')));

  // A period with no clock at all (an overtime played by possessions) never expires on time.
  const clocklessPeriod = sit.overtime && sit.clockStatus === 'untimed' && sit.clockTenths === 0 && !ctx.before.untimedDownOwed && !sit.untimedDown;
  const periodExpired = clock === 0 && !clocklessPeriod;

  const touchdown = outcome.score !== null && outcome.score.type === 'touchdown';
  const twoMinuteStop = timed && !periodExpired && rules.bool('clock.two_minute_timeout') && t.lastOfHalf && !ctx.before.insideTwoMinute
    && clock <= tenthsOf(rules.num('clock.two_minute_s'));
  const inside = ctx.before.insideTwoMinute || twoMinuteStop;

  const v = downVerdict(outcome, ctx);
  const lost = outcome.changeOfPossession || outcome.possessionAfter !== outcome.snappingSide || v.turnoverOnDowns;
  const kick = KICK_RESULTS.has(outcome.resultType);
  const firstDownStop = rules.opt('clock.first_down_stop') === 'after_two_minute_timeout' && t.lastOfHalf && inside && v.firstDown && !lost;

  // The mode the clock has from how the down itself ended (B1.2.3 default and exceptions 4 and 5).
  let base: ClockStatus;
  if (outcome.noPlay) base = !timed || sit.clockStatus === STOPPED_SNAP || enf === null ? STOPPED_SNAP : STOPPED_READY;
  else if (!timed || kick || outcome.score !== null || outcome.touchback || outcome.incomplete || lost) base = STOPPED_SNAP;
  else if (outcome.endedOutOfBounds) base = !facts.looseBallOutOfBounds && outOfBoundsOnSnap(t, inside, clock, rules) ? STOPPED_SNAP : STOPPED_READY;
  else if (firstDownStop) base = STOPPED_READY;
  else base = 'running';

  let status: ClockStatus = base;
  if (enf !== null) {
    // Exception 9: after a foul the clock starts as if the foul had not occurred ("running" becomes "on the
    // ready signal"), except on the snap late in a half and in the two listed offensive cases.
    const late = rules.bool('clock.foul_restart_on_snap_late') && lateWindow(t, inside, clock, rules);
    const offenseBeforeSnap = facts.offenseFoulAfterReady === true && (t.lastOfRegulation || !t.regulation);
    if (late || offenseBeforeSnap || facts.successiveDelayOfGame === true) status = STOPPED_SNAP;
    else if (base === 'running') status = STOPPED_READY;
  } else if (outcome.injuryStoppage.length > 0 && base === 'running') {
    // B1.5.1 rule 3: an injury timeout restarts as if it had not occurred.
    status = STOPPED_READY;
  }
  if (runoffTaken) status = STOPPED_READY;
  if (twoMinuteStop) status = STOPPED_SNAP;

  let untimedDown = false;
  if (periodExpired) {
    if (touchdown) untimedDown = tryStillPlayed(outcome, t, ctx);
    else if (enf !== null && !runoffTaken) {
      // B1.7.2 a: an accepted live-ball foul by the defense. `yardsWalked` is signed along the snapping team's attack.
      const defensiveFoulAccepted = enf.enforced.length > 0 && (enf.yardsWalked > 0 || enf.automaticFirstDown);
      // B1.7.2 h: a double foul that replays the down extends the last period of a half only.
      const doubleFoulReplay = enf.offsetting && enf.replayDown && t.lastOfHalf;
      untimedDown = defensiveFoulAccepted || doubleFoulReplay;
    }
  }
  // The try follows a touchdown and is never timed (B7.3.1 rule 2).
  if (touchdown && (!periodExpired || untimedDown)) status = 'untimed';
  else if (periodExpired && untimedDown) status = 'untimed';

  let reason: PlayClockReason = 'normal';
  if (!timed || kick || outcome.score !== null || outcome.touchback || lost || enf !== null || outcome.noPlay || twoMinuteStop || periodExpired) reason = 'administrative';
  const playClock = runoffTaken ? tenthsOf(rules.num('clock.play_clock_after_runoff_s')) : playClockTenths(reason, ctx);

  // `runoff` is the offer of B1.6.1. The foul module puts the offer among the enforcement options and reports
  // the choice in `enforcement.runoffTaken`, which is applied above, so no offer is left open here.
  return { clockTenths: clock, status, playClockTenths: playClock, periodExpired, untimedDown, twoMinuteStop, runoff: null };
}

/** Phases in which the ball is dead and a team timeout may be granted (B1.4.1 rule 2). */
const TIMEOUT_PHASES: ReadonlySet<GameFlowPhase> = new Set<GameFlowPhase>(['kickoff_setup', 'call_window', 'pre_snap', 'dead_ball', 'try_decision', 'timeout']);
const LIVE_PHASES: ReadonlySet<GameFlowPhase> = new Set<GameFlowPhase>(['play', 'ruling']);

function timeoutAllowed(state: GameState, side: Side, _src: NumberSources): { allowed: boolean; refusedKey: string | null } {
  // The count in the state is already the rule value: it is set from `timeout.per_half` at each half (endOfPeriod)
  // and from the overtime rules. A second timeout by one team in a dead-ball period cannot be seen in the
  // state yet (contract change request CR-02-3), so it is not refused here.
  if (LIVE_PHASES.has(state.phase)) return { allowed: false, refusedKey: 'timeout.refused.ball_live' };
  if (!TIMEOUT_PHASES.has(state.phase)) return { allowed: false, refusedKey: 'timeout.refused.not_now' };
  if (state.timeoutsLeft[side] <= 0) return { allowed: false, refusedKey: 'timeout.refused.none_left' };
  return { allowed: true, refusedKey: null };
}

function endOfPeriod(state: GameState, src: NumberSources): PeriodTransition {
  const rules = src.rules;
  const t = periodTiming(state.period, rules);
  const tied = state.score[0] === state.score[1];
  if (t.regulation && !t.lastOfHalf) {
    // B1.1.3: change of goals; possession, down, spot and line to gain carry over mirrored.
    return { next: 'next_period', swapEnds: true, resetTimeouts: false, intermissionTenths: tenthsOf(rules.num('clock.period_break_s')), carryOverSeries: true };
  }
  if (t.regulation && !t.lastOfRegulation) {
    // The goals of the second half come from the toss choices (B1.1.2), not from a swap.
    return { next: 'halftime', swapEnds: false, resetTimeouts: true, intermissionTenths: tenthsOf(rules.num('clock.halftime_min') * units.secondsPerMinute), carryOverSeries: false };
  }
  // B1.1.1 rule 4: a tie after the last period goes to the overtime rules (B10), which own everything about it,
  // the break before it included. An overtime period that ends tied goes back to them as well.
  if (tied) return { next: 'overtime', swapEnds: false, resetTimeouts: true, intermissionTenths: 0, carryOverSeries: false };
  return { next: 'final', swapEnds: false, resetTimeouts: false, intermissionTenths: 0, carryOverSeries: false };
}

/** B1.2, B1.3, B1.4, B1.7, B13.3 and J11.4.1 behind the contract's `ClockRules`. Pure: no state between calls. */
export const clockRules: ClockRules = {
  atSnap,
  afterPlay: (outcome, liveDurationTenths, ctx) => afterPlayWithFacts(outcome, liveDurationTenths, ctx, NO_CLOCK_FACTS),
  playClockTenths,
  timeoutAllowed,
  endOfPeriod,
};
