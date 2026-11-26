// WP-13 calibration harness entry point (J15, Q2, J14.6.1). The integrator re-exports this module.
export { parseMeasure, observe, prepare, isKnownMeasure, MEASURE_NAMES, mean, sampleSd, quantile, yardsToGoInt,
  isCountedScrimmage, isPassOrRun, isDropback, isPassPlay, isAttempt, isCompletion, isCarry, isKneel, isSpike } from './measures.ts';
export type { CalibrationSample, ParsedMeasure, Observations, PreparedSample } from './measures.ts';
export { compareScalar, compareQuantiles, compareOrdering, realStandardError } from './compare.ts';
export type { Comparison } from './compare.ts';
export { checkTargets, factValueMatches, levelOf } from './targets.ts';
export type { LoadedTargets, Level } from './targets.ts';
export { buildReport, formatReport, fmt } from './report.ts';
export type { CalibrationReport, ReportRow, RowState, RunInfo, GateVerdict } from './report.ts';
import { chart } from '@gm/coach-ai';
export const { createChartCaller, depthRoster, mix32 } = chart;
export type ChartCallerOptions = chart.ChartCallerOptions;
export type RosterSource = chart.RosterSource;
export type CallUnit = chart.CallUnit;
export { runBatch, gameSeedHex } from './batch.ts';
export type { BatchSpec, BatchResult } from './batch.ts';
export { loadTargets, readMeasuredRateFacts, targetFilePath } from './files.ts';
export const { PARAMS, chartParams, chartOverrides } = chart;
