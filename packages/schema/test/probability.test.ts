// A3.1 ruling 22 (MA-52): nothing possible has exactly zero chance.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PROB_FLOOR, PROB_FLOOR_PARAMS, notImpossible, possible } from '../src/index.ts';

describe('prob.floor (A3.1 ruling 22)', () => {
  it('is a tuning parameter marked as an assumption, starting at 0.0001', () => {
    const row = PROB_FLOOR_PARAMS.params.find((p) => p.name === 'prob.floor')!;
    expect(row.basis).toBe('assumption');
    expect(row.value).toBe(0.0001);
    expect(PROB_FLOOR).toBe(0.0001);
    expect(row.value >= row.min && row.value <= row.max).toBe(true);
  });
  it('possible() never returns 0 or 1, for any input including NaN and infinities', () => {
    fc.assert(fc.property(fc.double(), (x) => {
      const p = possible(x);
      return p >= PROB_FLOOR && p <= 1 - PROB_FLOOR;
    }), { seed: 52, numRuns: 2000 });
    expect(possible(0)).toBe(PROB_FLOOR);
    expect(possible(-3)).toBe(PROB_FLOOR);
    expect(possible(Number.NaN)).toBe(PROB_FLOOR);
    expect(possible(1)).toBe(1 - PROB_FLOOR);
    expect(possible(0.3)).toBe(0.3);
  });
  it('notImpossible() keeps a certain 1 but lifts 0 to the floor', () => {
    expect(notImpossible(0)).toBe(PROB_FLOOR);
    expect(notImpossible(1)).toBe(1);
    expect(notImpossible(2)).toBe(1);
  });
});
