// Rendering (P4.6.1). Lookup order: level and rung, then level, then rung, then default. Pure: no
// locale calls, no clock. Numbers are formatted by fixed rules per language so every platform prints
// the same text.
import { parseTemplate, type Token } from './parse.ts';
import type {
  DateValue, Diagnostic, NumberValue, ParamDecl, ParamValue, PersonValue, RenderContext, Rendered, Segment,
  TeamValue, TemplateEntry, TemplateVariant, TermValue,
} from './types.ts';

export type VariantChoice = 'level+rung' | 'level' | 'rung' | 'default';

/** Picks the text for a context, most specific first (P4.6.1 lookup order). */
export function selectVariant(entry: TemplateEntry, level: string, rung: number): { text: string; choice: VariantChoice } {
  const vs: readonly TemplateVariant[] = entry.variants ?? [];
  const both = vs.find((v) => v.level === level && v.rung === rung);
  if (both) return { text: both.text, choice: 'level+rung' };
  const lv = vs.find((v) => v.level === level && v.rung === undefined);
  if (lv) return { text: lv.text, choice: 'level' };
  const rv = vs.find((v) => v.rung === rung && v.level === undefined);
  if (rv) return { text: rv.text, choice: 'rung' };
  return { text: entry.default, choice: 'default' };
}

type PluralForm = 'one' | 'other';
/** Plural rules by language. v1 ships English (P4.6.1); the table is where later languages go. */
export const PLURAL_RULES: Readonly<Record<string, (n: number) => PluralForm>> = {
  en: (n) => (n === 1 ? 'one' : 'other'),
};

/** Digit grouping by language, without platform locale data (P1.1.1). */
const GROUPING: Readonly<Record<string, { group: string; decimal: string }>> = {
  en: { group: ',', decimal: '.' },
};

export function formatNumber(n: number, decimals: number, language: string): string {
  const g = GROUPING[language] ?? GROUPING.en!;
  const fixed = Math.abs(n).toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  let grouped = '';
  const w = whole!;
  for (let i = 0; i < w.length; i++) {
    if (i > 0 && (w.length - i) % 3 === 0) grouped += g.group;
    grouped += w[i];
  }
  const negative = n < 0 && Number(fixed) !== 0;
  return (negative ? '-' : '') + grouped + (frac ? g.decimal + frac : '');
}

