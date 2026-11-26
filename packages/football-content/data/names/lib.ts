// Pure helpers for the G-18 name tables: folding, the guard hash and the weighted draw.
// No clock, platform random, file or network (P1.1.1): the draw takes a uniform stream from the caller.

/** Fold one name token for matching: accents removed, lower case, everything but letters and digits dropped. */
export function foldToken(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** D13.5.2 key: folded first name, bar, folded surname. A suffix (Jr., III) is not part of the key. */
export function nameKey(first: string, last: string): string {
  return `${foldToken(first)}|${foldToken(last)}`;
}

/** cyrb53 (public domain, bryc): a 53-bit non-cryptographic hash made from 32-bit integer math only. */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Fixed-width hex form of the guard hash (14 hex digits hold 53 bits). */
export function guardHash(first: string, last: string): string {
  return cyrb53(nameKey(first, last)).toString(16).padStart(14, '0');
}

export const GUARD_HASH_WIDTH = 14;

/** Unpack the guard file's single string of fixed-width hashes into a set. */
export function guardSet(packed: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + GUARD_HASH_WIDTH <= packed.length; i += GUARD_HASH_WIDTH) out.add(packed.slice(i, i + GUARD_HASH_WIDTH));
  return out;
}

export type WeightedList = ReadonlyArray<readonly [string, number]>;

/** Cumulative index for repeated draws from one list. */
export function cumulative(list: WeightedList): { names: string[]; cum: number[]; total: number } {
  const names: string[] = [];
  const cum: number[] = [];
  let total = 0;
  for (const [n, w] of list) {
    total += w;
    names.push(n);
    cum.push(total);
  }
  return { names, cum, total };
}

/** Draw one entry; `u` is a uniform number in [0, 1) from an engine-core stream. */
export function drawWeighted(ix: { names: string[]; cum: number[]; total: number }, u: number): string {
  const x = u * ix.total;
  let lo = 0;
  let hi = ix.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((ix.cum[mid] as number) > x) hi = mid;
    else lo = mid + 1;
  }
  return ix.names[lo] as string;
}
