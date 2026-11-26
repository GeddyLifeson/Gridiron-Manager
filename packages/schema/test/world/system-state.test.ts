import { describe, expect, it } from 'vitest';
import {
  SystemStateEntry, encodeSystemState, decodeSystemState, systemStateRows, systemStateFromRows, WORLD_TABLES,
} from '../../src/world/index.ts';

const live = () => new Map<string, unknown>([
  ['recruiting', { classes: new Map([[2027, { signed: new Set([5, 2, 9]), offers: new Map([[12, [3, 4]], [4, []]]) }]]), day: 41 }],
  ['compliance', { cases: [{ id: 1, stage: 'open', fine: 250000 }], nextId: 2 }],
  ['club_money', { payments: [] }],
]);

describe('systemState save slot (CR-G28-1)', () => {
  it('is one state table keyed by system', () => {
    const t = WORLD_TABLES.find((x) => x.table === 'systemState');
    expect(t).toMatchObject({ row: 'world:SystemStateEntry', kind: 'state', appendOnly: false, key: ['system'] });
  });

  it('round-trips Maps, Sets, arrays and nested objects through JSON text', () => {
    const before = live();
    const rows = systemStateRows(before);
    expect(rows.map((r) => r.system)).toEqual(['club_money', 'compliance', 'recruiting']);
    for (const r of rows) expect(SystemStateEntry.parse(r)).toEqual(r);
    const after = systemStateFromRows(JSON.parse(JSON.stringify(rows)));
    expect(after).toEqual(before);
    const rec = after.get('recruiting') as { classes: Map<number, { signed: Set<number>; offers: Map<number, number[]> }> };
    expect(rec.classes.get(2027)!.signed).toBeInstanceOf(Set);
    expect(rec.classes.get(2027)!.offers.get(12)).toEqual([3, 4]);
  });

  it('writes the same bytes whatever order the Maps and Sets were filled in', () => {
    const a = encodeSystemState('s', { m: new Map([[2, 'b'], [1, 'a']]), s: new Set(['y', 'x']) });
    const b = encodeSystemState('s', { m: new Map([[1, 'a'], [2, 'b']]), s: new Set(['x', 'y']) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.parse(a.state)).toEqual({ m: { $map: [[1, 'a'], [2, 'b']] }, s: { $set: ['x', 'y'] } });
  });

  it('refuses what JSON would change silently', () => {
    expect(() => encodeSystemState('s', { x: Number.NaN })).toThrow(/finite/);
    expect(() => encodeSystemState('s', { x: [1, undefined] })).toThrow(/undefined/);
    expect(() => encodeSystemState('s', { x: 1n })).toThrow(/bigint/);
    expect(() => encodeSystemState('s', { x: new Date(0) })).toThrow(/class instance/);
    expect(() => encodeSystemState('s', { x: { $map: [] } })).toThrow(/tag/);
    expect(() => encodeSystemState('s', { f: () => 1 })).toThrow(/function/);
  });

  it('drops absent optional fields the way JSON does, and refuses a key saved twice', () => {
    expect(decodeSystemState(encodeSystemState('s', { a: 1, b: undefined }))).toEqual({ a: 1 });
    const r = encodeSystemState('s', 1);
    expect(() => systemStateFromRows([r, r])).toThrow(/twice/);
  });
});
