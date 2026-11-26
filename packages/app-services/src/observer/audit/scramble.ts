// Changing hidden facts and nothing else (K9.3.2 rule 1, Q1.4.1 check 2). `mutateWhere` returns a
// copy of a value in which chosen parts hold different values. Ids are never changed: they say who a
// row is about, and changing one would move the row to another owner instead of changing a hidden fact.
import type { Visibility } from '@gm/schema';
import { pickOption } from '../filter.ts';
import { isPlainObject, peel, plainClone, stricter, type Schema } from '../schema-walk.ts';

export interface MutateResult<T> {
  value: T;
  /** Concrete paths of the leaves that now hold a different value. */
  changed: string[];
  /** Chosen leaves the mutator could not change (a literal, a null, an id, a format it cannot keep). */
  skipped: string[];
}

export type MutateMode = 'all' | 'private_only';

/** Lets a caller choose the new value of a leaf. Return `undefined` to leave the leaf as it is. */
export type LeafOverride = (leaf: { path: string; type: string; value: unknown; isInt: boolean; min: number; max: number; hasFormat: boolean }) => unknown;

interface State { changed: string[]; skipped: string[]; salt: number; override?: LeafOverride | undefined; frozen: Set<string> }

/** A path as its bare steps, so `$.a{k}[0]` and zod's issue path `['a','k',0]` compare equal. */
const steps = (path: string) => path.replace(/^\$/, '').split(/[.[\](){}]+/).filter(Boolean).join('/');

function numberBounds(inner: Schema): { lo: number; hi: number; isInt: boolean } {
  const n = inner as unknown as { minValue?: number | null; maxValue?: number | null; format?: string | null };
  return {
    lo: typeof n.minValue === 'number' ? n.minValue : -Infinity,
    hi: typeof n.maxValue === 'number' ? n.maxValue : Infinity,
    isInt: /int/.test(n.format ?? ''),
  };
}

function stringChecks(inner: Schema): string[] {
  return ((inner as unknown as { _zod: { def: { checks?: { _zod: { def: { check: string } } }[] } } })._zod.def.checks ?? []).map((c) => c._zod.def.check);
}

function numberLeaf(inner: Schema, v: number, salt: number): number | undefined {
  const { lo, hi, isInt } = numberBounds(inner);
  // A change must be able to reverse the order of a list sorted by the hidden value, or a leak through
  // sort order would survive it (Q1.4.2 edge case). Bounded values are mirrored inside their range,
  // unbounded ones negated; a value bounded on one side moves by an amount that differs row to row.
  const span = Number.isFinite(hi - lo) ? hi - lo : 10;
  const jump = ((salt * 2654435761) % 97) / 97;
  const cands: number[] = [];
  if (Number.isFinite(lo) && Number.isFinite(hi)) cands.push(lo + hi - v);
  else if (!Number.isFinite(lo) && !Number.isFinite(hi)) cands.push(isInt ? -v - 1 : -v - 0.5);
  cands.push(isInt ? v + 1 + Math.round(jump * 40) : v + span * (0.0137 + jump), isInt ? v - 1 - Math.round(jump * 40) : v - span * (0.0137 + jump));
  cands.push(isInt ? v + 1 : v + span * 0.001, isInt ? v - 1 : v - span * 0.001);
  // The lower bound is taken as exclusive: `.positive()` reports 0, and losing the value 0 costs nothing here.
  for (const cand of cands) if (cand !== v && cand > lo && cand <= hi && Number.isFinite(cand)) return cand;
  return undefined;
}

function stringLeaf(inner: Schema, v: string): string | undefined {
  const checks = stringChecks(inner);
  if (checks.includes('string_format')) {
    // Seeds and hashes: keep the alphabet, change every digit.
    if (/^[0-9a-f]+$/.test(v)) return v.replace(/[0-9a-f]/g, (c) => ((parseInt(c, 16) + 7) % 16).toString(16));
    return undefined;
  }
  return `${v}~`;
}

function leaf(s: Schema, v: unknown, path: string, st: State): unknown {
  const p = peel(s);
  if (p.meta?.unit === 'id' || st.frozen.has(steps(path))) { st.skipped.push(path); return v; }
  let next: unknown;
  if (st.override) {
    const b = p.type === 'number' || p.type === 'int' ? numberBounds(p.inner) : { lo: -Infinity, hi: Infinity, isInt: false };
    next = st.override({ path, type: p.type, value: v, isInt: b.isInt, min: b.lo, max: b.hi, hasFormat: p.type === 'string' && stringChecks(p.inner).includes('string_format') });
    if (next === undefined || next === v) { st.skipped.push(path); return v; }
    st.changed.push(path);
    return next;
  }
  switch (p.type) {
    case 'number': case 'int': next = typeof v === 'number' ? numberLeaf(p.inner, v, st.salt) : undefined; break;
    case 'string': next = typeof v === 'string' ? stringLeaf(p.inner, v) : undefined; break;
    case 'boolean': next = typeof v === 'boolean' ? !v : undefined; break;
    case 'enum': {
      const e = Object.values(p.def.entries as Record<string, unknown>);
      next = e.length > 1 ? e[(e.indexOf(v) + 1) % e.length] : undefined;
      break;
    }
    case 'union': {
      const lits = (p.def.options as Schema[]).map(peel).filter((o) => o.type === 'literal').flatMap((o) => o.def.values as unknown[]);
      if (lits.length > 1 && lits.includes(v)) next = lits[(lits.indexOf(v) + 1) % lits.length];
      // A union of plain scalars (an event payload value): change it by its runtime type.
      else if (lits.length === 0) next = typeof v === 'number' ? v + 1 : typeof v === 'string' ? `${v}~` : typeof v === 'boolean' ? !v : undefined;
      else next = undefined;
      break;
    }
    case 'unknown': case 'any':
      next = typeof v === 'number' ? v + 1 : typeof v === 'string' ? `${v}~` : typeof v === 'boolean' ? !v : undefined;
      break;
    default: next = undefined;
  }
  if (next === undefined || next === v) { st.skipped.push(path); return v; }
  st.changed.push(path);
  return next;
}

