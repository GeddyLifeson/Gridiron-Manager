// Fixtures for G-64. Item ids and positions are test fixtures, not game content.
import type { RandomStream } from '@gm/schema';
import { DMATH, seedFromNumber, stream } from '@gm/engine-core';
import { ItemCatalogue, KnowledgeBook, knowledgeNumbers, type KnowledgeItem } from '../../src/knowledge/index.ts';

export const N = knowledgeNumbers();
export const MATH = DMATH;
export const rng = (seed: number, ...scope: (number | string)[]): RandomStream => stream(seedFromNumber(seed), 'mental', scope);

export const ITEMS: KnowledgeItem[] = [
  { id: 'fam.wide_zone', level: 'family', parent: null, difficulty: {}, defaultDifficulty: 1 },
  { id: 'term.wide_zone', level: 'terminology', parent: 'fam.wide_zone', difficulty: {}, defaultDifficulty: 1 },
  { id: 'c.wz_weak', level: 'concept', parent: 'fam.wide_zone', difficulty: { C: 3 }, defaultDifficulty: 1 },
  { id: 'v.wz_weak_jet', level: 'variation', parent: 'c.wz_weak', difficulty: {}, defaultDifficulty: 1 },
  { id: 'fam.quick', level: 'family', parent: null, difficulty: {}, defaultDifficulty: 1 },
  { id: 'c.stick', level: 'concept', parent: 'fam.quick', difficulty: { QB: 2 }, defaultDifficulty: 1 },
];

export function setup(): { cat: ItemCatalogue; book: KnowledgeBook } {
  const cat = new ItemCatalogue(N, ITEMS);
  for (const it of ITEMS) cat.install(it.id);
  return { cat, book: new KnowledgeBook(N, MATH, cat) };
}
