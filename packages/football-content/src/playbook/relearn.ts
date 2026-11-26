// G4.7.1 cost of renaming and of a new system, and G3.4.1 adopting or merging books. Knowledge is two
// layers per player (D9): the football assignment and the label. This module computes the work and the new
// label levels; D9 owns the stored values and decay. Nothing here is stored on the user (no coach points,
// E9.1.3 case 1): AI label knowledge is a hidden K2 value supplied by the caller.
import { param, LEARNING_PROFILES } from './params.ts';
import { partIdsOf } from './library.ts';
import type { LanguageFamily, Playbook } from './types.ts';
import { norm, type WordList } from './words.ts';

/** Label level right after a rename: 40% of the former level (G4.7.1). */
export function labelAfterRename(former: number): number { return former * param('relearn.labelKeep'); }

/** Units to relearn a renamed label: half the units of the concept behind it (G4.7.1). */
export function labelRelearnUnits(conceptUnits: number): number { return conceptUnits * param('relearn.labelUnitShare'); }

/** Starting label knowledge for a newly signed player who knows the same family (G4.7.1). */
export function signingLabelShare(sameFamily: boolean, formerLabel: number): number {
  return sameFamily ? formerLabel * param('relearn.sameFamilyShare') : 0;
}

/** Mishear multiplier for a renamed word: +50% for four weeks when the old label was at or above 0.8 (G4.7.1). */
export function interferenceMultiplier(oldLabel: number, weeksSinceRename: number): number {
  return oldLabel >= param('relearn.interferenceKnowledge') && weeksSinceRename < param('relearn.interferenceWeeks') ? 1 + param('relearn.interferenceMishear') : 1;
}

export interface RelearnReport {
  /** New football: parts whose content the team does not know (assignment layer). */
  readonly assignmentUnits: number;
  /** New words: known content under a different word (label layer). */
  readonly labelUnits: number;
  readonly newParts: readonly string[];
  readonly renamedParts: readonly { readonly partId: string; readonly from: string; readonly to: string }[];
  readonly sharedContentShare: number;
  /** Hours: units / meeting units per hour of the level (H3), when given. */
  readonly hours: number | null;
}

/**
 * Relearning when the team moves from one book (and word list) to another (G3.4.1, G4.7.1). Parts match by
 * content first; a matched part with a different word costs only label units; an unmatched part costs its
 * full units in the assignment layer. A book that shares more parts costs less (G3.4.1 acceptance).
 */
export function relearnReport(from: { readonly book: Playbook; readonly words: WordList }, to: { readonly book: Playbook; readonly words: WordList }, meetingUnitsPerHour?: number): RelearnReport {
  const used = (b: Playbook) => new Set([...b.plays.values()].filter((p) => p.status !== 'retired').flatMap(partIdsOf));
  const fromByContent = new Map<string, string>();
  for (const id of used(from.book)) { const p = from.book.parts.get(id); if (p) fromByContent.set(`${p.type}|${p.content}`, id); }
  const toUsed = [...used(to.book)].sort();
  let assignmentUnits = 0;
  let labelUnits = 0;
  const newParts: string[] = [];
  const renamedParts: { partId: string; from: string; to: string }[] = [];
  let shared = 0;
  for (const id of toUsed) {
    const p = to.book.parts.get(id)!;
    const units = p.units ?? 1;
    const match = fromByContent.get(`${p.type}|${p.content}`);
    if (!match) { newParts.push(id); assignmentUnits += units; continue; }
    shared++;
    const oldWord = from.words.entries.get(match)?.word ?? '';
    const newWord = to.words.entries.get(id)?.word ?? '';
    if (norm(oldWord) !== norm(newWord)) { renamedParts.push({ partId: id, from: oldWord, to: newWord }); labelUnits += labelRelearnUnits(units); }
  }
  // Plays whose own teaching is new cost their units too.
  const fromPlays = new Set([...from.book.plays.values()].map((p) => JSON.stringify(partIdsOf(p).map((x) => `${from.book.parts.get(x)?.type}|${from.book.parts.get(x)?.content}`).sort())));
  for (const p of to.book.plays.values()) {
    if (p.status === 'retired') continue;
    const sig = JSON.stringify(partIdsOf(p).map((x) => `${to.book.parts.get(x)?.type}|${to.book.parts.get(x)?.content}`).sort());
    if (!fromPlays.has(sig)) assignmentUnits += p.units;
  }
  const total = assignmentUnits + labelUnits;
  return { assignmentUnits, labelUnits, newParts, renamedParts, sharedContentShare: toUsed.length ? shared / toUsed.length : 0, hours: meetingUnitsPerHour ? total / meetingUnitsPerHour : null };
}

/** Units to switch language family on the same football: base vocabulary of the new family plus every word relabelled. */
export function familySwitchUnits(words: WordList, to: LanguageFamily, partUnits: (partId: string) => number): number {
  let units = LEARNING_PROFILES[to].baseVocabulary;
  for (const e of words.entries.values()) units += labelRelearnUnits(partUnits(e.partId));
  return units;
}

/** Units to rename a set of words (G4.7.1): label layer only. */
export function renameUnits(partIds: readonly string[], partUnits: (partId: string) => number): number {
  let u = 0;
  for (const id of partIds) u += labelRelearnUnits(partUnits(id));
  return u;
}
