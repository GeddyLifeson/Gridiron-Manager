// Small deterministic helpers. Draws come from the caller's engine-core stream as a `() => number` in [0, 1);
// `career` may not import engine-core, and core code may not call platform transcendental math (P1.1.1).

export type Draw = () => number;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Linear blend from `a` (t = 0) to `b` (t = 1), with t clamped to [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  const u = clamp(t, 0, 1);
  return a + (b - a) * u;
}

/**
 * A standard normal deviate from twelve uniform draws (Irwin-Hall). No logarithm or root is needed, so the
 * value is the same on every platform. Tails stop at plus or minus 6, which no tuning here reaches.
 */
export function normal(draw: Draw): number {
  let s = 0;
  for (let i = 0; i < 12; i++) s += draw();
  return s - 6;
}

/** True with probability `p`, one draw. */
export function chance(p: number, draw: Draw): boolean {
  return draw() < p;
}

/** A whole number from `lo` to `hi` inclusive, one draw. */
export function intBetween(lo: number, hi: number, draw: Draw): number {
  return lo + Math.floor(draw() * (hi - lo + 1));
}

/** Round to a fixed number of decimals without locale calls. */
export function round(x: number, places: number): number {
  let f = 1;
  for (let i = 0; i < places; i++) f *= 10;
  return Math.round(x * f) / f;
}
