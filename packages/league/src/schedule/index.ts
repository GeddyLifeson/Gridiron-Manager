// G-13 schedule generator, pro (C2) and college (T3.1). Entry point of the module; the integrator
// re-exports it from the package barrel as a namespace.
export * from './types.ts';
export { RULE_KEYS, PARAMS } from './params.ts';
export { proPairings, verifyPairings, rotationYear, checkLeagueShape, type RotationYear } from './pro-opponents.ts';
export { solveWeeks, scoreWeeks, type WeekProblem, type WeekSolution, type WeekConstraintIntl, type CostBreakdown } from './pro-weeks.ts';
export { chooseInternational, type IntlGame } from './pro-international.ts';
export { assignSlots, isPrimeTime, type SlotInput } from './pro-slots.ts';
export { proPreseason, type PreseasonResult } from './pro-preseason.ts';
export { generateProSeason } from './pro.ts';
export { weekTypes, tagForDays, bodyClockKickoffMinutes, type WeekTag, type WeekTypeRow } from './week-types.ts';
export { flexWeek, flexWindowOpen, slotWeek18, type FlexUsage, type ScheduleChange } from './flex.ts';
export { scheduleReport, winPct, type ScheduleReport, type Record3, type Place } from './report.ts';
export { orientBalanced, type OrientEdge } from './balance.ts';
export {
  generateCollegeSeason, conferenceGameCounts, protectedPairs, rotatingPairs, rotationCycle,
  type CollegeTeam, type CollegeConference, type Rivalry, type NeutralVenue, type Meeting, type MeetingHistory,
  type Contract, type CollegeSeasonInput, type CollegeSchedule,
} from './college.ts';
export { distanceKm, zoneOffset } from './util.ts';
