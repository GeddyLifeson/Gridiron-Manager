// The canonical writer behind canonical.ts and state-hash.ts (P1.1.5, P5.3.2, J13.2.1). Internal: the
// package entry exports only `canonicalBytes` (canonical.ts) and the hash functions (state-hash.ts).
//
// Layout (unchanged, test/canonical-reference.test.ts checks it against a frozen copy of the plain writer):
// objects are written with keys sorted by UTF-16 code unit order; arrays in order; numbers as IEEE 754
// float64 little-endian bytes (exact, platform independent); strings as UTF-8 with a length prefix.
// Undefined object fields are skipped (same as absent). Functions, symbols, bigint, Map, Set, class
// instances and non-finite numbers are refused, so state stays plain data (P1.3.2).
//
// Speed (P6.3.1, G-97 part 3; a game hashes its 21 KB state after every play):
// - One grow-only buffer held in module variables, so the hot path reads no object fields.
// - Sorted key order and each key's length-prefixed UTF-8 bytes are kept per object shape (the keys in
//   insertion order). State holds many objects of one shape (a player's bench row), and objects of one
//   shape follow each other, so the last shape used is tried first. A hit is confirmed key by key.
// - Undefined fields are skipped while writing and the field count is patched afterwards.
// - No path is tracked while writing. On an error the value is walked again by a slow checker that
//   names the place, in the same order, so the message is the one the plain writer gave.
// - The hash reads the shared buffer in place (no copy).

import { utf8 } from './hash.ts';

const T_NULL = 0, T_FALSE = 1, T_TRUE = 2, T_NUM = 3, T_STR = 4, T_ARR = 5, T_OBJ = 6, T_BYTES = 7;

let buf = new Uint8Array(1 << 16);
let dv = new DataView(buf.buffer);
let len = 0;
const START = 1 << 16;
const KEEP = 1 << 22;

function grow(need: number): void {
  let cap = buf.length * 2;
  while (cap < need) cap *= 2;
  const next = new Uint8Array(cap);
  next.set(buf.subarray(0, len));
  buf = next;
  dv = new DataView(next.buffer);
}

function u32At(at: number, n: number): void { dv.setUint32(at, n >>> 0, true); }

/** Length-prefixed UTF-8. ASCII is copied directly; anything else goes through the encoder, so the bytes match utf8(s). */
function str(s: string): void {
  const n = s.length;
  if (len + 5 + n > buf.length) grow(len + 5 + n);
  buf[len++] = T_STR;
  const at = len + 4;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c > 0x7f) {
      const b = utf8(s);
      if (len + 4 + b.length > buf.length) grow(len + 4 + b.length);
      u32At(len, b.length);
      buf.set(b, len + 4);
      len += 4 + b.length;
      return;
    }
    buf[at + i] = c;
  }
  u32At(len, n);
  len = at + n;
}

/** Sorted order and key bytes for one object shape. `src` is the key list in insertion order. */
interface Shape {
  readonly src: readonly string[];
  readonly sorted: readonly string[];
  /** Length-prefixed UTF-8 bytes of every key in `sorted` order, back to back. */
  readonly keyBytes: Uint8Array;
  /** Offsets into keyBytes: key i spans [ends[i-1] or 0, ends[i]). */
  readonly ends: Int32Array;
}

function cmpKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function makeShape(keys: readonly string[]): Shape {
  const src = keys.slice();
  const sorted = src.slice().sort(cmpKeys);
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const k of sorted) { const b = utf8(k); parts.push(b); total += 4 + b.length; }
  const keyBytes = new Uint8Array(total);
  const kdv = new DataView(keyBytes.buffer);
  const ends = new Int32Array(sorted.length);
  let at = 0;
  for (let i = 0; i < parts.length; i++) {
    kdv.setUint32(at, parts[i]!.length, true);
    keyBytes.set(parts[i]!, at + 4);
    at += 4 + parts[i]!.length;
    ends[i] = at;
  }
  return { src, sorted, keyBytes, ends };
}

