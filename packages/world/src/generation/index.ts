// World generation (G-81; X10, U4.1): the setup record and world code, the build order from content,
// founding people and cultures, and placing imported people and the user after the history run.
export { MODULE, PARAMS, param } from './params.ts';
export { sha256, bytesToHex } from './sha256.ts';
export { foundingCurveRows, defaultFoundingCurves, type FoundingCurveRow } from './founding-curves.ts';
export { STREAM_LOST_CLUBS, lostClubData, lostClubCount, lostClubSpans, addLostClubs, type LostClubData, type LostClubSpan, type LostClubsResult } from './lost-clubs.ts';
export {
  SIZE_PRESETS, SETUP_FIELDS, FORBIDDEN_SETUP_WORDS, historyPresets, seedHexFromText, setupFieldProblems, setupProblems, createSetup,
  canonicalSetup, setupHashHex, setupSeed, setupAsGeneratorOptions, type SizePreset, type PackRef, type SetupRecord,
  footballStartYear, fullHistorySeasons, historyPresetsFor, firstSeasonFor, historyChoiceProblems,
} from './setup.ts';
export { worldCodeFields, encodeWorldCode, worldCode, decodeWorldCode, worldCodeMismatches, type WorldCodeFields, type DecodeResult } from './code.ts';
export type {
  ContentStadium, ContentClub, ContentProLeague, ContentSchool, ContentCollege, ContentLocation, LevelSpec, BlockedTerms, WorldContent, PersonNameSource,
} from './content.ts';
export {
  STRUCTURE_STEPS, STREAM_STRUCTURE, blockedTermHits, buildStructures, structureProblems,
  type StructureStep, type ResourceBand, type PlaceRecord, type BuiltStructures, type StructureOptions,
} from './structures.ts';
export { STREAM_FOUNDING, STREAM_CULTURE, scaleMix, curveAge, triangularAge, foundPeople, foundingProblems, type FoundingResult, type OffLadderSeat } from './founding.ts';
export {
  PLACEMENT_ORDER, FREE_AGENT_POOL, COACH_POOL, nameCollisions, placeImported, placeUser,
  type PlacementKind, type Placement, type PlacementPorts, type PlacementReport, type BackgroundFact, type UserPlacement,
} from './placement.ts';
export {
  CONTENT_VERSION, RULE_KEYS, levelNumbers, rosterTierShares, makeNameSource, makeHomeRegionSource, defaultContent,
  type RuleLookup, type DefaultContentInput, type RawContent,
} from './default-content.ts';
