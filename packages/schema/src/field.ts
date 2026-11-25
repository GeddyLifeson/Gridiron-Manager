// Field descriptors (P3.1.2). Every field declares a visibility class, and every numeric field a unit
// or scale. The metadata lives in zod's global registry so lints and the read-model truth scan can
// walk any schema (P1.1.4, Q1.4.2).
import { z } from 'zod';

export type Visibility = 'public' | 'own_team' | 'observer_estimate' | 'truth';

/** Units from J1 and P3.1.2. 'count', 'id', 'index' and 'ratio' are scale names for plain numbers. */
export type Unit =
  | 'yd' | 's' | 'yd_per_s' | 'lb' | 'in' | 'ft' | 'min' | 'cents' | 'points'
  | 'count' | 'id' | 'index' | 'ratio' | 'day_index' | 'season_year' | 'version' | 'ms_epoch';

export interface FieldMeta {
  vis: Visibility;
  unit?: Unit;
  [k: string]: unknown;
}

export function field<T extends z.ZodType>(schema: T, meta: FieldMeta): T {
  return schema.meta(meta) as T;
}

export const pub = <T extends z.ZodType>(s: T, unit?: Unit) => field(s, unit ? { vis: 'public', unit } : { vis: 'public' });
export const own = <T extends z.ZodType>(s: T, unit?: Unit) => field(s, unit ? { vis: 'own_team', unit } : { vis: 'own_team' });
export const est = <T extends z.ZodType>(s: T, unit?: Unit) => field(s, unit ? { vis: 'observer_estimate', unit } : { vis: 'observer_estimate' });
export const truth = <T extends z.ZodType>(s: T, unit?: Unit) => field(s, unit ? { vis: 'truth', unit } : { vis: 'truth' });

export function metaOf(s: z.ZodType): FieldMeta | undefined {
  return z.globalRegistry.get(s) as FieldMeta | undefined;
}

/** Unwraps optional, nullable, default and readonly wrappers to the inner schema. */
export function unwrap(s: z.ZodType): z.ZodType {
  let cur: z.ZodType = s;
  for (let i = 0; i < 10; i++) {
    const def = (cur as unknown as { _zod: { def: { type: string; innerType?: z.ZodType } } })._zod.def;
    if ((def.type === 'optional' || def.type === 'nullable' || def.type === 'default' || def.type === 'readonly' || def.type === 'prefault') && def.innerType) {
      cur = def.innerType;
    } else break;
  }
  return cur;
}

export interface WalkedField {
  path: string;
  key: string;
  schema: z.ZodType;
  meta: FieldMeta | undefined;
  inner: z.ZodType;
  type: string;
}

/** Visits every object field in a schema tree, through arrays, records, unions and wrappers. */
export function walkFields(root: z.ZodType, visit: (f: WalkedField) => void, path = '$', seen = new Set<z.ZodType>()): void {
  if (seen.has(root)) return;
  seen.add(root);
  const inner = unwrap(root);
  const def = (inner as unknown as { _zod: { def: Record<string, unknown> & { type: string } } })._zod.def;
  switch (def.type) {
    case 'object': {
      const shape = def.shape as Record<string, z.ZodType>;
      for (const [key, s] of Object.entries(shape)) {
        const meta = metaOf(s) ?? metaOf(unwrap(s));
        const u = unwrap(s);
        const t = (u as unknown as { _zod: { def: { type: string } } })._zod.def.type;
        visit({ path: `${path}.${key}`, key, schema: s, meta, inner: u, type: t });
        walkFields(s, visit, `${path}.${key}`, seen);
      }
      break;
    }
    case 'array': walkFields(def.element as z.ZodType, visit, `${path}[]`, seen); break;
    case 'record': walkFields(def.valueType as z.ZodType, visit, `${path}{}`, seen); break;
    case 'union':
    case 'discriminated_union':
      for (const o of def.options as z.ZodType[]) walkFields(o, visit, path, seen);
      break;
    case 'tuple': for (const o of def.items as z.ZodType[]) walkFields(o, visit, `${path}()`, seen); break;
    case 'lazy': walkFields((def.getter as () => z.ZodType)(), visit, path, seen); break;
    default: break;
  }
}
