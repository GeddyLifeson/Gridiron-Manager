// Every validator of the world contract by name (`worldSchemas()`), and the table list of a world
// save (`WORLD_TABLES`) that the save core (G-01) builds its tables from. `allSchemas()` in
// ../registry.ts includes these once the integrator adds the line (CR-G00-2); until then the world
// tests run the same lints over `worldSchemas()` directly.
import type { z } from 'zod';
import { TraitBlock, GoalRecord } from './traits.ts';
import { PersonRecord, PersonView } from './person.ts';
import { WorldRecord, CompetitionRecord, ConferenceRecord, VenueRecord, TeamRecord, SeasonRecord, CultureRecord, TierRow } from './structure.ts';
import { JobRecord, PositionDefinition, RosterSlot, DepthChartRecord, KnowledgeRow, InjuryRecord, ProspectRecord } from './jobs.ts';
import { ContractRecord } from './contracts.ts';
import { WorldEvent, EventTypeDef, SeasonLogHash } from './events.ts';
import { GameRecord, GameDriveRow, TrajectoryRef, TendencyCell, PlayerPlayGrade, DecisionGrade, SuggestionRecord, SeasonStatSummary } from './record.ts';
import {
  JobHistoryRow, RelationshipEdge, CohesionRow, MemoryRow, PersonState, PromiseRecord, ReputationRow, JobOpening,
  LedgerEntry, BalanceSheet, HouseholdRecord, InboxItem, NewsItem, EvaluationRecord, PhilosophyRecord, NotabilityRollup,
} from './career.ts';
import { ScreenRecord, SettingRecord, KeyBinding, TemplateText } from './interface.ts';
import { SystemStateEntry } from './system.ts';

export function worldSchemas(): Record<string, z.ZodType> {
  return {
    'world:TraitBlock': TraitBlock, 'world:GoalRecord': GoalRecord,
    'world:PersonRecord': PersonRecord, 'world:PersonView': PersonView,
    'world:WorldRecord': WorldRecord, 'world:CompetitionRecord': CompetitionRecord, 'world:ConferenceRecord': ConferenceRecord,
    'world:VenueRecord': VenueRecord, 'world:TeamRecord': TeamRecord, 'world:SeasonRecord': SeasonRecord,
    'world:CultureRecord': CultureRecord, 'world:TierRow': TierRow,
    'world:JobRecord': JobRecord, 'world:PositionDefinition': PositionDefinition, 'world:RosterSlot': RosterSlot,
    'world:DepthChartRecord': DepthChartRecord, 'world:KnowledgeRow': KnowledgeRow, 'world:InjuryRecord': InjuryRecord,
    'world:ProspectRecord': ProspectRecord, 'world:ContractRecord': ContractRecord,
    'world:WorldEvent': WorldEvent, 'world:EventTypeDef': EventTypeDef, 'world:SeasonLogHash': SeasonLogHash,
    'world:GameRecord': GameRecord, 'world:GameDriveRow': GameDriveRow, 'world:TrajectoryRef': TrajectoryRef, 'world:TendencyCell': TendencyCell,
    'world:PlayerPlayGrade': PlayerPlayGrade, 'world:DecisionGrade': DecisionGrade, 'world:SuggestionRecord': SuggestionRecord,
    'world:SeasonStatSummary': SeasonStatSummary,
    'world:JobHistoryRow': JobHistoryRow, 'world:RelationshipEdge': RelationshipEdge, 'world:CohesionRow': CohesionRow,
    'world:MemoryRow': MemoryRow, 'world:PersonState': PersonState, 'world:PromiseRecord': PromiseRecord,
    'world:ReputationRow': ReputationRow, 'world:JobOpening': JobOpening, 'world:LedgerEntry': LedgerEntry,
    'world:BalanceSheet': BalanceSheet, 'world:HouseholdRecord': HouseholdRecord, 'world:InboxItem': InboxItem,
    'world:NewsItem': NewsItem, 'world:EvaluationRecord': EvaluationRecord, 'world:PhilosophyRecord': PhilosophyRecord,
    'world:NotabilityRollup': NotabilityRollup,
    'world:ScreenRecord': ScreenRecord, 'world:SettingRecord': SettingRecord, 'world:KeyBinding': KeyBinding,
    'world:TemplateText': TemplateText,
    'world:SystemStateEntry': SystemStateEntry,
  };
}

/**
 * World shapes that may go to the interface as they are: no truth-class field anywhere inside. The
 * world test proves it. Everything else passes the observer filter (G-27) first (P1.1.4).
 */
