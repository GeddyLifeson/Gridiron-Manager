// The world as one observer may read it. Read-model builders and AI view code receive this object
// and never the save tables themselves, so nothing they compute can depend on a field the observer
// may not know (P1.3.2, K9.1.1 acceptance: a view argument and no world-state argument).
import {
  WORLD_TABLES, allSchemas,
  type WorldRecord, type CompetitionRecord, type ConferenceRecord, type VenueRecord, type TeamRecord, type SeasonRecord,
  type CultureRecord, type TierRow, type PersonRecord, type PersonView, type PersonState, type JobRecord, type PositionDefinition,
  type RosterSlot, type DepthChartRecord, type ContractRecord, type KnowledgeRow, type InjuryRecord, type ProspectRecord,
  type RelationshipEdge, type CohesionRow, type MemoryRow, type PromiseRecord, type ReputationRow, type JobOpening,
  type BalanceSheet, type HouseholdRecord, type InboxItem, type PhilosophyRecord, type EventTypeDef, type WorldEvent,
  type SeasonLogHash, type GameRecord, type PlayRecord, type GameDriveRow, type TrajectoryRef, type PlayerPlayGrade,
  type DecisionGrade, type SuggestionRecord, type JobHistoryRow, type LedgerEntry, type NewsItem, type EvaluationRecord,
  type SeasonStatSummary, type TendencyCell, type NotabilityRollup, type ScreenRecord, type SettingRecord, type KeyBinding,
  type TemplateText, type SystemStateEntry,
} from '@gm/schema';
import { filterRows, filterValue, type FilterOptions, type Seen } from './filter.ts';
import { lookupFrom, type Observer, type TableSource, type WorldLookup } from './observer.ts';
import type { Schema } from './schema-walk.ts';

/** Row type of every table in WORLD_TABLES. The test checks the two lists name the same tables. */
export interface WorldRows {
  world: WorldRecord; competitions: CompetitionRecord; conferences: ConferenceRecord; venues: VenueRecord; teams: TeamRecord;
  seasons: SeasonRecord; cultures: CultureRecord; tiers: TierRow; people: PersonRecord; personViews: PersonView;
  personStates: PersonState; jobs: JobRecord; positions: PositionDefinition; rosterSlots: RosterSlot; depthCharts: DepthChartRecord;
  contracts: ContractRecord; knowledge: KnowledgeRow; injuries: InjuryRecord; prospects: ProspectRecord;
  relationships: RelationshipEdge; cohesion: CohesionRow; memories: MemoryRow; promises: PromiseRecord; reputations: ReputationRow;
  openings: JobOpening; balanceSheets: BalanceSheet; households: HouseholdRecord; inbox: InboxItem; philosophies: PhilosophyRecord;
  eventTypes: EventTypeDef; events: WorldEvent; logHashes: SeasonLogHash; games: GameRecord; plays: PlayRecord; drives: GameDriveRow;
  trajectories: TrajectoryRef; playGrades: PlayerPlayGrade; decisionGrades: DecisionGrade; suggestions: SuggestionRecord;
  jobHistory: JobHistoryRow; ledger: LedgerEntry; news: NewsItem; evaluations: EvaluationRecord; seasonSummaries: SeasonStatSummary;
  tendencies: TendencyCell; notability: NotabilityRollup; screens: ScreenRecord; settings: SettingRecord; keyBindings: KeyBinding;
  templates: TemplateText; systemState: SystemStateEntry;
}
export type WorldTableName = keyof WorldRows;

/** Compile-time list of the table names above, for the test that compares it with WORLD_TABLES. */
export const WORLD_ROW_TABLES: readonly WorldTableName[] = [
  'world', 'competitions', 'conferences', 'venues', 'teams', 'seasons', 'cultures', 'tiers', 'people', 'personViews', 'personStates',
  'jobs', 'positions', 'rosterSlots', 'depthCharts', 'contracts', 'knowledge', 'injuries', 'prospects', 'relationships', 'cohesion',
  'memories', 'promises', 'reputations', 'openings', 'balanceSheets', 'households', 'inbox', 'philosophies', 'eventTypes', 'events',
  'logHashes', 'games', 'plays', 'drives', 'trajectories', 'playGrades', 'decisionGrades', 'suggestions', 'jobHistory', 'ledger',
  'news', 'evaluations', 'seasonSummaries', 'tendencies', 'notability', 'screens', 'settings', 'keyBindings', 'templates', 'systemState',
];

let tableSchemas: Map<string, Schema> | null = null;

/** The row schema of a world table, from WORLD_TABLES and the schema registry. */
export function tableSchema(table: string): Schema {
  if (!tableSchemas) {
    const all = allSchemas();
    tableSchemas = new Map();
    for (const t of WORLD_TABLES) {
      const s = all[t.row];
      if (!s) throw new Error(`observer: table ${t.table} names unknown row schema ${t.row}`);
      tableSchemas.set(t.table, s);
    }
  }
  const s = tableSchemas.get(table);
  if (!s) throw new Error(`observer: ${table} is not a world table`);
  return s;
}

export class ObservedWorld {
  private readonly cache = new Map<string, readonly unknown[]>();
  private readonly read = new Set<string>();
  private readonly lookup: WorldLookup;

  constructor(private readonly source: TableSource, readonly observer: Observer, lookup?: WorldLookup) {
    this.lookup = lookup ?? lookupFrom(source);
  }

  /** The rows of a table this observer may know exist, each cut down to the fields he may read. */
  table<K extends WorldTableName>(name: K): readonly Seen<WorldRows[K]>[] {
    this.read.add(name);
    let rows = this.cache.get(name);
    if (!rows) {
      rows = Object.freeze(filterRows(tableSchema(name), this.source.rows(name), this.observer, { lookup: this.lookup }));
      this.cache.set(name, rows);
    }
    return rows as readonly Seen<WorldRows[K]>[];
  }

  /** Filters a value that is not a table row (a live game state, a play record, a decision) for this observer. */
  see<T>(schema: Schema, value: T, opts: Pick<FilterOptions, 'sideTeams' | 'owners'> = {}): Seen<T> | undefined {
    return filterValue(schema, value, this.observer, { ...opts, lookup: this.lookup });
  }

  /** Tables read so far. The read-model hub uses it to know when a model must be rebuilt (P1.3.2). */
  tablesRead(): string[] {
    return [...this.read].sort();
  }
}

/** A TableSource over plain arrays, for tests, the headless runner and anything that holds a world in memory. */
export function tablesOf(tables: Readonly<Record<string, readonly unknown[]>>): TableSource {
  return { rows: (t) => tables[t] ?? [] };
}
