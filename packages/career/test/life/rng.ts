// Seeded test stream (mulberry32). Tests only; the game passes an engine-core stream.
import type { LifeRandom } from '../../src/life/index.ts';
export function rng(seed: number): LifeRandom & { draws: number } {
  let a = seed >>> 0;
  const r = {
    draws: 0,
    uniform(): number {
      r.draws++;
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
  return r;
}
