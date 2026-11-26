// Small helpers shared by the schedule files. Pure: randomness only through the RandomStream handed in
// (J13, P1.1.1); distance by a Taylor-series cosine from config.json, never platform trig.
import type { RandomStream } from '@gm/schema';
import type { ScheduleConfig, TeamId } from './types.ts';
export const TWO = 1 + 1;

/** Mathematical modulo: result in [0, m). */
export function mod(n: number, m: number): number {
  const r = n % m;
  return r < 0 ? r + m : r;
}

export function floorDiv(n: number, m: number): number {
  return Math.floor(n / m);
}

export function isEven(n: number): boolean {
  return mod(n, TWO) === 0;
}

export function half(n: number): number {
  return n / TWO;
}

/** Fisher-Yates with one stream draw per position. */
export function shuffle<T>(items: readonly T[], rng: RandomStream): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const t = out[i]!;
    out[i] = out[j]!;
    out[j] = t;
  }
  return out;
}

export function pickOne<T>(items: readonly T[], rng: RandomStream): T {
  if (items.length === 0) throw new Error('pickOne on an empty list');
  return items[rng.int(0, items.length - 1)]!;
}

export function pairKey(a: TeamId, b: TeamId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Integer power by repeated multiplication (the core lint bans `**` and Math.pow). */
export function ipow(x: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r *= x;
  return r;
}

/** Look up a by-year table with a `default` row. */
export function byYear<T>(table: Readonly<Record<string, T>>, year: number): T {
  const hit = table[String(year)];
  if (hit !== undefined) return hit;
  const d = table['default'];
  if (d === undefined) throw new Error(`no default row in by-year table for ${year}`);
  return d;
}

/** Cosine by the Taylor coefficients in config (radians, small angles: latitudes). */
export function taylorCos(x: number, cfg: ScheduleConfig): number {
  const x2 = x * x;
  let term = 1;
  let sum = 0;
  for (const c of cfg.geo.cosTaylor) {
    sum += c * term;
    term *= x2;
  }
  return sum;
}

/** Equirectangular distance in km. Good to well under 1% at these ranges; used to rank and threshold. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number, cfg: ScheduleConfig): number {
  const k = cfg.geo.degToRad;
  const mid = half(lat1 + lat2) * k;
  const dx = (lon2 - lon1) * k * taylorCos(mid, cfg);
  const dy = (lat2 - lat1) * k;
  return cfg.geo.earthRadiusKm * Math.sqrt(dx * dx + dy * dy);
}

export function zoneOffset(zone: string | null | undefined, cfg: ScheduleConfig): number {
  const table = cfg.zones.utcOffsetHours as Record<string, number>;
  if (!zone) return table[cfg.zones.easternZone]!;
  const v = table[zone];
  if (v === undefined) throw new Error(`unknown time zone ${zone}: add it to schedule config zones`);
  return v;
}

export function dayOffsetOf(day: string, cfg: ScheduleConfig): number {
  const v = (cfg.slots.days as Record<string, number>)[day];
  if (v === undefined) throw new Error(`unknown day code ${day}`);
  return v;
}

/** Days between two games given weeks and day offsets (C2.2.2). */
export function daysBetween(w1: number, d1: number, w2: number, d2: number, cfg: ScheduleConfig): number {
  return (w2 - w1) * cfg.time.daysPerWeek + d2 - d1;
}
