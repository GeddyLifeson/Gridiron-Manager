// The new-game flow (Marlon 2026-11-26; X10.1, X10.3, E1.7): coach, history length, the history played
// with progress, the review in the legends browser, rerun with a fresh seed, then the career start.
export { appWorldContent, type AppWorldContent } from './content.ts';
export { bindDraft, draftSetup, type DraftSetupInput, type DraftParts, type BindingOptions } from './binding.ts';
export { FALLBACK_BAKED, MEASURED_SECONDS_PER_SEASON_SMALL, bakedFingerprint, type BakedHistory, type LeagueShape } from './baked.ts';
export {
  GAME_VERSION, RULE_SET_OF_LEVEL, historyChoices, worldChoiceProblems, estimate, runDraft, reviewOf, creationWorld, coachRules, validateCoach, startCareer,
  type HistoryChoice, type WorldChoice, type Estimate, type Progress, type Draft, type DraftReview, type ReviewTeam, type ReviewSeason, type ReviewCoach,
  type ReviewHall, type CareerStart, type StartResult,
} from './session.ts';
export { draftLegends, draftSearchIndex, type DraftLegendsData, type DraftLegendsQuery, type DraftLink } from './legends.ts';
export {
  createHandler, workerClient, serveWorker, inlineClient,
  type CoachOptions, type HandlerOptions, type Request, type Message, type StartReply, type WorkerLike, type StartOutcome, type NewGameClient,
} from './client.ts';
