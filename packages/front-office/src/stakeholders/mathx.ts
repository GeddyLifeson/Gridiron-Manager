// Small deterministic helpers. Core purity (P1.1.1): no platform transcendental math, no `**`.
// front-office may not import engine-core, so per-step decay factors are found by bisection on plain
// multiplication, which is exact and identical on every platform.
import type { RandomStream } from '@gm/schema';

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** x to a non-negative integer power by repeated multiplication. */
export function powInt(x: number, n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r *= x;
  return r;
}

/**
 * Per-step keep factor f with f^h = 1/2 for a half-life of h steps (h a positive integer). Bisection to
 * 1e-12 on [0.5, 1); deterministic because it uses only comparisons and multiplication.
 */
export function halfLifeFactor(h: number): number {
  const steps = Math.max(1, Math.round(h));
  let lo = 0.5;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (powInt(mid, steps) > 0.5) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Move `from` toward `to` keeping `keep` of the gap. */
export const toward = (from: number, to: number, keep: number): number => to + (from - to) * keep;

/** Normal draw with mean and sd, clamped to [lo, hi]. */
export function bell(rng: RandomStream, mean: number, sd: number, lo: number, hi: number): number {
  return clamp(mean + sd * rng.normal(), lo, hi);
}

/** A standard normal correlated with `z` at `rho`: rho z + sqrt(1 - rho^2) e. */
export function correlated(rng: RandomStream, z: number, rho: number): number {
  return rho * z + Math.sqrt(1 - rho * rho) * rng.normal();
}
