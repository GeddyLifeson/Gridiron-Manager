// Reading zod schemas as data (P3.1.2). app-services may not import zod (P1.2.2), so this file works
// from the schema objects that @gm/schema exports and the field metadata it registers.
import { metaOf, type FieldMeta, type Visibility } from '@gm/schema';

/** A zod schema, as @gm/schema hands it out. */
export type Schema = NonNullable<Parameters<typeof metaOf>[0]>;

export interface Def { type: string; [k: string]: unknown }

export function defOf(s: Schema): Def {
  return (s as unknown as { _zod: { def: Def } })._zod.def;
}

const WRAPPERS = new Set(['optional', 'nullable', 'default', 'readonly', 'prefault', 'nonoptional', 'catch']);

export interface Peeled {
  /** The schema under optional, nullable, default and readonly wrappers. */
  inner: Schema;
  /** Field metadata found on the schema or on any wrapper layer, outermost first. */
  meta: FieldMeta | undefined;
  type: string;
  def: Def;
}

export function peel(s: Schema): Peeled {
  let cur = s;
  let meta = metaOf(cur);
  for (let i = 0; i < 16; i++) {
    const def = defOf(cur);
    if (def.type === 'lazy') cur = (def.getter as () => Schema)();
    else if (WRAPPERS.has(def.type) && def.innerType) cur = def.innerType as Schema;
    else break;
    meta ??= metaOf(cur);
  }
  const def = defOf(cur);
  return { inner: cur, meta, type: def.type, def };
}

/** Strictness order of the visibility classes (P1.1.4). A node is as hidden as its most hidden ancestor. */
const RANK: Record<Visibility, number> = { public: 0, own_team: 1, observer_estimate: 1, truth: 2 };
export function stricter(a: Visibility, b: Visibility): Visibility {
  return RANK[b] > RANK[a] ? b : a;
}

export interface SchemaNode {
  /** Path in the form `$.field.inner[]`, `{}` for record values and `()` for tuple items. */
  path: string;
  key: string | null;
  /** Class written on this node, if any. */
  vis: Visibility | undefined;
  /** Most hidden class on the way from the root to this node. Undefined when no class was met yet. */
  effective: Visibility | undefined;
  type: string;
  schema: Schema;
  inner: Schema;
  /** True for a field of an object; false for the root, array elements, record values and tuple items. */
  isField: boolean;
}

/** Visits every node of a schema tree with its effective class. Lazy cycles are cut. */
export function walkSchema(root: Schema, visit: (n: SchemaNode) => void): void {
  const stack = new Set<object>();
  const go = (s: Schema, path: string, key: string | null, isField: boolean, inherited: Visibility | undefined) => {
    const p = peel(s);
    const vis = p.meta?.vis;
    const effective = vis ? (inherited ? stricter(inherited, vis) : vis) : inherited;
    visit({ path, key, vis, effective, type: p.type, schema: s, inner: p.inner, isField });
    const id = p.def;
    if (stack.has(id)) return;
    stack.add(id);
    switch (p.type) {
      case 'object':
        for (const [k, child] of Object.entries(p.def.shape as Record<string, Schema>)) go(child, `${path}.${k}`, k, true, effective);
        break;
      case 'array': go(p.def.element as Schema, `${path}[]`, null, false, effective); break;
      case 'record': go(p.def.valueType as Schema, `${path}{}`, null, false, effective); break;
      case 'tuple': for (const item of p.def.items as Schema[]) go(item, `${path}()`, null, false, effective); break;
      case 'union': for (const o of p.def.options as Schema[]) go(o, path, key, false, effective); break;
      case 'intersection': go(p.def.left as Schema, path, key, false, effective); go(p.def.right as Schema, path, key, false, effective); break;
      case 'pipe': go(p.def.in as Schema, path, key, false, effective); break;
      default: break;
    }
    stack.delete(id);
  };
  go(root, '$', null, false, undefined);
}

/** Every path of a schema whose own class is `cls`. */
export function pathsOfClass(root: Schema, cls: Visibility): string[] {
  const out = new Set<string>();
  walkSchema(root, (n) => { if (n.vis === cls) out.add(n.path); });
  return [...out];
}

/** True when any node of the schema is class truth (P1.1.4 acceptance 1). */
export function holdsTruth(root: Schema): boolean {
  return pathsOfClass(root, 'truth').length > 0;
}

/** Follows field names, `[]`, `{}` and union option indexes (`|0`) from a schema to a nested schema. */
export function schemaAt(root: Schema, ...steps: string[]): Schema {
  let cur = root;
  for (const step of steps) {
    const p = peel(cur);
    if (step === '[]' && p.type === 'array') cur = p.def.element as Schema;
    else if (step === '{}' && p.type === 'record') cur = p.def.valueType as Schema;
    else if (step.startsWith('|') && p.type === 'union') cur = (p.def.options as Schema[])[Number(step.slice(1))]!;
    else if (p.type === 'object' && (p.def.shape as Record<string, Schema>)[step]) cur = (p.def.shape as Record<string, Schema>)[step]!;
    else throw new Error(`observer: schema has no step ${step} (${p.type})`);
  }
  return cur;
}

/** The identity of an object schema that survives `.meta()`, `.strict()` and `.refine()`: its shape object. */
export function shapeKey(s: Schema): object | null {
  const p = peel(s);
  return p.type === 'object' ? (p.def.shape as object) : null;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep copy of plain data. Throws on anything a thread message could not carry (P1.3.2). */
export function plainClone<T>(v: T, path = '$'): T {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`observer: non-finite number at ${path}`);
    return v;
  }
  if (v === undefined) return v;
  if (Array.isArray(v)) return v.map((x, i) => plainClone(x, `${path}[${i}]`)) as unknown as T;
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error(`observer: class instance at ${path}; read models are plain data (P1.3.2)`);
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) out[k] = plainClone(x, `${path}.${k}`);
    return out as T;
  }
  throw new Error(`observer: ${typeof v} at ${path}; read models are plain data (P1.3.2)`);
}

/** Canonical JSON text: object keys sorted, so equal data gives equal text. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isPlainObject(v)) {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}
