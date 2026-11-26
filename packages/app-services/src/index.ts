// Public interface of app-services. app-ui may import only from this entry point (P1.2.2).
export * from './platform.ts';
export * from './world-service.ts';
export { runGolden, compareGolden, type GoldenReport } from '@gm/engine-game';
export { goldenInputs } from './golden-inputs.ts';
export type { WorldSummaryModel, SaveHeader } from '@gm/schema';
export { SqlJsDriver, readHeader, type SqlDriver, type SqlStatement, type SqlParam } from '@gm/store';
// Contract names the field view needs (CR-G03-1); app-ui may import only this entry point.
export type { TrajectoryRecord, FieldGeometry, MoveMode, BallStateKind } from '@gm/schema';
export { TICKS_PER_SECOND, MOVE_MODES, BALL_STATES } from '@gm/schema';
// Modules are re-exported under a namespace (modules export PARAMS). Integrator-owned.
export * as settings from './settings/index.ts';
export * as observer from './observer/index.ts';
export * as rosterMoves from './read-models/roster-moves/index.ts';
export * as rosterMovesCommands from './commands/roster-moves/index.ts';
export * as gameFrame from './read-models/game-frame/index.ts';
export * as gameFrameCommands from './commands/game-frame/index.ts';
export * as analytics from './read-models/analytics/index.ts';
