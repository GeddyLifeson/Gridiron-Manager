import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  murmur3x86_128, Xoshiro128ss, Stream, dSin, dCos, dExp, dLog, dAtan2, dPow, logistic,
  canonicalBytes, stateHash, streamKey, seedFromNumber, stream, chainNext, CHAIN_GENESIS,
} from '../src/index.ts';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));
const f64 = (h: string) => new DataView(fromHex(h).buffer).getFloat64(0, false);

describe('murmur3 x86_128 (J13.2.1 key hash)', () => {
  it('matches the Python mmh3 package on 96 vectors', () => {
    for (const v of fx('murmur3.json').vectors) {
      expect(murmur3x86_128(fromHex(v.hex), v.seed)).toEqual(v.words);
    }
  });
});

describe('xoshiro128** (J13.1.1)', () => {
  const f = fx('xoshiro128ss.json');
  it('matches rand_xoshiro 0.7.0 reference vectors', () => {
    const g = new Xoshiro128ss(1, 2, 3, 4);
    expect(f.rand_xoshiro_reference.map(() => g.nextU32())).toEqual(f.rand_xoshiro_reference);
  });
  it('matches 1,000 outputs of the compiled reference C code for two seeds', () => {
    const g = new Xoshiro128ss(1, 2, 3, 4);
    expect(f.seed1234.map(() => g.nextU32())).toEqual(f.seed1234);
    const [a, b, c, d] = f.seedB_state;
    const h = new Xoshiro128ss(a, b, c, d);
    expect(f.seedB.map(() => h.nextU32())).toEqual(f.seedB);
  });
});

describe('stream draws (J13.1.1 acceptance)', () => {
  it('uniform, normal and pick consume fixed raw draws', () => {
    const s = Stream.fromKey('t', [1, 2, 3, 4]);
    s.uniform(); expect(s.draws).toBe(2);
    s.normal(); expect(s.draws).toBe(6);
    s.pick([1, 2, 3]); expect(s.draws).toBe(8);
  });
  it('10 million draws: uniform and normal moments within J13 bounds', () => {
    const s = stream(seedFromNumber(20261125), 'battery', [0]);
    const N = 10_000_000;
    let sum = 0, sumSq = 0, lag = 0, prev = s.uniform();
    const bins = new Array(100).fill(0);
    for (let i = 0; i < N; i++) {
      const u = s.uniform();
      bins[Math.floor(u * 100)]++;
      lag += (u - 0.5) * (prev - 0.5);
      prev = u;
    }
    // chi-square, 99 degrees of freedom; 99.9th percentile is about 148.2
    const e = N / 100;
    const chi = bins.reduce((a, o) => a + (o - e) * (o - e) / e, 0);
    expect(chi).toBeLessThan(148.2);
    // serial correlation of consecutive uniforms
    expect(Math.abs(lag / N / (1 / 12))).toBeLessThan(0.002);
    for (let i = 0; i < N; i++) { const z = s.normal(); sum += z; sumSq += z * z; }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.001);
    expect(Math.abs(variance - 1)).toBeLessThan(0.002);
  });
});

describe('stream keys (J13.2.1 acceptance)', () => {
  const seed = seedFromNumber(42);
  it('keys include the stream name, so a new stream never changes another', () => {
    expect(streamKey(seed, 'weather', [1, 1])).not.toEqual(streamKey(seed, 'gust', [1, 1]));
    expect(streamKey(seed, 'weather', [1, 1])).toEqual(streamKey(seed, 'weather', [1, 1]));
  });
  it('no collisions in 1,000,000 contest keys', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000_000; i++) {
      const lo = i % 22, hi = (i * 7) % 53, play = Math.floor(i / 1000);
      seen.add(streamKey(seed, 'contest', [1, play, lo, hi + 100, i % 5 === 0 ? 'block' : 'route', i]).join(','));
    }
    expect(seen.size).toBe(1_000_000);
  });
});

describe('deterministic math accuracy (J13.3.1)', () => {
  const ref = fx('dmath-reference.json').cases;
  const one = { dSin, dCos, dExp, dLog, logistic } as Record<string, (x: number) => number>;
  const two = { dAtan2, dPow } as Record<string, (a: number, b: number) => number>;
  for (const [name, cases] of Object.entries(ref) as [string, [string | string[], string][]][]) {
    it(`${name}: within 1e-12 relative of a 40-digit mpmath reference (${cases.length} cases)`, () => {
      let worst = 0;
      for (const [inp, out] of cases) {
        const got = Array.isArray(inp) ? two[name]!(f64(inp[0]!), f64(inp[1]!)) : one[name]!(f64(inp));
        const want = Number(out);
        const err = want === 0 ? Math.abs(got) : Math.abs((got - want) / want);
        if (err > worst) worst = err;
      }
      expect(worst).toBeLessThan(1e-12);
    });
  }
  it('100,000 inputs per function agree with the platform functions within 1e-12 (second reference)', () => {
    const s = stream(seedFromNumber(1), 'mathcheck', []);
    let worst = 0;
    const rel = (a: number, b: number) => (b === 0 ? Math.abs(a) : Math.abs((a - b) / b));
    for (let i = 0; i < 100_000; i++) {
      const x = (s.uniform() - 0.5) * 200;
      const p = s.uniform() * 50 + 0.01;
      worst = Math.max(worst, rel(dSin(x), Math.sin(x)), rel(dCos(x), Math.cos(x)), rel(dExp(x / 2), Math.exp(x / 2)),
        rel(dLog(p), Math.log(p)), rel(dAtan2(x, p - 25), Math.atan2(x, p - 25)), rel(dPow(p, x / 25), Math.pow(p, x / 25)));
    }
    expect(worst).toBeLessThan(1e-12);
  });
});

describe('canonical bytes and hashes (P1.1.5)', () => {
  it('ignores key order and undefined fields, refuses non-plain data', () => {
    expect(stateHash({ a: 1, b: [1, 2], c: undefined })).toBe(stateHash({ b: [1, 2], a: 1 }));
    expect(() => canonicalBytes({ m: new Map() })).toThrow();
    expect(() => canonicalBytes({ n: NaN })).toThrow();
  });
  it('chain links depend on every field', () => {
    const base = { prev: CHAIN_GENESIS, stateHash: 'aa', logSequence: 1, engineVersion: '1', parameterSetVersion: 'p' };
    const h = chainNext(base);
    expect(chainNext({ ...base, logSequence: 2 })).not.toBe(h);
    expect(chainNext({ ...base, parameterSetVersion: 'q' })).not.toBe(h);
  });
});

import { streamSource, DMATH } from '../src/index.ts';

describe('simulation contract adapters (J13.1.1, J13.3.1)', () => {
  it('streamSource gives the same sequence as stream() and restarts on the same key', () => {
    const seed = seedFromNumber(20260101);
    const src = streamSource(seed);
    const a = src('contest', [1, 2, 10, 20, 'block']);
    const b = stream(seed, 'contest', [1, 2, 10, 20, 'block']);
    const c = src('contest', [1, 2, 10, 20, 'block']);
    const first = a.nextU32();
    expect(first).toBe(b.nextU32());
    expect(c.nextU32()).toBe(first);
    expect(a.draws).toBe(1);
  });
  it('DMATH is the engine math', () => {
    expect(DMATH.sin(0.5)).toBe(dSin(0.5));
    expect(DMATH.exp(1.25)).toBe(dExp(1.25));
    expect(DMATH.logistic(0)).toBe(logistic(0));
  });
});
