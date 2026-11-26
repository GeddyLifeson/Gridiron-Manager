// Builds the rule-key dictionary, both rule-set files and the rule fact rows from the authoring files
// in data/authoring (B12.1.1, B12.1.2, P4.7.1, Q6.1.1, Q6.2.1). Pure: authoring in, files out. No clock.
// The command-line wrapper is build-cli.ts. `rule-data.test.ts` checks the committed files match this output.
import type { FactRow, FactSource, RuleKeyDef, RuleSetFile } from '@gm/schema';

export type Level = 'pro' | 'college';
export const LEVELS: readonly Level[] = ['pro', 'college'];
type Scalar = number | boolean | string;

/** One source read for one value. `q` is copied from the rule book text; `absent` describes what was read when the book has no such rule. */
export interface AuthSource { cite: string; q?: string; line?: number; absent?: string }
export interface AuthSide { v: Scalar; src: AuthSource[]; note?: string }
export interface AuthKey {
  key: string; type: 'number' | 'boolean' | 'option'; unit?: string; options?: string[];
  meaning: string; ownerLeaf: string; readBy: string[];
  pro: AuthSide; college: AuthSide;
}
export interface AuthKeysFile { dateRead: string; entries: AuthKey[] }

export const FOUL_FIELD_DEFS = [
  { f: 'exists', type: 'boolean', meaning: 'the foul exists in this rule set' },
  { f: 'yards', type: 'number', unit: 'yd', meaning: 'distance penalty (0 when the penalty names no distance)' },
  { f: 'afd', type: 'boolean', meaning: 'automatic first down when the defense commits it' },
  { f: 'lod', type: 'boolean', meaning: 'loss of down when the offense commits it' },
  { f: 'spot_foul', type: 'boolean', meaning: 'the penalty statement fixes enforcement at the spot of the foul' },
  { f: 'dead_ball', type: 'boolean', meaning: 'ruled with the ball dead (the down does not start, or the penalty is administered as a dead-ball foul)' },
  { f: 'runoff_eligible', type: 'boolean', meaning: 'can bring the 10-second clock subtraction late in a half' },
  { f: 'class', type: 'option', options: ['personal', 'unsportsmanlike', 'other'], meaning: 'foul class for enforcement' },
  { f: 'dq', type: 'option', options: ['none', 'if_flagrant', 'automatic'], meaning: 'disqualification' },
] as const;
type FoulFieldName = (typeof FOUL_FIELD_DEFS)[number]['f'];

export interface AuthFoulSide {
  exists: boolean;
  /** Main source: the penalty statement (or, when the foul does not exist, what was read). */
  cite?: string; q?: string; line?: number; absent?: string;
  yards?: number; afd?: boolean; lod?: boolean; spot_foul?: boolean; dead_ball?: boolean; runoff_eligible?: boolean;
  class?: 'personal' | 'unsportsmanlike' | 'other'; dq?: 'none' | 'if_flagrant' | 'automatic';
  /** Extra sources for one field, by field name. A string names a shared source. */
  more?: Partial<Record<FoulFieldName, (AuthSource | string)[]>>;
  note?: string;
}
export interface AuthFoul { id: string; name: string; ownerLeaf: string; pro: AuthFoulSide; college: AuthFoulSide }
export interface AuthFoulsFile { dateRead: string; readBy: string[]; shared: Record<string, AuthSource>; entries: AuthFoul[] }

const BOOK: Record<Level, { citation: string; group: string; file: string; ruleset: string }> = {
  pro: { citation: 'Official Playing Rules of the National Football League, 2026', group: 'nfl-rulebook-2026', file: 'rulebook_2026.txt', ruleset: 'pro_2026' },
  college: { citation: '2026 NCAA Football Rules and Interpretations (NCAA, May 2026)', group: 'ncaa-rulebook-2026', file: 'ncaa-rulebook-2026.txt', ruleset: 'college_2026' },
};
export const bookFile = (l: Level) => BOOK[l].file;

