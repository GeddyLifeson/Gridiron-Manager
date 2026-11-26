// World contract, part 11: the state each off-screen system carries between passes (CR-G28-1).
// The live world keeps it in `LiveWorld.systemState`, a map from a system key (compliance, penalties,
// recruiting, coach market, club and person money, payroll) to that system's own plain data. A save
// holds one row per key. The state is the system's private working data, so the whole value is truth
// and never goes to the interface; read models get it through the system's own queries.
//
// Encoding: JSON has no Map or Set, so `encodeSystemState` writes a Map as {"$map": [[k, v], ...]}
// and a Set as {"$set": [...]}, entries sorted by their canonical JSON, the same order the world hash
// folds them in (world loop `worldHash`). `decodeSystemState` restores them. Anything else that JSON
// cannot carry unchanged (undefined inside an array, a function, a bigint, a non-finite number, a
// class instance, a plain object that uses a tag as a key) is refused rather than silently changed.
import { z } from 'zod';
import { truth } from '../field.ts';

export const SYSTEM_STATE_MAP_TAG = '$map';
export const SYSTEM_STATE_SET_TAG = '$set';

/** One system's carried state, encoded (`encodeSystemState`). One row per system key. */
export const SystemStateEntry = z.object({
  /** The system's `LiveWorld.systemState` key, such as `compliance` or `recruiting`. */
  system: truth(z.string().min(1)),
  /**
   * The encoded state as JSON text. Text rather than a recursive JSON schema, because the observer
   * filter and the schema walkers recurse into lazy schemas and a recursive one never ends.
   */
  state: truth(z.string().min(1)),
}).strict();
export type SystemStateEntry = z.infer<typeof SystemStateEntry>;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const canonical = (x: unknown): string => JSON.stringify(x) ?? 'undefined';
const byCanonical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function encode(v: unknown, path: string): Json {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`system state: ${path} is not a finite number`);
    return Object.is(v, -0) ? 0 : v;
  }
  if (v instanceof Map) {
    const entries = [...v].map(([k, x], i) => [encode(k, `${path}<key ${i}>`), encode(x, `${path}<${i}>`)] as [Json, Json]);
    const keyed = entries.map((e) => [canonical(e[0]), e] as const).sort((a, b) => byCanonical(a[0], b[0]));
    return { [SYSTEM_STATE_MAP_TAG]: keyed.map((e) => e[1]) };
  }
  if (v instanceof Set) {
    const items = [...v].map((x, i) => encode(x, `${path}{${i}}`));
    const keyed = items.map((x) => [canonical(x), x] as const).sort((a, b) => byCanonical(a[0], b[0]));
    return { [SYSTEM_STATE_SET_TAG]: keyed.map((e) => e[1]) };
  }
  if (Array.isArray(v)) {
    return v.map((x, i) => {
      if (x === undefined) throw new Error(`system state: ${path}[${i}] is undefined`);
      return encode(x, `${path}[${i}]`);
    });
  }
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error(`system state: ${path} is a class instance`);
    const out: { [k: string]: Json } = {};
    const keys = Object.keys(v);
    if (keys.length === 1 && (keys[0] === SYSTEM_STATE_MAP_TAG || keys[0] === SYSTEM_STATE_SET_TAG)) {
      throw new Error(`system state: ${path} is a plain object keyed ${keys[0]}, which would read back as a tag`);
    }
    for (const k of keys) {
      const x = (v as Record<string, unknown>)[k];
      if (x === undefined) continue; // an absent optional field: JSON drops it too
      out[k] = encode(x, `${path}.${k}`);
    }
    return out;
  }
  throw new Error(`system state: ${path} has type ${typeof v}, which a save cannot hold`);
}

function decode(v: Json): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === SYSTEM_STATE_MAP_TAG) {
      return new Map((v[SYSTEM_STATE_MAP_TAG] as [Json, Json][]).map(([k, x]) => [decode(k), decode(x)]));
    }
    if (keys.length === 1 && keys[0] === SYSTEM_STATE_SET_TAG) return new Set((v[SYSTEM_STATE_SET_TAG] as Json[]).map(decode));
    return Object.fromEntries(keys.map((k) => [k, decode(v[k] as Json)]));
  }
  return v;
}

/** One system's live state as a save row. Throws on anything the encoding would not restore unchanged. */
export function encodeSystemState(system: string, state: unknown): SystemStateEntry {
  return { system, state: JSON.stringify(encode(state, system)) };
}

/** A save row back to the live state: Maps and Sets restored. */
export function decodeSystemState(entry: SystemStateEntry): unknown {
  return decode(JSON.parse(entry.state) as Json);
}

/** Every system's state as save rows, sorted by system key. */
export function systemStateRows(state: ReadonlyMap<string, unknown>): SystemStateEntry[] {
  return [...state.keys()].sort(byCanonical).map((k) => encodeSystemState(k, state.get(k)));
}

/** Save rows back to a `LiveWorld.systemState` map. Refuses a key that appears twice. */
export function systemStateFromRows(rows: readonly SystemStateEntry[]): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const r of rows) {
    if (out.has(r.system)) throw new Error(`system state: key ${r.system} saved twice`);
    out.set(r.system, decodeSystemState(SystemStateEntry.parse(r)));
  }
  return out;
}
