// Environment (WP-17, bible J12): the rule keys this module reads and its tuning constants.
// Two sources only (plans/engine-build-plan.md section 2). Rule values come from the rule set by key.
// Every other number is a named parameter here. `basis: 'bible'` means a J12 leaf prints the number as a
// starting value (J12 itself marks those as Assumptions or tuning knobs, so none of them is a measured
// fact). `basis: 'assumption'` means this module's author chose it; the leaf it serves and the test or
// J15 row that will fit it are named. Measured real-world numbers used only as calibration targets are
// in `targets.ts`; physical constants with their sources are in `physics.ts`.
import type { Contract } from '@gm/engine-core';

export const ENVIRONMENT_MODULE = 'engine-game.environment';
export const ENVIRONMENT_VERSION = 'environment 1';

export const RULE_KEYS: Contract.RuleKeyManifest = [
  { key: 'score.touchdown', type: 'number', unit: 'points', meaning: 'Touchdown value; with the two-point try it sets the one-score margin of the J12.6.1 noise situation', ownerLeaf: 'B7', readBy: [ENVIRONMENT_MODULE] },
  { key: 'try.two_point_points', type: 'number', unit: 'points', meaning: 'Two-point try value; with the touchdown it sets the one-score margin of the J12.6.1 noise situation', ownerLeaf: 'B7', readBy: [ENVIRONMENT_MODULE] },
];

