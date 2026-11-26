// K5.3.1: one point or two. K5.1.1 with the kick as the habit; the win-probability search finds the
// late-game chart cases (down 2 after scoring, and so on) with no separate table.
import { wp as wpNs } from '@gm/models';
import { decide, type MethodResult } from './method.ts';
import { kickoffToOpponent } from './state.ts';
import type { CoachInputs, Env, OptionOutcome, Situation, StaffEstimates } from './types.ts';

export interface TryInput {
  /** The scoreboard after the touchdown, before the try. */
  readonly situation: Situation;
  /** `kickTry` and `twoPoint` are read; a kicker hurt in the game lowers `kickTry` (edge case). */
  readonly estimates: Pick<StaffEstimates, 'kickTry' | 'twoPoint'>;
  readonly coach: CoachInputs;
}

export interface TryResult extends MethodResult {
  readonly choice: 'kick' | 'two_point';
  /** The rule set requires the two-point attempt in this period (B10, B13): there was nothing to decide. */
  readonly forced: boolean;
}

function option(env: Env, s: Situation, points: number, chance: number): number {
  const outs: OptionOutcome[] = [
    { probability: chance, state: kickoffToOpponent(s, points, env.rules), deciderHasBall: false },
    { probability: 1 - chance, state: kickoffToOpponent(s, 0, env.rules), deciderHasBall: false },
  ];
  return wpNs.optionWp(env.model, outs, env.math).value;
}

export function tryChoice(env: Env, i: TryInput): TryResult {
  const s = i.situation;
  const from = env.rules.num('overtime.two_point_required_from_period');
  const forced = s.overtime && from > 0 && s.period >= from;
  const two = { id: 'two_point', wp: option(env, s, env.rules.num('try.two_point_points'), i.estimates.twoPoint) };
  const kick = { id: 'kick', wp: option(env, s, env.rules.num('try.kick_points'), i.estimates.kickTry) };
  const r = decide({
    decisionType: 'try', options: forced ? [two] : [kick, two], habit: forced ? 'two_point' : 'kick', offsetPts: i.coach.tendencies.twoPointOffset,
    advisor: i.coach.advisor, analyticsTrust: i.coach.tendencies.analyticsTrust, draws: env.draws,
  });
  return { ...r, choice: r.chosen as 'kick' | 'two_point', forced };
}
