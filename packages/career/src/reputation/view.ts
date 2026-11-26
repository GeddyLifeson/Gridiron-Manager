// Reputation held by observers (X2.3.1) and the book on the coach with its lag and error (E5.3.1, E5.3.2).
// A view is computed on demand and never stored. It joins what an observer can know: the audience standing
// he belongs to (E5.1), his own memories of the subject (X6), his relationship edge with the subject (X7)
// and the label entries the label engine gives him (N2.8, models/src/labels `observerView`). `career` may
// not import `models` (P1.2.1), so label entries arrive as plain data in the shape below.
import type { MemoryRow, RelationshipEdge } from '@gm/schema';
import { paramWith, type Overrides } from './params.ts';

/** A label entry as models/src/labels `ViewEntry` gives it (structural copy). */
export interface LabelEntry {
  readonly labelId: string;
  readonly basis: 'record' | 'observer';
  readonly held: boolean;
  readonly weight: number;
  readonly result: { readonly evidenceIds: readonly number[] };
}

export interface ViewLine {
  readonly kind: 'audience' | 'memory' | 'relationship' | 'label';
  readonly basis: 'public' | 'first_hand';
  /** For labels, the label id; otherwise the audience or edge kind. */
  readonly what: string;
  readonly weight: number;
  /** The rows this line rests on, for "what the view rests on" (X2.3.1). */
  readonly evidenceIds: readonly number[];
}

export interface ObserverView {
  readonly observerId: number;
  readonly subjectId: number;
  /** The audience value he starts from (E5.1.1 rule 2). */
  readonly publicValue: number;
  /** His own opinion from memories and the edge, 0 to 100, or null if he has none. */
  readonly firstHandValue: number | null;
  /** First-hand outweighs public 2 to 1 where both exist (X2.3.1 rule 2). */
  readonly value: number;
  readonly lines: readonly ViewLine[];
}

export interface ViewInput {
  readonly observerId: number;
  readonly subjectId: number;
  /** Effective value of the audience the observer belongs to (`standing(...).effective`). */
  readonly audienceValue: number;
  readonly audience: string;
  /** All of the observer's memory rows; only those about the subject are read. */
  readonly memories: readonly MemoryRow[];
  /** Edges between observer and subject in either direction. */
  readonly edges: readonly RelationshipEdge[];
  readonly labels: readonly LabelEntry[];
  readonly params?: Overrides;
}

const SIGN: Readonly<Record<RelationshipEdge['sign'], number>> = { warm: 1, neutral: 0, cold: -1 };

/** One observer's view of a subject (X2.3.1 rules 1, 2, 4 and 5). */
export function observerStanding(v: ViewInput): ObserverView {
  const p = paramWith(v.params);
  const n = p('record.neutral');
  const lines: ViewLine[] = [{ kind: 'audience', basis: 'public', what: v.audience, weight: 1, evidenceIds: [] }];
  const mems = v.memories.filter((m) => m.holderId === v.observerId && m.aboutPersonId === v.subjectId);
  const edges = v.edges.filter((e) => (e.a === v.observerId && e.b === v.subjectId) || (e.a === v.subjectId && e.b === v.observerId));
  let first: number | null = null;
  if (mems.length || edges.length) {
    let shift = 0;
    for (const m of mems) {
      const s = m.sign * m.strength * p('view.memoryScale');
      shift += s;
      lines.push({ kind: 'memory', basis: 'first_hand', what: m.category, weight: s, evidenceIds: [m.eventId] });
    }
    for (const e of edges) {
      const s = SIGN[e.sign] * e.strength * p('view.edgeScale');
      shift += s;
      lines.push({ kind: 'relationship', basis: 'first_hand', what: e.kind, weight: s, evidenceIds: e.basisEventIds });
    }
    first = Math.min(p('record.regardMax'), Math.max(p('record.regardMin'), n + shift));
  }
  for (const l of v.labels) {
    lines.push({ kind: 'label', basis: l.basis === 'observer' ? 'first_hand' : 'public', what: l.labelId, weight: l.held ? l.weight : 0, evidenceIds: l.result.evidenceIds });
  }
  const r = p('view.firstHandRatio');
  const value = first === null ? v.audienceValue : (r * first + v.audienceValue) / (r + 1);
  return { observerId: v.observerId, subjectId: v.subjectId, publicValue: v.audienceValue, firstHandValue: first, value, lines };
}

/** A label's held state in one copy (public or full record). */
export interface LabelState { readonly labelId: string; readonly held: boolean }

export type MislabelFlag = 'not_seen_by_public' | 'no_longer_matches';

/** E5.3.2: labels where the public copy differs from the full-record copy. */
export function mislabels(publicCopy: readonly LabelState[], fullCopy: readonly LabelState[]): { labelId: string; flag: MislabelFlag }[] {
  const pub = new Map(publicCopy.map((l) => [l.labelId, l.held] as const));
  const full = new Map(fullCopy.map((l) => [l.labelId, l.held] as const));
  const out: { labelId: string; flag: MislabelFlag }[] = [];
  for (const id of [...new Set([...pub.keys(), ...full.keys()])].sort()) {
    const ph = pub.get(id) ?? false;
    const fh = full.get(id) ?? false;
    if (fh && !ph) out.push({ labelId: id, flag: 'not_seen_by_public' });
    if (ph && !fh) out.push({ labelId: id, flag: 'no_longer_matches' });
  }
  return out;
}

/** Each hiring party's copy of a coach's labels (E5.3.2 rule 3), keyed by party person id. */
export type PartyCopies = ReadonlyMap<number, readonly LabelState[]>;

export interface ReferenceCall {
  readonly partyId: number;
  readonly contactId: number;
  /** Strength of the party's edge to the contact (the party must trust him). */
  readonly partyTrust: number;
  /** Labels the contact can vouch for: those covering seasons he shared with the coach. */
  readonly vouchFor: readonly string[];
  /** The full-record copy. */
  readonly full: readonly LabelState[];
}

/**
 * E5.3.2 rule 3: a willing contact with the full record replaces the party's copy of the labels he can vouch
 * for. Only that party's copy changes. Returns the copies unchanged when the contact is not trusted enough.
 */
export function referenceCall(copies: PartyCopies, call: ReferenceCall, o?: Overrides): Map<number, readonly LabelState[]> {
  const out = new Map(copies);
  if (call.partyTrust < paramWith(o)('reference.minStrength')) return out;
  const vouch = new Set(call.vouchFor);
  const full = new Map(call.full.map((l) => [l.labelId, l.held] as const));
  const before = copies.get(call.partyId) ?? [];
  const ids = new Set([...before.map((l) => l.labelId), ...[...vouch].filter((id) => full.has(id))]);
  const next: LabelState[] = [];
  for (const id of [...ids].sort()) {
    const cur = before.find((l) => l.labelId === id)?.held ?? false;
    next.push({ labelId: id, held: vouch.has(id) && full.has(id) ? full.get(id)! : cur });
  }
  out.set(call.partyId, next);
  return out;
}
