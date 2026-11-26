// WP-24 diff runner (Q1.3.2): first-divergence report across builds and resolvers. The integrator re-exports this module.
export { runDiff } from './run.ts';
export type { DiffSpec, DiffReport, ChangedPlay, GameDiff, BuildInfo } from './run.ts';
export { playDivergence, firstEventIndex, firstTrajectoryTick, ticksOf } from './divergence.ts';
export type { PlayDivergence, ExplainContest, ContestSource } from './divergence.ts';
export { distributionShift } from './distribution.ts';
export type { RowShift } from './distribution.ts';
export { formatDiffReport } from './report.ts';
export { PARAMS, diffParam } from './params.ts';
