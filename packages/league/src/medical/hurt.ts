// Playing hurt (D11.6.2, H5.3.1): penalties while a cleared player plays through an injury, toughness,
// hiding an injury, and pain-relief injections (the physician's call with the player's consent; asking
// for one is pressure, D11.3.3).
import { possible, type RandomStream } from '@gm/schema';
import table from './data/playthrough.json' with { type: 'json' };
import { P } from './params.ts';

export type Channel = (typeof table.channels)[number];
export const CHANNELS: readonly string[] = table.channels;
export type Penalties = Readonly<Record<string, number>>;

const ROWS = table.rows as Record<string, readonly (Penalties | null)[]>;

/** The row's penalties at a grade (grade 1 when the row has none), or null when it cannot be played through. */
export function basePenalties(typeId: string, grade: number | null): Penalties | null {
  const r = ROWS[typeId];
  if (!r) return null;
  return r[Math.max(0, (grade ?? 1) - 1)] ?? null;
}

export const canPlayThrough = (typeId: string, grade: number | null): boolean => basePenalties(typeId, grade) !== null;

/**
 * Penalties for one game: toughness cuts them by up to one third; an injection hides up to half of what is
 * left for that game and leaves the re-injury multiplier alone (the player feels better than he is).
 */
export function playThroughPenalties(typeId: string, grade: number | null, toughness: number, injection: boolean): Penalties | null {
  const base = basePenalties(typeId, grade);
  if (!base) return null;
  const t = Math.min(1, Math.max(0, toughness));
  const k = (1 - P('toughnessMaxReduction') * t) * (injection ? 1 - P('injectionHiddenShare') : 1);
  const out: Record<string, number> = {};
  for (const [ch, v] of Object.entries(base)) out[ch] = v * k;
  return out;
}

/** Chance a player keeps a minor injury from the staff (D11.6.2): rises with toughness. */
export function hideChance(toughness: number): number {
  return possible(P('hideBase') + P('hideToughnessWeight') * Math.min(1, Math.max(0, toughness)));
}

/** Daily chance the staff finds a hidden injury; a position coach's report naming him finds it (H5.6.2 rule 2). */
export function hiddenFound(namedInReport: boolean, s: RandomStream): boolean {
  const hit = s.chance(possible(P('hiddenDailyDiscovery')));
  return namedInReport || hit;
}
