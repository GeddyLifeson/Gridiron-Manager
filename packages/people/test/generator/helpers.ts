// Test harness: binds the generator's injected randomness to @gm/engine-core's keyed streams and DMATH,
// as the world layer will (tests may import any core package, P1.2.2).
import { DMATH, stream, deriveSeed, seedFromNumber, seedToHex } from '@gm/engine-core';
import type { GeneratorRandom, PlayerRequest, Talent } from '../../src/generator/index.ts';

export function rng(worldSeed = 20261126): GeneratorRandom {
  const seed = seedFromNumber(worldSeed);
  return {
    open: (name, scope) => stream(seed, name, scope),
    seedHex: (name, scope) => seedToHex(deriveSeed(seed, name, scope)),
    math: DMATH,
  };
}

export function req(position: string, slotIndex: number, over: Partial<PlayerRequest> = {}): PlayerRequest {
  const talent: Talent = { kind: 'pro_entrant' };
  return {
    personId: 1000 + slotIndex, position, ageYears: 23, seasonYear: 2030, talent,
    classKey: { classYear: 2030, classType: 'test', slotIndex }, group: 'pro_player', homeRegion: 'Generated Region', hometown: null,
    ...over,
  };
}

export function corr(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; syy += (ys[i]! - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}

export function quantile(xs: readonly number[], p: number): number {
  const s = xs.slice().sort((a, b) => a - b);
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.min(s.length - 1, lo + 1);
  return s[lo]! + (h - lo) * (s[hi]! - s[lo]!);
}
