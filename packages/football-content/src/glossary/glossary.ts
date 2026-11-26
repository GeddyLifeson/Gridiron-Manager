// Lookup and linking (A4.1.1, A4.1.2, N5.2.1). Pure: no clock, file, locale or randomness (P1.1.1).
import { BLOCK_LIST, TERMS } from './data.ts';
import type { NotShipped, PlayLevel, Segment, TermRecord } from './types.ts';

const fold = (s: string): string => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const levelsOf = (r: TermRecord): readonly PlayLevel[] => (r.level === 'both' ? ['pro', 'college'] : [r.level]);
const OTHER_LEVEL: Record<PlayLevel, PlayLevel> = { pro: 'college', college: 'pro' };
const isWordChar = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9]/.test(c);

export interface Glossary {
  readonly terms: readonly TermRecord[];
  byId(id: string): TermRecord | null;
  /** The record for `phrase` at `level`: an exact term wins over an alias; a level-specific record wins over a 'both' one; an ambiguous alias gives null. */
  lookup(phrase: string, level: PlayLevel): TermRecord | null;
  /** The same phrase's record at the other level, when its meaning differs there (edge case of A4.1.1). */
  otherLevel(id: string, level: PlayLevel): TermRecord | null;
  /** Split `text` into plain text and term links at the level in play (N5.2.1 rule 1). */
  link(text: string, level: PlayLevel): Segment[];
  /** Terms in `text` that the A4.5.11 block list forbids. */
  blocked(text: string): NotShipped[];
  /** Aliases that name more than one record at a level (they link to none; the exact term links). */
  ambiguousAliases(): { level: PlayLevel; alias: string; ids: string[] }[];
}

type Hit = { rec: TermRecord; matched: 'term' | 'alias' };

export function createGlossary(terms: readonly TermRecord[] = TERMS, blockList: readonly NotShipped[] = BLOCK_LIST): Glossary {
  const byId = new Map(terms.map((t) => [t.id, t]));
  // level -> folded phrase -> candidate hits
  const index: Record<PlayLevel, Map<string, Hit[]>> = { pro: new Map(), college: new Map() };
  for (const r of terms) {
    for (const lv of levelsOf(r)) {
      const put = (p: string, matched: 'term' | 'alias') => {
        const k = fold(p);
        if (!k) return;
        const l = index[lv].get(k) ?? [];
        if (!l.some((h) => h.rec.id === r.id)) l.push({ rec: r, matched });
        index[lv].set(k, l);
      };
      put(r.term, 'term');
      for (const a of r.aliases) put(a, 'alias');
    }
  }
  const pick = (hits: Hit[] | undefined): Hit | null => {
    if (!hits || hits.length === 0) return null;
    const exact = hits.filter((h) => h.matched === 'term');
    const pool = exact.length > 0 ? exact : hits;
    const specific = pool.filter((h) => h.rec.level !== 'both');
    const final = specific.length > 0 ? specific : pool;
    if (final.length === 1) return final[0]!;
    // Several exact terms at one level (a known overlap): the record whose id is shortest is the plain one.
    if (exact.length > 0) return [...final].sort((a, b) => a.rec.id.length - b.rec.id.length || (a.rec.id < b.rec.id ? -1 : 1))[0]!;
    return null; // ambiguous alias
  };
  const maxWords = Math.max(1, ...[...index.pro.keys(), ...index.college.keys()].map((k) => k.split(' ').length));
  const blockSet = blockList.map((b) => ({ b, key: fold(b.term) }));

  function scan(text: string, level: PlayLevel, want: (hit: Hit | null, phrase: string) => boolean): { start: number; end: number; hit: Hit }[] {
    const out: { start: number; end: number; hit: Hit }[] = [];
    // Word tokens with their positions.
    const toks: { s: number; e: number }[] = [];
    const re = /[A-Za-z0-9][A-Za-z0-9'’\-\/]*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) toks.push({ s: m.index, e: m.index + m[0].length });
    let i = 0;
    while (i < toks.length) {
      let found = false;
      for (let n = Math.min(maxWords + 2, toks.length - i); n >= 1 && !found; n--) {
        const s = toks[i]!.s, e = toks[i + n - 1]!.e;
        const raw = text.slice(s, e);
        const key = fold(raw);
        const hit = pick(index[level].get(key));
        if (hit && want(hit, key) && !isWordChar(text[s - 1]) && !isWordChar(text[e])) {
          out.push({ start: s, end: e, hit });
          i += n;
          found = true;
        }
      }
      if (!found) i++;
    }
    return out;
  }

  return {
    terms,
    byId: (id) => byId.get(id) ?? null,
    lookup: (phrase, level) => pick(index[level].get(fold(phrase)))?.rec ?? null,
    otherLevel(id, level) {
      const r = byId.get(id);
      if (!r) return null;
      const other = OTHER_LEVEL[level];
      const k = fold(r.term);
      const cand = (index[other].get(k) ?? []).filter((h) => h.rec.id !== id && h.matched === 'term');
      return (cand.find((h) => h.rec.level === other) ?? cand[0])?.rec ?? null;
    },
    link(text, level) {
      const hits = scan(text, level, () => true);
      const segs: Segment[] = [];
      let at = 0;
      for (const h of hits) {
        if (h.start > at) segs.push({ kind: 'text', text: text.slice(at, h.start) });
        segs.push({ kind: 'term', text: text.slice(h.start, h.end), id: h.hit.rec.id, matched: h.hit.matched });
        at = h.end;
      }
      if (at < text.length) segs.push({ kind: 'text', text: text.slice(at) });
      return segs;
    },
    blocked(text) {
      const f = ` ${fold(text).replace(/[^a-z0-9'\- \/]/g, ' ').replace(/\s+/g, ' ')} `;
      return blockSet.filter(({ key }) => key && f.includes(` ${key} `)).map(({ b }) => b);
    },
    ambiguousAliases() {
      const out: { level: PlayLevel; alias: string; ids: string[] }[] = [];
      for (const lv of ['pro', 'college'] as const)
        for (const [k, hits] of index[lv]) {
          if (hits.length < 2 || hits.some((h) => h.matched === 'term')) continue;
          const specific = hits.filter((h) => h.rec.level !== 'both');
          if ((specific.length || hits.length) > 1) out.push({ level: lv, alias: k, ids: hits.map((h) => h.rec.id).sort() });
        }
      return out.sort((a, b) => (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : a.level < b.level ? -1 : 1));
    },
  };
}

/** The shared glossary built from the shipped data. */
export const glossary: Glossary = createGlossary();
