// The shell's route table (O1, P1.2.2): one place where each screen package's route factory is bound to
// its screens.json id. Integrator-owned. A screen whose source is not supplied stays a placeholder, so the
// composition root (shell-browser, desktop, tests) can wire screens one at a time as read models land.
// Every key this table can produce is a screens.json id (test/routes.test.ts).
import type { RouteEntry, RouteTable } from './shell/Shell.tsx';
import { rosterMovesRoute, SCREEN_ID as ROSTER_MOVES_SCREEN_ID } from './screens/roster-moves/index.ts';
import { gameFrameRoutes } from './screens/game-frame/index.ts';
import { scoutingRoutes } from './screens/scouting/index.ts';
import { analyticsRoute, ANALYTICS_SCREEN_ID } from './screens/analytics/index.ts';
import { weekScheduleRoute } from './screens/week/index.ts';
import { filmRoutes } from './screens/film/index.ts';
import { careerRoutes, assignmentsRoute } from './screens/career/index.ts';
import { schoolRoute, SCHOOL_SCREEN_IDS } from './screens/school/index.ts';
import { gameCallingRoutes } from './screens/game-calling/index.ts';
import { defenseDesignerRoute, DEFENSE_DESIGNER_SCREEN_ID } from './screens/defense-designer/index.ts';
import { playDesignerRoute, PLAY_DESIGNER_SCREEN_ID } from './screens/play-designer/index.ts';
import { settingsRoute, SETTINGS_SCREEN_ID } from './screens/settings/index.ts';
import { playerDesignerRoute, SCREEN_ID as PLAYER_DESIGNER_SCREEN_ID } from './screens/player-designer/index.ts';
import { editorsRoute, SCREEN_ID as EDITORS_SCREEN_ID } from './screens/editors/index.ts';
import { practicePlannerRoute } from './screens/practice/index.ts';
import { homeRoutes } from './screens/home/index.ts';
import { peopleRoutes } from './screens/people/index.ts';
import { legendsRoute, LEGENDS_SCREEN_ID } from './screens/legends/index.ts';
import { gamePlanRoute, callSheetRoute, PLAN_SCREEN_ID, SHEET_SCREEN_ID } from './screens/gameplan/index.ts';
import { capRoute, SCREEN_ID as CAP_SCREEN_ID } from './screens/cap/index.ts';
import { depthChartRoute, SCREEN_ID as DEPTH_CHART_SCREEN_ID } from './screens/depth-chart/index.ts';
import { draftRoomRoute, DRAFT_ROOM_SCREEN_ID } from './screens/draft-room/index.ts';
import { freeAgencyRoute, FREE_AGENCY_SCREEN_ID } from './screens/free-agency/index.ts';

type Args<F extends (...a: never[]) => unknown> = Parameters<F>;

/** What the composition root supplies per screen package. Each field is the factory's own arguments. */
export interface RouteSources {
  readonly rosterMoves?: Args<typeof rosterMovesRoute>[0];
  readonly gameFrame?: Args<typeof gameFrameRoutes>[0];
  readonly scouting?: Args<typeof scoutingRoutes>[0];
  readonly analytics?: { readonly load: Args<typeof analyticsRoute>[0]; readonly openGames?: Args<typeof analyticsRoute>[1] };
  readonly week?: { readonly getModel: Args<typeof weekScheduleRoute>[0]; readonly onOpen?: Args<typeof weekScheduleRoute>[1] };
  readonly film?: Args<typeof filmRoutes>[0];
  readonly career?: Args<typeof careerRoutes>[0];
  /** O7.2.1: the assignment list is the Office screen on every rung below head coach. */
  readonly assignments?: { readonly load: Args<typeof assignmentsRoute>[0]; readonly onOpen?: Args<typeof assignmentsRoute>[1]; readonly onCommand?: Args<typeof assignmentsRoute>[2] };
  readonly school?: { readonly load: Args<typeof schoolRoute>[0]; readonly openLesson?: Args<typeof schoolRoute>[2] };
  /** G-60 console. The G-61 game management panel is drawn inside it through `sideline` (O2.1.2). */
  readonly gameCalling?: Args<typeof gameCallingRoutes>[0];
  readonly defenseDesigner?: { readonly load: Args<typeof defenseDesignerRoute>[0]; readonly handTo?: Args<typeof defenseDesignerRoute>[1] };
  readonly playDesigner?: Args<typeof playDesignerRoute>[0];
  /** G-98 accessibility, input and playback settings (O5). */
  readonly settings?: { readonly host: Args<typeof settingsRoute>[0]; readonly extra?: Args<typeof settingsRoute>[1] };
  /** G-92 player designer (D13.1); normal mode only, never certified (screens.json row). */
  readonly playerDesigner?: Args<typeof playerDesignerRoute>[0];
  /** G-96 mods and editors (P7). */
  readonly editors?: Args<typeof editorsRoute>[0];
  /** G-68 game plan and call sheet (G6, G7); one host serves both screens. */
  readonly gameplan?: Args<typeof gamePlanRoute>[0];
  /** G-65 practice planner, on the registry's week.practice screen (CR-G65-2 names it practice.planner). */
  /** G-72 office screens for the head coach seat. Below head coach the assignment list takes office.today. */
  readonly home?: Args<typeof homeRoutes>[0];
  /** G-72 people screens. */
  readonly people?: Args<typeof peopleRoutes>[0];
  /** G-84 legends browser and chronicle (X3). */
  readonly legends?: { readonly load: Args<typeof legendsRoute>[0]; readonly opts?: Args<typeof legendsRoute>[1] };
  readonly practice?: { readonly getModel: Args<typeof practicePlannerRoute>[0]; readonly onOpen?: Args<typeof practicePlannerRoute>[1] };
  /** Cap sheet or college budget (C6, O4.2). */
  readonly cap?: Args<typeof capRoute>[0];
  /** Depth chart (O4.2.2, M2). */
  readonly depthChart?: Args<typeof depthChartRoute>[0];
  /** Draft room (C7, M4). */
  readonly draftRoom?: Args<typeof draftRoomRoute>[0];
  /** Free agency (C8, M5). */
  readonly freeAgency?: Args<typeof freeAgencyRoute>[0];
}