type Row = Omit<Contract.TuningParam, 'belongsTo' | 'status'>;
const T = 'J12 acceptance tests in packages/engine-game/test/environment';
const rows: Row[] = [
  // J12.1.1 closed roof and dome conditions
  { name: 'environment.indoor.tempF', value: 70, min: 60, max: 75, unit: 'deg_f', basis: 'bible', leaf: 'J12.1.1', constrainedBy: `${T} "indoor"; equals NEUTRAL_ENVIRONMENT.tempF` },
  { name: 'environment.indoor.humidity', value: 0.5, min: 0.3, max: 0.6, unit: 'ratio', basis: 'assumption', leaf: 'J12.1.1', constrainedBy: `${T} "neutral input"; equals NEUTRAL_ENVIRONMENT.humidity` },
  // Retractable roof: default call when the home side gives none (a stand-in for the coach AI, J12.1.1).
  { name: 'environment.roof.closeBelowF', value: 50, min: 30, max: 60, unit: 'deg_f', basis: 'assumption', leaf: 'J12.1.1', constrainedBy: `${T} "roof"` },
  { name: 'environment.roof.closeAboveF', value: 85, min: 75, max: 100, unit: 'deg_f', basis: 'assumption', leaf: 'J12.1.1', constrainedBy: `${T} "roof"` },

  // J12.2.1 pre-game draw. Climate normals give monthly mean temperature, precipitation and snowfall only.
  // Reference places whose NOAA normals are still PENDING (G-11 data, 70 of 71 on 2026-11-26) get this flagged
  // provisional climate instead of invented per-place values. Every game drawn from it reports climateStatus 'provisional'.
  { name: 'environment.provisional.tempF', value: 60, min: 40, max: 75, unit: 'deg_f', basis: 'assumption', leaf: 'J12.2.1', constrainedBy: `${T} "provisional climate"; replaced per place when its normals are read` },
  { name: 'environment.provisional.precipIn', value: 3, min: 1, max: 5, unit: 'in', basis: 'assumption', leaf: 'J12.2.1', constrainedBy: `${T} "provisional climate"; replaced per place when its normals are read` },
  { name: 'environment.provisional.snowIn', value: 0, min: 0, max: 0, unit: 'in', basis: 'assumption', leaf: 'J12.2.1', constrainedBy: `${T} "provisional climate": no snow without a place's snowfall normal` },
  { name: 'environment.weather.tempSdF', value: 8, min: 4, max: 12, unit: 'deg_f', basis: 'assumption', leaf: 'J12.2.1', constrainedBy: `J12.2.1 acceptance (distribution matches normals); ${T} "climate"` },
  { name: 'environment.weather.diurnalHalfRangeF', value: 9, min: 5, max: 14, unit: 'deg_f', basis: 'assumption', leaf: 'J12.2.2', constrainedBy: `${T} "night cooling"` },
  { name: 'environment.weather.warmestHourLocal', value: 15, min: 13, max: 17, unit: 'h', basis: 'assumption', leaf: 'J12.2.2', constrainedBy: `${T} "night cooling"` },
  { name: 'environment.weather.sunsetHourLocal', value: 18, min: 16, max: 20, unit: 'h', basis: 'assumption', leaf: 'J12.1.1', constrainedBy: `${T} "daylight"` },
  { name: 'environment.weather.periodHours', value: 0.8, min: 0.6, max: 1, unit: 'h', basis: 'assumption', leaf: 'J12.2.2', constrainedBy: `${T} "night cooling"` },
  // Chance of precipitation at kickoff per inch of the month's normal precipitation, and its cap.
  { name: 'environment.precip.chancePerInch', value: 0.025, min: 0.01, max: 0.06, unit: 'ratio', basis: 'assumption', leaf: 'J12.2.1', constrainedBy: 'targets.ts PRECIP_SHARE_OUTDOOR (league outdoor share of attempts with precipitation, J12.4.1)' },
  { name: 'environment.precip.chanceMax', value: 0.3, min: 0.1, max: 0.5, unit: 'ratio', basis: 'assumption', leaf: 'J12.2.1', constrainedBy: 'targets.ts PRECIP_SHARE_OUTDOOR' },
  { name: 'environment.precip.snowMaxTempF', value: 34, min: 30, max: 38, unit: 'deg_f', basis: 'assumption', leaf: 'J12.2.1', constrainedBy: 'targets.ts SNOW_SHARE_OF_PRECIP' },
  { name: 'environment.precip.weightLight', value: 0.5, min: 0.2, max: 0.7, unit: 'ratio', basis: 'assumption', leaf: 'J12.4.1', constrainedBy: `${T} "precipitation"` },
  { name: 'environment.precip.weightRain', value: 0.35, min: 0.2, max: 0.6, unit: 'ratio', basis: 'assumption', leaf: 'J12.4.1', constrainedBy: `${T} "precipitation"` },
  { name: 'environment.precip.weightHeavy', value: 0.15, min: 0.05, max: 0.3, unit: 'ratio', basis: 'assumption', leaf: 'J12.4.1', constrainedBy: `${T} "precipitation"` },
  { name: 'environment.precip.heavySnowShare', value: 0.3, min: 0.1, max: 0.5, unit: 'ratio', basis: 'assumption', leaf: 'J12.4.1', constrainedBy: `${T} "precipitation"` },
  { name: 'environment.precip.unsettledWhenDry', value: 0.1, min: 0.02, max: 0.3, unit: 'ratio', basis: 'assumption', leaf: 'J12.2.2', constrainedBy: `${T} "in-game change"` },
  // J12.2.2: "Precipitation switches state with small probabilities conditional on the unsettled flag."
  { name: 'environment.precip.startUnsettled', value: 0.15, min: 0.05, max: 0.3, unit: 'ratio', basis: 'assumption', leaf: 'J12.2.2', constrainedBy: `${T} "in-game change"` },
  { name: 'environment.precip.startSettled', value: 0.01, min: 0, max: 0.05, unit: 'ratio', basis: 'assumption', leaf: 'J12.2.2', constrainedBy: `${T} "in-game change"` },
  { name: 'environment.precip.stopUnsettled', value: 0.2, min: 0.05, max: 0.5, unit: 'ratio', basis: 'assumption', leaf: 'J12.2.2', constrainedBy: `${T} "in-game change"` },
  { name: 'environment.precip.stopSettled', value: 0.5, min: 0.2, max: 0.8, unit: 'ratio', basis: 'assumption', leaf: 'J12.2.2', constrainedBy: `${T} "in-game change"` },
  // Steady wind: a normal truncated at 0, fitted so the shares under 10, 10 to 15 and over 15 mph match the
  // measured outdoor pass-attempt shares of J12.3.1 (targets.ts WIND_BIN_SHARE). No per-venue wind normals exist.
  { name: 'environment.wind.meanMph', value: 7.9, min: 4, max: 12, unit: 'mph', basis: 'assumption', leaf: 'J12.3.1', constrainedBy: 'targets.ts WIND_BIN_SHARE' },
  { name: 'environment.wind.sdMph', value: 5, min: 2, max: 8, unit: 'mph', basis: 'assumption', leaf: 'J12.3.1', constrainedBy: 'targets.ts WIND_BIN_SHARE' },
  { name: 'environment.wind.gustRatio', value: 0.4, min: 0.1, max: 0.8, unit: 'ratio', basis: 'assumption', leaf: 'J12.3.1', constrainedBy: 'J12.3.1 acceptance 3 (make rate spread); J9.7.1 tests' },
  { name: 'environment.wind.dirJitterDeg', value: 15, min: 0, max: 30, unit: 'deg', basis: 'bible', leaf: 'J12.3.1', constrainedBy: `${T} "wind field"` },
  { name: 'environment.humidity.mean', value: 0.6, min: 0.4, max: 0.8, unit: 'ratio', basis: 'assumption', leaf: 'J12.4.2', constrainedBy: `${T} "heat index"; D10.5.1 heat tests` },
  { name: 'environment.humidity.sd', value: 0.15, min: 0.05, max: 0.25, unit: 'ratio', basis: 'assumption', leaf: 'J12.4.2', constrainedBy: `${T} "heat index"` },
  { name: 'environment.humidity.duringPrecip', value: 0.95, min: 0.8, max: 1, unit: 'ratio', basis: 'assumption', leaf: 'J12.4.2', constrainedBy: `${T} "heat index"` },

  // J12.2.2 in-game change at each quarter break
  { name: 'environment.change.windStepSdMph', value: 2, min: 0, max: 5, unit: 'mph', basis: 'bible', leaf: 'J12.2.2', constrainedBy: `${T} "in-game change"` },
  { name: 'environment.change.windDirStepSdDeg', value: 10, min: 0, max: 30, unit: 'deg', basis: 'bible', leaf: 'J12.2.2', constrainedBy: `${T} "in-game change"` },
  { name: 'environment.change.tempStepSdF', value: 1, min: 0, max: 3, unit: 'deg_f', basis: 'assumption', leaf: 'J12.2.2', constrainedBy: `${T} "in-game change"` },

  // J12.2.1 forecast noise
  { name: 'environment.forecast.tempSdPerDayF', value: 1, min: 0.5, max: 3, unit: 'deg_f', basis: 'bible', leaf: 'J12.2.1', constrainedBy: `${T} "forecast"` },
  { name: 'environment.forecast.windSdPerDayMph', value: 1, min: 0.5, max: 3, unit: 'mph', basis: 'bible', leaf: 'J12.2.1', constrainedBy: `${T} "forecast"` },
  { name: 'environment.forecast.horizonDays', value: 7, min: 5, max: 10, unit: 'count', basis: 'assumption', leaf: 'J12.2.1', constrainedBy: `${T} "forecast"` },
  { name: 'environment.forecast.precipSdPerDay', value: 0.04, min: 0, max: 0.1, unit: 'ratio', basis: 'assumption', leaf: 'J12.2.1', constrainedBy: `${T} "forecast"` },

  // J12.4.1 wet ball and grip
  { name: 'environment.wet.lightRain', value: 0.4, min: 0, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.4.1', constrainedBy: 'J12.4.1 acceptance 2 (completion in rain)' },
  { name: 'environment.wet.rain', value: 0.7, min: 0, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.4.1', constrainedBy: 'J12.4.1 acceptance 2 (completion in rain)' },
  { name: 'environment.wet.heavyRain', value: 1, min: 0, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.4.1', constrainedBy: 'J12.4.1 acceptance 2 (completion in rain)' },
  { name: 'environment.wet.snow', value: 0.6, min: 0, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.4.1', constrainedBy: 'J12.4.1 acceptance 2 (completion in snow)' },
  { name: 'environment.wet.heavySnow', value: 0.9, min: 0, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.4.1', constrainedBy: 'J12.4.1 acceptance 2 (completion in snow)' },
  { name: 'environment.wet.practiceScale', value: 0.85, min: 0.5, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.4.1', constrainedBy: `${T} "wet-ball practice"` },
  { name: 'environment.grip.lossAtFullWet', value: 0.2, min: 0.05, max: 0.4, unit: 'ratio', basis: 'bible', leaf: 'J12.4.1', constrainedBy: 'J12.4.1 acceptance 2' },
  // J12.4.2 cold grip term
  { name: 'environment.cold.gripBelowF', value: 25, min: 15, max: 35, unit: 'deg_f', basis: 'bible', leaf: 'J12.4.2', constrainedBy: 'J12.4.2 acceptance 2 (completion at 32 F or colder)' },
  { name: 'environment.cold.gripWet', value: 0.2, min: 0, max: 0.5, unit: 'ratio', basis: 'bible', leaf: 'J12.4.2', constrainedBy: 'J12.4.2 acceptance 2 (completion at 32 F or colder)' },
  // J12.4.2 kick distance. Air density (physics.ts) already carries the colder-denser-air part of the cold
  // effect; this is the remaining ball-hardness part only, so J9 must not add another cold term.
  { name: 'environment.kick.referenceTempF', value: 70, min: 59, max: 75, unit: 'deg_f', basis: 'bible', leaf: 'J12.4.2', constrainedBy: `${T} "neutral input"` },
  { name: 'environment.kick.ballColdLossPerF', value: 0.0007, min: 0, max: 0.002, unit: 'ratio', basis: 'assumption', leaf: 'J12.4.2', constrainedBy: 'J12.4.2 acceptance 2 (punt average at 32 F or colder 2.5 to 4 yd below warm), fitted with J9 drag' },

  // J12.5.1 footing by condition
  { name: 'environment.footing.damp', value: 0.98, min: 0.9, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.5.1', constrainedBy: 'J12.5.1 acceptance (muddy field test)' },
  { name: 'environment.footing.wetArtificial', value: 0.96, min: 0.85, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.5.1', constrainedBy: 'J12.5.1 acceptance' },
  { name: 'environment.footing.wetNatural', value: 0.93, min: 0.85, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.5.1', constrainedBy: 'J12.5.1 acceptance' },
  { name: 'environment.footing.soft', value: 0.88, min: 0.8, max: 0.95, unit: 'ratio', basis: 'bible', leaf: 'J12.5.1', constrainedBy: 'J12.5.1 acceptance (muddy field test)' },
  { name: 'environment.footing.frozen', value: 0.92, min: 0.8, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.5.1', constrainedBy: 'J12.5.1 acceptance' },
  { name: 'environment.footing.snowCovered', value: 0.85, min: 0.75, max: 0.95, unit: 'ratio', basis: 'bible', leaf: 'J12.5.1', constrainedBy: 'J12.5.1 acceptance' },
  { name: 'environment.footing.frozenAtOrBelowF', value: 32, min: 28, max: 34, unit: 'deg_f', basis: 'assumption', leaf: 'J12.5.1', constrainedBy: `${T} "surface"` },
  // "One step per half of continuous rain" for natural grass: two quarters of rain turn wet grass soft.
  { name: 'environment.footing.rainPeriodsToSoft', value: 2, min: 1, max: 4, unit: 'count', basis: 'bible', leaf: 'J12.5.1', constrainedBy: `${T} "surface"` },
  { name: 'environment.slip.footingBelow', value: 0.92, min: 0.85, max: 0.98, unit: 'ratio', basis: 'bible', leaf: 'J12.5.1', constrainedBy: `${T} "slips"` },
  { name: 'environment.slip.chancePerCutPerFootingPoint', value: 0.2, min: 0, max: 1, unit: 'ratio', basis: 'assumption', leaf: 'J12.5.1', constrainedBy: 'J12.5.1 acceptance; J8 carrier tests' },

  // J12.6.1 crowd noise situation factors
  { name: 'environment.noise.lateDownClose', value: 1, min: 0.5, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.6.1', constrainedBy: 'J12.6.1 acceptance 2 (road delay-of-game excess)' },
  { name: 'environment.noise.earlyDown', value: 0.7, min: 0.3, max: 1, unit: 'ratio', basis: 'bible', leaf: 'J12.6.1', constrainedBy: 'J12.6.1 acceptance 2' },
  { name: 'environment.noise.ownOffense', value: 0.2, min: 0, max: 0.5, unit: 'ratio', basis: 'bible', leaf: 'J12.6.1', constrainedBy: 'J12.6.1 acceptance 2' },
  { name: 'environment.noise.blowout', value: 0.4, min: 0.1, max: 0.8, unit: 'ratio', basis: 'bible', leaf: 'J12.6.1', constrainedBy: 'J12.6.1 acceptance 1' },
  { name: 'environment.noise.blowoutMargin', value: 21, min: 14, max: 28, unit: 'points', basis: 'assumption', leaf: 'J12.6.1', constrainedBy: 'J12.6.1 acceptance 1' },
  { name: 'environment.noise.moodDeficit', value: 14, min: 7, max: 21, unit: 'points', basis: 'assumption', leaf: 'J12.6.1', constrainedBy: 'J12.6.1 acceptance 1' },
  { name: 'environment.noise.moodFactor', value: 0.7, min: 0.3, max: 1, unit: 'ratio', basis: 'assumption', leaf: 'J12.6.1', constrainedBy: 'J12.6.1 acceptance 1' },
  // J12.8.1 composition of the home edge, consumed through crowd.ts
  { name: 'environment.noise.homeUnitShare', value: 0.25, min: 0, max: 1, unit: 'ratio', basis: 'assumption', leaf: 'J12.6.1', constrainedBy: 'J12.6.1 acceptance 1 and 2 (noise attacks the visiting units; the home crowd goes quiet for its own offense)' },
  { name: 'environment.noise.silentCountAt', value: 0.6, min: 0.3, max: 1, unit: 'ratio', basis: 'assumption', leaf: 'J5.6.1', constrainedBy: 'J5.6.1 acceptance; I2.5.3 "silent count on the road"' },
  { name: 'environment.noise.roadKnowledgeErrorPerNoise', value: 0.5, min: 0, max: 1.5, unit: 'ratio', basis: 'assumption', leaf: 'D9.4.1', constrainedBy: 'D9.4.1 "noise factor for the offense on the road"; J12.8.1 acceptance 1' },
  { name: 'environment.home.familiarityZ', value: 0.05, min: 0, max: 0.5, unit: 'z', basis: 'bible', leaf: 'J12.8.1', constrainedBy: 'J12.8.1 "starting 0.05 z", raised only until the home margin meets J15/T12; residual under 50% of the effect' },
  // Calibration games (J15, T12) are played at a home venue with this noiseBase. World venues read theirs from the stadium record.
  { name: 'environment.gate.noiseBasePro', value: 0.85, min: 0, max: 1, unit: 'ratio', basis: 'assumption', leaf: 'J12.6.1', constrainedBy: 'J12.8.1 acceptance 1 (pro home margin); generated stadium noiseFactor 0.8 to 1.2 clamped to 1' },
  { name: 'environment.gate.noiseBaseCollege', value: 0.9, min: 0, max: 1, unit: 'ratio', basis: 'assumption', leaf: 'J12.6.1', constrainedBy: 'J12.6.1 "college venues can carry higher noiseBase"; T12 home margin' },
];

export const PARAMS: Contract.ParamFile = {
  module: ENVIRONMENT_MODULE,
  version: '0.1.0',
  params: rows.map((r) => ({ ...r, belongsTo: ENVIRONMENT_MODULE, status: 'starting' as const })),
};

export type EnvironmentParam = (typeof rows)[number]['name'];

/** A read-only table over this module's parameter file. The integrator's merged table replaces it after the merge. */
export function environmentParamTable(overrides: Readonly<Record<string, number>> = {}): Contract.ParamTable {
  const byName = new Map(PARAMS.params.map((p) => [p.name, p.value]));
  for (const [k, v] of Object.entries(overrides)) {
    if (!byName.has(k)) throw new Error(`unknown parameter ${k}`);
    byName.set(k, v);
  }
  return {
    version: PARAMS.version,
    has: (name) => byName.has(name),
    num: (name) => {
      const v = byName.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
  };
}
