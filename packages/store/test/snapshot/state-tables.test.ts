import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bytesHash, stateHash } from '@gm/engine-core';
import { StateEncodingError, canonicalJson } from '../../src/snapshot/canonical-json.ts';
import { STATE_TABLES_DDL, StateTablesError, StateTracker, readStateRows, stateDigest, stateStatements } from '../../src/snapshot/state-tables.ts';
import { memoryDb } from '../save/helpers.ts';

describe('canonical JSON', () => {
  it('sorts keys, skips undefined fields and prints -0 as 0', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'], c: undefined, d: -0 })).toBe('{"a":[true,null,"x"],"b":1,"d":0}');
  });
  it('refuses what a JSON round trip would change, naming the path', () => {
    const bad: [unknown, RegExp][] = [
      [{ a: { b: Number.NaN } }, /\$\.a\.b: non-finite/],
      [{ a: [1, Infinity] }, /\$\.a\[1\]: non-finite/],
      [{ a: [1, undefined] }, /\$\.a\[1\]: hole or undefined/],
      [{ a: new Uint8Array(2) }, /\$\.a: not a plain object/],
      [{ a: new Map() }, /\$\.a: not a plain object/],
      [{ a: new Date(0) }, /\$\.a: not a plain object/],
      [{ a: () => 1 }, /\$\.a: unsupported function/],
      [{ a: 1n }, /\$\.a: unsupported bigint/],
    ];
    // eslint-disable-next-line no-sparse-arrays
    bad.push([{ a: [1, , 3] }, /\$\.a\[1\]: hole/]);
    for (const [v, re] of bad) {
      expect(() => canonicalJson(v)).toThrow(StateEncodingError);
      expect(() => canonicalJson(v)).toThrow(re);
    }
  });
});

// Plain data as a world might hold it: finite doubles, nested records, arrays, strange keys.
const leaf = fc.oneof(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.integer(), fc.string(), fc.boolean(), fc.constant(null));
const key = fc.oneof(fc.string({ maxLength: 6 }), fc.constantFrom('id', '__proto__', '10', '2', 'constructor', ''));
const value: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  v: fc.oneof({ depthSize: 'small' }, leaf, fc.array(tie('v'), { maxLength: 4 }), fc.dictionary(key, tie('v'), { maxKeys: 4 })),
})).v;
const withId = fc.uniqueArray(fc.record({ id: fc.oneof(fc.integer({ min: 0, max: 30 }), fc.string({ maxLength: 3 })), x: value }), { selector: (r) => String(r.id), maxLength: 8 });
const world = fc.dictionary(fc.oneof(fc.constantFrom('people', 'teams', 'calendar', 'notes', 'rng'), fc.string({ maxLength: 5 })), fc.oneof(value, withId), { maxKeys: 6 });

