// Feature terms written as data, so a refit (N2.2.1 rule 3) can change the model shape without a
// code change and a saved model file says exactly what it computes.
//
// Grammar of one term (a string):
//   1                    intercept
//   v:<var>              the variable itself
//   h:<var>:<k>          max(0, var - k)          (hinge to the right of knot k)
//   hl:<var>:<k>         max(0, k - var)          (hinge to the left of knot k)
//   mn:<var>:<k>         min(var, k)
//   ln:<var>             log(1 + max(0, var))
//   eq:<var>:<k>         1 when var equals k, else 0
//   <term>*<term>        product of two terms
// Knots are modelling choices of the fit, not football facts (they place spline joints).
import type { DeterministicMath } from '@gm/schema';

export type VarGetter<S> = (state: S) => number;
export type VarTable<S> = Readonly<Record<string, VarGetter<S>>>;

export class FeatureSpecError extends Error {}

type Compiled<S> = (s: S, math: DeterministicMath) => number;

function compileTerm<S>(term: string, vars: VarTable<S>): Compiled<S> {
  const star = term.indexOf('*');
  if (star >= 0) {
    const a = compileTerm(term.slice(0, star), vars);
    const b = compileTerm(term.slice(star + 1), vars);
    return (s, m) => a(s, m) * b(s, m);
  }
  if (term === '1') return () => 1;
  const parts = term.split(':');
  const op = parts[0];
  const name = parts[1] ?? '';
  const get = vars[name];
  if (!get) throw new FeatureSpecError(`unknown variable "${name}" in feature "${term}"`);
  const k = parts[2] === undefined ? Number.NaN : Number(parts[2]);
  const needK = op === 'h' || op === 'hl' || op === 'mn' || op === 'eq';
  if (needK && !Number.isFinite(k)) throw new FeatureSpecError(`feature "${term}" needs a numeric knot`);
  switch (op) {
    case 'v': return (s) => get(s);
    case 'h': return (s) => { const v = get(s) - k; return v > 0 ? v : 0; };
    case 'hl': return (s) => { const v = k - get(s); return v > 0 ? v : 0; };
    case 'mn': return (s) => { const v = get(s); return v < k ? v : k; };
    case 'ln': return (s, m) => { const v = get(s); return m.log(1 + (v > 0 ? v : 0)); };
    case 'eq': return (s) => (get(s) === k ? 1 : 0);
    default: throw new FeatureSpecError(`unknown operator "${op}" in feature "${term}"`);
  }
}

export interface CompiledFeatures<S> {
  readonly terms: readonly string[];
  /** Raw (unstandardised) feature values. */
  raw(state: S, math: DeterministicMath, out?: Float64Array): Float64Array;
}

export function compileFeatures<S>(terms: readonly string[], vars: VarTable<S>): CompiledFeatures<S> {
  if (terms[0] !== '1') throw new FeatureSpecError('the first feature term must be the intercept "1"');
  const fns = terms.map((t) => compileTerm(t, vars));
  return {
    terms,
    raw(state, math, out = new Float64Array(fns.length)) {
      for (let j = 0; j < fns.length; j++) out[j] = fns[j]!(state, math);
      return out;
    },
  };
}

/** Column means and standard deviations (intercept kept at 0 and 1). */
export interface Standardiser { readonly mean: readonly number[]; readonly sd: readonly number[] }

export function standardise(row: Float64Array, st: Standardiser): Float64Array {
  for (let j = 1; j < row.length; j++) row[j] = (row[j]! - st.mean[j]!) / st.sd[j]!;
  return row;
}

export function fitStandardiser(x: Float64Array, rows: number, cols: number, math: DeterministicMath): Standardiser {
  const mean = new Array<number>(cols).fill(0);
  const sd = new Array<number>(cols).fill(1);
  for (let j = 1; j < cols; j++) {
    let s = 0;
    for (let i = 0; i < rows; i++) s += x[i * cols + j]!;
    const mu = s / rows;
    let v = 0;
    for (let i = 0; i < rows; i++) { const d = x[i * cols + j]! - mu; v += d * d; }
    const sdv = math.sqrt(v / rows);
    mean[j] = mu;
    sd[j] = sdv > 1e-12 ? sdv : 1;
  }
  return { mean, sd };
}
