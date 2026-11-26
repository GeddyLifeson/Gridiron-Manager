// The real phase 1 game as a week-pool job (G-97): one scheduled game in, its score and play counts out,
// played by the full engine (A3.1.1 row 20: there is no lighter way to make a score). The same function
// runs in the calling thread and in every worker, so serial and parallel play cannot differ.
// Teams: a job may carry both clubs' game-day teams (world people dressed by world/gameday, engine player id =
// world person id); the outcome then names those people in its stat lines and injuries. A job without teams
// plays the real game's PLACEHOLDER rosters (every attribute at one value) and reports neither.
import type { SimTeam } from '@gm/schema';
import { field } from '@gm/engine-core';
import { stats } from '@gm/engine-game';
import { hashOf } from '../batch/run.ts';
import { createRealGame, type RealGame } from '../real-game/index.ts';
import type { CreateJobRunner, JobModuleRef, Json } from './job-module.ts';

export interface WeekGameJob {
  readonly gameId: number; readonly seedHex: string; readonly ruleSetId: string;
  /** Home (side 0) and visiting game-day teams of world people; absent plays the placeholder rosters. */
  readonly teams?: readonly [SimTeam, SimTeam];
  /** World team ids of the home and visiting clubs, carried into the stat lines and injuries. Required with `teams`. */
  readonly teamIds?: readonly [number, number];
  readonly gameType?: 'regular' | 'postseason';
}

/** One statistic of one person in one game (D14.1.1 credits summed over the game). */
export interface WeekStatLine { readonly personId: number; readonly teamId: number; readonly statId: string; readonly value: number }
/** One J10.6.1 injury of a world person (the world's GameInjury, structurally). */
export interface WeekInjury {
  readonly personId: number; readonly teamId: number; readonly mechanism: string; readonly region: string;
  readonly severitySeed: number; readonly headImpact: boolean; readonly evaluationMissed: boolean;
}

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
  /** Present only for a job with world teams: every person's summed credits, ordered by person then statistic. */
  readonly lines?: readonly WeekStatLine[];
  /** Present only for a job with world teams: the game's injury truth events, in event order (empty when none). */
  readonly injuries?: readonly WeekInjury[];
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
    const base = g.input(job.gameId - 1, job.seedHex);
    const input = job.teams ? { ...base, teams: job.teams as typeof base.teams, gameType: job.gameType ?? base.gameType } : base;
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
      ...(job.teams ? worldReport(job, result, e.stats) : {}),
    };
  };
};

/**
 * Stat lines and injuries of a game played by world teams. Engine player ids are world person ids, so the
 * only mapping is side to club. J10.7.2 missed concussions are kept in the injury plug's record, which the
 * play record does not carry yet: `evaluationMissed` is false until it does.
 */
function worldReport(job: WeekGameJob, result: ReturnType<RealGame['simulate']>, statsModule: ReturnType<typeof stats.createStatsModule>): { lines: WeekStatLine[]; injuries: WeekInjury[] } {
  if (!job.teamIds) throw new Error(`week job ${job.gameId}: teams without teamIds`);
  const teamIds = job.teamIds;
  const sideOf = new Map<number, 0 | 1>();
  job.teams!.forEach((t, side) => { for (const p of t.players) sideOf.set(p.playerId, side as 0 | 1); });
  const totals = new Map<string, WeekStatLine>();
  const injuries: WeekInjury[] = [];
  for (const rec of result.records) {
    for (const c of statsModule.credits(rec)) {
      if (c.playerId === null) continue;
      const side = sideOf.get(c.playerId) ?? c.side;
      const key = `${c.playerId}|${c.statId}`;
      const prev = totals.get(key);
      totals.set(key, { personId: c.playerId, teamId: teamIds[side]!, statId: c.statId, value: (prev?.value ?? 0) + c.value });
    }
    for (const ev of rec.truth.events) {
      if (ev.type !== 'injury') continue;
      const side = sideOf.get(ev.playerId);
      if (side === undefined) throw new Error(`week job ${job.gameId}: injured engine player ${ev.playerId} is on neither team`);
      injuries.push({
        personId: ev.playerId, teamId: teamIds[side]!, mechanism: ev.mechanism, region: ev.region, severitySeed: ev.severitySeed,
        headImpact: ev.headImpact === true, evaluationMissed: false,
      });
    }
  }
  const lines = [...totals.values()].sort((a, b) => a.personId - b.personId || (a.statId < b.statId ? -1 : a.statId > b.statId ? 1 : 0));
  return { lines, injuries };
}

/** What the world's game request offers that a job needs. Structural, so this file does not import @gm/world. */
export interface WeekRequestLike {
  readonly game: { readonly gameId: number; readonly homeTeamId?: number; readonly awayTeamId?: number; readonly kind?: 'regular' | 'postseason' };
  readonly seedHex: string; readonly ruleSetId: string;
}

/** Builds both clubs' game-day teams for a request, or null to play it on placeholder rosters. */
export type TeamsOf<R extends WeekRequestLike = WeekRequestLike> = (req: R) => readonly [SimTeam, SimTeam] | null;

export function jobOf<R extends WeekRequestLike>(req: R, teamsOf?: TeamsOf<R>): WeekGameJob {
  const job: WeekGameJob = { gameId: req.game.gameId, seedHex: req.seedHex, ruleSetId: req.ruleSetId };
  const teams = teamsOf?.(req) ?? null;
  if (!teams) return job;
  if (req.game.homeTeamId === undefined || req.game.awayTeamId === undefined) throw new Error(`week port: game ${req.game.gameId} has teams but no club ids`);
  return { ...job, teams, teamIds: [req.game.homeTeamId, req.game.awayTeamId], gameType: req.game.kind ?? 'regular' };
}

/**
 * A batch game port over any way of running the jobs: `pool.run` for parallel play, or
 * `(jobs) => jobs.map(runner)` for serial play. It fits the world loop's `GameBatchPort`. With `teamsOf`
 * (world/gameday `worldTeamsOf`) each game fields the clubs' own people and reports lines and injuries.
 */
export function realWeekPort<R extends WeekRequestLike>(runJobs: (jobs: readonly WeekGameJob[]) => readonly WeekGameOutcome[], teamsOf?: TeamsOf<R>): (reqs: readonly R[]) => WeekGameOutcome[] {
  return (reqs) => {
    const out = runJobs(reqs.map((r) => jobOf(r, teamsOf)));
    if (out.length !== reqs.length) throw new Error(`week port: ${reqs.length} games asked, ${out.length} answered`);
    return [...out];
  };
}
