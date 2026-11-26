// @gm/app-services, week screens' read models (item 9): schedule (H1), practice planner (H3), meetings
// (H4), travel (H8), game-week documents (H9) and the press conference (H7.2, O4.5.2).
export { PARAMS } from './params.ts';
export * from './types.ts';
export { buildMeetingsView, agendaRows, meetingType, ITEM_KINDS, type MeetingsInput } from './meetings.ts';
export { buildTravelView, bodyKickoff, type TravelInput } from './travel.ts';
export { buildDocumentsView, docActions, type DocumentsInput } from './documents.ts';
export { buildPressView, choicesFor, sessionKindFor, weekSessions, type PressConference } from './press.ts';
export { weekSpecs, WEEK_MODELS, WEEK_TASKS, type WeekSources, type WeekSchemas, type ScheduleInput } from './spec.ts';
