// People import, shuffle and protection (G-42; U2.2, U3, U4.2, U5, U6, U8, X14, A6.3.1, D13.6).
export { PARAMS, param } from './params.ts';
export {
  isProtected, withoutProtected, idsWithoutProtected, originLookup, eventPersonIds, EmitGuard, historyRunViolations, assertHistoryClean,
  auditProblems, auditedAllowed, ROLE_NEUTRAL_GOALS, neutralityProblems, scanProtectedText,
  type Refusal, type AuditRow, type AuditProblem, type TextFinding,
} from './protection.ts';
export {
  indexPack, organisationNamer, clubLetters, priorCareerOf, coverageStarts, importedStatsOf, isoToWorldDate, footballAge,
  type PackIndex, type PackLevel, type PriorRole, type PriorSeason, type PriorCareer,
} from './prior.ts';
export {
  estimateBody, estimatePro, estimateCollege, buildPopulation, seasonShare, classYears, importProfileOf, mainGroupOf, coachTendencies, officialCrewParameters,
  PRODUCTION, TENDENCY_IDS,
  type Confidence, type BodyEstimate, type PlayerEstimate, type Population, type ProEstimateInput, type CollegeEstimateInput,
  type TendencyId, type CoachTendency, type CoachTendencies, type CoachPlayByPlay,
} from './estimate.ts';
export { buildImportedPerson, importedTraitBlock, IMPORT_STREAM, type ImportedPerson, type PersonBuildContext } from './person.ts';
export { deriveLinks, strengthOf, type PriorEdge, type PriorEdgeKind, type EdgeStrength, type LinkResult } from './links.ts';
export {
  placePlayers, placeCoaches, placementStream, teamStrength, groupOfPosition, PLACEMENT_MODES, PLACE_STREAM,
  type PlacementMode, type RosterEntry, type TeamSlot, type PlacePlayer, type PlacementResult, type CoachJob, type PlaceCoach, type CoachPlacement,
} from './place.ts';
export { createDial, blendSeason, targetPathFrom, type DialConfig, type TargetPath } from './dial.ts';
export {
  MIX_GROUPS, DEFAULT_MIX, fillNeed, deltaEntrants, cohortAfterEntrants, nameCollisions, recordLists,
  type MixGroup, type MixSetting, type MixConfig, type RecordRow,
} from './mix.ts';
export { buildProjectPack, splitName, STAT_COLUMNS, type ProjectDataRows, type BuildOptions, type SourceRow } from './builder.ts';
export { cfbdCoachRows, cfbdStatus, CFBD_HOST, CFBD_COACHES_PATH, type CfbdCoach, type CfbdCoachSeason, type CfbdStatus } from './cfbd.ts';
export {
  importPack, importDecoded, placeImported, mixGroupOf,
  type ImportOptions, type ImportPreview, type ImportResult, type PlaceImportedOptions,
} from './importer.ts';
