// Weather generation (J12.2.1 pre-game draw, J12.2.2 in-game change), the surface condition process
// (J12.5.1) and the snapshot builder (J12.1.1). The whole timeline is a pure function of the input and
// the game's `weather` stream: period 0 draws from weather[game, 0], each later period from
// weather[game, period]. Nothing is stored between periods, so a replay or a reload rebuilds the same
// snapshots (J12.2.2 acceptance) and the flow only needs the Environment in its state.
import { Contract } from '@gm/engine-core';
import { deriveMultipliers } from './derive.ts';
import type {
  ClimateNormals, ClimateStatus, EnvironmentDeps, GameEnvironmentInput, OutdoorState, PeriodEnvironment, Precip,
  SurfaceCondition, SurfaceKind,
} from './types.ts';

const MONTHS = 12;
const MID_MONTH_DAY = 15;
const DAYS_PER_MONTH_INTERP = 30;
const HOURS_PER_DAY = 24;
const FULL_TURN_DEG = 360;
/** Highest windDirDeg the contract accepts (Environment.windDirDeg max 359). */
const MAX_DIR_DEG = 359;
/** Period that starts the second half; the only time a closed retractable roof may open (J12.1.1). */
export const SECOND_HALF_PERIOD = 3;

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const wrapDeg = (d: number) => ((d % FULL_TURN_DEG) + FULL_TURN_DEG) % FULL_TURN_DEG;

export interface ClimateAt {
  readonly tempMeanF: number;
  readonly precipIn: number;
  readonly snowIn: number;
  readonly status: ClimateStatus;
}

function monthly(values: readonly number[], month: number, day: number): number {
  const m = clamp(Math.round(month), 1, MONTHS) - 1;
  const d = clamp(day, 1, 31);
  if (d >= MID_MONTH_DAY) {
    const next = (m + 1) % MONTHS;
    const w = (d - MID_MONTH_DAY) / DAYS_PER_MONTH_INTERP;
    return values[m]! * (1 - w) + values[next]! * w;
  }
  const prev = (m + MONTHS - 1) % MONTHS;
  const w = (d + MID_MONTH_DAY) / DAYS_PER_MONTH_INTERP;
  return values[prev]! * (1 - w) + values[m]! * w;
}

/** Climate for a date, interpolated linearly between mid-month normals. Null normals give the flagged provisional climate. */
export function climateAt(normals: ClimateNormals | null, month: number, day: number, p: Contract.ParamTable): ClimateAt {
  if (normals === null) {
    return {
      tempMeanF: p.num('environment.provisional.tempF'), precipIn: p.num('environment.provisional.precipIn'),
      snowIn: p.num('environment.provisional.snowIn'), status: 'provisional',
    };
  }
  for (const k of ['tempF', 'precipIn', 'snowIn'] as const) {
    if (normals[k].length !== MONTHS) throw new Error(`climate normals ${k} must have ${MONTHS} monthly values`);
  }
  return {
    tempMeanF: monthly(normals.tempF, month, day), precipIn: monthly(normals.precipIn, month, day),
    snowIn: monthly(normals.snowIn, month, day), status: 'normals',
  };
}

/** Chance of precipitation at kickoff from the month's normal precipitation (J12.2.1). */
export function precipChance(c: ClimateAt, p: Contract.ParamTable): number {
  // A3.1 ruling 22: rain is possible in the driest month (floor chance).
  return Contract.possible(clamp(c.precipIn * p.num('environment.precip.chancePerInch'), 0, p.num('environment.precip.chanceMax')));
}

/** Local hour at the start of a period. Period 0 (T minus 90 snapshot) and period 1 use the kickoff hour. */
export function localHourOf(input: GameEnvironmentInput, period: number, p: Contract.ParamTable): number {
  return input.kickoffLocalHour + Math.max(0, period - 1) * p.num('environment.weather.periodHours');
}

/** Departure of the temperature at `hour` from the daily mean: warmest mid-afternoon, coolest before dawn. */
export function diurnalOffsetF(hour: number, p: Contract.ParamTable, m: Contract.DeterministicMath): number {
  const phase = (2 * Math.PI * (hour - p.num('environment.weather.warmestHourLocal'))) / HOURS_PER_DAY;
  return p.num('environment.weather.diurnalHalfRangeF') * m.cos(phase);
}

const RAIN: readonly Precip[] = ['light_rain', 'rain', 'heavy_rain'];
const isRain = (x: Precip) => RAIN.includes(x);
const isSnow = (x: Precip) => x === 'snow' || x === 'heavy_snow';

