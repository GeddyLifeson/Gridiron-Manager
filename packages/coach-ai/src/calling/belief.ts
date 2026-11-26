// K4.2 belief about the opponent: pseudo-counts over the opponent's look classes per bucket, started
// from scouting (K4.2.1) and corrected by what the caller's booth sees today (K4.2.2). Inputs hold
// charted, observable fields only (K9.1.1): the opponent's plan and sheet cannot reach this module.
import { clamp, type Draws } from '../profile/draws.ts';
import type { OpponentNoteRow } from '../profile/types.ts';
import { param } from './params.ts';
import type { ScoutRow } from './types.ts';

export interface Belief {
  /** Prior strength in plays (K4.2.1 rule 2). */
  readonly n0: number;
  readonly looks: readonly string[];
  /** All-situations share per look, the shrink target and the prior of an unscouted bucket. */
  readonly overall: readonly number[];
  readonly counts: Map<string, number[]>;
  /** Scouted plays per bucket, capped at `n0` (K4.3.2 rule 4). */
  readonly scouted: Map<string, number>;
  /** In-game observations per bucket. */
  readonly seen: Map<string, number>;
}

/** K4.2.1 rule 2: a quick adjuster holds his scouting loosely. */
export function priorStrength(zAdjustment: number): number {
  return clamp(param('belief.n0Base') - param('belief.n0PerZ') * zAdjustment, param('belief.n0Min'), param('belief.n0Max'));
}

function floored(shares: number[]): number[] {
  const f = param('belief.unseenFloor');
  const out = shares.map((x) => (x < f ? f : x));
  const t = out.reduce((a, x) => a + x, 0);
  return out.map((x) => x / t);
}

/** K4.2.1: the pregame expectation per bucket. `leagueShares` is the last resort for a caller with no film (edge case). */
export function startBelief(looks: readonly string[], bucketIds: readonly string[], rows: readonly ScoutRow[], notes: readonly OpponentNoteRow[], zAdjustment: number, leagueShares?: readonly number[]): Belief {
  const idx = new Map(looks.map((l, i) => [l, i] as const));
  const n0 = priorStrength(zAdjustment);
  const all = new Array<number>(looks.length).fill(0);
  const by = new Map<string, number[]>();
  for (const r of rows) {
    const j = idx.get(r.look);
    if (j === undefined) continue;
    const w = r.count * (r.weight ?? 1);
    all[j]! += w;
    let row = by.get(r.bucketId);
    if (!row) { row = new Array<number>(looks.length).fill(0); by.set(r.bucketId, row); }
    row[j]! += w;
  }
  const allN = all.reduce((a, x) => a + x, 0);
  const overall = floored(allN > 0 ? all.map((x) => x / allN) : leagueShares ? [...leagueShares] : looks.map(() => 1 / looks.length));
  const shrink = param('belief.shrinkPlays');
  const counts = new Map<string, number[]>();
  const scouted = new Map<string, number>();
  for (const b of bucketIds) {
    const row = by.get(b) ?? new Array<number>(looks.length).fill(0);
    const n = row.reduce((a, x) => a + x, 0);
    const share = floored(row.map((x, j) => (x + shrink * overall[j]!) / (n + shrink)));
    counts.set(b, share.map((x) => n0 * x));
    scouted.set(b, Math.min(n, n0));
  }
  // Rule 3: what he remembers about this caller, as extra counts at their decayed weights.
  for (const note of notes) {
    const j = idx.get(note.observed);
    const row = counts.get(note.bucket);
    if (j === undefined || !row) continue;
    row[j]! += note.weight;
  }
  return { n0, looks, overall, counts, scouted, seen: new Map() };
}

function rowOf(b: Belief, bucketId: string): number[] {
  let row = b.counts.get(bucketId);
  if (!row) { row = b.overall.map((x) => b.n0 * x); b.counts.set(bucketId, row); }
  return row;
}

/** Belief share per look class in a bucket. */
export function beliefShares(b: Belief, bucketId: string): number[] {
  const row = rowOf(b, bucketId);
  const t = row.reduce((a, x) => a + x, 0);
  return row.map((x) => x / t);
}

/** K4.3.2 rule 4: plays of evidence in this bucket. */
export function evidence(b: Belief, bucketId: string): number {
  return (b.scouted.get(bucketId) ?? 0) + (b.seen.get(bucketId) ?? 0);
}

/** K4.2.2 rule 3: the booth's chance of mislabelling a look, from the booth coach's evaluation. */
export function mislabelChance(zBoothEvaluation: number): number {
  const lo = param('belief.mislabelMin'), hi = param('belief.mislabelMax');
  return clamp((lo + hi) / 2 - param('belief.mislabelPerZ') * zBoothEvaluation, lo, hi);
}

export interface UpdateInputs {
  readonly bucketId: string;
  /** The look the opponent showed. */
  readonly look: string;
  /** Buckets that share the play's down or personnel (rule 1). */
  readonly neighbours: readonly string[];
  readonly hurt: boolean;
  readonly scriptedProbe: boolean;
  readonly mislabel: number;
}

/**
 * K4.2.2: one observed play. Always takes exactly two uniforms from `draws` so the stream position
 * never depends on the outcome. Returns the look class the booth logged.
 */
export function updateBelief(b: Belief, u: UpdateInputs, draws: Draws): string {
  const u1 = draws.uniform();
  const u2 = draws.uniform();
  let j = b.looks.indexOf(u.look);
  if (j < 0) return u.look;
  if (u1 < u.mislabel && b.looks.length > 1) {
    const k = Math.min(b.looks.length - 2, Math.floor(u2 * (b.looks.length - 1)));
    j = k >= j ? k + 1 : k;
  }
  let w = 1;
  if (u.hurt) w *= param('belief.hurtWeight');
  if (u.scriptedProbe) w *= param('belief.probeWeight');
  rowOf(b, u.bucketId)[j]! += w;
  b.seen.set(u.bucketId, (b.seen.get(u.bucketId) ?? 0) + 1);
  for (const n of u.neighbours) if (n !== u.bucketId) rowOf(b, n)[j]! += w * param('belief.neighbourAdd');
  return b.looks[j]!;
}

/** K4.2.2 edge case: the opponent changed callers mid-game. Call once. */
export function opponentCallerChanged(b: Belief): void {
  const f = param('belief.callerChangeFactor');
  for (const row of b.counts.values()) for (let j = 0; j < row.length; j++) row[j] = row[j]! * f;
}
