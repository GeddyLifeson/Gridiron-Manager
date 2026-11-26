// Automated calibration, part 1c: from blocks of games to a value and a standard error per target row.
// The standard error is the delete-one-block jackknife: drop each block in turn, recompute the row, and
// read the spread. It needs no assumption about how plays inside a game depend on each other, because a
// block is whole games. Two runs on the same seeds are compared block by block (paired), which removes
// the part of the noise both runs share.
// The gate itself stays `headless calibrate` (J15.10.1). Rows are pooled here from block values: exact for
// means and rates, close for sd rows (pooled within-block variance), and the mean of the block errors for
// quantile and ordering rows.
import type { CalibrationTarget } from '@gm/schema';
import { compareScalar } from '../calibration/index.ts';
import type { BlockRow, RowMeta } from './job.ts';

export interface Estimate {
  readonly value: number | null;
  readonly se: number | null;
  readonly events: number;
  /** Blocks that could measure the row. */
  readonly blocks: number;
}

const weightOf = (kind: string, n: number): number => (kind === 'sd' ? Math.max(0, n - 1) : n);

/** The row's value over a set of blocks; `skip` leaves one block out. */
export function pooled(kind: string, rows: readonly BlockRow[], skip = -1): number | null {
  let sw = 0, s = 0;
  for (let b = 0; b < rows.length; b++) {
    if (b === skip) continue;
    const [v, n] = rows[b]!;
    if (v === null) continue;
    const w = weightOf(kind, n);
    sw += w;
    s += w * (kind === 'sd' ? v * v : v);
  }
  if (sw <= 0) return null;
  return kind === 'sd' ? Math.sqrt(s / sw) : s / sw;
}

function jackSe(full: number, leaveOut: readonly number[]): number | null {
  const B = leaveOut.length;
  if (B < 2) return null;
  const m = leaveOut.reduce((a, b) => a + b, 0) / B;
  let ss = 0;
  for (const v of leaveOut) ss += (v - m) * (v - m);
  const se = Math.sqrt(((B - 1) / B) * ss);
  return Number.isFinite(se) && Number.isFinite(full) ? se : null;
}

export function estimate(kind: string, rows: readonly BlockRow[]): Estimate {
  const value = pooled(kind, rows);
  const valid = rows.map((r, b) => (r[0] !== null && weightOf(kind, r[1]) > 0 ? b : -1)).filter((b) => b >= 0);
  const events = rows.reduce((a, r) => a + (r[0] === null ? 0 : r[1]), 0);
  if (value === null) return { value: null, se: null, events, blocks: 0 };
  const lo: number[] = [];
  for (const b of valid) { const v = pooled(kind, rows, b); if (v !== null) lo.push(v); }
  return { value, se: lo.length === valid.length ? jackSe(value, lo) : null, events, blocks: valid.length };
}

export interface Difference { readonly d: number | null; readonly se: number | null }

/** (after - before) for one row on the same seeds, block by block. */
export function paired(kind: string, before: readonly BlockRow[], after: readonly BlockRow[]): Difference {
  const B = Math.min(before.length, after.length);
  const a = before.slice(0, B), z = after.slice(0, B);
  const va = pooled(kind, a), vz = pooled(kind, z);
  if (va === null || vz === null) return { d: null, se: null };
  const lo: number[] = [];
  for (let b = 0; b < B; b++) {
    if (a[b]![0] === null && z[b]![0] === null) continue;
    const x = pooled(kind, a, b), y = pooled(kind, z, b);
    if (x === null || y === null) return { d: vz - va, se: null };
    lo.push(y - x);
  }
  return { d: vz - va, se: jackSe(vz - va, lo) };
}

export interface Score {
  /** Simulated less real (scalar rows), or the row's own signed error. */
  readonly err: number | null;
  /** What `err` is divided by: the gate's tolerance where it has one. */
  readonly scale: number | null;
  /** err / scale, held to plus or minus 50: inside plus or minus 1 is a pass. */
  readonly z: number | null;
  readonly pass: boolean | null;
}

