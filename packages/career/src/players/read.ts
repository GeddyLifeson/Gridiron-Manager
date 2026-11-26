// What the coach can see of a relationship and of the man (L1.1.1 display, L1.1.3). True values never leave
// this file as numbers: trust and respect come out as one of five word bands, blurred by familiarity, or a
// range, or "cannot tell yet". Familiarity is a fact of shared time and is shown as a band without blur.
// Revealed personality fields carry noise that shrinks with familiarity. Draws come from the caller's
// seeded stream (P1.1.1, J13).
import { possible } from '@gm/schema';
import { clamp } from './math.ts';
import { pp } from './params.ts';
import type { RelationshipRecord } from './record.ts';

/** A coach's read in words. `band` 0 is "does not believe you", 4 is "would run through a wall" (trust). */
export type BandRead =
  | { readonly kind: 'band'; readonly band: number; readonly textKey: string }
  | { readonly kind: 'range'; readonly lo: number; readonly hi: number; readonly textKey: string }
  | { readonly kind: 'unknown'; readonly textKey: string };

function bandOf(value: number): number {
  const n = pp('read.bands');
  return clamp(Math.floor((clamp(value, 0, 100) / 100) * n), 0, n - 1);
}

/** Chance the shown band is one off: one band of noise at familiarity 50, none at 100 (L1.1.1). */
export function offByOneChance(familiarity: number): number {
  return possible(clamp(pp('read.noiseBandsAtFifty') * (1 - clamp(familiarity, 0, 100) / 100), 0, 1) / 2);
}

/**
 * Read one of trust or respect as the coach sees it (L1.1.1). Under familiarity 15 nothing can be told;
 * from 15 to 30 a range of two bands around a noisy centre; from 30 one band, sometimes one off.
 */
export function readBand(value: number, familiarity: number, measure: 'trust' | 'respect', draw: () => number): BandRead {
  const n = pp('read.bands');
  const fam = clamp(familiarity, 0, 100);
  if (fam < pp('read.rangeCannotTellBelow')) return { kind: 'unknown', textKey: `players.read.${measure}.unknown` };
  let band = bandOf(value);
  const roll = draw();
  const p = offByOneChance(fam);
  if (roll < p) band = clamp(band - 1, 0, n - 1);
  else if (roll < 2 * p) band = clamp(band + 1, 0, n - 1);
  if (fam < pp('read.cannotTellBelow')) {
    const lo = clamp(band - 1, 0, n - 1);
    const hi = clamp(lo + 1, 0, n - 1);
    return { kind: 'range', lo, hi, textKey: `players.read.${measure}.range` };
  }
  return { kind: 'band', band, textKey: `players.read.${measure}.band.${band}` };
}

/** Familiarity is a fact of shared time: shown as a band with no blur (L1.1.1). */
export function familiarityBand(familiarity: number): BandRead {
  const band = bandOf(familiarity);
  return { kind: 'band', band, textKey: `players.read.familiarity.band.${band}` };
}

export interface RelationshipPanel {
  readonly trust: BandRead;
  readonly respect: BandRead;
  readonly familiarity: BandRead;
}

/** The O4 "Relationship" panel for the player's record about the coach, read by the coach. */
export function relationshipPanel(playerAboutCoach: RelationshipRecord, coachFamiliarity: number, draw: () => number): RelationshipPanel {
  return {
    trust: readBand(playerAboutCoach.trust, coachFamiliarity, 'trust', draw),
    respect: readBand(playerAboutCoach.respect, coachFamiliarity, 'respect', draw),
    familiarity: familiarityBand(coachFamiliarity),
  };
}

// L1.1.3 knowing the player

export type RevealField = 'correction' | 'motivation' | 'influences' | 'injuryHonesty' | 'offFieldRisk';
export const REVEAL_ORDER: readonly RevealField[] = ['correction', 'motivation', 'influences', 'injuryHonesty', 'offFieldRisk'];

export function revealThreshold(f: RevealField): number {
  return pp(`know.reveal.${f}`);
}

/** Half-width of the noise on a revealed value: wide when new, under 5 points at familiarity 100 (L1.1.3). */
export function noiseWidth(familiarity: number): number {
  const t = clamp(familiarity, 0, 100) / 100;
  return pp('know.noise.atZero') + (pp('know.noise.atFull') - pp('know.noise.atZero')) * t;
}

export type Revealed =
  | { readonly field: RevealField; readonly state: 'unknown' }
  | { readonly field: RevealField; readonly state: 'estimate'; readonly value: number; readonly halfWidth: number }
  | { readonly field: RevealField; readonly state: 'hint'; readonly hint: 'low' | 'middle' | 'high' };

/**
 * What the coach knows of one personality field (L1.1.3). Below its threshold: unknown. Above: the true
 * value plus noise, with the noise width. Off-field risk is only ever a banded hint.
 */
export function reveal(field: RevealField, trueValue: number, familiarity: number, draw: () => number): Revealed {
  if (familiarity < revealThreshold(field)) return { field, state: 'unknown' };
  const w = noiseWidth(familiarity);
  const value = clamp(Math.round(trueValue + (draw() * 2 - 1) * w), 0, 100);
  if (field === 'offFieldRisk') return { field, state: 'hint', hint: value < 34 ? 'low' : value < 67 ? 'middle' : 'high' };
  return { field, state: 'estimate', value, halfWidth: w };
}
