// D4.3.1 pressure of the moment (pressure.ts).
import { describe, expect, it } from 'vitest';
import { pressureOfMoment } from '../../src/environment/index.ts';
import { P, PRO } from './fixtures.ts';

const sit = (over: Partial<Parameters<typeof pressureOfMoment>[0]> = {}) => ({ period: 4, clockTenths: 600, down: 3, goalToGo: false, score: [20, 20] as const, ...over });

describe('pressureOfMoment (D4.3.1)', () => {
  it('stays inside 0 to 1 and is highest late in a close game on a deciding down', () => {
    expect(pressureOfMoment(sit(), 0, PRO, P)).toBeGreaterThan(0.9);
    expect(pressureOfMoment(sit(), 1, PRO, P)).toBe(1);
    expect(pressureOfMoment(sit({ period: 1, clockTenths: 9000 }), 0, PRO, P)).toBeCloseTo(P.num('environment.pressure.earlyGame'), 12);
  });
  it('falls with the margin to nothing in a decided game, and on an early down', () => {
    const tied = pressureOfMoment(sit(), 0, PRO, P);
    expect(pressureOfMoment(sit({ score: [20, 8] }), 0, PRO, P)).toBeLessThan(tied);
    expect(pressureOfMoment(sit({ score: [40, 8] }), 0, PRO, P)).toBe(0);
    expect(pressureOfMoment(sit({ down: 1 }), 0, PRO, P)).toBeCloseTo(tied * P.num('environment.pressure.earlyDown'), 12);
    expect(pressureOfMoment(sit({ down: 1, goalToGo: true }), 0, PRO, P)).toBeCloseTo(tied, 12);
  });
  it('treats a kick as a deciding snap, overtime as the end of the game, and the crowd as part of the moment', () => {
    expect(pressureOfMoment(sit({ down: null }), 0, PRO, P)).toBeCloseTo(pressureOfMoment(sit(), 0, PRO, P), 12);
    expect(pressureOfMoment(sit({ period: 5, clockTenths: 6000 }), 0, PRO, P)).toBe(1);
    const early = sit({ period: 2, clockTenths: 3000 });
    expect(pressureOfMoment(early, 0.9, PRO, P)).toBeGreaterThan(pressureOfMoment(early, 0, PRO, P));
  });
});
