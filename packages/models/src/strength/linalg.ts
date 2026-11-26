// Cholesky factor, solve and inverse for the ridge fit (N2.6.1). Fixed loop order and no platform
// transcendental math (P1.1.1), so the same input gives the same bits everywhere (J13.3.1).
import type { DeterministicMath } from '@gm/schema';

/** Lower Cholesky factor of a symmetric positive-definite matrix (row-major, n by n), or null. */
export function cholesky(a: Float64Array, n: number, math: DeterministicMath): Float64Array | null {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i * n + j]!;
      for (let k = 0; k < j; k++) s -= l[i * n + k]! * l[j * n + k]!;
      if (i === j) {
        if (!(s > 0)) return null;
        l[i * n + i] = math.sqrt(s);
      } else {
        l[i * n + j] = s / l[j * n + j]!;
      }
    }
  }
  return l;
}

/** Solves L L' x = b. */
export function cholSolve(l: Float64Array, b: Float64Array, n: number): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= l[i * n + k]! * y[k]!;
    y[i] = s / l[i * n + i]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= l[k * n + i]! * x[k]!;
    x[i] = s / l[i * n + i]!;
  }
  return x;
}

/** Inverse of L L' (row-major), column by column. */
export function cholInverse(l: Float64Array, n: number): Float64Array {
  const inv = new Float64Array(n * n);
  const e = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    e.fill(0);
    e[c] = 1;
    const x = cholSolve(l, e, n);
    for (let r = 0; r < n; r++) inv[r * n + c] = x[r]!;
  }
  return inv;
}
