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
