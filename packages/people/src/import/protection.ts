// The protection rule for imported real people (A6.3.1, X14.1, D13.6.2, Q1.6.2).
// Two independent barriers, as X14.1.2 rule 2 requires:
//   1. Generators filter protected people out of their candidate lists first (`withoutProtected`).
//   2. The X2.1.1 emit check refuses any event of a type that is not `importedAllowed` with a protected
//      actor or person subject. The emit function is G-22's EventLog; it calls `mayReceiveEvent` through an
//      `originOf` lookup, which `originLookup` builds here. `EmitGuard` is the same check for callers that
//      want the refusal counted as a generator bug (X14.1.3 debug report).
// A third check, the text scan, covers Q1.6.2's "zero protected-topic text" and X14.1.2 rule 4 (no quotes).
import { mayReceiveEvent, type EventTypeDef, type PersonOrigin, type PersonRecord, type WorldEvent } from '@gm/schema';
import { protectedTypeOf } from '../pack/index.ts';

/** True for a person the protection rule covers. `origin` is set at creation and never returns to generated (X14.1.1 rule 1). */
export function isProtected(p: { origin: PersonOrigin }): boolean {
  return p.origin === 'imported';
}

/** First barrier (X14.1.2 rule 2): a generator that picks people for an excluded event drops protected people first. */
export function withoutProtected<T extends { origin: PersonOrigin }>(candidates: readonly T[]): T[] {
  return candidates.filter((c) => !isProtected(c));
}

/** Same, for generators that hold ids: `originOf` answers for every id in the world. */
export function idsWithoutProtected(ids: readonly number[], originOf: (id: number) => PersonOrigin | undefined): number[] {
  return ids.filter((id) => originOf(id) !== 'imported');
}

/** The `originOf` option for G-22's EventLog (second barrier). Unknown ids answer undefined and pass, as G-22 documents. */
export function originLookup(people: Iterable<Pick<PersonRecord, 'id' | 'origin'>>): (personId: number) => PersonOrigin | undefined {
  const m = new Map<number, PersonOrigin>();
  for (const p of people) m.set(p.id, p.origin);
  return (id) => m.get(id);
}

/** Person ids named on an event as actor or person subject (X2.1.1). */
export function eventPersonIds(e: Pick<WorldEvent, 'actors' | 'subjects'>): number[] {
  const ids = e.actors.map((a) => a.personId);
  for (const s of e.subjects) if (s.kind === 'person') ids.push(s.id);
  return [...new Set(ids)].sort((a, b) => a - b);
}

export interface Refusal { type: string; personId: number; reason: string }

/**
 * The emit check with a refusal counter (X14.1.2 outputs, X14.1.3). A refusal means a generator skipped the
 * first barrier, so each one is kept as a bug report. An unknown type is refused for protected people.
 */
export class EmitGuard {
  readonly refusals: Refusal[] = [];
  constructor(private readonly originOf: (id: number) => PersonOrigin | undefined, private readonly typeOf: (id: string) => Pick<EventTypeDef, 'importedAllowed'> | undefined) {}

  check(e: Pick<WorldEvent, 'type' | 'actors' | 'subjects'>): boolean {
    const def = this.typeOf(e.type);
    for (const pid of eventPersonIds(e)) {
      const origin = this.originOf(pid);
      if (origin && !mayReceiveEvent({ origin }, def)) {
        this.refusals.push({ type: e.type, personId: pid, reason: def ? `type ${e.type} is not imported_allowed (A6.3.1)` : `type ${e.type} has no audited definition (X14.1.3 rule 1)` });
        return false;
      }
    }
    return true;
  }

  get refusalCount(): number { return this.refusals.length; }
}

/** X14.4.2 rule 3: ids of events dated before the career start that name an imported person. Must be empty. */
export function historyRunViolations(events: readonly Pick<WorldEvent, 'id' | 'when' | 'actors' | 'subjects'>[], importedIds: ReadonlySet<number>, careerStart: { seasonYear: number; dayIndex: number }): number[] {
  const before = (d: { seasonYear: number; dayIndex: number }) => d.seasonYear < careerStart.seasonYear || (d.seasonYear === careerStart.seasonYear && d.dayIndex < careerStart.dayIndex);
  return events.filter((e) => before(e.when.date) && eventPersonIds(e).some((id) => importedIds.has(id))).map((e) => e.id);
}

/** World creation fails loudly if the history scan finds an imported person (X14.4.2 acceptance). */
export function assertHistoryClean(...args: Parameters<typeof historyRunViolations>): void {
  const bad = historyRunViolations(...args);
  if (bad.length > 0) throw new Error(`history run wrote ${bad.length} event(s) naming an imported person (X14.4.2): ids ${bad.slice(0, 10).join(', ')}`);
}

// ---- X14.1.3 audited list ----

/** One row of `content/events/imported_audit.yaml` (X14.1.3 inputs), already parsed. */
export interface AuditRow {
  /** Event type id or label id. */
  id: string;
  kind: 'event' | 'label';
  importedAllowed: boolean;
  reviewer: string;
  /** ISO date the row was reviewed, as text. */
  date: string;
  reason: string;
  /** Hash of the type or label file the row reviewed (rule 2). */
  fileHash: string;
}

export interface AuditProblem { id: string; code: 'missing_row' | 'stale_row' | 'no_reason' | 'harm_allowed' | 'no_reviewer'; message: string }

