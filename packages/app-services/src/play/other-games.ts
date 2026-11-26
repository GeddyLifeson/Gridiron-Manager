// The week's other games off the main thread (P2.1.2, unbuilt-work item 15). Every step of the season the
// app plays the games the seat does not call: about 16 pro or 65 college real games, each a few hundred
// milliseconds, which would freeze the screen if they ran where the screen is drawn. They run in a pool of
// Web Workers instead, and the screen shows progress meanwhile.
//
// One job function plays a game (the real game, chart caller on both sides), takes its outcome and packs its
// film. The same function runs in the calling thread (`inlinePool`, tests, a host with no workers) and in
// every worker (`serveWeekWorker`), so where a game was played cannot change what it produced: a game is a
// pure function of its fixture, seed and rule set (J13.2.1). Results come back in job order, whatever order
// the workers finish in, and the season consumes them by game id, so the season hash does not depend on the
// pool (Q1.3.1). Borrowed from headless week-pool (job runner per rule set, one runner per worker) and
// season-worker (message protocol); those are synchronous Node pools, this one is the browser's async one.
import { season as seasons } from '@gm/world';
import { field } from '@gm/engine-core';
import { stats } from '@gm/engine-game';
import { ep } from '@gm/models';
import type { GameInput, PlayRecord } from '@gm/schema';
import { packFilm, type PackedGame } from '../week-loop/film.ts';

type GameContext = seasons.GameContext;
type GameOutcome = seasons.GameOutcome;

/** One game the seat does not call, as plain data: it crosses the worker boundary unchanged. */
export interface OtherGameJob {
  readonly ruleSetId: string;
  readonly season: number;
  readonly fixture: seasons.Fixture;
  readonly seedHex: string;
  /** Play resolver; absent for the real game's default (the tick engine). */
  readonly resolver?: seasons.RealResolver;
}

/** What a job gives back: the season's outcome and the game's packed film (opponent scouting reads it). */
export interface OtherGameResult {
  readonly gameId: number;
  readonly seedHex: string;
  readonly outcome: GameOutcome;
  readonly film: PackedGame;
}

export function jobOfContext(ctx: GameContext, resolver?: seasons.RealResolver): OtherGameJob {
  return { ruleSetId: ctx.ruleSetId, season: ctx.season, fixture: ctx.fixture, seedHex: ctx.seedHex, ...(resolver ? { resolver } : {}) };
}

/** The real game and what a played game is read with, for one rule set. */
export interface GameKit {
  readonly port: ReturnType<typeof seasons.realGamePort>;
  readonly geometry: ReturnType<typeof field.fieldGeometry>;
  readonly statsModule: ReturnType<typeof stats.createStatsModule>;
  /** N2.2.3 coaching success shares (the starting definition; the user's own choice is not in the season yet). */
  readonly success: { readonly firstDownShare: number; readonly secondDownShare: number; readonly lateDownShare: number };
}

export function createGameKit(ruleSetId: string, resolver?: seasons.RealResolver): GameKit {
  const port = seasons.realGamePort({ ruleSetId, ...(resolver ? { resolver } : {}) });
  const geometry = field.fieldGeometry(port.game.rules);
  const statsModule = stats.createStatsModule({ geometry, params: port.game.params });
  const d = ep.defaultDefinitions().success;
  if (d.kind !== 'coaching') throw new Error('season session: the starting success definition is not the coaching one');
  return { port, geometry, statsModule, success: { firstDownShare: d.firstDownShare, secondDownShare: d.secondDownShare, lateDownShare: d.lateDownShare } };
}

/** Packs one game's film (week-loop/film.ts) from its records. */
export function filmOf(kit: GameKit, job: Pick<OtherGameJob, 'season' | 'fixture'>, records: readonly PlayRecord[]): PackedGame {
  const f = job.fixture;
  return packFilm(records, { gameId: f.gameId, season: job.season, week: f.week, phase: f.phase, teams: [f.home, f.away], geometry: kit.geometry, success: kit.success });
}

/** Plays one game with a kit: its input exactly as the season builds it, its outcome and its film. */
export function playWithKit(kit: GameKit, job: OtherGameJob): OtherGameResult {
  const input: GameInput = seasons.fixtureInput(kit.port.game, job.fixture, job.seedHex);
  const res = kit.port.game.simulate(input);
  return {
    gameId: job.fixture.gameId, seedHex: job.seedHex,
    outcome: seasons.outcomeOf(kit.port.game, job.fixture, input, res, kit.statsModule),
    film: filmOf(kit, job, res.records),
  };
}

/** The job function: one kit per rule set, built on first use and kept (a worker plays many games). */
export function createOtherGameRunner(): (job: OtherGameJob) => OtherGameResult {
  const kits = new Map<string, GameKit>();
  return (job) => {
    const key = `${job.ruleSetId}|${job.resolver ?? ''}`;
    let kit = kits.get(key);
    if (!kit) { kit = createGameKit(job.ruleSetId, job.resolver); kits.set(key, kit); }
    return playWithKit(kit, job);
  };
}

