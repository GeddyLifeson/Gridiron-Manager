// Random streams (J13.1.1). Generator: xoshiro128** 1.1 (Blackman and Vigna, public domain),
// 128-bit state, 32-bit integer operations only. Seeded from a 128-bit key; the key words are mixed
// with SplitMix32-style finalisers so that similar keys give unrelated states. Test vectors from the
// reference C code and from the rand_xoshiro crate are in test/rng.test.ts.

import { dCos, dLog, dSqrt, TWO_PI } from './dmath.ts';

export type Key128 = readonly [number, number, number, number];

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** SplitMix32 finaliser (the mixing step of SplitMix, 32-bit variant using the murmur3 fmix constants). */
function mix32(z: number): number {
  z = (z + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

export class Xoshiro128ss {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  /** Number of raw 32-bit outputs drawn so far. Streams depend only on key and this count (J13.2.1). */
  draws = 0;

  /** Raw state constructor, used by test vectors. Prefer Stream.fromKey. */
  constructor(s0: number, s1: number, s2: number, s3: number) {
    this.s0 = s0 >>> 0; this.s1 = s1 >>> 0; this.s2 = s2 >>> 0; this.s3 = s3 >>> 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 0x9e3779b9;
  }

  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    this.draws++;
    return result;
  }
}

const TWO_POW_26 = 67108864;
const TWO_POW_53 = 9007199254740992;

export class Stream {
  private readonly g: Xoshiro128ss;
  readonly name: string;

  private constructor(name: string, g: Xoshiro128ss) {
    this.name = name;
    this.g = g;
  }

  static fromKey(name: string, key: Key128): Stream {
    const a = mix32(key[0]);
    const b = mix32((key[1] ^ a) >>> 0);
    const c = mix32((key[2] ^ b) >>> 0);
    const d = mix32((key[3] ^ c) >>> 0);
    return new Stream(name, new Xoshiro128ss(a, b, c, d));
  }

  get draws(): number { return this.g.draws; }

  nextU32(): number { return this.g.nextU32(); }

  /** Uniform in [0, 1) with 53 random bits: (a >> 5) * 2^26 + (b >> 6), over 2^53. Uses exactly two raw outputs. */
  uniform(): number {
    const a = this.g.nextU32() >>> 5;
    const b = this.g.nextU32() >>> 6;
    return (a * TWO_POW_26 + b) / TWO_POW_53;
  }

  /** Standard normal by Box-Muller (cosine branch only). Always uses exactly two uniforms (four raw outputs). */
  normal(): number {
    const u1 = 1 - this.uniform(); // (0, 1]
    const u2 = this.uniform();
    return dSqrt(-2 * dLog(u1)) * dCos(TWO_PI * u2);
  }

  chance(p: number): boolean {
    return this.uniform() < p;
  }

  /** Index chosen with probability proportional to weights. Consumes exactly one uniform. */
  pick(weights: readonly number[]): number {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i]!;
    if (!(total > 0)) throw new Error(`pick: weights must sum to a positive number (stream ${this.name})`);
    const r = this.uniform() * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i]!;
      if (r < acc) return i;
    }
    // r can equal total only through rounding; return the last positive weight.
    for (let i = weights.length - 1; i >= 0; i--) if (weights[i]! > 0) return i;
    return weights.length - 1;
  }

  /** Integer in [lo, hi] inclusive. Consumes exactly one uniform. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.uniform() * (hi - lo + 1));
  }
}
