// K3.3.1 payoff estimates from three sources (concept priors, matchup adjustment, planning reps) and
// K3.3.2 the matrix per situation bucket that K4.3.1 solves and calls from.
// Payoffs are from the planning side's view: expected points added for an offensive call, expected
// points saved for a defensive call. Planning reps run on the staff's estimated players, never on true
// attributes (K9.3.1): this file passes the reps port a call and a look and nothing about any player.
import type { PrepDepth } from './depth.ts';
import type { MatchupRow } from './matchups.ts';
import { param } from './params.ts';
import type { LookShare, PrepStream } from './scouting.ts';

export type Unit = 'offense' | 'defense' | 'specialTeams';

/** The look class every merged or unseen look falls into. The prior table must answer it for every family. */
export const OTHER_LOOK = 'other';

/** One call the planner may put on the menu: playbook content (G3) plus the staff's view of its readiness. */
export interface CallOption {
  readonly callId: string;
  readonly unit: Unit;
  /** G1 concept family tag: the row of the concept prior table. A user-designed play carries one too. */
  readonly conceptFamily: string;
  /** G1.1.1 kind for offense (run, dropback_pass, ...), the call kind for defense and special teams. */
  readonly kind: string;
  readonly tags: readonly string[];
  /** Catalogue situations the play is meant for (its `intent`, G6.2.1); null means any. */
  readonly fits: readonly string[] | null;
  /** Unit readiness 0 to 1 as the staff estimates it (G5.4.1 plus the coach's evaluation error, K4.3.5). */
  readonly readiness: number;
  /** In last week's plan and still installed (G5.3.2 carry-over). */
  readonly carryOver: boolean;
  /** How much the play leans on each pairing (content per concept), optionally only against some looks. */
  readonly pairings: readonly { readonly pairingId: string; readonly weight: number; readonly looks?: readonly string[] }[];
}

export interface Estimate { readonly mean: number; readonly sd: number }

/** Concept prior table (K3.3.1 rule 1): engine-generated content per rule set. Null means the family is missing. */
export type PriorTable = (unit: Unit, conceptFamily: string, look: string) => Estimate | null;

/**
 * Planning reps (K3.3.1 rule 3): `reps` plays of the actual call against the expected look in scenario
 * mode (J14.6.1), on players built from the staff's estimates. Returns the sample mean and SD of the
 * payoff, or null when the engine cannot stage the pair.
 */
export type PlanningReps = (req: { readonly callId: string; readonly look: string; readonly reps: number }, rng: PrepStream) => { mean: number; sd: number; n: number } | null;

export interface PayoffCell { readonly callId: string; readonly look: string; readonly mean: number; readonly sd: number; readonly reps: number }

export interface PayoffTable {
  readonly unit: Unit;
  readonly looks: readonly string[];
  readonly cells: ReadonlyMap<string, PayoffCell>;
  /** Planning reps spent, for the weekly budget (J14.2.2). */
  readonly repsUsed: number;
}

export const cellKey = (callId: string, look: string): string => `${callId}|${look}`;

/** K3.3.1 edge case: a call whose concept family is missing from the prior table fails content validation. */
export function missingPriors(calls: readonly CallOption[], looks: readonly string[], prior: PriorTable): string[] {
  const out: string[] = [];
  for (const c of calls) for (const look of [...looks, OTHER_LOOK]) {
    if (prior(c.unit, c.conceptFamily, look) === null) { out.push(`${c.callId}: concept family ${c.conceptFamily} has no prior against ${look}`); break; }
  }
  return out;
}

export interface PayoffInput {
  readonly unit: Unit;
  readonly calls: readonly CallOption[];
  /** Look classes the report shows, with their overall shares (most common first). */
  readonly looks: readonly LookShare[];
  readonly prior: PriorTable;
  readonly matchups: readonly MatchupRow[];
  readonly reps: PlanningReps | null;
  /** How many calls are on the short list that gets planning reps (the plan size). */
  readonly shortList: number;
  /** Planning reps already spent by this team this week (the other units), against the weekly cap. */
  readonly repsAlreadyUsed?: number;
}

/**
 * Builds `A[i][j]` and its uncertainty. Draws: planning reps on `rng.reps` in short-list order, then one
 * normal per cell on `rng.noise` in call-id then look order.
 */
