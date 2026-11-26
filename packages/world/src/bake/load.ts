// The loader: checks a baked history (format version, digest, shape) and hands back a deep-frozen copy,
// so nothing in the game can change it, least of all a player's history rerun. Browser-safe: it takes the
// parsed JSON and reads no file. `shipped.ts` binds the file shipped with the game.
import { BAKE_FORMAT_VERSION, bakeDigest, type BakedHistory, type BakedRun, type BakedSeason } from './format.ts';

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

function shapeProblems(v: any): string[] {
  const out: string[] = [];
  if (!v || typeof v !== 'object') return ['not an object'];
  if (v.formatVersion !== BAKE_FORMAT_VERSION) out.push(`formatVersion ${v.formatVersion} is not ${BAKE_FORMAT_VERSION}`);
  if (typeof v.digest !== 'string') out.push('no digest');
  if (typeof v.provisional !== 'boolean') out.push('no provisional flag');
  if (!Number.isInteger(v.endYear)) out.push('no endYear');
  if (!v.runs || typeof v.runs !== 'object' || Object.keys(v.runs).length === 0) out.push('no runs');
  for (const [size, r] of Object.entries<any>(v.runs ?? {})) {
    if (!Array.isArray(r?.seasons) || r.seasons.length === 0) out.push(`run ${size}: no seasons`);
    if (r?.source?.size !== size) out.push(`run ${size}: source size ${r?.source?.size}`);
    if (typeof r?.timing?.msPerGame !== 'number') out.push(`run ${size}: no timing`);
  }
  return out;
}

/** Check and freeze a parsed baked history. Throws on any problem; never repairs. */
export function loadBakedHistory(json: unknown): BakedHistory {
  const problems = shapeProblems(json);
  if (problems.length) throw new Error(`baked history refused: ${problems.join('; ')}`);
  const copy = structuredClone(json) as BakedHistory;
  const want = bakeDigest(copy);
  if (want !== copy.digest) throw new Error(`baked history refused: digest ${copy.digest} does not match its content (${want})`);
  return deepFreeze(copy);
}

export interface EstimateInput {
  /** Seasons of history the player chose. */
  readonly seasons: number;
  /** Size preset of the new world. */
  readonly size: string;
  /** This machine's speed against the machine that made the bake: its benchmark time over the bake's (2 = half as fast). Default 1. */
  readonly benchmarkRatio?: number;
}

export interface HistoryEstimate {
  readonly seconds: number;
  readonly provisional: boolean;
  /** 'measured': from a run of this size. 'other-size': no run of this size is baked, so the master size's run is used as is. */
  readonly basis: 'measured' | 'other-size';
}

/** The season `seasonsBack` before the career starts, clamped to the run's span. */
function seasonAt(run: BakedRun, endYear: number, seasonsBack: number): BakedSeason {
  const year = endYear - seasonsBack + 1;
  const first = run.seasons[0]!.seasonYear;
  const i = Math.min(run.seasons.length - 1, Math.max(0, year - first));
  return run.seasons[i]!;
}

/**
 * Seconds a history of `seasons` would take (X10.3.3 setup estimate): the last `seasons` seasons of the
 * baked run for that size, each timed as msPerGame * games + seasonMs from the run's fit, scaled by the
 * machine. A history longer than the run repeats its first season's cost. Null when nothing is baked.
 */
export function estimateHistorySeconds(baked: BakedHistory, input: EstimateInput): HistoryEstimate | null {
  if (!Number.isInteger(input.seasons) || input.seasons < 0) throw new Error('estimate: seasons must be a whole number, 0 or more');
  const own = baked.runs[input.size];
  const run = own ?? baked.runs[baked.masterSize] ?? Object.values(baked.runs)[0];
  if (!run) return null;
  const ratio = input.benchmarkRatio ?? 1;
  let ms = 0;
  for (let back = 1; back <= input.seasons; back++) {
    const s = seasonAt(run, baked.endYear, back);
    ms += run.timing.msPerGame * s.games + run.timing.seasonMs;
  }
  return { seconds: Math.round((ms * ratio) / 100) / 10, provisional: baked.provisional || run.provisional, basis: own ? 'measured' : 'other-size' };
}

export interface LeagueShape {
  readonly seasonYear: number;
  readonly teamsActive: number;
  readonly people: number;
  readonly hallMembers: number;
  readonly pointsPerTeamGame: number;
  readonly passRate: number;
  readonly provisional: boolean;
}

/**
 * What the master world looked like `seasonsBack` seasons before the career starts (1 = the last season).
 * A player's own shorter history starts later with fresh founding, so this is a guide, not a promise:
 * hall counts in particular start at 0 in a short history.
 */
export function shapeAt(baked: BakedHistory, seasonsBack: number, size = baked.masterSize): LeagueShape | null {
  const run = baked.runs[size];
  if (!run) return null;
  const s = seasonAt(run, baked.endYear, Math.max(1, seasonsBack));
  return {
    seasonYear: s.seasonYear, teamsActive: s.teamsActive, people: s.people, hallMembers: s.hallMembers,
    pointsPerTeamGame: s.pointsPerTeamGame, passRate: s.passRate, provisional: baked.provisional || run.provisional,
  };
}

/** Parity bounds for the validator (X10.3.2), as seen across the master run's complete decades. */
export function parityBounds(baked: BakedHistory): { minDistinctChampions: number | null; maxTopShare: number | null; provisional: boolean } | null {
  const run = baked.runs[baked.masterSize];
  if (!run) return null;
  return { minDistinctChampions: run.parity.minDistinctChampions, maxTopShare: run.parity.maxTopShare, provisional: baked.provisional };
}
