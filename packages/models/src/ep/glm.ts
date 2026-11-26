// Multinomial logistic regression with soft labels, fitted by damped Newton steps (N2.2.1 rule 2,
// N2.2.2 rule 1). One routine serves both models: the expected-points model has seven next-score
// classes, the win-probability model has two (loss, win) and a tie is the label (0.5, 0.5).
//
// Determinism (J13.3.1): rows are visited in the order given, sums run in a fixed order, and the only
// transcendental functions come from the injected `DeterministicMath`.
import type { DeterministicMath } from '@gm/schema';
import { choleskySolve } from './linalg.ts';

export interface GlmData {
  /** Row-major design matrix, `rows` by `cols`, already standardised; column 0 is the intercept (1). */
  readonly x: Float64Array;
  /** Row-major soft labels, `rows` by `classes`; each row sums to 1. */
  readonly y: Float64Array;
  readonly rows: number;
  readonly cols: number;
  readonly classes: number;
}

export interface GlmOptions {
  /** Index of the reference class whose coefficients are fixed at zero. */
  readonly referenceClass: number;
  /** Ridge penalty on every coefficient but the intercepts (the intercept is column 0). */
  readonly ridge: number;
  readonly maxIterations: number;
  /** Stop when the largest coefficient change in a step is below this. */
  readonly tolerance: number;
  /**
   * Columns whose coefficient must stay at or above zero for every non-reference class: the monotone
   * limit on score difference of N2.2.2 rule 1. Enforced by an active set.
   */
  readonly nonNegative?: readonly number[];
}

export interface GlmFit {
  /** Row-major `classes` by `cols`; the reference class row is all zero. */
  readonly beta: Float64Array;
  readonly iterations: number;
  readonly logLikelihood: number;
  readonly converged: boolean;
}

/** Class probabilities for one standardised feature row (softmax with the largest score subtracted). */
export function softmaxRow(beta: ArrayLike<number>, row: ArrayLike<number>, cols: number, classes: number, math: DeterministicMath, out: Float64Array): Float64Array {
  let max = -Infinity;
  for (let k = 0; k < classes; k++) {
    let s = 0;
    for (let j = 0; j < cols; j++) s += beta[k * cols + j]! * row[j]!;
    out[k] = s;
    if (s > max) max = s;
  }
  let z = 0;
  for (let k = 0; k < classes; k++) { const e = math.exp(out[k]! - max); out[k] = e; z += e; }
  for (let k = 0; k < classes; k++) out[k] = out[k]! / z;
  return out;
}

function logLik(d: GlmData, beta: Float64Array, ridge: number, math: DeterministicMath): number {
  const p = new Float64Array(d.classes);
  const row = new Float64Array(d.cols);
  let ll = 0;
  for (let i = 0; i < d.rows; i++) {
    for (let j = 0; j < d.cols; j++) row[j] = d.x[i * d.cols + j]!;
    softmaxRow(beta, row, d.cols, d.classes, math, p);
    for (let k = 0; k < d.classes; k++) {
      const yk = d.y[i * d.classes + k]!;
      if (yk > 0) ll += yk * math.log(p[k]! > 1e-300 ? p[k]! : 1e-300);
    }
  }
  let pen = 0;
  for (let k = 0; k < d.classes; k++) for (let j = 1; j < d.cols; j++) { const b = beta[k * d.cols + j]!; pen += b * b; }
  return ll - 0.5 * ridge * pen;
}

/** Fit by Newton's method with step halving. Pure and deterministic. */
export function fitGlm(d: GlmData, opt: GlmOptions, math: DeterministicMath): GlmFit {
  const { cols, classes } = d;
  const free: number[] = [];
  for (let k = 0; k < classes; k++) if (k !== opt.referenceClass) free.push(k);
  const nonNeg = new Set(opt.nonNegative ?? []);
  const beta = new Float64Array(classes * cols);
  let ll = logLik(d, beta, opt.ridge, math);
  let iterations = 0;
  let converged = false;
  const p = new Float64Array(classes);
  const row = new Float64Array(cols);
  for (; iterations < opt.maxIterations; iterations++) {
    // Gradient and negative Hessian over the free classes.
    const m = free.length * cols;
    const g = new Float64Array(m);
    const h = new Float64Array(m * m);
    for (let i = 0; i < d.rows; i++) {
      for (let j = 0; j < cols; j++) row[j] = d.x[i * cols + j]!;
      softmaxRow(beta, row, cols, classes, math, p);
      for (let a = 0; a < free.length; a++) {
        const k = free[a]!;
        const r = d.y[i * classes + k]! - p[k]!;
        for (let j = 0; j < cols; j++) g[a * cols + j] = g[a * cols + j]! + r * row[j]!;
        for (let b = a; b < free.length; b++) {
          const l = free[b]!;
          const w = p[k]! * ((k === l ? 1 : 0) - p[l]!);
          if (w === 0) continue;
          for (let j = 0; j < cols; j++) {
            const wj = w * row[j]!;
            const base = (a * cols + j) * m + b * cols;
            for (let q = 0; q < cols; q++) h[base + q] = h[base + q]! + wj * row[q]!;
          }
        }
      }
    }
    for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) {
      for (let j = 0; j < cols; j++) for (let q = 0; q < cols; q++) h[(b * cols + q) * m + a * cols + j] = h[(a * cols + j) * m + b * cols + q]!;
    }
    for (let a = 0; a < free.length; a++) {
      const k = free[a]!;
      for (let j = 1; j < cols; j++) {
        const idx = a * cols + j;
        g[idx] = g[idx]! - opt.ridge * beta[k * cols + j]!;
        h[idx * m + idx] = h[idx * m + idx]! + opt.ridge;
      }
      h[(a * cols) * m + a * cols] = h[(a * cols) * m + a * cols]! + 1e-9;
    }
    // Active set: a non-negative coefficient sitting at zero with its gradient pointing below zero stays fixed.
    const active: number[] = [];
    for (let a = 0; a < free.length; a++) for (let j = 0; j < cols; j++) {
      const idx = a * cols + j;
      if (nonNeg.has(j) && beta[free[a]! * cols + j]! <= 0 && g[idx]! <= 0) continue;
      active.push(idx);
    }
    const n = active.length;
    const hs = new Float64Array(n * n);
    const gs = new Float64Array(n);
    for (let u = 0; u < n; u++) {
      gs[u] = g[active[u]!]!;
      for (let v = 0; v < n; v++) hs[u * n + v] = h[active[u]! * m + active[v]!]!;
    }
    const step = choleskySolve(hs, gs, n, math);
    if (!step) break;
    let scale = 1;
    let accepted = false;
    let maxChange = 0;
    for (let tries = 0; tries < 30; tries++) {
      const trial = new Float64Array(beta);
      maxChange = 0;
      for (let u = 0; u < n; u++) {
        const idx = active[u]!;
        const a = Math.floor(idx / cols), j = idx % cols;
        const at = free[a]! * cols + j;
        let v = beta[at]! + scale * step[u]!;
        if (nonNeg.has(j) && v < 0) v = 0;
        const c = Math.abs(v - beta[at]!);
        if (c > maxChange) maxChange = c;
        trial[at] = v;
      }
      const tl = logLik(d, trial, opt.ridge, math);
      if (tl >= ll - 1e-12) { beta.set(trial); ll = tl; accepted = true; break; }
      scale *= 0.5;
    }
    if (!accepted) { converged = true; iterations++; break; }
    if (maxChange < opt.tolerance) { converged = true; iterations++; break; }
  }
  return { beta, iterations, logLikelihood: ll, converged };
}
