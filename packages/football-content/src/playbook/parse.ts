// G4.1.3 call string parser: type a call the way coaches say it and get the play. The procedure follows
// the leaf's seven steps in order; an ambiguous string never auto-selects.
import { param } from './params.ts';
import { partIdsOf } from './library.ts';
import { lookupCode, type CodeTable } from './codes.ts';
import type { Template } from './grammar.ts';
import type { Call, CallSlot, PartType, PlayEntry, Playbook, Validator } from './types.ts';
import { editDistance, norm, phoneticKey, type WordList } from './words.ts';

interface WordHit { readonly partId: string; readonly type: PartType }

/** Parser index over one book side and word list. Build once per edit (G3.5.1: the index is rebuilt on edit). */
export interface ParseIndex {
  readonly book: Playbook;
  readonly words: WordList;
  readonly template: Template;
  /** Normalised word (possibly several tokens) to the parts it names. */
  readonly byWord: ReadonlyMap<string, readonly WordHit[]>;
  readonly maxWordTokens: number;
  /** Words that hold both letters and digits ("F9" as one word blocks the split, step 1). */
  readonly mixedWords: ReadonlySet<string>;
  readonly playsByPart: ReadonlyMap<string, readonly string[]>;
  readonly singleTokenWords: readonly string[];
  readonly phonetic: ReadonlyMap<string, readonly string[]>;
}

const PICTURE: readonly CallSlot[] = ['personnel', 'shift', 'formation', 'strength', 'formation_tag', 'motion'];
const TAG_SLOTS: readonly PartType[] = ['tag', 'week_tag'];

export function buildIndex(book: Playbook, words: WordList, template: Template): ParseIndex {
  const byWord = new Map<string, WordHit[]>();
  const mixed = new Set<string>();
  let maxWordTokens = 1;
  for (const e of words.entries.values()) {
    const k = norm(e.word);
    if (!k) continue;
    byWord.set(k, [...(byWord.get(k) ?? []), { partId: e.partId, type: e.type }]);
    maxWordTokens = Math.max(maxWordTokens, k.split(' ').length);
    for (const piece of k.split(' ')) if (/\d/.test(piece) && /[a-z]/.test(piece)) mixed.add(piece);
  }
  const playsByPart = new Map<string, string[]>();
  for (const p of book.plays.values()) {
    if (p.book !== template.book) continue;
    for (const id of new Set(partIdsOf(p))) playsByPart.set(id, [...(playsByPart.get(id) ?? []), p.id]);
  }
  const singleTokenWords = [...byWord.keys()].filter((k) => !k.includes(' ')).sort();
  const phonetic = new Map<string, string[]>();
  for (const w of singleTokenWords) { const key = phoneticKey(w); phonetic.set(key, [...(phonetic.get(key) ?? []), w]); }
  return { book, words, template, byWord, maxWordTokens, mixedWords: mixed, playsByPart, singleTokenWords, phonetic };
}

/** Step 1: normalise, then split letter-digit mixes only where no word holds both ("968" stays, "F9" splits). */
export function tokenize(ix: ParseIndex, input: string): string[] {
  const out: string[] = [];
  for (const t of norm(input).split(' ')) {
    if (!t) continue;
    if (/\d/.test(t) && /[a-z]/.test(t) && !ix.mixedWords.has(t)) out.push(...(t.match(/\d+|[a-z]+/g) ?? []));
    else out.push(t);
  }
  return out;
}

interface Segment { readonly text: string; readonly hits: readonly WordHit[]; readonly fuzzy: number; readonly unknown: boolean }

/** Step 7: nearest known single word by edit distance (at most the parameter) or phonetic key. */
function fuzzyWord(ix: ParseIndex, token: string): { word: string; distance: number } | null {
  const max = param('parse.maxEditDistance');
  let best: { word: string; distance: number } | null = null;
  for (const w of ix.singleTokenWords) {
    if (Math.abs(w.length - token.length) > max) continue;
    const d = editDistance(token, w);
    if (d <= max && (!best || d < best.distance || (d === best.distance && w < best.word))) best = { word: w, distance: d };
  }
  const ph = ix.phonetic.get(phoneticKey(token));
  if (ph && ph.length && (!best || best.distance > 1)) {
    const w = [...ph].sort((a, b) => editDistance(token, a) - editDistance(token, b) || (a < b ? -1 : 1))[0]!;
    const d = Math.max(1, editDistance(token, w));
    if (!best || d < best.distance) best = { word: w, distance: d };
  }
  return best;
}

