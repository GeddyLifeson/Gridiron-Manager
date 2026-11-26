// Breaking tendencies (G8.4.1 breaker planner, G8.4.2 results, G8.4.3 holds and plants).
import { param } from './params.ts';
import { runOrPass } from './cuts.ts';
import { bandFor, type Band } from './table.ts';
import { effectiveN } from './stats.ts';
import type { ChartedPlay } from './types.ts';

/** A playbook call as the planner reads it (G3 library entry, G1.1.1 family fields). */
export interface PlaybookEntry {
  readonly playId: string;
  readonly kind: string;
  readonly runDirection: 'left' | 'middle' | 'right' | null;
  readonly formation: string | null;
  readonly personnel: string;
  readonly motion: string | null;
  /** D9 readiness 0 to 1. */
  readonly readiness: number;
  /** G3.2.1 complement and constraint links: plays this one is built to pair with. */
  readonly links?: readonly string[];
}

/** The found tendency: a look and what it gives away. */
export interface TendencyTarget {
  readonly formation: string | null;
  readonly personnel: string;
  readonly motion?: string | null;
  /** The kind family the tendency leans to ('run' or 'pass'), or a G1.1.1 kind. */
  readonly leansTo: string;
  /** Lean in direction, for a run-direction tendency. */
  readonly direction?: 'left' | 'middle' | 'right' | null;
  /** Calls of the tendency in the playbook (plays it is made of), for the link ranking. */
  readonly tendencyPlayIds?: readonly string[];
}

function differs(e: PlaybookEntry, t: TendencyTarget): boolean {
  const fam = runOrPass(e.kind);
  if (t.leansTo === 'run' || t.leansTo === 'pass') {
    if (fam !== null && fam !== t.leansTo) return true;
  } else if (e.kind !== t.leansTo) return true;
  return t.direction != null && e.runDirection !== null && e.runDirection !== t.direction;
}

export interface BreakerPlan {
  readonly breakers: readonly PlaybookEntry[];
  /** No play in the book breaks it: open the designer with the look loaded (G8.4.1 edge case). */
  readonly openDesigner: { formation: string | null; personnel: string } | null;
}

/**
 * G8.4.1: plays that share the tendency's formation and personnel and differ in play kind or direction,
 * ranked by how close they look before the snap (same motion), then by links to the tendency calls,
 * then readiness. Held calls are left out (G8.4.3).
 */
export function planBreakers(t: TendencyTarget, playbook: readonly PlaybookEntry[], held: ReadonlySet<string> = new Set()): BreakerPlan {
  const tendencyIds = new Set(t.tendencyPlayIds ?? []);
  const motion = t.motion ?? null;
  const list = playbook.filter((e) => e.formation === t.formation && e.personnel === t.personnel && !held.has(e.playId) && differs(e, t))
    .map((e) => ({ e, sameMotion: e.motion === motion ? 1 : 0, linked: (e.links ?? []).some((l) => tendencyIds.has(l)) ? 1 : 0 }))
    .sort((a, b) => b.sameMotion - a.sameMotion || b.linked - a.linked || b.e.readiness - a.e.readiness || (a.e.playId < b.e.playId ? -1 : a.e.playId > b.e.playId ? 1 : 0))
    .map((x) => x.e);
  return { breakers: list, openDesigner: list.length ? null : { formation: t.formation, personnel: t.personnel } };
}

/**
 * G8.4.1 default dose: one breaker for each 4 to 6 tendency calls the game is expected to produce
 * (G7.2.3 expected snaps). Returns the range of breakers to plan.
 */
export function breakerDose(expectedTendencyCalls: number): { low: number; high: number } {
  const c = Math.max(0, expectedTendencyCalls);
  return { low: Math.floor(c / param('breaker.callsPerBreakerMax')), high: Math.floor(c / param('breaker.callsPerBreakerMin')) };
}

/** G8.4.1 defensive mirror: the stress call becomes the breaker once the opponent's success rate passes the G7.7.1 stress line. */
export function stressCallIsBreaker(successAgainst: number, calls: number, stressLine: number, minCalls: number): boolean {
  return calls >= minCalls && successAgainst > stressLine;
}

