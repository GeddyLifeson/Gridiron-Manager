// Real baseline cells and the cell comparison (WP-26; J15.1.2, Q2.1.1, Q6.3.1).
// The baseline is the cell suite measured on real play-by-play. Its status is computed from how many
// independent collections it was built from, never typed. Every threshold comes from the tolerance
// file (J15.1.2 acceptance: no hand-entered thresholds in code).
import type { FactStatus } from '@gm/schema';
import { SHAPE_POINTS, orderedGroups, type CellValue, type CellKind, type CellClass } from './cells.ts';

export interface BaselineSource { readonly citation: string; readonly locator: string; readonly retrieved: string }

/** One league total of one season, from the play-by-play through the adapter and from other collections. */
export interface AdapterCheck {
  readonly season: number;
  readonly quantity: string;
  readonly fromPlayByPlay: number;
  readonly others: readonly { readonly source: string; readonly value: number }[];
  readonly difference: number;
}

export interface RealBaseline {
  readonly ruleSetId: string;
  readonly seasons: string;
  readonly seasonType: string;
  /** Independent collections the cells were measured on. */
  readonly sources: readonly BaselineSource[];
  readonly games: number;
  readonly rows: number;
  readonly adapterChecks: readonly AdapterCheck[];
  readonly cells: readonly CellValue[];
}

export interface Tolerances {
  readonly source: string;
  readonly status: string;
  readonly core: { readonly rel: number };
  readonly rare: { readonly rel: number };
  readonly shape: { readonly absYd: number; readonly absThroughPct: number; readonly rel: number; readonly relFromPct: number };
  readonly standardErrors: number;
  readonly minRealEvents: number;
}

/** Status of every cell of a baseline: one collection is "1 of 3", two "2 of 3", three or more Verified (Q6.1.2). */
export function baselineStatus(b: Pick<RealBaseline, 'sources'>): FactStatus {
  const n = new Set(b.sources.map((s) => s.citation)).size;
  return n >= 3 ? 'Verified' : n === 2 ? '2 of 3' : n === 1 ? '1 of 3' : 'Unverified';
}

export type CellState = 'measured' | 'thin' | 'no_events' | 'missing_source';

export interface CellResult {
  readonly id: string;
  readonly dim: string;
  readonly key: string;
  readonly metric: string;
  readonly kind: CellKind;
  readonly cls: CellClass;
  readonly real: CellValue['value'];
  readonly realN: number;
  readonly simulated: CellValue['value'];
  readonly simN: number;
  /** For a quantile cell: the point furthest outside its tolerance. */
  readonly signedError: number | null;
  readonly toleranceUsed: number | null;
  readonly pass: boolean | null;
  readonly state: CellState;
}

function standardError(c: CellValue): number {
  if (c.n <= 0 || typeof c.value !== 'number') return 0;
  if (c.kind === 'rate') return c.value > 0 && c.value < 1 ? Math.sqrt((c.value * (1 - c.value)) / c.n) : 0;
  if (c.kind === 'mean') return c.sd === null ? 0 : c.sd / Math.sqrt(c.n);
  return 0;
}

/** Allowed absolute error of a scalar cell: the class tolerance or the stated number of real standard errors, whichever is larger. */
export function scalarTolerance(real: CellValue, tol: Tolerances): number {
  const rel = real.cls === 'rare' ? tol.rare.rel : tol.core.rel;
  return Math.max(rel * Math.abs(real.value as number), tol.standardErrors * standardError(real));
}

/** Allowed absolute error at one quantile point; null where J15.1.2 states none (between the two ranges). */
export function shapeTolerance(pct: number, realValue: number, tol: Tolerances): number | null {
  if (pct <= tol.shape.absThroughPct) return tol.shape.absYd;
  if (pct >= tol.shape.relFromPct) return tol.shape.rel * Math.abs(realValue);
  return null;
}

/** Compares one simulated cell with its real cell. A null `real` is a cell with no source at this level. */
export function compareCell(real: CellValue | null, sim: CellValue, tol: Tolerances): CellResult {
  const base = { id: sim.id, dim: sim.dim, key: sim.key, metric: sim.metric, kind: sim.kind, cls: sim.cls, simulated: sim.value, simN: sim.n };
  const none = (state: CellState): CellResult => ({ ...base, real: real?.value ?? null, realN: real?.n ?? 0, signedError: null, toleranceUsed: null, pass: null, state });
  if (real === null) return none('missing_source');
  if (real.value === null || real.n < tol.minRealEvents) return none('thin');
  if (sim.value === null || sim.n === 0) return none('no_events');
  if (sim.kind === 'quantiles') {
    const r = real.value as readonly number[], s = sim.value as readonly number[];
    let worst: { ratio: number; err: number; allowed: number } | null = null, pass = true;
    SHAPE_POINTS.forEach((pct, i) => {
      const allowed = shapeTolerance(pct, r[i]!, tol);
      if (allowed === null) return;
      const err = s[i]! - r[i]!;
      if (Math.abs(err) > allowed) pass = false;
      const ratio = allowed > 0 ? Math.abs(err) / allowed : Math.abs(err) > 0 ? Number.POSITIVE_INFINITY : 0;
      if (worst === null || ratio > worst.ratio) worst = { ratio, err, allowed };
    });
    const w = worst as { ratio: number; err: number; allowed: number } | null;
    return { ...base, real: real.value, realN: real.n, signedError: w?.err ?? null, toleranceUsed: w?.allowed ?? null, pass, state: 'measured' };
  }
  const allowed = scalarTolerance(real, tol);
  const err = (sim.value as number) - (real.value as number);
  return { ...base, real: real.value, realN: real.n, signedError: err, toleranceUsed: allowed, pass: Math.abs(err) <= allowed, state: 'measured' };
}

export interface ShapeResult {
  readonly group: string;
  readonly metric: string;
  readonly direction: 'rising' | 'falling';
  readonly real: readonly number[];
  readonly simulated: readonly number[];
  readonly held: boolean;
}

function direction(v: readonly number[]): 'rising' | 'falling' | null {
  let up = true, down = true;
  for (let i = 1; i < v.length; i++) { if (!(v[i]! > v[i - 1]!)) up = false; if (!(v[i]! < v[i - 1]!)) down = false; }
  return up ? 'rising' : down ? 'falling' : null;
}

/**
 * Monotone-shape check (J15.1.2): where the real cells of an ordered group rise or fall strictly across
 * the whole group, the simulated cells must move the same way. Groups with a thin or empty cell are skipped.
 */
export function shapeChecks(results: readonly CellResult[]): ShapeResult[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  const metrics = [...new Set(results.filter((r) => r.kind !== 'quantiles').map((r) => r.metric))];
  const out: ShapeResult[] = [];
  for (const [group, keys] of orderedGroups()) {
    for (const metric of metrics) {
      const cells = keys.map((k) => byId.get(`${k}.${metric}`));
      if (cells.some((c) => !c || c.state !== 'measured')) continue;
      const real = cells.map((c) => c!.real as number), sim = cells.map((c) => c!.simulated as number);
      const dir = direction(real);
      if (dir === null) continue;
      out.push({ group, metric, direction: dir, real, simulated: sim, held: direction(sim) === dir });
    }
  }
  return out;
}
