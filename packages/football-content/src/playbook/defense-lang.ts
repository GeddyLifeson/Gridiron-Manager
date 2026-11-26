// G4.5 defensive call grammar: naming conventions (G4.5.2) and the on-field relay chain (G4.5.1), plus
// defensive bands and boards (G4.4.5). Chances are returned; the caller draws.
import { param } from './params.ts';
import type { Playbook } from './types.ts';
import { norm, type WordList } from './words.ts';

// ---------------------------------------------------------------- stunt names (G4.5.2)

/** Letters for linemen by role; the user may replace them. Sourced names use E for end and T for tackle. */
export const DEFAULT_LINE_LETTERS: Readonly<Record<string, string>> = { end: 'E', tackle: 'T', nose: 'N' };

/**
 * A stunt's name from its drawn movement: one letter per lineman in firing order, the first the penetrator and
 * the second the looper ("TE": tackle penetrates, end loops), plus an optional suffix ("TEX").
 */
export function stuntName(firingOrder: readonly string[], letters: Readonly<Record<string, string>> = DEFAULT_LINE_LETTERS, suffix = ''): string {
  if (firingOrder.length < 2) throw new Error('a stunt moves at least two linemen');
  return firingOrder.map((r) => { const l = letters[r]; if (!l) throw new Error(`no letter for lineman ${r}`); return l; }).join('') + suffix;
}

/** The builder refuses a stunt whose name disagrees with its drawn order (G4.5.2). */
export function checkStuntName(name: string, firingOrder: readonly string[], letters: Readonly<Record<string, string>> = DEFAULT_LINE_LETTERS): string | null {
  const want = stuntName(firingOrder, letters);
  return name.toUpperCase().startsWith(want) && name.length <= want.length + 1 ? null : `stunt ${name} disagrees with its drawn order (${want})`;
}

// ---------------------------------------------------------------- declarations and coverage words

export interface DeclarationPair { readonly meaning: 'rotation' | 'field_boundary' | 'pass_strength'; readonly a: string; readonly b: string }

/** Pairs must start with different letters, R and L style, to cut confusion in noise (G4.5.2). */
export function checkDeclarationPairs(pairs: readonly DeclarationPair[]): string[] {
  return pairs.filter((p) => norm(p.a)[0] === norm(p.b)[0]).map((p) => `declaration pair ${p.a}/${p.b} shares a first letter`);
}

/** A plan carrying more coverage words than the starting value draws a warning (G4.5.2). */
export function coverageWordWarning(book: Playbook, words: WordList, planCallIds: readonly string[]): string | null {
  const used = new Set<string>();
  for (const id of planCallIds) {
    const c = book.plays.get(id);
    if (!c || c.book !== 'defense') continue;
    if (c.parts.coverage) used.add(norm(words.entries.get(c.parts.coverage)?.word ?? c.parts.coverage));
    for (const t of c.tags) if (book.parts.get(t)?.type === 'tag') used.add(norm(words.entries.get(t)?.word ?? t));
  }
  const max = param('defense.coverageWordsMax');
  return used.size > max ? `the plan carries ${used.size} coverage words (starting limit ${max})` : null;
}

// ---------------------------------------------------------------- relay chain (G4.5.1)

export type LinkKind = 'voice' | 'signal';
export interface ChainLink { readonly from: string; readonly to: readonly string[]; readonly kind: LinkKind; readonly carries: 'call' | 'front' | 'coverage' }

/** Default chain (G4.5.1, editable): sideline to the speaker-helmet player; he gives front and pressure; the safety declares coverage to the corners. */
export function defaultChain(speaker: string, front: readonly string[], coverageCaller: string, corners: readonly string[]): ChainLink[] {
  return [
    { from: 'sideline', to: [speaker], kind: 'voice', carries: 'call' },
    { from: speaker, to: front.filter((x) => x !== speaker), kind: 'voice', carries: 'front' },
    { from: speaker, to: [coverageCaller], kind: 'signal', carries: 'coverage' },
    { from: coverageCaller, to: corners, kind: 'voice', carries: 'coverage' },
  ];
}