/** Step 3: every segmentation by longest match first; both readings kept where a longer word also exists. */
function segmentations(ix: ParseIndex, tokens: readonly string[], cap = 32): Segment[][] {
  const memo = new Map<number, Segment[][]>();
  const go = (i: number): Segment[][] => {
    if (i === tokens.length) return [[]];
    const hit = memo.get(i);
    if (hit) return hit;
    const out: Segment[][] = [];
    for (let len = Math.min(ix.maxWordTokens, tokens.length - i); len >= 1 && out.length < cap; len--) {
      const text = tokens.slice(i, i + len).join(' ');
      const hits = ix.byWord.get(text);
      if (!hits) continue;
      for (const rest of go(i + len)) { out.push([{ text, hits, fuzzy: 0, unknown: false }, ...rest]); if (out.length >= cap) break; }
    }
    if (!out.length) {
      const tok = tokens[i]!;
      const f = fuzzyWord(ix, tok);
      const seg: Segment = f ? { text: tok, hits: ix.byWord.get(f.word)!, fuzzy: f.distance, unknown: true } : { text: tok, hits: [], fuzzy: 0, unknown: true };
      for (const rest of go(i + 1)) { out.push([seg, ...rest]); if (out.length >= cap) break; }
    }
    memo.set(i, out);
    return out;
  };
  return go(0);
}

export interface Reading { readonly slot: CallSlot | 'unknown'; readonly text: string; readonly partId: string | null }

export interface Candidate {
  readonly call: Call;
  readonly exact: boolean;
  readonly unknownTokens: number;
  readonly distance: number;
  /** The reading part by part, so the user sees why the play matched (G4.1.3). */
  readonly reading: readonly Reading[];
  readonly flags: readonly string[];
}

export interface ParseOptions {
  readonly codes?: readonly CodeTable[];
  readonly currentWeek?: number;
  readonly calledThisSeason?: (playId: string) => number;
  readonly installedTags?: ReadonlySet<string>;
  readonly validate?: Validator;
  readonly maxCandidates?: number;
}

export interface ParseResult {
  readonly candidates: readonly Candidate[];
  /** Set only for one exact parse that no other candidate ties (an ambiguous string never auto-selects). */
  readonly auto: Call | null;
  /** A short code hit (G4.1.3 step 2), with older meanings shown greyed. */
  readonly code: { readonly label: string; readonly kind: string; readonly older: readonly { readonly week: number; readonly label: string; readonly call: Call | null }[] } | null;
}

interface Half { readonly segs: readonly Segment[] }

function slotOf(type: PartType): CallSlot | null {
  return (['personnel', 'shift', 'formation', 'strength', 'formation_tag', 'motion', 'protection', 'run', 'concept', 'tag', 'snap_count', 'front', 'stunt', 'pressure', 'coverage', 'week_tag', 'unit', 'scheme'] as const).find((s) => s === type) ?? null;
}

interface Choice { readonly parts: Map<CallSlot, string>; readonly tags: string[]; readonly reading: Reading[]; readonly unknown: number; readonly distance: number; readonly ambiguous: boolean }

