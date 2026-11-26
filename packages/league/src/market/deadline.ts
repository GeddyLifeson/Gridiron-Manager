// C8.4.2 deadline week: each club's stance (buy, hold, sell) from playoff odds and the general manager's
// habits, the head coach's voice, and the objection record the owner reads in the season review.
import { P } from './params.ts';

export const STANCES = ['sell', 'hold', 'buy'] as const;
export type Stance = (typeof STANCES)[number];

export interface StanceInput {
  /** Playoff odds, percent (N2). */
  readonly playoffOddsPct: number;
  /**
   * General manager's lean in steps: positive buys sooner (his habits, or a job he must save this year),
   * negative sells sooner. Each step moves both thresholds by `habitShiftPctPerStep` points of odds.
   */
  readonly gmLeanSteps: number;
  /** The head coach's view, if he gives one. */
  readonly coach: { readonly wants: Stance; readonly trust: number; readonly hasTradeSay: boolean } | null;
}

export interface StanceResult {
  readonly stance: Stance;
  /** The personnel man's own stance, stated beside the user's when the user holds trade say (rule 2). */
  readonly gmStance: Stance;
  readonly coachMovedIt: boolean;
  /** A sell stance with the coach objecting is recorded for the season review (rule 3; L5.1.2, E4). */
  readonly objectionRecorded: boolean;
}

/** C8.4.2 rule 1: buy above the buy threshold, sell below the sell threshold, hold between, each shifted by lean. */
export function gmStance(oddsPct: number, leanSteps: number): Stance {
  const shift = leanSteps * P.habitShiftPctPerStep;
  if (oddsPct > P.buyAboveOddsPct - shift) return 'buy';
  if (oddsPct < P.sellBelowOddsPct - shift) return 'sell';
  return 'hold';
}

const step = (s: Stance, toward: Stance): Stance => {
  const i = STANCES.indexOf(s), j = STANCES.indexOf(toward);
  return STANCES[i + Math.sign(j - i)]!;
};

/** C8.4.2 rules 1 to 3. Logged for every club each year (acceptance). */
export function deadlineStance(x: StanceInput): StanceResult {
  const gm = gmStance(x.playoffOddsPct, x.gmLeanSteps);
  let stance = gm, coachMovedIt = false;
  if (x.coach?.hasTradeSay) { stance = x.coach.wants; coachMovedIt = stance !== gm; }
  else if (x.coach && x.coach.trust >= P.voiceTrustThreshold && x.coach.wants !== gm) { stance = step(gm, x.coach.wants); coachMovedIt = true; }
  const objectionRecorded = stance === 'sell' && !!x.coach && x.coach.wants !== 'sell';
  return { stance, gmStance: gm, coachMovedIt, objectionRecorded };
}
