// G4.1.1 call parts and order, G4.2.1 family templates, G4.5.1 defensive template: render any play or
// packaged call to its spoken string. Every string maps back to exactly one play plus tags (parse.ts);
// a template under which two plays render alike is refused.
import { DEFENSE_SLOTS, KICKING_SLOTS, OFFENSE_SLOTS, type Book, type Call, type CallSlot, type LanguageFamily, type PlayEntry, type Playbook } from './types.ts';
import { norm, type WordList } from './words.ts';

export interface Template {
  readonly book: Book;
  readonly family: LanguageFamily;
  /** Ordered slots. For offense the snap count stays last (G4.1.1). */
  readonly order: readonly CallSlot[];
  /** Slots whose part is dropped when it is the system default (G4.1.1 unspoken parts). */
  readonly unspoken: readonly CallSlot[];
  /** Slots never said in the huddle string (personnel is sent before the call, G4.1.1 part 1). */
  readonly sentBefore: readonly CallSlot[];
  /** Part id of the kill or can word that joins a packaged call (G4.6.1). */
  readonly killPartId: string | null;
}

/** Family default templates (G4.1.1 depth pass). The order is the same; what is left unsaid differs. */
export function familyTemplate(book: Book, family: LanguageFamily, killPartId: string | null = null): Template {
  if (book === 'defense') return { book, family, order: [...DEFENSE_SLOTS], unspoken: ['personnel'], sentBefore: ['personnel'], killPartId: null };
  if (book === 'special_teams') return { book, family, order: [...KICKING_SLOTS], unspoken: [], sentBefore: [], killPartId: null };
  const unspoken: CallSlot[] = family === 'descriptive' ? [] : ['protection'];
  return { book, family, order: [...OFFENSE_SLOTS], unspoken, sentBefore: ['personnel'], killPartId };
}

/** Template checks (G4.1.1): every slot once, snap count last, kill not a free slot. */
export function checkTemplate(t: Template): string[] {
  const errs: string[] = [];
  const seen = new Set<CallSlot>();
  for (const s of t.order) { if (seen.has(s)) errs.push(`slot ${s} appears twice`); seen.add(s); }
  const want = t.book === 'offense' ? OFFENSE_SLOTS : t.book === 'defense' ? DEFENSE_SLOTS : KICKING_SLOTS;
  for (const s of want) if (!seen.has(s)) errs.push(`slot ${s} missing`);
  if (t.book === 'offense' && t.order[t.order.length - 1] !== 'snap_count') errs.push('the snap count must stay last');
  return errs;
}

/** Move one slot to a new index; snap count and kill positions are guarded by checkTemplate. */
export function moveSlot(t: Template, slot: CallSlot, to: number): Template {
  const order = t.order.filter((s) => s !== slot);
  order.splice(to, 0, slot);
  const next = { ...t, order };
  const errs = checkTemplate(next);
  if (errs.length) throw new Error(errs.join('; '));
  return next;
}

export interface Token { readonly slot: CallSlot | 'kill'; readonly partId: string; readonly word: string; readonly half: 1 | 2 }
export interface Rendered { readonly tokens: readonly Token[]; readonly text: string }

function wordOf(words: WordList, partId: string): string {
  const e = words.entries.get(partId);
  if (!e) throw new Error(`part ${partId} has no word`);
  return e.word;
}

/** Slots that set the picture (said once in a packaged call, G4.1.3 step 5). */
const PICTURE: readonly CallSlot[] = ['personnel', 'shift', 'formation', 'strength', 'formation_tag', 'motion'];

function renderHalf(book: Playbook, words: WordList, t: Template, play: PlayEntry, extraTags: readonly string[], half: 1 | 2, prior: PlayEntry | null): Token[] {
  const out: Token[] = [];
  for (const slot of t.order) {
    if (slot === 'snap_count' || slot === 'kill') continue;
    if (t.sentBefore.includes(slot)) continue;
    if (slot === 'tag' || slot === 'week_tag') {
      const tagIds = slot === 'tag' ? [...play.tags, ...extraTags.filter((x) => !play.tags.includes(x))] : (play.parts.week_tag ? [play.parts.week_tag] : []);
      for (const id of tagIds) out.push({ slot, partId: id, word: wordOf(words, id), half });
      continue;
    }
    const id = play.parts[slot];
    if (!id) continue;
    const part = book.parts.get(id);
    if (part?.isDefault && t.unspoken.includes(slot)) continue;
    if (prior && PICTURE.includes(slot) && prior.parts[slot] === id) continue;
    out.push({ slot, partId: id, word: wordOf(words, id), half });
  }
  return out;
}

/**
 * Render a call (G4.1.1). A packaged call renders as play A, the kill word, then play B with the picture
 * parts it shares with A left unsaid (G1.4.3 edge case, G4.1.3 step 5). The snap count, when given, is last.
 */
export function renderCall(book: Playbook, words: WordList, t: Template, call: Call, snapCountPartId?: string): Rendered {
  const a = book.plays.get(call.playId);
  if (!a) throw new Error(`play ${call.playId} not in the book`);
  const tokens: Token[] = renderHalf(book, words, t, a, call.tags, 1, null);
  if (call.second) {
    const b = book.plays.get(call.second.playId);
    if (!b) throw new Error(`play ${call.second.playId} not in the book`);
    if (!t.killPartId) throw new Error('template has no kill word for a packaged call');
    tokens.push({ slot: 'kill', partId: t.killPartId, word: wordOf(words, t.killPartId), half: 2 });
    tokens.push(...renderHalf(book, words, t, b, call.second.tags, 2, a));
  }
  if (snapCountPartId) tokens.push({ slot: 'snap_count', partId: snapCountPartId, word: wordOf(words, snapCountPartId), half: call.second ? 2 : 1 });
  return { tokens, text: tokens.map((x) => x.word).join(' ') };
}

export function renderPlay(book: Playbook, words: WordList, t: Template, playId: string): string {
  return renderCall(book, words, t, { playId, tags: [] }).text;
}

/** Plays of the template's side that render to the same string (G4.1.1: the builder refuses such a template). */
export function collisions(book: Playbook, words: WordList, t: Template, includeRetired = false): { readonly text: string; readonly plays: readonly string[] }[] {
  const byText = new Map<string, string[]>();
  for (const p of [...book.plays.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (p.book !== t.book || (!includeRetired && p.status === 'retired')) continue;
    const k = norm(renderPlay(book, words, t, p.id));
    byText.set(k, [...(byText.get(k) ?? []), p.id]);
  }
  return [...byText.entries()].filter(([, ids]) => ids.length > 1).map(([text, plays]) => ({ text, plays }));
}

/** Spoken words of a rendered call (each word list entry may hold several words, "Trips Right"). */
export function wordCount(r: Rendered): number {
  let n = 0;
  for (const t of r.tokens) n += norm(t.word).split(' ').filter(Boolean).length;
  return n;
}
