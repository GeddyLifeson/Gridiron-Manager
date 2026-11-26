// Simulation contract, part 5: the environment snapshot (J12.1.1). Part of the game state; updated at
// each quarter change by J12.2.2. Derived multipliers are computed in one place (J12) by table lookup
// so consumers never interpret raw weather themselves.
import { z } from 'zod';
import { pub } from '../field.ts';

export const Roof = z.enum(['open', 'closed', 'fixed_dome']);
export const Precip = z.enum(['none', 'light_rain', 'rain', 'heavy_rain', 'snow', 'heavy_snow']);
export const SurfaceCondition = z.enum(['dry', 'damp', 'wet', 'soft', 'frozen', 'snow_covered']);

export const Environment = z.object({
  roof: pub(Roof),
  tempF: pub(z.number(), 'deg_f'),
  /** Steady wind at field level before the shelter factor. Converted to yd/s by the engine on load (J1.2.1). */
  windMph: pub(z.number().min(0), 'mph'),
  /**
   * Direction the wind blows toward, degrees 0 to 359 in the field frame, counter-clockwise from +x
   * (0 blows toward the east goal line). Contract decision D-12: J12.1.1 says "0 = toward the north
   * goal", but the field of J1.1.1 has no north goal.
   */
  windDirDeg: pub(z.number().min(0).max(359), 'deg'),
  gustMph: pub(z.number().min(0), 'mph'),
  precip: pub(Precip),
  humidity: pub(z.number().min(0).max(1), 'ratio'),
  /** Content id of the surface type from the venue record (C1). */
  surfaceType: pub(z.string()),
  surfaceCondition: pub(SurfaceCondition),
  altitudeFt: pub(z.number(), 'ft'),
  noiseBase: pub(z.number().min(0).max(1), 'ratio'),
  daylight: pub(z.boolean()),
  /** Derived multipliers (J12.4.1, J12.5.1, J12.7.1). 1 is neutral. */
  derived: pub(z.object({
    footing: pub(z.number(), 'ratio'),
    grip: pub(z.number(), 'ratio'),
    airDensity: pub(z.number(), 'ratio'),
    kickDistance: pub(z.number(), 'ratio'),
    passDistance: pub(z.number(), 'ratio'),
  })),
}).strict();
export type Environment = z.infer<typeof Environment>;

/**
 * Neutral indoor snapshot for tests and for phases before J12 exists. Every derived multiplier is 1, so
 * the raw values have no effect. 70 degrees is the closed-roof Assumption of J12.1.1, not a measured fact.
 */
export const NEUTRAL_ENVIRONMENT: Environment = {
  roof: 'fixed_dome', tempF: 70, windMph: 0, windDirDeg: 0, gustMph: 0, precip: 'none', humidity: 0.5,
  surfaceType: 'core:neutral', surfaceCondition: 'dry', altitudeFt: 0, noiseBase: 0, daylight: false,
  derived: { footing: 1, grip: 1, airDensity: 1, kickDistance: 1, passDistance: 1 },
};
