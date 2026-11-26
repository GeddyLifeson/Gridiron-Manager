// Scripted chart caller (D-20, J14.6.1): the stand-in for coach AI play calling (K4, K5) that every real
// game runs until phase 5. Moved here from headless calibration so the app (the opponent in a played game,
// the other games of a played season) and the headless tools share one caller. Headless calibration
// re-exports these names unchanged.
export { createChartCaller, depthRoster, mix32 } from './chart-caller.ts';
export type { ChartCallerOptions, RosterSource, CallUnit } from './chart-caller.ts';
export { PARAMS, chartParams, chartOverrides } from './params.ts';
