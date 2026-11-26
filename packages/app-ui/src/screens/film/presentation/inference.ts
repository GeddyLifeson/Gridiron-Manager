// Staff inference (PV-12, plan 3.5; O2.6.2, H2): the staff's guess at the opponent's call is drawn as a
// guess with a confidence word, never as the truth and never as a number or probability.
import type { OverlayLineLike } from '../types.ts';

/** The H2 film-confidence words. */
export const CONFIDENCE_WORDS = ['strong', 'fair', 'thin'] as const;
export type ConfidenceWord = (typeof CONFIDENCE_WORDS)[number];

/** Label for a guessed line: words, who drew it, and the confidence word when the staff gave one. */
export function guessLabel(g: OverlayLineLike): string {
  const who = g.author === 'user' ? 'your guess' : `staff guess, ${g.author.startsWith('staff:') ? `staff #${g.author.slice(6)}` : g.author}`;
  const conf = g.confidence && (CONFIDENCE_WORDS as readonly string[]).includes(g.confidence) ? `, ${g.confidence} read` : '';
  return `${g.words} (${who}${conf})`;
}