function snowPossible(c: ClimateAt, tempF: number, snowU: number, p: Contract.ParamTable): boolean {
  if (tempF > p.num('environment.precip.snowMaxTempF')) return false;
  if (c.snowIn > 0) return true;
  // A3.1 ruling 22: snow at a venue whose normals record none is rare, not impossible, so it keeps the
  // floor chance. It reuses the top of the snow-strength uniform (no new draw), which then reads as light snow.
  return snowU >= 1 - Contract.PROB_FLOOR;
}

/** Rain intensity pick and snow-strength uniform, turned into a precipitation state. */
function precipKind(intensity: number, heavySnowU: number, snow: boolean, p: Contract.ParamTable): Precip {
  if (snow) return heavySnowU < p.num('environment.precip.heavySnowShare') ? 'heavy_snow' : 'snow';
  return RAIN[intensity]!;
}

/** Keeps the strength of falling precipitation when the temperature crosses the snow line. */
function retype(precip: Precip, snow: boolean): Precip {
  if (precip === 'none') return precip;
  if (snow && isRain(precip)) return precip === 'heavy_rain' ? 'heavy_snow' : 'snow';
  if (!snow && isSnow(precip)) return precip === 'heavy_snow' ? 'heavy_rain' : 'rain';
  return precip;
}

const WETNESS: readonly SurfaceCondition[] = ['dry', 'damp', 'wet', 'soft'];
function wetter(a: SurfaceCondition, b: SurfaceCondition): SurfaceCondition {
  const ia = WETNESS.indexOf(a);
  const ib = WETNESS.indexOf(b);
  if (ia < 0) return b;
  return ia >= ib ? a : b;
}

/**
 * Surface condition after a period begins with `precip` (J12.5.1). Rain wets the field (light rain to damp);
 * natural grass turns soft after the rain has lasted `rainPeriodsToSoft` periods; artificial surfaces never
 * turn to mud. Snow covers the field once it has fallen for a period or falls heavily. A dry period dries
 * wet to damp and damp to dry; mud, snow cover and frost stay for the game. A wet field at or below the
 * freezing threshold freezes.
 */
export function nextCondition(
  prev: SurfaceCondition, prevPrecip: Precip, precip: Precip, rainPeriods: number, tempF: number, kind: SurfaceKind,
  p: Contract.ParamTable,
): SurfaceCondition {
  let c: SurfaceCondition = prev;
  if (isSnow(precip)) {
    c = precip === 'heavy_snow' || isSnow(prevPrecip) || prev === 'snow_covered' ? 'snow_covered' : wetter(prev, 'wet');
  } else if (isRain(precip)) {
    const base: SurfaceCondition = precip === 'light_rain' ? 'damp' : 'wet';
    c = prev === 'snow_covered' || prev === 'frozen' ? 'wet' : wetter(prev, base);
    if (kind === 'natural' && rainPeriods >= p.num('environment.footing.rainPeriodsToSoft') && (c === 'wet' || c === 'damp')) c = 'soft';
  } else if (prev === 'wet') c = 'damp';
  else if (prev === 'damp') c = 'dry';
  if ((c === 'wet' || c === 'damp' || c === 'soft') && tempF <= p.num('environment.footing.frozenAtOrBelowF')) c = 'frozen';
  return c;
}

/** Default retractable-roof call when the home side gives none: close for precipitation, cold or heat. */
export function defaultRoofCall(o: OutdoorState, p: Contract.ParamTable): 'open' | 'closed' {
  const bad = o.precip !== 'none' || o.tempF < p.num('environment.roof.closeBelowF') || o.tempF > p.num('environment.roof.closeAboveF');
  return bad ? 'closed' : 'open';
}

/** Whether the roof is closed in a period (J12.1.1: set at T minus 90; only closed to open, only at halftime). */
export function roofClosedIn(input: GameEnvironmentInput, pregame: OutdoorState, period: number, p: Contract.ParamTable): boolean {
  const kind = input.venue.roofKind;
  if (kind === 'fixed_dome') return true;
  if (kind === 'open') return false;
  const call = input.roofCall ?? defaultRoofCall(pregame, p);
  if (call === 'open') return false;
  const opens = (input.halftimeOpen ?? false) && (input.halftimeOpenAllowed ?? true);
  return !(opens && period >= SECOND_HALF_PERIOD);
}