/** One link's success chance: voice 0.99 - 0.25 n - 0.1 (1 - k); signal 0.98 - 0.05 n - 0.1 (1 - k) (G4.5.1). */
export function linkSuccess(kind: LinkKind, noise: number, receiverKnowledge: number): number {
  const n = Math.min(1, Math.max(0, noise));
  const k = Math.min(1, Math.max(0, receiverKnowledge));
  const p = kind === 'voice'
    ? param('relay.voiceBase') - param('relay.voiceNoise') * n - param('relay.knowledge') * (1 - k)
    : param('relay.signalBase') - param('relay.signalNoise') * n - param('relay.knowledge') * (1 - k);
  return Math.min(1, Math.max(0, p));
}

export function linkSeconds(kind: LinkKind): number { return kind === 'voice' ? param('relay.voiceS') : param('relay.signalS'); }

/**
 * Chance each defender gets the new call (G4.5.1): the product of link chances on his path from the sideline.
 * A failed link leaves those beyond it on the previous call. With `everyoneReads` the chain is replaced by
 * independent reads of the sideline (G4.4.5). Band wearers skip the chain at the lookup error.
 */
export function deliveryChances(chain: readonly ChainLink[], defenders: readonly string[], noise: number, knowledge: (id: string) => number, opts: { readonly everyoneReads?: boolean; readonly bandWearers?: ReadonlySet<string>; readonly firstLinkFails?: boolean } = {}): Map<string, number> {
  const out = new Map<string, number>();
  if (opts.everyoneReads) {
    for (const d of defenders) out.set(d, 1 - param('relay.everyoneReadsError'));
    return out;
  }
  const reach = new Map<string, number>([['sideline', 1]]);
  chain.forEach((link, i) => {
    const fromP = reach.get(link.from) ?? 0;
    for (const to of link.to) {
      const p = i === 0 && opts.firstLinkFails ? 0 : fromP * linkSuccess(link.kind, noise, knowledge(to));
      reach.set(to, Math.max(reach.get(to) ?? 0, p));
    }
  });
  for (const d of defenders) {
    if (opts.bandWearers?.has(d)) out.set(d, 1 - param('band.playerLookupError'));
    else out.set(d, reach.get(d) ?? 0);
  }
  return out;
}

/** Chance the whole chain delivers the call to every defender (the G4.5.1 noise comparison). */
export function fullDelivery(chain: readonly ChainLink[], noise: number, knowledge: (id: string) => number): number {
  let p = 1;
  for (const link of chain) for (const to of link.to) p *= linkSuccess(link.kind, noise, knowledge(to));
  return p;
}

/** Time the chain takes: the longest path's link times. */
export function chainSeconds(chain: readonly ChainLink[]): number {
  const t = new Map<string, number>([['sideline', 0]]);
  for (const link of chain) for (const to of link.to) t.set(to, Math.max(t.get(to) ?? 0, (t.get(link.from) ?? 0) + linkSeconds(link.kind)));
  return Math.max(...t.values());
}

/** Speaker helmet after a substitution (G4.5.1 edge case): primary, else backup if on the field, else signals. */
export function speakerOnField(primary: string, backup: string | null, onField: ReadonlySet<string>): string | 'signals' {
  if (onField.has(primary)) return primary;
  if (backup && onField.has(backup)) return backup;
  return 'signals';
}

/** Card swaps by series or quarter add a wrong-card error per player in a series where cards changed (G4.4.5). */
export function wrongCardError(cardsChangedThisSeries: boolean): number {
  return cardsChangedThisSeries ? param('band.wrongCardError') : 0;
}

/** A defensive band's cell count falls in the starting range (G4.4.5). */
export function defenseBandInRange(cells: number): boolean {
  return cells >= param('band.defenseCellsMin') && cells <= param('band.defenseCellsMax');
}
