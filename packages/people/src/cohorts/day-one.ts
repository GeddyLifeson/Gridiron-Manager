// X11.1.2 what every new person carries on day one: an age from the kind's reference, an X1 block from
// his population group (the generator draws it), a stress start, no labels, no memory rows, and edges
// only from tracked shared events. Nothing about a newcomer is described ahead of evidence.
import { TraitBlock, type MemoryRow, type PersonRecord, type RandomStream, type RelationshipEdge } from '@gm/schema';
import { param } from './params.ts';
import { PRO_ENTRY_AGE_SHARES } from './targets.ts';
import type { CohortKind } from './kinds.ts';

/** X11.1.2 rule 1: football age at creation for a cohort kind. One uniform or one pick from `s`. */
export function entryAge(kind: CohortKind, s: RandomStream): number {
  switch (kind) {
    case 'recruit_class': return param('recruitEntryAge');
    case 'college_walk_on': return param('walkOnEntryAge');
    case 'pro_entry_pool':
    case 'undrafted_pool':
      return PRO_ENTRY_AGE_SHARES[s.pick(PRO_ENTRY_AGE_SHARES.map(([, w]) => w))]![0];
    case 'coach_staff_entry': return s.int(param('coachEntryAgeMin'), param('coachEntryAgeMax'));
  }
}

/** X11.1.2 rule 5: day-one stress on the X5 scale, uniform in the starting range. */
export function startingStress(s: RandomStream): number {
  return s.int(param('stressStartMin'), param('stressStartMax'));
}

/** Edge kinds that a tracked shared event can create before a newcomer's first day (X11.1.2 rule 4). */
export const DAY_ONE_EDGE_KINDS: ReadonlySet<RelationshipEdge['kind']> = new Set(['teammate', 'coached', 'family', 'recruited_by']);

export interface Newcomer {
  readonly record: PersonRecord;
  readonly edges: readonly RelationshipEdge[];
  readonly memory: readonly MemoryRow[];
  /** Labels computed for him at creation (W-22: labels are computed, never stored). Must be empty. */
  readonly labels: readonly string[];
  /** Event ids of tracked shared events that exist in the log (an edge's basis must be one). */
  readonly knownEventIds: ReadonlySet<number>;
  readonly createdOn: { seasonYear: number; dayIndex: number };
}

/** X11.1.2 acceptance: a valid block, zero labels, no memory rows, edges only from tracked events. */
export function dayOneProblems(n: Newcomer): string[] {
  const out: string[] = [];
  const id = n.record.id;
  if (!TraitBlock.safeParse(n.record.traitBlock).success) out.push(`person ${id}: no valid trait block`);
  if (n.labels.length > 0) out.push(`person ${id}: ${n.labels.length} labels at creation`);
  if (n.memory.length > 0) out.push(`person ${id}: ${n.memory.length} memory rows at creation`);
  for (const e of n.edges) {
    if (e.a !== id && e.b !== id) continue;
    if (!DAY_ONE_EDGE_KINDS.has(e.kind)) out.push(`person ${id}: day-one edge of kind ${e.kind}`);
    if (e.basisEventIds.length === 0) out.push(`person ${id}: edge with no shared event`);
    for (const ev of e.basisEventIds) if (!n.knownEventIds.has(ev)) out.push(`person ${id}: edge basis ${ev} is not a tracked event`);
    if (after(e.since, n.createdOn)) out.push(`person ${id}: edge dated after creation`);
  }
  return out;
}

function after(a: { seasonYear: number; dayIndex: number }, b: { seasonYear: number; dayIndex: number }): boolean {
  return a.seasonYear !== b.seasonYear ? a.seasonYear > b.seasonYear : a.dayIndex > b.dayIndex;
}

/** Median of a list (for the X11.1.2 age acceptance and the X11.2.3 bands). */
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** X11.1.2 acceptance for one season's pro entry pool: median 22 +-1 and at least 70 percent aged 21 to 24. */
export function proPoolAgesPass(ages: readonly number[]): boolean {
  if (ages.length === 0) return false;
  const lo = param('proPoolBandMin'), hi = param('proPoolBandMax');
  const inBand = ages.filter((a) => a >= lo && a <= hi).length / ages.length;
  return Math.abs(median(ages) - param('proPoolMedianAge')) <= param('proPoolMedianTol') && inBand >= param('proPoolBandShareMin');
}
