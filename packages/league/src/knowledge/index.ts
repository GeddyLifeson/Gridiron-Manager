// @gm/league knowledge module (G-64): scheme knowledge and readiness (D9) and the install plan (G5).
// Pure: numbers from params.json, randomness from streams the caller passes, math from the engine's
// DeterministicMath passed in (P1.1.1). True knowledge is truth-class; only estimates reach read models.
export { MODULE, PARAMS, p, knowledgeNumbers, num, clampK, type KnowledgeNumbers } from './params.ts';
export { ITEM_LEVELS, ItemCatalogue, playWarnings, type ItemLevel, type KnowledgeItem, type Assignment, type CalledPlay, type PlayWarning } from './items.ts';
export { KnowledgeBook, type KnowledgeCell, type KnowledgeRow } from './book.ts';
export {
  MODES, MINUTE_MODES, AVERAGE_LEARNER, crowding, teacherFactor, modeCap, modeBase, units, attentiveMinutes, unitRate, gainFrom, teach,
  type TeachMode, type TeachingEvent, type Learner,
} from './gain.ts';
export { similarityProblems, carryFamilies, seedNewcomer, type PriorFamily, type SimilarityLink, type CarryResult } from './carryover.ts';
export { ERROR_TYPES, baseErrorChance, difficultyFactor, processingDelay, errorChance, drawPlayErrors, type KnowledgeErrorType, type ErrorChanceInput, type AssignmentDraw } from './errors.ts';
export { UNITS, weightedSnaps, pairCohesion, unitCohesion, cohesionEffects, type CohesionUnit, type PairCounts, type Apart, type CohesionEffects } from './cohesion.ts';
export { COACH_SKILL, estimateSd, optimistBias, estimateKnowledge, type CoachSkill, type Observation } from './estimate.ts';
export {
  playReadiness, callReadiness, recognitionBonus, prepAfterGame, formerOpponentPrep, readinessReport, lateScratch,
  type EstimateOf, type SheetCall, type LowPlayer, type CallReadiness, type OpponentLook, type ReadinessReport,
} from './readiness.ts';
export {
  installOrder, canSchedule, isInstalled, dailyLimitSplit, defaultCampCycle, WEEKLY_TEMPLATE, planWeek, isFading, alwaysUpReps,
  backupQbSplit, catchUpPackage, extraMeetingCost,
  type InstallUnit, type CampDay, type PlanCall, type PlannedCall, type WeekPlanInput, type WeekPlan,
} from './install.ts';
