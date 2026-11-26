// league/src/awards (G-43): awards, records, halls of fame, coaching trees and the X4 notability pass.
// The integrator adds `export * as awards from './awards/index.ts'` to the package barrel.
export { MODULE, PARAMS, RULE_KEYS, KEY, BALLOT_OPTIONS, BEFORE_POSTSEASON, AFTER_POSTSEASON, param, ballotPoints, ruleValueProblems, type RuleValues } from './params.ts';
export { HONOURS_FACTS, PROPOSED_RULE_SETS, fact, factStatus, isProvisional, proposedRules, type ProposedRuleSet } from './facts.ts';
export * from './types.ts';
export { HONOUR, HONOUR_EVENT_TYPES, honourDraft, type HonourType, type HonourDraft, type DraftMeta } from './events.ts';
export {
  NOTABILITY_CONTENT, BANDS, scoreParts, scoreEvent, notabilityFor, baseFor, edgeCounts, bandOf, keepLine, isKept,
  consumerThreshold, forConsumer, byScore, inboxWeek,
  type NotabilityContent, type NotabilityContext, type ScoreParts, type EdgeKind, type Consumer, type Closeness,
} from './notability.ts';
export { seasonRollups, careerRollup, vacatedIds, COUNTER, DEFAULT_ROLLUP_TYPES, type RollupTypes, type CareerRollup } from './rollup.ts';
export { WEEKLY_CONTENT, pickWeekly, weeklyDrafts, statScore, skillShare, type WeeklyContent, type WeeklyPick } from './weekly.ts';
export {
  AWARDS_CONTENT, FIRST_TEAM, SECOND_TEAM, coachFeatures, eligibleFor, drawPanel, voteAward, awardDrafts, allLeague, allLeagueDrafts,
  allStars, allStarDrafts, awardSet,
  type AwardDef, type Slot, type AwardsContent, type Candidate, type CoachSeason, type Voter, type Tally, type AwardResult, type Selection, type StarPick,
} from './voting.ts';
export {
  RECORDS_CONTENT, computeBook, seasonGames, mark, breaks, recordWatch, recordDraft, newRecords, coachTotals, coachTable, milestonesCrossed, milestoneDraft,
  type RecordScope, type RecordDef, type RecordsContent, type BookEntry, type RecordBook, type BookFilter, type RecordWatch,
  type CoachSeasonRow, type CoachTotals, type CoachTable,
} from './records.ts';
export { treeEdges, treeHeadCoaches, treeStanding, type StaffSeason, type TreeEdge, type LaterJob } from './tree.ts';
export {
  isEligible, caseScore, yesProbability, runElection, hallDrafts, electionChance, outlookOf,
  type HallMath, type HallCandidate, type BallotResult, type HallClass, type Outlook,
} from './hall.ts';
export { ANCHORS, calibrationReport, historicSeasonCheck, type Measure, type Draftee, type CalibrationRow } from './calibration.ts';
