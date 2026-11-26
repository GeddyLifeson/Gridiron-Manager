// Statistics and play-by-play (WP-07; D14.1.1, D14.2.1, J11.9.1, P3.1.1, P4.6.1).
// Entry point of the module. The package entry point re-exports it; nothing else is public.
export { STATS_MODULE, RULE_KEYS, PARAMS, FIELD_GOAL_BANDS, fieldGoalBand, paramTableOf } from './params.ts';
export { STAT_CATALOGUE, SEASON_COLUMNS_SKIPPED, SEASON_TABLE_COLUMNS, catalogueRow } from './catalogue.ts';
export type { StatCatalogueRow, StatGroup, StatAggregate, ConventionStatus } from './catalogue.ts';
export { DETAIL_CODES, readPlay, enforcedPenalties, wholeYardsBetween } from './facts.ts';
export type { StatsDeps, PlayFacts, BasePlay, FumbleFact, ReturnFact, PuntFact, PlaceKickFact, EnforcedPenalty } from './facts.ts';
export { credits, boxScore, playsBehind } from './credits.ts';
export type { StatLine, BoxScore } from './credits.ts';
export { playByPlay, renderPlayText, PLAY_TEXT_TEMPLATES } from './play-by-play.ts';
export type { TextTemplate, TextParamType } from './play-by-play.ts';
export { PUBLIC_COLUMNS, CALIBRATION_SCRIPT_COLUMNS, publicRow, publicRows, publicCsv } from './public-columns.ts';
export type { PublicColumn, PublicRow, PublicValue, PublicExportContext, ColumnOrigin } from './public-columns.ts';
export { summary } from './summary.ts';
export type { SummaryFinal } from './summary.ts';
export { createStatsModule } from './module.ts';
export type { StatsModuleInput, BoundStatsModule } from './module.ts';
