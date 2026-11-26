// The dynamic information audit (K9.3.2) and the swap test (Q1.4.1 check 2): build pairs of worlds
// that differ in exactly one hidden fact and require that nothing an observer-bound process produces
// changes. The fact list is not written by hand: it is everything the observer filter withholds from
// that observer, grouped by table and field. A new hidden field is therefore audited the day it is
// added to the contract (K9.3.2 rule 4).
import { WORLD_TABLES } from '@gm/schema';
import { filterRows, filterValue, newReport } from '../filter.ts';
import { tableSchema } from '../observed-world.ts';
import { lookupFrom, type Observer, type TableSource } from '../observer.ts';
import { canonical } from '../schema-walk.ts';
import { mutateWhere, type MutateMode } from './scramble.ts';

export type HiddenReason = 'truth' | 'not_owner' | 'hidden_row';

export interface HiddenFact {
  /** `table:$.schema.path:reason`. */
  readonly id: string;
  readonly table: string;
  readonly schemaPath: string;
  readonly reason: HiddenReason;
  /** A world equal to the base world except for this fact, and how many values differ. */
  apply(): { source: TableSource; changed: number };
}

/** A copy of a source with one table replaced. */
export function withTable(source: TableSource, table: string, rows: readonly unknown[]): TableSource {
  return { rows: (t) => (t === table ? rows : source.rows(t)) };
}

const normalise = (path: string) => path.replace(/\[\d+\]/g, '[]').replace(/\(\d+\)/g, '()').replace(/\{[^}]*\}/g, '{}');
const MODE: Record<HiddenReason, MutateMode> = { truth: 'all', not_owner: 'all', hidden_row: 'private_only' };

/** Every fact of the world this observer may not know, one per table, field and reason (K9.3.2 rule 1). */
export function hiddenFacts(source: TableSource, observer: Observer, tables: readonly string[] = WORLD_TABLES.map((t) => t.table), salt = 1): HiddenFact[] {
  const lookup = lookupFrom(source);
  const facts: HiddenFact[] = [];
  for (const table of tables) {
    const schema = tableSchema(table);
    const rows = source.rows(table);
    const groups = new Map<string, { schemaPath: string; reason: HiddenReason; byRow: Map<number, Set<string>> }>();
    rows.forEach((row, i) => {
      const report = newReport();
      filterValue(schema, row, observer, { lookup, report });
      for (const d of report.dropped) {
        if (d.reason !== 'truth' && d.reason !== 'not_owner' && d.reason !== 'hidden_row') continue;
        const schemaPath = normalise(d.path);
        const id = `${table}:${schemaPath}:${d.reason}`;
        const g = groups.get(id) ?? groups.set(id, { schemaPath, reason: d.reason, byRow: new Map() }).get(id)!;
        (g.byRow.get(i) ?? g.byRow.set(i, new Set()).get(i)!).add(d.path);
      }
    });
    for (const [id, g] of groups) {
      facts.push({
        id, table, schemaPath: g.schemaPath, reason: g.reason,
        apply: () => {
          let changed = 0;
          const next = rows.map((row, i) => {
            const paths = g.byRow.get(i);
            if (!paths) return row;
            const r = mutateWhere(schema, row, (p) => (paths.has(p) ? MODE[g.reason] : null), salt + i);
            changed += r.changed.length;
            return r.value;
          });
          return { source: withTable(source, table, next), changed };
        },
      });
    }
  }
  return facts;
}

export interface Divergence {
  fact: string;
  /** `output`: the process under test changed. `filter`: the filter itself released the changed fact. */
  kind: 'output' | 'filter';
  detail: string;
}

export interface HiddenAuditReport {
  /** Facts that were changed and checked. */
  checked: string[];
  /** Facts whose values the mutator could not change (nulls, ids, literals). */
  inert: string[];
  /** Zero is the pass mark (K9.3.2, Q1.4.1). */
  divergences: Divergence[];
}

function firstDifference(a: unknown, b: unknown): string {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (canonical(a[i]) !== canonical(b[i])) return `first difference at index ${i}: ${canonical(a[i]).slice(0, 160)} vs ${canonical(b[i]).slice(0, 160)}`;
  }
  return `${canonical(a).slice(0, 160)} vs ${canonical(b).slice(0, 160)}`;
}

/**
 * Runs `run` on the base world and on one variant per hidden fact. `run` is the process under test,
 * from the raw world to its outputs: the decisions of an AI before the fact could legally be seen,
 * every read model of a screen set, the messages sent to the main thread. Any change is a leak.
 */
export function auditHidden(opts: {
  source: TableSource;
  observer: Observer;
  run: (source: TableSource) => unknown;
  tables?: readonly string[];
  salt?: number;
}): HiddenAuditReport {
  const report: HiddenAuditReport = { checked: [], inert: [], divergences: [] };
  const base = opts.run(opts.source);
  const baseText = canonical(base);
  for (const fact of hiddenFacts(opts.source, opts.observer, opts.tables, opts.salt)) {
    const v = fact.apply();
    if (v.changed === 0) { report.inert.push(fact.id); continue; }
    report.checked.push(fact.id);
    const schema = tableSchema(fact.table);
    const seenBase = canonical(filterRows(schema, opts.source.rows(fact.table), opts.observer, { lookup: lookupFrom(opts.source) }));
    const seenVariant = canonical(filterRows(schema, v.source.rows(fact.table), opts.observer, { lookup: lookupFrom(v.source) }));
    if (seenBase !== seenVariant) report.divergences.push({ fact: fact.id, kind: 'filter', detail: 'the filtered table changed when only this hidden fact changed' });
    const out = opts.run(v.source);
    if (canonical(out) !== baseText) report.divergences.push({ fact: fact.id, kind: 'output', detail: firstDifference(base, out) });
  }
  return report;
}

export interface VisibleFact {
  readonly id: string;
  /** Kind of visible information (a public transaction, a charted tendency, an own estimate). */
  readonly type: string;
  apply(source: TableSource): TableSource;
}

/**
 * The reverse test (K9.3.2 rule 5): changing a fact the observer may know must be able to change the
 * output. Returns the fact types for which no fact changed anything; empty is the pass mark. It
 * guards against an audit that passes because the process ignores everything.
 */
export function auditVisible(opts: { source: TableSource; run: (source: TableSource) => unknown; facts: readonly VisibleFact[] }): string[] {
  const baseText = canonical(opts.run(opts.source));
  const moved = new Set<string>();
  const types = new Set<string>();
  for (const f of opts.facts) {
    types.add(f.type);
    if (canonical(opts.run(f.apply(opts.source))) !== baseText) moved.add(f.type);
  }
  return [...types].filter((t) => !moved.has(t)).sort();
}
