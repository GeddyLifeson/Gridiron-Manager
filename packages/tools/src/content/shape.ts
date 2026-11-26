// A small declarative checker for content file shapes. The dependency lint allows zod only in
// @gm/schema, and content shapes belong there in the end (P3.4.1 "Outputs: schemas in schema"); until
// the integrator moves them, these few shapes are checked here with the same problem codes the loader
// reports for zod schemas (schema.required, schema.invalid_type, schema.invalid_format,
// schema.too_small, schema.too_big, schema.invalid_value, schema.unknown_field).

export interface ShapeProblem { readonly severity: 'error' | 'warning'; readonly code: string; readonly path: string; readonly message: string }

export interface Shape {
  readonly optional?: boolean;
  readonly nullable?: boolean;
  check(v: unknown, path: string, out: ShapeProblem[], unknownFields: 'error' | 'warning'): void;
}

const typeName = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const bad = (out: ShapeProblem[], code: string, path: string, message: string) => out.push({ severity: 'error', code, path, message });

export const str = (o: { re?: RegExp; min?: number } = {}): Shape => ({
  check(v, path, out) {
    if (typeof v !== 'string') return bad(out, 'schema.invalid_type', path, `expected string, received ${typeName(v)}`);
    if (o.min !== undefined && v.length < o.min) return bad(out, 'schema.too_small', path, `at least ${o.min} characters`);
    if (o.re && !o.re.test(v)) bad(out, 'schema.invalid_format', path, `does not match ${o.re.source}`);
  },
});

export const int = (o: { min?: number } = {}): Shape => ({
  check(v, path, out) {
    if (typeof v !== 'number' || !Number.isInteger(v)) return bad(out, 'schema.invalid_type', path, `expected integer, received ${typeName(v)}`);
    if (o.min !== undefined && v < o.min) bad(out, 'schema.too_small', path, `at least ${o.min}`);
  },
});

export const bool = (): Shape => ({ check(v, path, out) { if (typeof v !== 'boolean') bad(out, 'schema.invalid_type', path, `expected boolean, received ${typeName(v)}`); } });

export const oneOf = (values: readonly string[]): Shape => ({
  check(v, path, out) { if (typeof v !== 'string' || !values.includes(v)) bad(out, 'schema.invalid_value', path, `expected one of ${values.join(', ')}`); },
});

export const arr = (of: Shape, o: { min?: number } = {}): Shape => ({
  check(v, path, out, uf) {
    if (!Array.isArray(v)) return bad(out, 'schema.invalid_type', path, `expected array, received ${typeName(v)}`);
    if (o.min !== undefined && v.length < o.min) bad(out, 'schema.too_small', path, `at least ${o.min} entries`);
    v.forEach((x, i) => of.check(x, `${path}[${i}]`, out, uf));
  },
});

export const record = (of: Shape): Shape => ({
  check(v, path, out, uf) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return bad(out, 'schema.invalid_type', path, `expected object, received ${typeName(v)}`);
    for (const [k, x] of Object.entries(v)) of.check(x, `${path}.${k}`, out, uf);
  },
});

export const anyOf = (...shapes: Shape[]): Shape => ({
  check(v, path, out, uf) {
    for (const s of shapes) { const tmp: ShapeProblem[] = []; s.check(v, path, tmp, uf); if (!tmp.some((p) => p.severity === 'error')) return; }
    bad(out, 'schema.invalid_union', path, 'matches none of the allowed forms');
  },
});

export const opt = (s: Shape): Shape => ({ ...s, optional: true, check: s.check });
export const nul = (s: Shape): Shape => ({ ...s, nullable: true, check: s.check });

/** An object. `strict` objects report unknown fields (errors in core, warnings in user packs, P4.2.1). */
export const obj = (fields: Readonly<Record<string, Shape>>, o: { strict?: boolean } = { strict: true }): Shape => ({
  check(v, path, out, uf) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return bad(out, 'schema.invalid_type', path, `expected object, received ${typeName(v)}`);
    const rec = v as Record<string, unknown>;
    for (const [k, s] of Object.entries(fields)) {
      const x = rec[k];
      if (x === undefined) { if (!s.optional) bad(out, 'schema.required', `${path}.${k}`, `${k} is required`); continue; }
      if (x === null && s.nullable) continue;
      s.check(x, `${path}.${k}`, out, uf);
    }
    if (o.strict !== false) for (const k of Object.keys(rec)) if (!(k in fields)) out.push({ severity: uf, code: 'schema.unknown_field', path: `${path}.${k}`, message: `unknown field ${k}` });
  },
});

export function checkShape(shape: Shape, v: unknown, unknownFields: 'error' | 'warning', base = '$'): ShapeProblem[] {
  const out: ShapeProblem[] = [];
  shape.check(v, base, out, unknownFields);
  return out;
}
