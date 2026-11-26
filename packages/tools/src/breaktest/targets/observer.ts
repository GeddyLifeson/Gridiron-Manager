// Observer-filter target (P1.1.4, K9.1.1, Q1.4.2): truth must never reach a screen or an AI decision. The rig
// takes a row of every world table, plants unique marks in its truth fields, then makes the row hostile the
// ways a buggy builder or a modded save could: unknown keys carrying a mark, a public field swapped for an
// object or array holding one, a `__proto__` key, the row filtered under another table's schema, and odd
// observers (scopes on a team id of "NaN", the empty string, a `__proto__` scope). After every filter call
// no mark may survive, and the filter must not pollute Object.prototype.
import { observer as obs } from '@gm/app-services';
import type { Action, BreakTarget, Mode, Outcome, Rnd, Violation } from '../types.ts';

const OWNER = 'G-27 observer filter (app-services observer)';
const MARK = '#breaktest-secret-';

export class ObserverTarget implements BreakTarget {
  readonly name = 'observer';
  readonly owner = OWNER;
  private calls = 0;
  private pending: Violation[] = [];
  private mark = 0;

  async reset(): Promise<void> { this.calls = 0; this.pending = []; this.mark = 0; }

  propose(mode: Mode, r: Rnd): Action {
    const tables = obs.WORLD_ROW_TABLES;
    const table = r.pick(tables);
    const option = r.int(0, 5);
    const viewer = mode === 'boundary'
      ? r.pick(['nan_team', 'empty_team', 'proto_scope', 'negative_person', 'huge_team'])
      : r.pick(['public', 'owner_all', 'other_team_all', 'owner_team_scope']);
    if (mode === 'hostile') return { kind: 'filter', mode, args: { table, option, viewer, hostile: r.pick(['extra_key', 'swap_object', 'swap_array', 'proto_key', 'nested_extra']), at: r.uniform() } };
    if (mode === 'out_of_order') return { kind: 'filter', mode, args: { table, option, viewer, schemaOf: r.pick(tables), at: r.uniform() } };
    return { kind: 'filter', mode, args: { table, option, viewer } };
  }

  expect(): undefined { return undefined; }

  private viewerOf(kind: string): obs.Observer {
    switch (kind) {
      case 'public': return obs.PUBLIC_OBSERVER;
      case 'owner_all': return { personId: 1, teamScopes: { '1': [obs.ALL_SCOPES] } };
      case 'other_team_all': return { personId: 2, teamScopes: { '99': [obs.ALL_SCOPES] } };
      case 'owner_team_scope': return { personId: 1, teamScopes: { '1': ['team'] } };
      case 'nan_team': return { personId: 1, teamScopes: { NaN: [obs.ALL_SCOPES] } };
      case 'empty_team': return { personId: 1, teamScopes: { '': [obs.ALL_SCOPES] } };
      case 'proto_scope': return { personId: 1, teamScopes: JSON.parse('{"__proto__":["*"],"1":["__proto__","constructor"]}') };
      case 'negative_person': return { personId: -1, teamScopes: { '-1': [obs.ALL_SCOPES] } };
      default: return { personId: Number.MAX_SAFE_INTEGER, teamScopes: { [String(2 ** 60)]: [obs.ALL_SCOPES] } };
    }
  }

  async apply(a: Action): Promise<Outcome> {
    const g = a.args;
    const table = g['table'] as string;
    const schema = obs.tableSchema(table);
    const base = obs.fullSample(schema, g['option'] as number);
    const planted = obs.plantSentinels(schema, base, table);
    let row: unknown = planted.row;
    const marks = [...planted.sentinels];
    const newMark = (): string => { const m = `${MARK}${++this.mark}#`; marks.push({ table, path: 'hostile', value: m }); return m; };
    const hostile = g['hostile'] as string | undefined;
    if (hostile) row = this.mutate(row, hostile, g['at'] as number, newMark);
    const filterSchema = g['schemaOf'] ? obs.tableSchema(g['schemaOf'] as string) : schema;
    if (g['schemaOf']) marks.push(...this.allStrings(row).filter((s) => s.includes('#truth-mark-')).map((v) => ({ table, path: 'other', value: v })));
    const out = obs.filterValue(filterSchema, row, this.viewerOf(g['viewer'] as string));
    this.calls++;
    const hits = obs.findSentinels(out, marks);
    for (const h of hits.slice(0, 1)) {
      this.pending.push({ code: `leak:${hostile ?? (g['schemaOf'] ? 'other_schema' : 'plain')}`, message: `A planted ${h.sentinel.path === 'hostile' ? 'hostile' : 'truth'} value of a ${table} row reached a ${g['viewer']} observer through the filter${hostile ? ` (${hostile})` : ''}.`, detail: { table, foundAt: h.foundAt, plantedAt: h.sentinel.path } });
    }
    if (({} as Record<string, unknown>)['polluted'] !== undefined || (Object.prototype as Record<string, unknown>)['breaktest'] !== undefined) {
      this.pending.push({ code: 'prototype_polluted', message: 'Filtering a row with a __proto__ key changed Object.prototype.' });
    }
    return { accepted: true };
  }

  private allStrings(v: unknown, out: string[] = []): string[] {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => this.allStrings(x, out));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => this.allStrings(x, out));
    return out;
  }

  /** Puts a hostile mark into the row at a position chosen by `at` (0..1 over the row's object nodes). */
  private mutate(row: unknown, how: string, at: number, mark: () => string): unknown {
    const nodes: Record<string, unknown>[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') { nodes.push(v as Record<string, unknown>); Object.values(v).forEach(walk); }
    };
    const copy = JSON.parse(JSON.stringify(row)) as unknown;
    walk(copy);
    const node = nodes[Math.min(nodes.length - 1, Math.floor(at * nodes.length))];
    if (!node) return copy;
    const keys = Object.keys(node);
    const key = keys.length ? keys[Math.floor(at * 7919) % keys.length]! : 'x';
    switch (how) {
      case 'extra_key': (nodes[0] as Record<string, unknown>)['zz_not_in_schema'] = mark(); break; // the row root is an object schema, never a record
      case 'nested_extra': (nodes[0] as Record<string, unknown>)['notInSchema'] = { deeper: [mark()] }; break;
      case 'swap_object': node[key] = { value: mark(), [key]: mark() }; break;
      case 'swap_array': node[key] = [mark(), { x: mark() }]; break;
      case 'proto_key': Object.defineProperty(node, '__proto__', { value: { breaktest: mark() }, enumerable: true, configurable: true, writable: true }); break;
    }
    return copy;
  }

  invariants(): Violation[] { const p = this.pending; this.pending = []; return p; }
  hash(): string { return `calls:${this.calls}`; }
  unreachable() {
    return [{ code: 'observer.no_live_read_models', message: 'Screens\' read models are not built from a live world through ObservedWorld yet (no generated world behind WorldService), so the rig filters every table\'s rows directly; phase 2 crawls the real read models of a running career.' }];
  }
  async close(): Promise<void> { /* stateless */ }
}
