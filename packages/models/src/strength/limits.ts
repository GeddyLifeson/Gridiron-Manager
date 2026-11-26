// The limits-of-the-model note (N2.7.2): every model output carries a confidence mark with reasons,
// and a decision whose options differ by less than the error band is a "coach's call".
import { param } from './params.ts';

export type ConfidenceMark = 'solid' | 'fair' | 'thin';

/** Reasons the mark opens to (N2.7.2 what the user sees). Text lives with the screen, by id. */
export type ConfidenceReason =
  | 'few_training_plays'
  | 'high_error'
  | 'small_sample'
  | 'weather_outside_range'
  | 'matchup_differs'
  | 'no_fitted_model';

export interface Confidence {
  readonly mark: ConfidenceMark;
  readonly reasons: readonly ConfidenceReason[];
  /** Sample behind the number when it is a counted statistic (shown as "small sample: 9 plays"). */
  readonly sample?: number;
}

export interface ConfidenceInputs {
  /** Standard error in win-probability units (0 to 1). */
  readonly se?: number;
  /** Training plays near this state (model support). */
  readonly density?: number;
  /** Plays or games behind a counted number. */
  readonly sample?: number;
  readonly weatherOutsideRange?: boolean;
  readonly matchupDiffers?: boolean;
  /** Custom rule set with no fitted model: everything is thin until a refit (edge cases). */
  readonly noFittedModel?: boolean;
}

/**
 * N2.7.2 rule 1. Thin: error above 3 points or training density under 200 plays. Solid: error under 1
 * point with enough density. Fair: between. A counted sample under the charted floor (N2.1.2) is thin.
 */
export function confidence(c: ConfidenceInputs): Confidence {
  const reasons: ConfidenceReason[] = [];
  let thin = false;
  if (c.noFittedModel) { reasons.push('no_fitted_model'); thin = true; }
  if (c.se !== undefined && c.se > param('limits.thinSe')) { reasons.push('high_error'); thin = true; }
  if (c.density !== undefined && c.density < param('limits.thinDensity')) { reasons.push('few_training_plays'); thin = true; }
  if (c.sample !== undefined && c.sample < param('limits.chartedFloor')) { reasons.push('small_sample'); thin = true; }
  if (c.weatherOutsideRange) reasons.push('weather_outside_range');
  if (c.matchupDiffers) reasons.push('matchup_differs');
  const solid = !thin && reasons.length === 0 && c.se !== undefined && c.se < param('limits.solidSe');
  const mark: ConfidenceMark = thin ? 'thin' : solid ? 'solid' : 'fair';
  return c.sample === undefined ? { mark, reasons } : { mark, reasons, sample: c.sample };
}

/**
 * N2.7.2 rule 2, owned here and applied by N3 and N4: options whose modelled values differ by less than
 * the error band are a coach's call, never scored as an error. The band is the larger of the chart band
 * (N2.4.1 rule 2) and the standard error of the difference.
 */
export function coachsCall(margin: number, seA: number, seB: number, sqrt: (x: number) => number): boolean {
  const band = param('chart.coachsCallWp');
  const seDiff = sqrt(seA * seA + seB * seB);
  return margin < (band > seDiff ? band : seDiff);
}

/** The standing page "What these numbers cannot tell you" (N2.7.2), as text ids in display order. Always shown (rule 3). */
export const LIMITS_NOTE: readonly string[] = [
  'limits.averages_not_matchup',
  'limits.hidden_injuries',
  'limits.fatigue',
  'limits.film_only',
  'limits.small_samples',
  'limits.good_decision_can_lose',
];
