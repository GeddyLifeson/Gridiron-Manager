// Template file validation (P4.2.1 applied to `text/` files) and the P4.6.1 acceptance check: every
// template renders with sample parameters for every level and rung with no missing parameter.
// Plain TypeScript (core packages other than schema may not import zod directly, P1.2.2).
import { Level } from '@gm/schema';
import { parseTemplate, usedParams } from './parse.ts';
import { renderEntry } from './render.ts';
import { PARAM_TYPES, type ParamDecl, type ParamType, type ParamValue, type RenderContext, type TemplateEntry, type TemplateFile } from './types.ts';

/** Career rungs 0 to 9 (S1.1.1 job record, `rung` field "0 to 9, from E2.1.1"). */
export const RUNGS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
export const LEVELS: readonly Level[] = Level.options;

export const TEMPLATE_KEY = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const LANGUAGE = /^[a-z]{2}(-[A-Z]{2})?$/;
/** Sanity bound on displayed decimals; a formatting limit, not a football number. */
const MAX_DECIMALS = 6;

export interface TemplateProblem {
  readonly severity: 'error' | 'warning';
  /** Stable code; the broken-file corpus test matches on it. */
  readonly code: string;
  /** JSON path inside the file, for example `templates[3].variants[0].text`. */
  readonly path: string;
  readonly message: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface TemplateValidateOptions {
  /** Unknown fields are errors in the core pack and warnings in user packs (P4.2.1). */
  readonly unknownFields: 'error' | 'warning';
}

export function validateTemplateFile(data: unknown, opts: TemplateValidateOptions = { unknownFields: 'error' }): { file: TemplateFile | null; problems: TemplateProblem[] } {
  const problems: TemplateProblem[] = [];
  const err = (code: string, path: string, message: string) => problems.push({ severity: 'error', code, path, message });
  const warn = (code: string, path: string, message: string) => problems.push({ severity: 'warning', code, path, message });
  const unknown = (obj: Record<string, unknown>, allowed: readonly string[], path: string) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) problems.push({ severity: opts.unknownFields, code: 'schema.unknown_field', path: `${path}.${k}`, message: `unknown field ${k}` });
  };
  if (!isObj(data)) { err('schema.type', '$', 'a template file is an object'); return { file: null, problems }; }
  unknown(data, ['contentSchemaVersion', 'language', 'templates'], '$');
  if (!Number.isInteger(data.contentSchemaVersion) || (data.contentSchemaVersion as number) < 1) err('schema.required', '$.contentSchemaVersion', 'contentSchemaVersion must be a positive integer');
  if (typeof data.language !== 'string' || !LANGUAGE.test(data.language)) err('schema.required', '$.language', 'language must be a code such as en');
  if (!Array.isArray(data.templates)) { err('schema.required', '$.templates', 'templates must be a list'); return { file: null, problems }; }

  const seen = new Set<string>();
  data.templates.forEach((raw, i) => {
    const p = `$.templates[${i}]`;
    if (!isObj(raw)) { err('schema.type', p, 'a template entry is an object'); return; }
    unknown(raw, ['key', 'params', 'default', 'variants', 'note'], p);
    const key = raw.key;
    if (typeof key !== 'string' || !TEMPLATE_KEY.test(key)) err('template.key_format', `${p}.key`, `key must look like group.name, got ${JSON.stringify(key)}`);
    else if (seen.has(key)) err('template.duplicate_key', `${p}.key`, `key ${key} appears twice in this file`);
    else seen.add(key);

    const params: Record<string, ParamDecl> = {};
    const declaredBad = new Set<string>();
    if (raw.params !== undefined && !isObj(raw.params)) err('schema.type', `${p}.params`, 'params is an object of name to declaration');
    for (const [name, d] of Object.entries(isObj(raw.params) ? raw.params : {})) {
      const pp = `${p}.params.${name}`;
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) err('template.param_name', pp, `bad parameter name ${name}`);
      if (!isObj(d)) { err('schema.type', pp, 'a parameter declaration is an object'); declaredBad.add(name); continue; }
      unknown(d, ['type', 'unit', 'decimals'], pp);
      if (!PARAM_TYPES.includes(d.type as ParamType)) { err('template.param_type', `${pp}.type`, `type must be one of ${PARAM_TYPES.join(', ')}`); declaredBad.add(name); continue; }
      if (d.unit !== undefined && (d.type !== 'number' || typeof d.unit !== 'string' || !d.unit)) err('template.param_unit', `${pp}.unit`, 'unit is a non-empty string and only for number parameters');
      if (d.type === 'number' && d.unit === undefined) err('template.param_unit', `${pp}.unit`, 'number parameters declare a unit (P4.6.1 "number with unit")');
      if (d.decimals !== undefined && (d.type !== 'number' || !Number.isInteger(d.decimals) || (d.decimals as number) < 0 || (d.decimals as number) > MAX_DECIMALS)) err('template.param_decimals', `${pp}.decimals`, `decimals is an integer 0 to ${MAX_DECIMALS}, number parameters only`);
      params[name] = d as unknown as ParamDecl;
    }

    const texts: { path: string; text: unknown }[] = [{ path: `${p}.default`, text: raw.default }];
    if (raw.variants !== undefined && !Array.isArray(raw.variants)) err('schema.type', `${p}.variants`, 'variants is a list');
    const combos = new Set<string>();
    (Array.isArray(raw.variants) ? raw.variants : []).forEach((v, j) => {
      const vp = `${p}.variants[${j}]`;
      if (!isObj(v)) { err('schema.type', vp, 'a variant is an object'); return; }
      unknown(v, ['level', 'rung', 'text'], vp);
      if (v.level === undefined && v.rung === undefined) err('template.variant_empty', vp, 'a variant names a level, a rung or both');
      if (v.level !== undefined && !LEVELS.includes(v.level as Level)) err('template.variant_level', `${vp}.level`, `level must be one of ${LEVELS.join(', ')}`);
      if (v.rung !== undefined && !RUNGS.includes(v.rung as number)) err('template.variant_rung', `${vp}.rung`, `rung must be an integer ${RUNGS[0]} to ${RUNGS[RUNGS.length - 1]}`);
      const combo = `${String(v.level)}|${String(v.rung)}`;
      if (combos.has(combo)) err('template.variant_duplicate', vp, `two variants for level ${String(v.level)} rung ${String(v.rung)}`);
      combos.add(combo);
      texts.push({ path: `${vp}.text`, text: v.text });
    });

    const used = new Set<string>();
    for (const { path, text } of texts) {
      if (typeof text !== 'string' || !text.trim()) { err('template.text_empty', path, 'text is a non-empty string'); continue; }
      const parsed = parseTemplate(text);
      for (const e of parsed.errors) err('template.syntax', path, e);
      for (const [name, u] of usedParams(parsed.tokens)) {
        used.add(name);
        const d = params[name];
        if (declaredBad.has(name)) continue;
        if (!d) err('template.undeclared_param', path, `{${name}} is not declared in params`);
        else if (u.plural && d.type !== 'number') err('template.plural_type', path, `{${name}|..} needs a number parameter, ${name} is ${d.type}`);
      }
    }
    for (const name of [...Object.keys(params), ...declaredBad]) if (!used.has(name)) warn('template.unused_param', `${p}.params.${name}`, `${name} is declared but no text uses it`);
  });

  const ok = !problems.some((x) => x.severity === 'error');
  return { file: ok ? (data as unknown as TemplateFile) : null, problems };
}

