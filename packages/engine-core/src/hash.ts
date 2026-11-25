// MurmurHash3 x86_128 (Austin Appleby, public domain), written with 32-bit integer
// operations only so JavaScript, WebAssembly and native builds agree bit for bit (J13.1.1, J13.2.1).
// Verified against the reference C implementation and the Python mmh3 package in test/hash.test.ts.

const C1 = 0x239b961b;
const C2 = 0xab0e9789;
const C3 = 0x38b34ae5;
const C4 = 0xa1e38b93;

function rotl(x: number, r: number): number {
  return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Returns the 128-bit hash as four unsigned 32-bit words [h1, h2, h3, h4]. */
export function murmur3x86_128(data: Uint8Array, seed = 0): [number, number, number, number] {
  const len = data.length;
  const nblocks = len >>> 4;
  let h1 = seed >>> 0;
  let h2 = seed >>> 0;
  let h3 = seed >>> 0;
  let h4 = seed >>> 0;

  const word = (i: number): number =>
    ((data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16) | (data[i + 3]! << 24)) >>> 0);

  for (let b = 0; b < nblocks; b++) {
    const i = b * 16;
    let k1 = word(i);
    let k2 = word(i + 4);
    let k3 = word(i + 8);
    let k4 = word(i + 12);

    k1 = Math.imul(k1, C1); k1 = rotl(k1, 15); k1 = Math.imul(k1, C2); h1 = (h1 ^ k1) >>> 0;
    h1 = rotl(h1, 19); h1 = (h1 + h2) >>> 0; h1 = (Math.imul(h1, 5) + 0x561ccd1b) >>> 0;

    k2 = Math.imul(k2, C2); k2 = rotl(k2, 16); k2 = Math.imul(k2, C3); h2 = (h2 ^ k2) >>> 0;
    h2 = rotl(h2, 17); h2 = (h2 + h3) >>> 0; h2 = (Math.imul(h2, 5) + 0x0bcaa747) >>> 0;

    k3 = Math.imul(k3, C3); k3 = rotl(k3, 17); k3 = Math.imul(k3, C4); h3 = (h3 ^ k3) >>> 0;
    h3 = rotl(h3, 15); h3 = (h3 + h4) >>> 0; h3 = (Math.imul(h3, 5) + 0x96cd1c35) >>> 0;

    k4 = Math.imul(k4, C4); k4 = rotl(k4, 18); k4 = Math.imul(k4, C1); h4 = (h4 ^ k4) >>> 0;
    h4 = rotl(h4, 13); h4 = (h4 + h1) >>> 0; h4 = (Math.imul(h4, 5) + 0x32ac3b17) >>> 0;
  }

  const tail = nblocks * 16;
  let k1 = 0, k2 = 0, k3 = 0, k4 = 0;
  const rem = len & 15;
  /* eslint-disable no-fallthrough */
  switch (rem) {
    case 15: k4 ^= data[tail + 14]! << 16;
    case 14: k4 ^= data[tail + 13]! << 8;
    case 13: k4 ^= data[tail + 12]!;
      k4 = Math.imul(k4, C4); k4 = rotl(k4, 18); k4 = Math.imul(k4, C1); h4 = (h4 ^ k4) >>> 0;
    case 12: k3 ^= data[tail + 11]! << 24;
    case 11: k3 ^= data[tail + 10]! << 16;
    case 10: k3 ^= data[tail + 9]! << 8;
    case 9: k3 ^= data[tail + 8]!;
      k3 = Math.imul(k3, C3); k3 = rotl(k3, 17); k3 = Math.imul(k3, C4); h3 = (h3 ^ k3) >>> 0;
    case 8: k2 ^= data[tail + 7]! << 24;
    case 7: k2 ^= data[tail + 6]! << 16;
    case 6: k2 ^= data[tail + 5]! << 8;
    case 5: k2 ^= data[tail + 4]!;
      k2 = Math.imul(k2, C2); k2 = rotl(k2, 16); k2 = Math.imul(k2, C3); h2 = (h2 ^ k2) >>> 0;
    case 4: k1 ^= data[tail + 3]! << 24;
    case 3: k1 ^= data[tail + 2]! << 16;
    case 2: k1 ^= data[tail + 1]! << 8;
    case 1: k1 ^= data[tail]!;
      k1 = Math.imul(k1, C1); k1 = rotl(k1, 15); k1 = Math.imul(k1, C2); h1 = (h1 ^ k1) >>> 0;
  }

  h1 = (h1 ^ len) >>> 0; h2 = (h2 ^ len) >>> 0; h3 = (h3 ^ len) >>> 0; h4 = (h4 ^ len) >>> 0;
  h1 = (h1 + h2) >>> 0; h1 = (h1 + h3) >>> 0; h1 = (h1 + h4) >>> 0;
  h2 = (h2 + h1) >>> 0; h3 = (h3 + h1) >>> 0; h4 = (h4 + h1) >>> 0;
  h1 = fmix(h1); h2 = fmix(h2); h3 = fmix(h3); h4 = fmix(h4);
  h1 = (h1 + h2) >>> 0; h1 = (h1 + h3) >>> 0; h1 = (h1 + h4) >>> 0;
  h2 = (h2 + h1) >>> 0; h3 = (h3 + h1) >>> 0; h4 = (h4 + h1) >>> 0;
  return [h1, h2, h3, h4];
}

function hex8(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

/** 128-bit hash rendered as 32 hex digits, in the byte order of the reference C output (h1..h4 little-endian words). */
export function hash128Hex(data: Uint8Array, seed = 0): string {
  const [a, b, c, d] = murmur3x86_128(data, seed);
  return [a, b, c, d].map(hex8).join('');
}

/** 64-bit state hash (P1.1.5): first two words of the 128-bit hash, as 16 hex digits. */
export function hash64Hex(data: Uint8Array): string {
  const [a, b] = murmur3x86_128(data, 0);
  return hex8(a) + hex8(b);
}

const encoder = new TextEncoder();
export function utf8(s: string): Uint8Array {
  return encoder.encode(s);
}
