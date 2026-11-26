// Fatigue and substitution (WP-18; D10, J11.5.1). Entry point of the module; the package entry point
// re-exports it under a namespace. Interfaces the game flow (WP-06) calls:
//   newGame:           gameDayFatigue(...) per player, then ceilingsOf(teams)
//   each dead ball:    benchAfterPlay(state.gameDay, {...}) replaces the flow's own bench bookkeeping
//   timeouts, breaks:  benchAtBreak(state.gameDay, kind, ceilings)
//   before each call:  staffReads(...) then chooseLineup(...) per side; emit its `substitution` events
//   after each play:   ledgerAfterPlay(...) per side (rebuilt from play records on replay)
export { BENCH_MODULE, BENCH_VERSION, RULE_KEYS, PARAMS, benchParamTable } from './params.ts';
export { environmentFactors, shortTermTauS, shortTermRecoveredShare, benchRecoveredShare, spendEnergy, rest, restBreak, NEUTRAL_FACTORS } from './freshness.ts';
export type { FreshnessDeps, EnvironmentExposure, EnvironmentFactors, BreakKind } from './freshness.ts';
export { benchAfterPlay, benchAtBreak, ceilingsOf } from './between-plays.ts';
export type { InjuryNotice, AfterPlayInput, BenchDeps, Ceilings } from './between-plays.ts';
export {
  chooseLineup, staffReads, floorOf, available, defenseMaySubstitute, ledgerAfterPlay, shareOf, EMPTY_LEDGER, DEFAULT_PLAN,
} from './lineup.ts';
export type { FloorWord, PlayerPlan, RotationPlan, StaffRead, BenchLedger, LineupRequest, Lineup } from './lineup.ts';
export {
  conditioningAfterWeek, conditioningAfterLayoff, dayLoad, acuteLoad, chronicLoad, ageFactor, weeklyTolerance, debtAfterDay,
  debtBand, bandEffects, seasonWear, wearEffects, startingLongTerm, gameDayFatigue,
} from './load.ts';
export type { DayActivity, DebtBand, BandEffects, GameDayStartInput } from './load.ts';
export { REFERENCE_SHARES_PRO, REFERENCE_SHARES_STATUS, REFERENCE_SHARES_LEAF } from './reference-shares.ts';
export type { ReferenceShareRow } from './reference-shares.ts';