/** Office screen id that shows the assignment list below head coach (O1.2.1, O7.2.1). */
export const ASSIGNMENTS_SCREEN_ID = 'office.today';
/** Registry id of the week schedule screen. */
export const WEEK_SCHEDULE_SCREEN_ID = 'week.schedule';
/** Registry id of the practice planner screen. */
export const PRACTICE_SCREEN_ID = 'week.practice';

/** Builds the route table from whichever sources are supplied. */
export function buildRoutes(s: RouteSources): RouteTable {
  const t: Record<string, RouteEntry> = {};
  const put = (id: string, e: RouteEntry): void => { t[id] = e; };
  const putAll = (r: RouteTable): void => { for (const [id, e] of Object.entries(r)) put(id, e); };
  if (s.rosterMoves) put(ROSTER_MOVES_SCREEN_ID, rosterMovesRoute(s.rosterMoves));
  if (s.gameFrame) putAll(gameFrameRoutes(s.gameFrame));
  if (s.scouting) putAll(scoutingRoutes(s.scouting));
  if (s.analytics) put(ANALYTICS_SCREEN_ID, analyticsRoute(s.analytics.load, s.analytics.openGames));
  if (s.week) put(WEEK_SCHEDULE_SCREEN_ID, weekScheduleRoute(s.week.getModel, s.week.onOpen));
  if (s.film) putAll(filmRoutes(s.film));
  if (s.career) putAll(careerRoutes(s.career));
  if (s.home) putAll(homeRoutes(s.home));
  if (s.assignments) put(ASSIGNMENTS_SCREEN_ID, assignmentsRoute(s.assignments.load, s.assignments.onOpen, s.assignments.onCommand));
  if (s.school) {
    put(SCHOOL_SCREEN_IDS.lessons, schoolRoute(s.school.load, 'lessons', s.school.openLesson));
    put(SCHOOL_SCREEN_IDS.drills, schoolRoute(s.school.load, 'drills', s.school.openLesson));
  }
  if (s.gameCalling) putAll(gameCallingRoutes(s.gameCalling));
  if (s.defenseDesigner) put(DEFENSE_DESIGNER_SCREEN_ID, defenseDesignerRoute(s.defenseDesigner.load, s.defenseDesigner.handTo));
  if (s.playDesigner) put(PLAY_DESIGNER_SCREEN_ID, playDesignerRoute(s.playDesigner));
  if (s.settings) put(SETTINGS_SCREEN_ID, settingsRoute(s.settings.host, s.settings.extra));
  if (s.playerDesigner) put(PLAYER_DESIGNER_SCREEN_ID, playerDesignerRoute(s.playerDesigner));
  if (s.editors) put(EDITORS_SCREEN_ID, editorsRoute(s.editors));
  if (s.people) putAll(peopleRoutes(s.people));
  if (s.legends) put(LEGENDS_SCREEN_ID, legendsRoute(s.legends.load, s.legends.opts));
  if (s.practice) put(PRACTICE_SCREEN_ID, practicePlannerRoute(s.practice.getModel, s.practice.onOpen));
  if (s.cap) put(CAP_SCREEN_ID, capRoute(s.cap));
  if (s.depthChart) put(DEPTH_CHART_SCREEN_ID, depthChartRoute(s.depthChart));
  if (s.draftRoom) put(DRAFT_ROOM_SCREEN_ID, draftRoomRoute(s.draftRoom));
  if (s.freeAgency) put(FREE_AGENCY_SCREEN_ID, freeAgencyRoute(s.freeAgency));
  if (s.gameplan) { put(PLAN_SCREEN_ID, gamePlanRoute(s.gameplan)); put(SHEET_SCREEN_ID, callSheetRoute(s.gameplan)); }
  return t;
}