export function buildPayoffs(inp: PayoffInput, depth: PrepDepth, rng: { readonly noise: PrepStream; readonly reps: PrepStream }): PayoffTable {
  const looks = [...new Set([...inp.looks.map((l) => l.look), OTHER_LOOK])];
  const problems = missingPriors(inp.calls, looks, inp.prior);
  if (problems.length) throw new Error(`content validation (K3.3.1): ${problems.join('; ')}`);
  const share = new Map(inp.looks.map((l) => [l.look, l.share]));
  const edges = new Map(inp.matchups.map((m) => [m.id, m]));
  // Matchup edges favour the offense when positive; a defensive call gains from the opposite sign.
  const sign = inp.unit === 'defense' ? -1 : 1;

  // Rules 1 and 2: prior plus matchup adjustment.
  const work = new Map<string, { callId: string; look: string; mean: number; variance: number; reps: number }>();
  const calls = [...inp.calls].sort((a, b) => (a.callId < b.callId ? -1 : a.callId > b.callId ? 1 : 0));
  for (const c of calls) for (const look of looks) {
    const p = inp.prior(c.unit, c.conceptFamily, look)!;
    let mean = p.mean;
    let variance = p.sd * p.sd;
    for (const w of c.pairings) {
      if (w.looks && !w.looks.includes(look)) continue;
      const e = edges.get(w.pairingId);
      if (!e) continue;
      mean += sign * w.weight * e.edge;
      variance += w.weight * w.weight * e.band * e.band;
    }
    work.set(cellKey(c.callId, look), { callId: c.callId, look, mean, variance, reps: 0 });
  }

  // Rule 3: planning reps for the short list, most valuable calls and most common looks first, inside the cap.
  let repsUsed = 0;
  if (inp.reps && depth.repsPerCell > 0) {
    let budget = Math.max(0, depth.repsWeeklyCap - (inp.repsAlreadyUsed ?? 0));
    const value = (c: CallOption) => looks.reduce((s, look) => s + (share.get(look) ?? 0) * work.get(cellKey(c.callId, look))!.mean, 0);
    const ranked = calls.map((c) => ({ c, v: value(c) })).sort((a, b) => b.v - a.v || (a.c.callId < b.c.callId ? -1 : 1)).slice(0, inp.shortList);
    const seenLooks = inp.looks.map((l) => l.look);
    outer: for (const look of seenLooks) for (const { c } of ranked) {
      if (budget < depth.repsPerCell) break outer;
      const r = inp.reps({ callId: c.callId, look, reps: depth.repsPerCell }, rng.reps);
      budget -= depth.repsPerCell;
      repsUsed += depth.repsPerCell;
      if (!r || r.n <= 0) continue;
      const cell = work.get(cellKey(c.callId, look))!;
      // Precision weighting of the adjusted prior and the sample mean.
      const sampleVar = Math.max(r.sd * r.sd / r.n, 1e-12);
      const priorVar = Math.max(cell.variance, 1e-12);
      const post = 1 / (1 / priorVar + 1 / sampleVar);
      cell.mean = post * (cell.mean / priorVar + r.mean / sampleVar);
      cell.variance = post;
      cell.reps = r.n;
    }
  }

  // Rule 4: estimate noise, smaller for a better preparer.
  const cells = new Map<string, PayoffCell>();
  for (const c of calls) for (const look of looks) {
    const w = work.get(cellKey(c.callId, look))!;
    const noise = rng.noise.normal() * depth.noiseSd;
    cells.set(cellKey(c.callId, look), { callId: w.callId, look, mean: w.mean + noise, sd: Math.sqrt(w.variance + depth.noiseSd * depth.noiseSd), reps: w.reps });
  }
  return { unit: inp.unit, looks, cells, repsUsed };
}

// ---- K3.3.2 the matrix per situation bucket ----

/** One row of the standard situation catalogue (G7.2.2) with its expected snaps (G7.2.3). */
export interface SituationDef {
  readonly id: string;
  /** The broader box a caller falls back to (K4.1.1 rule 2); null for a base box. */
  readonly parentId: string | null;
  readonly expectedSnaps: number;
  /** Two-minute, four-minute and last-play situations: payoffs in win probability (K4.3.1 rule 4). */
  readonly clock: boolean;
}

/** Win-probability payoff of a call against a look for a clock situation's representative states (N2.2.2). */
export type ClockPayoff = (situationId: string, callId: string, look: string) => Estimate | null;

export interface BucketMatrix {
  readonly bucketId: string;
  readonly unit: Unit;
  readonly payoffIn: 'expectedPoints' | 'winProbability';
  readonly candidates: readonly string[];
  readonly looks: readonly string[];
  /** Scouted share of each look in the bucket; sums to 1. */
  readonly shares: readonly number[];
  /** Charted plays behind each share (K4.2.1 shrinks the starting belief by count). */
  readonly counts: readonly number[];
  readonly a: readonly (readonly number[])[];
  readonly uncertainty: readonly (readonly number[])[];
  /** Stored mix, one probability per candidate; null until the sheet is locked. */
  readonly sigmaStar: readonly number[] | null;
}

