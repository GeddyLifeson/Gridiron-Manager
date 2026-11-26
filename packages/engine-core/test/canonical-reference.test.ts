// G-97: the faster canonical writer (src/canonical.ts) writes exactly the bytes of the plain writer it
// replaced (test/fixtures/canonical-reference.ts), so every state hash, stream key and golden digest is
// unchanged (P1.1.5, J13.2.1, Q1.3.1).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canonicalBytes } from '../src/canonical.ts';
import { canonicalBytes as referenceBytes } from './fixtures/canonical-reference.ts';

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

// Plain data the way state holds it: nested records and arrays of numbers, strings (ASCII and not), booleans, null.
const leaf = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true }), fc.integer(), fc.constant(-0), fc.boolean(), fc.constant(null),
  fc.string(), fc.string({ unit: 'grapheme' }), fc.string({ unit: 'binary' }), fc.constantFrom('', 'é', '日本', '\u{1F3C8}', '\uD800', 'a\u0000b'),
);
const value = fc.letrec((tie) => ({
  v: fc.oneof({ depthSize: 'small' }, leaf, fc.array(tie('v'), { maxLength: 6 }), fc.dictionary(fc.oneof(fc.string(), fc.string({ unit: 'binary' })), fc.option(tie('v'), { nil: undefined }), { maxKeys: 6 }), fc.uint8Array({ maxLength: 20 })),
})).v;

describe('canonical writer matches the frozen reference (G-97)', () => {
  it('same bytes for random plain data', () => {
    fc.assert(fc.property(value, (v) => { expect(hex(canonicalBytes(v))).toBe(hex(referenceBytes(v))); }), { numRuns: 3000 });
  });
  it('same bytes for a large value that grows the buffer past its start size, and for the next small one', () => {
    const big = { rows: Array.from({ length: 5000 }, (_, i) => ({ id: i, name: `player ${i}`, z: i / 7, ok: i % 2 === 0 })) };
    expect(hex(canonicalBytes(big))).toBe(hex(referenceBytes(big)));
    expect(hex(canonicalBytes({ a: 1 }))).toBe(hex(referenceBytes({ a: 1 })));
  });
  it('each call returns a fresh array that later calls do not overwrite', () => {
    const a = canonicalBytes({ x: 'first' });
    const copy = hex(a);
    canonicalBytes({ x: 'second, longer than the first' });
    expect(hex(a)).toBe(copy);
  });
  it('refuses the same values with the same place named', () => {
    const cases: unknown[] = [{ a: [1, { b: Infinity }] }, { m: new Map() }, [() => 1], { deep: { x: [0, 1, NaN] } }, 10n];
    for (const c of cases) {
      let want = '', got = '';
      try { referenceBytes(c); } catch (e) { want = (e as Error).message; }
      try { canonicalBytes(c); } catch (e) { got = (e as Error).message; }
      expect(got).toBe(want);
      expect(got).not.toBe('');
    }
    // After an error the writer is clean again.
    expect(hex(canonicalBytes({ ok: true }))).toBe(hex(referenceBytes({ ok: true })));
  });
});
