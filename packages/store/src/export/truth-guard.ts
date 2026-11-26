// Exports never contain `truth` fields (P5.7.2 edge case, K9.1). Every export format goes through
// prepareExport, which walks the value together with its schema and drops each field whose
// visibility class is `truth`. The developer and coaching-school build target (K9.1 rule 5) may keep
// them; the file is then marked and is never a certified export.
import { metaOf, unwrap } from '@gm/schema';

/** A zod schema, named through the schema package (the store does not import zod itself). */
type Schema = Parameters<typeof metaOf>[0];

export type ExportTarget = 'player' | 'developer';

export interface PreparedExport<T> {
  readonly data: T;
  /** Paths of truth fields that were present: removed for `player`, kept and marked for `developer`. */
  readonly truthPaths: readonly string[];
  /** True when the file holds truth fields and must carry the developer mark. */
  readonly developerMarked: boolean;
  /** A file that holds truth fields can never be a certified export (P5.7.2). */
  readonly certifiable: boolean;
}

type Def = { type: string; shape?: Record<string, Schema>; element?: Schema; valueType?: Schema; options?: Schema[]; items?: Schema[]; getter?: () => Schema; in?: Schema; out?: Schema };
const defOf = (s: Schema) => (s as unknown as { _zod: { def: Def } })._zod.def;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function walk(schema: Schema, value: unknown, path: string, strip: boolean, found: string[]): unknown {
  if (value === null || value === undefined) return value;
  const inner = unwrap(schema);
  const def = defOf(inner);
  switch (def.type) {
    case 'object': {
      if (!isRecord(value)) return value;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        const fs = def.shape?.[k];
        if (!fs) { out[k] = v; continue; } // unknown keys: the schema's own strictness decides elsewhere
        const vis = (metaOf(fs) ?? metaOf(unwrap(fs)))?.vis;
        if (vis === 'truth') { found.push(`${path}.${k}`); if (!strip) out[k] = v; continue; }
        out[k] = walk(fs, v, `${path}.${k}`, strip, found);
      }
      return out;
    }
    case 'array':
      return Array.isArray(value) && def.element ? value.map((v, i) => walk(def.element!, v, `${path}[${i}]`, strip, found)) : value;
    case 'tuple':
      return Array.isArray(value) && def.items ? value.map((v, i) => (def.items![i] ? walk(def.items![i]!, v, `${path}[${i}]`, strip, found) : v)) : value;
    case 'record': {
      if (!isRecord(value) || !def.valueType) return value;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = walk(def.valueType, v, `${path}{${k}}`, strip, found);
      return out;
    }
    case 'union':
    case 'discriminated_union': {
      // Walk with the first option the value satisfies; if none does, walk every object option so a
      // truth field of any branch is still caught.
      const opts = def.options ?? [];
      const fit = opts.find((o) => o.safeParse(value).success);
      if (fit) return walk(fit, value, path, strip, found);
      let v: unknown = value;
      for (const o of opts) v = walk(o, v, path, strip, found);
      return v;
    }
    case 'lazy': return def.getter ? walk(def.getter(), value, path, strip, found) : value;
    case 'pipe': return def.in ? walk(def.in, value, path, strip, found) : value;
    default: return value;
  }
}

/** Prepares a value for any export file. `player` (the default) removes truth fields. */
export function prepareExport<T>(schema: Schema, value: T, target: ExportTarget = 'player'): PreparedExport<T> {
  const found: string[] = [];
  const data = walk(schema, value, '$', target === 'player', found) as T;
  const unique = [...new Set(found)];
  const developerMarked = target === 'developer' && unique.length > 0;
  return { data, truthPaths: unique, developerMarked, certifiable: !developerMarked };
}