/** Expands the foul catalogue into ordinary keys `foul.<id>.<field>` (contract decision D-06). */
export function expandFouls(file: AuthFoulsFile): AuthKey[] {
  const out: AuthKey[] = [];
  const shared = (s: AuthSource | string): AuthSource => {
    if (typeof s !== 'string') return s;
    const x = file.shared[s];
    if (!x) throw new Error(`unknown shared source ${s}`);
    return x;
  };
  for (const foul of file.entries) {
    for (const def of FOUL_FIELD_DEFS) {
      const side = (l: Level): AuthSide => {
        const s = foul[l];
        const main: AuthSource = s.q ? { cite: s.cite!, q: s.q, line: s.line } : { cite: s.cite ?? 'whole book', absent: s.absent ?? '' };
        if (!s.q && !s.absent) throw new Error(`${foul.id} ${l}: needs a quote or an absence note`);
        if (!s.exists) {
          const v: Scalar = def.f === 'exists' ? false : def.type === 'boolean' ? false : def.type === 'number' ? 0 : def.f === 'class' ? 'other' : 'none';
          return { v, src: [main], note: def.f === 'exists' ? s.note : 'Inert value: this rule book has no such foul, so the field is never read.' };
        }
        const v = def.f === 'exists' ? true : s[def.f];
        if (v === undefined) throw new Error(`${foul.id} ${l}: field ${def.f} has no value`);
        const extra = (s.more?.[def.f] ?? []).map(shared);
        return { v, src: extra.length && def.f !== 'exists' ? [...extra, main] : [main], note: s.note };
      };
      const k: AuthKey = {
        key: `foul.${foul.id}.${def.f}`, type: def.type, meaning: `${foul.name}: ${def.meaning}`,
        ownerLeaf: foul.ownerLeaf, readBy: file.readBy, pro: side('pro'), college: side('college'),
      };
      if ('unit' in def) k.unit = def.unit;
      if ('options' in def) k.options = [...def.options];
      out.push(k);
    }
  }
  return out;
}

export interface BuildInput {
  keys: AuthKey[]; dateRead: string;
  /** Current committed files. Entries the authoring does not name are kept as they are. */
  dictionary: RuleKeyDef[]; files: Record<Level, RuleSetFile>; facts: FactRow[];
}
export interface BuildOutput { dictionary: RuleKeyDef[]; files: Record<Level, RuleSetFile>; facts: FactRow[]; problems: string[] }

function factSource(l: Level, s: AuthSource, v: Scalar, dateRead: string): FactSource {
  const b = BOOK[l];
  const src: FactSource = {
    citation: b.citation,
    locator: s.q ? `${s.cite} (text copy ${b.file}${s.line ? `, line ${s.line}` : ''})` : `${s.cite}. Read for absence: ${s.absent}`,
    dateRead, howRead: 'primary text', independenceGroup: b.group, primary: true,
  };
  if (s.q) src.quote = s.q;
  src.value = v;
  return src;
}

function statusOf(): FactRow['status'] { return 'Rulebook only'; }

