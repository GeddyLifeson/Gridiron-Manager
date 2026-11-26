// K5.2.1: go, kick, or punt. The answer is the unit sent onto the field (J11.6.1); K4 then picks the play.
import { wp as wpNs } from '@gm/models';
import { decide, PTS, type MethodResult } from './method.ts';
import { param } from './params.ts';
import { chartBase, chartRules, scoresApart } from './state.ts';
import type { ChartPort, CoachInputs, Env, FourthOption, OptionEst, Situation, StaffEstimates, WeeklyCell } from './types.ts';

export interface FourthDownInput {
  readonly situation: Situation;
  readonly estimates: StaffEstimates;
  readonly chart: ChartPort;
  readonly coach: CoachInputs;
  /** The weekly chart cells (N2.4.1), read when no advisor holds the duty (K5.1.1 rule 5). */
  readonly weekly?: readonly WeeklyCell[];
}

export interface FourthDownResult extends MethodResult {
  readonly unit: 'offense' | 'field_goal' | 'punt';
  /** Hint to K4: the short-yardage box (K5.2.1 outputs). */
  readonly shortYardage: boolean;
}

/** K5.2.1 rules 3 and 4: the stored offset applies at fourth and 1, grows with distance, and shrinks when punting is giving up. */
export function fourthDownOffsetPts(s: Situation, coach: CoachInputs, env: Env): number {
  let offset = coach.tendencies.fourthDownOffset + param('fourth.offsetPerYardPts') * (s.distanceYd > 1 ? s.distanceYd - 1 : 0);
  if (s.firstHalf || s.scoreDiff >= 0 || offset <= 0) return offset;
  if (s.gameSecondsLeft <= param('fourth.desperateS')) return 0;
  if (s.gameSecondsLeft <= param('fourth.lateS') && scoresApart(s.scoreDiff, env.rules) > 1) offset *= param('fourth.lateOffsetFactor');
  return offset;
}

function evaluate(env: Env, i: FourthDownInput): { options: OptionEst[]; longShots: FourthOption[]; habit: FourthOption } {
  const s = i.situation;
  const outs = i.chart.fourthDownOutcomes(chartBase(s), chartRules(env.rules), i.estimates, s.yardsToGoalYd, s.distanceYd);
  const inRange = i.estimates.fieldGoal(s.yardsToGoalYd) >= param('fourth.fgRangeMin');
  const options: OptionEst[] = [];
  const longShots: FourthOption[] = [];
  for (const id of ['field_goal', 'go', 'punt'] as const) {
    const list = outs[id];
    if (!list) continue;
    // Rule 1: a kick outside the staff's range is legal but not weighed; it keeps the floor chance.
    if (id === 'field_goal' && !inRange) { longShots.push(id); continue; }
    options.push({ id, wp: wpNs.optionWp(env.model, list, env.math).value });
  }
  // Rule 2: the habit is the field goal in range and the punt otherwise (the offense where neither exists).
  const has = (id: FourthOption) => options.some((o) => o.id === id);
  return { options, longShots, habit: has('field_goal') ? 'field_goal' : has('punt') ? 'punt' : 'go' };
}

function weeklyLine(i: FourthDownInput): { choice: string; marginPts: number } | null {
  if (!i.weekly) return null;
  const s = i.situation;
  let best: WeeklyCell | null = null, gap = Infinity;
  for (const c of i.weekly) {
    if (c.distanceYd !== Math.round(s.distanceYd)) continue;
    const g = Math.abs(c.yardsToGoalYd - s.yardsToGoalYd);
    if (g < gap) { gap = g; best = c; }
  }
  return best ? { choice: best.model, marginPts: best.margin * PTS } : null;
}

export function fourthDown(env: Env, i: FourthDownInput): FourthDownResult {
  const e = evaluate(env, i);
  const r = decide({
    decisionType: 'fourth_down', options: e.options, longShots: e.longShots, habit: e.habit, offsetPts: fourthDownOffsetPts(i.situation, i.coach, env),
    advisor: i.coach.advisor, analyticsTrust: i.coach.tendencies.analyticsTrust, weekly: weeklyLine(i), draws: env.draws,
  });
  const unit = r.chosen === 'go' ? 'offense' : (r.chosen as 'field_goal' | 'punt');
  return { ...r, unit, shortYardage: unit === 'offense' && i.situation.distanceYd <= param('fourth.shortYd') };
}

/**
 * K5.2.1 rule 5: on third down he pre-decides ("two-down territory") when the model margin on the
 * expected fourth-down state beats his offset by 2 points or more. `expected` is that fourth-down state.
 * No draw is taken: the fourth-down decision itself is still made when third down ends.
 */
export function twoDownTerritory(env: Env, i: FourthDownInput): boolean {
  const e = evaluate(env, i);
  const go = e.options.find((o) => o.id === 'go'), habit = e.options.find((o) => o.id === e.habit);
  if (!go || !habit || e.habit === 'go') return e.habit === 'go';
  return (go.wp - habit.wp) * PTS - fourthDownOffsetPts(i.situation, i.coach, env) >= param('fourth.preDecidePts');
}
