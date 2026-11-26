// Person generator and attributes (G-17; D1 to D5, D13.2, D13.4, X1, X1.2).
// Output is truth (P3.2.2 PersonRecord). Estimates and grades are G-19's (D6); nothing here builds a view.
export { PARAMS, param, TIER_SHARES, TIER_CEILING_MEAN, TIER_BODY_SHIFT_SD, TIER_BODY_WIDEN, AGE_GAP_ISS, GROWTH_TABLE } from './params.ts';
export { PROFILE_POSITIONS, MAIN_POSITIONS, POSITION_TO_PROFILE, GROUPS, PHYSICAL, POSITION_RELEVANCE, RELEVANCE_OFFSET_ISS, profileOf, groupOf, type ProfilePosition } from './catalogue.ts';
export { proProfile, PROFILE_VARS, WORSE_DIRECTION, type Profile, type ProfileVar } from './profiles.ts';
export { PROFILE_SOURCE } from './data/pro-profiles.ts';
export { percentile, NORM_TESTS, TIMED, D25_QUANTILES, SKEWED_CELLS, type NormTest } from './norms.ts';
export { plausibilityWarnings, RECORD_LIMITS, type PlausibilityWarning } from './plausibility.ts';
export { growthShare, youthBody, type BodyVector, type Tier } from './body.ts';
export {
  drawTraitBlock, neutralTraitBlock, X1_FACETS, D5_PLAYER_FACETS, X1_VALUES, GOALS, POPULATION_GROUPS, POPULATION_OVERRIDES,
  type PopulationGroup, type TraitRequest,
} from './traits.ts';
export {
  generatePlayer, placeholderNames, GENERATOR_VERSION, STREAM_GEN, STREAM_TRAITS, TEST_PARTICIPATION,
  type GeneratorRandom, type ClassKey, type Talent, type PlayerRequest, type NameSource, type GeneratedPlayer, type BodyExtras,
} from './generate.ts';
export { generateNonPlayer, type NonPlayerRequest } from './non-player.ts';
export {
  meanSd, classStats, validateClass, generateValidatedClass, intakeSize, nextTalentCorrection, correctionIss, bodyDriftAlarms,
  type ClassStats, type ClassTargets, type ValidatorProblem, type TalentCorrection, type MeanSd,
} from './guards.ts';
export { normalCdf, normalInv } from './normal.ts';
