// Coach AI game management (K5, G-59): clock, timeouts, fourth downs, tries, challenges, penalty options,
// tosses and rest decisions for an AI head coach, and for the user's staff when he delegates (K6.2.2).
export * from './types.ts';
export { RULE_KEYS, PARAMS, ERROR_LIST, ERROR_IDS, param, type ErrorId, type ParamRow, type RuleKeyRow } from './params.ts';
export { decide, modelLine, ManagementError, PTS, type MethodInput, type MethodResult } from './method.ts';
export { errorChance, errorHappens, type ErrorContext } from './errors.ts';
export { chartBase, chartRules, kickoffToOpponent, oneScore, scoresApart, scrimmageState, wpOf, type StateChange } from './state.ts';
export { fourthDown, fourthDownOffsetPts, twoDownTerritory, type FourthDownInput, type FourthDownResult } from './fourth-down.ts';
export { tryChoice, type TryInput, type TryResult } from './try.ts';
export {
  allowScore, clockPlan, endOfHalf, kneelSlackS, kneelWins, soundMode,
  type ClockConstraint, type ClockInput, type ClockMode, type ClockPlan, type HalfPlan, type TempoEstimates,
} from './clock.ts';
export { foulCostPts, timeoutDecision, timeoutValuePts, type TimeoutInput, type TimeoutMoment, type TimeoutResult } from './timeouts.ts';
export { challengeCostPts, challengeDecision, type ChallengeAspect, type ChallengeInput, type ChallengeResult } from './challenge.ts';
export {
  overtimeChoice, penaltyChoice, restForSeason, restInGame, restThreshold, runoffChoice, tossCall, tossChoice,
  type Election, type RestInput, type TossInput, type ValuedOption,
} from './elections.ts';
export { createManagementDecider, type DecisionLike, type ManagementDecider, type OptionIds, type RequestLike, type RequestType, type StaffPort, type ViewLike } from './decider.ts';
