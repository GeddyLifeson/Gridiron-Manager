import { describe, expect, it } from 'vitest';
import {
  TemplateBook, formatNumber, parseTemplate, renderEntry, selectVariant, templateCoverage, validateTemplateFile,
  LEVELS, RUNGS, type RenderContext, type TemplateEntry,
} from '../../src/templates/index.ts';

const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({ level: 'pro', rung: 9, language: 'en', terminology: 'coryell', ...over });

const hire: TemplateEntry = {
  key: 'inbox.staff_hired',
  params: { boss: { type: 'person' }, team: { type: 'team' } },
  default: '{boss} has joined {team}.',
  variants: [
    { level: 'college', text: 'The athletic director confirmed {boss} for {team}.' },
    { level: 'pro', text: 'The owner confirmed {boss} for {team}.' },
    { level: 'college', rung: 2, text: 'Word from the staff room: {boss} is in at {team}.' },
    { rung: 0, text: 'You hear {boss} got the job at {team}.' },
  ],
};

describe('variant lookup order (P4.6.1): level and rung, then level, then rung, then default', () => {
  it('picks the most specific variant', () => {
    expect(selectVariant(hire, 'college', 2).choice).toBe('level+rung');
    expect(selectVariant(hire, 'college', 5).choice).toBe('level');
    expect(selectVariant(hire, 'pro', 0).choice).toBe('level');
    const noLevel: TemplateEntry = { ...hire, variants: hire.variants!.filter((v) => v.level !== 'pro') };
    expect(selectVariant(noLevel, 'pro', 0).choice).toBe('rung');
    expect(selectVariant(noLevel, 'pro', 4).choice).toBe('default');
  });
  it('a missing variant falls back and reports a diagnostic', () => {
    const noLevel: TemplateEntry = { ...hire, variants: hire.variants!.filter((v) => v.level !== 'pro') };
    const r = renderEntry(noLevel, { boss: { id: 7, first: 'Ann', last: 'Ray' }, team: { id: 3, name: 'Harbor' } }, ctx({ rung: 4 }));
    expect(r.text).toBe('Ann Ray has joined Harbor.');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['template.variant_fallback']);
  });
});

describe('typed parameters and segments', () => {
  it('links people, teams and glossary terms', () => {
    const e: TemplateEntry = { key: 'advice.blitz', params: { coach: { type: 'person' }, t: { type: 'term' } }, default: '{coach} wants more {t}.' };
    const terms = { resolve: (id: string, sys: string) => (id === 'blitz' ? { text: sys === 'coryell' ? 'pressure' : 'blitz', glossaryId: 'A4.blitz' } : null) };
    const r = renderEntry(e, { coach: { id: 4, first: 'Lou', last: 'Kemp' }, t: { termId: 'blitz' } }, ctx({ terms }));
    expect(r.text).toBe('Lou Kemp wants more pressure.');
    expect(r.segments).toEqual([
      { kind: 'person', text: 'Lou Kemp', id: 4 },
      { kind: 'text', text: ' wants more ' },
      { kind: 'term', text: 'pressure', glossaryId: 'A4.blitz' },
      { kind: 'text', text: '.' },
    ]);
  });
  it('plural forms with # and digit grouping, no locale calls', () => {
    const e: TemplateEntry = { key: 'report.gain', params: { n: { type: 'number', unit: 'yd' } }, default: 'Gain of {n|# yard|# yards}.' };
    expect(renderEntry(e, { n: { value: 1, unit: 'yd' } }, ctx()).text).toBe('Gain of 1 yard.');
    expect(renderEntry(e, { n: { value: 12, unit: 'yd' } }, ctx()).text).toBe('Gain of 12 yards.');
    expect(formatNumber(1234567, 0, 'en')).toBe('1,234,567');
    expect(formatNumber(-1234.5, 2, 'en')).toBe('-1,234.50');
    expect(formatNumber(-0.001, 1, 'en')).toBe('0.0');
    expect(formatNumber(999, 0, 'en')).toBe('999');
  });
  it('reports missing parameters and unit mismatches', () => {
    const e: TemplateEntry = { key: 'report.gain', params: { n: { type: 'number', unit: 'yd' }, who: { type: 'person' } }, default: '{who} gained {n}.' };
    const r = renderEntry(e, { n: { value: 3, unit: 'm' } }, ctx());
    expect(r.text).toBe('[who] gained 3.');
    expect(r.diagnostics.map((d) => d.code).sort()).toEqual(['template.missing_param', 'template.unit_mismatch']);
  });
  it('the book reports an unknown key instead of throwing', () => {
    const book = new TemplateBook('en', [hire]);
    expect(book.render('nope.key', {}, ctx()).diagnostics[0]!.code).toBe('template.unknown_key');
    expect(book.keys()).toEqual(['inbox.staff_hired']);
  });
});

