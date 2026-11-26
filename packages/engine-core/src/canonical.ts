// Canonical byte layout of plain data, used for state hashes (P1.1.5, P5.3.2) and stream keys (J13.2.1).
// Rules: objects are written with keys sorted by UTF-16 code unit order; arrays in order; numbers as
// IEEE 754 float64 little-endian bytes (exact, platform independent); strings as UTF-8 with a length
// prefix. Undefined object fields are skipped (same as absent). Functions, symbols, bigint, Map, Set,
// class instances and non-finite numbers are refused, so state stays plain data (P1.3.2).

import { utf8 } from './hash.ts';

const T_NULL = 0, T_FALSE = 1, T_TRUE = 2, T_NUM = 3, T_STR = 4, T_ARR = 5, T_OBJ = 6, T_BYTES = 7;

// Speed (P6.3.1, G-97): one grow-only buffer is reused across calls (the result is always a fresh copy),
// strings are written byte by byte when they are ASCII and through the encoder otherwise, object keys'
// UTF-8 bytes are cached, and the error path is built only when an error is thrown. The bytes are the
// same as the plain layout above; test/canonical-reference.test.ts checks that against a frozen copy.
class Writer {
  buf = new Uint8Array(4096);
  len = 0;
  dv = new DataView(this.buf.buffer);

  ensure(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
    this.dv = new DataView(next.buffer);
  }
  byte(b: number): void { this.ensure(1); this.buf[this.len++] = b; }
  u32(n: number): void { this.ensure(4); this.dv.setUint32(this.len, n >>> 0, true); this.len += 4; }
  f64(n: number): void { this.ensure(8); this.dv.setFloat64(this.len, n, true); this.len += 8; }
  bytes(b: Uint8Array): void { this.ensure(b.length); this.buf.set(b, this.len); this.len += b.length; }
  /** Length-prefixed UTF-8. ASCII is copied directly; anything else goes through the encoder, so the bytes match utf8(s). */
  str(s: string): void {
    const n = s.length;
    let ascii = true;
    for (let i = 0; i < n; i++) if (s.charCodeAt(i) > 0x7f) { ascii = false; break; }
    if (!ascii) { const b = utf8(s); this.u32(b.length); this.bytes(b); return; }
    this.ensure(4 + n);
    this.dv.setUint32(this.len, n, true);
    let at = this.len + 4;
    const buf = this.buf;
    for (let i = 0; i < n; i++) buf[at++] = s.charCodeAt(i);
    this.len = at;
  }
  out(): Uint8Array { return this.buf.slice(0, this.len); }
}

function cmpKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Sorted key order, cached by object shape. State holds thousands of objects with the same keys in the
 * same insertion order (one per player), so the sort is done once per shape. A hit is confirmed key by
 * key against the stored insertion order, so a different object can never borrow another's order.
 */
const SHAPE_CACHE_CAP = 4096;
const shapeCache = new Map<string, { readonly src: readonly string[]; readonly sorted: readonly string[] }>();
function sortedKeys(keys: string[]): readonly string[] {
  const n = keys.length;
  if (n < 2) return keys;
  let inOrder = true;
  for (let i = 1; i < n; i++) if (keys[i - 1]! > keys[i]!) { inOrder = false; break; }
  if (inOrder) return keys;
  const id = `${n}\u0000${keys[0]!}\u0000${keys[n - 1]!}`;
  const hit = shapeCache.get(id);
  if (hit !== undefined && hit.src.length === n) {
    let same = true;
    for (let i = 0; i < n; i++) if (hit.src[i] !== keys[i]) { same = false; break; }
    if (same) return hit.sorted;
  }
  const sorted = [...keys].sort(cmpKeys);
  if (shapeCache.size >= SHAPE_CACHE_CAP) shapeCache.clear();
  shapeCache.set(id, { src: keys, sorted });
  return sorted;
}

/** Cached length-prefixed key bytes. Keys are field names and ids, so the set is small; it is cleared if it grows past the cap. */
const KEY_CACHE_CAP = 8192;
const keyCache = new Map<string, Uint8Array>();
function keyBytes(k: string): Uint8Array {
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

/** Path segments of the value being written; joined only to name the place of an error. */
const pathStack: (string | number)[] = [];
function pathText(): string {
  let p = '$';
  for (const seg of pathStack) p += typeof seg === 'number' ? `[${seg}]` : `.${seg}`;
  return p;
}

function write(w: Writer, v: unknown): void {
  if (v === null) { w.byte(T_NULL); return; }
  switch (typeof v) {
    case 'boolean': w.byte(v ? T_TRUE : T_FALSE); return;
    case 'number':
      if (!Number.isFinite(v)) throw new Error(`canonical: non-finite number at ${pathText()}`);
      w.byte(T_NUM); w.f64(Object.is(v, -0) ? 0 : v); return;
    case 'string': w.byte(T_STR); w.str(v); return;
    case 'object': {
      if (v instanceof Uint8Array) { w.byte(T_BYTES); w.u32(v.length); w.bytes(v); return; }
      if (Array.isArray(v)) {
        w.byte(T_ARR); w.u32(v.length);
        const depth = pathStack.length;
        pathStack.push(0);
        for (let i = 0; i < v.length; i++) { pathStack[depth] = i; write(w, v[i]); }
        pathStack.length = depth;
        return;
      }
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new Error(`canonical: non-plain object at ${pathText()}`);
      const rec = v as Record<string, unknown>;
      const all = Object.keys(rec);
      const keys: string[] = [];
      for (let i = 0; i < all.length; i++) if (rec[all[i]!] !== undefined) keys.push(all[i]!);
      const order = sortedKeys(keys);
      w.byte(T_OBJ); w.u32(order.length);
      const depth = pathStack.length;
      pathStack.push('');
      for (let i = 0; i < order.length; i++) {
        const k = order[i]!;
        w.bytes(keyBytes(k));
        pathStack[depth] = k;
        write(w, rec[k]);
      }
      pathStack.length = depth;
      return;
    }
    default:
      throw new Error(`canonical: unsupported ${typeof v} at ${pathText()}`);
  }
}

const shared = new Writer();
const SHARED_KEEP = 1 << 22;

export function canonicalBytes(v: unknown): Uint8Array {
  const w = shared;
  w.len = 0;
  pathStack.length = 0;
  try {
    write(w, v);
    return w.out();
  } finally {
    w.len = 0;
    pathStack.length = 0;
    // A rare huge value should not pin its buffer for the life of the process.
    if (w.buf.length > SHARED_KEEP) { w.buf = new Uint8Array(4096); w.dv = new DataView(w.buf.buffer); }
  }
}
