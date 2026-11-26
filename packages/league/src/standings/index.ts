// Standings, tiebreakers, clinching and odds (C3.1 to C3.3, T3.3). Entry point of the module; the
// integrator re-exports it from the package barrel under a namespace.
export * from './types.ts';
export { RULE_KEYS, PARAMS, KEY, RESTART_ON_THREE, CONTINUE_ON_THREE, ruleValueProblems, STANDINGS_MODULE } from './params.ts';
export { Ledger, standingsRows, pctOf, resultFromGameRecord, type ClubGame } from './records.ts';
export { Tiebreaker, LISTS, decidingStep, type StepId, type ListId, type TieFamily, type TieLogEntry, type TiebreakerOptions } from './tiebreak.ts';
export { seasonTable, type SeasonTable, type DivisionRanking, type ConferenceSeeds } from './seeding.ts';
export { clinchStatus, playoffOdds, hypotheticalResult, type RemainingGame, type ClinchStatus, type WinModel, type Uniform, type PlayoffOdds } from './clinch.ts';
export { conferenceStandings, STARTING_CHAIN, type CollegeStepId, type ConferenceInput, type ConferenceStandings, type TitleMethod, type CollegeTieLogEntry } from './college.ts';
