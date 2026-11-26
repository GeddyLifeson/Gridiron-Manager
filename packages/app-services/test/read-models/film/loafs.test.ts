import { describe, expect, it } from 'vitest';
import { loafCandidates } from '../../../src/read-models/film/index.ts';
import { makeSource, backStart, pursue, M_, SNAP_T, WHISTLE_T, CATCH_T, TPS, person } from './fixtures.ts';
import type { PlayOpts } from './fixtures.ts';

function candidates(o: PlayOpts = {}, injured: number[] = []) {
  const src = makeSource(o);
  return loafCandidates({ trajectory: src.trajectory, ticksPerSecond: TPS, sides: src.slots.map((s) => s.side), offenseSide: 0, snapTick: SNAP_T, whistleTick: WHISTLE_T, injured: new Set(injured) });
}

describe('candidate loafs (N1.4.1 rule 4)', () => {
  it('the clean scripted play has none', () => {
    expect(candidates()).toEqual([]);
  });

  it('a: changing speed going to the ball', () => {
    const got = candidates({ override: (s, t, _p, ball) => {
      if (s !== 16 || t < CATCH_T) return null;
      const at = pursue(backStart(16), 0.7, Math.min(t, 27), ball);
      return t <= 27 ? at : { x: at.x + (t - 27) * 0.05, y: at.y };
    } });
    expect(got).toContainEqual(expect.objectContaining({ slot: 16, pattern: 'speedChange' }));
  });

  it('b: passed by a teammate who started farther away', () => {
    const got = candidates({ override: (s, t, _p, ball) => {
      if (t < CATCH_T) return null;
      if (s === 17) return pursue(backStart(17), 0.1, t, ball);
      if (s === 21) return pursue(backStart(21), 3.5, t, ball);
      return null;
    } });
    expect(got).toContainEqual(expect.objectContaining({ slot: 17, pattern: 'passedInPursuit' }));
    expect(got.some((c) => c.slot === 21)).toBe(false);
  });

  it('c: lying on the ground while the ball is live, but not when injured, and not when he gets up in time', () => {
    const down = (until: number): PlayOpts => ({ override: (s, t) => (s === 19 && t >= 5 && t <= until ? { mode: M_('down') } : null) });
    expect(candidates(down(WHISTLE_T))).toContainEqual(expect.objectContaining({ slot: 19, pattern: 'lyingDown' }));
    expect(candidates(down(WHISTLE_T), [19]).some((c) => c.slot === 19)).toBe(false);
    // Knocked down, up within 2 s (15 ticks = 1.5 s), then pursues: no candidate.
    expect(candidates(down(5 + 15)).some((c) => c.slot === 19)).toBe(false);
  });

  it('d: stopping at the pile before the whistle', () => {
    const got = candidates({ override: (s, t) => (s === 20 && t >= 24 ? { x: 58.2, y: 10, mode: M_('run') } : null) });
    expect(got).toContainEqual(expect.objectContaining({ slot: 20, pattern: 'stopAtPile' }));
  });

  it('the side with the ball: stopping a route away from the ball', () => {
    const got = candidates({ override: (s, t) => (s === 9 && t >= 10 ? { x: 45 } : null) });
    expect(got).toContainEqual(expect.objectContaining({ slot: 9, pattern: 'stopBeforeWhistle' }));
    expect(person(9)).toBe(1009);
  });
});
