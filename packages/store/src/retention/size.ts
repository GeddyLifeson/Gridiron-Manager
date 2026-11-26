// Save size by category (P5.4.1: "a storage screen shows the size by category") and the planning
// projection the P5.4.1 targets are checked against.
import type { SqlDriver } from '../driver.ts';
import { PLANNING, SIZE_TARGETS, retentionPolicy, type RetentionPolicy } from './params.ts';

export interface SaveSize {
  /** Bytes of the database file (page count times page size). */
  file: number;
  /** Bytes stored, summed over the categories below. Smaller than `file` by page slack and indexes. */
  total: number;
  /** Bytes per world table, by the world contract's table names. */
  world: Record<string, number>;
  log: number;
  logArchive: number;
  snapshots: number;
  chain: number;
  content: number;
  other: number;
}

const sum = async (driver: SqlDriver, sql: string): Promise<number> => {
  try { return Number((await driver.all<{ n: number | null }>(sql))[0]?.n ?? 0); } catch { return 0; }
};

/** Measures a save by category. Reads only; tables a save does not have count as zero. */
export async function measureSave(driver: SqlDriver): Promise<SaveSize> {
  const pages = await sum(driver, 'SELECT page_count AS n FROM pragma_page_count()');
  const pageSize = await sum(driver, 'SELECT page_size AS n FROM pragma_page_size()');
  const world: Record<string, number> = {};
  try {
    for (const r of await driver.all<{ tbl: string; n: number }>('SELECT tbl, SUM(length(key) + length(json) + 8) AS n FROM state_rows GROUP BY tbl ORDER BY tbl')) world[r.tbl] = Number(r.n);
  } catch { /* not a format 2 save */ }
  const out: SaveSize = {
    file: pages * pageSize,
    total: 0,
    world,
    log: await sum(driver, 'SELECT SUM(length(command) + length(type) + length(events_hash) + length(digest_after) + COALESCE(length(state_hash), 0) + COALESCE(length(inverse), 0) + 24) AS n FROM command_log'),
    logArchive: await sum(driver, 'SELECT SUM(length(blob) + length(blob_hash) + 40) AS n FROM command_log_archive'),
    snapshots: await sum(driver, 'SELECT SUM(length(blob) + length(header) + length(state_hash) + length(digest) + length(blob_hash) + 40) AS n FROM snapshots'),
    chain: await sum(driver, 'SELECT SUM(length(prev) + length(state_hash) + length(head) + length(engine_version) + length(parameter_set_version) + length(kind) + COALESCE(length(note), 0) + 16) AS n FROM hash_chain'),
    content: await sum(driver, 'SELECT SUM(length(hash) + length(kind) + length(body)) AS n FROM content'),
    other: await sum(driver, "SELECT (SELECT COALESCE(SUM(length(json)), 0) FROM header) + (SELECT COALESCE(SUM(length(key) + length(value)), 0) FROM save_meta) AS n"),
  };
  out.total = Object.values(world).reduce((a, b) => a + b, 0) + out.log + out.logArchive + out.snapshots + out.chain + out.content + out.other;
  return out;
}

/** Per-season byte figures a projection is built from: P5.4.1's planning numbers, or measured ones. */
export interface SizeModel {
  /** Play, drive and grade rows of one season, all games. */
  playRowsPerSeason: number;
  /** Share of a season's play rows that are the user's games. */
  userGameShare: number;
  gameInputsPerSeason: number;
  /** Stored film of the user's games for one season. */
  userFilmPerSeason: number;
  /** Summary tables written per season (kept forever). */
  summariesPerSeason: number;
  /** Command log per season after compression. */
  logPerSeason: number;
  /** Live world state apart from the categories above. */
  liveState: number;
  /** All snapshots kept, at a steady state. */
  snapshots: number;
}

/** P5.4.1's own planning figures for the default world. The log is "before compression". */
export function planningModel(): SizeModel {
  const playRowsPerSeason = PLANNING.gamesPerSeason * PLANNING.playsPerGame * PLANNING.bytesPerPlayRow;
  return {
    playRowsPerSeason,
    userGameShare: PLANNING.userPlayRowBytesPerSeason / playRowsPerSeason,
    gameInputsPerSeason: PLANNING.gamesPerSeason * PLANNING.bytesPerGameInput,
    userFilmPerSeason: PLANNING.userFilmBytesPerSeason,
    summariesPerSeason: PLANNING.summaryBytesPerSeason,
    logPerSeason: PLANNING.logBytesPerSeason,
    liveState: PLANNING.liveStateBytes,
    snapshots: PLANNING.snapshotBytes,
  };
}

export interface SizeProjection {
  profile: string;
  season: number;
  total: number;
  parts: Record<'playRows' | 'userPlayRows' | 'gameInputs' | 'userFilm' | 'summaries' | 'log' | 'liveState' | 'snapshots', number>;
  /** The P5.4.1 target that applies, or null when the leaf sets none for this profile and season. */
  target: number | null;
  withinTarget: boolean | null;
}

const seasonsKept = (w: number | null, season: number) => (w === null ? season : Math.min(w, season));

/** Size of a save after `season` seasons under a profile, by the model. */
export function projectSize(model: SizeModel, profile: string, season: number): SizeProjection {
  const p: RetentionPolicy = retentionPolicy(profile);
  const allKept = seasonsKept(p.playRowsAllGames, season);
  const userOnly = Math.max(0, seasonsKept(p.playRowsUserGames, season) - allKept);
  const parts = {
    playRows: allKept * model.playRowsPerSeason,
    userPlayRows: userOnly * model.playRowsPerSeason * model.userGameShare,
    gameInputs: seasonsKept(p.gameInputs, season) * model.gameInputsPerSeason,
    userFilm: seasonsKept(p.userFilm, season) * model.userFilmPerSeason,
    summaries: season * model.summariesPerSeason,
    log: season * model.logPerSeason,
    liveState: model.liveState,
    snapshots: model.snapshots,
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  const target = profile === 'standard' && season === 30 ? SIZE_TARGETS.standardSeason30
    : profile === 'standard' && season === 1 ? SIZE_TARGETS.standardSeason1
      : profile === 'compact' && season === 30 ? SIZE_TARGETS.compactSeason30 : null;
  return { profile: p.profile, season, total, parts, target, withinTarget: target === null ? null : total < target };
}

