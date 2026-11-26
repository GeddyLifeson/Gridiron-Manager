// Automated calibration, part 0: the list of parameters the search may move.
// Every row comes from the parameter files a game reads (real-game ALL_ENGINE_PARAM_FILES). Each row
// carries the range its own module declared (TuningParam min and max, J6.8.1): the search never leaves it.
// A frozen row, a row with no range, and a row a filter excludes are not tunable.
import type { ParamFile } from '@gm/schema';

export interface Tunable {
  readonly name: string;
  readonly module: string;
  readonly value: number;
  /** The declared range, widened to hold the current value when that sits outside it. */
  readonly lo: number;
  readonly hi: number;
  readonly unit: string;
  readonly basis: string;
  readonly leaf: string;
  readonly constrainedBy: string;
  /** The current value sits outside the range its module declared (reported: the range or the value is wrong). */
  readonly outsideDeclared: boolean;
}

export interface RegistryFilter {
  /** Only names matching this pattern. */
  readonly include?: RegExp;
  /** No names matching this pattern. */
  readonly exclude?: RegExp;
}

export function tunables(files: readonly ParamFile[], filter: RegistryFilter = {}): Tunable[] {
  const out: Tunable[] = [];
  for (const f of files) for (const p of f.params) {
    if (p.status === 'frozen') continue;
    if (![p.value, p.min, p.max].every(Number.isFinite)) continue;
    const lo = Math.min(p.min, p.value), hi = Math.max(p.max, p.value);
    if (!(hi > lo)) continue;
    if (filter.include && !filter.include.test(p.name)) continue;
    if (filter.exclude && filter.exclude.test(p.name)) continue;
    out.push({ name: p.name, module: f.module, value: p.value, lo, hi, unit: p.unit, basis: p.basis, leaf: p.leaf, constrainedBy: p.constrainedBy, outsideDeclared: p.value < p.min || p.value > p.max });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Position of a value in the row's range, 0 at the low end and 1 at the high end. */
export const unitOf = (p: Tunable, value: number = p.value): number => (value - p.lo) / (p.hi - p.lo);

/** The value at a position in the range (clamped to it). Twelve significant digits, so files stay readable. */
export function valueAt(p: Tunable, u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return Number((p.lo + c * (p.hi - p.lo)).toPrecision(12));
}

/** A fixed generator for the scan designs (mulberry32): the same seed gives the same design on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
