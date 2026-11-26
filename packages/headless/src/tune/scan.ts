// Automated calibration, part 2: which parameters move which target rows.
// Three passes, cheapest first, because a game on the tick engine costs seconds and there are well over a
// thousand parameters:
//   1. Dead check. One game per parameter, with the parameter pushed to the far end of its range, on the
//      seed of an untouched game. The engine is deterministic, so an identical fingerprint means the
//      games never read the value in a way that changed anything: the parameter is set aside.
//   2. Screen. Every live parameter is nudged up or down at once, a different random pattern each run,
//      and each row is regressed on each parameter. Runs come in mirrored pairs (the second flips every
//      sign), so effects of two parameters acting together cancel out of the single-parameter estimates.
//      This finds the strong levers in a few hundred games instead of tens of thousands.
//   3. Confirm. The best candidates are moved one at a time, down and up, on the seeds of the baseline,
//      and compared block by block. This gives a slope per row with a standard error.
import type { BlockJob, BlockResult, BlockRow, RowMeta } from './job.ts';
import { seedHex } from './job.ts';
import { rng, unitOf, valueAt, type Tunable } from './registry.ts';
import { HUBER, paired, tierWeight, type Score } from './stats.ts';

// ---- 1. dead check ----

export type Liveness = 'live' | 'dead' | 'error';

/** Job 0 is the untouched game; job k + 1 moves parameter k to the far end of its range. */
export function deadCheckJobs(ruleSetId: string, params: readonly Tunable[], games: number, seed: number): BlockJob[] {
  const base: BlockJob = { ruleSetId, games, seedHex: seedHex(seed), overrides: {} };
  return [base, ...params.map((p) => ({ ...base, overrides: { [p.name]: valueAt(p, unitOf(p) < 0.5 ? 1 : 0) } }))];
}

export function liveness(results: readonly BlockResult[]): Liveness[] {
  const base = results[0]!;
  if (base.error) throw new Error(`the untouched game failed: ${base.error}`);
  return results.slice(1).map((r) => (r.error ? 'error' : r.fingerprint === base.fingerprint ? 'dead' : 'live'));
}

// ---- 2. screen ----

/** Each parameter's move in run `run`, as a share of its range (after clamping to the range). */
export function screenMoves(params: readonly Tunable[], run: number, step: number, seed: number): Float64Array {
  const next = rng((seed ^ Math.imul((run >> 1) + 1, 0x9e3779b1)) >>> 0);
  const flip = run & 1 ? -1 : 1;
  const x = new Float64Array(params.length);
  for (let j = 0; j < params.length; j++) {
    const u0 = unitOf(params[j]!);
    const sign = (next() < 0.5 ? -1 : 1) * flip;
    x[j] = Math.min(1, Math.max(0, u0 + sign * step)) - u0;
  }
  return x;
}

export function overridesAt(params: readonly Tunable[], moves: ArrayLike<number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (let j = 0; j < params.length; j++) if (moves[j] !== 0) o[params[j]!.name] = valueAt(params[j]!, unitOf(params[j]!) + moves[j]!);
  return o;
}

export function screenJob(ruleSetId: string, params: readonly Tunable[], run: number, games: number, step: number, seed: number): BlockJob {
  return { ruleSetId, games, seedHex: seedHex(0x3000_0000 + run), overrides: overridesAt(params, screenMoves(params, run, step, seed)) };
}

export interface ScreenFit {
  /** slope[row][param]: change of the row per full range of the parameter. */
  readonly slope: Float64Array[];
  /** t[row][param]: slope over its standard error. 0 where the row has too few runs. */
  readonly t: Float64Array[];
  readonly runs: number;
}

/** One straight-line fit per (row, parameter) over the screen runs. */
export function fitScreen(moves: readonly ArrayLike<number>[], rows: readonly (readonly BlockRow[])[], nRows: number, nParams: number): ScreenFit {
  const slope: Float64Array[] = [], t: Float64Array[] = [];
  for (let i = 0; i < nRows; i++) {
    const s = new Float64Array(nParams), tt = new Float64Array(nParams);
    slope.push(s); t.push(tt);
    const idx: number[] = [];
    for (let r = 0; r < rows.length; r++) if ((rows[r]![i]?.[0] ?? null) !== null) idx.push(r);
    const R = idx.length;
    if (R < 8) continue;
    const y = idx.map((r) => rows[r]![i]![0]!);
    const ym = y.reduce((a, b) => a + b, 0) / R;
    let syy = 0;
    for (const v of y) syy += (v - ym) * (v - ym);
    if (!(syy > 0)) continue;
    for (let j = 0; j < nParams; j++) {
      let xm = 0;
      for (const r of idx) xm += moves[r]![j]!;
      xm /= R;
      let sxx = 0, sxy = 0;
      for (let k = 0; k < R; k++) { const dx = moves[idx[k]!]![j]! - xm; sxx += dx * dx; sxy += dx * (y[k]! - ym); }
      if (!(sxx > 0)) continue;
      const b = sxy / sxx;
      const resid = Math.max(syy - b * sxy, 0) / (R - 2);
      const se = Math.sqrt(resid / sxx);
      s[j] = b;
      tt[j] = se > 0 ? b / se : 0;
    }
  }
  return { slope, t, runs: rows.length };
}

export interface Candidate { readonly param: number; readonly score: number; readonly topRows: { readonly row: number; readonly t: number }[] }

