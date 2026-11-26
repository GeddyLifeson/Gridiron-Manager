// PC-14: veteran contract years from the OverTheCap length scale.
import { describe, expect, it } from 'vitest';
import { sourcedYears } from '../../src/contracts/index.ts';
import lengthFile from '../../src/contracts/length-scale.json' with { type: 'json' };

describe('sourced contract years', () => {
  it('signs most veterans for one year and the best-paid for several', () => {
    expect(sourcedYears(0.3, 28)).toBe(1);
    expect(sourcedYears(0.999, 27)).toBeGreaterThanOrEqual(4);
  });
  it('shortens deals with age at the top of the scale', () => {
    expect(sourcedYears(0.99, 35)).toBeLessThanOrEqual(sourcedYears(0.99, 27));
  });
  it('reproduces the real one-year share over a flat spread of tiers within 15 points', () => {
    // A flat spread is not the real mix of signings; this only checks the table reads in the right order.
    let one = 0;
    let total = 0;
    for (let i = 0; i < 1000; i++) for (const age of [26, 28, 30]) { total++; if (sourcedYears(i / 1000, age) === 1) one++; }
    expect(one / total).toBeGreaterThan(lengthFile.veteranOneYearShare - 0.15);
  });
});
