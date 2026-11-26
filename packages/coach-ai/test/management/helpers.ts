// Test fixtures for K5. Rule values and staff estimates here are fixture values, not facts.
import { DMATH, stream, seedFromNumber } from '@gm/engine-core';
import { ep, wp } from '@gm/models';
import type { ChartPort, CoachInputs, Env, OptionOutcome, RuleReader, Situation, StaffEstimates, WpState } from '../../src/management/index.ts';
import type { Draws } from '../../src/profile/index.ts';

export const SEED = seedFromNumber(20261126);
export const MATH = DMATH;
export const MODEL = wp.loadWpModel(wp.BASELINE_WP_MODEL, ep.loadEpModel(ep.BASELINE_EP_MODEL));

export function fixtureRules(values: Record<string, number>): RuleReader {
  const all: Record<string, number> = { 'score.touchdown': 6, 'score.field_goal': 3, 'clock.play_clock_s': 40, 'series.downs': 4, ...values };
  return { num: (k) => { const v = all[k]; if (v === undefined) throw new Error(`fixture: missing ${k}`); return v; } };
}

/**
 * Stand-in for the G-71 chart function `fourthDownOutcomes` (models `strength`), with the same outcome
 * lists. The lint forbids a test reaching into another package's files, and the barrel line is owed
 * (CR-G71-2); when it lands this becomes `strength.fourthDownOutcomes`.
 */
export const CHART: ChartPort = {
  fourthDownOutcomes(base, r, e, ytg, dist) {
    const st = (mine: boolean, diff: number, f: { kind?: 'kickoff'; down?: number; distanceYd?: number; yardsToGoalYd?: number }): WpState => ({
      field: { kind: f.kind ?? 'scrimmage', down: f.down ?? 1, distanceYd: f.distanceYd ?? 10, yardsToGoalYd: f.yardsToGoalYd ?? 75, halfSecondsLeft: base.halfSecondsLeft,
        timeoutsOffense: mine ? base.timeoutsOffense : base.timeoutsDefense, timeoutsDefense: mine ? base.timeoutsDefense : base.timeoutsOffense, home: mine ? base.home : !base.home },
      scoreDiff: mine ? diff : -diff, gameSecondsLeft: base.gameSecondsLeft, overtime: false, firstHalf: base.firstHalf,
      receivesSecondHalfKickoff: mine ? base.receivesSecondHalfKickoff : !base.receivesSecondHalfKickoff, pregameGap: mine ? base.pregameGap : -base.pregameGap,
    });
    const score = (pts: number, p: number): OptionOutcome => ({ probability: p, state: st(false, base.scoreDiff + pts, { kind: 'kickoff', down: 0, distanceYd: 0 }), deciderHasBall: false });
    const opp = (y: number, p: number): OptionOutcome => { const c = Math.min(r.fieldLength - 1, Math.max(1, y)); return { probability: p, state: st(false, base.scoreDiff, { yardsToGoalYd: c, distanceYd: Math.min(c, r.yardsToGain) }), deciderHasBall: false }; };
    const out: Partial<Record<'go' | 'field_goal' | 'punt', OptionOutcome[]>> = {};
    const c = e.convert(dist, ytg), fail = opp(r.fieldLength - ytg, 1 - c);
    if (dist === ytg) out.go = [score(r.touchdown + r.kickTry, c * e.kickTry), score(r.touchdown, c * (1 - e.kickTry)), fail];
    else { const y = ytg - dist; out.go = [{ probability: c, state: st(true, base.scoreDiff, { yardsToGoalYd: y, distanceYd: Math.min(y, r.yardsToGain) }), deciderHasBall: true }, fail]; }
    const fg = e.fieldGoal(ytg);
    if (fg > 0) out.field_goal = [score(r.fieldGoal, fg), opp(Math.min(e.missedFieldGoalSpot(ytg), r.fieldLength - r.fgMissMinYardline), 1 - fg)];
    const punt = e.punt(ytg);
    if (punt !== null) out.punt = [opp(punt, 1)];
    return out;
  },
};

export const PRO_RULES: Record<string, number> = {
  'series.yards_to_gain': 10, 'field.goal_to_goal_yd': 100, 'try.kick_points': 1, 'try.two_point_points': 2, 'fg.miss_spot_min_yardline': 20,
  'kickoff.touchback_yardline': 30, 'clock.two_minute_timeout': 1, 'timeout.per_half': 3, 'foul.delay_of_game.yards': 5,
  'challenge.count': 2, 'challenge.requires_timeout': 1, 'challenge.needs_available_timeout': 1, 'overtime.two_point_required_from_period': 0,
};
/** A second rule set with different values for every key K5 reads (K5.8.1 acceptance). Fixture values. */
export const OTHER_RULES: Record<string, number> = {
  ...PRO_RULES, 'kickoff.touchback_yardline': 25, 'clock.two_minute_timeout': 0, 'challenge.count': 1, 'challenge.requires_timeout': 0,
  'challenge.needs_available_timeout': 0, 'overtime.two_point_required_from_period': 7, 'fg.miss_spot_min_yardline': 20,
};

export const draws = (...scope: (string | number)[]): Draws => stream(SEED, 'coachAI', scope);

export function env(scope: (string | number)[], over: Partial<Env> = {}, rules = PRO_RULES): Env {
  return { model: MODEL, math: MATH, rules: fixtureRules(rules), draws: draws(...scope), errors: true, ...over };
}

export function estimates(range = 55): StaffEstimates {
  return {
    convert: (d) => (d <= 1 ? 0.7 : d <= 2 ? 0.6 : d <= 3 ? 0.55 : d <= 6 ? 0.42 : 0.3),
    fieldGoal: (ytg) => { const k = ytg + 17; return k > range ? 0 : k <= 30 ? 0.97 : 0.97 - (k - 30) * 0.012; },
    missedFieldGoalSpot: (ytg) => 100 - (ytg + 7),
    punt: (ytg) => (ytg < 35 ? null : Math.max(20, 100 - (ytg - 42))),
    kickTry: 0.95, twoPoint: 0.48,
  };
}

export function sit(p: Partial<Situation> = {}): Situation {
  return {
    hasBall: true, down: 1, distanceYd: 10, yardsToGoalYd: 75, scoreDiff: 0, gameSecondsLeft: 2700, halfSecondsLeft: 900, firstHalf: true, overtime: false, period: 2,
    receivesSecondHalfKickoff: false, timeoutsOwn: 3, timeoutsOpp: 3, home: false, pregameGap: 0, clockRunning: true, autoStopPending: true, playClockS: 25, ...p,
  };
}

const T0 = { fourthDownOffset: 0, twoPointOffset: 0, endOfHalfAggression: 0, leadProtection: 0, deficitUrgency: 0, lateDefenseRisk: 0, starterRestBias: 0, analyticsTrust: 1, challengeEagerness: 0, iceKicker: 0.35,
  veteranBias: 0, backupRepShare: 0, emphasis: { takeaway: 0, tackleAttack: 0, rushLanes: 0, cornerJump: 0 } };

export function coach(t: Partial<CoachInputs['tendencies']> = {}, b: Partial<CoachInputs['behavior']> = {}, advisor = true): CoachInputs {
  return { tendencies: { ...T0, ...t }, behavior: { clockManagement: 0, evaluation: 0, ...b }, advisor };
}

/** Share of `n` independent trials (each with its own stream scope) where `f` is true. */
export function share(n: number, f: (i: number) => boolean): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (f(i)) k++;
  return k / n;
}
