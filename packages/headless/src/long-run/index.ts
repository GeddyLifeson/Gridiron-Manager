// G-88: the 30-season run and stability checks (Q1.6.1, Q1.6.2, Q1.6.4, P6.1.1 20-season advance).
export { MODULE, PARAMS, param } from './params.ts';
export type { PersonView, GameView, SeasonView, WorldView, Boundary, LongRunTarget, SizePort, TextPort, RosterLimits, InvariantFailure } from './types.ts';
export { INVARIANTS, NOT_CHECKED, InvariantChecker, type Invariant, type CheckInput } from './invariants.ts';
export { importedIds, protectedEventHits, protectedTextHits, inventedFamilyHits, historyRunHits, type ProtectionHit, type EventTypeLookup } from './protection.ts';
export { SeriesTracker, UNAVAILABLE, type SeasonPoint, type RecordFall } from './series.ts';
export { fitLine, seriesNames, testSeries, testRecords, driftReport, type Band, type DriftOptions, type SeriesResult, type RecordsResult, type DriftReport } from './drift.ts';
export {
  canonicalBytes, runLongRun, runStabilitySuite, measureAdvance, loopTarget,
  type LongRunOptions, type SeasonMeasure, type LongRunReport, type SuiteOptions, type SuiteVerdict, type AdvanceMeasure, type LoopFns,
} from './run.ts';
