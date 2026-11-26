// Variance strategy brief for underdogs and favourites (N2.4.2). The caller runs paired quick
// simulations of this matchup with and without each lever, on the staff's estimates of both rosters
// (never true ratings), within the G-area test-simulation limit. This module turns the paired results
// into the brief: the change in win share with its standard error, "no clear effect" inside the error,
// and "no variance edge" for a near-even game. The brief never issues an order (rule 2).
import type { DeterministicMath } from '@gm/schema';
import { param } from './params.ts';

export class VarianceError extends Error {}

export type VarianceLever = 'fewer_possessions' | 'fourth_down_aggression' | 'surprise_kicks' | 'deep_shots' | 'pressure_rate' | 'early_two_point';
export const VARIANCE_LEVERS: readonly VarianceLever[] = ['fewer_possessions', 'fourth_down_aggression', 'surprise_kicks', 'deep_shots', 'pressure_rate', 'early_two_point'];

/** One paired simulation: the same seed run without and with the lever. Results 1 win, 0.5 tie, 0 loss for the user's team. */
export interface PairedResult {
  readonly without: number;
  readonly with: number;
}

export interface LeverEstimate {
  readonly lever: VarianceLever;
  readonly games: number;
  readonly winShareWithout: number;
  readonly winShareWith: number;
  /** Change in win share (with minus without). */
  readonly effect: number;
  /** Standard error of the paired mean difference. */
  readonly se: number;
  /** False when the effect lies inside the error: reported as "no clear effect" (rule 1). */
  readonly clear: boolean;
}

export interface VarianceBrief {
  /** Model gap in points from the user's team's view (positive: favourite), from N2.6.1. */
  readonly gapPoints: number;
  readonly side: 'underdog' | 'favourite' | 'even';
  /** Gap under `variance.nearEvenPts`: shown as "no variance edge" (edge cases). */
  readonly noVarianceEdge: boolean;
  readonly levers: readonly LeverEstimate[];
}

/** Paired estimate of one lever (rule 1). */
export function estimateLever(lever: VarianceLever, pairs: readonly PairedResult[], math: DeterministicMath): LeverEstimate {
  const n = pairs.length;
  if (n < 2) throw new VarianceError(`lever ${lever}: at least two paired games are needed`);
  let sw = 0, sv = 0, sd = 0;
  for (const p of pairs) {
    for (const v of [p.without, p.with]) if (!(v === 0 || v === 0.5 || v === 1)) throw new VarianceError(`lever ${lever}: result ${v} is not 0, 0.5 or 1`);
    sw += p.without; sv += p.with; sd += p.with - p.without;
  }
  const mean = sd / n;
  let ss = 0;
  for (const p of pairs) { const d = p.with - p.without - mean; ss += d * d; }
  const se = math.sqrt(ss / (n - 1) / n);
  const clear = se > 0 ? (mean > 0 ? mean : -mean) > param('variance.clearZ') * se : mean !== 0;
  return { lever, games: n, winShareWithout: sw / n, winShareWith: sv / n, effect: mean, se, clear };
}

/** The weekly brief (what the user sees). Levers keep the order the caller gives; no lever is recommended. */
export function varianceBrief(gapPoints: number, results: readonly { lever: VarianceLever; pairs: readonly PairedResult[] }[], math: DeterministicMath): VarianceBrief {
  const even = (gapPoints < 0 ? -gapPoints : gapPoints) < param('variance.nearEvenPts');
  return {
    gapPoints,
    side: even ? 'even' : gapPoints < 0 ? 'underdog' : 'favourite',
    noVarianceEdge: even,
    levers: results.map((r) => estimateLever(r.lever, r.pairs, math)),
  };
}

/**
 * How many paired games one lever may run this week (rule 3): the bible's starting count, capped by
 * what is left of the G-area test-simulation budget so the brief cannot solve the game in advance.
 */
export function simsAllowed(requested: number | null, budgetLeft: number): number {
  const want = requested ?? param('variance.simsPerLever');
  const n = want < budgetLeft ? want : budgetLeft;
  return n > 0 ? Math.floor(n) : 0;
}
