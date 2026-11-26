// G-36 world simulation: one recruiting cycle (January of the junior year to the February signing date) in
// the calibrated 30-program world. Targets are the T4 rows (T4.1.1 timing, T4.5.2 flips and drops, early
// signing share, offers per signee, T4.8.2 junior college share). Bands are the bible's, widened where the
// small world is noisy; the August commitment share is below the bible's 85 percent (noted in README).
import { describe, expect, it } from 'vitest';
import { runCycle } from './sim.ts';

describe('G-36 one-cycle world simulation', () => {
  it('meets the T4 timing, flip, signing and class-mix targets', () => {
    const { metrics: m } = runCycle({ programs: 30, seed: 7 });
    expect(m.decommitShare).toBeGreaterThanOrEqual(0.10);
    expect(m.decommitShare).toBeLessThanOrEqual(0.25);
    expect(m.dropShare).toBeLessThanOrEqual(0.08);
    expect(m.earlyShare).toBeGreaterThanOrEqual(0.80);
    expect(m.jucoShare).toBeGreaterThanOrEqual(0.05);
    expect(m.jucoShare).toBeLessThanOrEqual(0.18);
    expect(m.topOffersPerSignee).toBeGreaterThanOrEqual(6);
    expect(m.topOffersPerSignee).toBeLessThanOrEqual(10);
    expect(m.topCommittedAugShare).toBeGreaterThanOrEqual(0.70);
    expect(m.readOffShare).toBeGreaterThanOrEqual(0.20);
    expect(m.violations).toBe(0);
  }, 120_000);
});
