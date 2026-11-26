// Generated books (G3.1.1 depth pass): a generated pro offensive book holds 600 to 1,000 plays (tuning knobs
// inside the Verified order of magnitude). A college book draws from the same range and is then limited by the
// teaching capacity report (G3.3.1), not by a separate constant, so no level is named here. The caller passes
// a uniform draw from its J13 stream; this module draws nothing itself.
import { param } from './params.ts';
import { addPlay, withParts } from './library.ts';
import type { Part, PlayEntry, Playbook, Role } from './types.ts';

/** Target size from a uniform draw u in [0, 1). */
export function generatedBookSize(u: number): number {
  if (!(u >= 0 && u < 1)) throw new Error(`draw ${u} is not in [0, 1)`);
  const lo = param('book.generatedMin');
  const hi = param('book.generatedMax');
  return lo + Math.floor(u * (hi - lo + 1));
}

/** Parts a generator combines: formations, strengths, motions (optional), teaching parts with their section, tags. */
export interface Catalogue {
  readonly personnel: Part;
  readonly formations: readonly Part[];
  readonly strengths: readonly Part[];
  readonly motions: readonly (Part | null)[];
  readonly teaching: readonly { readonly part: Part; readonly section: string; readonly role: Role; readonly protection?: Part }[];
  readonly tags: readonly (Part | null)[];
}

/** Distinct plays the catalogue can make. */
export function catalogueSpace(c: Catalogue): number {
  return c.formations.length * c.strengths.length * c.motions.length * c.teaching.length * c.tags.length;
}

/**
 * Generate an offensive book of exactly `size` plays from the catalogue, enumerating combinations in a fixed
 * order with a stride so the book spreads across formations and concepts. Refuses a size the catalogue
 * cannot reach.
 */
export function generateBook(base: Playbook, c: Catalogue, size: number, prefix = 'gen'): Playbook {
  const space = catalogueSpace(c);
  if (size > space) throw new Error(`catalogue makes ${space} plays; ${size} asked`);
  const parts = new Map<string, Part>();
  const add = (p: Part | null | undefined) => { if (p && !base.parts.has(p.id)) parts.set(p.id, p); };
  add(c.personnel);
  for (const p of [...c.formations, ...c.strengths, ...c.motions, ...c.tags]) add(p);
  for (const t of c.teaching) { add(t.part); add(t.protection); }
  let book = withParts(base, [...parts.values()]);
  // Stride coprime with the space walks every combination once.
  let stride = 7919;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(stride, space) !== 1) stride += 2;
  for (let i = 0; i < size; i++) {
    let k = (i * stride) % space;
    const tg = c.tags[k % c.tags.length]!; k = Math.floor(k / c.tags.length);
    const te = c.teaching[k % c.teaching.length]!; k = Math.floor(k / c.teaching.length);
    const mo = c.motions[k % c.motions.length]!; k = Math.floor(k / c.motions.length);
    const st = c.strengths[k % c.strengths.length]!; k = Math.floor(k / c.strengths.length);
    const fo = c.formations[k % c.formations.length]!;
    const slots: Record<string, string> = { personnel: c.personnel.id, formation: fo.id, strength: st.id, [te.part.type]: te.part.id };
    if (mo) slots.motion = mo.id;
    if (te.protection) slots.protection = te.protection.id;
    const play: PlayEntry = {
      id: `${prefix}.${i + 1}`, book: 'offense', section: [te.section], labels: [], status: 'valid', parts: slots, tags: tg ? [tg.id] : [],
      role: te.role, units: 1, beats: [], situations: [], origin: 'generated',
    };
    book = addPlay(book, play);
  }
  return book;
}
