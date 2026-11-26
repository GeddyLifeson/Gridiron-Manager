// Overall grade for a position and role (D6.2.2). A reading aid only: the engine never uses it, and the
// AI uses it only to order candidates before simulating or comparing attributes.
import type { Estimate } from './estimate.ts';

/** Role weight table: attribute id to weight, summing to 1. Owned by F1 and G content; scheme-specific. */
export type RoleWeights = Readonly<Record<string, number>>;

export function checkWeights(w: RoleWeights): string[] {
  const out: string[] = [];
  let sum = 0;
  for (const [k, v] of Object.entries(w)) {
    if (!(v >= 0)) out.push(`weight for ${k} must not be negative`);
    sum += v;
  }
  if (Math.abs(sum - 1) > 1e-9) out.push(`weights sum to ${sum}, not 1`);
  return out;
}

/**
 * Role grade = weighted mean of the attribute estimates the role uses. Its variance is the weighted sum
 * of the attribute variances, as D6.2.2 states it (README S-05): with weights summing to 1 this is never
 * narrower than the independent-attribute variance, which keeps the band honest when one evaluator's lean
 * moves several attributes together. An attribute with no estimate is an error: the caller supplies a
 * prior built from physical values and related techniques (D6.2.2 edge case).
 */
export function roleGrade(estimates: Readonly<Record<string, Pick<Estimate, 'mean' | 'variance'>>>, w: RoleWeights): { mean: number; variance: number } {
  const problems = checkWeights(w);
  if (problems.length) throw new Error(problems.join('; '));
  let mean = 0;
  let variance = 0;
  for (const [attr, weight] of Object.entries(w)) {
    if (weight === 0) continue;
    const e = estimates[attr];
    if (!e) throw new Error(`no estimate for ${attr}; supply a prior`);
    mean += weight * e.mean;
    variance += weight * e.variance;
  }
  return { mean, variance };
}
