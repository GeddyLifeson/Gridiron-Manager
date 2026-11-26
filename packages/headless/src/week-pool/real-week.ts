// The real phase 1 game as a week-pool job (G-97): one scheduled game in, its score and play counts out,
// played by the full engine (A3.1.1 row 20: there is no lighter way to make a score). The same function
// runs in the calling thread and in every worker, so serial and parallel play cannot differ.
// PLACEHOLDER rosters, as in real-game/index.ts, until generated players (G-17) and depth charts feed
// real ones: the job carries no team data yet, only the game id, seed and rule set.
import { field } from '@gm/engine-core';
import { stats } from '@gm/engine-game';
import { hashOf } from '../batch/run.ts';
import { createRealGame, type RealGame } from '../real-game/index.ts';
import type { CreateJobRunner, JobModuleRef, Json } from './job-module.ts';

export interface WeekGameJob { readonly gameId: number; readonly seedHex: string; readonly ruleSetId: string }

export interface WeekGameOutcome {
  /** Side 0 is the home team (GameInput.teams is indexed by Side: 0 home, 1 visitor). */
  readonly homePoints: number;
  readonly awayPoints: number;
  /** Offense plays that counted: a called pass, sack or scramble is a pass play, every other one a run play. */
  readonly passPlays: number;
  readonly runPlays: number;
  readonly plays: number;
  /** Hash of the game state after the last play, which the engine computes anyway: the replay check (J13). */
  readonly finalStateHash: string;
  /** Hash of the whole event list. Costs time, so it is filled only when the options ask (`eventsHash`), else ''. */
  readonly eventsHash: string;
}

export interface RealWeekOptions { readonly iss?: number; /** Also hash every game's event list (checks and tests). */ readonly eventsHash?: boolean }

/** Module URL of this file, for a `JobModuleRef`. */
export const REAL_WEEK_MODULE = new URL('./real-week.ts', import.meta.url).href;
export function realWeekRef(opts: RealWeekOptions = {}): JobModuleRef {
  return { module: REAL_WEEK_MODULE, options: { ...(opts.iss === undefined ? {} : { iss: opts.iss }), ...(opts.eventsHash ? { eventsHash: true } : {}) } };
}

export const createJobRunner: CreateJobRunner<WeekGameJob, WeekGameOutcome> = (raw: Json) => {
  const o = (raw ?? {}) as RealWeekOptions;
  const games = new Map<string, { game: RealGame; stats: ReturnType<typeof stats.createStatsModule> }>();
  return (job) => {
    let e = games.get(job.ruleSetId);
    if (!e) {
      const game = createRealGame(job.ruleSetId, { iss: o.iss });
      e = { game, stats: stats.createStatsModule({ geometry: field.fieldGeometry(game.rules), params: game.params }) };
      games.set(job.ruleSetId, e);
    }
    const g = e.game;
    const input = g.input(job.gameId - 1, job.seedHex);
    const result = g.simulate(input);
    let passPlays = 0, runPlays = 0;
    for (let k = 0; k < result.records.length; k++) {
      const row = e.stats.playByPlay(result.records[k]!, result.records[k + 1] ?? null);
      if (row.noPlay || row.offenseKind === null) continue;
      if (row.dropback) passPlays++; else runPlays++;
    }
    const last = result.records[result.records.length - 1];
    return {
      homePoints: result.final.score[0], awayPoints: result.final.score[1], passPlays, runPlays, plays: result.records.length,
      finalStateHash: last ? last.stateHash : '', eventsHash: o.eventsHash ? hashOf(result.events) : '',
    };
  };
};

/** What the world's game request offers that a job needs. Structural, so this file does not import @gm/world. */
export interface WeekRequestLike { readonly game: { readonly gameId: number }; readonly seedHex: string; readonly ruleSetId: string }

export function jobOf(req: WeekRequestLike): WeekGameJob {
  return { gameId: req.game.gameId, seedHex: req.seedHex, ruleSetId: req.ruleSetId };
}

/**
 * A batch game port over any way of running the jobs: `pool.run` for parallel play, or
 * `(jobs) => jobs.map(runner)` for serial play. It fits the world loop's `GameBatchPort`.
 */
export function realWeekPort(runJobs: (jobs: readonly WeekGameJob[]) => readonly WeekGameOutcome[]): (reqs: readonly WeekRequestLike[]) => WeekGameOutcome[] {
  return (reqs) => {
    const out = runJobs(reqs.map(jobOf));
    if (out.length !== reqs.length) throw new Error(`week port: ${reqs.length} games asked, ${out.length} answered`);
    return [...out];
  };
}
