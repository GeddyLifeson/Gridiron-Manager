// Defensive call designer (G-91; bible G2, O3.2): the call object, its resolution against any offensive
// look, the designer's analyses, checks and adjustments, validation, the board test plan, and the compile
// step to engine assignments. Pure; the screen reads it through app-services.
export * from './types.ts';
export { PARAMS, MODULE, param } from './params.ts';
export { RULE_KEYS, fieldGeometry, type FieldGeometry } from './keys.ts';
export { LOOKS, LOOK_BY_ID, afterMotion } from './looks.ts';
export { readLook, declare, sideOf, dividerYd, type Reading, type Declared } from './geometry.ts';
export { resolve, zoneRect, techLabel, travelTimeS, gapY, firstCheck, type Resolution, type Defender, type ResolvedJob, type Rect } from './resolve.ts';
export { gapTable, baseFits, fitTable, boxDefenders, conflicts, stuntName, stuntReport, pressureReport, coverageReport, holes, zonePos, matchConsistency, RUN_FAMILIES, COMBOS, type GapRow, type FitTable, type PressureReport, type CoverageReport, type HoleMap, type MatchConflict, type StuntReport } from './analysis.ts';
export { motionOutcome, tempoOutcome, disguiseReport, shiftRedeclares, type MotionOutcome, type TempoInput, type TempoOutcome, type DisguiseRow } from './adjust.ts';
export { validateCall, refuseReason, type Validation, type Finding, type Severity } from './validate.ts';
export { proposePlan, runPair, type TestPair, type PairResult, type PlanInput } from './testplan.ts';
export { compileCall } from './compile.ts';
export { DESIGNER_CALLS, OVER_3_SKY, NICKEL_1_ROBBER, NICKEL_QUARTERS, NICKEL_FIRE_ZONE, BASE_0_SIX, BASE_TAMPA_2 } from './calls.ts';
