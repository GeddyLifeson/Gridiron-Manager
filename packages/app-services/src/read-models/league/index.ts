// @gm/app-services, league pages read models (unbuilt-work item 5): standings, schedule, team page,
// transactions, news, awards and records. The integrator adds `export * as leaguePages from
// './read-models/league/index.ts'` to the package barrel.
export * from './types.ts';
export { buildStandings, observedResults, type StandingsSource } from './standings.ts';
export { buildSchedule, teamRows } from './schedule.ts';
export { buildTeamPage } from './team.ts';
export { buildTransactions, buildNews, type WireContext } from './wire.ts';
export { buildRecords, type RecordsSource } from './records.ts';
export { leagueSpecs, LEAGUE_MODELS, LEAGUE_SCREEN_IDS, type LeagueSchemas, type LeagueSources } from './spec.ts';
