// Canonical encoding and the running hash of the event log (X2.1.1 rule 4, X2.1.3 rule 4). Pure: the same
// rows give the same bytes and the same hash on every platform (J13).
import { BITS_PER_HEX_DIGIT, FNV64_OFFSET_BASIS, FNV64_PRIME, HASH_HEX_WIDTH, HEX_RADIX } from './params.ts';

const MASK64 = (BigInt(1) << BigInt(HASH_HEX_WIDTH * BITS_PER_HEX_DIGIT)) - BigInt(1);

/** JSON with object keys sorted at every depth. Arrays keep their order. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

const ENCODER = new TextEncoder();

/** Bytes of a string as UTF-8. */
export function utf8Length(s: string): number {
  return ENCODER.encode(s).length;
}

/** FNV-1a 64 over the UTF-16 code units of `s`, continuing from `seed`. */
export function fnv64(s: string, seed: bigint = FNV64_OFFSET_BASIS): bigint {
  let h = seed;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * FNV64_PRIME) & MASK64;
  }
  return h;
}

export function toHex(h: bigint): string {
  return h.toString(HEX_RADIX).padStart(HASH_HEX_WIDTH, '0');
}

export const EMPTY_SEASON_HASH = toHex(FNV64_OFFSET_BASIS);

/** Next link of a season's chain: hash(previous hash, canonical row). */
export function chainHash(prevHex: string, row: unknown): string {
  return toHex(fnv64(`${prevHex}|${canonicalJson(row)}`));
}
