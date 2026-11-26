// Legends read models (G-84, bible X3): pages, the season chronicle, era views, coaching trees, rivalry
// pages, the record book, search and export. Every view is a query over the events the observer may see
// (X3.1.3), so nothing is authored and nothing can disagree with what happened. Public history is open
// from the first day; no setting hides or reveals it (X3.6.2).
//
// Wiring is injected for the same contract reasons as the analytics models:
//   - CR-G84-1 (same as CR-G27-4): app-services may not import zod, so the data schemas are passed in. Their
//     definitions sit in test/read-models/legends/schemas.ts until they move to @gm/schema.
//   - CR-G84-2: data other modules own (calendar sections, tiers, held labels, news reaches, game lines,
//     N2 league rates, B12 rule-era markers, X7 rival edges, the search index) arrives through
//     `LegendsSources`; the integrator binds them when the world loop (G-81) and news (G-44) are wired.
import { awards } from '@gm/league';
import type { Params, ReadModelSpec, Schema } from '../../observer/index.ts';
import type { ObservedWorld } from '../../observer/index.ts';
import { buildChronicle, lastTitleFrom } from './chronicle.ts';
import { eraBlocks, type LeagueRates, type RuleMarker } from './era.ts';
import { buildPage, type TypeInfo } from './pages.ts';
import { rankRows, recordBook, type PriorMark, type RecordList } from './records.ts';
import { param } from './params.ts';
import { rivalryPage } from './rivalry.ts';
import { type SearchFilter, type SearchIndex } from './search.ts';
import { coachingTree, flattenTree, staffSeasonsFrom, type Side } from './trees.ts';
import { PAGE_KINDS, DEFAULT_TYPES, reversedIds, type CalendarOf, type EventRow, type LegendsTypes, type PageKind } from './types.ts';
import { visibleEvents, type Reach } from './visibility.ts';

export * from './types.ts';
export { PARAMS, param } from './params.ts';
export { visibleEvents, publicOnly, type Reach, type SourceMark, type VisibleEvent } from './visibility.ts';
export { PAGE_CONTENT, buildPage, linksOf, pageLinks, type PageQuery, type PageContext, type PageModel, type PageLine, type PageSeason, type TypeInfo, type PageKindContent } from './pages.ts';
export { buildChronicle, isGuaranteed, summaryOf, lastTitleFrom, type Chronicle, type ChronicleEntry, type ChronicleSection, type ChronicleOptions, type ChronicleSummary } from './chronicle.ts';
export { eraBlocks, teamSeasonRows, blockOf, type EraBlock, type EraInput, type LeagueRates, type RuleMarker, type TeamBlockRow, type TeamSeasonRow } from './era.ts';
export { coachingTree, flattenTree, staffSeasonsFrom, type FlatCoachingTree, type FlatTreeNode, type CoachingTree, type TreeNode, type TreeFilter, type StaffSeason, type Chair, type Side } from './trees.ts';
export { rivalryPage, seriesGames, type RivalryPage, type RivalryOptions, type Streak, type Margin } from './rivalry.ts';
export { RECORD_CATEGORIES, recordList, recordBook, rankRows, type RecordCategory, type RecordList, type RecordRow, type RecordScope, type RecordFilter, type Qualifier, type PriorMark } from './records.ts';
export { SearchIndex, FILTER_KEYS, tokensOf, editDistance, passes, type IndexEntry, type EntryKind, type SearchFilter, type SearchRow, type MatchClass, type FilterKey } from './search.ts';
export { buildExport, publicEvent, truthKeys, EXPORT_KINDS, EXPORT_SCHEMA_VERSION, type ExportInput, type ExportResult, type ExportProblem, type ExportKind } from './export.ts';

/** Read-model names, for the route entry and the crawler. */
export const LEGENDS_MODELS = {
  page: 'legendsPage', chronicle: 'legendsChronicle', era: 'legendsEra', tree: 'legendsTree', rivalry: 'legendsRivalry', records: 'legendsRecords', search: 'legendsSearch',
} as const;

export interface LegendsSchemas {
  readonly page: Schema;
  readonly chronicle: Schema;
  readonly era: Schema;
  readonly tree: Schema;
  readonly rivalry: Schema;
  readonly records: Schema;
  readonly search: Schema;
}

