// Helpers for whitelist tests (K9.3.1 rule 4): a value with every field of a schema filled in, and an
// independent check of which classes a filtered value still holds. The check does not share code with
// the filter, so one cannot hide the other's mistake.
import type { Visibility } from '@gm/schema';
import { isPlainObject, peel, stricter, type Schema } from '../schema-walk.ts';

/**
 * Builds a value that has every field the schema names, one element per array and one entry per
 * record. `option` picks the union option (modulo the option count). The value is for walking, not
 * for parsing: it ignores refinements and string formats.
 */
export function fullSample(schema: Schema, option = 0, depth = 0): unknown {
  const p = peel(schema);
  if (depth > 24) return null;
  switch (p.type) {
    case 'object': return Object.fromEntries(Object.entries(p.def.shape as Record<string, Schema>).map(([k, s]) => [k, fullSample(s, option, depth + 1)]));
    case 'array': return [fullSample(p.def.element as Schema, option, depth + 1)];
    case 'tuple': return (p.def.items as Schema[]).map((s) => fullSample(s, option, depth + 1));
    case 'record': return { k: fullSample(p.def.valueType as Schema, option, depth + 1) };
    case 'union': { const o = p.def.options as Schema[]; return fullSample(o[option % o.length]!, option, depth + 1); }
    case 'literal': return (p.def.values as unknown[])[0];
    case 'enum': return Object.values(p.def.entries as Record<string, unknown>)[0];
    case 'number': case 'int': return 1;
    case 'boolean': return true;
    case 'string': return 'x';
    case 'null': return null;
    default: return 'x';
  }
}

/** Largest number of options of any union in the schema, so a test can try each. */
export function maxUnionOptions(schema: Schema): number {
  let n = 1;
  const seen = new Set<object>();
  const go = (s: Schema) => {
    const p = peel(s);
    if (seen.has(p.def)) return;
    seen.add(p.def);
    if (p.type === 'object') Object.values(p.def.shape as Record<string, Schema>).forEach(go);
    else if (p.type === 'array') go(p.def.element as Schema);
    else if (p.type === 'record') go(p.def.valueType as Schema);
    else if (p.type === 'tuple') (p.def.items as Schema[]).forEach(go);
    else if (p.type === 'union') { const o = p.def.options as Schema[]; n = Math.max(n, o.length); o.forEach(go); }
  };
  go(schema);
  return n;
}

export interface HeldPath { path: string; vis: Visibility | 'unknown_key' | 'unclassified' }

/** Every path present in `value` with the most hidden class on the way to it, read off the schema. */
export function heldPaths(schema: Schema, value: unknown): HeldPath[] {
  const out: HeldPath[] = [];
  const go = (s: Schema, v: unknown, path: string, inherited: Visibility | undefined, isField: boolean) => {
    const p = peel(s);
    const own = p.meta?.vis;
    const eff = own ? (inherited ? stricter(inherited, own) : own) : inherited;
    if (isField) out.push({ path, vis: own ? eff! : 'unclassified' });
    if (v === null || v === undefined) return;
    if (p.type === 'object' && isPlainObject(v)) {
      const shape = p.def.shape as Record<string, Schema>;
      for (const [k, x] of Object.entries(v)) {
        if (!(k in shape)) out.push({ path: `${path}.${k}`, vis: 'unknown_key' });
        else go(shape[k]!, x, `${path}.${k}`, eff, true);
      }
    } else if (p.type === 'array' && Array.isArray(v)) v.forEach((x, i) => go(p.def.element as Schema, x, `${path}[${i}]`, eff, false));
    else if (p.type === 'tuple' && Array.isArray(v)) v.forEach((x, i) => { const it = (p.def.items as Schema[])[i]; if (it) go(it, x, `${path}(${i})`, eff, false); });
    else if (p.type === 'record' && isPlainObject(v)) for (const [k, x] of Object.entries(v)) go(p.def.valueType as Schema, x, `${path}{${k}}`, eff, false);
    else if (p.type === 'union' && typeof v === 'object') {
      // A discriminated union is read by its tag, with this file's own lookup. Any other union counts
      // each path with the most hidden class any option gives it.
      const disc = p.def.discriminator as string | undefined;
      if (disc && isPlainObject(v)) {
        const hit = (p.def.options as Schema[]).find((o) => {
          const tag = peel(o).type === 'object' ? (peel(o).def.shape as Record<string, Schema>)[disc] : undefined;
          return !!tag && peel(tag).type === 'literal' && (peel(tag).def.values as unknown[]).includes(v[disc]);
        });
        if (hit) { go(hit, v, path, eff, false); return; }
      }
      const before = out.length;
      const per: HeldPath[][] = [];
      for (const o of p.def.options as Schema[]) { go(o, v, path, eff, false); per.push(out.splice(before)); }
      const worst = new Map<string, HeldPath>();
      const rank = (h: HeldPath) => (h.vis === 'truth' ? 3 : h.vis === 'unclassified' ? 2 : h.vis === 'public' || h.vis === 'unknown_key' ? 0 : 1);
      for (const list of per) for (const h of list) {
        if (h.vis === 'unknown_key') continue;
        const cur = worst.get(h.path);
        if (!cur || rank(h) > rank(cur)) worst.set(h.path, h);
      }
      out.push(...worst.values());
    }
  };
  go(schema, value, '$', undefined, false);
  return out;
}
