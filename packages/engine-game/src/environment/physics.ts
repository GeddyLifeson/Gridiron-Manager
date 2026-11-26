// Physical formulas the environment uses (J12.4.2, J12.7.1), with their sources. These are physics and
// published standard formulas, not tuning: they do not belong in the parameter file. Each constant group
// lists the sources actually read; `sourceStatus` computes the status from distinct independence groups
// (A5, Q6: three groups, or the primary text plus a cross-check, make it Verified).
import type { Contract } from '@gm/engine-core';

export interface SourceRef {
  readonly citation: string;
  readonly locator: string;
  readonly independenceGroup: string;
  readonly primary: boolean;
  readonly dateRead: string;
}

export interface SourcedConstantGroup {
  readonly id: string;
  readonly what: string;
  readonly sources: readonly SourceRef[];
}

/**
 * Status computed from the sources, never typed (CLAUDE.md, Q6). Three distinct independence groups, or a
 * primary text plus at least one other group, is Verified; otherwise the count is printed as "n of 3".
 */
export function sourceStatus(g: SourcedConstantGroup): string {
  const groups = new Set(g.sources.map((s) => s.independenceGroup));
  const primary = g.sources.some((s) => s.primary);
  if (groups.size >= 3 || (primary && groups.size >= 2)) return 'Verified';
  return `${groups.size} of 3`;
}

// ---------------------------------------------------------------------------------------------------
// International Standard Atmosphere, troposphere (J12.7.1).
// p/p0 = (1 - L h / T0)^(g0 / (R L)), with L = 0.0065 K/m, T0 = 288.15 K, g0 = 9.80665 m/s^2,
// R = 287.05287 J/(kg K). L / T0 = 2.25577e-5 per metre; g0 / (R L) = 5.25588.
// At the standard temperature this gives the density law of J12.7.1, rho/rho0 = (1 - 2.25577e-5 h)^4.2559.
export const ISA_LAPSE_OVER_T0_PER_M = 2.25577e-5;
export const ISA_PRESSURE_EXPONENT = 5.25588;
export const FEET_PER_METRE = 1 / 0.3048; // international foot, exact by definition (0.3048 m)
/** Rankine offset: absolute temperature in degrees Rankine is degrees F plus 459.67 (exact by definition). */
export const RANKINE_OFFSET_F = 459.67;
/** 1 mph in yards per second: 1760 yd per mile over 3600 s per hour (exact by definition). */
export const YD_PER_S_PER_MPH = 1760 / 3600;

export const ISA_SOURCES: SourcedConstantGroup = {
  id: 'physics.isa_troposphere',
  what: 'ISA troposphere pressure and density with altitude (L/T0 = 2.25577e-5 per m, exponent 5.25588; density exponent 4.2559)',
  sources: [
    { citation: 'Embry-Riddle Aeronautical University open textbook, standard atmosphere table and ISA formula (as read for bible J12.7.1)', locator: 'bible J12.7.1 "Football facts used"', independenceGroup: 'erau-textbook', primary: false, dateRead: '2026-11-26' },
    { citation: 'ambiance (Python ISA implementation of ICAO Doc 7488/3, 1993), source constants T_0 = 288.15, lapse -6.5e-3 K/m, g_0 = 9.80665, R = 287.05287', locator: 'github.com/aarondettmann/ambiance src/ambiance/ambiance.py lines 111 to 154', independenceGroup: 'icao-7488-ambiance', primary: false, dateRead: '2026-11-26' },
    { citation: 'Ideal gas law rho = p / (R T), giving the density exponent 5.25588 - 1 = 4.2559 at the standard lapse; checked numerically against the bible table value 0.8617 at 5,000 ft', locator: 'test/environment/physics.test.ts "ISA"', independenceGroup: 'derivation', primary: false, dateRead: '2026-11-26' },
  ],
};

/**
 * Air density relative to the engine reference air: sea level at 70 F (the closed-roof temperature of
 * J12.1.1), so NEUTRAL_ENVIRONMENT has airDensity 1. Pressure falls with altitude by the ISA law and density
 * scales with pressure over absolute temperature (ideal gas). Humidity's small effect is left out.
 */
export function airDensityRatio(altitudeFt: number, tempF: number, referenceTempF: number, m: Contract.DeterministicMath): number {
  const hM = Math.max(0, altitudeFt) / FEET_PER_METRE;
  const pressure = m.pow(1 - ISA_LAPSE_OVER_T0_PER_M * hM, ISA_PRESSURE_EXPONENT);
  return pressure * (referenceTempF + RANKINE_OFFSET_F) / (tempF + RANKINE_OFFSET_F);
}