export function worldPublicSchemas(): Record<string, z.ZodType> {
  return {
    'world:PersonView': PersonView, 'world:CompetitionRecord': CompetitionRecord, 'world:ConferenceRecord': ConferenceRecord,
    'world:VenueRecord': VenueRecord, 'world:SeasonRecord': SeasonRecord, 'world:JobRecord': JobRecord,
    'world:RosterSlot': RosterSlot, 'world:DepthChartRecord': DepthChartRecord, 'world:JobHistoryRow': JobHistoryRow,
    'world:PromiseRecord': PromiseRecord, 'world:JobOpening': JobOpening, 'world:InboxItem': InboxItem,
    'world:NewsItem': NewsItem, 'world:EvaluationRecord': EvaluationRecord, 'world:PhilosophyRecord': PhilosophyRecord,
    'world:LedgerEntry': LedgerEntry, 'world:BalanceSheet': BalanceSheet, 'world:PlayerPlayGrade': PlayerPlayGrade,
    'world:DecisionGrade': DecisionGrade, 'world:SuggestionRecord': SuggestionRecord, 'world:TendencyCell': TendencyCell,
    'world:SeasonStatSummary': SeasonStatSummary, 'world:GameDriveRow': GameDriveRow, 'world:NotabilityRollup': NotabilityRollup, 'world:TrajectoryRef': TrajectoryRef,
    'world:ScreenRecord': ScreenRecord, 'world:SettingRecord': SettingRecord, 'world:KeyBinding': KeyBinding,
    'world:TemplateText': TemplateText,
  };
}

/** Storage kind of a table (P3.1.1): content copied in, world state changed by commands, append-only record, or a derived cache. */
export type TableKind = 'content' | 'state' | 'record' | 'derived';

export interface WorldTableSpec {
  readonly table: string;
  /** Registered schema name of the row, from `worldSchemas()` or the sim contract's `simSchemas()`. */
  readonly row: string;
  readonly kind: TableKind;
  /** Record tables are append-only (P3.1.1, X2.1.3); only compaction may fold compactable events. */
  readonly appendOnly: boolean;
  /** Fields that identify a row. */
  readonly key: readonly string[];
  /** Bible leaf that owns the row's meaning. */
  readonly leaf: string;
}

