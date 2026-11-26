// Shapes of the headless career playtest (Q1.5, Q4.3, R1.2: "a rigorous headless playtest once everything is
// wired"). A playtest drives one seeded career from the college bottom rung to a pro head job through the app
// layer only (WorldService, the app-services commands and read models, and the core entry points the
// composition root binds), never the screens. Everything it sees goes into findings.

/** What kind of problem a finding is. Order is severity order for the report. */
export const FINDING_KINDS = ['crash', 'stuck', 'invalid', 'rule', 'missing', 'note'] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

/** The parts of a career the playtest walks (the coordinator's list plus the career spine and saves). */
export const AREAS = [
  'save', 'commands', 'career', 'game_day', 'game_frame', 'game_plan', 'practice', 'recruiting', 'evaluations', 'job_market', 'offseason', 'home',
] as const;
export type Area = (typeof AREAS)[number];

export interface Finding {
  readonly kind: FindingKind;
  readonly area: Area;
  /** Stable id for grouping across seeds (no seed or numbers inside). */
  readonly code: string;
  readonly message: string;
  /** Who owns the fix: module id and, when known, the thread that owns it. */
  readonly owner: string;
  readonly seedHex: string;
  /** Career season (0 first) or null outside the season loop. */
  readonly season: number | null;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/** One stage run inside a career: what it did and how long it took. */
export interface StageRecord {
  readonly area: Area;
  readonly season: number | null;
  readonly ok: boolean;
  readonly ms: number;
  readonly summary: string;
}

export interface PlaytestOptions {
  /** Career seasons (the career-run script length). */
  readonly seasons: number;
  /** Games per season played through the game-day console (0 skips game days). */
  readonly gamesPerSeason: number;
  /** Folder for the save files this run writes. */
  readonly saveDir: string;
  /** Career script (G-89): the climb, average work, or a fired-and-rehired coordinator. */
  readonly script: PlaytestScript;
  /** Seasons as pro head coach before the climb script stops. */
  readonly headSeasons: number;
  /** Guard on console steps per game before the game is called stuck. */
  readonly maxStepsPerGame: number;
  /** Seasons and offseasons played on one live world through the career year and its save (0 skips). */
  readonly worldSeasons: number;
}

export const SCRIPTS = ['rung0_to_pro_head', 'average_work', 'fired_and_rehired'] as const;
export type PlaytestScript = (typeof SCRIPTS)[number];

export const DEFAULT_OPTIONS: Omit<PlaytestOptions, 'saveDir'> = { seasons: 30, gamesPerSeason: 2, script: 'rung0_to_pro_head', headSeasons: 3, maxStepsPerGame: 30_000, worldSeasons: 2 };

export interface CareerReport {
  readonly seedHex: string;
  readonly script: PlaytestScript;
  readonly reachedProHead: boolean;
  /** Season the pro head job came, or null. */
  readonly proHeadSeason: number | null;
  readonly seasons: number;
  readonly games: number;
  readonly stages: readonly StageRecord[];
  readonly findings: readonly Finding[];
  readonly ms: number;
}