// ---- G8.4.2 results ----

export interface CallResultLine {
  readonly ref: string;
  readonly gameId: number;
  readonly breaker: boolean;
  readonly yards: number;
  readonly success: boolean | null;
  /** The defense's reaction as film review reads it (N1 tag); null when not reviewed. */
  readonly filmReaction: string | null;
}

export interface BreakerResults {
  readonly lines: readonly CallResultLine[];
  readonly tendency: { calls: number; successes: number; yards: number };
  readonly breakers: { calls: number; successes: number; yards: number };
}

/**
 * G8.4.2: facts only, with counts. `tendencyRefs` are the calls of the tendency, `breakerRefs` the
 * breakers called. Reads no opposing plan: the only reaction is the film tag passed in.
 */
export function breakerResults(plays: readonly ChartedPlay[], tendencyRefs: ReadonlySet<string>, breakerRefs: ReadonlySet<string>, filmReaction: (ref: string) => string | null = () => null): BreakerResults {
  const lines: CallResultLine[] = [];
  const t = { calls: 0, successes: 0, yards: 0 }, b = { calls: 0, successes: 0, yards: 0 };
  for (const p of plays) {
    const isB = breakerRefs.has(p.ref);
    if (!isB && !tendencyRefs.has(p.ref)) continue;
    const acc = isB ? b : t;
    acc.calls++; acc.yards += p.yards; if (p.success) acc.successes++;
    lines.push({ ref: p.ref, gameId: p.gameId, breaker: isB, yards: p.yards, success: p.success, filmReaction: filmReaction(p.ref) });
  }
  return { lines, tendency: t, breakers: b };
}

// ---- G8.4.3 holds and plants ----

export interface Hold { readonly playId: string; readonly side: 'offense' | 'defense'; readonly target: string }

export interface HoldReview {
  readonly overLimit: readonly ('offense' | 'defense')[];
  /** Held calls found on a sheet for another game (listed in the G7.9.1 review). */
  readonly onSheet: readonly string[];
  /** Practice reps a week the holds cost (one each, D9 decay). */
  readonly repsPerWeek: number;
}

export function reviewHolds(holds: readonly Hold[], sheetPlayIds: ReadonlySet<string>, thisGameTarget: string | null): HoldReview {
  const limit = param('hold.limitPerSide');
  const over: ('offense' | 'defense')[] = [];
  for (const s of ['offense', 'defense'] as const) if (holds.filter((h) => h.side === s).length > limit) over.push(s);
  return {
    overLimit: over,
    onSheet: holds.filter((h) => sheetPlayIds.has(h.playId) && h.target !== thisGameTarget).map((h) => h.playId).sort(),
    repsPerWeek: holds.length * param('hold.repsPerWeek'),
  };
}

export interface Plant { readonly formation: string | null; readonly personnel: string; readonly leansTo: 'run' | 'pass' }

/**
 * G8.4.3 plant counter: charted calls that now support the planted pattern and its G8.1.1 band, so the
 * user sees when an opponent with good charting would rate it strong. A plant changes nothing in the engine.
 */
export function plantCounter(plant: Plant, plays: readonly ChartedPlay[]): { support: number; calls: number; band: Band | null } {
  const rows = plays.filter((p) => p.side === 'offense' && !p.forced && !p.lookOnly && p.formation === plant.formation && p.personnel === plant.personnel && runOrPass(p.playKind) !== null);
  const support = rows.filter((p) => runOrPass(p.playKind) === plant.leansTo).length;
  return { support, calls: rows.length, band: bandFor(support, rows.length, effectiveN(rows.map((p) => p.weight ?? 1)), true, null) };
}

/** G8.4.3 acceptance: charted entries of a play. Zero until the play is first called in a game, because charts come only from game records. */
export function filmEntries(plays: readonly ChartedPlay[], concept: string): number {
  return plays.filter((p) => p.concept === concept).length;
}
