// The extractor: one or more master-run output folders (as parsed JSON) in, the baked history out. Pure:
// the bake tool (test/bake/tools/bake-history.ts) reads the files and writes the result; this module only
// computes. The same input gives the same bytes and digest on any machine.
//
// Input shape: the files master-history.ts writes (PR 226 header): run.json, progress.jsonl (one row per
// season), teams.json, hall.json, tenures.json. Only the fields read below are required.
import { canonicalBytes } from '@gm/engine-core';
import { fullHistorySeasons } from '../generation/setup.ts';
import { bytesToHex, sha256 } from '../generation/sha256.ts';
import {
  BAKE_FORMAT_VERSION, MASTER_RUN_KIND, signBake,
  type BakedHistory, type BakedRun, type BakedSeason, type ParityDecade, type Quantiles,
} from './format.ts';

/** The run-folder format version this extractor reads. run.json without a formatVersion is read as 1. */
export const RUN_FORMAT_VERSION = 1;

export interface RunProgressRow {
  readonly season: number; readonly ms: number; readonly games: number; readonly points: number;
  readonly passPlays: number; readonly runPlays: number; readonly teamsActive: number; readonly people: number;
  readonly hallMembers?: number;
  /** Competition id (as a JSON key) to champion team id. */
  readonly champions: Readonly<Record<string, number>>;
}

export interface RunFiles {
  readonly run: {
    readonly formatVersion?: number; readonly kind: string; readonly seedHex: string; readonly size: string;
    readonly firstSeasonYear: number; readonly seasons: number; readonly games: string; readonly status: string;
    readonly seasonsRun?: number; readonly totalSeconds?: number; readonly worldCode: string; readonly worldHash?: string;
    /** Steps with no owning system: master-history.ts writes { step, reason } rows; plain names are read too. */
    readonly unbound?: readonly (string | { readonly step: string; readonly reason?: string })[];
    readonly validation?: { readonly pass: boolean; readonly failures?: readonly string[] };
  };
  readonly progress: readonly RunProgressRow[];
  readonly teams: readonly { readonly id: number; readonly competitionId: number; readonly founded: number; readonly folded: number | null }[];
  readonly hall: {
    readonly members: readonly { readonly hallId: string; readonly kind: string; readonly ballotSeason: number; readonly charter: boolean }[];
    readonly ballots: readonly { readonly hallId: string; readonly ballotSeason: number; readonly elected: number }[];
  };
  readonly tenures: { readonly completedHeadCoachTenures: readonly number[] };
}

export interface ExtractOptions {
  /** The size preset whose run is the master data. Default 'full'. */
  readonly masterSize?: string;
  /** Accept dry runs made with the test-double game port. Their runs are always provisional. Default false. */
  readonly allowDry?: boolean;
}

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

export function quantiles(values: readonly number[]): Quantiles | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { count: s.length, mean: r4(mean), p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9), max: s[s.length - 1]! };
}

/** Least-squares ms = a * games + b over the seasons; both floored at 0. */
export function fitTiming(rows: readonly { readonly ms: number; readonly games: number }[]): { msPerGame: number; seasonMs: number } {
  if (rows.length === 0) return { msPerGame: 0, seasonMs: 0 };
  const n = rows.length;
  const mx = rows.reduce((a, r) => a + r.games, 0) / n, my = rows.reduce((a, r) => a + r.ms, 0) / n;
  let sxy = 0, sxx = 0;
  for (const r of rows) { sxy += (r.games - mx) * (r.ms - my); sxx += (r.games - mx) * (r.games - mx); }
  let a = sxx > 0 ? sxy / sxx : (mx > 0 ? my / mx : 0);
  let b = my - a * mx;
  if (a < 0) { a = 0; b = my; }
  if (b < 0) { b = 0; a = mx > 0 ? my / mx : 0; }
  return { msPerGame: r4(a), seasonMs: r4(b) };
}

function decadeOf(year: number): number { return Math.floor(year / 10) * 10; }

export function parityOf(progress: readonly RunProgressRow[]): BakedRun['parity'] {
  const by = new Map<string, { comp: number; decade: number; titles: Map<number, number>; seasons: number }>();
  for (const row of progress) {
    for (const [comp, team] of Object.entries(row.champions)) {
      const key = `${comp}:${decadeOf(row.season)}`;
      const cell = by.get(key) ?? { comp: Number(comp), decade: decadeOf(row.season), titles: new Map(), seasons: 0 };
      cell.titles.set(team, (cell.titles.get(team) ?? 0) + 1);
      cell.seasons++;
      by.set(key, cell);
    }
  }
  const decades: ParityDecade[] = [...by.values()]
    .map((c) => ({
      competitionId: c.comp, decadeStart: c.decade, seasons: c.seasons, distinctChampions: c.titles.size,
      topShare: r4(Math.max(...c.titles.values()) / c.seasons),
    }))
    .sort((a, b) => a.competitionId - b.competitionId || a.decadeStart - b.decadeStart);
  const complete = decades.filter((d) => d.seasons === 10);
  return {
    decades,
    minDistinctChampions: complete.length ? Math.min(...complete.map((d) => d.distinctChampions)) : null,
    maxTopShare: complete.length ? Math.max(...complete.map((d) => d.topShare)) : null,
  };
}

function countBy(years: readonly number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const y of [...years].sort((a, b) => a - b)) out[String(decadeOf(y))] = (out[String(decadeOf(y))] ?? 0) + 1;
  return out;
}

