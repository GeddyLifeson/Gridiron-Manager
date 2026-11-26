// Synthesized sound recipes (PV-07). The table, the engine rows built from it, and the small
// selectors the drivers (PV-08 crowd, PV-09 cadence, PV-10 ambience) use to turn feed values into
// sound ids and levels. Feed value names follow the PV-00 presentation feed.

import type { SoundDef } from '../engine/types.ts';
import { dbToGain } from './render-offline.ts';
import { RECIPES } from './recipes.ts';
import TRIMS from './trims.json' with { type: 'json' };
import type { RecipeEntry } from './types.ts';

export { RECIPES } from './recipes.ts';
export { LOUDNESS_TARGET, loudestWindowRmsDb, peakDb } from './loudness.ts';
export { renderRecipe, dbToGain, gainToDb, SAMPLE_RATE, type RenderOptions } from './render-offline.ts';
export type { RecipeEntry, RecipeGate } from './types.ts';

export const RECIPE_BY_ID: ReadonlyMap<string, RecipeEntry> = new Map(RECIPES.map((r) => [r.id, r]));

/** Loudness trim in dB per recipe id (calibrated; see `scripts/audio/calibrate-recipes.ts`). */
export const RECIPE_TRIMS: Readonly<Record<string, number>> = TRIMS;

export function trimDb(id: string): number {
  const t = RECIPE_TRIMS[id];
  if (t === undefined) throw new Error(`recipe ${id} has no trim; run scripts/audio/calibrate-recipes.ts`);
  return t;
}

/** Engine rows for every recipe that may play. Gated recipes (period-fact) are left out until PV-10
 * clears them; pass `includeGated` to build them anyway (tests, offline renders). */
export function toSoundDefs(opts: { includeGated?: boolean } = {}): SoundDef[] {
  return RECIPES.filter((r) => opts.includeGated || !r.gate).map((r) => {
    const { info: _i, phase: _p, era: _e, bed: _b, mixDb, priority: _pr, gate: _g, offByDefault: _o, recipe, ...def } = r;
    return { ...def, recipe: { ...recipe, gain: dbToGain(trimDb(r.id) + mixDb) } };
  });
}

/** PV-00 cadence cue kind to a sound id. A silent count is silent: no sound at all. */
export function cadenceSoundId(kind: 'voiced' | 'hard' | 'silent'): string | null {
  return kind === 'silent' ? null : kind === 'hard' ? 'cadence.hard' : 'cadence.voiced';
}

/** PV-00 relay cue quality to a sound id. */
export const relaySoundId = (quality: 'clean' | 'garbled'): string => (quality === 'garbled' ? 'cadence.relay.garbled' : 'cadence.relay.clean');

/** PV-00 contact tier (1 to 4, from J6) to a sound id. The tier is never derived here. */
export function contactSoundId(tier: number): string {
  if (tier !== 1 && tier !== 2 && tier !== 3 && tier !== 4) throw new Error(`contact tier must be 1 to 4, got ${tier}`);
  return `contact.hit.tier${tier}`;
}

/** Wind bed level 0..1 from the engine's wind speed in mph. Silent in calm air, full at 30 mph and
 * above, 24 dB of range between (Assumption: a design curve tuned by ear, not a measured fact). */
export function windLevel(windMph: number): number {
  if (!(windMph > 0)) return 0;
  return dbToGain(-24 * (1 - Math.min(windMph, 30) / 30));
}

/** Gust one-shot gain 0..1 from the engine's gust speed in mph: full at 45 mph and above, 18 dB of
 * range below (Assumption: design curve). */
export function gustLevel(gustMph: number): number {
  if (!(gustMph > 0)) return 0;
  return dbToGain(-18 * (1 - Math.min(gustMph, 45) / 45));
}
