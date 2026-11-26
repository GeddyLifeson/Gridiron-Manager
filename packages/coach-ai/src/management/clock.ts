// K5.4: the clock. Before each call the head coach decides whether he wants the clock to run, to stop,
// or does not care (K5.4.1), how to end a half (K5.4.2), and the two clock plays (K5.4.3). The result
// constrains K4's candidates and tempo and the ball carrier's choice to stay in bounds (J8). It is
// recomputed every play: there is no lock-in.
import { wp as wpNs } from '@gm/models';
import { errorHappens } from './errors.ts';
import { PTS } from './method.ts';
import { param, type ErrorId } from './params.ts';
import { scoresApart, wpOf } from './state.ts';
import type { CoachInputs, Env, RuleReader, Situation, StaffEstimates, WpState } from './types.ts';

export type ClockMode = 'burn' | 'save' | 'neutral';
export type ClockConstraint = 'stay_in_bounds' | 'avoid_incompletion' | 'sideline_or_middle_with_timeout';

/** What the staff expects of its own hurry-up today (seconds from whistle to snap). Estimates, not truth. */
export interface TempoEstimates {
  readonly realPlayS: number;
  readonly spikeS: number;
  /** The offense is already set at the line. */
  readonly teamSet: boolean;
}

export interface ClockPlan {
  readonly mode: ClockMode;
  /** Target snap point on the play clock (seconds left), or null for his normal tempo. */
  readonly snapAtPlayClockS: number | null;
  readonly constraints: readonly ClockConstraint[];
  readonly kneel: boolean;
  readonly spike: boolean;
  /** End-of-half plan when one applies (K5.4.2). */
  readonly halfPlan: 'attack' | 'sit' | null;
  /** Keep one timeout for the field goal unit (K5.4.2). */
  readonly reserveTimeout: boolean;
  readonly lastPlay: 'field_goal' | 'hail_mary' | 'kneel' | null;
  /** Defense lets the offense score because it can otherwise run out the clock (K5.4.1 rule 6). */
  readonly allowScore: boolean;
  readonly errorId: ErrorId | null;
  /** The mode came from the A3 ruling 22 floor. */
  readonly floor: boolean;
}

/** Clock stops the opponent still has: his timeouts and the automatic late-half stop. */
function stops(s: Situation, rules: RuleReader): number {
  return s.timeoutsOpp + (s.autoStopPending && rules.num('clock.two_minute_timeout') > 0 ? 1 : 0);
}

/**
 * K5.4.3 arithmetic: full play-clock run-offs left after kneeling on every down but the last, less the
 * opponent's stops, each shortened by the safety margin. Positive slack means kneeling ends the period.
 */
export function kneelSlackS(s: Situation, rules: RuleReader, extraRunoffs = 0): number {
  const runoffs = rules.num('series.downs') - s.down - stops(s, rules) + extraRunoffs;
  const perSnap = rules.num('clock.play_clock_s') - param('kneel.marginPerSnapS');
  return (runoffs > 0 ? runoffs * perSnap : 0) - s.halfSecondsLeft;
}

export function kneelWins(s: Situation, rules: RuleReader): boolean {
  return s.hasBall && s.scoreDiff > 0 && !s.firstHalf && kneelSlackS(s, rules) >= 0;
}

/** Yards still needed to reach the staff's field goal range, 0 when already in it, null when out of reach. */
function yardsToRange(s: Situation, e: StaffEstimates): number | null {
  const min = param('fourth.fgRangeMin');
  for (let gain = 0; gain < s.yardsToGoalYd; gain++) if (e.fieldGoal(s.yardsToGoalYd - gain) >= min) return gain;
  return null;
}

/** Plays the hurry-up can run before the half ends: a timeout turns one running-clock play into a stopped one. */
function playsLeft(s: Situation, timeouts: number): number {
  const stopped = param('half.stoppedPlayS'), hurry = param('half.hurryPlayS');
  let t = s.halfSecondsLeft, n = 0, to = timeouts;
  while (t > 0) {
    n++;
    if (to > 0) { t -= stopped; to--; } else t -= hurry;
  }
  return n;
}

