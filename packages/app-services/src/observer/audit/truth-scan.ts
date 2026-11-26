// Q1.4.2 and P1.1.4 acceptance: the checks that prove a read model, an AI view or a thread message
// holds no truth. Four independent checks, because each catches what the others miss:
//   1. schema scan     no field of class truth in any read-model schema
//   2. invariance      (./dynamic.ts) output does not change when only hidden facts change
//   3. sentinel search no planted true value appears in any message
//   4. rank test       no visible column orders a list the way the hidden truth would
import { param } from '../params.ts';
import { isPlainObject, pathsOfClass, walkSchema, type Schema } from '../schema-walk.ts';
import { mutateWhere } from './scramble.ts';

export interface SchemaHit { schema: string; path: string; problem: 'truth' | 'unclassified' }

/** Check 1. Every truth-class or unclassed field in the given schemas. Empty is the pass mark. */
export function scanSchemas(schemas: Readonly<Record<string, Schema>>): SchemaHit[] {
  const hits: SchemaHit[] = [];
  for (const [name, s] of Object.entries(schemas)) {
    for (const path of pathsOfClass(s, 'truth')) hits.push({ schema: name, path, problem: 'truth' });
    walkSchema(s, (n) => { if (n.isField && !n.vis) hits.push({ schema: name, path: n.path, problem: 'unclassified' }); });
  }
  return hits;
}

/** Setting keys that would switch truth on. Career builds have none (P1.1.4, Q1.4.2). */
export const SHOW_TRUTH_PATTERNS: readonly RegExp[] = [
  /show_?(true|truth|hidden|real)/i, /reveal/i, /true_?(ratings?|attributes?|values?)/i, /omniscien/i, /god_?mode/i, /debug_?truth/i, /fog_?of_?war/i,
];

export function showTruthSettings(settings: readonly { key: string }[]): string[] {
  return settings.map((s) => s.key).filter((k) => SHOW_TRUTH_PATTERNS.some((re) => re.test(k)));
}

/** A value planted in the truth of a marked person so that finding it elsewhere cannot be chance. */
export interface Sentinel { table: string; path: string; value: number | string }

let sentinelCounter = 0;

/**
 * Check 3, part one. Replaces truth-class decimals and free strings of a row with values that occur
 * nowhere else: a decimal moved by a unique amount under 0.001, a string with a marker. Whole numbers,
 * enums, booleans and formatted strings cannot carry a mark; the invariance check covers them.
 */
export function plantSentinels<T>(schema: Schema, row: T, table: string): { row: T; sentinels: Sentinel[] } {
  const sentinels: Sentinel[] = [];
  const marked = mutateWhere(schema, row, (_p, vis) => (vis === 'truth' ? 'all' : null), 1, (leaf) => {
    if (leaf.type === 'number' && typeof leaf.value === 'number' && !leaf.isInt) {
      sentinelCounter += 1;
      const off = ((sentinelCounter * 7919) % 1000000 + 137) / 1e9;
      const v = leaf.value + off <= leaf.max ? leaf.value + off : leaf.value - off;
      sentinels.push({ table, path: leaf.path, value: v });
      return v;
    }
    if (leaf.type === 'string' && typeof leaf.value === 'string' && !leaf.hasFormat) {
      sentinelCounter += 1;
      const v = `${leaf.value}#truth-mark-${sentinelCounter}#`;
      sentinels.push({ table, path: leaf.path, value: v });
      return v;
    }
    return undefined;
  });
  return { row: marked.value, sentinels };
}

export interface SentinelHit { sentinel: Sentinel; foundAt: string }

/** Check 3, part two. Searches any plain data (a read model, a recorded message list) for planted values. */
export function findSentinels(payload: unknown, sentinels: readonly Sentinel[]): SentinelHit[] {
  const nums = new Map<number, Sentinel>();
  const strs: Sentinel[] = [];
  for (const s of sentinels) { if (typeof s.value === 'number') nums.set(s.value, s); else strs.push(s); }
  const hits: SentinelHit[] = [];
  const go = (v: unknown, at: string) => {
    if (typeof v === 'number') { const s = nums.get(v); if (s) hits.push({ sentinel: s, foundAt: at }); }
    else if (typeof v === 'string') {
      for (const s of strs) if (v.includes(s.value as string)) hits.push({ sentinel: s, foundAt: at });
      for (const [n, s] of nums) if (v.includes(String(n))) hits.push({ sentinel: s, foundAt: at });
    } else if (Array.isArray(v)) v.forEach((x, i) => go(x, `${at}[${i}]`));
    else if (isPlainObject(v)) for (const [k, x] of Object.entries(v)) { go(k, `${at}.<key>`); go(x, `${at}.${k}`); }
  };
  go(payload, '$');
  return hits;
}

/** Kendall rank correlation (tau-a) of two equally long lists. 1 is the same order, -1 the reverse. */
export function kendallTau(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  if (n !== b.length) throw new Error('observer: rank lists differ in length');
  if (n < 2) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += Math.sign(a[i]! - a[j]!) * Math.sign(b[i]! - b[j]!);
  return s / ((n * (n - 1)) / 2);
}

export interface RankLeak { column: string; tau: number; estimateTau: number }

/**
 * Check 4 (Q1.4.2 edge case). For a list as a screen shows it: no visible number, and not the order
 * of the rows itself, may follow the true order more closely than the observer's estimate does.
 * `columns` are the visible numbers per row; the row position is always tested as column `$order`.
 */
export function rankLeaks(rows: readonly { truth: number; estimate: number; columns: Readonly<Record<string, number>> }[], margin = param('observer.audit.rank_margin')): RankLeak[] {
  const truth = rows.map((r) => r.truth);
  const estimateTau = Math.abs(kendallTau(rows.map((r) => r.estimate), truth));
  const names = new Set<string>(rows.flatMap((r) => Object.keys(r.columns)));
  const out: RankLeak[] = [];
  const test = (column: string, values: number[]) => {
    const tau = Math.abs(kendallTau(values, truth));
    if (tau > estimateTau + margin) out.push({ column, tau, estimateTau });
  };
  test('$order', rows.map((_r, i) => i));
  for (const c of names) test(c, rows.map((r) => r.columns[c] ?? 0));
  return out;
}
