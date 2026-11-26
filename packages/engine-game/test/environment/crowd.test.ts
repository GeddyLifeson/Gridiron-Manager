// J12.6.1 and J12.8.1: the crowd on one play (crowd.ts).
import { describe, expect, it } from 'vitest';
import { Contract } from '@gm/engine-core';
import { QUIET, crowdForPlay, gateNoiseBase, noiseForPlay } from '../../src/environment/index.ts';
import { P, PRO } from './fixtures.ts';

const loud: Contract.Environment = { ...Contract.NEUTRAL_ENVIRONMENT, noiseBase: 0.9 };
const sit = (offense: 0 | 1, down: number | null = 3, score: [number, number] = [0, 0]) => ({ offense, down, score });

describe('crowdForPlay (J12.6.1, J12.8.1)', () => {
  it('visiting offense on third down hears the full level; the home defense hears its share', () => {
    const c = crowdForPlay(loud, sit(1), 'home', PRO, P);
    expect(c.noise).toBeCloseTo(0.9, 12);
    expect(c.unitNoise[0]).toBeCloseTo(0.9, 12);
    expect(c.unitNoise[1]).toBeCloseTo(0.9 * P.num('environment.noise.homeUnitShare'), 12);
    expect(c.venue).toBe('road');
    expect(c.silentCount).toBe(true);
    expect(c.noiseFactor[0]).toBeCloseTo(1 + P.num('environment.noise.roadKnowledgeErrorPerNoise') * 0.9, 12);
    expect(c.familiarityZ).toEqual([0, P.num('environment.home.familiarityZ')]);
  });
  it('home offense: own-offense level, home venue, no silent count, familiarity on the snapping side', () => {
    const c = crowdForPlay(loud, sit(0), 'home', PRO, P);
    expect(c.noise).toBeCloseTo(noiseForPlay(loud, { offenseFavoured: true, down: 3, margin: 0 }, PRO, P), 12);
    expect(c.venue).toBe('home');
    expect(c.silentCount).toBe(false);
    expect(c.noiseFactor).toEqual([1, 1]);
    expect(c.familiarityZ).toEqual([P.num('environment.home.familiarityZ'), 0]);
  });
  it('the margin is the home team\'s: a visitor leading by 21 quiets the crowd (blowout)', () => {
    expect(crowdForPlay(loud, sit(1, 3, [0, 21]), 'home', PRO, P).noise).toBeCloseTo(0.9 * P.num('environment.noise.blowout') * P.num('environment.noise.moodFactor'), 12);
  });
  it('kicks carry noise but never a silent count', () => {
    const c = crowdForPlay(loud, sit(1, null), 'home', PRO, P);
    expect(c.silentCount).toBe(false);
    expect(c.unitNoise[0]).toBeGreaterThan(0);
  });
  it('neutral site: no venue term, no familiarity, both units hear the level', () => {
    const c = crowdForPlay(loud, sit(1), 'neutral', PRO, P);
    expect(c.venue).toBe('neutral');
    expect(c.familiarityZ).toEqual([0, 0]);
    expect(c.unitNoise[0]).toBe(c.unitNoise[1]);
    expect(c.silentCount).toBe(false);
  });
  it('empty stadium (noiseBase 0): no noise anywhere, venue and familiarity remain (J12.8.1 acceptance 2 input)', () => {
    for (const offense of [0, 1] as const) for (const down of [1, 3, null]) {
      const c = crowdForPlay(Contract.NEUTRAL_ENVIRONMENT, sit(offense, down), 'home', PRO, P);
      expect(c.unitNoise).toEqual([0, 0]);
      expect(c.silentCount).toBe(false);
      expect(c.noiseFactor).toEqual([1, 1]);
    }
    expect(crowdForPlay(Contract.NEUTRAL_ENVIRONMENT, sit(1), 'neutral', PRO, P)).toEqual(QUIET);
  });
  it('gate noiseBase by level', () => {
    expect(gateNoiseBase('pro', P)).toBe(P.num('environment.gate.noiseBasePro'));
    expect(gateNoiseBase('college', P)).toBe(P.num('environment.gate.noiseBaseCollege'));
  });
});
