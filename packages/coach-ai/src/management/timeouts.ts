// K5.5.1: timeouts. Each reason is evaluated at its moment; the caller says which moment this is. A
// timeout the rule set forbids is never called: `legal` comes from the request (J11.6.1), and with it
// false the answer is always no.
import { errorHappens } from './errors.ts';
import { PTS } from './method.ts';
import { param, type ErrorId } from './params.ts';
import { wpOf } from './state.ts';
import type { ClockMode } from './clock.ts';
import type { CoachInputs, Env, Situation } from './types.ts';

export type TimeoutMoment =
  /** Play clock nearly out and the snap not coming (reason 1). */
  | { readonly kind: 'delay_looming' }
  /** Booth alert: too many men, or a matchup the caller hates with the staff's estimate of its cost (reason 2). */
  | { readonly kind: 'alert'; readonly alert: 'too_many_men' | 'matchup' | 'minor_confusion'; readonly costPts: number }
  /** A play just ended with the clock running (reason 3). `canSaveS` is what a timeout now would save. */
  | { readonly kind: 'play_ended'; readonly canSaveS: number; readonly beforePuntReturn: boolean }
  /** The opponent lines up for a late kick (reason 4). */
  | { readonly kind: 'opponent_kick' }
  /** A long drive against the defense just reached a stoppage (reason 5). */
  | { readonly kind: 'long_drive' };

export interface TimeoutInput {
  readonly situation: Situation;
  readonly coach: CoachInputs;
  readonly mode: ClockMode;
  /** Keep one timeout for the field goal unit (K5.4.2). */
  readonly reserveTimeout: boolean;
  readonly moment: TimeoutMoment;
  /** The rule set allows a timeout now: one is left, the ball is dead, no consecutive-timeout bar (rule 6). */
  readonly legal: boolean;
}

export interface TimeoutResult {
  readonly call: boolean;
  readonly reason: 'avoid_delay' | 'alert' | 'stop_clock' | 'ice_kicker' | 'rest_defense' | 'floor' | null;
  /** Seconds he lets run before calling it (the late-timeout error); 0 when called at once. */
  readonly waitS: number;
  readonly errorId: ErrorId | null;
}

/** What one timeout is worth now, in win-probability points (reason 1: the difference with one fewer). */
export function timeoutValuePts(env: Env, s: Situation): number {
  if (s.timeoutsOwn <= 0) return 0;
  const v = (wpOf(env, s) - wpOf(env, s, { timeoutsOwn: s.timeoutsOwn - 1 })) * PTS;
  return v > 0 ? v : 0;
}

/** What a foul of `yards` before the snap costs the deciding team on offense now, in win-probability points. */
export function foulCostPts(env: Env, s: Situation, yards: number): number {
  const back = s.yardsToGoalYd + yards, max = env.rules.num('field.goal_to_goal_yd') - 1;
  const v = (wpOf(env, s) - wpOf(env, s, { yardsToGoalYd: back > max ? max : back, distanceYd: s.distanceYd + yards })) * PTS;
  return v > 0 ? v : 0;
}

const NO: TimeoutResult = { call: false, reason: null, waitS: 0, errorId: null };

/** Takes a fixed number of draws whatever the moment. */
export function timeoutDecision(env: Env, i: TimeoutInput): TimeoutResult {
  const s = i.situation, c = i.coach, m = i.moment, d = env.draws;
  const uChance = d.uniform(), uWait = d.uniform(), uFloor = d.uniform();
  const ec = { clockManagementZ: c.behavior.clockManagement, advisor: c.advisor, analyticsTrust: c.tendencies.analyticsTrust, enabled: env.errors, draws: d, math: env.math };
  const errId: ErrorId | null =
    m.kind === 'delay_looming' ? 'timeout_for_delay'
    : m.kind === 'alert' && m.alert === 'minor_confusion' ? 'timeout_wasted_first_quarter'
    : m.kind === 'play_ended' ? (m.beforePuntReturn ? 'no_timeout_before_punt_return' : 'late_two_minute_timeout')
    : null;
  const erred = errId !== null && errorHappens(errId, ec);
  if (errId === null) { d.uniform(); d.uniform(); }
  if (!i.legal || s.timeoutsOwn <= 0) return NO;
  const spare = s.timeoutsOwn - (i.reserveTimeout ? 1 : 0);
  let out: TimeoutResult = NO;

  if (m.kind === 'delay_looming') {
    // Reason 1: five yards against the value of the timeout. The error calls it when taking the foul was sound.
    const sound = foulCostPts(env, s, env.rules.num('foul.delay_of_game.yards')) > timeoutValuePts(env, s);
    if (sound) out = { call: true, reason: 'avoid_delay', waitS: 0, errorId: null };
    else if (erred) out = { call: true, reason: 'avoid_delay', waitS: 0, errorId: 'timeout_for_delay' };
  } else if (m.kind === 'alert') {
    if (m.alert === 'minor_confusion') { if (erred) out = { call: true, reason: 'alert', waitS: 0, errorId: 'timeout_wasted_first_quarter' }; }
    else if (m.costPts > timeoutValuePts(env, s)) out = { call: true, reason: 'alert', waitS: 0, errorId: null };
  } else if (m.kind === 'play_ended') {
    // Reason 3: in save mode with the clock running, at once (the order that keeps the most time).
    const want = i.mode === 'save' && s.clockRunning && spare > 0 && m.canSaveS > 0;
    if (want) {
      if (erred && m.beforePuntReturn && m.canSaveS >= param('error.puntReturnSaveS')) out = { call: false, reason: null, waitS: 0, errorId: 'no_timeout_before_punt_return' };
      else if (erred && !m.beforePuntReturn && !s.hasBall) {
        const wait = param('error.lateTimeoutMinS') + uWait * (param('error.lateTimeoutMaxS') - param('error.lateTimeoutMinS'));
        out = { call: true, reason: 'stop_clock', waitS: wait < m.canSaveS ? wait : m.canSaveS, errorId: 'late_two_minute_timeout' };
      } else out = { call: true, reason: 'stop_clock', waitS: 0, errorId: null };
    }
  } else if (m.kind === 'opponent_kick') {
    // Reason 4: by iceKicker, when a timeout is left and not needed.
    if (spare > 0 && i.mode !== 'save' && uChance < c.tendencies.iceKicker) out = { call: true, reason: 'ice_kicker', waitS: 0, errorId: null };
  } else if (!s.hasBall && spare > 1 && s.period % 2 === 1 && !s.overtime && uChance < param('timeout.restChance')) {
    // Reason 5: rest the defense in the first and third quarters, with a timeout to spare.
    out = { call: true, reason: 'rest_defense', waitS: 0, errorId: null };
  }
  // A3 ruling 22: a legal timeout always keeps the floor chance, and so does passing on one.
  if (uFloor < param('prob.floor')) return out.call ? { call: false, reason: 'floor', waitS: 0, errorId: null } : { call: true, reason: 'floor', waitS: 0, errorId: null };
  return out;
}
