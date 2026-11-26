// The week's forecast (J12.2.1): truth plus noise that shrinks toward game day. Truth is the hidden
// kickoff draw (period 1 outdoor weather). Noise comes from forecast[game, daysBeforeKickoff], a stream the
// game-time draw never reads, so looking at the forecast cannot shift the weather (J13.2.1).
import type { EnvironmentDeps, GameEnvironmentInput, Precip } from './types.ts';
import { climateAt, environmentForPeriod, precipChance } from './weather.ts';

export interface Forecast {
  readonly daysBeforeKickoff: number;
  readonly tempF: number;
  readonly windMph: number;
  /** Chance of precipitation at kickoff, 0 to 1. */
  readonly precipChance: number;
  /** The kind that would fall if it does: the truth's kind when it is wet, else rain or snow by the forecast temperature. */
  readonly precipKind: Precip;
  /** True when the venue has a fixed dome or the roof call is closed; the forecast still describes the outside air. */
  readonly indoor: boolean;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Forecast shown `daysBeforeKickoff` days out. Temperature and wind errors have standard deviation
 * per-day times days; the precipitation chance moves from the date's climatological chance at the horizon
 * to 0 or 1 on game day, plus noise. Three normals are drawn in a fixed order.
 */
export function forecastFor(input: GameEnvironmentInput, d: EnvironmentDeps, daysBeforeKickoff: number): Forecast {
  if (!Number.isInteger(daysBeforeKickoff) || daysBeforeKickoff < 0) throw new Error('daysBeforeKickoff must be a non-negative integer');
  const p = d.params;
  const truth = environmentForPeriod(input, d, 1);
  const o = truth.outdoor;
  const s = d.streams('forecast', [input.gameId, daysBeforeKickoff]);
  const zT = s.normal();
  const zW = s.normal();
  const zP = s.normal();
  const n = daysBeforeKickoff;
  const w = Math.min(1, n / p.num('environment.forecast.horizonDays'));
  const wet = o.precip === 'none' ? 0 : 1;
  const climate = precipChance(climateAt(input.venue.climate, input.month, input.day, p), p);
  const tempF = o.tempF + zT * p.num('environment.forecast.tempSdPerDayF') * n;
  const snowish = tempF <= p.num('environment.precip.snowMaxTempF');
  return {
    daysBeforeKickoff: n,
    tempF,
    windMph: Math.max(0, o.windMph + zW * p.num('environment.forecast.windSdPerDayMph') * n),
    precipChance: clamp01(wet * (1 - w) + climate * w + zP * p.num('environment.forecast.precipSdPerDay') * n),
    precipKind: o.precip !== 'none' ? o.precip : snowish ? 'snow' : 'rain',
    indoor: truth.roofClosed,
  };
}

/** The forecast series for days `fromDays` down to 0. */
export function forecastSeries(input: GameEnvironmentInput, d: EnvironmentDeps, fromDays: number): Forecast[] {
  const out: Forecast[] = [];
  for (let n = fromDays; n >= 0; n--) out.push(forecastFor(input, d, n));
  return out;
}

