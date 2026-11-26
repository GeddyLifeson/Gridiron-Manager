// Canonical byte layout of plain data, used for state hashes (P1.1.5, P5.3.2) and stream keys (J13.2.1).
// Rules: objects are written with keys sorted by UTF-16 code unit order; arrays in order; numbers as
// IEEE 754 float64 little-endian bytes (exact, platform independent); strings as UTF-8 with a length
// prefix. Undefined object fields are skipped (same as absent). Functions, symbols, bigint, Map, Set,
// class instances and non-finite numbers are refused, so state stays plain data (P1.3.2).

import { utf8 } from './hash.ts';

const T_NULL = 0, T_FALSE = 1, T_TRUE = 2, T_NUM = 3, T_STR = 4, T_ARR = 5, T_OBJ = 6, T_BYTES = 7;

class Writer {
  private buf = new Uint8Array(256);
  private len = 0;
  private dv = new DataView(this.buf.buffer);

  private ensure(n: number): void {
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
  out(): Uint8Array { return this.buf.slice(0, this.len); }
}

function cmpKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function write(w: Writer, v: unknown, path: string): void {
  if (v === null) { w.byte(T_NULL); return; }
  switch (typeof v) {
    case 'boolean': w.byte(v ? T_TRUE : T_FALSE); return;
    case 'number':
      if (!Number.isFinite(v)) throw new Error(`canonical: non-finite number at ${path}`);
      w.byte(T_NUM); w.f64(Object.is(v, -0) ? 0 : v); return;
    case 'string': { const b = utf8(v); w.byte(T_STR); w.u32(b.length); w.bytes(b); return; }
    case 'object': {
      if (v instanceof Uint8Array) { w.byte(T_BYTES); w.u32(v.length); w.bytes(v); return; }
      if (Array.isArray(v)) {
        w.byte(T_ARR); w.u32(v.length);
        for (let i = 0; i < v.length; i++) write(w, v[i], `${path}[${i}]`);
        return;
      }
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new Error(`canonical: non-plain object at ${path}`);
      const rec = v as Record<string, unknown>;
      const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort(cmpKeys);
      w.byte(T_OBJ); w.u32(keys.length);
      for (const k of keys) {
        const kb = utf8(k); w.u32(kb.length); w.bytes(kb);
        write(w, rec[k], `${path}.${k}`);
      }
      return;
    }
    default:
      throw new Error(`canonical: unsupported ${typeof v} at ${path}`);
  }
}

export function canonicalBytes(v: unknown): Uint8Array {
  const w = new Writer();
  write(w, v, '$');
  return w.out();
}
