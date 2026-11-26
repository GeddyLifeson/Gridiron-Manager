// K4.3.1 the matrix game. The row player's maximin mix of a zero-sum game, by the simplex method on
// the column player's linear program (its slack variables start feasible, so no phase one is needed).
// Solved at plan lock and when a candidate list changes in game, never per snap (J14.7.1).
import { param } from './params.ts';
import type { CallingSheet, SheetBox } from './types.ts';

export interface GameSolution {
  /** Probability per row, summing to 1. */
  readonly mix: number[];
  /** The game value: the least expected payoff the mix guarantees. */
  readonly value: number;
}

const EPS = 1e-11;

/** Worst-case expected payoff of a row mix over the columns. */
export function worstCase(a: readonly (readonly number[])[], mix: readonly number[]): number {
  const n = a[0]?.length ?? 0;
  let worst = Infinity;
  for (let j = 0; j < n; j++) {
    let v = 0;
    for (let i = 0; i < a.length; i++) v += mix[i]! * a[i]![j]!;
    if (v < worst) worst = v;
  }
  return worst;
}

/** Maximise the minimum expected payoff over columns for the row player of `a[row][column]`. */
export function solveZeroSum(a: readonly (readonly number[])[]): GameSolution {
  const m = a.length;
  const n = a[0]?.length ?? 0;
  if (m === 0 || n === 0) throw new Error('solveZeroSum: empty matrix');
  if (m === 1) return { mix: [1], value: worstCase(a, [1]) };
  let lo = Infinity;
  for (const row of a) for (const x of row) if (x < lo) lo = x;
  const shift = 1 - lo; // every entry of b is at least 1
  // Tableau: m constraint rows [b | I | 1], then the objective row [-1 ... | 0 ... | 0].
  const w = n + m + 1;
  const t: number[][] = [];
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(w).fill(0);
    for (let j = 0; j < n; j++) row[j] = a[i]![j]! + shift;
    row[n + i] = 1;
    row[w - 1] = 1;
    t.push(row);
  }
  const obj = new Array<number>(w).fill(0);
  for (let j = 0; j < n; j++) obj[j] = -1;
  t.push(obj);
  for (let iter = 0; iter < 2000; iter++) {
    // Bland's rule: lowest-index entering column, so the method cannot cycle.
    let col = -1;
    for (let j = 0; j < n + m; j++) if (obj[j]! < -EPS) { col = j; break; }
    if (col < 0) break;
    let pivot = -1;
    let best = Infinity;
    for (let i = 0; i < m; i++) {
      const c = t[i]![col]!;
      if (c > EPS) {
        const ratio = t[i]![w - 1]! / c;
        if (ratio < best - EPS) { best = ratio; pivot = i; }
      }
    }
    if (pivot < 0) throw new Error('solveZeroSum: unbounded (not possible for a positive matrix)');
    const pr = t[pivot]!;
    const pv = pr[col]!;
    for (let j = 0; j < w; j++) pr[j] = pr[j]! / pv;
    for (let i = 0; i <= m; i++) {
      if (i === pivot) continue;
      const f = t[i]![col]!;
      if (f === 0) continue;
      const r = t[i]!;
      for (let j = 0; j < w; j++) r[j] = r[j]! - f * pr[j]!;
    }
  }
  // The row player's mix is the dual solution: the objective row under the slack columns.
  const total = obj[w - 1]!;
  const mix = new Array<number>(m);
  let sum = 0;
  for (let i = 0; i < m; i++) { mix[i] = Math.max(0, obj[n + i]!); sum += mix[i]!; }
  for (let i = 0; i < m; i++) mix[i] = mix[i]! / sum;
  return { mix, value: 1 / total - shift };
}

/**
 * K4.3.1 as one call for K3 plan lock (G-74): the maximin mix of `a[candidate][look]`, and when the
 * coach's estimate makes one candidate dominant, 5% for every other candidate he planned to use
 * (`planned[i]`, all true when omitted) so that a dominant estimate never produces a pure strategy.
 */
export function solveMix(a: readonly (readonly number[])[], planned?: readonly boolean[]): number[] {
  const { mix } = solveZeroSum(a);
  const top = mix.findIndex((p) => p > 1 - 1e-9);
  if (top < 0) return mix;
  const floor = param('mix.degenerateFloor');
  const others = mix.map((_, i) => (i !== top && (planned?.[i] ?? true) ? floor : 0));
  const given = others.reduce((s, x) => s + x, 0);
  if (given >= 1) return others.map((x) => x / given);
  return others.map((x, i) => (i === top ? 1 - given : x));
}

/** The stored mix of a candidate list on a sheet: `solveMix` with the sheet's plan weights. */
export function storedMix(sheet: CallingSheet, callIds: readonly string[], payoffOf: (callId: string) => readonly number[]): number[] {
  return solveMix(callIds.map((id) => payoffOf(id)), callIds.map((id) => (sheet.calls[id]?.planWeight ?? 0) > 0));
}

/** A box's payoff row for a call, falling back to zeros when the coach holds no estimate for it. */
export function payoffRow(sheet: CallingSheet, box: SheetBox, callId: string): readonly number[] {
  return box.payoff[callId] ?? baseRow(sheet, callId) ?? sheet.looks.map(() => 0);
}

function baseRow(sheet: CallingSheet, callId: string): readonly number[] | undefined {
  for (const b of sheet.boxes) { const r = b.payoff[callId]; if (r) return r; }
  return undefined;
}

/** K4.3.1 rule 2, K3.4.2: solve every box once at plan lock and store the mixes on the sheet. */
export function lockSheet(sheet: CallingSheet): CallingSheet {
  if (sheet.looks.length > param('mix.maxLooks')) throw new Error(`sheet has ${sheet.looks.length} look classes; the limit is ${param('mix.maxLooks')}`);
  const boxes = sheet.boxes.map((box) => {
    if (box.callIds.length === 0) return box;
    if (box.callIds.length > param('mix.maxCandidates')) throw new Error(`box ${box.bucketId} has ${box.callIds.length} calls; the limit is ${param('mix.maxCandidates')}`);
    const mix = storedMix(sheet, box.callIds, (id) => payoffRow(sheet, box, id));
    const stored: Record<string, number> = {};
    box.callIds.forEach((id, i) => { stored[id] = mix[i]!; });
    return { ...box, storedMix: stored };
  });
  return { ...sheet, boxes };
}
