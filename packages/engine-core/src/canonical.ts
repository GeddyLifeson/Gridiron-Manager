// Canonical byte layout of plain data, used for state hashes (P1.1.5, P5.3.2) and stream keys (J13.2.1).
// Rules: objects are written with keys sorted by UTF-16 code unit order; arrays in order; numbers as
// IEEE 754 float64 little-endian bytes (exact, platform independent); strings as UTF-8 with a length
// prefix. Undefined object fields are skipped (same as absent). Functions, symbols, bigint, Map, Set,
// class instances and non-finite numbers are refused, so state stays plain data (P1.3.2).
//
// The writer lives in canonical-writer.ts (G-97 speed work); test/canonical-reference.test.ts checks its
// bytes against a frozen copy of the plain writer.

import { canonicalBytesOf } from './canonical-writer.ts';

/** The canonical bytes of `v`, as a fresh array. */
export function canonicalBytes(v: unknown): Uint8Array {
  return canonicalBytesOf(v);
}
