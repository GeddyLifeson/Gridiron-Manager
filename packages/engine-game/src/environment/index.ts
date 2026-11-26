// Environment (WP-17; bible J12). Entry point of the module; the package entry point re-exports it under a
// namespace. How the game flow (WP-06) uses it:
//   pre_game:        environmentForPeriod(input, deps, 0) -> environmentUpdated(...) (weather fixed, roof set at T minus 90)
//   each period start: environmentForPeriod(input, deps, period) -> environmentUpdated(...) (J12.2.2)
//   each play:       windForPlay(...) for ball flight (J9.7.1), noiseForPlay(...) for J3.6.1 and J5,
//                    teamWet / teamGrip for ball handling, footingLimits for J2, slipOnCut on footing streams
//   the week:        forecastFor / forecastSeries (H1, H8)
//   fatigue:         heatIndexOf(env, math) is the heatIndexF of the bench module's EnvironmentExposure
export { ENVIRONMENT_MODULE, ENVIRONMENT_VERSION, RULE_KEYS, PARAMS, environmentParamTable } from './params.ts';
export type { EnvironmentParam } from './params.ts';
export type {
  RoofKind, SurfaceKind, Precip, SurfaceCondition, ClimateNormals, VenueEnvironment, RoofCall, GameEnvironmentInput,
  EnvironmentDeps, ClimateStatus, OutdoorState, PeriodEnvironment,
} from './types.ts';
export {
  climateAt, precipChance, localHourOf, diurnalOffsetF, nextCondition, defaultRoofCall, roofClosedIn, pregameOutdoor,
  stepOutdoor, fieldDirDeg, snapshotOf, environmentTimeline, environmentForPeriod, environmentUpdated, SECOND_HALF_PERIOD,
} from './weather.ts';
export type { ClimateAt } from './weather.ts';
export {
  wetOf, coldWetOf, wetIndex, teamWet, gripOf, teamGrip, footingOf, footingLimits, kickDistanceOf, deriveMultipliers,
} from './derive.ts';
export { windForPlay, windBin, oneScoreMargin, noiseForPlay, slipChancePerCut, footingStream, slipOnCut, CALM } from './play.ts';
export type { PlayWind, WindBin, NoiseSituation } from './play.ts';
export { crowdForPlay, gateNoiseBase, QUIET } from './crowd.ts';
export type { Site, CrowdSituation, CrowdForPlay } from './crowd.ts';
export { forecastFor, forecastSeries } from './forecast.ts';
export type { Forecast } from './forecast.ts';
export { NEUTRAL_VENUE, neutralInput, heatIndexOf } from './neutral.ts';
export {
  airDensityRatio, isaDensityRatio, heatIndexF, sourceStatus, ISA_SOURCES, HEAT_INDEX_SOURCES, YD_PER_S_PER_MPH,
} from './physics.ts';
export type { SourceRef, SourcedConstantGroup } from './physics.ts';
export { MEASURED_TARGETS, WIND_BIN_SHARE, PRECIP_SHARE_OUTDOOR, SNOW_SHARE_OF_PRECIP } from './targets.ts';
export type { MeasuredTarget } from './targets.ts';
