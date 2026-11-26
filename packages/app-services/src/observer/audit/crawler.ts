// The read-model crawler (Q1.4.2): builds every read model in a world for each observer given and
// runs the four checks of ./truth-scan.ts on them.
import { WORLD_TABLES } from '@gm/schema';
import { tableSchema } from '../observed-world.ts';
import type { Observer, TableSource } from '../observer.ts';
import { param } from '../params.ts';
import { buildReadModel, type BuildOptions, type Params, type ReadModelRegistry } from '../read-model.ts';
import { auditHidden, type Divergence } from './dynamic.ts';
import { findSentinels, plantSentinels, scanSchemas, showTruthSettings, type SchemaHit, type Sentinel, type SentinelHit } from './truth-scan.ts';

export interface CrawlReport {
  /** Read models built: names times parameter sets times observers. */
  built: number;
  schemaHits: SchemaHit[];
  sentinelHits: (SentinelHit & { model: string; observer: string })[];
  divergences: (Divergence & { observer: string })[];
  showTruthSettings: string[];
  /** Builders that threw or returned data their schema refuses. */
  errors: string[];
  markedPeople: number[];
  sentinels: number;
}

export const crawlPassed = (r: CrawlReport) =>
  r.schemaHits.length + r.sentinelHits.length + r.divergences.length + r.showTruthSettings.length + r.errors.length === 0;

/** Copies a world with marks planted in the truth of the given people (rows keyed by `id` in `people`, `personId` elsewhere). */
export function markPeople(source: TableSource, personIds: readonly number[]): { source: TableSource; sentinels: Sentinel[] } {
  const ids = new Set(personIds);
  const sentinels: Sentinel[] = [];
  const cache = new Map<string, readonly unknown[]>();
  for (const t of WORLD_TABLES) {
    const rows = source.rows(t.table);
    if (!rows.length) continue;
    const schema = tableSchema(t.table);
    cache.set(t.table, rows.map((row) => {
      const r = row as { id?: number; personId?: number };
      const about = t.table === 'people' ? r.id : r.personId;
      if (typeof about !== 'number' || !ids.has(about)) return row;
      const planted = plantSentinels(schema, row, t.table);
      sentinels.push(...planted.sentinels);
      return planted.row;
    }));
  }
  return { source: { rows: (t) => cache.get(t) ?? source.rows(t) }, sentinels };
}

export function crawlReadModels(opts: {
  /** The registry, or how to wire one for a given world (a worker builds its registry around the world it holds). */
  registry: ReadModelRegistry | ((source: TableSource) => ReadModelRegistry);
  source: TableSource;
  observers: readonly { name: string; observer: Observer }[];
  /** Parameter sets to build each model with. Default: one build with no parameters. */
  params?: (model: string) => readonly Params[];
  /** People whose truth is marked. Default: the first people of the world, up to the Q1.4.2 count. */
  markedPersonIds?: readonly number[];
  build?: BuildOptions;
}): CrawlReport {
  const registryFor = (s: TableSource) => (typeof opts.registry === 'function' ? opts.registry(s) : opts.registry);
  const report: CrawlReport = {
    built: 0, schemaHits: scanSchemas(registryFor(opts.source).schemas()), sentinelHits: [], divergences: [], errors: [], sentinels: 0,
    showTruthSettings: showTruthSettings(opts.source.rows('settings') as { key: string }[]),
    markedPeople: [...(opts.markedPersonIds ?? (opts.source.rows('people') as { id: number }[]).slice(0, param('observer.audit.marked_people')).map((p) => p.id))],
  };
  const marked = markPeople(opts.source, report.markedPeople);
  report.sentinels = marked.sentinels.length;
  const paramsOf = (m: string) => opts.params?.(m) ?? [{}];
  const buildAll = (source: TableSource, observer: Observer, onModel?: (key: string, model: unknown) => void) => {
    const out: unknown[] = [];
    const registry = registryFor(source);
    for (const name of registry.names()) for (const p of paramsOf(name)) {
      const b = buildReadModel(registry, source, observer, name, p, opts.build);
      onModel?.(b.model.key, b.model);
      out.push(b.model);
    }
    return out;
  };
  for (const { name, observer } of opts.observers) {
    try {
      buildAll(marked.source, observer, (key, model) => {
        report.built += 1;
        for (const h of findSentinels(model, marked.sentinels)) report.sentinelHits.push({ ...h, model: key, observer: name });
      });
      const audit = auditHidden({ source: marked.source, observer, run: (s) => buildAll(s, observer) });
      for (const d of audit.divergences) report.divergences.push({ ...d, observer: name });
    } catch (e) {
      report.errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  return report;
}