/** Looks of a bucket after the 3% merge and the look cap. `members` lists what a merged class stands for. */
export function mergeLooks(shares: readonly LookShare[]): { look: string; share: number; count: number; members: { look: string; share: number }[] }[] {
  const sorted = [...shares].filter((s) => s.share > 0).sort((a, b) => b.share - a.share || (a.look < b.look ? -1 : 1));
  const keepMax = param('matrix.lookCap') - 1;
  const kept: typeof sorted = [];
  const merged: typeof sorted = [];
  for (const s of sorted) {
    if (s.look !== OTHER_LOOK && s.share >= param('matrix.mergeShare') && kept.length < keepMax) kept.push(s);
    else merged.push(s);
  }
  const out = kept.map((s) => ({ look: s.look, share: s.share, count: s.count, members: [{ look: s.look, share: s.share }] }));
  const mergedShare = merged.reduce((t, s) => t + s.share, 0);
  if (merged.length || !out.length) out.push({ look: OTHER_LOOK, share: out.length ? mergedShare : 1, count: merged.reduce((t, s) => t + s.count, 0), members: merged.map((s) => ({ look: s.look, share: s.share })) });
  const total = out.reduce((t, s) => t + s.share, 0);
  return out.map((s) => ({ ...s, share: total > 0 ? s.share / total : 1 / out.length }));
}

/** Value of a call in a bucket: its payoff against each look, weighted by how often the look is shown there. */
export function valueIn(m: Pick<BucketMatrix, 'candidates' | 'shares' | 'a'>, callId: string): number {
  const i = m.candidates.indexOf(callId);
  if (i < 0) return Number.NEGATIVE_INFINITY;
  return m.a[i]!.reduce((s, v, j) => s + v * m.shares[j]!, 0);
}

export interface MatrixInput {
  readonly situation: SituationDef;
  /** Calls allowed in the bucket; the matrix keeps the best up to the candidate cap. */
  readonly calls: readonly CallOption[];
  readonly table: PayoffTable;
  /** Look shares in this bucket; when it holds fewer plays than the thin mark, `allShares` is used. */
  readonly bucketShares: readonly LookShare[] | undefined;
  readonly allShares: readonly LookShare[];
  readonly clockPayoff?: ClockPayoff | null;
}

export function buildMatrix(inp: MatrixInput): BucketMatrix {
  const plays = (inp.bucketShares ?? []).reduce((s, l) => s + l.count, 0);
  const shares = plays >= param('matrix.thinBucketPlays') ? inp.bucketShares! : inp.allShares;
  const looks = mergeLooks(shares);
  const clock = inp.situation.clock && !!inp.clockPayoff;
  const cellOf = (callId: string, look: string): Estimate => {
    if (clock) {
      const wp = inp.clockPayoff!(inp.situation.id, callId, look);
      if (wp) return wp;
    }
    const c = inp.table.cells.get(cellKey(callId, look)) ?? inp.table.cells.get(cellKey(callId, OTHER_LOOK));
    if (!c) throw new Error(`no payoff cell for ${callId} against ${look}`);
    return c;
  };
  const row = (callId: string) => looks.map((l) => {
    if (l.members.length <= 1) return cellOf(callId, l.members[0]?.look ?? l.look);
    const w = l.members.reduce((s, m) => s + m.share, 0);
    let mean = 0;
    let variance = 0;
    for (const m of l.members) { const c = cellOf(callId, m.look); const f = m.share / w; mean += f * c.mean; variance += f * c.sd * c.sd; }
    return { mean, sd: Math.sqrt(variance) };
  });
  const rows = inp.calls.map((c) => ({ callId: c.callId, cells: row(c.callId) }))
    .map((r) => ({ ...r, value: r.cells.reduce((s, c, j) => s + c.mean * looks[j]!.share, 0) }))
    .sort((x, y) => y.value - x.value || (x.callId < y.callId ? -1 : 1))
    .slice(0, param('matrix.candidateCap'));
  return {
    bucketId: inp.situation.id, unit: inp.table.unit, payoffIn: clock ? 'winProbability' : 'expectedPoints',
    candidates: rows.map((r) => r.callId), looks: looks.map((l) => l.look), shares: looks.map((l) => l.share), counts: looks.map((l) => l.count),
    a: rows.map((r) => r.cells.map((c) => c.mean)), uncertainty: rows.map((r) => r.cells.map((c) => c.sd)), sigmaStar: null,
  };
}