describe('grammar', () => {
  it('parses literals, params, plurals and escaped braces', () => {
    expect(parseTemplate('a {{b}} {c} {d|x|y}').tokens).toEqual([
      { t: 'lit', text: 'a {b} ' }, { t: 'param', name: 'c' }, { t: 'lit', text: ' ' }, { t: 'plural', name: 'd', one: 'x', other: 'y' },
    ]);
  });
  it('rejects malformed braces', () => {
    for (const s of ['{a', 'a}', '{1x}', '{a|b}', '{a|b|c|d}', '{a{b}}']) expect(parseTemplate(s).errors.length, s).toBeGreaterThan(0);
  });
});

// One deliberately broken file per rule, each producing exactly its expected error (P4.2.1 acceptance,
// applied to template files).
const good = { contentSchemaVersion: 1, language: 'en', templates: [hire] };
const withEntry = (e: Record<string, unknown>) => ({ ...good, templates: [e] });
const BROKEN: [string, unknown, string][] = [
  ['not an object', [], 'schema.type'],
  ['missing language', { contentSchemaVersion: 1, templates: [] }, 'schema.required'],
  ['unknown top field', { ...good, extra: 1 }, 'schema.unknown_field'],
  ['bad key', withEntry({ key: 'NoDots', params: {}, default: 'x' }), 'template.key_format'],
  ['duplicate key', { ...good, templates: [hire, hire] }, 'template.duplicate_key'],
  ['bad param type', withEntry({ key: 'a.b', params: { x: { type: 'colour' } }, default: '{x}' }), 'template.param_type'],
  ['number without unit', withEntry({ key: 'a.b', params: { x: { type: 'number' } }, default: '{x}' }), 'template.param_unit'],
  ['bad decimals', withEntry({ key: 'a.b', params: { x: { type: 'number', unit: 'yd', decimals: 1.5 } }, default: '{x}' }), 'template.param_decimals'],
  ['empty variant', withEntry({ key: 'a.b', params: {}, default: 'x', variants: [{ text: 'y' }] }), 'template.variant_empty'],
  ['bad level', withEntry({ key: 'a.b', params: {}, default: 'x', variants: [{ level: 'semi-pro', text: 'y' }] }), 'template.variant_level'],
  ['bad rung', withEntry({ key: 'a.b', params: {}, default: 'x', variants: [{ rung: 10, text: 'y' }] }), 'template.variant_rung'],
  ['duplicate variant', withEntry({ key: 'a.b', params: {}, default: 'x', variants: [{ rung: 1, text: 'y' }, { rung: 1, text: 'z' }] }), 'template.variant_duplicate'],
  ['empty text', withEntry({ key: 'a.b', params: {}, default: '  ' }), 'template.text_empty'],
  ['syntax', withEntry({ key: 'a.b', params: {}, default: 'oops {' }), 'template.syntax'],
  ['undeclared', withEntry({ key: 'a.b', params: {}, default: 'hi {who}' }), 'template.undeclared_param'],
  ['plural on text', withEntry({ key: 'a.b', params: { w: { type: 'text' } }, default: '{w|a|b}' }), 'template.plural_type'],
];

describe('broken template files each produce exactly their error', () => {
  it('the good file is clean', () => {
    expect(validateTemplateFile(good).problems).toEqual([]);
  });
  for (const [name, data, code] of BROKEN) {
    it(name, () => {
      const errors = validateTemplateFile(data).problems.filter((p) => p.severity === 'error');
      expect(errors.map((e) => e.code)).toEqual([code]);
    });
  }
  it('unknown fields are warnings for user packs', () => {
    const r = validateTemplateFile({ ...good, extra: 1 }, { unknownFields: 'warning' });
    expect(r.file).not.toBeNull();
    expect(r.problems.map((p) => [p.severity, p.code])).toEqual([['warning', 'schema.unknown_field']]);
  });
  it('unused parameters are warnings', () => {
    const r = validateTemplateFile(withEntry({ key: 'a.b', params: { x: { type: 'text' } }, default: 'none' }));
    expect(r.problems.map((p) => [p.severity, p.code])).toEqual([['warning', 'template.unused_param']]);
  });
});

describe('P4.6.1 acceptance: every template renders for every level and rung with no missing parameter', () => {
  it('covers all levels and rungs', () => {
    expect(LEVELS).toEqual(['college', 'pro']);
    expect(RUNGS.length).toBe(10);
    expect(templateCoverage([hire], { language: 'en', terminology: 'x' })).toEqual([]);
  });
  it('finds a rung variant that uses a parameter the others do not supply', () => {
    const bad: TemplateEntry = { ...hire, variants: [{ rung: 3, text: '{boss} and {ghost}' }] };
    const probs = templateCoverage([bad], { language: 'en', terminology: 'x' });
    expect(probs.map((p) => `${p.level}:${p.rung}:${p.code}`)).toEqual(['college:3:template.undeclared_param', 'pro:3:template.undeclared_param']);
  });
});