/** Step 4: assign each segment to a slot; a word that fits two slots yields both choices. */
function choices(ix: ParseIndex, segs: readonly Segment[], cap = 16): Choice[] {
  let acc: Choice[] = [{ parts: new Map(), tags: [], reading: [], unknown: 0, distance: 0, ambiguous: false }];
  for (const seg of segs) {
    const next: Choice[] = [];
    const options = seg.hits.filter((h) => slotOf(h.type) !== null);
    for (const c of acc) {
      if (!options.length) {
        next.push({ ...c, reading: [...c.reading, { slot: 'unknown', text: seg.text, partId: null }], unknown: c.unknown + 1 });
        continue;
      }
      for (const h of options) {
        const slot = slotOf(h.type)!;
        const unknown = c.unknown + (seg.unknown ? 1 : 0);
        const distance = c.distance + seg.fuzzy;
        if (TAG_SLOTS.includes(h.type)) {
          next.push({ ...c, tags: [...c.tags, h.partId], reading: [...c.reading, { slot, text: seg.text, partId: h.partId }], unknown, distance, ambiguous: c.ambiguous || options.length > 1 });
        } else if (c.parts.has(slot)) {
          continue;
        } else {
          const parts = new Map(c.parts);
          parts.set(slot, h.partId);
          next.push({ parts, tags: c.tags, reading: [...c.reading, { slot, text: seg.text, partId: h.partId }], unknown, distance, ambiguous: c.ambiguous || options.length > 1 });
        }
        if (next.length >= cap * 4) break;
      }
    }
    acc = next.slice(0, cap * 4);
  }
  return acc;
}

/** Match a choice to plays: every named non-tag part must be the play's; every spoken part of the play must be named (step 6 fills defaults). */
function matchPlays(ix: ParseIndex, c: Choice, inherit: PlayEntry | null): { play: PlayEntry; extraTags: string[]; missing: number }[] {
  const t = ix.template;
  const named = new Map(c.parts);
  if (inherit) for (const s of PICTURE) if (!named.has(s) && inherit.parts[s]) named.set(s, inherit.parts[s]!);
  const required = [...named.values()];
  // Candidate plays: those holding every named non-tag part (or, with none named, the first tag).
  let pool: readonly string[] | null = null;
  for (const id of required) {
    const ps = new Set(ix.playsByPart.get(id) ?? []);
    pool = pool === null ? [...ps] : pool.filter((x) => ps.has(x));
  }
  if (pool === null) pool = c.tags.length ? (ix.playsByPart.get(c.tags[0]!) ?? []) : [];
  const out: { play: PlayEntry; extraTags: string[]; missing: number }[] = [];
  for (const id of pool) {
    const p = ix.book.plays.get(id)!;
    let ok = true;
    for (const [slot, partId] of named) if (p.parts[slot] !== partId) { ok = false; break; }
    if (!ok) continue;
    let missing = 0;
    for (const slot of t.order) {
      if (slot === 'tag' || slot === 'week_tag' || slot === 'snap_count' || slot === 'kill' || t.sentBefore.includes(slot)) continue;
      const pid = p.parts[slot];
      if (!pid || named.has(slot)) continue;
      const part = ix.book.parts.get(pid);
      if (part?.isDefault && t.unspoken.includes(slot)) continue;
      missing++;
    }
    const ownTags = new Set(p.tags);
    const tagSet = new Set(c.tags);
    if ([...ownTags].some((x) => !tagSet.has(x))) missing += [...ownTags].filter((x) => !tagSet.has(x)).length;
    out.push({ play: p, extraTags: c.tags.filter((x) => !ownTags.has(x)), missing });
  }
  return out;
}

function parseHalf(ix: ParseIndex, h: Half, inherit: PlayEntry | null): { play: PlayEntry; extraTags: string[]; choice: Choice; missing: number }[] {
  const out: { play: PlayEntry; extraTags: string[]; choice: Choice; missing: number }[] = [];
  for (const c of choices(ix, h.segs)) for (const m of matchPlays(ix, c, inherit)) out.push({ ...m, choice: c });
  return out;
}

/**
 * Parse a call string (G4.1.3). Ranking: an exact parse first, then fewest unknown tokens, then smallest
 * total edit distance, then the play called most this season.
 */
