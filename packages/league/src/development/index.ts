// @gm/league development module (G-20): player development (D7), aging and decline (D8), and the
// college-age parameters (T8.1, T8.2). Pure: numbers come from params.json and tables.json, randomness
// from streams the caller passes, math from the engine's DeterministicMath passed in (P1.1.1).
export { MODULE, PARAMS, TABLES, tableProblems, type DevelopmentTables, p, paramTable, devNumbers, num, interp, bandIndex, type DevNumbers } from './params.ts';
export {
  DEV_CLASSES, DEV_CLASS, BODY_ATTRIBUTES, STRENGTH_LIKE, MOBILITY, MOVEMENT_TECHNIQUE, TENDENCIES, POSITION_FAMILIES,
  POSITION_FAMILY, WORKED, CURVE_GROUP, EXIT_GROUP, GROWTH_GROUP, familyOf, type DevClass, type PositionFamily, type BodyAttribute,
} from './classes.ts';
export { HIDDEN, adultTestKey, peakKey, bodyKey, hiddenNum } from './hidden.ts';
export { growthShares, collegeStrengthProgress, effectiveAge, drawDevelopmentTraits, growBody, type GrowthShares } from './growth.ts';
export { BODY_TESTS, BODY_MOVED, bodyFactors, applyBody, bodyCeilingShift, issPerPercent, strengthWeight, clampIss, type BodyTest } from './body.ts';
export { curvePercent, agingMultiplier, drawAgingYear, rolloverShare, applyAgingFraction, agingRollover, injuryAgeFactor, applyInjuryLoss } from './aging.ts';
export { teachingMultiplier, vacancyMultiplier, userTeachingTerm, traitMultiplier, pointReps, pointProcessingLoad, tendencyStep, type TeachingInput } from './teaching.ts';
export { ageFactor, classRate, stepAttribute, stepForm, resetForm, developSpan, effectiveCeiling, FACET, type AttributeStep, type SpanInputs } from './gain.ts';
export { ACTIVITIES, WINDOWS, repWeight, creditReps, defaultWeeklyReps, type Activity, type ActivityLine, type Window, type Role } from './reps.ts';
export { measuredExitRate, retireShare, retirementChance, midSeasonRetirementChance, comebackChance, type RetireInput } from './exit.ts';
export { agingOutlook, type OutlookInput, type OutlookLabel } from './outlook.ts';
export { rollover, agingMonth, defaultYearPlan, developYear, type PersonForDevelopment, type WindowPlan } from './season.ts';
export { deltaByAge, mean, sd, slope, driftTest, type SeasonRow, type DeltaCell, type DriftResult } from './calibration.ts';
