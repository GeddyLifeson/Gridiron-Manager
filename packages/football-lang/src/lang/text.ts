// The readable form of an assignment (J4.1.1): what the designer's rule view shows. It round-trips
// to the stored form without loss (J4.1.1 acceptance). Words are written bare when that is
// unambiguous and in JSON quotes otherwise; numbers and true/false are themselves.
import { Assignment, type Action, type Condition } from '@gm/schema';

type Value = string | number | boolean;
type Point = Assignment['behavior']['path'][number];

const BARE = /^[A-Za-z#][A-Za-z0-9_#:.+-]*$/;
function word(s: string): string { return BARE.test(s) && s !== 'true' && s !== 'false' ? s : JSON.stringify(s); }
function value(v: Value): string { return typeof v === 'string' ? word(v) : String(v); }
function args(a: Readonly<Record<string, Value>>): string { return Object.entries(a).map(([k, v]) => `${word(k)}=${value(v)}`).join(', '); }
function points(ps: readonly Point[]): string {
  if (ps.length === 0) return '-';
  return ps.map((p) => `(${p.px}, ${p.py}) ${p.kind}${p.landmark === null ? '' : ` @${word(p.landmark)}`}`).join('; ');
}
function list(xs: readonly string[]): string { return xs.length === 0 ? '-' : xs.map(word).join(', '); }

export function printCondition(c: Condition): string {
  if (c.op === 'test') return `${word(c.name)}(${args(c.args)})`;
  if (c.op === 'not') return `not[${printCondition(c.of)}]`;
  return `${c.op}[${c.of.map(printCondition).join(', ')}]`;
}
export function printAction(a: Action): string { return `${word(a.name)}(${args(a.args)})`; }

/** Writes an assignment in the readable form. */
export function printAssignment(a: Assignment): string {
  const al = a.preSnap.align;
  const lines = [
    `role: ${word(a.role)}`,
    `behavior: ${word(a.behavior.type)}(${args(a.behavior.params)})`,
    `path: ${points(a.behavior.path)}`,
    `align: (${al.px}, ${al.py}) ${a.preSnap.onLine ? 'on' : 'off'} line stance ${word(a.preSnap.stance)}${al.rule === null ? '' : ` rule ${word(al.rule)}`}`,
    `motion: ${points(a.preSnap.motion)}`,
    `keys: ${list(a.keys)}`,
    `gaze: ${word(a.gaze)}`,
    `technique: ${Object.keys(a.technique).length === 0 ? '-' : args(a.technique)}`,
    `concept: ${word(a.conceptId)} load ${a.teachingLoad}`,
    `calls: ${list(a.calls)}`,
    'rules:',
  ];
  for (const r of a.rules) {
    lines.push(`  when ${printCondition(r.when)}${r.guard === null ? '' : ` if ${printCondition(r.guard)}`} -> ${r.then.map(printAction).join('; ')}${r.text === '' ? '' : ` // ${JSON.stringify(r.text)}`}`);
  }
  return lines.join('\n');
}

type Tok = { readonly t: 'word' | 'str' | 'num' | 'sym'; readonly v: string; readonly n: number };
const SYMBOLS = ['->', '//', '(', ')', '[', ']', ',', ';', '=', '@', '-'];

function tokens(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      if (j >= src.length) throw new Error('unterminated string');
      out.push({ t: 'str', v: JSON.parse(src.slice(i, j + 1)) as string, n: 0 });
      i = j + 1;
      continue;
    }
    const numeric = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (numeric !== null && !src.startsWith('->', i)) { out.push({ t: 'num', v: numeric[0], n: Number(numeric[0]) }); i += numeric[0].length; continue; }
    const bare = /^[A-Za-z#][A-Za-z0-9_#:.+-]*/.exec(src.slice(i));
    if (bare !== null) { out.push({ t: 'word', v: bare[0], n: 0 }); i += bare[0].length; continue; }
    const sym = SYMBOLS.find((s) => src.startsWith(s, i));
    if (sym === undefined) throw new Error(`unexpected character ${ch}`);
    out.push({ t: 'sym', v: sym, n: 0 });
    i += sym.length;
  }
  return out;
}

class Reader {
  private i = 0;
  private readonly toks: Tok[];
  constructor(src: string) { this.toks = tokens(src); }
  get done(): boolean { return this.i >= this.toks.length; }
  peek(): Tok | undefined { return this.toks[this.i]; }
  isSym(v: string): boolean { const t = this.toks[this.i]; return t !== undefined && t.t === 'sym' && t.v === v; }
  isWord(v: string): boolean { const t = this.toks[this.i]; return t !== undefined && t.t === 'word' && t.v === v; }
  sym(v: string): void { if (!this.isSym(v)) throw new Error(`expected ${v}`); this.i++; }
  keyword(v: string): void { if (!this.isWord(v)) throw new Error(`expected ${v}`); this.i++; }
  next(): Tok { const t = this.toks[this.i]; if (t === undefined) throw new Error('unexpected end of line'); this.i++; return t; }
  text(): string { const t = this.next(); if (t.t !== 'word' && t.t !== 'str') throw new Error('expected a word'); return t.v; }
  num(): number { const t = this.next(); if (t.t !== 'num') throw new Error('expected a number'); return t.n; }
  value(): Value {
    const t = this.next();
    if (t.t === 'num') return t.n;
    if (t.t === 'str') return t.v;
    if (t.t !== 'word') throw new Error('expected a value');
    return t.v === 'true' ? true : t.v === 'false' ? false : t.v;
  }
  args(close: string): Record<string, Value> {
    const out: Record<string, Value> = {};
    while (!this.done && !this.isSym(close)) {
      const k = this.text();
      this.sym('=');
      out[k] = this.value();
      if (!this.done && !this.isSym(close)) this.sym(',');
    }
    return out;
  }
  dash(): boolean { if (this.isSym('-') && this.toks.length === this.i + 1) { this.i++; return true; } return false; }
  points(): Point[] {
    const out: Point[] = [];
    if (this.dash()) return out;
    while (!this.done) {
      this.sym('('); const px = this.num(); this.sym(','); const py = this.num(); this.sym(')');
      const kind = this.text();
      if (kind !== 'through' && kind !== 'cut' && kind !== 'settle') throw new Error(`unknown waypoint kind ${kind}`);
      let landmark: string | null = null;
      if (this.isSym('@')) { this.sym('@'); landmark = this.text(); }
      out.push({ px, py, kind, landmark });
      if (!this.done) this.sym(';');
    }
    return out;
  }
  list(): string[] {
    const out: string[] = [];
    if (this.dash()) return out;
    while (!this.done) { out.push(this.text()); if (!this.done) this.sym(','); }
    return out;
  }
  condition(): Condition {
    const name = this.next();
    if (name.t === 'word' && this.isSym('[')) {
      this.sym('[');
      if (name.v === 'not') { const of = this.condition(); this.sym(']'); return { op: 'not', of }; }
      if (name.v !== 'all' && name.v !== 'any') throw new Error(`unknown combinator ${name.v}`);
      const of: Condition[] = [];
      while (!this.isSym(']')) { of.push(this.condition()); if (!this.isSym(']')) this.sym(','); }
      this.sym(']');
      return { op: name.v, of };
    }
    if (name.t !== 'word' && name.t !== 'str') throw new Error('expected a condition');
    this.sym('(');
    const a = this.args(')');
    this.sym(')');
    return { op: 'test', name: name.v, args: a };
  }
  action(): Action {
    const name = this.text();
    this.sym('(');
    const a = this.args(')');
    this.sym(')');
    return { name, args: a };
  }
}

/** Reads the readable form back into the stored form. Throws with the line number on a malformed line. */
export function parseAssignment(src: string): Assignment {
  const head = new Map<string, string>(), ruleLines: { line: string; at: number }[] = [];
  let inRules = false;
  src.split('\n').forEach((raw, index) => {
    if (raw.trim() === '') return;
    if (inRules) { ruleLines.push({ line: raw.trim(), at: index + 1 }); return; }
    if (raw.trim() === 'rules:') { inRules = true; return; }
    const colon = raw.indexOf(':');
    if (colon === -1) throw new Error(`line ${index + 1}: expected "name: value"`);
    head.set(raw.slice(0, colon).trim(), raw.slice(colon + 1));
  });
  const field = <R>(name: string, read: (r: Reader) => R): R => {
    const text = head.get(name);
    if (text === undefined) throw new Error(`missing "${name}:"`);
    try {
      const r = new Reader(text), v = read(r);
      if (!r.done) throw new Error('unexpected text at the end');
      return v;
    } catch (e) { throw new Error(`${name}: ${(e as Error).message}`); }
  };
  const strings = (o: Record<string, Value>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) out[k] = String(v);
    return out;
  };
  const behavior = field('behavior', (r) => { const type = r.text(); r.sym('('); const params = r.args(')'); r.sym(')'); return { type, params }; });
  const align = field('align', (r) => {
    r.sym('('); const px = r.num(); r.sym(','); const py = r.num(); r.sym(')');
    const on = r.text();
    if (on !== 'on' && on !== 'off') throw new Error('expected on or off');
    r.keyword('line'); r.keyword('stance');
    const stance = r.text();
    let rule: string | null = null;
    if (!r.done) { r.keyword('rule'); rule = r.text(); }
    return { px, py, onLine: on === 'on', stance, rule };
  });
  const concept = field('concept', (r) => { const id = r.text(); r.keyword('load'); return { id, load: r.num() }; });
  const rules = ruleLines.map(({ line, at }) => {
    try {
      const r = new Reader(line);
      r.keyword('when');
      const when = r.condition();
      let guard: Condition | null = null;
      if (r.isWord('if')) { r.keyword('if'); guard = r.condition(); }
      r.sym('->');
      const then: Action[] = [r.action()];
      while (r.isSym(';')) { r.sym(';'); then.push(r.action()); }
      let text = '';
      if (r.isSym('//')) { r.sym('//'); const t = r.next(); if (t.t !== 'str') throw new Error('expected quoted text'); text = t.v; }
      if (!r.done) throw new Error('unexpected text at the end');
      return { when, guard, then, text };
    } catch (e) { throw new Error(`line ${at}: ${(e as Error).message}`); }
  });
  return Assignment.parse({
    role: field('role', (r) => r.text()),
    behavior: { type: behavior.type, params: behavior.params, path: field('path', (r) => r.points()) },
    preSnap: { align: { px: align.px, py: align.py, rule: align.rule }, onLine: align.onLine, stance: align.stance, motion: field('motion', (r) => r.points()) },
    rules,
    keys: field('keys', (r) => r.list()),
    gaze: field('gaze', (r) => r.text()),
    technique: field('technique', (r) => (r.dash() ? {} : strings(r.args('')))),
    conceptId: concept.id,
    teachingLoad: concept.load,
    calls: field('calls', (r) => r.list()),
  });
}
