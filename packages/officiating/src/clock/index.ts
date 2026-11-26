// @gm/officiating, clock module (WP-02): game clock, play clock, timeouts, period ends (B1, B13.3, J11.4, J11.8.1).
export { clockRules, afterPlayWithFacts, periodTiming, tenthsOf, type PeriodTiming } from './clock.ts';
export { NO_CLOCK_FACTS, type ClockFacts } from './facts.ts';
export {
  playClockAfterStoppage, settleRunoff, defenseConservesTime, advanceBetweenDowns, injuryTimeout, PLAY_CLOCK_RUNS,
  type StoppageCause, type RunoffChoice, type RunoffResult, type InjuryTimeoutInput, type InjuryTimeoutResult,
} from './tables.ts';
export { RULE_KEYS, PARAMS } from './params.ts';
