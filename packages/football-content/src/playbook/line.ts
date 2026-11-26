// G4.6.1 line-of-scrimmage language: checks, alerts, cadence words. Chances returned, the caller draws.
import { param } from './params.ts';
import type { Call } from './types.ts';
import { norm } from './words.ts';

export type LineWordClass = 'protection_id' | 'slide' | 'kill' | 'audible' | 'hot' | 'sight_adjust' | 'indicator' | 'dummy' | 'cadence';

export interface LineWord { readonly word: string; readonly cls: LineWordClass; /** For audibles: the play it calls. */ readonly call?: Call }

/** Chance a player hears a line word: 1 - 0.6 n - 0.01 x max(0, yards - 10), floored at 0 (G4.6.1). */
export function hearChance(noise: number, distanceYd: number, handSignal = false, seesQb = true): number {
  const n = Math.min(1, Math.max(0, noise));
  const voice = Math.max(0, 1 - param('line.hearNoise') * n - param('line.hearPerYard') * Math.max(0, distanceYd - param('line.hearFreeYards')));
  if (!handSignal || !seesQb) return voice;
  return Math.max(voice, param('line.signalBase') - param('line.signalNoise') * n);
}

/** Reset time after a check (G4.6.1). */
export function reactionSeconds(kind: 'protection' | 'kill' | 'audible'): number {
  return kind === 'protection' ? param('line.reactProtectionS') : kind === 'kill' ? param('line.reactKillS') : param('line.reactAudibleS');
}

/** Each audible on the list has a unique word, and no word repeats across classes (G4.6.1). */
export function checkLineWords(words: readonly LineWord[]): string[] {
  const errs: string[] = [];
  const seen = new Map<string, LineWord>();
  for (const w of words) {
    const k = norm(w.word);
    const prev = seen.get(k);
    if (prev) errs.push(`line word ${w.word} used for ${prev.cls} and ${w.cls}`);
    seen.set(k, w);
    if (w.cls === 'audible' && !w.call) errs.push(`audible ${w.word} names no play`);
  }
  return errs;
}

/**
 * A kill call switches to the second play of a two-play call; formation and motion stay, so only the second
 * concept is read (G4.6.1). Returns the call to run when the kill is heard.
 */
export function applyKill(call: Call, heard: boolean): Call {
  if (!heard || !call.second) return { playId: call.playId, tags: call.tags };
  return { playId: call.second.playId, tags: call.second.tags };
}

/** A silent count removes varied and hard counts (G4.6.1, I2.5.3). */
export function countsAvailable(silent: boolean): { readonly varied: boolean; readonly hard: boolean } {
  return silent ? { varied: false, hard: false } : { varied: true, hard: true };
}
