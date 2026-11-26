// Player aging and roster turnover in the off-screen world (D7, D8, C7, C8, M6, T4, T5, X11, X12.1.2):
// the season-point development pass and the offseason roster cycle, bound to the G-81 loop's
// `development` and `moves` steps. Policy is a port so the front office AI can bind its own board.
export { MODULE, PARAMS, param, RULE_KEY } from './params.ts';
export { PLAYER_RETIRED, ELIGIBILITY_ENDED, PLAYER_DRAFTED, PLAYER_SIGNED, LEFT_UNSIGNED, TURNOVER_EVENT_TYPES } from './events.ts';
export {
  levelOfTeam, specOf, positionTargets, gradeContext, rosteredSet, ageIn,
  type Level, type RuleRead, type RosterPolicy, type TurnoverBinding, type GradeContext, type Phase, type PolicyContext,
} from './binding.ts';
export { STREAM_DEVELOPMENT, advanceCounters, hasEligibility, developmentStep } from './development.ts';
export { POOL, FREE_AGENT_PREFIX, STREAM_MOVES, ruleSetOf, rosterMovesStep } from './moves.ts';
export { STREAM_GM, STREAM_DRAW, ageCurve, gmPolicy } from './front-office.ts';
