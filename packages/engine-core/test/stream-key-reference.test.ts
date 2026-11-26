// streamKey builds its bytes in a reused buffer with cached heads and string bytes; it must hash exactly the
// bytes of the plain field-by-field encoding (J13.2.1), or every stream in the game moves.
import { describe, expect, it } from 'vitest';
import { KEY_SCHEME_VERSION, murmur3x86_128, seedFromHex, seedFromNumber, streamKey, type ScopeField, type WorldSeed } from '../src/index.ts';

const enc = new TextEncoder();
function referenceKey(seed: WorldSeed, name: string, scope: readonly ScopeField[]) {
  const parts: number[] = [];
  const u32 = (n: number) => { parts.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff); };
  const str = (s: string) => { const b = enc.encode(s); u32(b.length); for (const x of b) parts.push(x); };
  str(KEY_SCHEME_VERSION); u32(seed.hi); u32(seed.lo); str(name); u32(scope.length);
  for (const f of scope) {
    if (typeof f === 'string') { parts.push(1); str(f); } else { parts.push(2); u32(f >>> 0); }
  }
  return murmur3x86_128(Uint8Array.from(parts), 0);
}

describe('streamKey bytes', () => {
  it('equals the plain encoding for numbers, strings, long scopes and many seeds', () => {
    const seeds = [seedFromNumber(0), seedFromNumber(1869), seedFromHex('ffffffffffffffff'), seedFromHex('00000000000000a7')];
    const names = ['world.turnover.look', 'w', 'x'.repeat(300), 'é名'];
    const scopes: ScopeField[][] = [[], [1], [-1, 4294967295, -2147483648], ['a', 2, 'bé', 0], Array.from({ length: 200 }, (_, i) => (i % 3 ? i * 7919 : `s${i}`))];
    for (const seed of seeds) for (const name of names) for (const scope of scopes) {
      expect(streamKey(seed, name, scope)).toEqual(referenceKey(seed, name, scope));
      // Twice, so the cached head and string bytes are used.
      expect(streamKey(seed, name, scope)).toEqual(referenceKey(seed, name, scope));
    }
  });

  it('follows a seed object whose words change', () => {
    const seed = { hi: 1, lo: 2 };
    const a = streamKey(seed, 'n', [1]);
    seed.hi = 3;
    expect(streamKey(seed, 'n', [1])).toEqual(referenceKey(seed, 'n', [1]));
    expect(streamKey(seed, 'n', [1])).not.toEqual(a);
  });

  it('still refuses a scope number that is not a 32-bit integer', () => {
    expect(() => streamKey(seedFromNumber(1), 'n', [1.5])).toThrow();
    expect(() => streamKey(seedFromNumber(1), 'n', [2 ** 33])).toThrow();
  });
});
