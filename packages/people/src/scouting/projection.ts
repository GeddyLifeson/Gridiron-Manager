// Projection: grading what a player will become (D6.5.1, D6.4.5 rule 5). The organisation holds an
// estimate of each ceiling exactly as it holds estimates of current values (estimate.ts); this file turns
// the two into a projected grade, band and arrow. No true ceiling is read here.
import type { Estimate } from './estimate.ts';
import type { Arrow } from './display.ts';
import { skillMultiplier } from './evidence.ts';
import { p } from './params.ts';

/** Projection noise sd for one scouting look: 14 ISS at 17, falling linearly to 6 by 23 (D6.5.1). */
export function projectionLookSd(age: number): number {
  const a0 = p('projection.youngAge');
  const a1 = p('projection.settledAge');
  const s0 = p('projection.noiseSdAt17');
  const s1 = p('projection.noiseSdAt23');
  if (age <= a0) return s0;
  if (age >= a1) return s1;
  return s0 + (s1 - s0) * (age - a0) / (a1 - a0);
}

/** Variance of one ceiling look by an evaluator of the given skill (D6.5.1 with the D6.4.2 skill rule). */
export function ceilingLookVariance(age: number, skill: number): number {
  const sd = projectionLookSd(age) * skillMultiplier(skill);
  return sd * sd;
}

/**
 * Share of the way from current value to ceiling covered after `years`. A D7 curve from the development
 * package (G-20) replaces this; until then the default is linear to `projection.defaultPeakAge`.
 */
export type CurveShare = (age: number, years: number) => number;

export const linearToPeak: CurveShare = (age, years) => {
  const left = p('projection.defaultPeakAge') - age;
  if (left <= 0) return 1;
  const f = years / left;
  return f > 1 ? 1 : f < 0 ? 0 : f;
};

export type Horizon = { readonly kind: 'peak' } | { readonly kind: 'years'; readonly years: number };

export interface Projection {
  readonly mean: number;
  readonly variance: number;
  readonly arrow: Arrow;
  readonly horizon: Horizon;
}

export function arrowFor(projectedMean: number, currentMean: number): Arrow {
  const d = projectedMean - currentMean;
  if (d >= p('projection.arrowIss')) return 'rising';
  if (d <= -p('projection.arrowIss')) return 'falling';
  return 'steady';
}

/**
 * The projected grade (D6.5.1): the median outcome of running the expected curve from the current estimate
 * toward the estimated ceiling, with an 80 percent band. A player moving up `levelsUp` levels has the band's
 * sd widened by 3 ISS per level (D6.4.5 rule 5). Players past 28 show no projection beyond the aging
 * outlook (D8): returns null.
 */
export function project(input: {
  readonly current: Pick<Estimate, 'mean' | 'variance'>;
  readonly ceiling: Pick<Estimate, 'mean' | 'variance'>;
  readonly age: number;
  readonly horizon: Horizon;
  readonly levelsUp?: number;
  readonly curve?: CurveShare;
}): Projection | null {
  if (input.age > p('projection.noneAfterAge')) return null;
  const { current, ceiling } = input;
  // A ceiling read below the current read means no growth is expected, not decline.
  const ceilMean = ceiling.mean > current.mean ? ceiling.mean : current.mean;
  const f = input.horizon.kind === 'peak' ? 1 : (input.curve ?? linearToPeak)(input.age, input.horizon.years);
  const mean = current.mean + f * (ceilMean - current.mean);
  const baseVar = (1 - f) * (1 - f) * current.variance + f * f * ceiling.variance;
  const sd = Math.sqrt(baseVar) + p('projection.levelJumpSd') * (input.levelsUp ?? 0);
  return { mean, variance: sd * sd, arrow: arrowFor(mean, current.mean), horizon: input.horizon };
}