/** Mutates every leaf under a node. In `private_only` mode only leaves whose class on the way down is not public. */
function tree(s: Schema, v: unknown, path: string, mode: MutateMode, inherited: Visibility | undefined, st: State): unknown {
  const p = peel(s);
  const eff = p.meta?.vis ? (inherited ? stricter(inherited, p.meta.vis) : p.meta.vis) : inherited;
  if (v === null || v === undefined) return v;
  switch (p.type) {
    case 'object':
      if (!isPlainObject(v)) return v;
      return Object.fromEntries(Object.entries(v).map(([k, x]) => {
        const child = (p.def.shape as Record<string, Schema>)[k];
        return [k, child ? tree(child, x, `${path}.${k}`, mode, eff, st) : x];
      }));
    case 'array': return Array.isArray(v) ? v.map((x, i) => tree(p.def.element as Schema, x, `${path}[${i}]`, mode, eff, st)) : v;
    case 'tuple': return Array.isArray(v) ? v.map((x, i) => { const it = (p.def.items as Schema[])[i]; return it ? tree(it, x, `${path}(${i})`, mode, eff, st) : x; }) : v;
    case 'record': return isPlainObject(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tree(p.def.valueType as Schema, x, `${path}{${k}}`, mode, eff, st)])) : v;
    case 'union':
      if (typeof v === 'object') {
        const opt = pickOption(p.def.options as Schema[], p.def.discriminator as string | undefined, v as object);
        return opt ? tree(opt, v, path, mode, eff, st) : v;
      }
    // falls through: a union of scalars is a leaf
    default:
      if (mode === 'private_only' && (eff === undefined || eff === 'public')) return v;
      return leaf(s, v, path, st);
  }
}

/**
 * Copies `value`, mutating the subtree at every node for which `choose` returns a mode. `choose` gets
 * the node's concrete path and the class written on it.
 * Paths have the filter's form: `$.a.b[0]`, `$.m{key}`, `$.t(1)`.
 */
export function mutateWhere<T>(
  schema: Schema, value: T, choose: (path: string, vis: Visibility | undefined) => MutateMode | null, salt = 1, override?: LeafOverride,
): MutateResult<T> {
  // Some values are tied to others by a rule of the shape (a person's origin and the source of his
  // trait block). If the base value is valid and a change breaks such a rule, the leaves the rule
  // names are left alone and the mutation is run again.
  const parser = schema as unknown as { safeParse(v: unknown): { success: boolean; error?: { issues: { path: PropertyKey[] }[] } } };
  const frozen = new Set<string>();
  const baseValid = parser.safeParse(value).success;
  for (let round = 0; ; round++) {
    const r = mutateOnce(schema, value, choose, salt, override, frozen);
    if (!baseValid || round >= 8) return r;
    const check = parser.safeParse(r.value);
    if (check.success) return r;
    const before = frozen.size;
    for (const issue of check.error?.issues ?? []) frozen.add(issue.path.map(String).join('/'));
    if (frozen.size === before) return r;
  }
}

function mutateOnce<T>(
  schema: Schema, value: T, choose: (path: string, vis: Visibility | undefined) => MutateMode | null, salt: number,
  override: LeafOverride | undefined, frozen: Set<string>,
): MutateResult<T> {
  const st: State = { changed: [], skipped: [], salt, override, frozen };
  const go = (s: Schema, v: unknown, path: string, inherited: Visibility | undefined): unknown => {
    const p = peel(s);
    const eff = p.meta?.vis ? (inherited ? stricter(inherited, p.meta.vis) : p.meta.vis) : inherited;
    const mode = choose(path, p.meta?.vis);
    if (mode) return tree(s, v, path, mode, inherited, st);
    if (v === null || v === undefined) return v;
    switch (p.type) {
      case 'object':
        if (!isPlainObject(v)) return v;
        return Object.fromEntries(Object.entries(v).map(([k, x]) => {
          const child = (p.def.shape as Record<string, Schema>)[k];
          return [k, child ? go(child, x, `${path}.${k}`, eff) : x];
        }));
      case 'array': return Array.isArray(v) ? v.map((x, i) => go(p.def.element as Schema, x, `${path}[${i}]`, eff)) : v;
      case 'tuple': return Array.isArray(v) ? v.map((x, i) => { const it = (p.def.items as Schema[])[i]; return it ? go(it, x, `${path}(${i})`, eff) : x; }) : v;
      case 'record': return isPlainObject(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, go(p.def.valueType as Schema, x, `${path}{${k}}`, eff)])) : v;
      case 'union': {
        if (typeof v !== 'object') return v;
        const opt = pickOption(p.def.options as Schema[], p.def.discriminator as string | undefined, v as object);
        return opt ? go(opt, v, path, eff) : v;
      }
      default: return v;
    }
  };
  const out = go(schema, plainClone(value), '$', undefined) as T;
  return { value: out, changed: st.changed, skipped: st.skipped };
}

/** Changes every truth-class value of a row (ids aside). */
export function scrambleTruth<T>(schema: Schema, value: T, salt = 1): MutateResult<T> {
  return mutateWhere(schema, value, (_path, vis) => (vis === 'truth' ? 'all' : null), salt);
}