/** Sample values per parameter type, for the coverage render. */
export function sampleValue(decl: ParamDecl): ParamValue {
  switch (decl.type) {
    case 'person': return { id: 1, first: 'Sample', last: 'Person' };
    case 'team': return { id: 1, name: 'Sample Team' };
    case 'number': return { value: 2, unit: decl.unit ?? 'count' };
    case 'date': return { seasonYear: 2026, dayIndex: 0 };
    case 'term': return { termId: 'sample_term' };
    case 'text': return 'sample';
  }
}

export interface CoverageProblem { readonly key: string; readonly level: string; readonly rung: number; readonly code: string; readonly message: string }

/**
 * P4.6.1 acceptance: renders every template for every level and rung with sample parameters and
 * returns every missing or undeclared parameter and syntax error found. Unknown glossary terms are
 * not counted here (the glossary package checks its own links, G-93).
 */
export function templateCoverage(entries: readonly TemplateEntry[], ctxBase: Omit<RenderContext, 'level' | 'rung'>): CoverageProblem[] {
  const out: CoverageProblem[] = [];
  const bad = new Set(['template.missing_param', 'template.undeclared_param', 'template.syntax', 'template.bad_param', 'template.plural_type', 'template.unit_mismatch']);
  for (const e of entries) {
    const params: Record<string, ParamValue> = {};
    for (const [n, d] of Object.entries(e.params)) params[n] = sampleValue(d);
    for (const level of LEVELS) for (const rung of RUNGS) {
      const r = renderEntry(e, params, { ...ctxBase, level, rung });
      for (const d of r.diagnostics) if (bad.has(d.code)) out.push({ key: e.key, level, rung, code: d.code, message: d.message });
    }
  }
  return out;
}
