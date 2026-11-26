// @gm/league, college module (G-37): eligibility, transfers, player pay and the college player (T5, T6,
// T7, T8.3 to T8.5). Every rule value is read by key (keys.ts); tuning constants are in params.json.
// Rule-breaking acts are built here and committed by the compliance pipeline (G-28, L8.2.5).
export { RULE_KEYS, collegeRules, revenueShareCapFor, academicYearSuffix, ELIGIBILITY_MODELS, type CollegeRules, type EligibilityModelOption } from './keys.ts';
export { PARAMS, param, pow2 } from './params.ts';
export * from './types.ts';
export * from './eligibility.ts';
export * from './academic.ts';
export * from './transfer.ts';
export * from './pay.ts';
export * from './draft.ts';
export * from './planning.ts';
export * from './violations.ts';
