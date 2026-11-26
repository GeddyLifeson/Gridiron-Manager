// The season archive step (P5.4.2): one defined moment when a season is closed, summarised and thinned.
//
// P5.4.2 order: (1) verify derived statistics against play rows; (2) write season summaries, awards and
// tendency summaries; (3) write career totals; (4) update people retention (stubs); (5) delete rows past
// retention; (6) remove unreferenced content copies; (7) compact the database; (8) write the
// season-start snapshot and chain row.
//
// Stages 1 to 5 change the world, so they are ONE logged system command (P1.1.3: one path for every
// state change). Its apply lives in the application layer: football code verifies and summarises, then
// calls `thinWorld` from this module. The save core commits that command in one transaction, so a crash
// leaves either all of stages 1 to 5 or none of them. Stages 6 to 8 are storage work; each records its
// completion in `save_meta`, and a crash midway resumes from the last completed stage. The command log
// is the record of whether stages 1 to 5 ran, so a resume never issues the close command twice.
import type { SqlDriver } from '../driver.ts';
import type { SaveFile } from '../save/save-file.ts';
import type { CommandInput, CommitPlan, SaveVersions } from '../save/types.ts';
import { listSnapshots } from '../snapshot/snapshots.ts';
import { measureSave } from './size.ts';

export const ARCHIVE_STAGES = ['verify', 'summaries', 'careerTotals', 'people', 'delete', 'content', 'compact', 'snapshot'] as const;
export type ArchiveStage = (typeof ARCHIVE_STAGES)[number];
/** Stages carried by the one logged close command. */
export const COMMAND_STAGES: readonly ArchiveStage[] = ['verify', 'summaries', 'careerTotals', 'people', 'delete'];

/** Command type of the close command. The application's apply handles it. */
export const CLOSE_SEASON_COMMAND = 'system.CloseSeason';
/** `save_meta` key of the progress marker. */
export const META_ARCHIVE_PROGRESS = 'season_archive';

/** Payload of the close command. The application adds whatever its apply needs beside these. */
export interface CloseSeasonPayload { seasonYear: number; profile: string; [k: string]: unknown }

export interface SeasonArchiveOptions {
  /** The finished season. */
  seasonYear: number;
  versions: SaveVersions;
  /** The close command to issue (stages 1 to 5). Its payload must carry `seasonYear`. */
  closeCommand: CommandInput;
  /** How the close command commits. Default: advances time, a `season` chain row. */
  plan?: CommitPlan;
  /** Run SQLite VACUUM in stage 7. Default true. A driver that cannot vacuum passes false. */
  vacuum?: boolean;
  /** Test hook: stop after this stage, as a crash would. */
  stopAfter?: ArchiveStage;
}

export interface SeasonArchiveReport {
  ok: boolean;
  seasonYear: number;
  /** Why the step stopped, when it did not finish. */
  failure: string | null;
  stagesRun: ArchiveStage[];
  stagesSkipped: ArchiveStage[];
  closeSeq: number | null;
  contentRemoved: number;
  logSeasonsCompressed: number[];
  bytesBefore: number;
  bytesAfter: number;
}

interface Progress { seasonYear: number; done: ArchiveStage[] }

async function readProgress(driver: SqlDriver): Promise<Progress | null> {
  const r = (await driver.all<{ value: string }>('SELECT value FROM save_meta WHERE key = ?', [META_ARCHIVE_PROGRESS]))[0];
  if (!r) return null;
  try { return JSON.parse(r.value) as Progress; } catch { return null; }
}

async function writeProgress(driver: SqlDriver, p: Progress): Promise<void> {
  await driver.transaction([{ sql: 'INSERT OR REPLACE INTO save_meta (key, value) VALUES (?, ?)', params: [META_ARCHIVE_PROGRESS, JSON.stringify(p)] }]);
}

/** Log position of the close command for `seasonYear`, if one was committed. Searches live and archived rows. */
export async function findCloseCommand(driver: SqlDriver, type: string, seasonYear: number): Promise<number | null> {
  const rows = await driver.all<{ seq: number; command: string }>('SELECT seq, command FROM command_log WHERE type = ? ORDER BY seq DESC', [type]);
  for (const r of rows) {
    try {
      const c = JSON.parse(r.command) as { payload?: { seasonYear?: unknown } };
      if (c.payload?.seasonYear === seasonYear) return r.seq;
    } catch { /* a damaged row is the load checks' business */ }
  }
  return null;
}

/**
 * Runs, or resumes, the archive step for one finished season. Safe to call again after a crash or a
 * failure: completed stages are skipped. The save must not be issuing other commands meanwhile.
 */
