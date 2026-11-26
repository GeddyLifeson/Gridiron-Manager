// Stadium and weather ambience driver (PV-10, plan 4.2 rows "Weather" and "Stadium ambience").
// Wind and rain are beds on the `ambience` bus. Their level follows the engine's conditions for the
// play (J12.3.1), and eases between plays only. A gust plays as a one-shot when the engine's gust
// value is clearly above the steady wind. PA chime, band hit and organ sting play only in a
// stoppage. Nothing here draws a random number: variety comes from the caller's `cosmetic.audio` draw.
// The bus is off by default, so with default settings the engine creates no nodes at all.

import type { AudioEngine, BedHandle } from '../engine/index.ts';
import { gustLevel, windLevel } from '../recipes/index.ts';

/** The slice of the PV-00 feed conditions (`FeedConditions`) this driver reads. */
export interface AmbienceConditions {
  readonly windMph: number;
  readonly gustMph: number;
  readonly precip: 'none' | 'light_rain' | 'rain' | 'heavy_rain' | 'snow' | 'heavy_snow';
  readonly roof: 'open' | 'closed' | 'fixed_dome';
}

/**
 * Plan 2.1 period fact: "stadium organs and marching bands played during stoppages in the period".
 * PV-10 checked it on 2026-11-26 and could not establish it for the 1970s and 1980s (see
 * plans/presentation/pv10-ambience.md), so it stays an Assumption and the organ sting and band hit
 * stay gated. Flip this only with three sources, and then build the engine rows with `includeGated`.
 */
export const PERIOD_FACT_CLEARED = false;

/**
 * The band half of the period fact is cleared: F-presentation-era-0001 (facts/presentation-era.json) is
 * Verified from three re-read pages (KCUR, Packers.com, Ravens history) showing live team bands at NFL home
 * games in the 1970s and 1980s. The quotes are in /mnt/project-files/research/band/band-quotes.md. The ORGAN has
 * no dated NFL source, so it stays gated behind PERIOD_FACT_CLEARED.
 */
export const BAND_FACT_CLEARED = true;

/** Rain bed level 0..1 by engine precipitation. Snow is quiet, so it has no bed (Assumption: design curve). */
export function rainLevel(precip: AmbienceConditions['precip']): number {
  switch (precip) {
    case 'light_rain': return 0.35;
    case 'rain': return 0.65;
    case 'heavy_rain': return 1;
    default: return 0;
  }
}

/** Beds hold only under an open sky: a closed roof or a fixed dome keeps the weather out. */
export function bedLevels(c: AmbienceConditions): { wind: number; rain: number } {
  if (c.roof !== 'open') return { wind: 0, rain: 0 };
  return { wind: windLevel(c.windMph), rain: rainLevel(c.precip) };
}

/** A gust sounds only when it is at least this many mph above the steady wind (Assumption: design value). */
export const GUST_OVER_WIND_MPH = 5;

export type StoppageSting = 'paChime' | 'bandHit' | 'organSting';
const STING_ID: Record<StoppageSting, string> = { paChime: 'ambience.paChime', bandHit: 'ambience.bandHit', organSting: 'ambience.organSting' };

export interface AmbienceOptions {
  /** Ease between plays, seconds. */
  rampSeconds?: number;
  /** Defaults to PERIOD_FACT_CLEARED. Organ and band stings need this and the engine rows built with `includeGated`. */
  periodFactCleared?: boolean;
  /** Defaults to BAND_FACT_CLEARED. The band hit needs only this. */
  bandFactCleared?: boolean;
}

export class AmbienceDriver {
  private wind: BedHandle | null = null;
  private rain: BedHandle | null = null;
  private inPlay = false;
  private readonly ramp: number;
  private readonly periodOk: boolean;
  private readonly bandOk: boolean;

  constructor(private readonly engine: AudioEngine, opts: AmbienceOptions = {}) {
    this.ramp = opts.rampSeconds ?? 1.5;
    this.periodOk = opts.periodFactCleared ?? PERIOD_FACT_CLEARED;
    this.bandOk = opts.bandFactCleared ?? BAND_FACT_CLEARED;
  }

  /** A play has started (snap) or ended (dead ball). Stings are refused while a play is live. */
  setPlayLive(live: boolean): void { this.inPlay = live; }

  /** Call between plays with the next play's conditions. Starts, eases or stops the beds. */
  update(c: AmbienceConditions, when?: number): void {
    const { wind, rain } = bedLevels(c);
    this.wind = this.drive(this.wind, 'ambience.wind', wind, when);
    this.rain = this.drive(this.rain, 'ambience.rain', rain, when);
  }

  /** At the snap: a gust swell if the engine's gust is clearly above the wind. Returns whether one was requested. */
  gust(c: AmbienceConditions, opts: { when?: number; variantDraw?: number } = {}): boolean {
    if (c.roof !== 'open' || c.gustMph < c.windMph + GUST_OVER_WIND_MPH) return false;
    const gain = gustLevel(c.gustMph);
    if (gain <= 0) return false;
    return this.engine.play('ambience.gust', { when: opts.when, gain, variantDraw: opts.variantDraw }).played;
  }

  /** A stoppage sting. Refused during a live play, the organ while the period fact is unverified, and the band if its fact is off. */
  stoppage(kind: StoppageSting, opts: { when?: number; variantDraw?: number } = {}): boolean {
    if (this.inPlay) return false;
    if (kind === 'organSting' && !this.periodOk) return false;
    if (kind === 'bandHit' && !this.bandOk) return false;
    return this.engine.play(STING_ID[kind], { when: opts.when, variantDraw: opts.variantDraw }).played;
  }

  stop(fadeSeconds?: number): void {
    this.wind?.stop(fadeSeconds); this.rain?.stop(fadeSeconds);
    this.wind = null; this.rain = null;
  }

  private drive(bed: BedHandle | null, id: string, level: number, when?: number): BedHandle | null {
    if (level <= 0) { bed?.stop(this.ramp); return null; }
    if (bed) { bed.setLevel(level, this.ramp, when); return bed; }
    const def = this.engine.sound(id);
    if (!def) return null;
    return this.engine.startBed(id, { bus: 'ambience', recipe: def.recipe }, level, this.ramp);
  }
}
