// G-87 season gate harnesses: seasons of the real competitions (R1.2.7 gate item 1), the Q1.7.2
// season-level report, the Q3 decision-response battery runner and report, and the phase 6 gate page.
export { buildSeason, buildProSeason, buildCollegeSeason, LEVEL_BUILDERS, REPO_ROOT, type BuiltSeason, type BuildOptions } from './leagues.ts';
export { realGamePort, seasonPlayerId, type RealPortOptions } from './game-port.ts';
export { realPortRef, type RealPortRefOptions } from './real-port.ts';
export { runSeasons, runOneSeason, loadPort, seasonLine, seasonSeedHex, powerTeams, REAL_PORT_MODULE, type SeasonRunSpec, type SeasonOutcome, type SeasonLine, type StatSpread, type PortRef, type CreatePlayGame, type RunOptions, type Json } from './seasons.ts';
export { buildSeasonReport, formatSeasonReport, waitingFor, SEASON_MEASURES, type SeasonReport, type SeasonReportRow, type SeasonRunInfo, type SeasonMeasure, type MeasureContext, type SeasonGateVerdict } from './season-report.ts';
export { BATTERY_ITEMS, itemProblems, type BatteryItem, type AssertionKind, type ItemState } from './battery/items.ts';
export { runItem, pairedDifference, assertionHolds, pairSeedHex, type ItemBinding, type ItemResult, type Arm, type ArmRun, type PairedDifference, type RunState } from './battery/paired.ts';
export { runBattery, formatBatteryReport, type BatteryReport, type BatteryRow, type BatteryRunOptions, type Waiver, type ItemVerdict, type BatteryVerdict } from './battery/report.ts';
export { ADMITTED_BINDINGS, BINDING_NEEDS } from './battery/bindings.ts';
export { realGameArm, yardsPerScrimmagePlay, type GameMeasure, type RealArmOptions } from './battery/real-arm.ts';
export { runPhaseSixGate, formatPhaseSixGate, type PhaseSixGate, type GateItem, type GateItemState, type GateOptions } from './gate.ts';
export { PARAMS, param } from './params.ts';