export async function runSeasonArchive<S>(save: SaveFile<S>, opts: SeasonArchiveOptions): Promise<SeasonArchiveReport> {
  const driver = save.driver;
  const report: SeasonArchiveReport = {
    ok: false, seasonYear: opts.seasonYear, failure: null, stagesRun: [], stagesSkipped: [], closeSeq: null,
    contentRemoved: 0, logSeasonsCompressed: [], bytesBefore: (await measureSave(driver)).total, bytesAfter: 0,
  };
  const payload = opts.closeCommand.payload as { seasonYear?: unknown } | null;
  if (payload?.seasonYear !== opts.seasonYear) {
    report.failure = 'the close command must name the season it closes';
    return report;
  }
  let progress = await readProgress(driver);
  if (!progress || progress.seasonYear !== opts.seasonYear) progress = { seasonYear: opts.seasonYear, done: [] };
  const done = new Set(progress.done);
  const mark = async (stages: readonly ArchiveStage[]) => {
    for (const s of stages) done.add(s);
    progress = { seasonYear: opts.seasonYear, done: ARCHIVE_STAGES.filter((s) => done.has(s)) };
    await writeProgress(driver, progress);
  };
  const stop = (s: ArchiveStage) => opts.stopAfter === s;

  // Stages 1 to 5: the one logged close command.
  report.closeSeq = await findCloseCommand(driver, opts.closeCommand.type, opts.seasonYear);
  if (report.closeSeq !== null) {
    report.stagesSkipped.push(...COMMAND_STAGES);
    if (!COMMAND_STAGES.every((s) => done.has(s))) await mark(COMMAND_STAGES);
  } else {
    const plan: CommitPlan = opts.plan ?? { advancesTime: true, undoable: false, checkpoint: { kind: 'season', ...opts.versions, note: `season ${opts.seasonYear} closed` } };
    const r = await save.issue(opts.closeCommand, plan);
    if (!r.ok) {
      report.failure = `the close command was refused: ${r.reason}`;
      report.bytesAfter = (await measureSave(driver)).total;
      return report;
    }
    report.closeSeq = r.seq;
    report.stagesRun.push(...COMMAND_STAGES);
    await mark(COMMAND_STAGES);
  }
  if (opts.stopAfter && COMMAND_STAGES.includes(opts.stopAfter)) return finish(report, driver, false);

  // Stage 6: unreferenced content copies, and the closed seasons' log rows compressed (P5.2.1).
  if (done.has('content')) report.stagesSkipped.push('content');
  else {
    const before = (await driver.all<{ n: number }>('SELECT COUNT(*) AS n FROM content'))[0]!.n;
    await driver.transaction([{ sql: 'DELETE FROM content WHERE hash NOT IN (SELECT hash FROM content_ref)' }]);
    report.contentRemoved = before - (await driver.all<{ n: number }>('SELECT COUNT(*) AS n FROM content'))[0]!.n;
    const seasons = await driver.all<{ y: number }>('SELECT DISTINCT season_year AS y FROM command_log WHERE season_year <= ? ORDER BY season_year', [opts.seasonYear]);
    for (const { y } of seasons) {
      try {
        if (await save.compressLogSeason(y)) report.logSeasonsCompressed.push(y);
      } catch {
        break; // That season still reaches the undo window; later ones do too.
      }
    }
    report.stagesRun.push('content');
    await mark(['content']);
  }
  if (stop('content')) return finish(report, driver, false);

  // Stage 7: compact the database file.
  if (done.has('compact')) report.stagesSkipped.push('compact');
  else {
    if (opts.vacuum !== false) await driver.exec('VACUUM');
    report.stagesRun.push('compact');
    await mark(['compact']);
  }
  if (stop('compact')) return finish(report, driver, false);

  // Stage 8: the season-start snapshot and its chain row.
  if (done.has('snapshot')) report.stagesSkipped.push('snapshot');
  else {
    const at = save.lastSeq();
    const has = (await listSnapshots(driver)).some((s) => s.kind === 'season' && s.logSeq === at);
    if (!has) await save.snapshotNow('season', opts.versions, `season ${opts.seasonYear + 1} start`);
    report.stagesRun.push('snapshot');
    await mark(['snapshot']);
  }
  return finish(report, driver, true);
}

async function finish(report: SeasonArchiveReport, driver: SqlDriver, ok: boolean): Promise<SeasonArchiveReport> {
  report.ok = ok;
  if (!ok && !report.failure) report.failure = 'stopped before the last stage';
  report.bytesAfter = (await measureSave(driver)).total;
  return report;
}
