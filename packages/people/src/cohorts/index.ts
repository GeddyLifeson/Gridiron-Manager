// Yearly cohorts (G-44; X11.1 to X11.4). People enter on calendar dates (G-12 delivers `CohortEntered`
// after exits and vacancies), sized against the X11.2.1 targets, validated and reseeded (X11.2.2), name
// guarded against loaded packs (X11.4.2). Generation itself is G-17's (D13); this module never reads
// another person's attributes or traits to build a new one (X11.4.1).
export { PARAMS, param } from './params.ts';
export {
  COHORT_KINDS, KIND_MAKEUP, SAME_DATE_STAGES, isCohortKind, orderSameDate, oneCohortPerSeason, undraftedOnDraftEnd,
  type CohortKind, type SameDateStage, type CohortCalendarEvent,
} from './kinds.ts';
export {
  COHORT_FACTS, PRO_ENTRY_AGE_SHARES, cohortFact, factStatus, cohortTarget, coachEntrySize, sizeWithinTolerance, weakest,
  type WorldScale, type CohortTarget,
} from './targets.ts';
export { entryAge, startingStress, dayOneProblems, median, proPoolAgesPass, DAY_ONE_EDGE_KINDS, type Newcomer } from './day-one.ts';
export { COACH_BACKGROUNDS, planCoachEntry, unplacedLeavers, unplacedShareInBand, ladderSpeedInBand, type CoachBackground, type CoachEntryPlan } from './coach-entry.ts';
export { fillBossChair, planReporters, bossChairProblems, type BossChair, type BossFill, type ReporterPlan } from './renewal.ts';
export {
  FACET_BANDS, facetBand, bandShares, identityKey, validateCohort, buildValidatedCohort, attemptScope,
  type FacetBand, type BandShares, type CohortProblem, type ValidatedCohort,
} from './validate.ts';
export { stockProblems, populationStable, proAgeBandProblems, coachRetirementChance, type StockSeason, type ProSoakAges } from './stock.ts';
export { fillTopUp, backdatedEvents, existingShareInBand, type TopUpNeed, type TopUpFill } from './top-up.ts';
export { SHORT_FORMS, normalizeName, PackNameIndex, guardName, packImportsToSkip, familyEdgeProblems, type NameDraw, type GuardedName } from './identity.ts';
export {
  COHORT_ENTERED, COHORT_VALIDATION_WARNING, COHORT_EVENT_TYPES, STREAM_COHORT, runCohort, formUndraftedPool, countByLevel,
  type CohortEmitInput, type OpenStream, type CohortRun, type CohortResult,
} from './run.ts';