/** ISA density ratio at standard temperature (the J12.7.1 formula), for checks and display. */
export function isaDensityRatio(altitudeFt: number, m: Contract.DeterministicMath): number {
  const hM = Math.max(0, altitudeFt) / FEET_PER_METRE;
  return m.pow(1 - ISA_LAPSE_OVER_T0_PER_M * hM, ISA_PRESSURE_EXPONENT - 1);
}

// ---------------------------------------------------------------------------------------------------
// Heat index (J12.4.2; consumed by the fatigue module, D10.5.1). US National Weather Service method:
// Steadman (1979) values fitted by Rothfusz (1990, NWS SR 90-23) with the NWS operational adjustments.
// The simple formula is used when its average with the temperature is under 80 F, as the NWS page says.
export const HEAT_INDEX_SIMPLE = { base: 61, offsetF: 68, slope: 1.2, rhPercent: 0.094 } as const;
export const HEAT_INDEX_ROTHFUSZ = [
  -42.379, 2.04901523, 10.14333127, -0.22475541, -6.83783e-3, -5.481717e-2, 1.22874e-3, 8.5282e-4, -1.99e-6,
] as const;
export const HEAT_INDEX_SWITCH_F = 80;
export const HEAT_INDEX_LOW_RH = { maxRh: 13, minT: 80, maxT: 112, centreT: 95, halfWidth: 17 } as const;
export const HEAT_INDEX_HIGH_RH = { minRh: 85, minT: 80, maxT: 87 } as const;

export const HEAT_INDEX_SOURCES: SourcedConstantGroup = {
  id: 'physics.heat_index_nws',
  what: 'NWS heat index: simple formula, Rothfusz regression coefficients, low- and high-humidity adjustments',
  sources: [
    { citation: 'ECMWF thermofeel, calculate_heat_index_adjusted (cites the NWS WPC heat index equation page)', locator: 'github.com/ecmwf/thermofeel thermofeel/thermofeel.py line 1181', independenceGroup: 'ecmwf-thermofeel', primary: false, dateRead: '2026-11-26' },
    { citation: 'weathermetrics R package, heat.index.algorithm (Anderson, Bell and Peng 2013, BAMS, "Methods to calculate the heat index as an exposure metric")', locator: 'github.com/geanders/weathermetrics R/heat_index.R', independenceGroup: 'anderson-2013-weathermetrics', primary: false, dateRead: '2026-11-26' },
    { citation: 'MetPy heat_index (Unidata; cites Rothfusz 1990 and Steadman 1979)', locator: 'github.com/Unidata/MetPy src/metpy/calc/basic.py def heat_index', independenceGroup: 'unidata-metpy', primary: false, dateRead: '2026-11-26' },
  ],
};

/**
 * Heat index in degrees F from temperature (F) and relative humidity (0 to 1). At or below 40 F it is the
 * temperature itself (weathermetrics, MetPy); the result never falls below the simple formula's domain.
 */
export function heatIndexF(tempF: number, humidity: number, m: Contract.DeterministicMath): number {
  const t = tempF;
  const rh = Math.min(1, Math.max(0, humidity)) * 100;
  if (t <= 40) return t;
  const s = HEAT_INDEX_SIMPLE;
  const simple = 0.5 * (t + s.base + (t - s.offsetF) * s.slope + rh * s.rhPercent);
  if ((simple + t) / 2 < HEAT_INDEX_SWITCH_F) return simple;
  const c = HEAT_INDEX_ROTHFUSZ;
  let hi = c[0] + c[1] * t + c[2] * rh + c[3] * t * rh + c[4] * t * t + c[5] * rh * rh
    + c[6] * t * t * rh + c[7] * t * rh * rh + c[8] * t * t * rh * rh;
  const lo = HEAT_INDEX_LOW_RH;
  const high = HEAT_INDEX_HIGH_RH;
  if (rh < lo.maxRh && t >= lo.minT && t <= lo.maxT) {
    hi -= ((lo.maxRh - rh) / 4) * m.sqrt((lo.halfWidth - Math.abs(t - lo.centreT)) / lo.halfWidth);
  } else if (rh > high.minRh && t >= high.minT && t <= high.maxT) {
    hi += ((rh - high.minRh) / 10) * ((high.maxT - t) / 5);
  }
  return hi;
}
