import { describe, expect, it } from 'vitest';
import { decodeTrajectory, sampleFrames, newSample, lastTick, encodeLayout0 } from '../../src/field-view/index.ts';
import { fixturePlay } from './fixtures.ts';

describe('sampling between ticks (I9.1.2, O2.3.4, O6.4.1)', () => {
  const f = decodeTrajectory(fixturePlay().trajectory);
  const s = newSample(f.slotCount);

  it('equals the stored values at every tick boundary', () => {
    for (let t = f.firstTick; t <= lastTick(f); t++) {
      sampleFrames(f, t, s);
      const base = (t - f.firstTick) * f.slotCount;
      for (let k = 0; k < f.slotCount; k++) {
        expect(s.x[k]).toBe(f.x[base + k]);
        expect(s.y[k]).toBe(f.y[base + k]);
        expect(s.headingRad[k]).toBe(f.headingRad[base + k]);
        expect(s.gazeRad[k]).toBe(f.gazeRad[base + k]);
        expect(s.state[k]).toBe(f.state[base + k]);
      }
      expect(s.ballX).toBe(f.ballX[t - f.firstTick]);
    }
  });

  it('is linear between ticks and never leaves the segment', () => {
    for (let t = f.firstTick; t < lastTick(f); t += 0.25) {
      sampleFrames(f, t, s);
      const i0 = Math.floor(t - f.firstTick), fr = t - f.firstTick - i0;
      for (let k = 0; k < f.slotCount; k++) {
        const a = f.x[i0 * f.slotCount + k]!, b = f.x[(i0 + 1) * f.slotCount + k]!;
        expect(s.x[k]).toBeCloseTo(a + (b - a) * fr, 12);
        expect(s.x[k]!).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-12);
        expect(s.x[k]!).toBeLessThanOrEqual(Math.max(a, b) + 1e-12);
      }
    }
  });

  it('never extrapolates: before the first and after the last tick it holds the nearest stored tick', () => {
    sampleFrames(f, f.firstTick - 5, s);
    expect(s.x[0]).toBe(f.x[0]);
    sampleFrames(f, lastTick(f) + 3.7, s);
    expect(s.x[0]).toBe(f.x[(f.tickCount - 1) * f.slotCount]);
    expect(s.tick).toBe(lastTick(f));
  });

  it('turns facings the short way round', () => {
    const still = { x: 0, y: 0, facing: 0, state: 0 };
    const p = (facing: number) => Array.from({ length: 22 }, () => ({ ...still, facing }));
    const ball = { x: 0, y: 0, z: 0, kind: 0, carrier: -1 };
    const g = decodeTrajectory(encodeLayout0(0, [{ players: p(250), ball }, { players: p(6), ball }]));
    sampleFrames(g, 0.5, s);
    // From step 250 to step 6 goes forward 12 steps through 0, so halfway is step 256 = 0.
    expect(Math.abs(Math.sin(s.headingRad[0]!))).toBeLessThan(1e-9);
    expect(Math.cos(s.headingRad[0]!)).toBeCloseTo(1, 9);
  });
});
