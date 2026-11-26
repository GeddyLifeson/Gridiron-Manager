// Decision record score, limits note and coaching record (N4). Certified state and the record file are
// in @gm/store (certified/).
export { COMPONENTS, component, componentForType, type ComponentDef, type ComponentId, type ComponentUnit } from './components.ts';
export {
  profile, gameManagementLoss, creditWeight,
  type ProfileInput, type ExternalSample, type ScoreVersions, type ComponentStatus, type ComponentScore, type SeasonAggregate, type ScoredLoss, type DecisionRecordProfile,
} from './score.ts';
export {
  REFERENCE_VERSION, startingPolicy, clearEdge, referenceFourthDownLoss, referenceFollowLoss, leagueMedianPolicy,
  type ReferencePolicy, type AiFourthDown,
} from './reference.ts';
export { rosterExpectation, percentileOf, type RosterExpectation, type RosterWords } from './roster.ts';
export { limitsNote, type LimitsNote } from './limits.ts';
export {
  RECORD_FORMAT, DEFAULT_SWITCHES, RecordError, buildRecord, verifyRecord, exportChain, verifyExportedChain, selectEvidence, largestLosses, isRedacted,
  type CoachingRecord, type RecordConditions, type RecordInput, type RecordSwitches, type SeasonResult, type EvidenceItem, type JobHeld,
  type ExportedEntry, type RedactedEntry, type ExportedChainCheck, type RecordCheck,
} from './record.ts';
export { Draws, seedOf, bootstrap, shrunkMean } from './stats.ts';
export { RULE_KEYS, PARAMS, param } from './params.ts';
