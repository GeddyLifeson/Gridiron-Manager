// A6.2.2 release scan: no real team, school, conference, league, event or trophy mark in shipped content.
// Reads the project's blocked-terms list (G-11, packages/football-content/data/world/blocked-terms.json).
// Rules: case-blind phrase match with word boundaries; near spellings (one edit in a word of 5+ letters); a common-word
// nickname is a hit only next to its real city or school (rule 3), within two words, in text or in one JSON object.
// All-capital abbreviations of 2-4 letters (SEC, ACC) match case-sensitively, so units like "sec" stay usable; that
// reading of "case-blind" is this package's assumption and is printed in the report.

export interface BlockedTerms {
  status?: string;
  proNicknames: string[];
  proCities: string[];
  otherLeagueNicknames: string[];
  colleges: { school: string; nickname: string }[];
  conferencesAndLeagues: string[];
  eventsAndTrophies: string[];
}

/** Fields that make up a team identity (A6.2.1): where it is and what it is called. Reference fields (region,
 *  referenceLocationId) are not part of the identity. */
export const IDENTITY_PLACE_KEYS = ['place', 'city', 'name', 'school', 'shortName', 'displayName'] as const;
export const IDENTITY_NICK_KEYS = ['nickname', 'mascot', 'teamName'] as const;

export interface MarkHit { file: string; line: number; term: string; text: string; rule: string }

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s: string) => fold(s).split(/[^a-z0-9']+/).filter(Boolean);
const isAbbrev = (s: string) => /^[A-Z0-9&]{2,4}$/.test(s);

/** Text segments that can hold one phrase: a line cut at quotes, commas, brackets, colons and other separators, so
 *  neighbouring JSON strings or list items never join into a false pair. */
export function segments(line: string): string[] {
  return line.split(/[^A-Za-z0-9\s'’.&()\-\u00C0-\u024F]+/).map((x) => x.trim()).filter(Boolean);
}

export function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Near spelling: one edit, same first letter, both words 7+ letters. Shorter words and a changed first letter match
 *  too many real places and surnames (Solon, Penn Hills, Weisman) to be useful; this threshold is an assumption. */
export const NEAR_MIN_LEN = 7;
function wordNear(a: string, b: string): boolean {
  return a === b || (a.length >= NEAR_MIN_LEN && b.length >= NEAR_MIN_LEN && a[0] === b[0] && editDistanceAtMostOne(a, b));
}

/** True when the phrase's words appear in order in `toks` starting at i, each word equal or one edit away. */
function phraseAt(toks: string[], i: number, phrase: string[]): boolean {
  if (i + phrase.length > toks.length) return false;
  for (let k = 0; k < phrase.length; k++) if (!wordNear(toks[i + k]!, phrase[k]!)) return false;
  return true;
}

interface Indexed { exact: Map<string, string[][]>; long: { w: string; list: string[][] }[] }
export interface MarkMatcher { phrases: Indexed; abbrevs: Set<string>; places: Indexed; placeList: string[][]; nicknames: string[][] }

function sameWords(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((w, i) => wordNear(w, b[i]!));
}

function index(list: string[][]): Indexed {
  const exact = new Map<string, string[][]>();
  for (const p of list) { if (!p.length) continue; const a = exact.get(p[0]!) ?? []; a.push(p); exact.set(p[0]!, a); }
  const long = [...exact.entries()].filter(([w]) => w.length >= NEAR_MIN_LEN).map(([w, l]) => ({ w, list: l }));
  return { exact, long };
}

/** Candidate phrases whose first word is this token or one edit from it. */
function candidates(ix: Indexed, tok: string): string[][] {
  const out = [...(ix.exact.get(tok) ?? [])];
  if (tok.length >= NEAR_MIN_LEN) for (const e of ix.long) if (e.w !== tok && wordNear(e.w, tok)) out.push(...e.list);
  return out;
}

export function buildMatcher(b: BlockedTerms): MarkMatcher {
  const phrases: string[][] = [];
  const abbrevs = new Set<string>();
  for (const t of [...b.conferencesAndLeagues, ...b.eventsAndTrophies]) {
    if (isAbbrev(t)) abbrevs.add(t); else phrases.push(words(t));
  }
  const places = [...b.proCities, ...b.colleges.map((c) => c.school)].map(words);
  const nicknames = [...b.proNicknames, ...b.otherLeagueNicknames, ...b.colleges.map((c) => c.nickname)].map(words);
  // A multi-word nickname ("Crimson Tide", "Red Sox") is distinctive alone.
  for (const n of nicknames) if (n.length >= 2) phrases.push(n);
  return { phrases: index(phrases), abbrevs, places: index(places), placeList: places, nicknames };
}

function scanTokens(toks: string[], m: MarkMatcher): { term: string; rule: string } | null {
  for (let i = 0; i < toks.length; i++) {
    for (const p of candidates(m.phrases, toks[i]!)) if (phraseAt(toks, i, p)) return { term: p.join(' '), rule: 'A6.2.2 rule 1-2 name or near spelling' };
    for (const pl of candidates(m.places, toks[i]!)) {
      if (!phraseAt(toks, i, pl)) continue;
      for (let gap = 0; gap <= 2; gap++) {
        const j = i + pl.length + gap;
        for (const n of m.nicknames) if (phraseAt(toks, j, n)) return { term: `${pl.join(' ')} ${n.join(' ')}`, rule: 'A6.2.2 rule 3 place plus nickname' };
      }
    }
  }
  return null;
}

/** Scans one text file. JSON objects are also scanned with all their string values joined, so a place field and a
 *  nickname field in one object count as a pair. */
export function scanMarks(file: string, text: string, m: MarkMatcher): MarkHit[] {
  const hits: MarkHit[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const a of m.abbrevs) if (new RegExp(`(^|[^A-Za-z0-9])${a.replace(/[&]/g, '\\&')}([^A-Za-z0-9]|$)`).test(line)) hits.push({ file, line: idx + 1, term: a, text: line.trim().slice(0, 160), rule: 'A6.2.2 abbreviation' });
    for (const seg of segments(line)) {
      const h = scanTokens(words(seg), m);
      if (h) hits.push({ file, line: idx + 1, term: h.term, text: seg.slice(0, 160), rule: h.rule });
    }
  });
  if (file.endsWith('.json')) {
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = undefined; }
    const visit = (v: unknown, path: string) => {
      if (Array.isArray(v)) { v.forEach((x, i) => visit(x, `${path}[${i}]`)); return; }
      if (!v || typeof v !== 'object') return;
      // Identity check (A6.2.1 rule 2): one object whose whole field values are a real place and a real nickname.
      const o = v as Record<string, unknown>;
      const vals = (keys: readonly string[]) => keys.map((k) => o[k]).filter((x): x is string => typeof x === 'string').map(words);
      const place = vals(IDENTITY_PLACE_KEYS).find((w) => m.placeList.some((p) => sameWords(w, p)));
      const nick = vals(IDENTITY_NICK_KEYS).find((w) => m.nicknames.some((n) => sameWords(w, n)));
      if (place && nick && place !== nick) hits.push({ file, line: 0, term: `${place.join(' ')} ${nick.join(' ')}`, text: path, rule: 'A6.2.2 rule 3 place plus nickname (one JSON object)' });
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) visit(x, `${path}.${k}`);
    };
    visit(data, '$');
  }
  return hits;
}
