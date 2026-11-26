// Clips with known truth and the stratified sampler (Q5.1.1 "stratified sampling across play types and
// outcomes, not picked by the authors"; Q5.2.1 rule 1 "100 clips per level, stratified by concept and
// outcome"). A clip's picture comes from the film room (G-63); this file only needs the truth behind
// it, which the play explainer (Q2.6.1) and the play record supply. The film room fills `ClipSource`.
import type { CoverageFamily, PlayByPlayRow } from '@gm/schema';
import { stream, type WorldSeed } from '@gm/engine-core';

export type Level = 'pro' | 'college';

/** What the clip shows as a concept: the pass protection on pass plays, the run concept on runs. */
export type ConceptKind = 'protection' | 'run_concept';

/** Q5.2.1 outputs: the play succeeded or failed. Kept coarse on purpose, one stratum axis. */
export type OutcomeBucket = 'success' | 'failure';

export interface ClipTruth {
  readonly clipId: string;
  readonly level: Level;
  /** Play type for stratifying (Q5.1.1): the offense play kind or kick kind of the play record. */
  readonly playType: string;
  readonly coverageFamily: CoverageFamily | null;
  /** Q5.2.1 rule 4: coverage is scored only where the disguise ended before the snap. */
  readonly disguiseEndedBeforeSnap: boolean;
  readonly conceptKind: ConceptKind | null;
  /** Content id of the protection or run concept; must be one of the answer list (Q5.2.1 rule 2). */
  readonly concept: string | null;
  readonly outcome: OutcomeBucket;
  /** Decisive event from the play explainer (Q2.6.1), the key a reason is judged against. */
  readonly decisiveEvent: string;
}

/** Supplied by the film room (G-63). Truth stays inside the tool; the viewer shows the clip with overlays off. */
export interface ClipSource {
  readonly level: Level;
  clips(): readonly ClipTruth[];
}

/** Q5.2.1 Outputs: success or failure of the play. Success is the standard EPA sign when expected points
 * exist (N2); before the models package fills them, a first down or touchdown counts as success and a
 * turnover or sack as failure, else a gain of at least 4 yards. The fallback is a module choice, not a fact. */
export function outcomeOf(row: Pick<PlayByPlayRow, 'epBefore' | 'epAfter' | 'firstDown' | 'touchdown' | 'interception' | 'fumbleLost' | 'sack' | 'yardsGained'>): OutcomeBucket {
  if (row.epBefore !== null && row.epAfter !== null) return row.epAfter - row.epBefore > 0 ? 'success' : 'failure';
  if (row.interception || row.fumbleLost || row.sack) return 'failure';
  if (row.touchdown || row.firstDown) return 'success';
  return row.yardsGained >= 4 ? 'success' : 'failure';
}

export type StratumKey = (c: ClipTruth) => string;

/** Q5.2.1: concept by outcome. Plays with no concept stratify by play type. */
export const byConceptAndOutcome: StratumKey = (c) => `${c.concept ?? `type:${c.playType}`}|${c.outcome}`;
/** Q5.1.1: play type by outcome. */
export const byPlayTypeAndOutcome: StratumKey = (c) => `${c.playType}|${c.outcome}`;

export interface SampleResult {
  readonly clips: readonly ClipTruth[];
  /** Stratum key, clips available, clips drawn. Sorted by key. */
  readonly strata: readonly { readonly key: string; readonly available: number; readonly drawn: number }[];
  /** Asked for more than the pool holds: the whole pool is returned and this says so. */
  readonly short: boolean;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Proportional allocation with largest remainders, at least one clip from every stratum while the
 * budget allows, then a seeded draw without replacement inside each stratum. The same pool, size and
 * seed always give the same clips: nobody, including the authors, picks them (Q5.1.1).
 */
export function stratifiedSample(pool: readonly ClipTruth[], size: number, key: StratumKey, seed: WorldSeed, scope: string): SampleResult {
  const groups = new Map<string, ClipTruth[]>();
  for (const c of [...pool].sort((a, b) => cmp(a.clipId, b.clipId))) {
    const k = key(c);
    const g = groups.get(k);
    if (g) g.push(c); else groups.set(k, [c]);
  }
  const keys = [...groups.keys()].sort(cmp);
  const total = pool.length;
  const want = Math.max(0, Math.min(size, total));
  const alloc = new Map<string, number>(keys.map((k) => [k, 0]));
  if (want > 0) {
    // One per stratum first, in key order, while the budget lasts.
    let left = want;
    for (const k of keys) { if (left === 0) break; alloc.set(k, 1); left--; }
    // The rest proportionally to what each stratum still holds.
    const room = keys.map((k) => groups.get(k)!.length - alloc.get(k)!);
    const roomTotal = room.reduce((a, b) => a + b, 0);
    if (left > 0 && roomTotal > 0) {
      const exact = room.map((r) => (r * left) / roomTotal);
      const floors = exact.map((e, i) => Math.min(room[i]!, Math.floor(e)));
      let given = floors.reduce((a, b) => a + b, 0);
      const order = exact.map((e, i) => ({ i, rem: e - Math.floor(e) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
      for (let pass = 0; given < left && pass < keys.length * 2; pass++) {
        for (const { i } of order) {
          if (given >= left) break;
          if (floors[i]! < room[i]!) { floors[i]!++; given++; }
        }
      }
      keys.forEach((k, i) => alloc.set(k, alloc.get(k)! + floors[i]!));
    }
  }
  const out: ClipTruth[] = [];
  const strata = keys.map((k) => {
    const g = groups.get(k)!;
    const n = alloc.get(k)!;
    const rng = stream(seed, 'validation.sample', [scope, k]);
    const copy = [...g];
    // Partial Fisher-Yates: the first n are the draw.
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rng.uniform() * (copy.length - i));
      const t = copy[i]!; copy[i] = copy[j]!; copy[j] = t;
    }
    out.push(...copy.slice(0, n));
    return { key: k, available: g.length, drawn: n };
  });
  return { clips: out.sort((a, b) => cmp(a.clipId, b.clipId)), strata, short: size > total };
}
