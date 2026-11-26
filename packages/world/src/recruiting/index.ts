// Off-screen recruiting (T4, X12.1.1): the G-36 recruiting week run for every college program in the live
// world, inside the `moves` slot, with its state in `LiveWorld.systemState`. See README.md for decisions.
export { MODULE, PARAMS, param } from './params.ts';
export { formulaPeriods, projectedFiles, RecruitingCalendar, wednesdayOnOrAfter, dayOfWorld, cycleOpen, recruitingCalendarDays } from './calendar.ts';
export {
  RECRUITING_KEY, STREAM_RECRUITING, recruitingOf, groupOf, recruitingLevels, trueQuality, recruitingRules, passBinding, recruitingCalendar,
  type WorldRecruiting, type RecruitingBinding, type PassBinding,
} from './binding.ts';
export { circleIds, runRecruiting, lettersPolicy, movesWithRecruiting } from './step.ts';
export { gmRecruitingPolicy } from './policy.ts';