/** A copy with the same value and the same key order, as a JSON round trip gives. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('state tables', () => {
  it('writes any sequence of states so that the tables read back exactly, in the same order, with the same digest', async () => {
    await fc.assert(fc.asyncProperty(fc.array(world, { minLength: 1, maxLength: 5 }), fc.boolean(), async (states, deep) => {
      const d = await memoryDb();
      await d.exec(STATE_TABLES_DDL);
      const tracker = new StateTracker(bytesHash);
      for (const s of states) {
        const plan = tracker.plan(s, deep);
        await d.transaction(stateStatements(plan.writes));
        plan.commit();
        const { fields, rows } = await readStateRows((sql) => d.all(sql));
        const loaded = StateTracker.load(bytesHash, fields, rows);
        expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(s));
        expect(stateHash(loaded.state)).toBe(stateHash(s));
        expect(loaded.tracker.digest()).toBe(plan.digest);
        expect(plan.digest).toBe(stateDigest(bytesHash, clone(s)));
        expect(tracker.digest()).toBe(plan.digest);
      }
      await d.close();
    }), { numRuns: 150 });
  });

  it('the digest depends on the value alone: equal states agree, different states differ', () => {
    fc.assert(fc.property(world, world, (a, b) => {
      const same = stateHash(a) === stateHash(b);
      expect(stateDigest(bytesHash, a) === stateDigest(bytesHash, b)).toBe(same);
    }), { numRuns: 300 });
    // Key order inside records does not matter; array order does.
    expect(stateDigest(bytesHash, { a: { x: 1, y: 2 }, b: 1 })).toBe(stateDigest(bytesHash, { b: 1, a: { y: 2, x: 1 } }));
    expect(stateDigest(bytesHash, { a: [1, 2] })).not.toBe(stateDigest(bytesHash, { a: [2, 1] }));
    expect(stateDigest(bytesHash, { a: [] })).not.toBe(stateDigest(bytesHash, { a: {} }));
    expect(stateDigest(bytesHash, { a: [{ id: 1 }, { id: 2 }] })).not.toBe(stateDigest(bytesHash, { a: [{ id: 2 }, { id: 1 }] }));
    expect(stateDigest(bytesHash, { a: null })).not.toBe(stateDigest(bytesHash, {}));
  });

  it('does not depend on the history of row layouts', () => {
    const t = new StateTracker(bytesHash);
    const steps: unknown[] = [
      { people: [] },
      { people: [{ id: 1, n: 'a' }, { id: 2, n: 'b' }] },   // keyed by id
      { people: [{ id: 1, n: 'a' }, { n: 'no id' }] },      // falls back to position
      { people: [{ id: 2, n: 'b' }, { id: 1, n: 'a' }] },   // back to ids, other order
      { people: { 1: 'record now' } },
      { people: 7 },
    ];
    for (const s of steps) {
      const p = t.plan(s);
      p.commit();
      expect(p.digest).toBe(stateDigest(bytesHash, s));
    }
  });

  it('in reference mode writes only what changed', () => {
    const t = new StateTracker(bytesHash);
    const people = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `P${i}` }));
    const s0 = { people, calendar: { seasonYear: 2026, dayIndex: 0 }, notes: ['a', 'b'] };
    const first = t.plan(s0);
    expect(first.writes.filter((w) => w.op === 'put').length).toBe(104);
    first.commit();
    expect(t.plan(s0).writes).toEqual([]);
    const s1 = { ...s0, people: people.map((p) => (p.id === 40 ? { ...p, name: 'changed' } : p)) };
    expect(t.plan(s1).writes).toEqual([{ op: 'put', table: 'people', key: '40', ord: 39, json: '{"id":40,"name":"changed"}' }]);
    // Removing one element moves the ones after it without rewriting them.
    const s2 = { ...s0, people: people.filter((p) => p.id !== 98) };
    expect(t.plan(s2).writes).toEqual([
      { op: 'ord', table: 'people', key: '99', ord: 97 }, { op: 'ord', table: 'people', key: '100', ord: 98 }, { op: 'del', table: 'people', key: '98' },
    ]);
    // An equal copy of a row is not written again.
    const s3 = { ...s0, people: people.map((p) => ({ ...p })) };
    expect(t.plan(s3).writes).toEqual([]);
    // A plan that is not committed leaves the tracker where it was.
    expect(t.digest()).toBe(first.digest);
  });

  it('a deep pass finds an edit made in place, which reference mode cannot see', () => {
    const t = new StateTracker(bytesHash);
    const s = { people: [{ id: 1, rating: 50 }] };
    t.plan(s).commit();
    s.people[0]!.rating = 99;
    expect(t.plan(s).writes).toEqual([]);
    const deep = t.plan(s, true);
    expect(deep.writes.length).toBe(1);
    expect(deep.digest).toBe(stateDigest(bytesHash, { people: [{ id: 1, rating: 99 }] }));
  });

  it('refuses rows that do not form a state', () => {
    const f = [{ name: 'people', ord: 0, kind: 'array', key_mode: 'id' }];
    const row = (key: string, ord: number, json: string) => ({ tbl: 'people', key, ord, json });
    expect(() => StateTracker.load(bytesHash, f, [row('1', 0, '{"id":1}'), row('2', 2, '{"id":2}')])).toThrow(StateTablesError);
    expect(() => StateTracker.load(bytesHash, f, [row('1', 0, '{"id":5}')])).toThrow(/does not match its key/);
    expect(() => StateTracker.load(bytesHash, f, [row('1', 0, '{"id":')])).toThrow(/not readable/);
    expect(() => StateTracker.load(bytesHash, f, [{ tbl: 'ghost', key: '', ord: 0, json: '1' }])).toThrow(/unknown state field/);
    expect(() => StateTracker.load(bytesHash, [{ name: 'x', ord: 0, kind: 'scalar', key_mode: 'single' }], [])).toThrow(/should hold one value/);
    expect(() => StateTracker.load(bytesHash, [{ name: 'x', ord: 1, kind: 'scalar', key_mode: 'single' }], [])).toThrow(/order is broken/);
    expect(() => new StateTracker(bytesHash).plan([1, 2])).toThrow(/root must be a plain record/);
  });
});
