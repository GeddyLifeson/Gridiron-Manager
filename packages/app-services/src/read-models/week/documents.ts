// Game-week documents read model (H9.1.1 "What the user sees": a Documents panel listing each document
// with its state, author, due time and recipients; he can assign an author, review and approve, send back
// with a note, or write it himself. H9.1.2: a workload bar per staff member, hours assigned against hours
// available). Built only through the week module's `panel`, which strips quality and seeded errors (K9).
import { calendar, week as wk } from '@gm/league';
import type { DocAction, DocumentRowView, DocumentsView, WorkloadView } from './types.ts';

export interface DocumentsInput {
  readonly weekId: string;
  readonly docs: readonly wk.Document[];
  readonly now: calendar.Instant;
  /** H9.1.1 rule 6: at the lowest detail the panel shows only late or sent-back documents. */
  readonly detail: 'all' | 'exceptions';
  readonly sentBack?: ReadonlySet<string>;
  /** Hours each author has free this week (K6, L4, E7 for the user). Missing authors show no bar limit. */
  readonly available?: Readonly<Record<string, number>>;
}

const TYPES = new Map(wk.DOC_TYPES.map((t) => [t.id, t]));

/** What the user may do with a document in its state (H9.1.1, H9.1.2). */
export function docActions(state: string): DocAction[] {
  switch (state) {
    case 'not_started': return ['assign', 'write'];
    case 'draft': return ['assign', 'write', 'review'];
    case 'in_review': return ['review', 'approve', 'send_back'];
    case 'published': return ['open', 'write'];
    default: return ['open'];
  }
}

const OPEN_STATES: ReadonlySet<string> = new Set(['not_started', 'draft', 'in_review']);

export function buildDocumentsView(i: DocumentsInput): DocumentsView {
  const sent = i.sentBack ?? new Set<string>();
  const shown = wk.panel(i.docs, i.now, i.detail, sent);
  const rows: DocumentRowView[] = shown.map((d) => {
    const t = TYPES.get(d.type);
    return {
      id: d.id, type: d.type, leaf: t?.owner ?? 'H9', state: d.state, author: d.author, reviewer: d.reviewer,
      due: `${calendar.iso(d.dueAt.day)} ${calendar.formatTime(d.dueAt.minute)}`,
      recipients: t?.recipients ?? [], playersSee: t?.playersSee ?? false, late: d.late, sentBack: sent.has(d.id),
      version: d.version, hours: d.hours, actions: docActions(d.state),
    };
  });
  const assigned = new Map<string, number>();
  for (const d of i.docs) if (OPEN_STATES.has(d.state)) assigned.set(d.author, (assigned.get(d.author) ?? 0) + d.hours);
  const workload: WorkloadView[] = [...assigned.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([author, hours]) => {
    const available = i.available?.[author] ?? null;
    return { author, assigned: hours, available, over: available !== null && hours > available };
  });
  return { weekId: i.weekId, detail: i.detail, rows, hidden: i.docs.length - rows.length, workload };
}