/**
 * X14.1.3 build check. Every event type and label has a row; an allowed row states a reason; a changed file
 * invalidates its row; a personal or harmful type can never be allowed. `hashOf` returns the current file hash.
 */
export function auditProblems(
  types: readonly Pick<EventTypeDef, 'id' | 'harmClass'>[], labels: readonly string[], rows: readonly AuditRow[], hashOf: (kind: 'event' | 'label', id: string) => string,
): AuditProblem[] {
  const out: AuditProblem[] = [];
  const byKey = new Map(rows.map((r) => [`${r.kind}:${r.id}`, r]));
  const check = (kind: 'event' | 'label', id: string, harm?: string) => {
    const r = byKey.get(`${kind}:${id}`);
    if (!r) { out.push({ id, code: 'missing_row', message: `${kind} ${id} has no audit row; it is treated as not imported_allowed and fails the release build (X14.1.3 rule 1)` }); return; }
    if (!r.reviewer.trim()) out.push({ id, code: 'no_reviewer', message: `${kind} ${id}: audit row names no reviewer` });
    if (r.importedAllowed && !r.reason.trim()) out.push({ id, code: 'no_reason', message: `${kind} ${id}: allowed without a stated reason (X14.1.3 rule 2)` });
    if (r.fileHash !== hashOf(kind, id)) out.push({ id, code: 'stale_row', message: `${kind} ${id}: file changed since review; re-review needed (X14.1.3 rule 2)` });
    if (r.importedAllowed && (harm === 'personal' || harm === 'harmful')) out.push({ id, code: 'harm_allowed', message: `event ${id}: harm class ${harm} can never be imported_allowed (X2.1.2 rule 3)` });
  };
  for (const t of types) check('event', t.id, t.harmClass);
  for (const l of labels) check('label', l);
  return out;
}

/** Run-time answer for one id: a type with no valid audit row is not allowed (X14.1.3 rule 1). */
export function auditedAllowed(rows: readonly AuditRow[], kind: 'event' | 'label', id: string, currentHash: string): boolean {
  const r = rows.find((x) => x.kind === kind && x.id === id);
  return !!r && r.importedAllowed && r.fileHash === currentHash && r.reason.trim().length > 0;
}

// ---- X14.1.1 neutral hidden state ----

/** Goals an imported person may hold (X14.1.1 rule 2): only `role_neutral` goals. */
export const ROLE_NEUTRAL_GOALS: readonly string[] = ['start_at_position', 'win_championship'];

/** Keys that would carry a hidden off-field risk or a faith value; never stored on an imported person (X14.1.1 rules 2 and 3). */
const OFF_FIELD_KEYS = /risk|off_field|conduct|faith/i;

/** X14.1.1 acceptance: an imported person carries a neutral block and no off-field risk. Empty when clean. */
export function neutralityProblems(p: PersonRecord): string[] {
  if (!isProtected(p)) return [];
  const out: string[] = [];
  const t = p.traitBlock;
  if (t.source !== 'imported_neutral') out.push(`person ${p.id}: trait block source ${t.source}, not imported_neutral`);
  for (const [k, v] of Object.entries(t.facets)) if (v !== 50) out.push(`person ${p.id}: facet ${k} = ${v}, not neutral 50`);
  for (const [k, v] of Object.entries(t.values)) if (v !== 0) out.push(`person ${p.id}: value ${k} = ${v}, not neutral 0`);
  if ('faith' in t.values || 'faith' in t.facets) out.push(`person ${p.id}: faith is stored (X14.1.1 rule 2)`);
  for (const g of t.goals) if (!ROLE_NEUTRAL_GOALS.includes(g.goalId)) out.push(`person ${p.id}: goal ${g.goalId} is not role neutral`);
  for (const k of Object.keys(p.playing?.hidden ?? {})) if (OFF_FIELD_KEYS.test(k)) out.push(`person ${p.id}: hidden key ${k} looks like an off-field value (X14.1.1 rule 3)`);
  for (const k of Object.keys(p.coaching?.hidden ?? {})) if (OFF_FIELD_KEYS.test(k)) out.push(`person ${p.id}: coaching key ${k} looks like an off-field value`);
  return out;
}

// ---- Q1.6.2 text scan ----

export interface TextFinding { name: string; kind: 'protected_topic' | 'quotation'; topic?: string; sentence: string }

/** Splits rendered text into sentences (full stop, question mark, exclamation mark or line break). */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Scans generated text for any sentence that names a protected person (full name, or last name when
 * `matchLastName`) and either touches a protected topic (A6.3.1 list, the pack's content file) or carries a
 * quotation (X14.1.2 rule 4: no generated quote attributed to a protected person). Q1.6.2 needs zero findings.
 */
export function scanProtectedText(text: string, protectedNames: readonly { first: string; last: string }[], opts: { matchLastName?: boolean } = {}): TextFinding[] {
  const out: TextFinding[] = [];
  const names = protectedNames.map((n) => ({ full: `${n.first} ${n.last}`, last: n.last }));
  for (const s of sentences(text)) {
    for (const n of names) {
      const hit = s.includes(n.full) || (opts.matchLastName === true && new RegExp(`\\b${n.last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s));
      if (!hit) continue;
      const topic = protectedTypeOf(s);
      if (topic) out.push({ name: n.full, kind: 'protected_topic', topic, sentence: s });
      if (/["“”]/.test(s)) out.push({ name: n.full, kind: 'quotation', sentence: s });
    }
  }
  return out;
}
