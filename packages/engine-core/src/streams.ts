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

// The key bytes: version, seed words, name, then each scope field (1 + string or 2 + u32), little-endian
// u32 lengths and values. Written into one reused buffer and hashed in place (G-97: a game derives a
// stream for every draw site). ASCII strings are copied directly; others go through the encoder, so the
// bytes are the UTF-8 bytes either way.
let keyBuf = new Uint8Array(256);
let keyLen = 0;

function keyEnsure(n: number): void {
  if (keyLen + n <= keyBuf.length) return;
  let cap = keyBuf.length * 2;
  while (cap < keyLen + n) cap *= 2;
  const next = new Uint8Array(cap);
  next.set(keyBuf.subarray(0, keyLen));
  keyBuf = next;
}

function keyU32(n: number): void {
  keyEnsure(4);
  const b = keyBuf;
  b[keyLen] = n & 0xff; b[keyLen + 1] = (n >>> 8) & 0xff; b[keyLen + 2] = (n >>> 16) & 0xff; b[keyLen + 3] = (n >>> 24) & 0xff;
  keyLen += 4;
}

function keyStr(s: string): void {
  const n = s.length;
  for (let i = 0; i < n; i++) {
    if (s.charCodeAt(i) > 0x7f) {
      const u = utf8(s);
      keyU32(u.length); keyEnsure(u.length); keyBuf.set(u, keyLen); keyLen += u.length;
      return;
    }
  }
  keyU32(n); keyEnsure(n);
  const b = keyBuf;
  for (let i = 0; i < n; i++) b[keyLen + i] = s.charCodeAt(i);
  keyLen += n;
}

function encodeScope(seed: WorldSeed, name: string, scope: readonly ScopeField[]): Uint8Array {
  keyLen = 0;
  keyStr(KEY_SCHEME_VERSION);
  keyU32(seed.hi); keyU32(seed.lo);
  keyStr(name);
  keyU32(scope.length);
  for (const f of scope) {
    if (typeof f === 'string') { keyEnsure(1); keyBuf[keyLen++] = 1; keyStr(f); }
    else {
      if (!Number.isInteger(f) || f < -2147483648 || f > 4294967295) throw new Error(`scope field ${f} must be a 32-bit integer`);
      keyEnsure(1); keyBuf[keyLen++] = 2; keyU32(f >>> 0);
    }
  }
  return keyBuf.subarray(0, keyLen);
}

export function streamKey(seed: WorldSeed, name: string, scope: readonly ScopeField[]): Key128 {
  // The bytes are a view of the shared buffer; the hash reads them before anything else writes there.
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