/**
 * J12.2.1 pre-game draw from weather[game, 0]. Eight draws in a fixed order whatever the branch: temperature
 * anomaly, precipitation, rain intensity, snow strength, unsettled flag, wind speed, wind direction, humidity.
 * The field condition here is the uncovered field's; the snapshot shows dry under a closed roof.
 */
export function pregameOutdoor(input: GameEnvironmentInput, d: EnvironmentDeps): OutdoorState {
  const p = d.params;
  const s = d.streams('weather', [input.gameId, 0]);
  const c = climateAt(input.venue.climate, input.month, input.day, p);
  const zTemp = s.normal();
  const uPrecip = s.uniform();
  const intensity = s.pick([p.num('environment.precip.weightLight'), p.num('environment.precip.weightRain'), p.num('environment.precip.weightHeavy')]);
  const uHeavySnow = s.uniform();
  const uUnsettled = s.uniform();
  const zWind = s.normal();
  const uDir = s.uniform();
  const zHum = s.normal();

  const anomalyF = zTemp * p.num('environment.weather.tempSdF');
  const tempF = c.tempMeanF + diurnalOffsetF(localHourOf(input, 1, p), p, d.math) + anomalyF;
  const precip: Precip = uPrecip < precipChance(c, p) ? precipKind(intensity, uHeavySnow, snowPossible(c, tempF, uHeavySnow, p), p) : 'none';
  const unsettled = precip !== 'none' || uUnsettled < p.num('environment.precip.unsettledWhenDry');
  const windMph = Math.max(0, p.num('environment.wind.meanMph') + zWind * p.num('environment.wind.sdMph'));
  const humidityDry = clamp(p.num('environment.humidity.mean') + zHum * p.num('environment.humidity.sd'), 0.05, 1);
  const humidity = precip === 'none' ? humidityDry : Math.max(humidityDry, p.num('environment.humidity.duringPrecip'));
  const rainPeriods = isRain(precip) ? 1 : 0;
  const field = nextCondition('dry', 'none', precip, rainPeriods, tempF, input.venue.surfaceKind, p);
  return { anomalyF, tempF, windMph, windTowardBearingDeg: uDir * FULL_TURN_DEG, precip, humidityDry, humidity, unsettled, rainPeriods, field };
}

/**
 * J12.2.2 change at the start of `period` (2 and up) from weather[game, period]. Six draws in a fixed order:
 * temperature step, wind step, direction step, precipitation switch, rain intensity, snow strength.
 */
export function stepOutdoor(prev: OutdoorState, input: GameEnvironmentInput, period: number, roofClosed: boolean, d: EnvironmentDeps): OutdoorState {
  const p = d.params;
  const s = d.streams('weather', [input.gameId, period]);
  const c = climateAt(input.venue.climate, input.month, input.day, p);
  const zTemp = s.normal();
  const zWind = s.normal();
  const zDir = s.normal();
  const uSwitch = s.uniform();
  const intensity = s.pick([p.num('environment.precip.weightLight'), p.num('environment.precip.weightRain'), p.num('environment.precip.weightHeavy')]);
  const uHeavySnow = s.uniform();

  const anomalyF = prev.anomalyF + zTemp * p.num('environment.change.tempStepSdF');
  const tempF = c.tempMeanF + diurnalOffsetF(localHourOf(input, period, p), p, d.math) + anomalyF;
  const windMph = Math.max(0, prev.windMph + zWind * p.num('environment.change.windStepSdMph'));
  const windTowardBearingDeg = wrapDeg(prev.windTowardBearingDeg + zDir * p.num('environment.change.windDirStepSdDeg'));
  const snow = snowPossible(c, tempF, uHeavySnow, p);
  let precip: Precip;
  if (prev.precip === 'none') {
    const start = prev.unsettled ? p.num('environment.precip.startUnsettled') : p.num('environment.precip.startSettled');
    precip = uSwitch < start ? precipKind(intensity, uHeavySnow, snow, p) : 'none';
  } else {
    const stop = prev.unsettled ? p.num('environment.precip.stopUnsettled') : p.num('environment.precip.stopSettled');
    precip = uSwitch < stop ? 'none' : retype(prev.precip, snow);
  }
  const humidity = precip === 'none' ? prev.humidityDry : Math.max(prev.humidityDry, p.num('environment.humidity.duringPrecip'));
  const covered = roofClosed;
  const rainPeriods = covered || !isRain(precip) ? 0 : prev.rainPeriods + 1;
  const field = covered ? 'dry' : nextCondition(prev.field, prev.precip, precip, rainPeriods, tempF, input.venue.surfaceKind, p);
  return { anomalyF, tempF, windMph, windTowardBearingDeg, precip, humidityDry: prev.humidityDry, humidity, unsettled: prev.unsettled, rainPeriods, field };
}

