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

// The key bytes, built into one reused buffer (the same bytes as appending field by field): the head
// (scheme, seed, name) is kept per seed object and name, and string fields' UTF-8 per string.
const HEADS = new WeakMap<WorldSeed, Map<string, Uint8Array>>();
const UTF8 = new Map<string, Uint8Array>();
const UTF8_LIMIT = 4096;
let buf = new Uint8Array(256);

function utf8Of(s: string): Uint8Array {
  let b = UTF8.get(s);
  if (b === undefined) {
    b = utf8(s);
    if (UTF8.size >= UTF8_LIMIT) UTF8.clear();
    UTF8.set(s, b);
  }
  return b;
}

function headOf(seed: WorldSeed, name: string): Uint8Array {
  let byName = HEADS.get(seed);
  if (!byName) { byName = new Map(); HEADS.set(seed, byName); }
  let h = byName.get(name);
  if (h === undefined) {
    const parts: number[] = [];
    const pushU32 = (n: number) => { parts.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff); };
    const pushStr = (x: string) => { const b = utf8(x); pushU32(b.length); for (const y of b) parts.push(y); };
    pushStr(KEY_SCHEME_VERSION);
    pushU32(seed.hi); pushU32(seed.lo);
    pushStr(name);
    h = Uint8Array.from(parts);
    // A seed object is not expected to change; if its words do, the head is rebuilt (checked below).
    byName.set(name, h);
  }
  return h;
}

function encodeScope(seed: WorldSeed, name: string, scope: readonly ScopeField[]): Uint8Array {
  let head = headOf(seed, name);
  // Guard against a seed object whose words were changed after its head was kept.
  const k = utf8Of(KEY_SCHEME_VERSION).length + 4;
  const hi = (head[k]! | (head[k + 1]! << 8) | (head[k + 2]! << 16) | (head[k + 3]! << 24)) >>> 0;
  const lo = (head[k + 4]! | (head[k + 5]! << 8) | (head[k + 6]! << 16) | (head[k + 7]! << 24)) >>> 0;
  if (hi !== (seed.hi >>> 0) || lo !== (seed.lo >>> 0)) { HEADS.delete(seed); head = headOf(seed, name); }
  let need = head.length + 4;
  for (const f of scope) need += typeof f === 'string' ? 5 + utf8Of(f).length : 5;
  if (buf.length < need) buf = new Uint8Array(Math.max(need, buf.length * 2));
  const out = buf;
  out.set(head, 0);
  let i = head.length;
  const u32 = (n: number) => { out[i++] = n & 0xff; out[i++] = (n >>> 8) & 0xff; out[i++] = (n >>> 16) & 0xff; out[i++] = (n >>> 24) & 0xff; };
  u32(scope.length);
  for (const f of scope) {
    if (typeof f === 'string') { out[i++] = 1; const b = utf8Of(f); u32(b.length); out.set(b, i); i += b.length; }
    else {
      if (!Number.isInteger(f) || f < -2147483648 || f > 4294967295) throw new Error(`scope field ${f} must be a 32-bit integer`);
      out[i++] = 2; u32(f >>> 0);
    }
  }
  return out.subarray(0, i);
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
