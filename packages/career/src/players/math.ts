// Small deterministic helpers. Core code may not call platform transcendental math (P1.1.1), and `career`
// may not import engine-core, so the half-life decay of L1.1.2 is computed from halving and square roots
// only: IEEE square root is correctly rounded on every platform, so the result is the same everywhere.
import { DAYS_PER_YEAR } from '@gm/league';
import type { WorldDate } from '@gm/schema';

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Linear map of `x` in [0, 100] through the points (0, a), (50, mid), (100, b). */
export function through3(x: number, a: number, mid: number, b: number): number {
  const t = clamp(x, 0, 100);
  return t <= 50 ? a + (mid - a) * (t / 50) : mid + (b - mid) * ((t - 50) / 50);
}

const FRACTION_BITS = 40;

/**
 * 0.5 to the power `x` for `x >= 0`: whole halvings, then the binary digits of the fraction, each digit
 * a factor of 0.5^(2^-k) found by repeated square roots. Exact to well under 1e-9.
 */
export function halfPow(x: number): number {
  if (!(x >= 0)) throw new Error(`halfPow needs a non-negative exponent, got ${x}`);
  let whole = Math.floor(x);
  let frac = x - whole;
  let out = 1;
  while (whole-- > 0) out *= 0.5;
  let root = 0.5;
  for (let k = 0; k < FRACTION_BITS && frac > 0; k++) {
    root = Math.sqrt(root);
    frac *= 2;
    if (frac >= 1) { out *= root; frac -= 1; }
  }
  return out;
}

/** Whole weeks from `a` to `b` (negative if `b` is earlier). Seasons are DAYS_PER_YEAR days long. */
export function weeksBetween(a: WorldDate, b: WorldDate): number {
  const days = (b.seasonYear - a.seasonYear) * DAYS_PER_YEAR + (b.dayIndex - a.dayIndex);
  return Math.floor(days / 7);
}

export function daysBetween(a: WorldDate, b: WorldDate): number {
  return (b.seasonYear - a.seasonYear) * DAYS_PER_YEAR + (b.dayIndex - a.dayIndex);
}
