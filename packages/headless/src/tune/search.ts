// Automated calibration, part 3: propose parameter sets that close the gate.
// A game costs seconds, so the search cannot afford the thousands of trial runs an evolution strategy
// needs. It uses the measured slopes instead: with them, the best step inside each parameter's range is
// a small bounded least-squares problem (rows far outside tolerance count linearly, so one broken row
// cannot drag every lever to its stop). Each proposal is then PLAYED on the baseline's seeds. The games
// decide: a proposal is kept only when the measured loss falls, the step is halved when it does not, and
// the slopes are corrected from what the games showed (a secant update, only where the miss is larger
// than the noise) before the next step.
// Nothing here writes a row's result: it only picks parameter values, and the rows still come out of games.
import type { BlockRow, RowMeta } from './job.ts';
import { HUBER, huber, paired, summarize, tierWeight, type RunSummary } from './stats.ts';

export interface StepProblem {
  /** Where each row stands, in tolerances (null: not measured). */
  readonly z: readonly (number | null)[];
  readonly weight: readonly number[];
  /** a[row][param]: tolerances the row moves per full range of the parameter. */
  readonly a: readonly ArrayLike<number>[];
  /** Position of each parameter in its range, 0 to 1. */
  readonly u: readonly number[];
  /** Largest move of one parameter in this step, as a share of its range. */
  readonly trust: number;
  /** Pull toward not moving, so a lever with a weak or noisy slope is not used for nothing. */
  readonly ridge: number;
}

export interface Step { readonly delta: number[]; readonly predicted: number[]; readonly predictedLoss: number }

/** The bounded step: reweighted least squares, one coordinate at a time, each held inside its box. */
export function solveStep(p: StepProblem): Step {
  const m = p.u.length;
  const rows: number[] = [];
  p.z.forEach((z, i) => { if (z !== null && p.weight[i]! > 0) rows.push(i); });
  const delta = new Array<number>(m).fill(0);
  const r = rows.map((i) => p.z[i]!);
  const lo = p.u.map((u) => Math.max(-p.trust, -u)), hi = p.u.map((u) => Math.min(p.trust, 1 - u));
  for (let outer = 0; outer < 12; outer++) {
    const w = rows.map((i, k) => p.weight[i]! * (Math.abs(r[k]!) <= HUBER ? 1 : HUBER / Math.abs(r[k]!)));
    for (let sweep = 0; sweep < 40; sweep++) {
      let moved = 0;
      for (let j = 0; j < m; j++) {
        let g = 0, h = p.ridge;
        for (let k = 0; k < rows.length; k++) {
          const a = p.a[rows[k]!]![j]!;
          if (a === 0) continue;
          g += w[k]! * a * (r[k]! - a * delta[j]!);
          h += w[k]! * a * a;
        }
        const next = Math.min(hi[j]!, Math.max(lo[j]!, -g / h));
        const d = next - delta[j]!;
        if (d !== 0) {
          for (let k = 0; k < rows.length; k++) r[k]! += p.a[rows[k]!]![j]! * d;
          delta[j] = next;
          moved = Math.max(moved, Math.abs(d));
        }
      }
      if (moved < 1e-6) break;
    }
  }
  const predicted = p.z.map((z) => z ?? Number.NaN);
  let predictedLoss = 0;
  rows.forEach((i, k) => { predicted[i] = r[k]!; predictedLoss += p.weight[i]! * huber(r[k]!); });
  return { delta, predicted, predictedLoss };
}

export interface SearchOptions {
  readonly metas: readonly RowMeta[];
  /** slopes[row][param] in the row's own units per full range; the search edits its own copy. */
  readonly slopes: readonly (readonly number[])[];
  readonly startU: readonly number[];
  readonly startBlocks: readonly (readonly BlockRow[])[];
  /** Plays the baseline's seeds at a point and returns its blocks; null when the engine refused the values. */
  readonly evaluate: (u: readonly number[]) => Promise<(readonly BlockRow[])[] | null>;
  readonly iterations: number;
  readonly trust?: number;
  readonly ridge?: number;
  readonly log?: (line: string) => void;
}

export interface SearchStepLog {
  readonly iteration: number;
  readonly u: number[];
  readonly trust: number;
  readonly predictedLoss: number;
  readonly loss: number | null;
  readonly passed: number | null;
  readonly accepted: boolean;
}

export interface SearchResult {
  readonly startLoss: number;
  readonly startPassed: number;
  readonly bestU: number[];
  readonly bestBlocks: (readonly BlockRow[])[];
  readonly best: RunSummary;
  readonly steps: SearchStepLog[];
}

export async function search(o: SearchOptions): Promise<SearchResult> {
  const { metas } = o;
  const m = o.startU.length;
  const J = o.slopes.map((row) => Float64Array.from(row));
  const weight = metas.map((x) => tierWeight(x.target.tier));
  let u = [...o.startU];
  let blocks = o.startBlocks.map((b) => [...b]);
  let cur = summarize(metas, blocks);
  const startLoss = cur.loss, startPassed = cur.passed;
  let trust = o.trust ?? 0.25;
  const ridge = o.ridge ?? 0.5;
  const steps: SearchStepLog[] = [];
  for (let it = 1; it <= o.iterations && trust >= 0.02; it++) {
    const a = J.map((row, i) => { const s = cur.scores[i]!.scale; return s ? row.map((v) => v / s) : new Float64Array(m); });
    const step = solveStep({ z: cur.scores.map((s) => s.z), weight, a, u, trust, ridge });
    if (Math.max(...step.delta.map(Math.abs)) < 0.004) { o.log?.(`step ${it}: the slopes offer no further move`); break; }
    const cand = u.map((v, j) => Math.min(1, Math.max(0, v + step.delta[j]!)));
    const got = await o.evaluate(cand);
    if (got === null) {
      steps.push({ iteration: it, u: cand, trust, predictedLoss: step.predictedLoss, loss: null, passed: null, accepted: false });
      o.log?.(`step ${it}: the engine refused these values; halving the step`);
      trust /= 2;
      continue;
    }
    const next = summarize(metas, got);
    // Correct the slopes from what the games showed, only where the miss is larger than the noise.
    const dd = step.delta.reduce((s, d) => s + d * d, 0);
    metas.forEach((meta, i) => {
      const diff = paired(meta.target.kind, blocks.map((b) => b[i]!), got.map((b) => b[i]!));
      if (diff.d === null || diff.se === null) return;
      let pred = 0;
      for (let j = 0; j < m; j++) pred += J[i]![j]! * step.delta[j]!;
      const miss = diff.d - pred;
      if (Math.abs(miss) <= 2 * diff.se) return;
      for (let j = 0; j < m; j++) J[i]![j]! += (miss * step.delta[j]!) / dd;
    });
    const accepted = next.loss < cur.loss;
    steps.push({ iteration: it, u: cand, trust, predictedLoss: step.predictedLoss, loss: next.loss, passed: next.passed, accepted });
    o.log?.(`step ${it}: loss ${cur.loss.toFixed(1)} -> ${next.loss.toFixed(1)} (predicted ${step.predictedLoss.toFixed(1)}), rows passing ${cur.passed} -> ${next.passed}, ${accepted ? 'kept' : 'dropped'}`);
    if (accepted) { u = cand; blocks = got.map((b) => [...b]); cur = next; trust = Math.min(0.5, trust * 1.5); }
    else trust /= 2;
  }
  return { startLoss, startPassed, bestU: u, bestBlocks: blocks, best: cur, steps };
}
