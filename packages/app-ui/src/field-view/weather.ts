// Weather layer over the field (plan 3.1; J12): rain or snow streaks and a wetness tint, from the
// engine's conditions for the play (presentation feed `FeedConditions`). It carries footing and
// ball-security conditions, nothing else. Particle spots are drawn once per play from the cosmetic
// display stream (plan section 6, PV-01), never from platform random, so a replayed play shows the same
// rain. Particles move with play time (the tick), not wall time, so a paused or stepped film holds
// them still and they can never shift a marker.
import { param } from './params.ts';

export const PRECIP_KINDS = ['none', 'light_rain', 'rain', 'heavy_rain', 'snow', 'heavy_snow'] as const;
export type PrecipKind = (typeof PRECIP_KINDS)[number];

/** The slice of the feed's conditions the layer reads (same names as `FeedConditions`). */
export interface FieldWeather {
  readonly precip: PrecipKind;
  readonly windMph: number;
  /** Degrees counter-clockwise from +x, the direction the wind blows toward (contract D-12). */
  readonly windDirDeg: number;
  readonly roof?: 'open' | 'closed' | 'fixed_dome';
}

/** Structural copy of the cosmetic stream's draw (app-services `CosmeticRandom.uniform`). */
export interface CosmeticDraw {
  uniform(): number;
}

export interface WeatherParticles {
  readonly kind: 'rain' | 'snow';
  /** Spots in the unit square of the view, fixed for the play. */
  readonly u: Float64Array;
  readonly v: Float64Array;
  /** Field-frame wind direction in radians and its speed, for the streak slant. */
  readonly windRad: number;
  readonly windMph: number;
}

/** Particles per precipitation kind. */
export function particleCount(p: PrecipKind): number {
  switch (p) {
    case 'light_rain': return param('rainLightCount');
    case 'rain': return param('rainCount');
    case 'heavy_rain': return param('rainHeavyCount');
    case 'snow': return param('snowCount');
    case 'heavy_snow': return param('snowHeavyCount');
    default: return 0;
  }
}

/** Nothing falls under a closed roof or a dome. */
export function falls(w: FieldWeather | undefined): boolean {
  return !!w && w.precip !== 'none' && w.roof !== 'closed' && w.roof !== 'fixed_dome';
}

/** Builds the play's particles from the cosmetic stream. Null when nothing falls or no stream is given. */
export function buildParticles(w: FieldWeather | undefined, rnd: CosmeticDraw | undefined): WeatherParticles | null {
  if (!falls(w) || !rnd) return null;
  const n = particleCount(w!.precip);
  const u = new Float64Array(n), v = new Float64Array(n);
  for (let i = 0; i < n; i++) { u[i] = rnd.uniform(); v[i] = rnd.uniform(); }
  return { kind: w!.precip.endsWith('snow') ? 'snow' : 'rain', u, v, windRad: (w!.windDirDeg * Math.PI) / 180, windMph: w!.windMph };
}

/** Wet-turf tint strength for the play's conditions (0 for dry or covered fields). */
export function wetTint(w: FieldWeather | undefined): number {
  if (!falls(w)) return 0;
  switch (w!.precip) {
    case 'light_rain': return param('wetTintLight');
    case 'rain': case 'snow': return param('wetTint');
    default: return param('wetTintHeavy');
  }
}
