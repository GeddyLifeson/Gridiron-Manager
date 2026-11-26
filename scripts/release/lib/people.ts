// R1.2.10 item 6 and A6.4.1: no real person's name and no research data in the release build.
// Real names come from the people database (/mnt/project-files/data/people, built by tools/build_people.py from
// nflverse and cfbfastR) when it is on this machine; otherwise only G-18's guard of current people is available,
// which covers fewer people, and the report says so. Names are matched with G-18's key (nameKey) and hash (guardHash),
// so the scan agrees with the generator's collision guard (D13.5.2).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { guardHash, guardSet } from '../../../packages/football-content/data/names/lib.ts';
import { segments } from './marks.ts';

export interface NameSource { kind: 'people-database' | 'current-people-guard' | 'none'; path: string; people: number; hashes: Set<string> }

export function findPeopleDir(): string | null {
  for (const p of [process.env.GM_PEOPLE_DIR ?? '', '/mnt/project-files/data/people', 'E:/mnt/project-files/data/people']) {
    if (p && existsSync(join(p, 'nfl_players.csv'))) return p;
  }
  return null;
}

/** Minimal CSV row split (quoted fields with commas). */
export function csvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function splitFull(full: string): [string, string] | null {
  const parts = full.trim().split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(w));
  if (parts.length < 2) return null;
  return [parts[0]!, parts.slice(1).join(' ')];
}

/** Every real full name in the people database, as guard hashes (first|last, and first|last-word for multi-word surnames). */
export function loadRealNames(root: string): NameSource {
  const dir = findPeopleDir();
  const hashes = new Set<string>();
  let people = 0;
  const add = (first: string, last: string) => {
    if (!first || !last) return;
    people++;
    hashes.add(guardHash(first, last));
    const lw = last.trim().split(/\s+/);
    if (lw.length > 1) hashes.add(guardHash(first, lw[lw.length - 1]!));
  };
  if (dir) {
    const tables: [string, (h: string[], r: string[]) => [string, string] | null][] = [
      ['nfl_players.csv', (h, r) => { const f = r[h.indexOf('first_name')], l = r[h.indexOf('last_name')]; const d = r[h.indexOf('display_name')]; return f && l ? [f, l] : d ? splitFull(d) : null; }],
      ['college_players.csv', (h, r) => [r[h.indexOf('first_name')] ?? '', r[h.indexOf('last_name')] ?? '']],
      ['nfl_head_coaches_career.csv', (h, r) => splitFull(r[h.indexOf('coach')] ?? '')],
      ['nfl_officials.csv', (h, r) => splitFull(r[h.indexOf('official_name')] ?? '')],
      ['nfl_draft_history.csv', (h, r) => splitFull(r[h.indexOf('pfr_player_name')] ?? '')],
    ];
    for (const [file, pick] of tables) {
      const p = join(dir, file);
      if (!existsSync(p)) continue;
      const lines = readFileSync(p, 'utf8').split(/\r?\n/);
      const head = csvRow(lines[0] ?? '');
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const n = pick(head, csvRow(lines[i]!));
        if (n) add(n[0], n[1]);
      }
    }
    return { kind: 'people-database', path: dir, people, hashes };
  }
  const guard = join(root, 'packages/football-content/data/names/real-name-guard.json');
  if (existsSync(guard)) {
    const g = JSON.parse(readFileSync(guard, 'utf8')) as { packed: string; count: number };
    return { kind: 'current-people-guard', path: 'packages/football-content/data/names/real-name-guard.json', people: g.count, hashes: guardSet(g.packed) };
  }
  return { kind: 'none', path: '', people: 0, hashes };
}

export interface NameHit { file: string; line: number; name: string }

const CAP = /^[A-Z][a-zA-Z'’.-]+$/;
/** Capitalised word pairs and triples (first last, first last last, first middle last) whose key is a real person's. */
export function scanNames(file: string, text: string, hashes: Set<string>): NameHit[] {
  const hits: NameHit[] = [];
  if (hashes.size === 0) return hits;
  text.split(/\r?\n/).forEach((line, idx) => {
    for (const seg of segments(line)) scanSegment(seg, idx + 1);
  });
  return hits;

  function scanSegment(seg: string, lineNo: number): void {
    const toks = seg.split(/[^A-Za-z'’.-]+/).map((t) => t.replace(/^[.'’-]+|[.'’-]+$/g, '')).filter(Boolean);
    for (let i = 0; i + 1 < toks.length; i++) {
      const a = toks[i]!, b = toks[i + 1]!, c = toks[i + 2];
      if (!CAP.test(a) || !CAP.test(b)) continue;
      let name: string | null = null;
      if (hashes.has(guardHash(a, b))) name = `${a} ${b}`;
      else if (c && CAP.test(c) && (hashes.has(guardHash(a, `${b} ${c}`)) || hashes.has(guardHash(a, c)))) name = `${a} ${b} ${c}`;
      if (name) { hits.push({ file, line: lineNo, name }); i++; }
    }
  }
}

// ---- A6.4.1 research data ----

export const RESEARCH_PATH = /(^|\/)(research|data\/people|nflverse|sam-local|scheme-sources|game-files)(\/|$)/i;
export const RAW_DATA_EXT = /\.(csv|tsv|parquet|zip|xlsx|xls|sqlite|db|rds|feather|arrow)$/i;
/** Tokens that only appear in per-person source records: nflverse gsis ids, ESPN and NFL headshot urls. */
export const PERSON_RECORD_TOKENS: [RegExp, string][] = [
  [/\b00-00\d{5}\b/, 'nflverse gsis id'],
  [/espncdn\.com\/i\/headshots/i, 'ESPN headshot url'],
  [/static\.www\.nfl\.com\/image/i, 'NFL headshot url'],
];

export interface ResearchHit { file: string; reason: string }

export function researchPathHits(files: readonly string[]): ResearchHit[] {
  const out: ResearchHit[] = [];
  for (const f of files) {
    if (RESEARCH_PATH.test(f)) out.push({ file: f, reason: 'path is a research path' });
    else if (RAW_DATA_EXT.test(f)) out.push({ file: f, reason: 'raw dataset file type' });
  }
  return out;
}

export function recordTokenHits(file: string, text: string): ResearchHit[] {
  const out: ResearchHit[] = [];
  for (const [re, what] of PERSON_RECORD_TOKENS) if (re.test(text)) out.push({ file, reason: what });
  return out;
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function hashDir(dir: string, out: Map<string, string>, depth = 0): void {
  if (depth > 6 || !existsSync(dir)) return;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) hashDir(p, out, depth + 1);
    else if (st.size > 0 && st.size < 200 * 1024 * 1024) out.set(sha(readFileSync(p)), p);
  }
}

/** Byte-identical copies of research files inside the shipped tree. */
export function researchCopyHits(root: string, shipped: readonly string[]): { hits: ResearchHit[]; researchFiles: number; dirs: string[] } {
  const dirs = [process.env.GM_RESEARCH_DIR ?? '', '/mnt/project-files/research', '/mnt/project-files/data/people', 'E:/mnt/project-files/research', 'E:/mnt/project-files/data/people'].filter((d) => d && existsSync(d));
  const known = new Map<string, string>();
  for (const d of dirs) hashDir(d, known);
  const hits: ResearchHit[] = [];
  for (const f of shipped) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    const h = sha(readFileSync(p));
    const src = known.get(h);
    if (src) hits.push({ file: f, reason: `byte-identical to research file ${src}` });
  }
  return { hits, researchFiles: known.size, dirs };
}
