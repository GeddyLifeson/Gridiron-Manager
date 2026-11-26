import { describe, expect, it } from 'vitest';
import { DMATH } from '../../src/index.ts';
import { SLOTS_PER_TEAM } from '@gm/schema';
import { DRAW_TYPES, noHuddleDeliveryChance, planPresnap, presnapParams, relayGarbleChance, relayTimeS, type RelayInput } from '../../src/presnap/index.ts';
import { TABLE, input, offenseInput, ofType, run, world } from './support.ts';

const P = presnapParams(TABLE);
const RELAY: RelayInput = { spottingS: 4.5, decisionS: 6, methodS: 2, spokenS: 2.4 };
const SEEDS = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('I2.1.1 and I2.4.1 the call on its way to the huddle', () => {
  it('garble chance starts at the I2.4.1 value and rises with noise and with the words of a long call', () => {
    expect(relayGarbleChance(0, 6, P)).toBeCloseTo(P['relay.garbleBase']!, 12);
    expect(relayGarbleChance(0.9, 6, P)).toBeGreaterThan(relayGarbleChance(0.2, 6, P));
    expect(relayGarbleChance(0, 14, P)).toBeGreaterThan(relayGarbleChance(0, 6, P));
    expect(relayGarbleChance(5, 6, P)).toBe(relayGarbleChance(1, 6, P));
  });
  it('time is the stages in order; a garbled call is sent again, and the second can be garbled too', () => {
    const clean = relayTimeS(RELAY, 0, 0.1, 0, 0.5, 0.5, DMATH, P);
    expect(clean.repeats).toBe(0);
    expect(clean.totalS).toBeCloseTo(4.5 + 6 + 2 + 2.4, 9);
    const once = relayTimeS(RELAY, 0, 0.1, 0, 0.05, 0.5, DMATH, P), twice = relayTimeS(RELAY, 0, 0.1, 0, 0.05, 0.05, DMATH, P);
    expect(once.repeats).toBe(1); expect(once.totalS).toBeCloseTo(clean.totalS + 4.4, 9);
    expect(twice.repeats).toBe(2); expect(twice.totalS).toBeCloseTo(clean.totalS + 8.8, 9);
    // The lateness of the call is an exponential tail: its median is tail x ln 2.
    expect(relayTimeS(RELAY, 0, 0, 0.5, 1, 1, DMATH, P).totalS - clean.totalS).toBeCloseTo(P['relay.decisionTailS']! * Math.LN2, 6);
    expect(Number.isFinite(relayTimeS(RELAY, 0, 0, 1, 1, 1, DMATH, P).totalS)).toBe(true);
    // Noise slows the relay and the huddle (J12.6.1).
    expect(relayTimeS(RELAY, 0.8, 0, 0, 1, 1, DMATH, P).totalS - clean.totalS).toBeCloseTo(0.8 * P['relay.noiseSlowS']!, 9);
  });
  it('runs off the play clock before the huddle and moves no other draw', () => {
    const base = planPresnap(world({ seed: 5 }), input());
    const withRelay = planPresnap(world({ seed: 5 }), input({ relay: RELAY }));
    expect(base.relayS).toBe(0);
    expect(base.playClockStartTenths).toBe(400);
    expect(withRelay.relayS).toBeGreaterThanOrEqual(14.9);
    expect(withRelay.playClockStartTenths).toBe(400 - Math.round(withRelay.relayS * 10));
    for (const d of DRAW_TYPES) for (let s = 0; s < SLOTS_PER_TEAM; s++) for (let i = 0; i < d.count; i++) expect(withRelay.draws[0].get(d.name, s, i)).toBe(base.draws[0].get(d.name, s, i));
    for (let s = 0; s < 2 * SLOTS_PER_TEAM; s++) expect(withRelay.received[s]).toEqual(base.received[s]);
    // The snap still comes at the tempo's target reading.
    expect(withRelay.playClockAtSnapTenths).toBe(base.playClockAtSnapTenths);
    expect(withRelay.setClockLeftS).toBeCloseTo(withRelay.playClockStartTenths / 10 - withRelay.offenseSetS, 9);
  });
  it('a call that arrives too late is a delay of game, and noise makes it more common (J12.6.1)', () => {
    // A slow caller, so the tail of the distribution is reached within a few hundred seeds.
    const slow: RelayInput = { ...RELAY, decisionS: 18 };
    const delays = (noise: number) => SEEDS(400).filter((seed) => planPresnap(world({ seed }), input({ relay: slow, offense: offenseInput({ noise }) })).fouls.some((f) => f.foulId === 'delay_of_game')).length;
    const quiet = delays(0), loud = delays(0.9);
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet * 1.3);
    const r = run(input({ relay: { ...RELAY, decisionS: 40 } }));
    expect(ofType(r.w, 'foul_committed').map((x) => x.foulId)).toEqual(['delay_of_game']);
    expect(ofType(r.w, 'snap')).toHaveLength(0);
  });
});

describe('J5.1.3 the play call without a huddle', () => {
  it('is near 1 in silence and falls with noise, far less than a call made at the line (J3.6.1)', () => {
    expect(noHuddleDeliveryChance(0, P)).toBeCloseTo(P['nohuddle.deliveryBase']!, 12);
    expect(noHuddleDeliveryChance(0.9, P)).toBeLessThan(noHuddleDeliveryChance(0.2, P));
    expect(noHuddleDeliveryChance(1, P)).toBeGreaterThan(0.99);
    // Misses a game for eleven men over 62.1 no-huddle plays: under 0.5 at home (the unit hears a quarter of the crowd), several times that on the road.
    const perGame = (noise: number) => 11 * (1 - noHuddleDeliveryChance(noise, P)) * 62.1;
    expect(perGame(0.15)).toBeLessThan(1);
    expect(perGame(0.9) / perGame(0.15)).toBeGreaterThan(2);
  });
});
