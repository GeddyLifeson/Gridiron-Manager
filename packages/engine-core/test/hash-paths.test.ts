// G-97 part 3: murmur3 reads 32-bit words through a typed view when the bytes sit on a 4-byte boundary,
// and byte by byte otherwise. Both paths give the same hash, for every length and offset.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { hash128Hex } from '../src/hash.ts';

describe('murmur3 word paths (G-97)', () => {
  it('same hash for aligned and unaligned views of the same bytes', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 200 }), fc.integer({ min: 0, max: 7 }), fc.integer({ min: 0, max: 0xffffffff }), (bytes, offset, seed) => {
      const aligned = new Uint8Array(bytes);
      const host = new Uint8Array(bytes.length + offset + 8);
      host.set(bytes, offset);
      const view = host.subarray(offset, offset + bytes.length);
      expect(hash128Hex(view, seed)).toBe(hash128Hex(aligned, seed));
    }), { numRuns: 2000 });
  });
});