export function runProblems(files: RunFiles): string[] {
  const out: string[] = [];
  const v = files.run.formatVersion ?? 1;
  if (v !== RUN_FORMAT_VERSION) out.push(`run.json formatVersion ${v} is not ${RUN_FORMAT_VERSION}`);
  if (files.progress.length === 0) out.push('progress has no seasons');
  files.progress.forEach((r, i) => {
    if (i > 0 && r.season !== files.progress[i - 1]!.season + 1) out.push(`progress season ${r.season} does not follow ${files.progress[i - 1]!.season}`);
  });
  if ((files.run.seasonsRun ?? files.progress.length) !== files.progress.length) out.push(`run.json seasonsRun ${files.run.seasonsRun} but progress has ${files.progress.length} rows`);
  return out;
}

export function extractRun(files: RunFiles, opts: ExtractOptions = {}): BakedRun {
  const problems = runProblems(files);
  if (problems.length) throw new Error(`bake refused: ${problems.join('; ')}`);
  const run = files.run;
  const dry = run.kind !== MASTER_RUN_KIND || run.games !== 'real';
  if (dry && !opts.allowDry) throw new Error(`bake refused: "${run.kind}" (games=${run.games}) is a dry run; pass allowDry to bake it as provisional`);

  const seasonsRun = files.progress.length;
  const endYear = files.progress[seasonsRun - 1]!.season;
  const fullSpan = fullHistorySeasons(endYear + 1);
  const unbound = (run.unbound ?? []).map((u) => (typeof u === 'string' ? u : u.step));
  const reasons: string[] = [];
  if (dry) reasons.push(`dry run with the test-double game port (kind "${run.kind}", games=${run.games})`);
  // A killed run leaves status "running" with every file written up to its last season (PR 226).
  if (run.status !== 'finished') reasons.push(`run status is ${run.status} after ${seasonsRun} seasons`);
  if (!run.worldHash) reasons.push('run.json has no final world hash');
  if (seasonsRun < fullSpan) reasons.push(`${seasonsRun} of the ${fullSpan} seasons from football's first season`);
  if (run.validation && !run.validation.pass) reasons.push(`validator failed: ${(run.validation.failures ?? []).slice(0, 3).join('; ')}`);
  if (!run.validation) reasons.push('run.json has no validation result');
  if (unbound.length) reasons.push(`steps not bound: ${unbound.join(', ')}`);

  const seasons: BakedSeason[] = files.progress.map((r) => ({
    seasonYear: r.season, ms: r.ms, games: r.games,
    pointsPerTeamGame: r.games > 0 ? r4(r.points / (2 * r.games)) : 0,
    passRate: r.passPlays + r.runPlays > 0 ? r4(r.passPlays / (r.passPlays + r.runPlays)) : 0,
    teamsActive: r.teamsActive, people: r.people, hallMembers: r.hallMembers ?? 0,
  }));
  const fit = fitTiming(seasons);
  const totalMs = seasons.reduce((a, s) => a + s.ms, 0);

  const firstBallot = new Map<string, number>();
  for (const b of files.hall.ballots) firstBallot.set(b.hallId, Math.min(firstBallot.get(b.hallId) ?? Infinity, b.ballotSeason));
  const classes = files.hall.ballots.filter((b) => b.ballotSeason !== firstBallot.get(b.hallId)).map((b) => b.elected);
  const members = files.hall.members;

  const folded = files.teams.filter((t) => t.folded !== null);
  const first = run.firstSeasonYear;

  return {
    source: {
      kind: run.kind, seedHex: run.seedHex, size: run.size, firstSeasonYear: first, seasons: run.seasons, seasonsRun,
      games: run.games, status: run.status, worldCode: run.worldCode, worldHash: run.worldHash ?? '',
      validationPass: run.validation?.pass ?? false, unbound,
      inputDigest: bytesToHex(sha256(canonicalBytes(files as unknown))),
    },
    provisional: reasons.length > 0,
    provisionalReasons: reasons,
    seasons,
    timing: { ...fit, totalSeconds: r4(totalMs / 1000) },
    parity: parityOf(files.progress),
    tenures: quantiles(files.tenures.completedHeadCoachTenures),
    hall: {
      members: members.length, players: members.filter((m) => m.kind === 'player').length, coaches: members.filter((m) => m.kind === 'coach').length,
      charter: members.filter((m) => m.charter).length,
      firstBallotSeason: files.hall.ballots.length ? Math.min(...files.hall.ballots.map((b) => b.ballotSeason)) : null,
      classSize: quantiles(classes),
    },
    teams: {
      total: files.teams.length, folded: folded.length,
      foldedLifespan: quantiles(folded.map((t) => t.folded! - t.founded)),
      foundedByDecade: countBy(files.teams.filter((t) => t.founded > first).map((t) => t.founded)),
      foldedByDecade: countBy(folded.map((t) => t.folded!)),
    },
  };
}

/** Bake one or more runs (one per size preset) into the shipped format. */
export function extractBake(runs: readonly RunFiles[], opts: ExtractOptions = {}): BakedHistory {
  if (runs.length === 0) throw new Error('bake refused: no runs given');
  const masterSize = opts.masterSize ?? 'full';
  const baked: Record<string, BakedRun> = {};
  for (const files of runs) {
    if (baked[files.run.size]) throw new Error(`bake refused: two runs for size ${files.run.size}`);
    baked[files.run.size] = extractRun(files, opts);
  }
  const master = baked[masterSize];
  const ends = Object.values(baked).map((r) => r.seasons[r.seasons.length - 1]!.seasonYear);
  return signBake({
    formatVersion: BAKE_FORMAT_VERSION,
    masterSize,
    provisional: !master || master.provisional,
    endYear: master ? master.seasons[master.seasons.length - 1]!.seasonYear : Math.max(...ends),
    runs: baked,
  });
}
