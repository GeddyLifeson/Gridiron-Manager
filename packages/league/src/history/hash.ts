// Canonical encoding and the running hash of the event log (X2.1.1 rule 4, X2.1.3 rule 4). Pure: the same
// rows give the same bytes and the same hash on every platform (J13).
import { BITS_PER_HEX_DIGIT, FNV64_OFFSET_BASIS, FNV64_PRIME, FNV_LIMB, HASH_HEX_WIDTH, HEX_RADIX } from './params.ts';

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

const B = FNV_LIMB.bits;
const M = FNV_LIMB.mask;

function limbsOf(hex: string): number[] {
  const w = B / BITS_PER_HEX_DIGIT;
  const out: number[] = [];
  for (let i = hex.length; i > 0; i -= w) out.push(parseInt(hex.slice(Math.max(0, i - w), i), HEX_RADIX));
  return out;
}

/**
 * FNV-1a 64 continuing from a hex state, on four 16-bit limbs (low first). Equal to `fnv64` with BigInt,
 * several times faster; the log hashes every row with it.
 */
export function fnv64Hex(s: string, seedHex: string): string {
  const [a0, a1, a2, a3] = limbsOf(seedHex) as [number, number, number, number];
  let h0 = a0; let h1 = a1; let h2 = a2; let h3 = a3;
  const p = FNV_LIMB.primeLow; const sh = FNV_LIMB.primeShiftBits; const bm = FNV_LIMB.byteMask;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h0 ^= c & M; h1 ^= c >>> B;
    const t0 = h0 * p;
    const t1 = h1 * p + (t0 >>> B);
    const t2 = h2 * p + (t1 >>> B) + ((h0 & bm) << sh);
    const t3 = h3 * p + (t2 >>> B) + (h0 >>> sh) + ((h1 & bm) << sh);
    h0 = t0 & M; h1 = t1 & M; h2 = t2 & M; h3 = t3 & M;
  }
  const w = B / BITS_PER_HEX_DIGIT;
  return [h3, h2, h1, h0].map((x) => x.toString(HEX_RADIX).padStart(w, '0')).join('');
}

/** Next link of a season's chain: hash(previous hash, canonical row). */
export function chainHash(prevHex: string, row: unknown): string {
  return fnv64Hex(`|${canonicalJson(row)}`, prevHex);
}