function sameKeys(a: readonly string[], b: readonly string[], n: number): boolean {
  if (a.length !== n) return false;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Shapes by first key; a short list each. Cleared when it grows past the cap (the bytes do not depend on it). */
const SHAPE_CAP = 4096;
const shapes = new Map<string, Shape[]>();
let shapeCount = 0;
let lastShape: Shape | null = null;
let prevShape: Shape | null = null;

function shapeOf(keys: readonly string[], n: number): Shape {
  const last = lastShape;
  if (last !== null && sameKeys(last.src, keys, n)) return last;
  const prev = prevShape;
  if (prev !== null && sameKeys(prev.src, keys, n)) { prevShape = last; lastShape = prev; return prev; }
  const first = keys[0]!;
  let list = shapes.get(first);
  let hit: Shape | undefined;
  if (list !== undefined) for (let i = 0; i < list.length; i++) if (sameKeys(list[i]!.src, keys, n)) { hit = list[i]; break; }
  if (hit === undefined) {
    if (shapeCount >= SHAPE_CAP) { shapes.clear(); shapeCount = 0; list = undefined; }
    hit = makeShape(keys);
    if (list === undefined) { list = []; shapes.set(first, list); }
    list.push(hit);
    shapeCount++;
  }
  prevShape = last;
  lastShape = hit;
  return hit;
}

/** Thrown by the fast writer; the slow checker then finds the place and throws the real error. */
const REFUSED = new Error('canonical: refused');

function write(v: unknown): void {
  if (v === null) { if (len + 1 > buf.length) grow(len + 1); buf[len++] = T_NULL; return; }
  switch (typeof v) {
    case 'boolean':
      if (len + 1 > buf.length) grow(len + 1);
      buf[len++] = v ? T_TRUE : T_FALSE;
      return;
    case 'number':
      if (v - v !== 0) throw REFUSED; // NaN and the infinities
      if (len + 9 > buf.length) grow(len + 9);
      buf[len] = T_NUM;
      dv.setFloat64(len + 1, v === 0 ? 0 : v, true);
      len += 9;
      return;
    case 'string': str(v); return;
    case 'object': {
      if (Array.isArray(v)) {
        const n = v.length;
        if (len + 5 > buf.length) grow(len + 5);
        buf[len] = T_ARR;
        u32At(len + 1, n);
        len += 5;
        for (let i = 0; i < n; i++) write(v[i]);
        return;
      }
      if (v instanceof Uint8Array) {
        const n = v.length;
        if (len + 5 + n > buf.length) grow(len + 5 + n);
        buf[len] = T_BYTES;
        u32At(len + 1, n);
        buf.set(v, len + 5);
        len += 5 + n;
        return;
      }
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw REFUSED;
      const rec = v as Record<string, unknown>;
      const keys = Object.keys(rec);
      const n = keys.length;
      if (len + 5 > buf.length) grow(len + 5);
      buf[len] = T_OBJ;
      const countAt = len + 1;
      len += 5;
      if (n === 0) { u32At(countAt, 0); return; }
      const shape = n === 1 ? null : shapeOf(keys, n);
      const order = shape === null ? keys : shape.sorted;
      let written = 0;
      for (let i = 0; i < n; i++) {
        const k = order[i]!;
        const x = rec[k];
        if (x === undefined) continue;
        if (shape === null) {
          const kb = keyBytesOf(k);
          if (len + kb.length > buf.length) grow(len + kb.length);
          buf.set(kb, len);
          len += kb.length;
        } else {
          const from = i === 0 ? 0 : shape.ends[i - 1]!;
          const to = shape.ends[i]!;
          const m = to - from;
          if (len + m > buf.length) grow(len + m);
          const kb = shape.keyBytes;
          for (let j = from; j < to; j++) buf[len++] = kb[j]!;
        }
        write(x);
        written++;
      }
      u32At(countAt, written);
      return;
    }
    default:
      throw REFUSED;
  }
}

/** Length-prefixed key bytes for objects with one key (no shape kept for those). */
const KEY_CACHE_CAP = 8192;
const keyCache = new Map<string, Uint8Array>();
function keyBytesOf(k: string): Uint8Array {
  let b = keyCache.get(k);
  if (b === undefined) {
    const kb = utf8(k);
    b = new Uint8Array(4 + kb.length);
    new DataView(b.buffer).setUint32(0, kb.length, true);
    b.set(kb, 4);
    if (keyCache.size >= KEY_CACHE_CAP) keyCache.clear();
    keyCache.set(k, b);
  }
  return b;
}

/** The plain writer's checks in its order, with the path it named. Runs only after the fast writer refused. */
function check(v: unknown, path: string): void {
  if (v === null) return;
  switch (typeof v) {
    case 'boolean': case 'string': return;
    case 'number':
      if (!Number.isFinite(v)) throw new Error(`canonical: non-finite number at ${path}`);
      return;
    case 'object': {
      if (v instanceof Uint8Array) return;
      if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) check(v[i], `${path}[${i}]`); return; }
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new Error(`canonical: non-plain object at ${path}`);
      const rec = v as Record<string, unknown>;
      const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort(cmpKeys);
      for (const k of keys) check(rec[k], `${path}.${k}`);
      return;
    }
    default:
      throw new Error(`canonical: unsupported ${typeof v} at ${path}`);
  }
}

/**
 * Writes `v` into the shared buffer and hands `use` a view of the bytes. The view is valid only during
 * the call: copy it to keep it.
 */
export function withCanonicalBytes<T>(v: unknown, use: (bytes: Uint8Array) => T): T {
  len = 0;
  try {
    try { write(v); } catch (e) {
      if (e !== REFUSED) throw e;
      check(v, '$');
      throw new Error('canonical: refused a value the checker accepts');
    }
    return use(buf.subarray(0, len));
  } finally {
    len = 0;
    // A rare huge value should not pin its buffer for the life of the process.
    if (buf.length > KEEP) { buf = new Uint8Array(START); dv = new DataView(buf.buffer); }
  }
}

const copy = (b: Uint8Array): Uint8Array => b.slice();

export function canonicalBytesOf(v: unknown): Uint8Array {
  return withCanonicalBytes(v, copy);
}
