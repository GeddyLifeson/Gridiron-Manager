// MA-52: no exposed chance of a possible practice event reaches 0 or 1.
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { PROB_FLOOR } from '@gm/schema';
import { injuryHazard, missChance } from '../../src/practice/index.ts';
import { practice, teamPeriod } from './fixtures.ts';

const ext = fc.oneof(fc.constantFrom(-1e9, -1, 0, 1, 1e9), fc.double({ min: -1e3, max: 1e3, noNaN: true }));
const ok = (p: number) => p >= PROB_FLOOR && p <= 1 - PROB_FLOOR;

describe('practice chances never reach 0 or 1', () => {
  it('injury hazard and report misses', () => {
    fc.assert(fc.property(ext, fc.constantFrom('walk', 'jog', 'thud', 'live'), fc.constantFrom('none', 'shells', 'full'), fc.boolean(), (x, tempo, pads, warm) => {
      const p = practice([teamPeriod(1, { tempo: tempo as 'walk' })], { pads: pads as 'full' });
      return ok(injuryHazard(p, p.periods[0]!, warm, Math.abs(x))) && ok(missChance(x));
    }), { seed: 22, numRuns: 300 });
  });
});
