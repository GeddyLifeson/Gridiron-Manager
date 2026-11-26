// The season session the browser app plays a season and its games through (handoff "Let the player start and play a game", item A).
export { SeasonPlay, contentKeyOfWorldTeam, type WorldTeams, type WorldSeasonOptions, type SeasonPlayOptions, type SeasonPlaySave, type SeatGame, type GameHost, type SeasonToday, type StandingRow } from './season-session.ts';
export { CareerYear, seasonSeedHex, type CareerYearOptions, type CareerYearSave, type CareerYearView } from './career-year.ts';
export { encodePlain, decodePlain } from './plain.ts';
export { PracticeDesk, practiceRules, assignContextOf, STAFF_WEEK, PRACTICE_SHAPES, type PracticePlan, type PlanCheck, type PracticeRecord, type PracticeDeskSave, type PracticeLevel } from './practice-desk.ts';
export { ScoutingDesk, GAME_SNAPS, type ScoutingDeskSave, type ObservedPlayer } from './scouting-desk.ts';
export { RecruitingDesk, type QueuedAct, type ActRecord, type RecruitingDeskSave } from './recruiting-desk.ts';
export { writeCareerYear, readCareerYear, readLiveWorldMeta, LIVE_WORLD_TABLE, LIVE_WORLD_SAVE_VERSION, type LiveWorldMeta } from './career-save.ts';
export { seatTeamFromDepth, engineUnits, slotOrder, simPlayerFromPerson, SLOTS, type SeatDepth, type SeatTeam, type EngineUnitMap } from './seat-depth.ts';
// The generated world as the seat sees it, for the team screens (handoff item 2c).
export { liveWorldTables, seatObserver, seatObservedWorld, teamCircle, rosterLimits, WORLD_ROSTER_LIST } from './team-world.ts';
export { FootballDesk, bookContent, installUnits, normalPracticeDays, type FootballDeskOptions, type DeskResult, type DeskSide, type InstallMode } from './football-desk.ts';
