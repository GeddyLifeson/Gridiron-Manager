// Week screens (G-69, item 9): the schedule (`week.schedule`), meetings (`week.meetings`), travel
// (`week.travel`) and game-week documents (`week.documents`) route entries.
export { WeekSchedule, weekScheduleRoute, type WeekScheduleView } from './WeekSchedule.tsx';
export { MeetingsScreen, meetingsRoute, type MeetingsScreenView, type MeetingCommand } from './MeetingsScreen.tsx';
export { TravelScreen, travelRoute, type TravelScreenView } from './TravelScreen.tsx';
export { DocumentsScreen, documentsRoute, type DocumentsScreenView, type DocumentCommand } from './DocumentsScreen.tsx';

/** Registry ids of the week screens built here. */
export const WEEK_SCREEN_IDS = { schedule: 'week.schedule', meetings: 'week.meetings', travel: 'week.travel', documents: 'week.documents' } as const;
