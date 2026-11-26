// The live world-state tables and their digest (P5.3.1: "the live tables are always current to the
// last command, so normal loading reads tables and needs no replay").
//
// The world is one plain object. The store knows nothing about football, so the layout is mechanical:
//   each top-level field is a table;
//   a top-level array holds one row per element, keyed by the element's `id` when every element is a
//     record with a unique id, and by position otherwise;
//   a top-level record holds one row per key;
//   any other top-level value is a single row.
// A command that changes one person rewrites one row, not the world.
//
// The tracker remembers, per row, the value last written and two hashes: one of the disk text and one
// of the canonical text. From the canonical hashes it derives a digest of the whole state that costs
// almost nothing per command, so every log row can carry the digest of the state after it (see
// ../log). The digest is a function of the state's value only: it does not depend on how rows are
// keyed, on key order inside records, or on the platform.
//
// Change detection. In `reference` mode a row whose value is the same object as last time is taken as
// unchanged; this is exact as long as the core never edits state in place (commands return a new
// state, P1.1.3). `deep` mode re-reads every row and trusts nothing. The save file uses a deep pass
// at every checkpoint so an in-place edit cannot outlive the week it happened in.

import type { SqlStatement } from '../driver.ts';
import { StateEncodingError, canonicalJson, isPlainObject, setOwn, storageJson, utf8 } from './canonical-json.ts';

export type FieldKind = 'scalar' | 'object' | 'array';
export type KeyMode = 'single' | 'name' | 'id' | 'index';

export type StateWrite =
  | { op: 'field'; name: string; ord: number; kind: FieldKind; keyMode: KeyMode }
  | { op: 'drop'; name: string }
  | { op: 'clear'; name: string }
  | { op: 'put'; table: string; key: string; ord: number; json: string }
  | { op: 'ord'; table: string; key: string; ord: number }
  | { op: 'del'; table: string; key: string };

export interface FieldRow { name: string; ord: number; kind: string; key_mode: string }
export interface StateRow { tbl: string; key: string; ord: number; json: string }

export class StateTablesError extends Error {
  constructor(message: string) { super(message); this.name = 'StateTablesError'; }
}

interface RowEntry { readonly ref: unknown; readonly ord: number; readonly jsonHash: string; readonly canonHash: string }
interface FieldEntry {
  readonly ref: unknown; readonly ord: number; readonly kind: FieldKind; readonly keyMode: KeyMode;
  readonly rows: ReadonlyMap<string, RowEntry>; readonly keys: readonly string[]; readonly digest: string;
}

interface Shape { kind: FieldKind; keyMode: KeyMode; keys: string[]; values: unknown[] }

function shapeOf(value: unknown, path: string): Shape {
  if (Array.isArray(value)) {
    const n = value.length;
    const ids: string[] = [];
    const seen = new Set<string>();
    let byId = n > 0;
    for (let i = 0; i < n && byId; i++) {
      const el: unknown = value[i];
      const id = isPlainObject(el) ? el.id : undefined;
      const ok = (typeof id === 'number' && Number.isInteger(id)) || typeof id === 'string';
      const key = ok ? String(id) : '';
      if (!ok || seen.has(key)) byId = false;
      else { seen.add(key); ids.push(key); }
    }
    if (byId) return { kind: 'array', keyMode: 'id', keys: ids, values: value };
    const keys: string[] = [];
    for (let i = 0; i < n; i++) keys.push(String(i));
    return { kind: 'array', keyMode: 'index', keys, values: value };
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined);
    return { kind: 'object', keyMode: 'name', keys, values: keys.map((k) => value[k]) };
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return { kind: 'scalar', keyMode: 'single', keys: [''], values: [value] };
  }
  throw new StateEncodingError(path, value === undefined ? 'undefined' : `unsupported ${typeof value === 'object' ? 'object (class instance, typed array, Map or Set)' : typeof value}`);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface StatePlan {
  /** Row changes that bring the tables from the tracked state to the planned one. */
  readonly writes: StateWrite[];
  /** Digest of the planned state. */
  readonly digest: string;
  /** Makes the planned state the tracked one. Call it only after the writes are committed. */
  commit(): void;
}

export class StateTracker {
  private fields = new Map<string, FieldEntry>();
  private current = '';

  constructor(private readonly bytesHash: (bytes: Uint8Array) => string) {
    this.current = this.total(this.fields);
  }

  private hash(text: string): string { return this.bytesHash(utf8(text)); }

  /** Digest of the tracked state. */
  digest(): string { return this.current; }

  private fieldDigest(kind: FieldKind, keys: readonly string[], rows: ReadonlyMap<string, RowEntry>): string {
    if (kind === 'scalar') return this.hash('V\n' + rows.get('')!.canonHash);
    if (kind === 'array') {
      const parts: string[] = [];
      for (const k of keys) parts.push(rows.get(k)!.canonHash);
      return this.hash('A\n' + parts.join('\n'));
    }
    const parts: string[] = [];
    for (const k of [...keys].sort(cmp)) parts.push(JSON.stringify(k) + ':' + rows.get(k)!.canonHash);
    return this.hash('O\n' + parts.join('\n'));
  }

