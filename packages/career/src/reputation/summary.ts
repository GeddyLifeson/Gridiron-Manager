// The career summary (E5.5.2, S11.3.1): one honest page built only from records. It gives no overall score,
// grade, level or rank for the person (rule 1); comparisons are of records. Every line names the rows it
// came from (rule 2). Money, family and health appear only for the user's own coach (rule 3) and never for
// an imported real person (rule 4); other coaches show public money events only, supplied by the caller.
import type { Totals } from './career.ts';
import { games, winShare } from './career.ts';
import type { TreeView } from './tree.ts';
import type { Outlook } from './honours.ts';

export interface SummaryLine {
  readonly textKey: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly sourceIds: readonly number[];
}

export type SectionId = 'record' | 'honours' | 'book' | 'tree' | 'decisions' | 'time' | 'family' | 'money' | 'standing';
export const PRIVATE_SECTIONS: ReadonlySet<SectionId> = new Set(['time', 'family', 'money']);

export interface SummaryInput {
  readonly personId: number;
  readonly origin: 'generated' | 'designed' | 'imported' | 'user';
  /** True when the summary is the user's own coach (rule 3). */
  readonly ownCoach: boolean;
  /** Head coach totals per level key. */
  readonly recordByLevel: ReadonlyMap<string, Totals>;
  /** Award event ids with their kind. */
  readonly honours: readonly { readonly eventId: number; readonly awardKind: string; readonly seasonYear: number }[];
  /** Labels that held longest, from the label engine (E5.3.1), with their evidence. */
  readonly book: readonly { readonly labelId: string; readonly evidenceIds: readonly number[] }[];
  readonly tree: TreeView | null;
  /** Best and worst rated decisions (N3), by decision event id. */
  readonly decisions: readonly { readonly eventId: number; readonly verdict: 'best' | 'worst' }[];
  /** Records held: category, level key, rank, with the table's evidence ids. */
  readonly standing: readonly { readonly category: string; readonly level: string; readonly rank: number; readonly sourceIds: readonly number[] }[];
  readonly hall: { readonly outlook: Outlook } | null;
  /** Lines written by other modules (E6.12.2 money, E7 hours, E8 household). Dropped where not allowed. */
  readonly privateLines: Readonly<Partial<Record<'time' | 'family' | 'money', readonly SummaryLine[]>>>;
  /** Public money events for other coaches (E6.12.1 privacy rule). */
  readonly publicMoneyLines?: readonly SummaryLine[];
}

export interface CareerSummary {
  readonly personId: number;
  readonly sections: ReadonlyMap<SectionId, readonly SummaryLine[]>;
}

export function buildSummary(s: SummaryInput): CareerSummary {
  const sections = new Map<SectionId, SummaryLine[]>();
  const add = (id: SectionId, l: SummaryLine) => sections.set(id, [...(sections.get(id) ?? []), l]);
  for (const [level, t] of [...s.recordByLevel.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    add('record', {
      textKey: 'summary.record.level',
      params: { level, wins: t.wins, losses: t.losses, ties: t.ties, games: games(t), winShareThousandths: Math.round(winShare(t) * 1000), postseasonWins: t.postseasonWins, titles: t.titles },
      sourceIds: t.gameIds,
    });
  }
  for (const h of s.honours) add('honours', { textKey: 'summary.honour', params: { awardKind: h.awardKind, seasonYear: h.seasonYear }, sourceIds: [h.eventId] });
  for (const b of s.book) add('book', { textKey: 'summary.book.label', params: { labelId: b.labelId }, sourceIds: b.evidenceIds });
  if (s.tree) {
    const c = s.tree.counts;
    add('tree', { textKey: 'summary.tree.counts', params: { placed: c.placed, coordinators: c.coordinators, headCoaches: c.headCoaches }, sourceIds: s.tree.pupils.map((p) => p.edge.pupilId) });
  }
  for (const d of s.decisions) add('decisions', { textKey: `summary.decision.${d.verdict}`, params: {}, sourceIds: [d.eventId] });
  for (const r of s.standing) add('standing', { textKey: 'summary.standing.rank', params: { category: r.category, level: r.level, rank: r.rank }, sourceIds: r.sourceIds });
  if (s.hall) add('standing', { textKey: `summary.hall.${s.hall.outlook}`, params: {}, sourceIds: [] });
  const privateAllowed = s.ownCoach && s.origin !== 'imported';
  if (privateAllowed) {
    for (const id of ['time', 'family', 'money'] as const) for (const l of s.privateLines[id] ?? []) add(id, l);
  } else if (s.origin !== 'imported') {
    for (const l of s.publicMoneyLines ?? []) add('money', l);
  }
  return { personId: s.personId, sections };
}

/** E5.5.2 acceptance: lines with no source rows (only the hall outlook is computed, from linked records). */
export function unsourcedLines(c: CareerSummary): SummaryLine[] {
  const out: SummaryLine[] = [];
  for (const [id, lines] of c.sections) for (const l of lines) if (l.sourceIds.length === 0 && !(id === 'standing' && l.textKey.startsWith('summary.hall.'))) out.push(l);
  return out;
}
