// Named streams and seed hierarchy (J13.2.1, J13.4.1). A key is hash(version, worldSeed, streamName,
// typed scope fields...). Every scope is derived from the world seed, never from "the next number of
// a global generator", so adding draws in one place never moves another stream.

import { murmur3x86_128, utf8 } from './hash.ts';
import { Stream, type Key128 } from './rng.ts';

/** Version of the key derivation. Changing it changes every stream: a new engine version. */
export const KEY_SCHEME_VERSION = 'gm-key-v1';

export type ScopeField = number | string;

/** World seed as a 64-bit value carried in two unsigned 32-bit words (hi, lo). */
export interface WorldSeed { readonly hi: number; readonly lo: number }

export function seedFromNumber(n: number): WorldSeed {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('world seed must be a non-negative safe integer');
  return { hi: Math.floor(n / 4294967296) >>> 0, lo: n >>> 0 };
}

export function seedFromHex(hex: string): WorldSeed {
  if (!/^[0-9a-f]{1,16}$/i.test(hex)) throw new Error('world seed hex must be 1 to 16 hex digits');
  const h = hex.padStart(16, '0');
  return { hi: parseInt(h.slice(0, 8), 16) >>> 0, lo: parseInt(h.slice(8), 16) >>> 0 };
}

export function seedToHex(s: WorldSeed): string {
  return (s.hi >>> 0).toString(16).padStart(8, '0') + (s.lo >>> 0).toString(16).padStart(8, '0');
}

function encodeScope(seed: WorldSeed, name: string, scope: readonly ScopeField[]): Uint8Array {
  const parts: number[] = [];
  const pushU32 = (n: number) => { parts.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff); };
  const pushStr = (s: string) => { const b = utf8(s); pushU32(b.length); for (const x of b) parts.push(x); };
  pushStr(KEY_SCHEME_VERSION);
  pushU32(seed.hi); pushU32(seed.lo);
  pushStr(name);
  pushU32(scope.length);
  for (const f of scope) {
    if (typeof f === 'string') { parts.push(1); pushStr(f); }
    else {
      if (!Number.isInteger(f) || f < -2147483648 || f > 4294967295) throw new Error(`scope field ${f} must be a 32-bit integer`);
      parts.push(2); pushU32(f >>> 0);
    }
  }
  return Uint8Array.from(parts);
}

export function streamKey(seed: WorldSeed, name: string, scope: readonly ScopeField[]): Key128 {
  return murmur3x86_128(encodeScope(seed, name, scope), 0);
}

export function stream(seed: WorldSeed, name: string, scope: readonly ScopeField[]): Stream {
  return Stream.fromKey(name, streamKey(seed, name, scope));
}

/** Derived 64-bit seed for a sub-scope (a season's class, a game), as a WorldSeed. */
export function deriveSeed(seed: WorldSeed, scopeName: string, scope: readonly ScopeField[]): WorldSeed {
  const [a, b] = streamKey(seed, `seed:${scopeName}`, scope);
  return { hi: a, lo: b };
}