  private total(fields: ReadonlyMap<string, FieldEntry>): string {
    const parts: string[] = [];
    for (const name of [...fields.keys()].sort(cmp)) parts.push(JSON.stringify(name) + ':' + fields.get(name)!.digest);
    return this.hash('S\n' + parts.join('\n'));
  }

  /**
   * Plans the row changes for a new state. Nothing is remembered until `commit()` is called, so a
   * failed database transaction leaves the tracker on the last saved state.
   */
  plan(state: unknown, deep = false): StatePlan {
    if (!isPlainObject(state)) throw new StateEncodingError('$', 'the world state root must be a plain record');
    const names = Object.keys(state).filter((k) => state[k] !== undefined);
    const writes: StateWrite[] = [];
    const next = new Map<string, FieldEntry>();
    for (let i = 0; i < names.length; i++) {
      const name = names[i]!;
      const value = state[name];
      const old = this.fields.get(name);
      if (old && !deep && old.ref === value) {
        if (old.ord !== i) writes.push({ op: 'field', name, ord: i, kind: old.kind, keyMode: old.keyMode });
        next.set(name, old.ord === i ? old : { ...old, ord: i });
        continue;
      }
      const shape = shapeOf(value, `$.${name}`);
      const reuse = !!old && old.kind === shape.kind && old.keyMode === shape.keyMode;
      if (!old || !reuse || old.ord !== i) writes.push({ op: 'field', name, ord: i, kind: shape.kind, keyMode: shape.keyMode });
      if (old && !reuse) writes.push({ op: 'clear', name });
      const prev: ReadonlyMap<string, RowEntry> = reuse ? old.rows : new Map();
      const rows = new Map<string, RowEntry>();
      let found = 0;
      for (let j = 0; j < shape.keys.length; j++) {
        const key = shape.keys[j]!;
        const v = shape.values[j];
        const e = prev.get(key);
        if (e) found++;
        if (e && !deep && e.ref === v) {
          if (e.ord !== j) writes.push({ op: 'ord', table: name, key, ord: j });
          rows.set(key, e.ord === j ? e : { ...e, ord: j });
          continue;
        }
        const canon = canonicalJson(v, shape.kind === 'scalar' ? `$.${name}` : shape.kind === 'array' ? `$.${name}[${j}]` : `$.${name}.${key}`);
        const json = storageJson(v);
        const jsonHash = this.hash(json);
        const canonHash = json === canon ? jsonHash : this.hash(canon);
        if (!e || e.jsonHash !== jsonHash) writes.push({ op: 'put', table: name, key, ord: j, json });
        else if (e.ord !== j) writes.push({ op: 'ord', table: name, key, ord: j });
        rows.set(key, { ref: v, ord: j, jsonHash, canonHash });
      }
      if (found !== prev.size) for (const key of prev.keys()) if (!rows.has(key)) writes.push({ op: 'del', table: name, key });
      next.set(name, { ref: value, ord: i, kind: shape.kind, keyMode: shape.keyMode, rows, keys: shape.keys, digest: this.fieldDigest(shape.kind, shape.keys, rows) });
    }
    for (const name of this.fields.keys()) if (!next.has(name)) writes.push({ op: 'drop', name });
    const digest = this.total(next);
    return { writes, digest, commit: () => { this.fields = next; this.current = digest; } };
  }

