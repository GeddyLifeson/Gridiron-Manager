export { App, type AppProps } from './App.tsx';
// Modules are re-exported under a namespace (modules export PARAMS). Integrator-owned.
export * as fieldView from './field-view/index.ts';
export * as shell from './shell/index.ts';
export * as tokens from './tokens/index.ts';
export * as rosterMoves from './screens/roster-moves/index.ts';
export * as gameFrame from './screens/game-frame/index.ts';
export * as scouting from './screens/scouting/index.ts';
export * as analytics from './screens/analytics/index.ts';
export * as week from './screens/week/index.ts';
export * as film from './screens/film/index.ts';
export * as career from './screens/career/index.ts';
export * as school from './screens/school/index.ts';
export * as gameManagement from './screens/game-management/index.ts';
export * as gameCalling from './screens/game-calling/index.ts';
export * as defenseDesigner from './screens/defense-designer/index.ts';
export * as playDesigner from './screens/play-designer/index.ts';
// Route table: binds each screen package's route factory to its screens.json id (integrator-owned).
export { buildRoutes, ASSIGNMENTS_SCREEN_ID, WEEK_SCHEDULE_SCREEN_ID, type RouteSources } from './routes.ts';
