// D9.3.2 carryover between systems: starting family knowledge = old family knowledge x similarity
// (1.0 same, 0.5 to 0.8 related, 0 unrelated); concepts start at family minus 20; terminology starts at old
// terminology x terminology similarity. Knowledge of a system not used for years sits at its floor, which
// the caller supplies by reading the old book on today's date (decay is a closed form).
import type { KnowledgeBook } from './book.ts';
import type { ItemCatalogue } from './items.ts';
import { clampK, num, type KnowledgeNumbers } from './params.ts';

/** What a player knows of a family elsewhere, read on the arrival day. */
export interface PriorFamily {
  readonly family: string;
  readonly value: number;
  readonly terminology: number;
}

/** One link of the family similarity table (G, F): a new family related to an old one. */
export interface SimilarityLink {
  readonly newFamily: string;
  readonly oldFamily: string;
  /** 1.0 same family, 0.5 to 0.8 related, 0 unrelated. */
  readonly similarity: number;
  /** Similarity of the words: usually low between coaching trees. */
  readonly terminology: number;
}

/** Problems with a similarity table: related values must sit in the leaf's band (or be exactly 0 or 1). */
export function similarityProblems(n: KnowledgeNumbers, links: readonly SimilarityLink[]): string[] {
  const lo = num(n, 'carry.relatedMin');
  const hi = num(n, 'carry.relatedMax');
  const out: string[] = [];
  for (const l of links) {
    const s = l.similarity;
    if (!(s === 0 || s === 1 || (s >= lo && s <= hi))) out.push(`${l.newFamily}<-${l.oldFamily}: similarity ${s} is neither 0, 1 nor ${lo} to ${hi}`);
    if (!(l.terminology >= 0 && l.terminology <= 1)) out.push(`${l.newFamily}<-${l.oldFamily}: terminology similarity ${l.terminology} outside 0 to 1`);
  }
  return out;
}

export interface CarryResult {
  readonly family: string;
  readonly familyValue: number;
  readonly terminologyValue: number;
}

/** Starting family and terminology knowledge for each new family: the best link over the player's history. */
export function carryFamilies(n: KnowledgeNumbers, prior: readonly PriorFamily[], links: readonly SimilarityLink[], newFamilies: readonly string[]): CarryResult[] {
  const byOld = new Map(prior.map((p) => [p.family, p]));
  return [...newFamilies].sort().map((fam) => {
    let fv = 0;
    let tv = 0;
    for (const l of links) {
      if (l.newFamily !== fam) continue;
      const p = byOld.get(l.oldFamily);
      if (!p) continue;
      fv = Math.max(fv, p.value * l.similarity);
      tv = Math.max(tv, p.terminology * l.terminology);
    }
    return { family: fam, familyValue: clampK(n, fv), terminologyValue: clampK(n, tv) };
  });
}

/**
 * Seed a newcomer's book on the arrival day: families and their terminology item at the carried values,
 * every installed concept and variation at family minus the leaf's margin.
 */
export function seedNewcomer(book: KnowledgeBook, player: number, day: number, carried: readonly CarryResult[], terminologyItem: (family: string) => string | undefined): void {
  const n = book.n;
  const cat: ItemCatalogue = book.catalogue;
  const fam = new Map(carried.map((c) => [c.family, c]));
  for (const c of carried) {
    if (cat.get(c.family)) book.set(player, c.family, c.familyValue, day);
    const t = terminologyItem(c.family);
    if (t && cat.get(t)) book.set(player, t, c.terminologyValue, day);
  }
  for (const it of cat.all()) {
    if (it.level !== 'concept' && it.level !== 'variation') continue;
    const c = fam.get(cat.familyOf(it.id));
    if (!c) continue;
    book.set(player, it.id, Math.max(0, c.familyValue - num(n, 'carry.conceptBelowFamily')), day);
  }
}