/** Field-frame direction (counter-clockwise from +x, contract D-12) of a wind blowing toward a compass bearing. */
export function fieldDirDeg(towardBearingDeg: number, fieldAxisBearingDeg: number): number {
  return Math.min(MAX_DIR_DEG, wrapDeg(fieldAxisBearingDeg - towardBearingDeg));
}

/** Build the J12.1.1 snapshot for a period from the outdoor state and the roof state. */
export function snapshotOf(input: GameEnvironmentInput, o: OutdoorState, closed: boolean, localHour: number, d: EnvironmentDeps): Contract.Environment {
  const p = d.params;
  const v = input.venue;
  const roof: Contract.Environment['roof'] = v.roofKind === 'fixed_dome' ? 'fixed_dome' : closed ? 'closed' : 'open';
  const fields: Omit<Contract.Environment, 'derived'> = closed
    ? {
      roof, tempF: p.num('environment.indoor.tempF'), windMph: 0, windDirDeg: 0, gustMph: 0, precip: 'none',
      humidity: p.num('environment.indoor.humidity'), surfaceType: v.surfaceType, surfaceCondition: 'dry',
      altitudeFt: v.altitudeFt, noiseBase: v.noiseBase, daylight: false,
    }
    : {
      roof, tempF: o.tempF, windMph: o.windMph, windDirDeg: fieldDirDeg(o.windTowardBearingDeg, v.fieldAxisBearingDeg),
      gustMph: o.windMph * p.num('environment.wind.gustRatio'), precip: o.precip, humidity: o.humidity,
      surfaceType: v.surfaceType, surfaceCondition: o.field, altitudeFt: v.altitudeFt, noiseBase: v.noiseBase,
      daylight: localHour < p.num('environment.weather.sunsetHourLocal'),
    };
  return { ...fields, derived: deriveMultipliers(fields, v.surfaceKind, p, d.math) };
}

function validateInput(input: GameEnvironmentInput): void {
  const v = input.venue;
  if (!(v.windShelter >= 0 && v.windShelter <= 1)) throw new Error('venue windShelter must be in [0, 1]');
  if (!(v.noiseBase >= 0 && v.noiseBase <= 1)) throw new Error('venue noiseBase must be in [0, 1]');
  if (!(input.month >= 1 && input.month <= MONTHS)) throw new Error('month must be 1 to 12');
}

/**
 * Environment of every period from 0 (pre-game, T minus 90) to `lastPeriod`. Each entry is what the flow
 * emits as `environment_updated` at that period's start (J12.2.2: changes only at period boundaries).
 */
export function environmentTimeline(input: GameEnvironmentInput, d: EnvironmentDeps, lastPeriod: number): PeriodEnvironment[] {
  validateInput(input);
  const status = climateAt(input.venue.climate, input.month, input.day, d.params).status;
  const pre = pregameOutdoor(input, d);
  const out: PeriodEnvironment[] = [];
  let o = pre;
  for (let period = 0; period <= lastPeriod; period++) {
    const closed = roofClosedIn(input, pre, period, d.params);
    if (period >= 2) o = stepOutdoor(o, input, period, closed, d);
    else if (closed) o = { ...o, field: 'dry', rainPeriods: 0 };
    const localHour = localHourOf(input, period, d.params);
    out.push({ period, environment: snapshotOf(input, o, closed, localHour, d), outdoor: o, roofClosed: closed, climateStatus: status, localHour });
  }
  return out;
}

/** The snapshot of one period (rebuilds the timeline up to it; a game has a handful of periods). */
export function environmentForPeriod(input: GameEnvironmentInput, d: EnvironmentDeps, period: number): PeriodEnvironment {
  if (!Number.isInteger(period) || period < 0) throw new Error('period must be a non-negative integer');
  return environmentTimeline(input, d, period)[period]!;
}

/** The game event that installs a period's snapshot (J11.1.1; applied by the flow's `apply`). */
export function environmentUpdated(pe: PeriodEnvironment): Extract<Contract.GameEvent, { type: 'environment_updated' }> {
  return { type: 'environment_updated', environment: pe.environment };
}
