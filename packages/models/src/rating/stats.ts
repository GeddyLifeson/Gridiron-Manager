// Small deterministic statistics for the score: a seeded integer generator (core reads no platform
// random, P1.1.1), weighted means with shrinkage, a bootstrap interval and percentiles.
import { param } from './params.ts';

/** xorshift32 over a 32-bit seed. Integer arithmetic only, so every platform gives the same draws. */
export class Draws {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  /** Next unsigned 32-bit value. */
  next(): number {
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x;
  }
  /** Integer in [0, n). */
  below(n: number): number { return this.next() % n; }
  /** Uniform in [0, 1). */
  unit(): number { return this.next() / 4294967296; }
}

/** FNV-1a over a string: a stable seed from the record ids, so the same inputs give the same range. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface Sample {
  /** Value per opportunity minus the reference coach's value for the same opportunity. Higher is better. */
  readonly diff: number;
  /** Credit weight (1 own decision, the suggestion weight for an accepted suggestion). */
  readonly weight: number;
}

/** N4.2.1 rule 3: (n x observed + k x prior) / (n + k); the prior is the reference coach, difference 0. */
export function shrunkMean(samples: readonly Sample[], k = param('shrinkageK')): number {
  let n = 0, sum = 0;
  for (const s of samples) { n += s.weight; sum += s.weight * s.diff; }
  return sum / (n + k);
}

export function effectiveCount(samples: readonly Sample[]): number {
  let n = 0;
  for (const s of samples) n += s.weight;
  return n;
}

/** Nearest-rank percentile of sorted values, p in [0, 1]. */
export function percentileSorted(sorted: readonly number[], p: number): number {
  if (!sorted.length) throw new Error('percentile of no values');
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i]!;
}

/** Bootstrap interval of `stat` over resamples of `items` (N4.2.1 rule 3 "the range shown is a bootstrap interval"). */
export function bootstrap<T>(items: readonly T[], stat: (xs: readonly T[]) => number, seed: number, draws = param('bootstrapDraws'), level = param('intervalLevel')): { low: number; high: number } {
  if (!items.length) { const v = stat(items); return { low: v, high: v }; }
  const g = new Draws(seed);
  const out: number[] = [];
  const buf: T[] = new Array<T>(items.length);
  for (let d = 0; d < draws; d++) {
    for (let i = 0; i < items.length; i++) buf[i] = items[g.below(items.length)]!;
    out.push(stat(buf));
  }
  out.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  return { low: percentileSorted(out, tail), high: percentileSorted(out, 1 - tail) };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