/** The state when this half ends with nothing more scored, from the team in possession then. */
function sitState(s: Situation, env: Env): { state: WpState; mine: boolean } {
  const used = s.halfSecondsLeft, game = s.gameSecondsLeft - used;
  if (!s.firstHalf || s.overtime) {
    const x: WpState = { field: { kind: 'scrimmage', down: 1, distanceYd: env.rules.num('series.yards_to_gain'), yardsToGoalYd: s.yardsToGoalYd, halfSecondsLeft: 0, timeoutsOffense: s.timeoutsOwn, timeoutsDefense: s.timeoutsOpp, home: s.home },
      scoreDiff: s.scoreDiff, gameSecondsLeft: game > 0 ? game : 0, overtime: s.overtime, firstHalf: false, receivesSecondHalfKickoff: false, pregameGap: s.pregameGap };
    return { state: x, mine: true };
  }
  const mine = s.receivesSecondHalfKickoff, per = env.rules.num('timeout.per_half');
  const x: WpState = {
    field: { kind: 'kickoff', down: 0, distanceYd: 0, yardsToGoalYd: env.rules.num('field.goal_to_goal_yd') - env.rules.num('kickoff.touchback_yardline'), halfSecondsLeft: game, timeoutsOffense: per, timeoutsDefense: per, home: mine ? s.home : !s.home },
    scoreDiff: mine ? s.scoreDiff : -s.scoreDiff, gameSecondsLeft: game, overtime: false, firstHalf: false, receivesSecondHalfKickoff: false, pregameGap: mine ? s.pregameGap : -s.pregameGap,
  };
  return { state: x, mine };
}

export interface HalfPlan { readonly plan: 'attack' | 'sit'; readonly gainPts: number; readonly offsetPts: number; readonly reachable: boolean; readonly reserveTimeout: boolean; readonly lastPlay: ClockPlan['lastPlay'] }

/** K5.4.2: attack or sit on the ball on the last possession of a half. Null when it does not apply. */
export function endOfHalf(env: Env, s: Situation, e: StaffEstimates, coach: CoachInputs): HalfPlan | null {
  if (!s.hasBall || s.halfSecondsLeft > param('half.windowS') || s.overtime) return null;
  if (!s.firstHalf && s.scoreDiff !== 0) return null;
  const need = yardsToRange(s, e);
  // A timeout is kept for the field goal unit unless a spike can stop the clock with enough time left.
  const spikeStops = s.halfSecondsLeft >= param('half.spikeMinS') + param('half.hurryPlayS');
  const reserveTimeout = s.timeoutsOwn > 0 && !spikeStops;
  const reach = playsLeft(s, reserveTimeout ? s.timeoutsOwn - 1 : s.timeoutsOwn) * param('half.yardsPerPlay');
  const reachable = need !== null && reach >= need;
  const sit = sitState(s, env);
  const sitWp = wpNs.wp(env.model, sit.state, env.math).value;
  const gainPts = (wpOf(env, s) - (sit.mine ? sitWp : 1 - sitWp)) * PTS;
  const offsetPts = param('half.attackBasePts') - coach.tendencies.endOfHalfAggression * param('half.attackPerZPts');
  const plan = reachable && gainPts > offsetPts ? 'attack' : 'sit';
  let lastPlay: ClockPlan['lastPlay'] = null;
  if (s.halfSecondsLeft <= param('half.lastPlayS')) {
    lastPlay = e.fieldGoal(s.yardsToGoalYd) >= param('fourth.fgRangeMin') ? 'field_goal' : s.yardsToGoalYd <= param('half.hailMaryMaxYd') ? 'hail_mary' : 'kneel';
  }
  return { plan, gainPts, offsetPts, reachable, reserveTimeout, lastPlay };
}

/** K5.4.1 rules 2 and 3: the mode by score, time and his tendencies, before errors and the floor. */
export function soundMode(env: Env, s: Situation, coach: CoachInputs, half: HalfPlan | null): ClockMode {
  if (half) return half.plan === 'attack' ? 'save' : s.firstHalf ? 'burn' : 'neutral';
  if (s.firstHalf || s.overtime || s.scoreDiff === 0) return 'neutral';
  const scores = scoresApart(s.scoreDiff, env.rules), t = coach.tendencies;
  if (s.scoreDiff > 0) {
    const start = param('clock.burnStartS') * scores / param('clock.burnLeadScores') + t.leadProtection * param('clock.burnShiftPerZS');
    return s.hasBall && s.gameSecondsLeft <= start ? 'burn' : 'neutral';
  }
  const start = param('clock.saveStartS') * scores + t.deficitUrgency * param('clock.saveShiftPerZS');
  return s.gameSecondsLeft <= start ? 'save' : 'neutral';
}

const MODES: readonly ClockMode[] = ['burn', 'neutral', 'save'];

export interface ClockInput {
  readonly situation: Situation;
  readonly estimates: StaffEstimates;
  readonly coach: CoachInputs;
  readonly tempo: TempoEstimates;
  /** The staff's estimate of the opponent's kicker; his own kicker's curve stands in when absent. */
  readonly opponentFieldGoal?: (yardsToGoalYd: number) => number;
}