/** Data the legends models need that other modules own (CR-G84-2). */
export interface LegendsSources {
  readonly calendar: CalendarOf;
  /** X13 tier of a page subject. */
  tierOf(world: ObservedWorld, kind: PageKind, id: number): 1 | 2 | 3;
  /** Held public labels of a subject (X2.2.2, observerView). */
  labelsOf(world: ObservedWorld, kind: PageKind, id: number): readonly string[];
  /** News deliveries to the observer (X12.2.1) and the full-log lookup for the events they carry. */
  reaches(world: ObservedWorld): readonly Reach[];
  eventById(id: number): EventRow | undefined;
  /** Tab counts other modules feed (relationships, rivalries, culture). */
  extraTabCounts?(world: ObservedWorld, kind: PageKind, id: number): Readonly<Record<string, number>>;
  /** Whether a season was played in the history run (X10.3.1). */
  historyRun?(competitionId: number, seasonYear: number): boolean;
  /** World span. */
  seasons(world: ObservedWorld): { first: number; last: number };
  rates?(world: ObservedWorld, competitionId: number | undefined): readonly LeagueRates[];
  ruleMarkers?(competitionId: number | undefined): readonly RuleMarker[];
  /** X7 team-level rival edge (X3.3.2): a page exists only for a rivalry. */
  isRival(world: ObservedWorld, a: number, b: number): boolean;
  rivalryTrophy?(a: number, b: number): string | null;
  /** Public game lines (D14) the record book reads, and imported prior careers per category (X14.2.1). */
  gameLines(world: ObservedWorld): readonly awards.GameLine[];
  priorMarks?(categoryId: string): readonly PriorMark[];
  /** The incrementally kept search index (X3.5.1 rule 1). */
  searchIndex(world: ObservedWorld): SearchIndex;
  readonly types?: LegendsTypes;
}

function num(p: Params, k: string): number {
  const v = p[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`legends read model: parameter ${k} must be a number`);
  return v;
}
const optNum = (p: Params, k: string): number | undefined => (typeof p[k] === 'number' ? (p[k] as number) : undefined);
const optStr = (p: Params, k: string): string | undefined => (typeof p[k] === 'string' ? (p[k] as string) : undefined);

/** The observer's visible events: rows he may see plus rows news carried to him. */
export function viewerEvents(world: ObservedWorld, sources: Pick<LegendsSources, 'reaches' | 'eventById'>) {
  return visibleEvents(world.table('events') as unknown as EventRow[], sources.reaches(world), (id) => sources.eventById(id));
}

function typeInfo(world: ObservedWorld): Map<string, TypeInfo> {
  const m = new Map<string, TypeInfo>();
  for (const t of world.table('eventTypes') as unknown as { id?: string; family?: string; lineTemplate?: string }[]) {
    if (t.id && t.family && t.lineTemplate) m.set(t.id, { family: t.family, lineTemplate: t.lineTemplate });
  }
  return m;
}

