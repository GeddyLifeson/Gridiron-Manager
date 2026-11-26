// Small dense linear algebra for the generator (D13.2.1 step 3, D13.2.2 acceptance: every correlation
// matrix is positive semi-definite). Pure and deterministic: only +, -, *, / and Math.sqrt (correctly
// rounded on every platform, allowed by P1.1.1), with fixed iteration order.

export type Matrix = number[][];

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

/**
 * Lower-triangular Cholesky factor L with L Lᵀ = A. Throws when A is not positive definite, naming the
 * pivot, so a bad profile fails the build instead of producing NaN people.
 */
export function cholesky(a: Matrix): Matrix {
  const n = a.length;
  const l: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k++) s -= l[i]![k]! * l[j]![k]!;
      if (i === j) {
        if (!(s > 0)) throw new Error(`cholesky: matrix not positive definite at pivot ${i} (${s})`);
        l[i]![i] = Math.sqrt(s);
      } else {
        l[i]![j] = s / l[j]![j]!;
      }
    }
  }
  return l;
}

/** y = L z for a lower-triangular L. */
export function lowerTimes(l: Matrix, z: readonly number[]): number[] {
  const out = new Array<number>(l.length).fill(0);
  for (let i = 0; i < l.length; i++) {
    let s = 0;
    for (let k = 0; k <= i; k++) s += l[i]![k]! * z[k]!;
    out[i] = s;
  }
  return out;
}

/** Symmetric eigen decomposition by cyclic Jacobi rotations. Returns eigenvalues and column eigenvectors. */
export function jacobiEigen(a: Matrix, sweeps = 100): { values: number[]; vectors: Matrix } {
  const n = a.length;
  const m: Matrix = a.map((r) => r.slice());
  const v = identity(n);
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += m[p]![q]! * m[p]![q]!;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = m[p]![q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (m[q]![q]! - m[p]![p]!) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = m[k]![p]!, mkq = m[k]![q]!;
          m[k]![p] = c * mkp - s * mkq;
          m[k]![q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = m[p]![k]!, mqk = m[q]![k]!;
          m[p]![k] = c * mpk - s * mqk;
          m[q]![k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!, vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: m.map((r, i) => r[i]!), vectors: v };
}

/**
 * Nearest valid correlation matrix by eigenvalue clipping (floor `minEig`) and rescaling to a unit
 * diagonal. Pairwise-complete correlations from data with missing tests need not be PSD; this repairs
 * them at profile build time (D13.2.2 acceptance).
 */
export function repairCorrelation(r: Matrix, minEig = 1e-3): Matrix {
  const n = r.length;
  const { values, vectors } = jacobiEigen(r);
  const clipped = values.map((x) => (x < minEig ? minEig : x));
  const out: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += vectors[i]![k]! * clipped[k]! * vectors[j]![k]!;
    out[i]![j] = s;
  }
  const d = out.map((row, i) => Math.sqrt(row[i]!));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i]![j] = i === j ? 1 : out[i]![j]! / (d[i]! * d[j]!);
  return out;
}

export function minEigenvalue(r: Matrix): number {
  return Math.min(...jacobiEigen(r).values);
}