export function parseCall(ix: ParseIndex, input: string, opts: ParseOptions = {}): ParseResult {
  // Step 2: short codes first.
  if (opts.codes && opts.currentWeek !== undefined) {
    const found = lookupCode(opts.codes, opts.currentWeek, input);
    if (found.hit && found.hit.call) {
      const older = found.older.map((o) => ({ week: o.week, label: o.hit.label, call: o.hit.call }));
      return { candidates: [{ call: found.hit.call, exact: true, unknownTokens: 0, distance: 0, reading: [{ slot: 'unknown', text: found.hit.label, partId: null }], flags: [`code:${found.hit.kind}`] }], auto: found.hit.call, code: { label: found.hit.label, kind: found.hit.kind, older } };
    }
  }
  const tokens = tokenize(ix, input);
  if (!tokens.length) return { candidates: [], auto: null, code: null };
  // Step 5: a kill or can word splits the string.
  const killWord = ix.template.killPartId ? norm(ix.words.entries.get(ix.template.killPartId)?.word ?? '') : '';
  const killAt = killWord && !killWord.includes(' ') ? tokens.indexOf(killWord) : -1;
  const called = opts.calledThisSeason ?? (() => 0);
  const raw: Candidate[] = [];
  const seen = new Set<string>();
  const push = (call: Call, unknown: number, distance: number, missing: number, reading: Reading[], extraFlags: string[]) => {
    const key = JSON.stringify([call.playId, [...call.tags].sort(), call.second?.playId ?? null, [...(call.second?.tags ?? [])].sort()]);
    if (seen.has(key)) return;
    seen.add(key);
    const flags = [...extraFlags];
    for (const t of [...call.tags, ...(call.second?.tags ?? [])]) if (opts.installedTags && !opts.installedTags.has(t)) flags.push(`uninstalled tag ${t}`);
    for (const id of [call.playId, call.second?.playId].filter((x): x is string => !!x)) {
      const p = ix.book.plays.get(id)!;
      flags.push(...digitRunnerFlags(ix, p));
      if (opts.validate) { const r = opts.validate(p, ix.book); if (!r.ok) flags.push(...r.failures.map((f) => `rule: ${f}`)); }
    }
    raw.push({ call, exact: unknown === 0 && missing === 0, unknownTokens: unknown, distance: distance + missing, reading, flags });
  };
  if (killAt > 0) {
    for (const s1 of segmentations(ix, tokens.slice(0, killAt))) for (const a of parseHalf(ix, { segs: s1 }, null)) {
      for (const s2 of segmentations(ix, tokens.slice(killAt + 1))) for (const b of parseHalf(ix, { segs: s2 }, a.play)) {
        const reading = [...a.choice.reading, { slot: 'kill' as CallSlot, text: killWord, partId: ix.template.killPartId }, ...b.choice.reading];
        push({ playId: a.play.id, tags: a.extraTags, second: { playId: b.play.id, tags: b.extraTags } }, a.choice.unknown + b.choice.unknown, a.choice.distance + b.choice.distance, a.missing + b.missing, reading, ['packaged']);
      }
    }
  } else {
    for (const segs of segmentations(ix, tokens)) for (const m of parseHalf(ix, { segs }, null)) {
      push({ playId: m.play.id, tags: m.extraTags }, m.choice.unknown, m.choice.distance, m.missing, m.choice.reading, []);
    }
  }
  raw.sort((a, b) => Number(b.exact) - Number(a.exact) || a.unknownTokens - b.unknownTokens || a.distance - b.distance || called(b.call.playId) - called(a.call.playId) || (a.call.playId < b.call.playId ? -1 : 1));
  const candidates = raw.slice(0, opts.maxCandidates ?? 10);
  const exact = raw.filter((c) => c.exact);
  const auto = exact.length === 1 ? exact[0]!.call : null;
  return { candidates, auto, code: null };
}

/**
 * Digit strings: a route number whose digit count is fewer than the formation's runners, with no word tag for
 * the rest, parses with the unassigned receiver flagged (real digit calls add word tags, G4.1.3).
 */
function digitRunnerFlags(ix: ParseIndex, p: PlayEntry): string[] {
  const cid = p.parts.concept;
  const fid = p.parts.formation;
  if (!cid || !fid) return [];
  const word = ix.words.entries.get(cid)?.word ?? '';
  if (!/^\d+$/.test(word)) return [];
  const runners = ix.book.parts.get(fid)?.runners;
  if (runners === undefined) return [];
  const tagged = p.tags.length;
  return word.length + tagged < runners ? [`unassigned receiver: ${runners - word.length - tagged} runner(s) have no route word`] : [];
}
