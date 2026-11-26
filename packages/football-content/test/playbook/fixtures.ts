// Test books for G-67. Words are test labels only, chosen to be far apart in spelling so misspelling tests
// measure the parser, not the word list.
import * as pb from '../../src/playbook/index.ts';

export const FORMATION_WORDS = ['Doubles', 'Trips', 'Bunch', 'Empty', 'Spread', 'Twins', 'Deuce', 'Trey', 'Wing', 'Pistol'];
export const CONCEPT_WORDS = ['Mesh', 'Smash', 'Stick', 'Snag', 'Flood', 'Curl', 'Levels', 'Drive', 'Shallow', 'Dagger', 'Post', 'Wheel', 'Sail', 'Cross', 'Seam', 'Spot', 'Angle', 'Choice', 'Dino', 'Yankee', 'Scissors', 'Hank', 'Ohio', 'Pivot', 'Texas'];

/** Validator for tests: a play fails when any part's content is "illegal". */
export const validate: pb.Validator = (play, book) => {
  const bad = pb.partIdsOf(play).filter((id) => book.parts.get(id)?.content === 'illegal');
  return { ok: bad.length === 0, failures: bad.map((id) => `illegal part ${id}`) };
};

export function part(id: string, type: pb.PartType, word: string, extra: Partial<pb.Part> = {}): pb.Part {
  return { id, type, content: id, words: { descriptive: word }, units: 1, ...extra };
}

/** A 500-play book: 10 formations x 2 strengths x 25 concepts, plus a kill word and base protection. */
export function book500(): { book: pb.Playbook; words: pb.WordList; template: pb.Template } {
  const parts: pb.Part[] = [
    part('kill', 'kill', 'Kill'),
    part('sr', 'strength', 'Right'), part('sl', 'strength', 'Left'),
    part('p11', 'personnel', '11'),
    part('base', 'protection', 'Base', { isDefault: true }),
    part('tag.alert', 'tag', 'Alert'),
    ...FORMATION_WORDS.map((w, i) => part(`f${i}`, 'formation', w, { runners: 5, backs: 1 })),
    ...CONCEPT_WORDS.map((w, i) => part(`c${i}`, 'concept', w)),
  ];
  let book = pb.withParts(pb.emptyBook('T'), parts);
  for (let f = 0; f < FORMATION_WORDS.length; f++) for (const s of ['sr', 'sl']) for (let c = 0; c < CONCEPT_WORDS.length; c++) {
    book = pb.addPlay(book, play(`p.${f}.${s}.${c}`, { personnel: 'p11', formation: `f${f}`, strength: s, protection: 'base', concept: `c${c}` }, { section: ['dropback'] }));
  }
  const words = pb.defaultWordList(book, 'concept');
  return { book, words, template: pb.familyTemplate('offense', 'concept', 'kill') };
}

export function play(id: string, parts: pb.PlayEntry['parts'], extra: Partial<pb.PlayEntry> = {}): pb.PlayEntry {
  return { id, book: 'offense', section: ['dropback'], labels: [], status: 'valid', parts, tags: [], role: 'base', units: 1, beats: [], situations: [], ...extra };
}

/** Deterministic test stream (not the game's J13 streams; tests only). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