  /** Rebuilds the state and a tracker from the rows of a save. Throws StateTablesError when the rows do not form a state. */
  static load(bytesHash: (bytes: Uint8Array) => string, fieldRows: readonly FieldRow[], stateRows: readonly StateRow[]): { tracker: StateTracker; state: Record<string, unknown> } {
    const tracker = new StateTracker(bytesHash);
    const byTable = new Map<string, StateRow[]>();
    for (const r of stateRows) {
      let list = byTable.get(r.tbl);
      if (!list) byTable.set(r.tbl, list = []);
      list.push(r);
    }
    const sortedFields = [...fieldRows].sort((a, b) => a.ord - b.ord);
    const state: Record<string, unknown> = {};
    const fields = new Map<string, FieldEntry>();
    for (let i = 0; i < sortedFields.length; i++) {
      const f = sortedFields[i]!;
      if (f.ord !== i) throw new StateTablesError(`state field order is broken at ${f.name}`);
      if (fields.has(f.name)) throw new StateTablesError(`state field ${f.name} is listed twice`);
      const list = (byTable.get(f.name) ?? []).sort((a, b) => a.ord - b.ord);
      byTable.delete(f.name);
      const rows = new Map<string, RowEntry>();
      const keys: string[] = [];
      const values: unknown[] = [];
      for (let j = 0; j < list.length; j++) {
        const r = list[j]!;
        if (r.ord !== j) throw new StateTablesError(`row order is broken in ${f.name} at ${r.key}`);
        let v: unknown;
        try { v = JSON.parse(r.json); } catch { throw new StateTablesError(`row ${f.name}/${r.key} is not readable`); }
        let canonHash: string;
        try { canonHash = tracker.hash(canonicalJson(v, `$.${f.name}`)); } catch (e) { throw new StateTablesError(e instanceof Error ? e.message : String(e)); }
        rows.set(r.key, { ref: v, ord: j, jsonHash: tracker.hash(r.json), canonHash });
        keys.push(r.key);
        values.push(v);
      }
      if (rows.size !== list.length) throw new StateTablesError(`duplicate row key in ${f.name}`);
      let value: unknown;
      if (f.kind === 'scalar' && f.key_mode === 'single') {
        if (list.length !== 1 || keys[0] !== '') throw new StateTablesError(`field ${f.name} should hold one value`);
        value = values[0];
      } else if (f.kind === 'object' && f.key_mode === 'name') {
        const rec: Record<string, unknown> = {};
        for (let j = 0; j < keys.length; j++) setOwn(rec, keys[j]!, values[j]);
        value = rec;
      } else if (f.kind === 'array' && (f.key_mode === 'id' || f.key_mode === 'index')) {
        for (let j = 0; j < keys.length; j++) {
          const el = values[j];
          const want = f.key_mode === 'index' ? String(j) : isPlainObject(el) && (typeof el.id === 'number' || typeof el.id === 'string') ? String(el.id) : null;
          if (want !== keys[j]) throw new StateTablesError(`row ${f.name}/${keys[j]} does not match its key`);
        }
        value = values;
      } else {
        throw new StateTablesError(`field ${f.name} has an unknown layout ${f.kind}/${f.key_mode}`);
      }
      setOwn(state, f.name, value);
      const kind = f.kind as FieldKind;
      fields.set(f.name, { ref: value, ord: i, kind, keyMode: f.key_mode as KeyMode, rows, keys, digest: tracker.fieldDigest(kind, keys, rows) });
    }
    if (byTable.size) throw new StateTablesError(`rows exist for unknown state field ${[...byTable.keys()].sort(cmp)[0]}`);
    tracker.fields = fields;
    tracker.current = tracker.total(fields);
    return { tracker, state };
  }
}

/** Digest of a state on its own, with no tables behind it. */
export function stateDigest(bytesHash: (bytes: Uint8Array) => string, state: unknown): string {
  return new StateTracker(bytesHash).plan(state, true).digest;
}

export const STATE_TABLES_DDL = `
CREATE TABLE IF NOT EXISTS state_fields (
  name TEXT PRIMARY KEY,
  ord INTEGER NOT NULL,
  kind TEXT NOT NULL,
  key_mode TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS state_rows (
  tbl TEXT NOT NULL,
  key TEXT NOT NULL,
  ord INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (tbl, key)
);
`;

/** SQL for a list of row changes, in order. */
export function stateStatements(writes: readonly StateWrite[]): SqlStatement[] {
  const out: SqlStatement[] = [];
  for (const w of writes) {
    switch (w.op) {
      case 'field':
        out.push({ sql: 'INSERT INTO state_fields (name, ord, kind, key_mode) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET ord = excluded.ord, kind = excluded.kind, key_mode = excluded.key_mode', params: [w.name, w.ord, w.kind, w.keyMode] });
        break;
      case 'drop':
        out.push({ sql: 'DELETE FROM state_rows WHERE tbl = ?', params: [w.name] });
        out.push({ sql: 'DELETE FROM state_fields WHERE name = ?', params: [w.name] });
        break;
      case 'clear':
        out.push({ sql: 'DELETE FROM state_rows WHERE tbl = ?', params: [w.name] });
        break;
      case 'put':
        out.push({ sql: 'INSERT INTO state_rows (tbl, key, ord, json) VALUES (?, ?, ?, ?) ON CONFLICT(tbl, key) DO UPDATE SET ord = excluded.ord, json = excluded.json', params: [w.table, w.key, w.ord, w.json] });
        break;
      case 'ord':
        out.push({ sql: 'UPDATE state_rows SET ord = ? WHERE tbl = ? AND key = ?', params: [w.ord, w.table, w.key] });
        break;
      case 'del':
        out.push({ sql: 'DELETE FROM state_rows WHERE tbl = ? AND key = ?', params: [w.table, w.key] });
        break;
    }
  }
  return out;
}

/** SQL that replaces the live tables with `state`, and the tracker that then matches them. */
export function replaceStateStatements(bytesHash: (bytes: Uint8Array) => string, state: unknown): { statements: SqlStatement[]; tracker: StateTracker; digest: string } {
  const tracker = new StateTracker(bytesHash);
  const plan = tracker.plan(state, true);
  plan.commit();
  return {
    statements: [{ sql: 'DELETE FROM state_rows' }, { sql: 'DELETE FROM state_fields' }, ...stateStatements(plan.writes)],
    tracker,
    digest: plan.digest,
  };
}

export async function readStateRows(all: <T>(sql: string) => Promise<T[]>): Promise<{ fields: FieldRow[]; rows: StateRow[] }> {
  const fields = await all<FieldRow>('SELECT name, ord, kind, key_mode FROM state_fields ORDER BY ord');
  const rows = await all<StateRow>('SELECT tbl, key, ord, json FROM state_rows ORDER BY tbl, ord');
  return { fields, rows };
}
