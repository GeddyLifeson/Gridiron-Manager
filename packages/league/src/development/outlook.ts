// What the coach sees (D8.5.1): an aging outlook from the organisation's own estimates, never from
// the hidden aging trait. Risk is the estimated chance of a drop of 3 percent or more next season.
import type { DeterministicMath } from '@gm/schema';
import { curvePercent } from './aging.ts';
import type { PositionFamily } from './classes.ts';
import { num, type DevNumbers } from './params.ts';

export type OutlookLabel = 'low' | 'moderate' | 'high';

export interface OutlookInput {
  readonly family: PositionFamily;
  /** The organisation's estimate of his age next September (usually exact). */
  readonly estimatedAgeNext: number;
  /** Observed two-year trend of physical estimates, percent per year (negative = declining), or null. */
  readonly observedTrendPercent: number | null;
  /** Staff error on that trend, percent points (evaluator skill, D6). */
  readonly trendSdPoints: number;
}

export function agingOutlook(n: DevNumbers, math: DeterministicMath, o: OutlookInput): { chance: number; label: OutlookLabel } {
  const expected = curvePercent(n, o.family, o.estimatedAgeNext);
  const trend = o.observedTrendPercent;
  // Weight the trend by how much the staff trusts it: a noisy read counts less.
  const noise = num(n, 'aging.noiseSdPoints');
  const spread = math.sqrt(expected * expected * num(n, 'aging.traitSd') * num(n, 'aging.traitSd') + noise * noise + o.trendSdPoints * o.trendSdPoints);
  const wTrend = trend === null ? 0 : (spread * spread) / (spread * spread + o.trendSdPoints * o.trendSdPoints + num(n, 'outlook.estimateSdPoints') * num(n, 'outlook.estimateSdPoints'));
  const mean = trend === null ? expected : (1 - wTrend) * expected + wTrend * trend;
  const zScore = (-num(n, 'outlook.dropPercent') - mean) / Math.max(spread, noise);
  const chance = math.logistic(num(n, 'outlook.probitScale') * zScore);
  const label: OutlookLabel = chance < num(n, 'outlook.lowBelow') ? 'low' : chance > num(n, 'outlook.highAbove') ? 'high' : 'moderate';
  return { chance, label };
}
