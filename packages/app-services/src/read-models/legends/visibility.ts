// X3.1.3 public record against what the viewer knows. An event shows if its witness rule is public, the
// viewer witnessed it (the observer filter already passes those rows), or a news item carrying it reached
// him (X12.2.1). News that reached him as rumor shows "Reported" with its source until confirmed (X12.2.2).
// Lines he has no access to are absent, with no placeholder. The same rule serves AI viewers (X2.3.1).
import type { EventRow } from './types.ts';

/** One item of news that reached the viewer, naming the events it carries (X12.2.1). */
export interface Reach {
  readonly eventId: number;
  /** Game date the news reached him. */
  readonly seasonYear: number;
  readonly dayIndex: number;
  /** The person who told him, or null for a published story. */
  readonly sourcePersonId: number | null;
  /** True while the item is a rumor (X12.2.2). */
  readonly rumor: boolean;
}

export type SourceMark =
  | { readonly via: 'public' }
  | { readonly via: 'witnessed' }
  | { readonly via: 'told'; readonly sourcePersonId: number | null; readonly seasonYear: number; readonly dayIndex: number; readonly reported: boolean };

export interface VisibleEvent { readonly event: EventRow; readonly mark: SourceMark }

/**
 * Builds the viewer's visible event list.
 * - `seen`: rows the observer filter passed (public rows and rows he witnessed or acted in).
 * - `lookup`: resolves an event id from the full log, for rows that reached him only as news.
 * - `reaches`: news deliveries to him. A confirmed (non-rumor) delivery beats a rumor of the same event.
 */
export function visibleEvents(seen: readonly EventRow[], reaches: readonly Reach[], lookup: (id: number) => EventRow | undefined): VisibleEvent[] {
  const out = new Map<number, VisibleEvent>();
  for (const e of seen) out.set(e.id, { event: e, mark: e.witnesses.kind === 'public' ? { via: 'public' } : { via: 'witnessed' } });
  // Earliest confirmed delivery wins; a rumor stands only while nothing confirms it.
  const best = new Map<number, Reach>();
  for (const r of reaches) {
    const cur = best.get(r.eventId);
    if (!cur || (cur.rumor && !r.rumor) || (cur.rumor === r.rumor && (r.seasonYear - cur.seasonYear || r.dayIndex - cur.dayIndex) < 0)) best.set(r.eventId, r);
  }
  for (const [id, r] of best) {
    if (out.has(id)) continue;
    const e = lookup(id);
    if (!e) continue;
    out.set(id, { event: e, mark: { via: 'told', sourcePersonId: r.sourcePersonId, seasonYear: r.seasonYear, dayIndex: r.dayIndex, reported: r.rumor } });
  }
  return [...out.values()].sort((a, b) => a.event.id - b.event.id);
}

/** Only the public record, for exports and the "what anyone can look up" view (X3.6.1). */
export const publicOnly = (rows: readonly EventRow[]): EventRow[] => rows.filter((e) => e.witnesses.kind === 'public');
