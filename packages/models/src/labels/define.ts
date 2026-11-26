// Label definitions as queries (X2.2.1, N2.8.1 rule 1). A label is data: which logged events count for and
// against it, how evidence becomes a number, what it is compared with, and the thresholds. A definition
// can read only event rows; it has no field that could name a trait or hidden value (X1.2.2 rule 5).
import type { WorldEvent } from '@gm/schema';
import { LABEL_PARAMS as P } from './params.ts';

export type Scalar = string | number | boolean | null;
export type SubjectKind = 'coach' | 'player' | 'staff' | 'owner' | 'administrator' | 'team' | 'program';
/** N2.8.1 rule 3 sample classes. */
export type LabelKind = 'game_management' | 'play_calling' | 'performance' | 'conduct';

/** Which rows count: a listed type, an actor in `actorRole` (subject is that actor), payload fields equal. */
export interface EventMatch {
  readonly types: readonly string[];
  readonly actorRole?: string | null;
  readonly payloadEquals?: Readonly<Record<string, Scalar>>;
}

export interface LabelDef {
  readonly id: string;
  readonly appliesTo: readonly SubjectKind[];
  /** Text key of the phrase; wording only (X2.2.1 rule 1). */
  readonly phrase: string;
  readonly kind: LabelKind;
  /** Who the evidence is about: the matching actor, or the row's team (`where.teamId`). */
  readonly subjectBy: 'actor' | 'team';
  /**
   * `rate`: positives over positives plus negatives, compared with the population rate in the same
   * contexts. `count`: weighted positives, compared with the population count per subject.
   */
  readonly measure: 'rate' | 'count';
  readonly positive: EventMatch;
  /**
   * Rows where the behaviour was possible and not shown. Positives plus negatives are the exposure: a
   * `rate` compares the positive share with the population share; a `count` compares weighted positives
   * with the positives expected from the same exposure at the population share (Poisson error).
   */
  readonly negative: EventMatch;
  readonly direction: 'above' | 'below';
  readonly thresholdOn?: number;
  readonly thresholdOff?: number;
  readonly minSample?: number;
  readonly windowSeasons: number;
  readonly halfLifeSeasons?: number;
  /** Id of the label on the same measure in the other direction (N2.8.1 rule 7). */
  readonly opposes?: string;
  /** Personal or harmful conduct: never formed for an imported real person (N2.8.1 rule 8). */
  readonly personal?: boolean;
  readonly consumers: readonly string[];
}

/** Field names that would carry truth data into a query (X1.2.2 rule 5, X2.2.1 rule 2). */
export const TRUTH_FIELD_NAMES: readonly string[] = ['traitBlock', 'traits', 'facets', 'values', 'goals', 'truth', 'hidden', 'potential', 'attributes'];

export function minSampleOf(d: LabelDef): number {
  if (d.minSample !== undefined) return d.minSample;
  switch (d.kind) {
    case 'game_management': return P.minGameManagement;
    case 'play_calling': return P.minPlayCalling;
    case 'performance': return P.minPerformance;
    case 'conduct': return P.minConduct;
  }
}

export function halfLifeOf(d: LabelDef): number {
  if (d.halfLifeSeasons !== undefined) return d.halfLifeSeasons;
  return d.kind === 'performance' ? P.halfLifeForm : d.kind === 'conduct' ? P.halfLifeConduct : P.halfLifeTendency;
}

export function thresholdOnOf(d: LabelDef): number { return d.thresholdOn ?? P.zMild; }
export function thresholdOffOf(d: LabelDef): number { return d.thresholdOff ?? P.zOffDefault; }

