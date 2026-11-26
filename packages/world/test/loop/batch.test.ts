// G-97: the games step with a batch port. A week handed over at once must leave the same world as the
// same week played one game at a time, whatever order the port plays the games in.
import { describe, expect, it } from 'vitest';
import { batchOf, gamesStepBatch } from '../../src/loop/order.ts';
import type { GameBatchPort, GamePlayed, GameRequest } from '../../src/loop/types.ts';
import { loop, miniWorld, testGamePort, testSchedule, testSystems } from '../fixtures.ts';

function ran(seasons: number, games: loop.StepHandler): loop.LiveWorld {
  const w = miniWorld();
  const sys = testSystems({ games });
  for (let i = 0; i < seasons; i++) loop.runSeason(w, sys, testSchedule);
  return w;
}
const logText = (w: loop.LiveWorld): string => JSON.stringify(w.log.rows());
const same = (a: loop.LiveWorld, b: loop.LiveWorld): void => {
  expect(b.passHash).toBe(a.passHash);
  expect(loop.worldHash(b)).toBe(loop.worldHash(a));
  expect(logText(b)).toBe(logText(a));
  expect(JSON.stringify(b.seasons)).toBe(JSON.stringify(a.seasons));
};

/** TEST DOUBLE: plays the requests last to first, as a pool that finishes in another order would, and answers in request order. */
function backwards(play: loop.GamePort): GameBatchPort {
  return (reqs) => {
    const out = new Array<GamePlayed>(reqs.length);
    for (let i = reqs.length - 1; i >= 0; i--) out[i] = play(reqs[i]!);
    return out;
  };
}

describe('games step with a batch port (G-97)', () => {
  const serial = ran(3, loop.gamesStep(testSchedule, testGamePort()));
  it('leaves the same world as one game at a time', () => {
    same(serial, ran(3, gamesStepBatch(testSchedule, batchOf(testGamePort()))));
  });
  it('leaves the same world when the port plays the week in another order', () => {
    same(serial, ran(3, gamesStepBatch(testSchedule, backwards(testGamePort()))));
  });
  it('hands over the whole week in game id order, each game with its own seed, before any row is stored', () => {
    const w = miniWorld();
    const weeks: GameRequest[][] = [];
    const stored: number[] = [];
    const port: GameBatchPort = (reqs) => { weeks.push([...reqs]); stored.push(reqs[0]!.world.results.length); return batchOf(testGamePort())(reqs); };
    const sys = testSystems({ games: gamesStepBatch(testSchedule, port) });
    loop.runWeek(w, sys); loop.runWeek(w, sys);
    expect(weeks).toHaveLength(2);
    expect(stored).toEqual([0, weeks[0]!.length]);
    for (const reqs of weeks) {
      expect(reqs.length).toBeGreaterThan(1);
      expect(reqs.map((r) => r.game.gameId)).toEqual([...reqs.map((r) => r.game.gameId)].sort((a, b) => a - b));
      expect(new Set(reqs.map((r) => r.seedHex)).size).toBe(reqs.length);
    }
    expect(w.results).toHaveLength(weeks[0]!.length + weeks[1]!.length);
  });
  it('refuses a port that answers the wrong number of games, and stores nothing', () => {
    const w = miniWorld();
    const sys = testSystems({ games: gamesStepBatch(testSchedule, (reqs) => batchOf(testGamePort())(reqs).slice(1)) });
    expect(() => loop.runWeek(w, sys)).toThrow(/games asked/);
    expect(w.results).toHaveLength(0);
  });
});