/** Progress of a batch: games finished and games asked. */
export interface WeekProgress { readonly done: number; readonly total: number }

/** Plays a batch of games somewhere and gives the results back in job order. */
export interface WeekPool {
  run(jobs: readonly OtherGameJob[], onProgress?: (p: WeekProgress) => void): Promise<OtherGameResult[]>;
  /** Workers in the pool (1 for the inline pool). */
  readonly size: number;
  dispose(): void;
}

/**
 * The pool with no workers: the games run one after another in the calling thread, yielding between games
 * through `pause` (the host's macrotask, so a screen still repaints; a resolved promise by default).
 */
export function inlinePool(o: { readonly pause?: () => Promise<void> } = {}): WeekPool {
  const run = createOtherGameRunner();
  const pause = o.pause ?? (() => Promise.resolve());
  return {
    size: 1,
    async run(jobs, onProgress) {
      const out: OtherGameResult[] = [];
      onProgress?.({ done: 0, total: jobs.length });
      for (const job of jobs) {
        out.push(run(job));
        onProgress?.({ done: out.length, total: jobs.length });
        await pause();
      }
      return out;
    },
    dispose() {},
  };
}

/** A worker as the pool sees it (the DOM Worker, or anything with the same members). */
export interface PoolWorker {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror?: ((e: unknown) => void) | null;
  terminate(): void;
}

/** Worker protocol: the pool sends a job, the worker answers with its result or an error. */
export type WorkerRequest = { readonly id: number; readonly job: OtherGameJob };
export type WorkerReply =
  | { readonly id: number; readonly kind: 'done'; readonly result: OtherGameResult }
  | { readonly id: number; readonly kind: 'error'; readonly message: string };

/**
 * A pool of `size` workers made by `spawn`. Each worker takes the next waiting game as soon as it is free
 * (games differ in length, so a fixed split would leave workers idle). Results go to their job's slot, so
 * the order is the job order whatever order they finish in. One batch at a time; a failed game fails the
 * batch, and the workers stay up for the next one.
 */
export function workerPool(spawn: () => PoolWorker, size: number): WeekPool {
  if (!Number.isInteger(size) || size < 1) throw new Error(`week pool: size ${String(size)} is not a whole number of workers`);
  const workers: PoolWorker[] = [];
  let busy = false;
  let nextId = 1;
  const ensure = () => { while (workers.length < size) workers.push(spawn()); };
  return {
    size,
    run(jobs, onProgress) {
      if (busy) return Promise.reject(new Error('week pool: a batch is already running'));
      if (jobs.length === 0) { onProgress?.({ done: 0, total: 0 }); return Promise.resolve([]); }
      ensure();
      busy = true;
      return new Promise<OtherGameResult[]>((resolve, reject) => {
        const out: (OtherGameResult | undefined)[] = new Array(jobs.length);
        const slotOf = new Map<number, number>();
        let next = 0, done = 0, failed = false;
        const finish = (err: Error | null) => {
          if (failed) return;
          for (const w of workers) { w.onmessage = null; if (w.onerror !== undefined) w.onerror = null; }
          busy = false;
          if (err) { failed = true; reject(err); } else resolve(out as OtherGameResult[]);
        };
        const feed = (w: PoolWorker) => {
          if (next >= jobs.length) return;
          const id = nextId++;
          slotOf.set(id, next);
          w.postMessage({ id, job: jobs[next++]! } satisfies WorkerRequest);
        };
        onProgress?.({ done: 0, total: jobs.length });
        for (const w of workers) {
          w.onmessage = (e) => {
            const m = e.data as WorkerReply;
            const slot = slotOf.get(m.id);
            if (slot === undefined || failed) return;
            slotOf.delete(m.id);
            if (m.kind === 'error') { finish(new Error(`week pool: game ${jobs[slot]!.fixture.gameId} failed: ${m.message}`)); return; }
            if (m.result.gameId !== jobs[slot]!.fixture.gameId) { finish(new Error(`week pool: asked for game ${jobs[slot]!.fixture.gameId}, got ${m.result.gameId}`)); return; }
            out[slot] = m.result;
            done++;
            onProgress?.({ done, total: jobs.length });
            if (done === jobs.length) finish(null); else feed(w);
          };
          if (w.onerror !== undefined) w.onerror = (e) => finish(new Error(`week pool: a worker failed: ${e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e)}`));
          feed(w);
        }
      });
    },
    dispose() { for (const w of workers.splice(0)) w.terminate(); },
  };
}

/** The worker's side of the protocol: the worker script calls this with its global scope. */
export function serveWeekWorker(scope: { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null }): void {
  const run = createOtherGameRunner();
  scope.onmessage = (e) => {
    const { id, job } = e.data as WorkerRequest;
    let reply: WorkerReply;
    try { reply = { id, kind: 'done', result: run(job) }; }
    catch (err) { reply = { id, kind: 'error', message: err instanceof Error ? err.message : String(err) }; }
    scope.postMessage(reply);
  };
}
