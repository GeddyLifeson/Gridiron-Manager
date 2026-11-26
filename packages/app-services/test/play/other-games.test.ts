// The week's other games off the main thread (unbuilt-work item 15): a step played through a pool must reach
// the same season hash chain and the same film as the step played in place, whatever order the workers
// finish in; progress counts every game; bad results are refused.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { describe, it, expect } from 'vitest';
import { season as seasons } from '@gm/world';
import {
  SeasonPlay, inlinePool, workerPool, serveWeekWorker,
  type PoolWorker, type WeekProgress, type OtherGameResult,
} from '../../src/play/index.ts';

const ROOT = resolvePath(import.meta.dirname, '../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const CONTENT: seasons.LeagueContent = {
  proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
  college: read('packages', 'football-content', 'data', 'world', 'college.json'),
  proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
  collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
};
const SEED = '3a5c7e9b1d2f4608';
// The reference resolver keeps whole weeks fast (a tick-engine week is minutes); pool jobs carry the season's
// resolver, so the workers play with it too.
const FAST = 'reference' as const;

function proPlay(): SeasonPlay {
  const built = seasons.buildSeason(CONTENT, 'pro_2026', { season: 2026, seedHex: SEED });
  return SeasonPlay.start(CONTENT, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: SEED, seatTeamKey: built.spec.teams[0]!.key, resolver: FAST });
}

/**
 * An in-process stand-in for a Web Worker: the real worker handler (`serveWeekWorker`) behind a message
 * boundary that structured-clones like postMessage and answers after a delay that differs per worker and per
 * game, so results arrive out of job order.
 */
function fakeWorker(index: number, log: { posted: number }): PoolWorker {
  const scope: { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null } = { postMessage: () => {}, onmessage: null };
  serveWeekWorker(scope);
  let n = 0;
  const w: PoolWorker = {
    onmessage: null,
    postMessage(m) {
      log.posted++;
      const data = structuredClone(m);
      const delay = ((index * 7 + n++ * 13) % 5) * 3;
      setTimeout(() => {
        scope.postMessage = (reply) => { const r = structuredClone(reply); setTimeout(() => w.onmessage?.({ data: r }), (index * 5) % 4); };
        scope.onmessage!({ data });
      }, delay);
    },
    terminate() { scope.onmessage = null; },
  };
  return w;
}

describe('week pool', () => {
  it('pro: a delegated week played in a pool reaches the same chain and film as in place', async () => {
    const here = proPlay();
    here.delegateGame();

    const log = { posted: 0 };
    let k = 0;
    const pool = workerPool(() => fakeWorker(k++, log), 3);
    const pooled = proPlay();
    const progress: WeekProgress[] = [];
    const jobs = pooled.stepJobs({ seat: true });
    await pooled.delegateGameIn(pool, (p) => progress.push(p));
    pool.dispose();

    expect(pooled.state.chain).toBe(here.state.chain);
    expect(pooled.state.games.map((g) => g.outcome.stateHash)).toEqual(here.state.games.map((g) => g.outcome.stateHash));
    expect(JSON.stringify(pooled.film.save())).toBe(JSON.stringify(here.film.save()));
    expect(pooled.save().seatOutcomes).toEqual(here.save().seatOutcomes);
    // Every game of the week went through the pool (the seat's too), and progress counted each one.
    expect(log.posted).toBe(jobs.length);
    expect(jobs.length).toBe(here.state.games.length);
    expect(progress[0]).toEqual({ done: 0, total: jobs.length });
    expect(progress.map((p) => p.done)).toEqual([...Array(jobs.length + 1).keys()]);
  }, 120_000);

  it('college: advancing through byes to the seat game in the inline pool equals the plain advance', async () => {
    const built = seasons.buildSeason(CONTENT, 'college_2026', { season: 2026, seedHex: SEED });
    // A seat whose first game is not in the opening step, so the advance plays whole weeks without it.
    const first = Math.min(...built.spec.fixtures.map((f) => f.week));
    const seat = built.spec.teams.find((t) => !built.spec.fixtures.some((f) => f.week === first && (f.home === t.id || f.away === t.id)))!;
    const make = () => SeasonPlay.start(CONTENT, { ruleSetId: 'college_2026', seasonYear: 2026, seedHex: SEED, seatTeamKey: seat.key, resolver: FAST });
    const here = make();
    here.advanceToGame();
    const pooled = make();
    const batches: number[] = [];
    await pooled.advanceToGameIn(inlinePool(), (p) => { if (p.done === p.total) batches.push(p.total); });
    expect(batches.length).toBeGreaterThan(0);
    expect(pooled.state.chain).toBe(here.state.chain);
    expect(pooled.state.week).toBe(here.state.week);
    expect(pooled.nextSeatGame()?.context.fixture.gameId).toBe(here.nextSeatGame()?.context.fixture.gameId);
    expect(JSON.stringify(pooled.film.save())).toBe(JSON.stringify(here.film.save()));
  }, 300_000);

  it('refuses a result for a game outside the step or with another seed, and a failed game fails the batch', async () => {
    const play = proPlay();
    const [job] = play.stepJobs();
    const fake = (gameId: number, seedHex: string): OtherGameResult => ({ gameId, seedHex, outcome: { points: [0, 0], touchdowns: [0, 0], overtime: false, stateHash: '', plays: 0, lines: [] }, film: null as never });
    expect(() => play.supply([fake(999_999, job!.seedHex)])).toThrow(/not in the coming step/);
    expect(() => play.supply([fake(job!.fixture.gameId, '0000000000000000')])).toThrow(/seed/);

    const broken: PoolWorker = {
      onmessage: null,
      postMessage(m) { const { id } = m as { id: number }; setTimeout(() => broken.onmessage?.({ data: { id, kind: 'error', message: 'boom' } }), 0); },
      terminate() {},
    };
    const pool = workerPool(() => broken, 1);
    await expect(pool.run(play.stepJobs())).rejects.toThrow(/boom/);
    // The pool is free again after a failed batch.
    await expect(pool.run([])).resolves.toEqual([]);
  });
});
