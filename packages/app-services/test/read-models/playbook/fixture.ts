// The starter book (G-67 content) as a team's library, plus a 1,000-play book for the speed check. Usage
// and call records are made-up test numbers, not football facts.
import { playbook as pb } from '@gm/football-content';
import type { PlaybookInput } from '../../../src/read-models/playbook/index.ts';

export const TEAM = 7;
export const COORDINATOR: pb.Holder = { job: 'coordinator', side: 'offense' };
export const POSITION_COACH: pb.Holder = { job: 'position_coach', side: 'offense' };
export const validate: pb.Validator = () => ({ ok: true, failures: [] });

export function starter(): Omit<PlaybookInput, 'teamId' | 'side' | 'filter'> {
  const { book, killPartId } = pb.starterBook(String(TEAM));
  const words = pb.defaultWordList(book, 'descriptive');
  return {
    book, words, template: pb.familyTemplate('offense', 'descriptive', killPartId), holder: COORDINATOR, cutoffS: 15,
    usage: (id) => (id === [...book.plays.keys()][0] ? { called: 6, lastCalledWeek: 3, readinessEstimate: 0.8, gamesInstalled: 3 } : undefined),
    records: (id) => (id === [...book.plays.keys()][0] ? { avgResult: 5.5, sample: 6 } : undefined),
  };
}

/** 1,000 offense plays: 20 formations x 2 strengths x 25 concepts. */
export function book1000(): Omit<PlaybookInput, 'teamId' | 'side' | 'filter'> {
  const P = (id: string, type: pb.PartType, word: string, extra: Partial<pb.Part> = {}): pb.Part => ({ id, type, content: id, words: { descriptive: word }, units: 1, ...extra });
  const forms = Array.from({ length: 20 }, (_, i) => P(`f${i}`, 'formation', `Form${String.fromCharCode(65 + i)}`, { runners: 5, backs: 1 }));
  const concepts = Array.from({ length: 25 }, (_, i) => P(`c${i}`, 'concept', `Idea${String.fromCharCode(65 + i)}`));
  let book = pb.withParts(pb.emptyBook(String(TEAM)), [P('kill', 'kill', 'Kill'), P('sr', 'strength', 'Right'), P('sl', 'strength', 'Left'), P('p11', 'personnel', '11'), P('base', 'protection', 'Base', { isDefault: true }), ...forms, ...concepts]);
  for (let f = 0; f < 20; f++) for (const s of ['sr', 'sl']) for (let c = 0; c < 25; c++) {
    book = pb.addPlay(book, { id: `p.${f}.${s}.${c}`, book: 'offense', section: ['dropback'], labels: [], status: 'valid', parts: { personnel: 'p11', formation: `f${f}`, strength: s, protection: 'base', concept: `c${c}` }, tags: [], role: 'base', units: 1, beats: [], situations: [] });
  }
  return { book, words: pb.defaultWordList(book, 'concept'), template: pb.familyTemplate('offense', 'concept', 'kill'), holder: COORDINATOR, cutoffS: 15, usage: () => undefined };
}