/** Problems with a definition; the content build fails on any (X2.2.1 acceptance). */
export function labelDefProblems(d: LabelDef, knownTypes?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const p = (m: string) => out.push(`label ${d.id}: ${m}`);
  if (!/^[a-z][a-z0-9_]*$/.test(d.id)) p('id must be lower case with underscores');
  if (!d.consumers.length) p('no consumer (X2.2.1 rule 1)');
  if (!d.appliesTo.length) p('applies to nothing');
  if (!d.positive.types.length) p('positive evidence lists no event type');
  if (!d.negative.types.length) p('negative evidence (the exposure) lists no event type');
  if (d.windowSeasons <= 0) p('window must be positive');
  if (halfLifeOf(d) <= 0) p('half-life must be positive');
  if (minSampleOf(d) <= 0) p('minimum sample must be positive');
  if (thresholdOffOf(d) >= thresholdOnOf(d)) p('thresholdOff must sit nearer the baseline than thresholdOn (X2.2.2 rule 2)');
  for (const m of [d.positive, d.negative]) {
    for (const k of Object.keys(m.payloadEquals ?? {})) if (TRUTH_FIELD_NAMES.includes(k)) p(`query reads truth field ${k} (X1.2.2 rule 5)`);
    if (m.actorRole !== undefined && m.actorRole !== null && TRUTH_FIELD_NAMES.includes(m.actorRole)) p(`query reads truth field ${m.actorRole}`);
    if (knownTypes) for (const t of m.types) if (!knownTypes.has(t)) p(`event type ${t} is not registered`);
  }
  if (d.subjectBy === 'actor' && !d.positive.actorRole) p('an actor label must name the actor role of its evidence');
  return out;
}

/** Stable key of a match, used as the counter key in compaction summaries (X2.4.1 rule 5). */
export function matchKey(m: EventMatch): string {
  const eq = Object.keys(m.payloadEquals ?? {}).sort().map((k) => `${k}=${JSON.stringify(m.payloadEquals![k])}`).join('&');
  return `n|${[...m.types].sort().join(',')}|${m.actorRole ?? ''}|${eq}`;
}

/** Counter specs for league history compaction: every count the given labels read. */
export function countersFor(defs: readonly LabelDef[]): { key: string; types: string[]; actorRole: string | null; payloadEquals: Record<string, Scalar> }[] {
  const seen = new Map<string, { key: string; types: string[]; actorRole: string | null; payloadEquals: Record<string, Scalar> }>();
  for (const d of defs) for (const m of [d.positive, d.negative]) {
    if (!m.types.length) continue;
    const key = matchKey(m);
    if (!seen.has(key)) seen.set(key, { key, types: [...m.types], actorRole: m.actorRole ?? null, payloadEquals: { ...(m.payloadEquals ?? {}) } });
  }
  return [...seen.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export const SUMMARY_TYPE = 'history_summary';

/** Whether a detail row matches a query for `subject`. */
export function rowMatches(m: EventMatch, by: LabelDef['subjectBy'], subject: number, e: WorldEvent): boolean {
  if (!m.types.includes(e.type)) return false;
  for (const [k, v] of Object.entries(m.payloadEquals ?? {})) if (e.payload[k] !== v) return false;
  return subjectMatches(m, by, subject, e);
}

function subjectMatches(m: EventMatch, by: LabelDef['subjectBy'], subject: number, e: WorldEvent): boolean {
  if (by === 'team') return e.where.teamId === subject && (!m.actorRole || e.actors.some((a) => a.role === m.actorRole));
  return e.actors.some((a) => a.personId === subject && (!m.actorRole || a.role === m.actorRole));
}

/**
 * How many rows of `m` a row stands for, for `subject`: 1 or 0 for a detail row; the stored counter for a
 * compaction summary; null when a summary lacks the counter (the span has no evidence for this label).
 */
export function matchCount(m: EventMatch, by: LabelDef['subjectBy'], subject: number, e: WorldEvent): number | null {
  if (e.type !== SUMMARY_TYPE) return rowMatches(m, by, subject, e) ? 1 : 0;
  const of = e.payload['of_type'];
  if (typeof of !== 'string' || !m.types.includes(of) || !subjectMatches(m, by, subject, e)) return 0;
  const n = e.payload[matchKey(m)];
  return typeof n === 'number' ? n : null;
}