/** K5.4.1 to K5.4.3 for the coming play. Takes a fixed number of draws. */
export function clockPlan(env: Env, i: ClockInput): ClockPlan {
  const s = i.situation, c = i.coach, d = env.draws;
  const uFloor = d.uniform(), uSnap = d.uniform(), uKneelFloor = d.uniform(), uSpikeFloor = d.uniform();
  const ec = { clockManagementZ: c.behavior.clockManagement, advisor: c.advisor, analyticsTrust: c.tendencies.analyticsTrust, enabled: env.errors, draws: d, math: env.math };
  const miscount = errorHappens('kneel_miscount', ec), earlySnap = errorHappens('early_snap_with_lead', ec);
  const floorP = param('prob.floor');
  const half = endOfHalf(env, s, i.estimates, c);
  let mode = soundMode(env, s, c, half), floor = false, errorId: ErrorId | null = null;
  if (uFloor < floorP * (MODES.length - 1)) { mode = MODES.filter((m) => m !== mode)[Math.floor(uFloor / floorP)] ?? mode; floor = true; }

  // K5.4.3 kneel: when the arithmetic wins. The miscount error flips it within one snap of the margin.
  const lastDown = s.down >= env.rules.num('series.downs');
  const wins = kneelWins(s, env.rules);
  let kneel = wins || (half !== null && half.plan === 'sit' && s.firstHalf && kneelSlackS(s, env.rules) >= 0 && !lastDown);
  const leading = s.hasBall && s.scoreDiff > 0 && !s.firstHalf;
  if (miscount && leading) {
    if (wins && kneelSlackS(s, env.rules, -1) < 0) { kneel = false; errorId = 'kneel_miscount'; }
    else if (!wins && !lastDown && kneelSlackS(s, env.rules, 1) >= 0) { kneel = true; errorId = 'kneel_miscount'; }
  }
  if (errorId === null && uKneelFloor < floorP && s.hasBall) { kneel = !kneel; floor = true; }
  if (kneel) mode = mode === 'save' ? 'neutral' : mode;

  // K5.4.3 spike: save mode, clock running, no timeout to spend, and a real play costs too much more.
  const spendable = s.timeoutsOwn - (half?.reserveTimeout ? 1 : 0);
  let spike = !kneel && mode === 'save' && s.hasBall && s.clockRunning && !lastDown && spendable <= 0 && i.tempo.realPlayS - i.tempo.spikeS > param('spike.savingS');
  if (spike && i.tempo.teamSet && s.down <= 2 && c.behavior.clockManagement >= param('spike.calledPlayMinZ')) spike = false;
  if (!spike && !kneel && s.hasBall && s.clockRunning && uSpikeFloor < floorP) { spike = true; floor = true; }

  // K5.4.1 rule 4: in burn he snaps with 1 to 3 s left; the early-snap error leaves 8 to 15 s.
  let snapAt: number | null = null;
  if (mode === 'burn' && s.hasBall) {
    snapAt = param('clock.burnSnapMinS') + uSnap * (param('clock.burnSnapMaxS') - param('clock.burnSnapMinS'));
    if (earlySnap && errorId === null) { snapAt = param('error.earlySnapMinS') + uSnap * (param('error.earlySnapMaxS') - param('error.earlySnapMinS')); errorId = 'early_snap_with_lead'; }
  }
  const constraints: ClockConstraint[] = !s.hasBall ? [] : mode === 'burn' ? ['stay_in_bounds', 'avoid_incompletion'] : mode === 'save' ? ['sideline_or_middle_with_timeout'] : [];
  return {
    mode, snapAtPlayClockS: snapAt, constraints, kneel, spike, halfPlan: half ? half.plan : null, reserveTimeout: half ? half.reserveTimeout : false,
    lastPlay: half ? half.lastPlay : null, allowScore: allowScore(env, s, c, i.opponentFieldGoal ?? i.estimates.fieldGoal), errorId, floor,
  };
}

/**
 * K5.4.1 rule 6: on defense, tied or ahead by less than a field goal, with the offense in field goal
 * range and able to run out the clock from a fresh first down, a coach above the clockManagement bar
 * lets him score to get the ball back, when a touchdown still leaves the game within one score.
 */
export function allowScore(env: Env, s: Situation, coach: CoachInputs, opponentFieldGoal: (yardsToGoalYd: number) => number): boolean {
  if (s.hasBall || s.firstHalf || s.overtime || coach.behavior.clockManagement <= param('clock.allowScoreMinZ')) return false;
  if (s.scoreDiff < 0 || s.scoreDiff >= env.rules.num('score.field_goal')) return false;
  const afterTd = s.scoreDiff - env.rules.num('score.touchdown') - env.rules.num('try.kick_points');
  if (afterTd < -(env.rules.num('score.touchdown') + env.rules.num('try.two_point_points'))) return false;
  if (opponentFieldGoal(s.yardsToGoalYd) < param('fourth.fgRangeMin')) return false;
  const fresh: Situation = { ...s, hasBall: true, down: 1, scoreDiff: -s.scoreDiff, timeoutsOwn: s.timeoutsOpp, timeoutsOpp: s.timeoutsOwn };
  return kneelSlackS(fresh, env.rules) >= 0;
}
