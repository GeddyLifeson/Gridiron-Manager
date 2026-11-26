// J8 formulas: the starting values of the leaf, and the direction each grade pushes.
import { describe, expect, it } from 'vitest';
import * as carrier from '../../src/carrier/index.ts';
import { DMATH } from '../../src/index.ts';
import { P } from './helpers.ts';

describe('J8.1.1 vision sets the look-ahead', () => {
  it('horizon is 0.7 + 0.15 z, clipped 0.4 to 1.3', () => {
    expect(carrier.horizonS(0, P)).toBeCloseTo(0.7, 12);
    expect(carrier.horizonS(2, P)).toBeCloseTo(1.0, 12);
    expect(carrier.horizonS(10, P)).toBe(1.3);
    expect(carrier.horizonS(-10, P)).toBe(0.4);
  });
  it('accounts for the nearest 3 + z defenders, clipped 2 to 6', () => {
    expect(carrier.accountedDefenders(0, P)).toBe(3);
    expect(carrier.accountedDefenders(-3, P)).toBe(2);
    expect(carrier.accountedDefenders(5, P)).toBe(6);
  });
  it('lane noise is 1.5 - 0.3 z yards with a floor of 0.3', () => {
    expect(carrier.laneNoiseSdYd(0, P)).toBeCloseTo(1.5, 12);
    expect(carrier.laneNoiseSdYd(2, P)).toBeCloseTo(0.9, 12);
    expect(carrier.laneNoiseSdYd(10, P)).toBe(0.3);
  });
});

describe('J8.2 style, press and read', () => {
  it('temperature is max(0.2, 0.8 - 0.15 z)', () => {
    expect(carrier.laneTemperatureYd(0, P)).toBeCloseTo(0.8, 12);
    expect(carrier.laneTemperatureYd(10, P)).toBe(0.2);
  });
  it('bounce bias is 0.5 edge (1 + 0.2 z), with no bias for no edge', () => {
    expect(carrier.bounceBiasYd(2, 0, P)).toBeCloseTo(1.0, 12);
    expect(carrier.bounceBiasYd(2, 1, P)).toBeCloseTo(1.2, 12);
    expect(carrier.bounceBiasYd(0, 3, P)).toBe(0);
    expect(carrier.bounceBiasYd(-4, 0, P)).toBe(0);
  });
  it('press multiplier is 1 + 0.1 z of patience (with the instruction shift)', () => {
    expect(carrier.pressDurationS(1, 0, P) / carrier.pressDurationS(0, 0, P)).toBeCloseTo(1.1, 12);
    expect(carrier.pressDurationS(0, -1, P)).toBeLessThan(carrier.pressDurationS(0, 0, P));
  });
  it('the read rises with vision and with knowledge of the concept', () => {
    expect(carrier.readChance(1, 0.5, P)).toBeGreaterThan(carrier.readChance(-1, 0.5, P));
    expect(carrier.readChance(0, 0.9, P)).toBeGreaterThan(carrier.readChance(0, 0.2, P));
    expect(carrier.readChance(1, 0.5, P)).toBeGreaterThan(0.85);
  });
});

describe('J8.4 finishing', () => {
  it('awareness is logistic(1.5 + 0.6 z + 0.8 practiced)', () => {
    expect(carrier.awarenessChance(0, false, P)).toBeCloseTo(DMATH.logistic(1.5), 12);
    expect(carrier.awarenessChance(1, true, P)).toBeCloseTo(DMATH.logistic(2.9), 12);
    expect(carrier.doNotScoreChance(0, false, P)).toBeLessThan(carrier.awarenessChance(0, false, P));
  });
  it('competitiveness raises the chance he stays up at the sticks', () => {
    expect(carrier.competesChance(2, P)).toBeGreaterThan(carrier.competesChance(-2, P));
  });
});

describe('J8.6.1 turn-up after the catch', () => {
  it('is zero in stride and 0.2 to 0.5 s otherwise, shorter for better run after catch', () => {
    expect(carrier.turnUpDelayS(true, -3, P)).toBe(0);
    const good = carrier.turnUpDelayS(false, 2, P), poor = carrier.turnUpDelayS(false, -2, P);
    expect(good).toBeGreaterThanOrEqual(0.2); expect(poor).toBeLessThanOrEqual(0.5); expect(good).toBeLessThan(poor);
  });
});

describe('softmax and pick', () => {
  it('ties keep order and probabilities sum to one', () => {
    const out = new Float64Array(3);
    carrier.softmax([1, 1, 0], 3, 0.5, DMATH.exp, out);
    expect(out[0]).toBeCloseTo(out[1]!, 15);
    expect(out[0]! + out[1]! + out[2]!).toBeCloseTo(1, 15);
    expect(carrier.pick(out, 3, 0)).toBe(0);
    expect(carrier.pick(out, 3, 0.9999999)).toBe(2);
  });
});

describe('parameters', () => {
  it('every row is a starting value with a leaf and a calibration note; none claims to be measured', () => {
    for (const r of carrier.PARAMS.params) {
      expect(r.status).toBe('starting');
      expect(['bible', 'assumption']).toContain(r.basis);
      expect(r.leaf).toMatch(/^J\d/);
      expect(r.constrainedBy.length).toBeGreaterThan(0);
      expect(r.value).toBeGreaterThanOrEqual(r.min);
      expect(r.value).toBeLessThanOrEqual(r.max);
    }
  });
});
