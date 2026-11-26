// Small dense linear algebra for the model fits (N2.2.1, N2.2.2). Fixed loop order, no platform
// transcendental math (P1.1.1): the same input gives the same bits on every platform (J13.3.1).
import type { DeterministicMath } from '@gm/schema';

/**
 * Solve A x = b for a symmetric positive-definite A (row-major, n by n) by Cholesky factorisation.
 * Returns null when A is not positive definite at working precision.
 */
export function choleskySolve(a: Float64Array, b: Float64Array, n: number, math: DeterministicMath): Float64Array | null {
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
