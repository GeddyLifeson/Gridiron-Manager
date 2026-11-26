import { describe, expect, it } from 'vitest';
import { bench, goTo, slotPlay } from './helpers.ts';

const D = 15; // a defender slot (side 1 of the ball)

describe('D9.4.1 knowledge of a roster with no install record', () => {
  const knowledgeErrors = (context: Parameters<ReturnType<typeof bench>['ai']['setPlay']>[1], plays = 20000) => {
    const b = bench();
    b.plays[D] = slotPlay(goTo('zoneDrop', 12, 5));
    b.views[D]!.at(5, 5);
    b.ai.setPlay(b.plays, context);
    let k = 0;
    for (let n = 1; n <= plays; n++) { b.play(n); if (b.ai.errorOf(D)?.cause === 'knowledge') k++; }
    return k / plays;
  };
  it('draws no knowledge error when neither the player nor the play context holds a level', () => {
    expect(knowledgeErrors({})).toBe(0);
  });
  it('reads the context default at the D9.4.1 rate, for his side of the ball, and the road noise factor multiplies it', () => {
    // 0.5 x (1 - 80/100)^2 = 0.02 an assignment.
    const r = knowledgeErrors({ knowledgeDefault: [100, 80] });
    expect(r).toBeGreaterThan(0.017); expect(r).toBeLessThan(0.023);
    expect(knowledgeErrors({ knowledgeDefault: [80, 100] })).toBe(0);
    const loud = knowledgeErrors({ knowledgeDefault: [100, 80], noiseFactor: [1, 1.5] });
    expect(loud / r).toBeGreaterThan(1.3); expect(loud / r).toBeLessThan(1.7);
  });
  it('a player with his own item for the concept keeps it', () => {
    const b = bench();
    b.plays[D] = slotPlay(goTo('zoneDrop', 12, 5));
    b.views[D]!.at(5, 5);
    b.world.slots[D]!.player.gameDay.knowledge['c'] = 100;
    b.ai.setPlay(b.plays, { knowledgeDefault: [20, 20] });
    for (let n = 1; n <= 500; n++) { b.play(n); expect(b.ai.errorOf(D)?.cause).not.toBe('knowledge'); }
  });
});

describe('J5.1.3 a player the call never reached', () => {
  it('plays a communication error of J4.5.3 on that play, without a second event on the record, and it clears with the next play', () => {
    const b = bench();
    b.plays[D] = slotPlay(goTo('zoneDrop', 12, 5));
    b.views[D]!.at(5, 5);
    b.ai.setPlay(b.plays, {});
    b.ai.setMissedCalls([D]);
    b.play(1, 3);
    const err = b.ai.errorOf(D);
    expect(err?.cause).toBe('communication');
    // The pre-snap phase has put the event on the record already (J5.1.3); the deviation row is the player AI's.
    expect(b.world.events.filter((e) => e.type === 'mental_error')).toHaveLength(0);
    expect(b.ai.deviations().filter((r) => r.kind !== 'accident')).toHaveLength(1);
    b.ai.setPlay(b.plays, {});
    b.play(2, 3);
    expect(b.ai.errorOf(D)?.cause).not.toBe('communication');
  });
});
