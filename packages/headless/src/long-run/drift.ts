// Q1.6.4 drift report: for each series, a least-squares line over seasons 5 to 30 whose slope must sit
// within a tolerance of zero, and every season inside the series' band. Records: the rate at which they
// fall after season 10 must decline toward a low steady rate and never rise. Tolerances come from real
// NFL variation where a row exists in tolerances.ts (G-88 research), else they are Assumptions; the caller can override any.
import { param } from './params.ts';
import { REAL_TOLERANCES } from './tolerances.ts';
import type { RecordFall, SeasonPoint } from './series.ts';

export interface Band { readonly min: number; readonly max: number }

export interface DriftOptions {
  /** 1-based season index the fit starts at (Q1.6.4: 5). */
  readonly fitFrom?: number;
  /** Largest |slope| per season as a share of the series mean. */
  readonly slopeShare?: number;
  /** Default band: within this share of the fitted mean. */
  readonly bandShare?: number;
  /** Bands from target rows (D8 and others), by series name or prefix ending in '.'. */
  readonly bands?: Readonly<Record<string, Band>>;
  /** Per-series slope share overrides, by name or prefix ending in '.'. */
  readonly slopeShares?: Readonly<Record<string, number>>;
  /** Per-series band share overrides, by name or prefix ending in '.'. */
  readonly bandShares?: Readonly<Record<string, number>>;
  /** Series ignored by the drift verdict (still reported), by name or prefix ending in '.'. */
  readonly ignore?: readonly string[];
}

export interface SeriesResult {
  readonly series: string;
  readonly n: number;
  readonly mean: number;
  readonly slope: number;
  readonly slopeLimit: number;
  readonly band: Band;
  readonly outside: readonly number[];
  readonly pass: boolean;
  readonly ignored: boolean;
  readonly reason: string;
}

export interface RecordsResult {
  readonly records: number;
  readonly windowRates: readonly number[];
  readonly steadyRate: number;
  readonly pass: boolean;
  readonly reason: string;
}

export interface DriftReport {
  readonly series: readonly SeriesResult[];
  readonly records: RecordsResult;
  /** Series with too few seasons in the fit range to test. */
  readonly tooShort: readonly string[];
  readonly pass: boolean;
}

/** Least-squares slope and intercept of y on x. */
export function fitLine(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

function lookup<T>(table: Readonly<Record<string, T>> | undefined, name: string): T | undefined {
  if (!table) return undefined;
  if (table[name] !== undefined) return table[name];
  let best: string | undefined;
  for (const k of Object.keys(table)) if (k.endsWith('.') && name.startsWith(k) && (!best || k.length > best.length)) best = k;
  return best === undefined ? undefined : table[best];
}
const matches = (list: readonly string[] | undefined, name: string): boolean =>
  (list ?? []).some((k) => k === name || (k.endsWith('.') && name.startsWith(k)));

export function seriesNames(points: readonly SeasonPoint[]): string[] {
  const s = new Set<string>();
  for (const p of points) for (const k of Object.keys(p.values)) s.add(k);
  return [...s].sort();
}

export function testSeries(name: string, points: readonly SeasonPoint[], opts: DriftOptions = {}): SeriesResult | null {
  const fitFrom = opts.fitFrom ?? param('drift.fitFrom');
  const xs: number[] = [], ys: number[] = [];
  points.forEach((p, i) => {
    const y = p.values[name];
    if (i + 1 >= fitFrom && y !== undefined && Number.isFinite(y)) { xs.push(i + 1); ys.push(y); }
  });
  if (xs.length < 3) return null;
  const m = ys.reduce((a, b) => a + b, 0) / ys.length;
  const { slope } = fitLine(xs, ys);
  const real = lookup(REAL_TOLERANCES, name);
  const share = lookup(opts.slopeShares, name) ?? opts.slopeShare ?? real?.slopeShare ?? param('drift.slopeShare');
  const scale = Math.abs(m) > 1e-9 ? Math.abs(m) : 1;
  const slopeLimit = share * scale;
  const bandShare = lookup(opts.bandShares, name) ?? opts.bandShare ?? real?.bandShare ?? param('drift.bandShare');
  const band = lookup(opts.bands, name) ?? { min: m - bandShare * scale, max: m + bandShare * scale };
  const outside = xs.filter((_, i) => ys[i]! < band.min || ys[i]! > band.max);
  const slopeOk = Math.abs(slope) <= slopeLimit;
  const ignored = matches(opts.ignore, name);
  const pass = slopeOk && outside.length === 0;
  const reason = pass ? 'flat and inside its band'
    : [!slopeOk ? `slope ${slope.toPrecision(3)} per season beyond ${slopeLimit.toPrecision(3)}` : '', outside.length ? `seasons ${outside.join(', ')} outside [${band.min.toPrecision(4)}, ${band.max.toPrecision(4)}]` : '']
      .filter(Boolean).join('; ');
  return { series: name, n: xs.length, mean: m, slope, slopeLimit, band, outside, pass, ignored, reason };
}

/** Record falls per tracked record per season, in windows from `recordsFrom`; must never rise and must end low. */
export function testRecords(falls: readonly RecordFall[], recordCount: number, firstSeason: number, seasons: number, opts: { from?: number; window?: number; steadyRate?: number } = {}): RecordsResult {
  const from = opts.from ?? param('drift.recordsFrom');
  const window = opts.window ?? param('drift.recordWindow');
  const rates: number[] = [];
  // With few tracked records one fall is already a large rate, so the steady rate is never below one fall per window.
  const steady = Math.max(opts.steadyRate ?? param('drift.recordSteadyRate'), recordCount > 0 ? 1 / (recordCount * window) : 0);
  if (recordCount === 0) return { records: 0, windowRates: [], steadyRate: steady, pass: true, reason: 'no records tracked' };
  for (let start = from + 1; start + window - 1 <= seasons; start += window) {
    const lo = firstSeason + start - 1, hi = lo + window - 1;
    const n = falls.filter((f) => f.season >= lo && f.season <= hi).length;
    rates.push(n / (recordCount * window));
  }
  if (rates.length === 0) return { records: recordCount, windowRates: [], steadyRate: steady, pass: true, reason: `fewer than ${window} seasons after season ${from}: not tested` };
  // A rise only counts above the steady rate: below it, window-to-window wobble is the steady state itself.
  const rose = rates.findIndex((r, i) => i > 0 && r > rates[i - 1]! && r > steady);
  const last = rates[rates.length - 1]!;
  const pass = rose < 0 && last <= steady;
  const reason = pass ? 'record falls decline to a low steady rate'
    : [rose >= 0 ? `rate rose in window ${rose + 1} (${rates[rose - 1]!.toFixed(3)} to ${rates[rose]!.toFixed(3)})` : '', last > steady ? `last window rate ${last.toFixed(3)} above ${steady}` : ''].filter(Boolean).join('; ');
  return { records: recordCount, windowRates: rates, steadyRate: steady, pass, reason };
}

export function driftReport(points: readonly SeasonPoint[], falls: readonly RecordFall[], recordCount: number, opts: DriftOptions = {}): DriftReport {
  const series: SeriesResult[] = [], tooShort: string[] = [];
  for (const name of seriesNames(points)) {
    const r = testSeries(name, points, opts);
    if (r) series.push(r); else tooShort.push(name);
  }
  const first = points[0]?.season ?? 0;
  const records = testRecords(falls, recordCount, first, points.length);
  const pass = records.pass && series.every((s) => s.pass || s.ignored);
  return { series, records, tooShort, pass };
}
