// The off-screen loop (G-81; X12.1, X12.3) and the history run (X10.3): one fixed weekly order, the
// season-point passes, leaving the world, stop points, and the validator and time budget of the run.
export { MODULE, PARAMS, param } from './params.ts';
export {
  WORLD_FOUNDED, HISTORY_RUN_ENDED, WENT_INACTIVE, RETURNED_ACTIVE, DIED, DEADLINE_LAPSED, IMPORT_PLACED, RELEASED, USER_BACKGROUND,
  TEAM_FOUNDED, TEAM_FOLDED, TITLE_WON, WORLD_EVENT_TYPES, RELEASED_FALLBACK, TITLE_WON_FALLBACK, worldEventTypes,
} from './events.ts';
export {
  WEEKLY_ORDER, SEASON_POINT_ORDER, STEP_OWNER, GAME_INJURIES_KEY,
  type WeeklyStep, type SeasonStep, type StepId, type PersonStatus, type Scalar, type GameResult, type StaffSeason, type SeasonSummary, type TeamRecordLine,
  type LiveWorld, type StepContext, type StepDigest, type StepHandler, type WorldSystems, type SchedulePort, type ScheduledGame,
  type GameRequest, type GamePlayed, type GameInjury, type WeekInjuries, type GamePort, type GameBatchPort,
} from './types.ts';
export { createWorld, steppedSeed, type CreateWorldInput } from './world.ts';
export {
  unbound, unboundSteps, systemsFrom, runWeek, runSeasonPoint, runSeason, summarizeSeason, recordStaffSeason, gamesStep, gamesStepBatch, batchOf, compactionStep, worldHash,
  type PassOptions,
} from './order.ts';
export { STREAM_LEAVING, DEFAULT_UNCLAIMED_POOLS, periodMortality, yearlyDeathChance, deathTableProblems, employedIds, ageOf, leavingStep, reactivate, searchable, type LeavingPorts } from './leaving.ts';
export { GENERATED_COHORTS, cohortStep, type CohortBinding } from './cohorts.ts';
export {
  STOP_KINDS, userDutyIds, isUsers, stopsThrough, stopProblems, advance,
  type StopKind, type PendingItem, type StopPoint, type AdvanceMode, type AdvanceResult,
} from './stops.ts';
export {
  importedPeople, runHistory, historyRunScan, headCoachTenures, coachingTreeDepth, validateHistory, buildWithHistory,
  rerunSeedHex, draftHistory, historySeconds, gameMsForTarget, scaledEstimate, estimateWithinTolerance, gamesInSeason,
  type HistoryPlan, type HistoryRunReport, type ValidatorBands, type ValidationResult, type BuiltHistory, type BudgetInput, type HistoryDraft,
} from './history.ts';
export {
  STREAM_LIFECYCLE, curveFor, curveProblems, foundingYear, planTeamSpans, isActive, activeTeamIds, awaitingFounding, lifecycleStep,
  type TeamSpan, type FoundingCurve, type LifecycleBinding,
} from './lifecycle.ts';
export {
  STREAM_HALL, HALL_REQUIRED_KEYS, hallRuleGaps, emptyHallState, defaultHalls, leagueFirstSeason, hallOpens, recordHallSeason, treeHeadCoachCount, hallCandidates, hallStep,
  type CoachSeasonRow, type PlayerLine, type HallMember, type HallBallotRecord, type HallState, type HallSpec, type HallBinding,
} from './hall.ts';
export { STREAM_HISTORY_SCHEDULE, seasonOrder, circleRound, roundsFor, historySchedule, type HistoryScheduleBinding } from './history-schedule.ts';
export { slimmable, slimRetired, slimStep, withSlimming, ARCHIVE_KEY, archivePerson, archivedCount, archivedPerson, type ArchiveState, type ArchivedPerson } from './archive.ts';