/** Every table of a world save (P3.2 to P3.6). One-row tables have an empty key. */
export const WORLD_TABLES: readonly WorldTableSpec[] = [
  { table: 'world', row: 'world:WorldRecord', kind: 'state', appendOnly: false, key: [], leaf: 'P3.2.1' },
  { table: 'competitions', row: 'world:CompetitionRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'P3.2.1' },
  { table: 'conferences', row: 'world:ConferenceRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'C1' },
  { table: 'venues', row: 'world:VenueRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'P3.2.1' },
  { table: 'teams', row: 'world:TeamRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'P3.2.1' },
  { table: 'seasons', row: 'world:SeasonRecord', kind: 'state', appendOnly: false, key: ['competitionId', 'year'], leaf: 'P3.2.1' },
  { table: 'cultures', row: 'world:CultureRecord', kind: 'state', appendOnly: false, key: ['teamId'], leaf: 'X9.1.1' },
  { table: 'tiers', row: 'world:TierRow', kind: 'state', appendOnly: false, key: ['subjectKind', 'subjectId'], leaf: 'X13.1.1' },
  { table: 'people', row: 'world:PersonRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'P3.2.2' },
  { table: 'personViews', row: 'world:PersonView', kind: 'state', appendOnly: false, key: ['observerTeamId', 'observerPersonId', 'personId'], leaf: 'P3.2.3' },
  { table: 'personStates', row: 'world:PersonState', kind: 'state', appendOnly: false, key: ['personId'], leaf: 'X5' },
  { table: 'jobs', row: 'world:JobRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'S1.1.1' },
  { table: 'positions', row: 'world:PositionDefinition', kind: 'content', appendOnly: false, key: ['id'], leaf: 'X8.1.1' },
  { table: 'rosterSlots', row: 'world:RosterSlot', kind: 'state', appendOnly: false, key: ['teamId', 'personId'], leaf: 'P3.2.4' },
  { table: 'depthCharts', row: 'world:DepthChartRecord', kind: 'state', appendOnly: false, key: ['teamId', 'unitId'], leaf: 'M2' },
  { table: 'contracts', row: 'world:ContractRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'P3.2.4' },
  { table: 'knowledge', row: 'world:KnowledgeRow', kind: 'state', appendOnly: false, key: ['personId', 'elementId'], leaf: 'D9' },
  { table: 'injuries', row: 'world:InjuryRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'D11' },
  { table: 'prospects', row: 'world:ProspectRecord', kind: 'state', appendOnly: false, key: ['personId', 'kind'], leaf: 'P3.2.4' },
  { table: 'relationships', row: 'world:RelationshipEdge', kind: 'state', appendOnly: false, key: ['a', 'b', 'bTeamId', 'kind'], leaf: 'X7.1.1' },
  { table: 'cohesion', row: 'world:CohesionRow', kind: 'state', appendOnly: false, key: ['teamId', 'seasonYear', 'unitKey', 'a', 'b'], leaf: 'X7.3.1' },
  { table: 'memories', row: 'world:MemoryRow', kind: 'state', appendOnly: false, key: ['holderId', 'eventId'], leaf: 'X6.1.1' },
  { table: 'promises', row: 'world:PromiseRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'L1' },
  { table: 'reputations', row: 'world:ReputationRow', kind: 'state', appendOnly: false, key: ['personId', 'audience', 'competitionId'], leaf: 'E5' },
  { table: 'openings', row: 'world:JobOpening', kind: 'state', appendOnly: false, key: ['id'], leaf: 'E2' },
  { table: 'systemState', row: 'world:SystemStateEntry', kind: 'state', appendOnly: false, key: ['system'], leaf: 'P5.1.1' },
  { table: 'balanceSheets', row: 'world:BalanceSheet', kind: 'state', appendOnly: false, key: ['personId'], leaf: 'E6' },
  { table: 'households', row: 'world:HouseholdRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'E8' },
  { table: 'inbox', row: 'world:InboxItem', kind: 'state', appendOnly: false, key: ['id'], leaf: 'O1.2.2' },
  { table: 'philosophies', row: 'world:PhilosophyRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'E10' },
  { table: 'eventTypes', row: 'world:EventTypeDef', kind: 'content', appendOnly: false, key: ['id'], leaf: 'X2.1.2' },
  { table: 'events', row: 'world:WorldEvent', kind: 'record', appendOnly: true, key: ['id'], leaf: 'X2.1.1' },
  { table: 'logHashes', row: 'world:SeasonLogHash', kind: 'record', appendOnly: true, key: ['year'], leaf: 'X2.1.3' },
  { table: 'games', row: 'world:GameRecord', kind: 'state', appendOnly: false, key: ['id'], leaf: 'P3.3.1' },
  { table: 'plays', row: 'sim:PlayRecord', kind: 'record', appendOnly: true, key: ['gameId', 'index'], leaf: 'P3.3.1' },
  { table: 'drives', row: 'world:GameDriveRow', kind: 'record', appendOnly: true, key: ['gameId', 'drive.driveNumber'], leaf: 'P3.3.1' },
  { table: 'trajectories', row: 'world:TrajectoryRef', kind: 'record', appendOnly: false, key: ['gameId', 'playIndex'], leaf: 'P3.3.2' },
  { table: 'playGrades', row: 'world:PlayerPlayGrade', kind: 'record', appendOnly: true, key: ['gameId', 'playIndex', 'personId', 'graderPersonId'], leaf: 'P3.3.2' },
  { table: 'decisionGrades', row: 'world:DecisionGrade', kind: 'record', appendOnly: true, key: ['gameId', 'playIndex', 'actorPersonId', 'decisionType'], leaf: 'N3' },
  { table: 'suggestions', row: 'world:SuggestionRecord', kind: 'record', appendOnly: false, key: ['id'], leaf: 'P3.3.2' },
  { table: 'jobHistory', row: 'world:JobHistoryRow', kind: 'record', appendOnly: false, key: ['personId', 'jobId', 'started'], leaf: 'S11' },
  { table: 'ledger', row: 'world:LedgerEntry', kind: 'record', appendOnly: true, key: ['personId', 'date', 'kind', 'refId'], leaf: 'E6' },
  { table: 'news', row: 'world:NewsItem', kind: 'record', appendOnly: true, key: ['id'], leaf: 'C10' },
  { table: 'evaluations', row: 'world:EvaluationRecord', kind: 'record', appendOnly: true, key: ['byPersonId', 'aboutPersonId', 'periodEnd'], leaf: 'S4' },
  { table: 'seasonSummaries', row: 'world:SeasonStatSummary', kind: 'record', appendOnly: true, key: ['personId', 'teamId', 'seasonYear'], leaf: 'P5.4.2' },
  { table: 'tendencies', row: 'world:TendencyCell', kind: 'derived', appendOnly: false, key: ['teamId', 'seasonYear', 'situationBucket', 'callKey'], leaf: 'P3.3.2' },
  { table: 'notability', row: 'world:NotabilityRollup', kind: 'derived', appendOnly: false, key: ['subjectKind', 'subjectId', 'seasonYear'], leaf: 'X4.2.2' },
  { table: 'screens', row: 'world:ScreenRecord', kind: 'content', appendOnly: false, key: ['id'], leaf: 'P3.6.1' },
  { table: 'settings', row: 'world:SettingRecord', kind: 'content', appendOnly: false, key: ['key'], leaf: 'P3.6.1' },
  { table: 'keyBindings', row: 'world:KeyBinding', kind: 'content', appendOnly: false, key: ['actionId', 'context'], leaf: 'P3.6.1' },
  { table: 'templates', row: 'world:TemplateText', kind: 'content', appendOnly: false, key: ['key'], leaf: 'P4.6.1' },
];
