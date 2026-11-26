// Game-week documents (H9): the document object and lifecycle, authors and workload, review,
// distribution, the weekly set, size warnings and the archive. Quality and seeded errors are hidden
// at every rung (H9.1.1 rule 3, K9): `documentView` is the only shape a screen or an AI view reads.
import DOCS from './data/documents.json' with { type: 'json' };
import { compareInstant, instantValue, parseTime, type Instant } from '../calendar/date.ts';
import type { RandomStream } from '@gm/schema';
import { allBlocks } from './build.ts';
import { P } from './params.ts';
import type { Week } from './types.ts';

export const DOC_STATES = ['not_started', 'draft', 'in_review', 'published', 'superseded'] as const;
export type DocState = (typeof DOC_STATES)[number];

export interface DocType {
  readonly id: string;
  readonly owner: string;
  readonly author: string;
  readonly recipients: readonly string[];
  readonly dueG?: number;
  readonly dueAt: string;
  readonly hours: string;
  readonly perPractice?: boolean;
  readonly perGroup?: boolean;
  readonly planScaled?: boolean;
  readonly playersSee: boolean;
  readonly awayOnly?: boolean;
  readonly countableOnly?: boolean;
  readonly cadence?: string;
}

export const DOC_TYPES: readonly DocType[] = DOCS.types as DocType[];

/** H9.1.1 outputs. `quality` and `errors` are truth: never shown, read only by owner categories. */
export interface Document {
  readonly id: string;
  readonly type: string;
  readonly weekId: string;
  readonly author: string;
  readonly reviewer: string | null;
  readonly dueAt: Instant;
  readonly state: DocState;
  readonly version: number;
  readonly quality: number;
  readonly errors: readonly string[];
  readonly recipients: readonly string[];
  readonly contentRef: string | null;
  readonly publishedAt: Instant | null;
  readonly hours: number;
}

export interface WeekDocOptions {
  /** Position groups that get a packet and tip sheet. */
  readonly groups: number;
  /** Plan size relative to the default plan (H9.1.2 rule 1: hours scale with plan size). */
  readonly planScale: number;
  readonly countable: boolean;
  /** This week holds a self-scout report (bye week, then every fourth week). */
  readonly selfScoutDue: boolean;
}

/** Whether the self-scout report falls due: the bye week, then every fourth week after it (H9.1.1 type table). */
export function selfScoutDue(weeksSinceBye: number | null, isBye: boolean): boolean {
  if (isBye) return true;
  if (weeksSinceBye === null || weeksSinceBye <= 0) return false;
  return weeksSinceBye % P('self_scout_every_weeks') === 0;
}

function hoursFor(t: DocType, opts: WeekDocOptions): number {
  let h = P(t.hours);
  if (t.perGroup) h *= opts.groups;
  if (t.planScaled) h *= opts.planScale;
  return h;
}

/** Every game week creates one record of each weekly type for the team (H9.1.1 acceptance 1). */
export function createWeekDocuments(week: Week, opts: WeekDocOptions): Document[] {
  if (!week.kickoff) return [];
  const gameDay = week.kickoff.day;
  const practiceDays = [...new Set(allBlocks(week).filter((b) => b.type === 'practice' || (b.type === 'walkthrough' && b.kind !== undefined && b.kind.startsWith('short'))).map((b) => b.start.day))];
  const out: Document[] = [];
  const make = (t: DocType, suffix: string, due: Instant): Document => ({
    id: `${week.weekId}:${t.id}${suffix}`, type: t.id, weekId: week.weekId, author: t.author, reviewer: null, dueAt: due,
    state: 'not_started', version: 1, quality: 1, errors: [], recipients: t.recipients, contentRef: null, publishedAt: null,
    hours: hoursFor(t, opts),
  });
  for (const t of DOC_TYPES) {
    if (t.awayOnly && week.home) continue;
    if (t.countableOnly && !opts.countable) continue;
    if (t.cadence === 'self_scout' && !opts.selfScoutDue) continue;
    if (t.perPractice) {
      for (const d of practiceDays) out.push(make(t, `@${d}`, { day: d - 1, minute: parseTime(t.dueAt) }));
      continue;
    }
    const g = t.dueG ?? 1;
    out.push(make(t, '', { day: gameDay - g, minute: parseTime(t.dueAt) }));
  }
  return out;
}

const NEXT: Readonly<Record<DocState, readonly DocState[]>> = {
  not_started: ['draft'], draft: ['in_review', 'published'], in_review: ['draft', 'published'], published: ['superseded'], superseded: [],
};

/** Move a document through its lifecycle (H9.1.1 rule 1). Illegal moves throw. */
export function moveDoc(doc: Document, to: DocState, at: Instant): Document {
  if (!NEXT[doc.state].includes(to)) throw new Error(`document ${doc.id}: ${doc.state} cannot become ${to}`);
  return { ...doc, state: to, ...(to === 'published' ? { publishedAt: at } : {}) };
}

/** A new version supersedes the old one (rule 4). The old stays for the record; changed content is marked for re-teaching by H4. */
export function newVersion(doc: Document, at: Instant): { old: Document; next: Document } {
  if (doc.state !== 'published') throw new Error(`document ${doc.id} is not published`);
  const old = moveDoc(doc, 'superseded', at);
  return { old, next: { ...doc, state: 'draft', version: doc.version + 1, publishedAt: null } };
}

