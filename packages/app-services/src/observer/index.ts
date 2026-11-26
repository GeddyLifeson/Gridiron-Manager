// @gm/app-services, observer module (G-27): the observer filter, the read-model core and the
// information audits (P1.1.4, P1.3.2, P2.2.1, K9.1.1, K9.3, Q1.4.1, Q1.4.2). See ./README.md.
export {
  PUBLIC_OBSERVER, TEAM_SCOPES, ALL_SCOPES, ASSUMED_DEFAULT_SEAT_POLICY, EMPTY_LOOKUP, roomScope, hasScope, lookupFrom, observerFor,
  type Observer, type TeamScope, type TableSource, type WorldLookup, type SeatPolicy,
} from './observer.ts';
export { registerOwnerRule, isOwner, NOBODY, type Owners, type OwnerRule, type OwnerScope, type OwnerEnv } from './ownership.ts';
export { filterValue, filterRows, newReport, type Seen, type FilterOptions, type FilterReport } from './filter.ts';
export { ObservedWorld, tablesOf, tableSchema, WORLD_ROW_TABLES, type WorldRows, type WorldTableName } from './observed-world.ts';
export {
  ReadModelRegistry, ReadModelHub, ReadModelError, READ_ONLY, buildReadModel, readModelKey, readModelSchemaProblems,
  type ReadModelSpec, type ReadModelEnvelope, type ReadModelMessage, type PermissionResolver, type PermissionValue, type ValueMetaData,
  type Params, type BuildOptions, type BuiltModel,
} from './read-model.ts';
export { registerBridge, bridges, type Bridge } from './bridges.ts';
export { walkSchema, pathsOfClass, holdsTruth, schemaAt, canonical, plainClone, type Schema, type SchemaNode } from './schema-walk.ts';
export { scanSchemas, showTruthSettings, plantSentinels, findSentinels, kendallTau, rankLeaks, SHOW_TRUTH_PATTERNS, type SchemaHit, type Sentinel, type SentinelHit, type RankLeak } from './audit/truth-scan.ts';
export { mutateWhere, scrambleTruth, type MutateResult, type MutateMode, type LeafOverride } from './audit/scramble.ts';
export { hiddenFacts, auditHidden, auditVisible, withTable, type HiddenFact, type HiddenAuditReport, type Divergence, type VisibleFact, type HiddenReason } from './audit/dynamic.ts';
export { crawlReadModels, crawlPassed, markPeople, type CrawlReport } from './audit/crawler.ts';
export { truthSymbols, auditSource, codeOnly, DECISION_PACKAGES, INTERFACE_PACKAGES, WORLD_STATE_SYMBOLS, type StaticViolation, type StaticAuditOptions } from './audit/static.ts';
export { fullSample, maxUnionOptions, heldPaths, type HeldPath } from './audit/sample.ts';
export { PARAMS } from './params.ts';