/**
 * Orders parameters by how strongly they move the rows that are off target. `need[row]` is how much a row
 * matters (0 for a passing row). Half the places go to the best lever of each needy row in turn, so a row
 * with one weak lever is not crowded out by a row with twenty strong ones; the rest go by total score.
 */
export function rankCandidates(fit: ScreenFit, need: readonly number[], take: number, tMin = 2.5): Candidate[] {
  const nParams = fit.t[0]?.length ?? 0;
  const cands: Candidate[] = [];
  for (let j = 0; j < nParams; j++) {
    let sc = 0;
    const top: { row: number; t: number }[] = [];
    for (let i = 0; i < fit.t.length; i++) {
      const a = Math.abs(fit.t[i]![j]!);
      if (need[i]! > 0 && a > tMin) { sc += need[i]! * (a - tMin) * (a - tMin); top.push({ row: i, t: fit.t[i]![j]! }); }
    }
    if (sc > 0) cands.push({ param: j, score: sc, topRows: top.sort((p, q) => Math.abs(q.t) - Math.abs(p.t)).slice(0, 6) });
  }
  cands.sort((p, q) => q.score - p.score || p.param - q.param);
  const byParam = new Map(cands.map((c) => [c.param, c]));
  const chosen = new Map<number, Candidate>();
  const rowsByNeed = need.map((n, i) => ({ n, i })).filter((r) => r.n > 0).sort((p, q) => q.n - p.n);
  for (const { i } of rowsByNeed) {
    if (chosen.size >= take >> 1) break;
    let best = -1, bt = Math.max(tMin, 3);
    for (let j = 0; j < nParams; j++) { const a = Math.abs(fit.t[i]![j]!); if (a > bt) { bt = a; best = j; } }
    if (best >= 0 && byParam.has(best)) chosen.set(best, byParam.get(best)!);
  }
  for (const c of cands) { if (chosen.size >= take) break; chosen.set(c.param, c); }
  return [...chosen.values()].sort((p, q) => q.score - p.score || p.param - q.param);
}

/** How much each row matters to the search: nothing when it passes, more the further off and the higher its tier. */
export function rowNeed(metas: readonly RowMeta[], scores: readonly Score[]): number[] {
  return scores.map((s, i) => (s.z === null || Math.abs(s.z) <= 1 ? 0 : tierWeight(metas[i]!.target.tier) * Math.min(Math.abs(s.z), HUBER)));
}

// ---- 3. confirm ----

export interface ConfirmPlan { readonly param: Tunable; readonly uMinus: number; readonly uPlus: number; readonly jobs: BlockJob[] }

/** For each parameter: `blocks` blocks at the low point then `blocks` at the high point, on the baseline's seeds. */
export function confirmPlan(ruleSetId: string, params: readonly Tunable[], step: number, blocks: number, games: number, seedBase: number): ConfirmPlan[] {
  return params.map((p) => {
    const u0 = unitOf(p), uMinus = Math.max(0, u0 - step), uPlus = Math.min(1, u0 + step);
    const at = (u: number): BlockJob[] => Array.from({ length: blocks }, (_, b) => ({ ruleSetId, games, seedHex: seedHex(seedBase + b), overrides: { [p.name]: valueAt(p, u) } }));
    return { param: p, uMinus, uPlus, jobs: [...at(uMinus), ...at(uPlus)] };
  });
}

export interface Confirmed {
  readonly name: string;
  readonly uMinus: number;
  readonly uPlus: number;
  /** Per row: change per full range of the parameter, and its standard error. Null where not measurable. */
  readonly slope: (number | null)[];
  readonly se: (number | null)[];
  readonly error?: string;
}

export function confirmFit(metas: readonly RowMeta[], plan: ConfirmPlan, results: readonly BlockResult[]): Confirmed {
  const bad = results.find((r) => r.error);
  const base = { name: plan.param.name, uMinus: plan.uMinus, uPlus: plan.uPlus };
  const span = plan.uPlus - plan.uMinus;
  if (bad || !(span > 0)) return { ...base, slope: metas.map(() => null), se: metas.map(() => null), error: bad?.error ?? 'no room to move in its range' };
  const half = results.length >> 1;
  const slope: (number | null)[] = [], se: (number | null)[] = [];
  metas.forEach((m, i) => {
    const d = paired(m.target.kind, results.slice(0, half).map((r) => r.rows[i]!), results.slice(half).map((r) => r.rows[i]!));
    slope.push(d.d === null ? null : d.d / span);
    se.push(d.se === null ? null : d.se / span);
  });
  return { ...base, slope, se };
}

// ---- parameters the engine refuses to have moved ----

/**
 * Some values are fixed by the design and the engine throws when a table moves them. One such parameter
 * would fail every screen run, so they are found first by halving: `refuses(set)` plays the set nudged
 * both ways and returns the error, or null. A set that fails while both its halves pass is refused as a
 * whole (two values that only clash together); that is rare and is reported by name.
 */
export async function findRefused(params: readonly Tunable[], refuses: (set: readonly Tunable[]) => Promise<string | null>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const visit = async (set: readonly Tunable[], known: string | null): Promise<boolean> => {
    if (set.length === 0) return false;
    const err = known ?? await refuses(set);
    if (err === null) return false;
    if (set.length === 1) { out.set(set[0]!.name, err); return true; }
    const mid = set.length >> 1;
    const [a, b] = await Promise.all([visit(set.slice(0, mid), null), visit(set.slice(mid), null)]);
    if (!a && !b) for (const p of set) out.set(p.name, `refused together with ${set.length - 1} others: ${err}`);
    return true;
  };
  await visit(params, null);
  return out;
}
