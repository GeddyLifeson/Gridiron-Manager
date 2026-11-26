// Workload for `leagueWeekMs` (X13.3.1 outputs, P6.1.1 "world week"): a week of real games, played by the
// full engine on the week pool. PLACEHOLDER rosters as in real-game/index.ts. The real game keeps no
// trajectories or play events yet, so this workload cannot apply either thinning step and says so.
import { loadJobRunner, type Json } from '../week-pool/job-module.ts';
import { createSyncPool, type SyncPool } from '../week-pool/pool.ts';
import { measureJobs } from '../week-pool/measure.ts';
import { realWeekRef, type WeekGameJob, type WeekGameOutcome } from '../week-pool/real-week.ts';
import type { CreateWorkload, WorkloadPlan } from './types.ts';

export interface LeagueWeekOptions { readonly proGames: number; readonly collegeGames: number; readonly workers: number }

export const LEAGUE_WEEK_MODULE = new URL('./league-week.ts', import.meta.url).href;

export function leagueWeekPlan(o: LeagueWeekOptions): WorkloadPlan {
  return { id: 'league-week', module: LEAGUE_WEEK_MODULE, options: { ...o }, feeds: { timeMs: 'leagueWeekMs', peakMemoryMb: 'peakMemoryMb' } };
}

export const createWorkload: CreateWorkload = async (raw: Json) => {
  const o = raw as unknown as LeagueWeekOptions;
  if (!o || !(o.proGames >= 0) || !(o.collegeGames >= 0) || o.proGames + o.collegeGames === 0 || !(o.workers >= 0)) throw new Error('league week workload: options need proGames, collegeGames and workers');
  const ref = realWeekRef();
  const runner = await loadJobRunner<WeekGameJob, WeekGameOutcome>(ref);
  const jobs: WeekGameJob[] = [...measureJobs('pro_2026', o.proGames), ...measureJobs('college_2026', o.collegeGames).map((j) => ({ ...j, gameId: j.gameId + o.proGames }))];
  let pool: SyncPool<WeekGameJob, WeekGameOutcome> | null = null;
  return {
    scale: { proGames: o.proGames, collegeGames: o.collegeGames, poolWorkers: o.workers },
    supports: () => false,
    // The pool is up before a week starts in the game too, so starting the threads is not part of the week.
    prepare() { pool = createSyncPool({ module: ref, workers: o.workers, mainRunner: runner }); pool.run(jobs.slice(0, Math.min(jobs.length, o.workers + 1))); },
    run() { pool!.run(jobs); },
    async close() { await pool?.close(); },
  };
};