/** Only a published document reaches its recipients (rule 1, acceptance 2). */
export function reachesRecipients(doc: Document): boolean { return doc.state === 'published'; }

/** Minutes late at publication, or now if still unpublished (rule 5). */
export function lateness(doc: Document, now?: Instant): number {
  const at = doc.publishedAt ?? now;
  if (!at) return 0;
  return Math.max(0, instantValue(at) - instantValue(doc.dueAt));
}

/** Study time the recipients lose: exactly the lateness (acceptance 3). The consumer (D9) applies it. */
export function studyMinutes(doc: Document, plannedMinutes: number, now?: Instant): number {
  return Math.max(0, plannedMinutes - lateness(doc, now));
}

/** Workload factor on all an author's documents when assigned hours exceed his hours (H9.1.2 rule 2). */
export function loadFactor(assignedHours: number, availableHours: number): number {
  if (assignedHours <= availableHours || assignedHours <= 0) return 1;
  return Math.max(P('doc_quality_floor'), availableHours / assignedHours);
}

/** Hours a review costs the reviewer (rule 3). */
export function reviewHours(doc: Document): number { return doc.hours * P('doc_review_fraction'); }

/** An AI head coach reviews: each seeded error is caught at his hidden rate (rule 3, acceptance 2). */
export function aiReview(doc: Document, catchRate: number, stream: RandomStream): { doc: Document; caught: readonly string[] } {
  const caught = doc.errors.filter(() => stream.chance(catchRate));
  return { doc: { ...doc, errors: doc.errors.filter((e) => !caught.includes(e)) }, caught };
}

/**
 * The user reviews: exactly the lines he marks are caught; a mark on a correct line is a wrong
 * correction and adds an error. No roll is made on his behalf (rule 3, E9.1.3 case 1).
 */
export function userReview(doc: Document, marks: readonly string[]): { doc: Document; caught: readonly string[]; introduced: readonly string[] } {
  const caught = marks.filter((m) => doc.errors.includes(m));
  const introduced = marks.filter((m) => !doc.errors.includes(m)).map((m) => `wrong_fix:${m}`);
  return { doc: { ...doc, errors: [...doc.errors.filter((e) => !caught.includes(e)), ...introduced] }, caught, introduced };
}

/** What anyone outside the owner categories sees of a document: no quality, no error list (K9). */
export interface DocumentView {
  readonly id: string; readonly type: string; readonly author: string; readonly reviewer: string | null;
  readonly dueAt: Instant; readonly state: DocState; readonly version: number; readonly publishedAt: Instant | null;
  readonly late: boolean; readonly hours: number;
}
export function documentView(doc: Document, now: Instant): DocumentView {
  const late = doc.publishedAt ? compareInstant(doc.publishedAt, doc.dueAt) > 0 : compareInstant(now, doc.dueAt) > 0;
  return { id: doc.id, type: doc.type, author: doc.author, reviewer: doc.reviewer, dueAt: doc.dueAt, state: doc.state, version: doc.version, publishedAt: doc.publishedAt, late, hours: doc.hours };
}

/**
 * The documents panel at a detail level (rule 6): at the lowest level the user sees only documents that
 * are late or that a reviewer sent back. It never sorts or filters by hidden quality.
 */
export function panel(docs: readonly Document[], now: Instant, detail: 'all' | 'exceptions', sentBack: ReadonlySet<string> = new Set()): DocumentView[] {
  const views = docs.map((d) => documentView(d, now));
  const shown = detail === 'all' ? views : views.filter((v) => v.late || sentBack.has(v.id));
  return shown.sort((a, b) => compareInstant(a.dueAt, b.dueAt) || (a.id < b.id ? -1 : 1));
}

/** Archive head start for a repeat opponent and play caller (H9.4.1 rule 1), shrinking with turnover 0..1. */
export function archiveSaving(daysSinceLastFaced: number | null, samePlayCaller: boolean, turnover: number): number {
  if (daysSinceLastFaced === null || !samePlayCaller || daysSinceLastFaced > P('archive_window_days')) return 0;
  return P('archive_saving') * (1 - Math.min(1, Math.max(0, turnover)));
}

/** Sourced size ranges used as warnings, not limits (H9.3.3 rule 3; tip sheet H9.2.4 rule 3). */
export function sizeWarnings(s: { callSheet?: number; openingScript?: number; wristband?: number; tipSheetLines?: number }): string[] {
  const w: string[] = [];
  if (s.callSheet !== undefined && (s.callSheet < P('call_sheet_min') || s.callSheet > P('call_sheet_max'))) w.push('call_sheet_size');
  if (s.openingScript !== undefined && (s.openingScript < P('script_min') || s.openingScript > P('script_max'))) w.push('opening_script_size');
  if (s.wristband !== undefined && s.wristband > P('wristband_max')) w.push('wristband_size');
  if (s.tipSheetLines !== undefined && s.tipSheetLines > P('tip_sheet_lines')) w.push('tip_sheet_lines');
  return w;
}

/** After a roster or depth change, call-sheet plays naming inactive players are flagged "check personnel" (H9.3.3 rule 2). */
export function checkPersonnel(sheetPlays: readonly { id: string; players: readonly number[] }[], active: ReadonlySet<number>): string[] {
  return sheetPlays.filter((p) => p.players.some((x) => !active.has(x))).map((p) => p.id);
}
