// Measurement helpers for the D8.2.1 calibration and the Q1.6.4 drift report. Pure functions over
// rows the headless runner collects, so simulated leagues are measured the same way as the real
// data (same-player paired changes, both seasons qualifying: the same survivor bias, D8.2.1).
import type { DeterministicMath } from '@gm/schema';

export interface SeasonRow {
  readonly personId: number;
  readonly season: number;
  readonly ageYears: number;
  readonly value: number;
  readonly qualifies: boolean;
}

export interface DeltaCell { readonly age: number; readonly pairs: number; readonly meanDelta: number; readonly se: number }

/** Delta method by age (age in the first season of the pair), as in the research script. */
export function deltaByAge(math: DeterministicMath, rows: readonly SeasonRow[]): DeltaCell[] {
  const key = (id: number, s: number) => `${id}:${s}`;
  const byKey = new Map<string, SeasonRow>();
  for (const r of rows) byKey.set(key(r.personId, r.season), r);
  const groups = new Map<number, number[]>();
  for (const r of rows) {
    if (!r.qualifies) continue;
    const next = byKey.get(key(r.personId, r.season + 1));
    if (!next || !next.qualifies) continue;
    const list = groups.get(r.ageYears) ?? [];
    list.push(next.value - r.value);
    groups.set(r.ageYears, list);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([age, d]) => {
    const m = mean(d);
    const sd = d.length > 1 ? math.sqrt(d.reduce((s, x) => s + (x - m) * (x - m), 0) / (d.length - 1)) : 0;
    return { age, pairs: d.length, meanDelta: m, se: d.length > 0 ? sd / math.sqrt(d.length) : 0 };
  });
}

export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

export function sd(math: DeterministicMath, xs: readonly number[]): number {
  if (xs.length < 1 + 1) return 0;
  const m = mean(xs);
  return math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
}

/** Least-squares slope of y on x. */
export function slope(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i]! - mx) * (ys[i]! - my); den += (xs[i]! - mx) * (xs[i]! - mx); }
  return den === 0 ? 0 : num / den;
}

export interface DriftResult { readonly series: string; readonly slopePerSeason: number; readonly driftOverRun: number; readonly withinBand: boolean; readonly ok: boolean }

/**
 * Q1.6.4 drift test for one series: fit a line over the window and require the total drift over the
 * window (slope x length) within `maxDrift`, and every value inside [lo, hi].
 */
export function driftTest(series: string, seasons: readonly number[], values: readonly number[], maxDrift: number, lo: number, hi: number): DriftResult {
  const s = slope(seasons, values);
  const span = seasons.length > 0 ? seasons[seasons.length - 1]! - seasons[0]! : 0;
  const drift = s * span;
  const withinBand = values.every((v) => v >= lo && v <= hi);
  return { series, slopePerSeason: s, driftOverRun: drift, withinBand, ok: Math.abs(drift) <= maxDrift && withinBand };
}
