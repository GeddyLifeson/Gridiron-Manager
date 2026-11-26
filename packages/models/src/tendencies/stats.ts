// Weighted rate, effective sample size and the Wilson interval (H2.2.1 rules 1 to 3).

/** n_eff = (sum w)^2 / sum(w^2) (H2.2.1 rule 2). Zero for no weight. */
export function effectiveN(weights: readonly number[]): number {
  let s = 0, s2 = 0;
  for (const w of weights) { s += w; s2 += w * w; }
  return s2 > 0 ? (s * s) / s2 : 0;
}

/** Wilson score interval for a rate `p` on `n` (effective) trials at normal quantile `z`. */
export function wilson(p: number, n: number, z: number): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 };
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}
