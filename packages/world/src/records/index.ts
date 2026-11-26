// world/src/records: the statistics, notability and labels steps of the off-screen loop (X3.4.1, X4, X2.2.2).
// The integrator adds `export * as records from './records/index.ts'` to the package barrel.
export { MODULE, PARAMS, param } from './params.ts';
export { TEAM_SEASON, LABEL_FORMED, LABEL_FADED, RECORDS_EVENT_TYPES } from './events.ts';
export {
  RECORDS_CONTENT, RECORDS_KEY, emptyRecords, recordsOf, bookKey, rowRecordId, markOf, enter, statisticsStep,
  type RecordScope, type BookKind, type WorldRecordDef, type RecordsContent, type Entry, type TeamSeason, type CoachCareer, type RecordsState, type StatisticsBinding,
} from './statistics.ts';
export {
  NOTABILITY_KEY, contextOf, worldNotability, notabilityOf, indexed, foldRows, notabilityStep, rebuildRollups, honoursOf,
  type PersonRollup, type NotabilityState,
} from './notability.ts';
export { LABEL_DEFS, LABELS_KEY, labelsStateOf, rowsOfLabel, labelsOn, labelsStep, type LabelsState, type LabelsBinding } from './labels.ts';