function defaultDate(d: DateValue): string {
  return `season ${d.seasonYear}, day ${d.dayIndex}`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Checks a supplied value against its declaration; returns a problem or null. */
export function checkValue(decl: ParamDecl, v: ParamValue | undefined): string | null {
  if (v === undefined) return 'missing';
  switch (decl.type) {
    case 'text': return typeof v === 'string' ? null : 'expected text';
    case 'person': return isObj(v) && typeof v.id === 'number' && typeof v.first === 'string' && typeof v.last === 'string' ? null : 'expected a person {id, first, last}';
    case 'team': return isObj(v) && typeof v.id === 'number' && typeof v.name === 'string' ? null : 'expected a team {id, name}';
    case 'number':
      if (!(isObj(v) && typeof v.value === 'number' && Number.isFinite(v.value) && typeof v.unit === 'string')) return 'expected a number {value, unit}';
      return decl.unit !== undefined && v.unit !== decl.unit ? `unit ${String(v.unit)} given, ${decl.unit} declared` : null;
    case 'date': return isObj(v) && typeof v.seasonYear === 'number' && typeof v.dayIndex === 'number' ? null : 'expected a date {seasonYear, dayIndex}';
    case 'term': return isObj(v) && typeof v.termId === 'string' ? null : 'expected a term {termId}';
  }
}

export function renderEntry(entry: TemplateEntry, params: Readonly<Record<string, ParamValue>>, ctx: RenderContext): Rendered & { variant: VariantChoice } {
  const diagnostics: Diagnostic[] = [];
  const diag = (code: string, message: string) => diagnostics.push({ code, key: entry.key, message });
  const { text, choice } = selectVariant(entry, ctx.level, ctx.rung);
  if (choice === 'default' && (entry.variants?.length ?? 0) > 0) diag('template.variant_fallback', `no variant for level ${ctx.level} rung ${ctx.rung}; default used`);
  const parsed = parseTemplate(text);
  for (const e of parsed.errors) diag('template.syntax', e);
  const segments: Segment[] = [];
  const push = (s: Segment) => {
    const last = segments[segments.length - 1];
    if (s.kind === 'text' && last?.kind === 'text') segments[segments.length - 1] = { kind: 'text', text: last.text + s.text };
    else if (s.kind !== 'text' || s.text) segments.push(s);
  };
  const plural = PLURAL_RULES[ctx.language];
  if (!plural) diag('template.plural_language', `no plural rule for language ${ctx.language}; English rule used`);

  for (const tk of parsed.tokens as Token[]) {
    if (tk.t === 'lit') { push({ kind: 'text', text: tk.text }); continue; }
    const decl = entry.params[tk.name];
    if (!decl) { diag('template.undeclared_param', `{${tk.name}} is not declared`); push({ kind: 'text', text: `[${tk.name}]` }); continue; }
    const v = params[tk.name];
    const problem = checkValue(decl, v);
    if (problem === 'missing' || (problem && decl.type !== 'number')) {
      diag(problem === 'missing' ? 'template.missing_param' : 'template.bad_param', `${tk.name}: ${problem}`);
      push({ kind: 'text', text: `[${tk.name}]` });
      continue;
    }
    if (problem) {
      // A number with a wrong unit still has a value; render it and report.
      if (!isObj(v) || typeof v.value !== 'number') { diag('template.bad_param', `${tk.name}: ${problem}`); push({ kind: 'text', text: `[${tk.name}]` }); continue; }
      diag('template.unit_mismatch', `${tk.name}: ${problem}`);
    }
    if (tk.t === 'plural') {
      if (decl.type !== 'number') { diag('template.plural_type', `${tk.name} is ${decl.type}; plural forms need a number`); push({ kind: 'text', text: `[${tk.name}]` }); continue; }
      const nv = v as NumberValue;
      const form = (plural ?? PLURAL_RULES.en!)(nv.value) === 'one' ? tk.one : tk.other;
      push({ kind: 'text', text: form.split('#').join(formatNumber(nv.value, decl.decimals ?? 0, ctx.language)) });
      continue;
    }
    switch (decl.type) {
      case 'text': push({ kind: 'text', text: v as string }); break;
      case 'number': { const nv = v as NumberValue; push({ kind: 'text', text: formatNumber(nv.value, decl.decimals ?? 0, ctx.language) }); break; }
      case 'person': { const p = v as PersonValue; push({ kind: 'person', text: `${p.first} ${p.last}`, id: p.id }); break; }
      case 'team': { const t = v as TeamValue; push({ kind: 'team', text: t.name, id: t.id }); break; }
      case 'date': push({ kind: 'text', text: (ctx.formatDate ?? defaultDate)(v as DateValue) }); break;
      case 'term': {
        const id = (v as TermValue).termId;
        const hit = ctx.terms?.resolve(id, ctx.terminology) ?? null;
        if (!hit) diag('template.unknown_term', `term ${id} not in the glossary for system ${ctx.terminology}`);
        push({ kind: 'term', text: hit?.text ?? id, glossaryId: hit?.glossaryId ?? null });
        break;
      }
    }
  }
  return { text: segments.map((s) => s.text).join(''), segments, diagnostics, variant: choice };
}

/** A set of templates for one language, merged from packs in load order (later wins, P4.1.1). */
export class TemplateBook {
  private readonly byKey = new Map<string, TemplateEntry>();
  constructor(readonly language: string, entries: Iterable<TemplateEntry> = []) {
    for (const e of entries) this.byKey.set(e.key, e);
  }
  has(key: string): boolean { return this.byKey.has(key); }
  get(key: string): TemplateEntry | undefined { return this.byKey.get(key); }
  keys(): string[] { return [...this.byKey.keys()].sort(); }
  render(key: string, params: Readonly<Record<string, ParamValue>>, ctx: RenderContext): Rendered {
    const e = this.byKey.get(key);
    if (!e) return { text: `[${key}]`, segments: [{ kind: 'text', text: `[${key}]` }], diagnostics: [{ code: 'template.unknown_key', key, message: `no template ${key}` }] };
    return renderEntry(e, params, ctx);
  }
}
