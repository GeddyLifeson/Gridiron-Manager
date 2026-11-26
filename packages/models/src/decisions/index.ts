// Decision log (N3): the record, the catalogue, the model's view, review data and the hash chain.
export * from './types.ts';
export { DECISION_TYPES, GAME_DECISION_TYPES, WEEK_DECISION_TYPES, decisionType, isDecisionType, type DecisionTypeDef, type ViewKind } from './catalogue.ts';
export { captureInformation, freezeJson, modelLacks, InformationError, type InformationSource } from './information.ts';
export { recordProblems, makeRecord, attribute, RecordError, type AttributionInput } from './record.ts';
export {
  evaluateOptions, halfWidth, classify, scoreGameManagement, scorePlayCall, playCallTruth, noModelView, bandsOverlap, ModelViewError,
  type OptionValueLike, type OptionInputs, type EvaluatedOption, type GameManagementResult, type ScoutedLook, type CallValueTable, type PlayCallInput,
} from './model-view.ts';
export { DecisionLog, DecisionLogError, type SegmentInfo } from './log.ts';
export { GENESIS_HASH, canonicalText, entryHash, verifyChain, type ChainCheck } from './chain.ts';
export { decisionDelta, gameReport, patterns, coverageGaps, type GameReport, type ManagementLine, type CallLine, type ReportOptions, type Pattern, type CoverageInput } from './report.ts';
export { toDecisionGrade } from './grade.ts';
export { addDays, compareIso, daysFromIso, isoFromDays } from './dates.ts';
export { RULE_KEYS, PARAMS } from './params.ts';
