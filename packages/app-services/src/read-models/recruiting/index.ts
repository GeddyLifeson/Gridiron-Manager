// @gm/app-services, recruiting board read model (O7.5.1, T4): the board with observed grades only (MA-48),
// reads in words, next allowed contact, acts with hours and the rule each would break, numbers board,
// contact calendar, area, our logged violations and the transfer portal.
export { PARAMS } from './params.ts';
export * from './types.ts';
export {
  buildRecruitingBoardView, gradeView, confidenceOf, nextContactDay, calendarView, listIds, ACT_VERBS, ACT_ORDER, WATCHING_LOOKS,
  type RecruitingBoardInput, type NameSource, type PortalInput,
} from './model.ts';
export { recruitingBoardSpec, RECRUITING_BOARD_MODEL, RECRUITING_BOARD_TASKS, type RecruitingBoardParams, type RecruitingBoardSource } from './spec.ts';
