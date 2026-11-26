// G4.2.2 word list, syllables (G4.3.1), sound-alike checks, and the string tools the parser shares.
import { param } from './params.ts';
import type { LanguageFamily, NumberSay, Part, PartType, Playbook } from './types.ts';

export interface WordEntry {
  readonly partId: string;
  readonly type: PartType;
  readonly word: string;
  /** User-corrected syllable count (G4.3.1); null uses the counter. */
  readonly syllables: number | null;
  readonly say: NumberSay;
}

/** The team's word list: part id to word. Words are unique within a part type (G4.2.2). */
export interface WordList {
  readonly family: LanguageFamily;
  readonly entries: ReadonlyMap<string, WordEntry>;
  /** Declared meaning scheme, if any (G4.2.2): parts following it cost fewer units. */
  readonly scheme?: { readonly name: string; readonly follows: (e: WordEntry) => boolean };
}

/** Default word list for a family: each part's word for that family, else its descriptive word. */
export function defaultWordList(book: Playbook, family: LanguageFamily): WordList {
  const entries = new Map<string, WordEntry>();
  for (const p of [...book.parts.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) entries.set(p.id, entryFor(p, family));
  return { family, entries };
}

export function entryFor(p: Part, family: LanguageFamily): WordEntry {
  const word = p.words[family] ?? p.words.descriptive;
  return { partId: p.id, type: p.type, word, syllables: null, say: /^\d{3,}$/.test(word) ? 'grouped' : 'digits' };
}

export function rename(list: WordList, partId: string, word: string): WordList {
  const e = list.entries.get(partId);
  if (!e) throw new Error(`no word for part ${partId}`);
  const entries = new Map(list.entries);
  entries.set(partId, { ...e, word });
  return { ...list, entries };
}

export function setSyllables(list: WordList, partId: string, syllables: number | null): WordList {
  const e = list.entries.get(partId);
  if (!e) throw new Error(`no word for part ${partId}`);
  const entries = new Map(list.entries);
  entries.set(partId, { ...e, syllables });
  return { ...list, entries };
}

export const norm = (s: string): string => s.toLowerCase().replace(/[-_/,.]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- numbers and syllables (G4.3.1)

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** Syllables of the spoken number words (dictionary, exact). */
const NUMBER_SYLLABLES: Record<string, number> = {
  zero: 2, one: 1, two: 1, three: 1, four: 1, five: 1, six: 1, seven: 2, eight: 1, nine: 1, ten: 1, eleven: 3, twelve: 1,
  thirteen: 2, fourteen: 2, fifteen: 2, sixteen: 2, seventeen: 3, eighteen: 2, nineteen: 2, twenty: 2, thirty: 2, forty: 2,
  fifty: 2, sixty: 2, seventy: 3, eighty: 2, ninety: 2, hundred: 2, oh: 1,
};

function twoDigit(n: number): string[] {
  if (n < 10) return ['oh', ONES[n]!];
  if (n < 20) return [TEENS[n - 10]!];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? [TENS[t]!, ONES[o]!] : [TENS[t]!];
}

/** Spoken words of a digit string: digit by digit ("67" six seven) or grouped ("394" three ninety four, G4.2.3). */
export function spokenNumber(digits: string, say: NumberSay): string[] {
  if (say === 'digits' || digits.length < 3) return [...digits].map((d) => ONES[Number(d)]!);
  const out: string[] = [];
  let rest = digits;
  if (rest.length % 2 === 1) { out.push(ONES[Number(rest[0])]!); rest = rest.slice(1); }
  for (let i = 0; i < rest.length; i += 2) {
    const n = Number(rest.slice(i, i + 2));
    if (n === 0) out.push('hundred'); else out.push(...twoDigit(n));
  }
  return out;
}

/** Rule-based syllable fallback for an English word (vowel groups, silent final e, consonant-le). */
export function countWordSyllables(w: string): number {
  const word = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  if (NUMBER_SYLLABLES[word] !== undefined) return NUMBER_SYLLABLES[word]!;
  if (word.length <= 3) return 1;
  const groups = word.match(/[aeiouy]+/g)?.length ?? 1;
  let n = groups;
  if (/[^aeiou]e$/.test(word) && !/[^aeiouy]le$/.test(word)) n--;
  if (/[^aeiouy]es$/.test(word) && !/(ss|sh|ch|x|z|ce|ge|se)es$/.test(word)) n--;
  if (/[^aeiouy]ed$/.test(word) && !/[td]ed$/.test(word)) n--;
  return n < 1 ? 1 : n;
}

/** Spoken tokens of a word: letters and words as written, digit runs as spoken numbers. */
export function spokenTokens(word: string, say: NumberSay): string[] {
  const out: string[] = [];
  for (const piece of norm(word).split(' ')) {
    if (!piece) continue;
    for (const m of piece.match(/\d+|[a-z]+/g) ?? []) {
      if (/^\d+$/.test(m)) out.push(...spokenNumber(m, say));
      else if (m.length === 1) out.push(`letter-${m}`);
      else out.push(m);
    }
  }
  return out;
}

/** A single letter said aloud ("Y", "F"): one syllable except W (three). */
function letterSyllables(l: string): number { return l === 'w' ? 3 : 1; }

/** Syllables of a whole word entry; a user correction wins (G4.3.1). */
export function syllablesOf(e: Pick<WordEntry, 'word' | 'syllables' | 'say'>): number {
  if (e.syllables !== null) return e.syllables;
  let n = 0;
  for (const t of spokenTokens(e.word, e.say)) n += t.startsWith('letter-') ? letterSyllables(t.slice(7)) : countWordSyllables(t);
  return n;
}

// ---------------------------------------------------------------- similarity tools

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

/** A phonetic key so "Spyder" finds "Spider" (G4.1.3 step 7): a compact Soundex-like code over the whole word. */
export function phoneticKey(w: string): string {
  const s = norm(w).replace(/[^a-z]/g, '').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/y/g, 'i');
  if (!s) return '';
  const code: Record<string, string> = { b: '1', f: '1', p: '1', v: '1', c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2', d: '3', t: '3', l: '4', m: '5', n: '5', r: '6' };
  let out = s[0]!;
  let last = code[s[0]!] ?? '';
  for (const ch of s.slice(1)) {
    const c = code[ch] ?? '';
    if (c && c !== last) out += c;
    if (!'hw'.includes(ch)) last = c;
  }
  return out;
}

function firstSyllable(word: string): string {
  const w = norm(word).replace(/[^a-z]/g, '');
  const m = w.match(/^[^aeiouy]*[aeiouy]+[^aeiouy]?/);
  return m ? m[0] : w;
}

/** G4.2.2 starting rule: same first syllable and same syllable count, or edit distance 1. */
export function soundsAlike(a: WordEntry, b: WordEntry): boolean {
  const x = norm(a.word);
  const y = norm(b.word);
  if (x === y) return true;
  if (editDistance(x, y) === 1) return true;
  return firstSyllable(x) === firstSyllable(y) && syllablesOf(a) === syllablesOf(b);
}

export interface WordProblem { readonly kind: 'duplicate' | 'confusion'; readonly a: string; readonly b: string; readonly type: PartType | 'cross' }

/**
 * Duplicates within a part type (refused) and sound-alike pairs (warned, G4.2.2). `crossTypes` adds pairs of
 * types whose words are heard in the same place (code words against line checks, G4.4.2 edge case).
 */
export function checkWords(list: WordList, crossTypes: readonly (readonly [PartType, PartType])[] = []): WordProblem[] {
  const out: WordProblem[] = [];
  const all = [...list.entries.values()].sort((a, b) => (a.partId < b.partId ? -1 : 1));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i]!;
    const b = all[j]!;
    const sameType = a.type === b.type;
    const cross = crossTypes.some(([s, t]) => (a.type === s && b.type === t) || (a.type === t && b.type === s));
    if (!sameType && !cross) continue;
    if (sameType && norm(a.word) === norm(b.word)) out.push({ kind: 'duplicate', a: a.partId, b: b.partId, type: a.type });
    else if (soundsAlike(a, b)) out.push({ kind: 'confusion', a: a.partId, b: b.partId, type: sameType ? a.type : 'cross' });
  }
  return out;
}

/** Learning units of a part's word under a declared scheme (G4.2.2: parts that follow it cost 20% fewer units). */
export function wordUnits(list: WordList, partId: string, baseUnits: number): number {
  const e = list.entries.get(partId);
  if (!e || !list.scheme) return baseUnits;
  return list.scheme.follows(e) ? baseUnits * (1 - param('words.schemeDiscount')) : baseUnits;
}
