// @gm/league, roster module (G-15): roster lists and limits, the practice squad, reserve lists, waivers,
// the cutdown, the game-day active list and the weekly roster cycle (C5, T5.1, H6.1, H6.2). One
// transaction engine for the user and AI clubs alike (C5.7.1). Every limit is read by key (keys.ts).
export { RULE_KEYS, rosterRules, type RosterRules } from './keys.ts';
export { PARAMS } from './params.ts';
export * from './types.ts';
export { isVested, subjectToWaivers, practiceSquadGroup, practiceSquadGroupCaps, type PracticeSquadGroup } from './eligibility.ts';
export {
  applyTransaction, applyEvent, emptyLeagueRosters, validateRosters, waiverOrder, clubCounts, rosterLimit,
  allowedDesignations, effectiveDay, claimDeadline, absHour, fromAbsHour, type ClubCounts,
} from './engine.ts';
export { validateGameDayList, gameDayCandidates, activeLimitFor, emergencyQbMayPlay, gameDayListLocked, type GameDayList, type GameDayVerdict } from './gameday.ts';
export { weeklyRosterMarkers, markerStatus, deciderFor, moveButton, type RosterMarker, type MarkerType, type MarkerStatus, type WeekInput, type PowerArrangement, type Decider, type DecidedMove } from './week.ts';
export { toRosterSlots } from './slots.ts';
