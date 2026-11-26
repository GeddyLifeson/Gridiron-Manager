// Tolerance rules (J15.1.2, Q2.3.1). Every threshold comes from the target row; nothing is hand-entered
// here (J15.1.2 acceptance). The rules, as the target files encode them:
//   rel      |sim - real| <= max(value * |real|, 2 real-data standard errors, low). For quantile rows `low`
//            is the absolute floor per point ("3% or 0.5 yd, whichever is larger"); for rates the
//            standard error is sqrt(p(1-p)/n) from the row's real sample n.
//   abs      |sim - real| <= value.
//   band     low <= sim <= high. For ordering rows: the share of seed groups in which the order holds
//            must be at least low (Q2.3.1: 95%).
//   poisson  rare events by count: the simulated count k over m events against the expected count
//            real * m, inside 2 sqrt(expected) or `value` relative of real, whichever is wider.
import type { CalibrationTarget } from '@gm/schema';

export interface Comparison {
  readonly signedError: number | null;
  readonly toleranceUsed: number | null;
  readonly pass: boolean;
}

/** Real-data standard error of a rate target, or 0 when the row cannot give one. */
export function realStandardError(t: CalibrationTarget): number {
  if (t.kind !== 'rate' || t.n === null || typeof t.value !== 'number') return 0;
  const p = t.value;
  if (p <= 0 || p >= 1) return 0;
  return Math.sqrt((p * (1 - p)) / t.n);
}

/** Compares a scalar simulated value; `events` is the simulated denominator, used by poisson rows. */
export function compareScalar(t: CalibrationTarget, sim: number, events: number): Comparison {
  if (typeof t.value !== 'number') throw new Error(`${t.id}: scalar comparison on a non-number target`);
  const real = t.value;
  const err = sim - real;
  const tol = t.tolerance;
  switch (tol.type) {
    case 'rel': {
      const allowed = Math.max(tol.value * Math.abs(real), 2 * realStandardError(t), tol.low ?? 0);
      return { signedError: err, toleranceUsed: allowed, pass: Math.abs(err) <= allowed };
    }
    case 'abs':
      return { signedError: err, toleranceUsed: tol.value, pass: Math.abs(err) <= tol.value };
    case 'band': {
      const lo = tol.low ?? Number.NEGATIVE_INFINITY, hi = tol.high ?? Number.POSITIVE_INFINITY;
      // Reported tolerance: distance from the real value to the nearer band edge it would need.
      const allowed = err >= 0 ? hi - real : real - lo;
      return { signedError: err, toleranceUsed: Number.isFinite(allowed) ? allowed : null, pass: sim >= lo && sim <= hi };
    }
    case 'poisson': {
      const expected = real * events;
      const byCount = events > 0 ? (2 * Math.sqrt(Math.max(expected, 0))) / events : Number.POSITIVE_INFINITY;
      const allowed = Math.max(tol.value * Math.abs(real), byCount);
      return { signedError: err, toleranceUsed: Number.isFinite(allowed) ? allowed : null, pass: events > 0 && Math.abs(err) <= allowed };
    }
  }
}

/** Quantile rows: every point must be inside its own tolerance. Reports the worst point. */
export function compareQuantiles(t: CalibrationTarget, sim: readonly number[]): Comparison {
  if (!Array.isArray(t.value) || t.value.some((v) => typeof v !== 'number')) throw new Error(`${t.id}: quantile target value must be numbers`);
  const real = t.value as number[];
  if (real.length !== sim.length) throw new Error(`${t.id}: ${real.length} real quantiles against ${sim.length} simulated`);
  let worst = { ratio: -1, err: 0, allowed: 0 };
  let pass = true;
  for (let i = 0; i < real.length; i++) {
    const r = real[i]!, s = sim[i]!;
    const allowed = t.tolerance.type === 'rel' ? Math.max(t.tolerance.value * Math.abs(r), t.tolerance.low ?? 0)
      : t.tolerance.type === 'abs' ? t.tolerance.value : Number.NaN;
    if (Number.isNaN(allowed)) throw new Error(`${t.id}: quantile rows take a rel or abs tolerance`);
    const err = s - r;
    if (Math.abs(err) > allowed) pass = false;
    const ratio = allowed > 0 ? Math.abs(err) / allowed : Math.abs(err) > 0 ? Number.POSITIVE_INFINITY : 0;
    if (ratio > worst.ratio) worst = { ratio, err, allowed };
  }
  return { signedError: worst.err, toleranceUsed: worst.allowed, pass };
}

/** Ordering rows: `held` of `groups` seed groups kept the order. */
export function compareOrdering(t: CalibrationTarget, held: number, groups: number): Comparison {
  const need = t.tolerance.low ?? t.tolerance.value;
  if (groups === 0) return { signedError: null, toleranceUsed: need, pass: false };
  const share = held / groups;
  return { signedError: share - need, toleranceUsed: need, pass: share >= need };
}
