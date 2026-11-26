// Compaction (X2.1.3 rule 3, X2.4.1): the one permitted rewrite. Old detail rows of compactable types are
// folded into summary rows that keep every count a registered label query needs. Nothing referenced, notable
// or in a never-compacted family is touched. The result is a new log with fresh season hashes.
import type { WorldEvent } from '@gm/schema';
import { canonicalJson } from './hash.ts';
import { EventLog, reversedIds, type EventLogOptions, type Scalar } from './log.ts';
import { RETAIN_PLAY_SEASONS } from './params.ts';
import { HISTORY_SUMMARY_TYPE, NEVER_COMPACTED_FAMILIES } from './registry.ts';

/**
 * A count the summaries must keep (X2.4.1 rule 5). Label engines hand these in (models/src/labels
 * `countersFor`); `key` is theirs and is written into the summary payload as given. A row counts when its
 * type is listed, it has an actor with `actorRole` (if set), and every `payloadEquals` field matches.
 * `sumFields` are payload numbers summed into `<key>|sum|<field>`.
 */
export interface CounterSpec {
  readonly key: string;
  readonly types: readonly string[];
  readonly actorRole?: string | null;
  readonly payloadEquals?: Readonly<Record<string, Scalar>>;
  readonly sumFields?: readonly string[];
}

export interface CompactOptions {
  /** Season being played now; rows older than `currentYear - retainSeasons` may fold. */
  readonly currentYear: number;
  readonly retainSeasons?: number;
  /** Ids referenced by a memory row (X6) or anything else that must stay. */
  readonly keepIds?: ReadonlySet<number>;
  /** X4 keep line: rows with notability above it stay. Null keeps nothing extra. */
  readonly notabilityKeepLine?: number | null;
  readonly counters: readonly CounterSpec[];
}

export interface CompactionReport {
  readonly foldedRows: number;
  readonly summaryRows: number;
  readonly before: number;
  readonly after: number;
}

/** Whether a row counts toward a counter. */
export function counterMatches(c: CounterSpec, e: WorldEvent): boolean {
  if (!c.types.includes(e.type)) return false;
  if (c.actorRole && !e.actors.some((a) => a.role === c.actorRole)) return false;
  for (const [k, v] of Object.entries(c.payloadEquals ?? {})) if (e.payload[k] !== v) return false;
  return true;
}

export function sumKey(counterKey: string, field: string): string { return `${counterKey}|sum|${field}`; }

/** Rows that may fold under the options (X2.4.1 rule 4). */
export function foldableIds(rows: readonly WorldEvent[], opts: EventLogOptions & CompactOptions): Set<number> {
  const retain = opts.retainSeasons ?? RETAIN_PLAY_SEASONS;
  const cutoff = opts.currentYear - retain;
  const reversed = reversedIds(rows);
  const cand = new Set<number>();
  for (const r of rows) {
    const def = opts.registry.get(r.type);
    if (!def || !def.compactable || NEVER_COMPACTED_FAMILIES.includes(def.family)) continue;
    if (r.when.date.seasonYear >= cutoff) continue;
    if (opts.keepIds?.has(r.id) || reversed.has(r.id)) continue;
    const line = opts.notabilityKeepLine;
    if (line !== null && line !== undefined && r.notability !== null && r.notability > line) continue;
    cand.add(r.id);
  }
  // A row referenced by a kept row's cause stays; repeat until stable, since keeping one can keep its cause.
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rows) if (!cand.has(r.id) && r.causeId !== null && cand.delete(r.causeId)) changed = true;
  }
  return cand;
}

function groupKey(e: WorldEvent): string {
  const actors = [...e.actors].map((a) => `${a.personId}:${a.role}`).sort().join(',');
  return canonicalJson([e.when.date.seasonYear, e.type, e.competitionId, e.where.teamId, actors, e.witnesses]);
}

/**
 * Fold old detail into summary rows. A summary takes the id and date of the last row it folds, and the
 * actors, team, competition and witnesses its rows share; its payload holds `of_type`, `count`, `first_id`,
 * `last_id`, and each counter's count and sums.
 */
export function compactRows(rows: readonly WorldEvent[], opts: EventLogOptions & CompactOptions): { rows: WorldEvent[]; report: CompactionReport } {
  const fold = foldableIds(rows, opts);
  const groups = new Map<string, WorldEvent[]>();
  for (const r of rows) if (fold.has(r.id)) { const k = groupKey(r); const g = groups.get(k); if (g) g.push(r); else groups.set(k, [r]); }
  const summaryAt = new Map<number, WorldEvent>();
  for (const g of groups.values()) {
    const first = g[0]!;
    const lastRow = g[g.length - 1]!;
    const payload: Record<string, Scalar> = { of_type: first.type, count: g.length, first_id: first.id, last_id: lastRow.id };
    for (const c of opts.counters) {
      // Written whenever the counter covers this type, zero included, so a missing key means only that the
      // counter was registered after the fold (X2.4.1 rule 5).
      if (!c.types.includes(first.type)) continue;
      const hits = g.filter((e) => counterMatches(c, e));
      payload[c.key] = hits.length;
      for (const f of c.sumFields ?? []) {
        let s = 0;
        for (const e of hits) { const v = e.payload[f]; if (typeof v === 'number') s += v; }
        payload[sumKey(c.key, f)] = s;
      }
    }
    let tier = first.tier;
    for (const e of g) if (e.tier > tier) tier = e.tier;
    summaryAt.set(lastRow.id, {
      id: lastRow.id,
      type: HISTORY_SUMMARY_TYPE,
      when: { date: lastRow.when.date, period: null, clockTenths: null },
      competitionId: first.competitionId,
      where: first.where,
      actors: first.actors,
      subjects: [],
      payload,
      witnesses: first.witnesses,
      causeId: null,
      notability: null,
      tier,
      source: first.source,
    });
  }
  const out: WorldEvent[] = [];
  for (const r of rows) {
    const s = summaryAt.get(r.id);
    if (s) out.push(s);
    else if (!fold.has(r.id)) out.push(r);
  }
  return { rows: out, report: { foldedRows: fold.size, summaryRows: summaryAt.size, before: rows.length, after: out.length } };
}

/** Compact a log into a new log (fresh season hashes). The old log is left as it was. */
export function compactLog(log: EventLog, opts: EventLogOptions & CompactOptions): { log: EventLog; report: CompactionReport } {
  const { rows, report } = compactRows(log.rows(), opts);
  return { log: EventLog.fromRows(rows, opts), report };
}