const Z_CAP = 50;
/** Ordering rows have no tolerance in row units: a quarter of the blocks out of order counts as one tolerance. */
const ORDERING_SCALE = 0.25;
const clampZ = (z: number): number => Math.max(-Z_CAP, Math.min(Z_CAP, z));

function quantileScale(t: CalibrationTarget): number | null {
  if (!Array.isArray(t.value)) return null;
  const allowed = (t.value as unknown[]).filter((v): v is number => typeof v === 'number')
    .map((r) => (t.tolerance.type === 'rel' ? Math.max(t.tolerance.value * Math.abs(r), t.tolerance.low ?? 0) : t.tolerance.value))
    .sort((x, y) => x - y);
  return allowed.length ? allowed[allowed.length >> 1]! : null;
}

/** How far a row is from its target in units of the gate's tolerance. Uses the gate's own comparison for scalar rows. */
export function score(meta: RowMeta, value: number | null, events: number): Score {
  const t = meta.target;
  if (value === null) return { err: null, scale: null, z: null, pass: null };
  if (typeof t.value === 'number') {
    const c = compareScalar(t, value, events);
    const err = c.signedError ?? value - t.value;
    const scale = c.toleranceUsed !== null && c.toleranceUsed > 0 ? c.toleranceUsed : Math.max(Math.abs(t.value) * 0.05, 1e-9);
    return { err, scale, z: clampZ(err / scale), pass: c.pass };
  }
  if (t.kind === 'ordering') return { err: value, scale: ORDERING_SCALE, z: clampZ(Math.min(0, value) / ORDERING_SCALE), pass: value >= 0 };
  const scale = quantileScale(t);
  if (scale === null || !(scale > 0)) return { err: value, scale: null, z: null, pass: null };
  return { err: value, scale, z: clampZ(value / scale), pass: Math.abs(value) <= scale };
}

/** Certify rows decide the gate; watch rows have no sourced target to steer by. */
export const tierWeight = (tier: string): number => (tier === 'certify' ? 3 : tier === 'tune' ? 1 : 0.25);

/** Beyond this many tolerances a row counts linearly, so one broken row cannot own the search. */
export const HUBER = 4;
export const huber = (z: number): number => (Math.abs(z) <= HUBER ? 0.5 * z * z : HUBER * Math.abs(z) - 0.5 * HUBER * HUBER);

/** One number for a whole run: the weighted distance of every measured row from its target. */
export function lossOf(metas: readonly RowMeta[], scores: readonly Score[]): number {
  let L = 0;
  scores.forEach((s, i) => { if (s.z !== null) L += tierWeight(metas[i]!.target.tier) * huber(s.z); });
  return L;
}

export interface RunSummary {
  readonly estimates: Estimate[];
  readonly scores: Score[];
  readonly loss: number;
  readonly measured: number;
  readonly passed: number;
}

/** blocks[b][row] -> the run's rows, scores and loss. */
export function summarize(metas: readonly RowMeta[], blocks: readonly (readonly BlockRow[])[]): RunSummary {
  const estimates = metas.map((m, i) => estimate(m.target.kind, blocks.map((b) => b[i] ?? [null, 0])));
  const scores = estimates.map((e, i) => score(metas[i]!, e.value, e.events));
  return { estimates, scores, loss: lossOf(metas, scores), measured: scores.filter((s) => s.pass !== null).length, passed: scores.filter((s) => s.pass === true).length };
}

/** How much the loss fell from one run to another on the same seeds, with a jackknife standard error. */
export function pairedLoss(metas: readonly RowMeta[], before: readonly (readonly BlockRow[])[], after: readonly (readonly BlockRow[])[]): { drop: number; se: number | null } {
  const B = Math.min(before.length, after.length);
  const a = before.slice(0, B), z = after.slice(0, B);
  const drop = summarize(metas, a).loss - summarize(metas, z).loss;
  const lo: number[] = [];
  for (let b = 0; b < B && B > 1; b++) lo.push(summarize(metas, a.filter((_, k) => k !== b)).loss - summarize(metas, z.filter((_, k) => k !== b)).loss);
  return { drop, se: jackSe(drop, lo) };
}
