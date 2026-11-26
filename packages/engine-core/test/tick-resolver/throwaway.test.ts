// Throwaways on the fixture, all three real modules (J7.5.2). Before this, a throwaway was aimed at catch
// height two yards short of the nearest receiver he could see, so the ball flew on through the defender
// covering him: 14 of 35 throwaways over these 300 dropbacks were intercepted and none reached the ground.
// FIXTURE units and parameters: the bounds guard the mechanism, not a football rate (rates are WP-26's).
import { describe, expect, it } from 'vitest';
import { eventsOf, type PlayInput } from '@gm/schema';
import { availablePlugs, createTickResolver, type QuarterbackPlug } from '../../src/tick-resolver/index.ts';
import { ALL_RULES, ALL_TABLE, CONTENT, playInput } from './support.ts';

const N = 300, BALL_X = 35;
// He rates no throw safe enough (interception ceiling below zero), so he has to get rid of the ball some other way.
// With the fixture as it is the first read is open at 2.3 s on nearly every snap since his rating of a throw matches
// what happens to it (PR 320), and he never throws one away. Routes, coverage and what he sees are untouched.
const NO_THROW: typeof ALL_TABLE = { version: 'test', has: (n) => ALL_TABLE.has(n), num: (n) => (n === 'qb.risk.intCeiling' || n === 'qb.risk.intCeilingTrailing' ? -1 : ALL_TABLE.num(n)) };
const input = (seed: number): PlayInput =>
  ({ ...playInput({ kind: 'pass', seed, playNumber: seed, params: NO_THROW, ballX: BALL_X, detail: 'summary' }), rules: ALL_RULES });
const plugs = availablePlugs();
const resolver = createTickResolver({ content: CONTENT, plugs });
const qbPlug = plugs.find((p) => p.id === 'qb') as QuarterbackPlug;

describe('throwaways on the fixture', () => {
  const tally = new Map<string, number>();
  const add = (k: string): void => { tally.set(k, (tally.get(k) ?? 0) + 1); };
  const n = (k: string): number => tally.get(k) ?? 0;
  const firstSeed: number[] = [];
  it(`resolves ${N} dropbacks`, () => {
    for (let seed = 1; seed <= N; seed++) {
      const r = resolver.simulatePlay(input(seed));
      const rec = qbPlug.quarterback()!.record(), th = rec.throwRecord;
      if (th === null || th.kind !== 'throwaway') continue;
      if (firstSeed.length === 0) firstSeed.push(seed);
      add('throwaway');
      if (rec.groundingHazard !== null) add('hazard');
      const points = eventsOf(r.truth, 'catch_point');
      add(`ball:${th.battedBySlot >= 0 ? 'batted' : points.length > 0 ? points[points.length - 1]!.outcome : 'none'}`);
    }
    if (process.env['GM_TICK_TALLY']) console.log(Object.fromEntries([...tally].sort()));
  }, 240_000);
  it('he throws some away', () => {
    expect(n('throwaway')).toBeGreaterThan(10);
  });
  it('a throwaway is rarely intercepted (a third were before) and most reach the ground', () => {
    expect(n('ball:interception') / n('throwaway')).toBeLessThan(0.1);
    expect(n('ball:grounded') / n('throwaway')).toBeGreaterThan(0.5);
  });
  it('a throwaway rarely carries a grounding hazard (nearly all are in the vicinity of a receiver)', () => {
    // None of 35 when he still had throws to make. With no throw to make he holds it far longer (169 throwaways in
    // 300 dropbacks) and 6 land away from every eligible: J7.5.2 lets him misjudge where an unseen receiver is.
    // With the throwaway answer at 0.2 EP (more throwaways under pressure, 230 here) 13 carry a hazard (5.7%).
    expect(n('hazard') / n('throwaway')).toBeLessThan(0.07);
  });
  it('the same seed throws it away to the same spot', () => {
    const a = resolver.simulatePlay(input(firstSeed[0]!)), thA = qbPlug.quarterback()!.record().throwRecord!;
    const b = resolver.simulatePlay(input(firstSeed[0]!)), thB = qbPlug.quarterback()!.record().throwRecord!;
    expect(thB).toEqual(thA);
    expect(b.truth).toEqual(a.truth);
  });
});