export function build(input: BuildInput): BuildOutput {
  const problems: string[] = [];
  const dictionary = [...input.dictionary];
  const files: Record<Level, RuleSetFile> = { pro: { ...input.files.pro, values: [...input.files.pro.values] }, college: { ...input.files.college, values: [...input.files.college.values] } };
  const facts = [...input.facts];
  const idByUse = new Map<string, string>();
  let maxId = 0;
  for (const r of facts) {
    maxId = Math.max(maxId, Number(r.id.slice(-4)));
    for (const u of r.usedBy) idByUse.set(u, r.id);
  }
  const seen = new Set<string>();
  for (const k of input.keys) {
    if (seen.has(k.key)) { problems.push(`${k.key}: authored twice`); continue; }
    seen.add(k.key);
    const def: RuleKeyDef = { key: k.key, type: k.type, meaning: k.meaning, ownerLeaf: k.ownerLeaf, readBy: k.readBy };
    if (k.unit) def.unit = k.unit;
    if (k.options) def.options = k.options;
    const di = dictionary.findIndex((d) => d.key === k.key);
    if (di >= 0) dictionary[di] = def; else dictionary.push(def);
    for (const l of LEVELS) {
      const side = k[l];
      const file = files[l];
      if (k.type === 'number' && typeof side.v !== 'number') problems.push(`${k.key} ${l}: value must be a number`);
      if (k.type === 'boolean' && typeof side.v !== 'boolean') problems.push(`${k.key} ${l}: value must be true or false`);
      if (k.type === 'option' && (typeof side.v !== 'string' || !k.options?.includes(side.v))) problems.push(`${k.key} ${l}: value ${String(side.v)} is not one of the options`);
      if (!side.src.length) problems.push(`${k.key} ${l}: no source`);
      for (const s of side.src) if (!s.q && !s.absent) problems.push(`${k.key} ${l}: a source needs a quote or an absence note`);
      const use = `${file.ruleset_id}:${k.key}`;
      let id = idByUse.get(use);
      if (!id) { maxId += 1; id = `F-rule-${String(maxId).padStart(4, '0')}`; idByUse.set(use, id); }
      const value: RuleSetFile['values'][number] = { key: k.key, value: side.v, factId: id };
      if (k.unit) value.unit = k.unit;
      const vi = file.values.findIndex((x) => x.key === k.key);
      if (vi >= 0) file.values[vi] = value; else file.values.push(value);
      const unit = k.unit && typeof side.v === 'number' ? ` ${k.unit}` : '';
      const old = facts.find((r) => r.id === id);
      const absent = side.src.every((s) => !s.q);
      const row: FactRow = {
        id, level: l, domain: 'rule',
        statement: `${k.meaning}: ${String(side.v)}${unit} (${l}, 2026 rules).`,
        value: side.v,
        validFor: '2026',
        sources: side.src.map((s) => factSource(l, s, side.v, input.dateRead)),
        status: statusOf(),
        usedBy: [use],
        notes: [side.note, absent ? 'No quote: the value records that the rule book has no such provision. The text was searched and the named rules read.' : undefined, 'Primary text read directly; no independent cross-check yet (Q6.1.2).'].filter(Boolean).join(' '),
        statusHistory: old?.statusHistory ?? [{ date: input.dateRead, status: statusOf(), reason: 'First load from the 2026 rule book text (WP-01).' }],
      };
      if (k.unit) row.unit = k.unit;
      const fi = facts.findIndex((r) => r.id === id);
      if (fi >= 0) facts[fi] = row; else facts.push(row);
    }
  }
  facts.sort((a, b) => a.id.localeCompare(b.id));
  return { dictionary, files, facts, problems };
}

/** Text normalisation shared with the quote lint (packages/tools/src/lint.ts `norm`). */
export const norm = (s: string) => s.replace(/­/g, '').replace(/\s+/g, ' ').trim();
const loose = (s: string) => norm(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');

/**
 * Finds an authored quote in a rule book text and returns the book's own wording and the line it starts on.
 * Matching ignores white space, soft hyphens and the style of quote marks and dashes. Returns undefined if not found.
 */
const flatCache = new Map<string, { flat: string; hay: string; lineAt: Int32Array }>();
function flatten(text: string) {
  const hit = flatCache.get(text);
  if (hit) return hit;
  const parts: string[] = [];
  const lineOf: number[] = [];
  const lines = text.split('\n');
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const piece = len ? ` ${t}` : t;
    parts.push(piece); lineOf.push(i + 1); len += piece.length;
  }
  const flat = parts.join('');
  const lineAt = new Int32Array(flat.length);
  let at = 0;
  for (let i = 0; i < parts.length; i++) { lineAt.fill(lineOf[i]!, at, at + parts[i]!.length); at += parts[i]!.length; }
  const out = { flat, hay: flat.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-'), lineAt };
  flatCache.set(text, out);
  return out;
}

export function locateQuote(text: string, q: string): { quote: string; line: number } | undefined {
  const { flat, hay, lineAt } = flatten(text);
  const needle = loose(q);
  const at = hay.indexOf(needle);
  if (at < 0) return undefined;
  // A quote that starts right after a line break begins with the joining space; step past it for the line number.
  const first = flat[at] === ' ' ? at + 1 : at;
  return { quote: flat.slice(at, at + needle.length).trim(), line: lineAt[first]! };
}
