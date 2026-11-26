// G4.3 spoken length and its cost, and the huddle procedure (G4.1.2). Length in seconds is what I2 charges
// against the play clock. Both models are placeholders until a timing study exists (G4.3.1).
import { param } from './params.ts';
import type { Rendered } from './grammar.ts';
import { wordCount } from './grammar.ts';
import { syllablesOf, type WordList } from './words.ts';

export type LengthModel = 'syllable' | 'token';

/** Syllables of a rendered call (user corrections win). */
export function callSyllables(r: Rendered, words: WordList): number {
  let n = 0;
  for (const t of r.tokens) {
    const e = words.entries.get(t.partId);
    n += e ? syllablesOf(e) : syllablesOf({ word: t.word, syllables: null, say: 'digits' });
  }
  return n;
}

/** Spoken length in seconds (G4.3.1). Syllable model: syllables / rate + pause per part boundary. Token model: tokens x cost. */
export function spokenLength(r: Rendered, words: WordList, model: LengthModel = 'syllable', tokenCostS = param('spoken.tokenS')): number {
  if (!r.tokens.length) return 0;
  if (model === 'token') return r.tokens.length * tokenCostS;
  return callSyllables(r, words) / param('spoken.syllablesPerS') + (r.tokens.length - 1) * param('spoken.boundaryPauseS');
}

/** Length of the first n tokens (quarterback early recognition, G4.3.2). */
export function prefixLength(r: Rendered, words: WordList, n: number, model: LengthModel = 'syllable'): number {
  return spokenLength({ tokens: r.tokens.slice(0, n), text: '' }, words, model);
}

// ---------------------------------------------------------------- huddle (G4.1.2)

export interface HuddleProcedure {
  /** Times the quarterback says the call: 1 or 2. */
  readonly repeats: 1 | 2;
  readonly repeatSnapCount: boolean;
  /** Linemen leave after the protection or run scheme is said. */
  readonly lineBreaksEarly: boolean;
  /** Receivers get the call by signal while the line huddles. */
  readonly receiversBySignal: boolean;
}

/** Stage 4 duration: base plus spoken length times repeats (G4.1.2). */
export function huddleSeconds(lengthS: number, proc: HuddleProcedure): number {
  return param('huddle.baseS') + lengthS * proc.repeats;
}

/**
 * Chance one player mishears a word of the call (G4.1.2): rises with noise (J12), length and low knowledge
 * of the words (D9); saying it twice halves it. Coefficients are module assumptions; the shape is the leaf's.
 */
export function mishearChance(lengthS: number, noise: number, labelKnowledge: number, repeats: 1 | 2, interference = 1): number {
  const n = Math.min(1, Math.max(0, noise));
  const k = Math.min(1, Math.max(0, labelKnowledge));
  const p = (param('huddle.mishearBase') + param('huddle.mishearPerNoise') * n + param('huddle.mishearPerSecond') * lengthS) * (1 + param('huddle.mishearLowKnowledge') * (1 - k)) * interference;
  const r = repeats === 2 ? p * param('huddle.twiceMishearFactor') : p;
  return Math.min(1, r);
}

/** With the line breaking early, linemen do not hear parts after their own: only parts that change their job matter. */
export function lineHearsPart(proc: HuddleProcedure, partIndex: number, lineLastIndex: number): boolean {
  return !proc.lineBreaksEarly || partIndex <= lineLastIndex;
}

// ---------------------------------------------------------------- limits (G4.3.2)

export interface LengthWarning {
  readonly overSeconds: boolean;
  readonly overWords: boolean;
  readonly lengthS: number;
  readonly words: number;
  /** Play-clock reading by which the call must start for the radio to carry it (cutoff + length). Null without radio. */
  readonly latestStartS: number | null;
  /** The same for a wristband number. */
  readonly latestBandStartS: number | null;
}

/**
 * G4.3.2 warnings. `cutoffS` is the rule set's coach-to-player cutoff on the play clock (key
 * comm.c2p_cutoff_seconds); null when the rule set has no radio.
 */
export function lengthWarning(r: Rendered, words: WordList, cutoffS: number | null, twoPlay: boolean, model: LengthModel = 'syllable', bandNumberS = param('band.lookupS')): LengthWarning {
  const lengthS = spokenLength(r, words, model);
  const n = wordCount(r);
  const maxWords = twoPlay ? param('limits.maxWordsDouble') : param('limits.maxWordsSingle');
  return {
    overSeconds: lengthS > param('limits.maxS'),
    overWords: n > maxWords,
    lengthS,
    words: n,
    latestStartS: cutoffS === null ? null : cutoffS + lengthS,
    latestBandStartS: cutoffS === null ? null : cutoffS + bandNumberS,
  };
}

/**
 * Relay length for the quarterback (G4.3.2): at or above the early-recognition knowledge he knows the call
 * after its first four tokens, plus a fixed margin. An alias replaces the call with one word. The huddle
 * still pays the full length because ten other players hear it.
 */
export function relayLength(r: Rendered, words: WordList, qbLabelKnowledge: number, alias: Rendered | null = null, model: LengthModel = 'syllable'): number {
  if (alias) return spokenLength(alias, words, model);
  const full = spokenLength(r, words, model);
  if (qbLabelKnowledge >= param('limits.earlyRecognitionKnowledge')) {
    const n = param('limits.earlyRecognitionTokens');
    if (r.tokens.length > n) return Math.min(full, prefixLength(r, words, n, model) + param('limits.earlyRecognitionExtraS'));
  }
  return full;
}

/** Whether a quarterback may be given aliases (label knowledge below the alias threshold, G4.3.2). */
export function aliasAllowed(qbLabelKnowledge: number): boolean {
  return qbLabelKnowledge < param('limits.aliasKnowledgeBelow');
}

export interface BandSuggestion { readonly id: string; readonly secondsSaved: number; readonly expectedUses: number; readonly score: number }

/** "Calls to move to the band": calls over either limit, sorted by expected uses this week x seconds saved (G4.3.2). */
export function bandSuggestions(calls: readonly { readonly id: string; readonly warning: LengthWarning; readonly expectedUses: number }[], bandNumberS = param('band.lookupS')): BandSuggestion[] {
  return calls.filter((c) => c.warning.overSeconds || c.warning.overWords).map((c) => {
    const secondsSaved = Math.max(0, c.warning.lengthS - bandNumberS);
    return { id: c.id, secondsSaved, expectedUses: c.expectedUses, score: secondsSaved * c.expectedUses };
  }).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

/** Length distribution and the ten longest calls (G4.3.2 report). */
export function lengthReport(calls: readonly { readonly id: string; readonly lengthS: number }[]): { readonly longest: readonly { readonly id: string; readonly lengthS: number }[]; readonly buckets: ReadonlyMap<number, number> } {
  const longest = [...calls].sort((a, b) => b.lengthS - a.lengthS || (a.id < b.id ? -1 : 1)).slice(0, 10);
  const buckets = new Map<number, number>();
  for (const c of calls) { const b = Math.floor(c.lengthS); buckets.set(b, (buckets.get(b) ?? 0) + 1); }
  return { longest, buckets };
}
