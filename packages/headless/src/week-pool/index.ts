// G-97 parallel week runner: a synchronous worker pool and the real game as its job.
export { loadJobRunner, type Json, type JobModuleRef, type JobRunner, type CreateJobRunner } from './job-module.ts';
export { createSyncPool, type SyncPool, type SyncPoolOptions } from './pool.ts';
export {
  REAL_WEEK_MODULE, realWeekRef, createJobRunner, jobOf, realWeekPort,
  type WeekGameJob, type WeekGameOutcome, type RealWeekOptions, type WeekRequestLike,
} from './real-week.ts';
