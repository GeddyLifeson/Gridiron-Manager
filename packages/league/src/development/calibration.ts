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

export interface DriftResult {
  readonly series: string;
  readonly slopePerSeason: number;
  readonly driftOverRun: number;
  /** Standard error of the drift, corrected for year-to-year persistence (lag-1 autocorrelation). */
  readonly driftSe: number;
  readonly allowed: number;
  readonly withinBand: boolean;
  readonly ok: boolean;
}

/**
 * Q1.6.4 drift test for one series: fit a line over the window; the drift over the window (slope x
 * length) must be within `maxDrift`, or within `seMultiple` standard errors when the series is so
 * small and persistent that its noise alone exceeds `maxDrift` (a 32-player position wanders by
 * generations). The standard error uses the residuals' lag-1 autocorrelation for an effective sample
 * size. Every value must also sit inside [lo, hi].
 */
export function driftTest(math: DeterministicMath, series: string, seasons: readonly number[], values: readonly number[], maxDrift: number, seMultiple: number, lo: number, hi: number): DriftResult {
  const s = slope(seasons, values);
  const nPts = seasons.length;
  const span = nPts > 0 ? seasons[nPts - 1]! - seasons[0]! : 0;
  const drift = s * span;
  const mx = mean(seasons);
  const my = mean(values);
  const resid = values.map((v, i) => v - (my + s * (seasons[i]! - mx)));
  const sxx = seasons.reduce((acc, x) => acc + (x - mx) * (x - mx), 0);
  const dof = Math.max(1, nPts - 1 - 1);
  const rss = resid.reduce((acc, r) => acc + r * r, 0);
  let lag = 0;
  for (let i = 1; i < nPts; i++) lag += resid[i]! * resid[i - 1]!;
  const rho = rss > 0 ? Math.min((nPts - 1) / (nPts + 1), Math.max(0, lag / rss)) : 0;
  const inflate = math.sqrt((1 + rho) / (1 - rho));
  const seSlope = sxx > 0 ? math.sqrt(rss / dof / sxx) * inflate : 0;
  const driftSe = seSlope * span;
  const allowed = Math.max(maxDrift, seMultiple * driftSe);
  const withinBand = values.every((v) => v >= lo && v <= hi);
  return { series, slopePerSeason: s, driftOverRun: drift, driftSe, allowed, withinBand, ok: Math.abs(drift) <= allowed && withinBand };
}
