// Base packs, delta packs and the resolved people set (U7.2.2, U7.3.1).
// A base is complete. A delta names its base by id and hash and holds rows that add, change or remove
// people by source key. Deltas apply in the order given; a delta whose base hash does not match is refused.
import { packChecksum } from './checksum.ts';
import { TABLE_BY_NAME, TABLE_ORDER } from './spec.ts';
import type { PackData, PackProblem, PackRow, PackTable } from './types.ts';

export interface ResolveResult { pack?: PackData; checksum?: string; problems: PackProblem[] }

const KEYS_OF: Record<string, string[]> = { links: ['source_key_a', 'source_key_b', 'kind'] };

function cloneTable(t: PackTable): PackTable {
  return { name: t.name, columns: [...t.columns], rows: t.rows.map((r) => ({ ...r })) };
}

function mergeColumns(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

function personKeys(name: string, row: PackRow): string[] {
  return name === 'links' ? [row['source_key_a']!, row['source_key_b']!] : [row['source_key']!];
}

/** Applies deltas to a base in order. The base and every delta must already have passed `decodePack`. */
export function resolvePacks(base: PackData, deltas: readonly PackData[]): ResolveResult {
  const problems: PackProblem[] = [];
  if (base.manifest.base) {
    problems.push({ severity: 'fail', code: 'base_is_delta', message: `${base.manifest.pack_id} is a delta pack and cannot be a base` });
    return { problems };
  }
  const baseHash = packChecksum(base);
  const tables: Record<string, PackTable> = {};
  for (const [n, t] of Object.entries(base.tables)) tables[n] = cloneTable(t);
  const touchedBy = new Map<string, string>();

  for (const d of deltas) {
    const ref = d.manifest.base;
    if (!ref) { problems.push({ severity: 'fail', code: 'not_a_delta', message: `${d.manifest.pack_id} names no base and is not a delta pack` }); return { problems }; }
    if (ref.id !== base.manifest.pack_id || ref.hash !== baseHash) {
      problems.push({ severity: 'fail', code: 'delta_base_mismatch', message: `Delta ${d.manifest.pack_id} was made for base ${ref.id} (${ref.hash.slice(0, 12)}), not for ${base.manifest.pack_id} (${baseHash.slice(0, 12)}); it is refused` });
      return { problems };
    }
    const touched = new Set<string>();
    const removed = new Set((d.tables['removed']?.rows ?? []).map((r) => r['source_key']!));
    for (const k of removed) touched.add(k);
    for (const name of TABLE_ORDER) {
      const dt = d.tables[name];
      if (!dt || name === 'removed') continue;
      const spec = TABLE_BY_NAME.get(name)!;
      const target = (tables[name] ??= { name, columns: [], rows: [] });
      target.columns = mergeColumns(target.columns, dt.columns);
      if (name === 'links') {
        const keyOf = (r: PackRow) => KEYS_OF['links']!.map((c) => r[c]).join('\u0001');
        const incoming = new Map(dt.rows.map((r) => [keyOf(r), r] as const));
        target.rows = target.rows.filter((r) => !incoming.has(keyOf(r)));
        for (const r of dt.rows) { target.rows.push({ ...r }); personKeys(name, r).forEach((k) => touched.add(k)); }
      } else {
        // A person's rows in a table are replaced as a set: the delta's rows are the new rows for that key.
        const keys = new Set(dt.rows.map((r) => r[spec.columns[0]!.name]!));
        target.rows = target.rows.filter((r) => !keys.has(r[spec.columns[0]!.name]!));
        for (const r of dt.rows) target.rows.push({ ...r });
        keys.forEach((k) => touched.add(k));
      }
    }
    for (const k of [...touched].sort()) {
      const prior = touchedBy.get(k);
      if (prior !== undefined && prior !== d.manifest.pack_id) problems.push({ severity: 'warn', code: 'delta_conflict', message: `Deltas ${prior} and ${d.manifest.pack_id} both change ${k}; the later one wins` });
      touchedBy.set(k, d.manifest.pack_id);
    }
    // Removal last, so a person removed here and re-added by a later delta comes back whole.
    if (removed.size > 0) {
      for (const [name, t] of Object.entries(tables)) t.rows = t.rows.filter((r) => !personKeys(name, r).some((k) => removed.has(k)));
    }
  }

  const people = new Set((tables['people']?.rows ?? []).map((r) => r['source_key']!));
  for (const [name, t] of Object.entries(tables)) {
    if (name === 'people') continue;
    const before = t.rows.length;
    t.rows = t.rows.filter((r) => personKeys(name, r).every((k) => people.has(k)));
    if (t.rows.length < before) problems.push({ severity: 'warn', code: 'orphan_row', table: name, message: `${before - t.rows.length} ${name} rows pointed at a person who is not in the resolved set and were dropped` });
  }
  const pack: PackData = { manifest: { ...base.manifest }, tables };
  return { pack, checksum: packChecksum(pack), problems };
}
