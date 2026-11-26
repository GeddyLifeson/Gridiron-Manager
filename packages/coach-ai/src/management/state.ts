// Turning the scoreboard into the states the win-probability model values (N2.2.2). A state is always
// seen from the team in possession; a kickoff state from the receiving team (the G-07 convention).
import { wp as wpNs } from '@gm/models';
import type { ChartBase, ChartRuleValues, Env, RuleReader, Situation, WpState } from './types.ts';

export function chartRules(rules: RuleReader): ChartRuleValues {
  return {
    touchdown: rules.num('score.touchdown'), fieldGoal: rules.num('score.field_goal'), kickTry: rules.num('try.kick_points'),
    twoPointTry: rules.num('try.two_point_points'), yardsToGain: rules.num('series.yards_to_gain'),
    fieldLength: rules.num('field.goal_to_goal_yd'), fgMissMinYardline: rules.num('fg.miss_spot_min_yardline'),
  };
}

/** The most points one possession can score: a touchdown and a two-point try. */
export function oneScore(rules: RuleReader): number {
  return rules.num('score.touchdown') + rules.num('try.two_point_points');
}

/** How many possessions a margin is. 0 for a tie. */
export function scoresApart(margin: number, rules: RuleReader): number {
  const m = margin < 0 ? -margin : margin;
  return m === 0 ? 0 : Math.ceil(m / oneScore(rules));
}

export function chartBase(s: Situation): ChartBase {
  return {
    scoreDiff: s.scoreDiff, gameSecondsLeft: s.gameSecondsLeft, halfSecondsLeft: s.halfSecondsLeft, firstHalf: s.firstHalf,
    receivesSecondHalfKickoff: s.receivesSecondHalfKickoff, timeoutsOffense: s.timeoutsOwn, timeoutsDefense: s.timeoutsOpp, home: s.home, pregameGap: s.pregameGap,
  };
}

export interface StateChange {
  readonly down?: number; readonly distanceYd?: number; readonly yardsToGoalYd?: number;
  readonly timeoutsOwn?: number; readonly secondsUsed?: number; readonly scoreDiff?: number;
}

/** The scrimmage state of the team in possession, with optional changes. Returns the state and whether the deciding team has the ball. */
export function scrimmageState(s: Situation, c: StateChange = {}): { state: WpState; deciderHasBall: boolean } {
  const used = c.secondsUsed ?? 0;
  const game = s.gameSecondsLeft - used, half = s.halfSecondsLeft - used;
  const own = c.timeoutsOwn ?? s.timeoutsOwn;
  const diff = c.scoreDiff ?? s.scoreDiff;
  const state: WpState = {
    field: {
      kind: 'scrimmage', down: c.down ?? s.down, distanceYd: c.distanceYd ?? s.distanceYd, yardsToGoalYd: c.yardsToGoalYd ?? s.yardsToGoalYd,
      halfSecondsLeft: half > 0 ? half : 0, timeoutsOffense: s.hasBall ? own : s.timeoutsOpp, timeoutsDefense: s.hasBall ? s.timeoutsOpp : own, home: s.hasBall ? s.home : !s.home,
    },
    scoreDiff: s.hasBall ? diff : -diff, gameSecondsLeft: game > 0 ? game : 0, overtime: s.overtime, firstHalf: s.firstHalf,
    receivesSecondHalfKickoff: s.hasBall ? s.receivesSecondHalfKickoff : !s.receivesSecondHalfKickoff, pregameGap: s.hasBall ? s.pregameGap : -s.pregameGap,
  };
  return { state, deciderHasBall: s.hasBall };
}

/** The deciding team's win probability in a scrimmage state. */
export function wpOf(env: Env, s: Situation, c: StateChange = {}): number {
  const x = scrimmageState(s, c);
  const v = wpNs.wp(env.model, x.state, env.math).value;
  return x.deciderHasBall ? v : 1 - v;
}

/** The state after the deciding team scores `points` and kicks off: seen from the receiving opponent. */
export function kickoffToOpponent(s: Situation, points: number, rules: RuleReader): WpState {
  return {
    field: { kind: 'kickoff', down: 0, distanceYd: 0, yardsToGoalYd: rules.num('field.goal_to_goal_yd') - rules.num('kickoff.touchback_yardline'), halfSecondsLeft: s.halfSecondsLeft, timeoutsOffense: s.timeoutsOpp, timeoutsDefense: s.timeoutsOwn, home: !s.home },
    scoreDiff: -(s.scoreDiff + points), gameSecondsLeft: s.gameSecondsLeft, overtime: s.overtime, firstHalf: s.firstHalf,
    receivesSecondHalfKickoff: !s.receivesSecondHalfKickoff, pregameGap: -s.pregameGap,
  };
}
