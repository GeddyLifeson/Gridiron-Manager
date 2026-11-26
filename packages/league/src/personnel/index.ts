// @gm/league personnel module (G-57): roster needs (M1), pro scouting (M3), training camp and cutdown (M6),
// and the role labels and flags of D6.3. Every grade is a club estimate passed in by the caller (G-19
// scouting output); nothing here reads a true rating. Roster moves file through the roster engine (G-15).
export { RULE_KEYS, campRules, type CampRules } from './keys.ts';
export { PARAMS, P } from './params.ts';
export * from './types.ts';
export {
  checkProfile, profileFor, fitScore, fitPreview, versatileJobs, isVersatile, checkPriority, tierWeight, priorityChange, priorityPanel,
  type PositionPriority,
} from './fit.ts';
export {
  defaultTemplate, templateWarnings, templateTable, needsBoard, DEFAULT_TARGETS, fragility, fragilityBoard, futureNeed, coachShare, gmNeedWeights,
  type RosterTemplate, type TemplateWarning, type TemplateContext, type NeedTargets, type NeedRow, type NeedsInput, type FragilityInput, type Fragility,
  type FutureFlag, type FutureContext, type NeedsMemo, type MemoTerms,
} from './needs.ts';
export {
  assignClubs, hoursForSnaps, averageLookAgeDays, scheduledReviewsMet, queueOrder, planWeek, boardRow, DEFAULT_CUTS, TIER_SHARES, tierOf, tierIndex,
  calibrateTierCuts, bandHalf, tierCell,
  type Scout, type WorkKind, type WorkItem, type ClubLook, type BoardRow, type ColourTier, type TierCuts, type Arrow, type TierCell,
} from './board.ts';
export {
  conditioning, contribution, buildReadyList, removeSigned, clubOrder, signingCost, workoutEvidence, narrowed, workoutWillingness, runWorkout, workoutDay,
  type Availability, type ReadyCandidate, type ReadyColumn, type ReadyListInput, type CoachMark, type CoachOrder, type WorkoutTest, type TraitGroup,
  type Attendee, type WorkoutPlan,
} from './ready.ts';
export {
  chanceGone, reviewWireItem, wireReview, practiceSquadTargets, acceptChance, poachRisk, claimRisk,
  type Recommendation, type WireItemView, type OwnRosterSpot, type ClubAhead, type WireReview, type SquadPlayer, type Read, type Target, type RiskLevel,
} from './wire.ts';
export {
  strengthsAndWeaknesses, summaryKey, proReport, reportStack, voiceChance, standingChange, medicalSection, conductSection, physicalOutcome,
  type EvaluatorReport, type ProReport, type Strength, type VoiceContext, type MedicalLine, type ConductLine,
} from './report.ts';
export {
  proposeLabels, labelsInForce, tell, FLAG_TYPES, CHARACTER_FLAGS, flagRule, severityFor, updateFlags, userFlag, seasonEnd,
  type Unit, type RoleLabel, type UnitRole, type LabelPlayer, type LabelRecord, type FlagType, type Flag, type FlagEvidence,
} from './roles.ts';
export {
  DAY_TYPES, countsAsPadded, checkCampPlan, campCounters, keepViolations, staffCalendar, perDiemCents, installOverloads, campInstallPace,
  missingFromInstall, situationsUncovered, installState,
  type DayType, type CampDay, type CampPlan, type CampRule, type CampViolation, type KeptViolation, type InstallDay,
} from './camp.ts';
export {
  unitWeights, opponentWeight, mixedOpponentWeight, repSummary, splitReps, repCounts, battleCard, battleSplit, battleTimingShare, exposurePerRep,
  techniqueGain, PROHIBITED_DRILLS, drillViolation, exposureRead, jointFightChance, reportDay, mayPracticeInPads, mockGameReadiness,
  type OpponentUnit, type RepLog, type EvidenceWindow, type TraitKind, type BattleKind, type BattleCard, type ContactLevel, type Drill, type ReportResult,
} from './practice.ts';
export {
  snapPlan, planBreaches, preseasonSheet, preseasonTendencyWeight, heldPlayTiming, filmAudience, edgeReport, bandAfter, productionNote,
  type CampStyle, type SnapPlanPlayer, type SnapPlan, type PlayRef, type SnapGrade, type EdgeReport,
} from './preseason.ts';
export {
  COLUMNS, cutLines, staffBoard, checkBoard, cutdownTransaction, submitBoard, ownPlayer, assistantGrade, meetingHours, opinionsMissing, overruleTrust,
  talkMinutes, practiceSquadAcceptance, releaseDayReputation, claimWithRelease,
  type Column, type CutdownPlayer, type Board, type BoardCheck, type ReserveAssignment, type Delivery,
} from './cutdown.ts';
