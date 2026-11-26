// The rig's random source: an engine-core stream per target and seed, so every run is replayable.
import { seedFromHex, stream } from '@gm/engine-core';
import type { Rnd } from './types.ts';

export function rndFor(seedHex: string, target: string, scope: readonly (string | number)[] = []): Rnd {
  const s = stream(seedFromHex(seedHex), 'breaktest', [target, ...scope]);
  return {
    uniform: () => s.uniform(),
    int: (lo, hi) => s.int(lo, hi),
    chance: (p) => s.uniform() < p,
    pick: <T>(xs: readonly T[]): T => xs[s.int(0, xs.length - 1)]!,
  };
}

/** A per-seed derived hex seed (16 digits). */
export function deriveSeed(seedHex: string, n: number): string {
  let h = BigInt(`0x${seedHex}`) ^ BigInt(n * 0x9e37 + 1);
  h = (h * 0x9e3779b97f4a7c15n + 0x632be59bd9b4e019n) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, '0');
}