export function legendsReadModels(schemas: LegendsSchemas, sources: LegendsSources): ReadModelSpec[] {
  const types = sources.types ?? DEFAULT_TYPES;
  const rowsOf = (world: ObservedWorld) => viewerEvents(world, sources).map((v) => v.event);

  const page: ReadModelSpec = {
    name: LEGENDS_MODELS.page, data: schemas.page,
    build(world, p) {
      const kind = optStr(p, 'kind') as PageKind | undefined;
      if (!kind || !(PAGE_KINDS as readonly string[]).includes(kind)) throw new Error('legends read model: parameter kind must be a page kind');
      const id = num(p, 'id');
      const seasonYear = optNum(p, 'seasonYear');
      const data = buildPage({ kind, id, ...(seasonYear !== undefined ? { seasonYear } : {}) }, viewerEvents(world, sources), {
        types: typeInfo(world), keepLine: awards.keepLine(), tier: sources.tierOf(world, kind, id), labels: sources.labelsOf(world, kind, id),
        extraTabCounts: sources.extraTabCounts?.(world, kind, id) ?? {}, legendsTypes: types,
      });
      return { data };
    },
  };

  const chronicle: ReadModelSpec = {
    name: LEGENDS_MODELS.chronicle, data: schemas.chronicle,
    build(world, p) {
      const competitionId = num(p, 'competitionId'), seasonYear = num(p, 'seasonYear');
      const rows = rowsOf(world);
      const rev = reversedIds(rows, types);
      return {
        data: buildChronicle(rows.filter((e) => !rev.has(e.id)), competitionId, seasonYear, {
          threshold: awards.consumerThreshold('chronicle'), calendar: sources.calendar, historyRun: sources.historyRun?.(competitionId, seasonYear) ?? false,
          lastTitleBefore: lastTitleFrom(rows, types), types,
        }),
      };
    },
  };

  const era: ReadModelSpec = {
    name: LEGENDS_MODELS.era, data: schemas.era,
    build(world, p) {
      const competitionId = optNum(p, 'competitionId');
      const span = sources.seasons(world);
      const blocks = eraBlocks({
        rows: rowsOf(world), firstSeason: span.first, lastSeason: span.last, rates: sources.rates?.(world, competitionId) ?? [],
        ruleMarkers: sources.ruleMarkers?.(competitionId) ?? [], types, ...(competitionId !== undefined ? { competitionId } : {}),
      });
      return { data: { competitionId: competitionId ?? null, blocks } };
    },
  };

  const tree: ReadModelSpec = {
    name: LEGENDS_MODELS.tree, data: schemas.tree,
    build(world, p) {
      const rootId = num(p, 'rootId');
      const span = sources.seasons(world);
      const level = optStr(p, 'level'), side = optStr(p, 'side') as Side | undefined, fromSeason = optNum(p, 'fromSeason'), toSeason = optNum(p, 'toSeason');
      return {
        data: flattenTree(coachingTree(rootId, staffSeasonsFrom(rowsOf(world), span.last, types), {
          ...(level !== undefined ? { level } : {}), ...(side !== undefined ? { side } : {}),
          ...(fromSeason !== undefined ? { fromSeason } : {}), ...(toSeason !== undefined ? { toSeason } : {}),
        }, types)),
      };
    },
  };

  const rivalry: ReadModelSpec = {
    name: LEGENDS_MODELS.rivalry, data: schemas.rivalry,
    build(world, p) {
      const a = num(p, 'teamA'), b = num(p, 'teamB');
      if (!sources.isRival(world, a, b)) return { data: { teamA: a, teamB: b, exists: false, page: null } };
      const rows = rowsOf(world);
      const staff = staffSeasonsFrom(rows, sources.seasons(world).last, types).filter((s) => s.role === types.headCoachRole);
      const headCoachOf = (team: number, season: number) => staff.find((s) => s.teamId === team && s.seasonYear === season)?.personId ?? null;
      return { data: { teamA: a, teamB: b, exists: true, page: rivalryPage(rows, a, b, { headCoachOf, trophyKey: sources.rivalryTrophy?.(a, b) ?? null, types }) } };
    },
  };

  const records: ReadModelSpec = {
    name: LEGENDS_MODELS.records, data: schemas.records,
    build(world, p) {
      const competitionId = optNum(p, 'competitionId'), teamId = optNum(p, 'teamId');
      const postseason = p['postseason'] === true;
      const rows = rowsOf(world);
      const rev = reversedIds(rows, types);
      const vacatedGameIds = new Set<number>();
      for (const e of rows) if (rev.has(e.id) && e.type === types.gameResult) for (const s of e.subjects) if (s.kind === 'game') vacatedGameIds.add(s.id);
      const lines = sources.gameLines(world);
      const lists = recordBook(lines, {
        filter: { postseason, ...(competitionId !== undefined ? { competitionId } : {}), ...(teamId !== undefined ? { teamId } : {}) },
        vacatedGameIds,
      }).map((l) => (l.scope === 'career' && sources.priorMarks ? recordBookWithPrior(l, sources.priorMarks(l.categoryId)) : l));
      return { data: { competitionId: competitionId ?? null, teamId: teamId ?? null, postseason, lists } };
    },
  };

  const search: ReadModelSpec = {
    name: LEGENDS_MODELS.search, data: schemas.search,
    build(world, p) {
      const text = optStr(p, 'text') ?? '';
      const filter: SearchFilter = {
        ...(optStr(p, 'role') !== undefined ? { role: optStr(p, 'role')! } : {}),
        ...(optStr(p, 'level') !== undefined ? { level: optStr(p, 'level')! } : {}),
        ...(optStr(p, 'label') !== undefined ? { label: optStr(p, 'label')! } : {}),
        ...(optStr(p, 'honor') !== undefined ? { honor: optStr(p, 'honor')! } : {}),
        ...(optNum(p, 'team') !== undefined ? { team: optNum(p, 'team')! } : {}),
        ...(optNum(p, 'treeRoot') !== undefined ? { treeRoot: optNum(p, 'treeRoot')! } : {}),
      };
      return { data: { text, rows: sources.searchIndex(world).search(text, filter, sources.seasons(world).last) } };
    },
  };

  return [page, chronicle, era, tree, rivalry, records, search];
}

/** Adds imported prior careers to a career list's all-time tab (X14.2.2); "This world" never changes. */
function recordBookWithPrior(l: RecordList, prior: readonly PriorMark[]): RecordList {
  const merged = [...l.thisWorld.map(({ rank: _r, ...r }) => r), ...prior.map((m) => ({ ...m, gameId: null, imported: true }))];
  return { ...l, allTime: rankRows(merged, param('legends.records.list_size')) };
}
