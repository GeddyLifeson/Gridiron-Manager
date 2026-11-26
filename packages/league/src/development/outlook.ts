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
  const noise = num(n, 'aging.noiseSdPoints');
  const traitSd = num(n, 'aging.traitSd');
  // Prior from the position curve; the staff's observed trend updates it by precision weighting.
  const priorVar = expected * expected * traitSd * traitSd + noise * noise;
  const obsVar = o.trendSdPoints * o.trendSdPoints;
  const w = o.observedTrendPercent === null ? 0 : priorVar / (priorVar + obsVar);
  const mean = (1 - w) * expected + w * (o.observedTrendPercent ?? 0);
  const spread = Math.max(noise, math.sqrt((1 - w) * priorVar + noise * noise));
  const zScore = (-num(n, 'outlook.dropPercent') - mean) / spread;
  const chance = math.logistic(num(n, 'outlook.probitScale') * zScore);
  const label: OutlookLabel = chance < num(n, 'outlook.lowBelow') ? 'low' : chance > num(n, 'outlook.highAbove') ? 'high' : 'moderate';
  return { chance, label };
}
