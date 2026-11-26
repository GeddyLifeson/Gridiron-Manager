// Retention profiles over decades (P5.4.1). None of these is a football fact: each is a storage
// planning value, starting values from the P5.4.1 table, to be re-measured at phase 6 (P5.4.1
// acceptance 1). Basis `assumption` marks a value the leaf does not state.
import type { ParamFile } from '@gm/schema';

export type RetentionProfile = 'full' | 'standard' | 'compact';
export const RETENTION_PROFILES: readonly RetentionProfile[] = ['full', 'standard', 'compact'];

/** How many seasons of a category are kept, counting the current season as 1. Null keeps every season. */
export type SeasonWindow = number | null;

export interface RetentionPolicy {
  readonly profile: RetentionProfile;
  /** Play rows (and drive, grade rows) of every game. P5.4.1: "current and previous season". */
  readonly playRowsAllGames: SeasonWindow;
  /** Play rows of the user's teams' games. P5.4.1: "forever". */
  readonly playRowsUserGames: SeasonWindow;
  /** Game input blobs (both state slices and the seed). P5.4.1: "every game, current and previous season". */
  readonly gameInputs: SeasonWindow;
  /** Stored trajectories of the user's games, outright. P5.4.1: "latest 3 seasons". */
  readonly userFilm: SeasonWindow;
  /** Bookmarked plays, postseason games and marked games keep their film after `userFilm` runs out. */
  readonly keepMarkedFilm: boolean;
  /** Leavers with no professional, coaching, honours or user link are cut to a stub. */
  readonly stubMinorPeople: boolean;
  /** Prospects never signed are dropped at the end of their class cycle. */
  readonly dropUnsignedProspects: boolean;
}

/** P5.4.1 table, `standard` column. */
export const STANDARD: RetentionPolicy = {
  profile: 'standard', playRowsAllGames: 2, playRowsUserGames: null, gameInputs: 2, userFilm: 3,
  keepMarkedFilm: true, stubMinorPeople: true, dropUnsignedProspects: true,
};

/**
 * P5.4.1: "`compact`: one season of full play rows and no stored user film beyond the current season".
 * Game inputs follow the play rows (one season): assumption, the leaf does not say.
 * Marked film is still kept: assumption, the leaf names only "stored user film".
 */
export const COMPACT: RetentionPolicy = {
  profile: 'compact', playRowsAllGames: 1, playRowsUserGames: null, gameInputs: 1, userFilm: 1,
  keepMarkedFilm: true, stubMinorPeople: true, dropUnsignedProspects: true,
};

/**
 * P5.4.1: "`full`: nothing thinned". Other games' trajectories are still not stored: P5.4.1 says they
 * are regenerated, and `full` keeps the game inputs forever so they always can be (same engine version).
 */
export const FULL: RetentionPolicy = {
  profile: 'full', playRowsAllGames: null, playRowsUserGames: null, gameInputs: null, userFilm: null,
  keepMarkedFilm: true, stubMinorPeople: false, dropUnsignedProspects: false,
};

/** Policy for a save's profile. An unknown name (a save from a later build) gets `standard`. */
export function retentionPolicy(profile: string): RetentionPolicy {
  if (profile === 'full') return FULL;
  if (profile === 'compact') return COMPACT;
  return STANDARD;
}

/** True when `seasonYear` is inside a window of `window` seasons that ends at `currentSeason`. */
export function inWindow(window: SeasonWindow, seasonYear: number, currentSeason: number): boolean {
  return window === null || seasonYear > currentSeason - window;
}

const MB = 1_000_000;

/** P5.4.1 size targets, in bytes. */
export const SIZE_TARGETS = {
  /** "Target: under 1 GB at season 30" (standard). */
  standardSeason30: 1000 * MB,
  /** "under 400 MB in the first season" (standard). */
  standardSeason1: 400 * MB,
  /**
   * P5.4.1 said "`compact` ... target under 300 MB". Marlon ruled on 2026-11-26 to accept about 600 MB
   * at season 30 instead: by the leaf's own figures the log, summaries and live state alone pass 300 MB.
   * MA amendment requested from "Apply bible fixes from modules".
   */
  compactSeason30: 600 * MB,
} as const;

/** P5.4.1 planning assumptions for the default world. Not facts: C2, T3, J15 and T12 own the real values. */
export const PLANNING = {
  gamesPerSeason: 1110,
  playsPerGame: 170,
  bytesPerPlayRow: 600,
  bytesPerGameInput: 20_000,
  /** Live state, snapshots, summaries per season, user film per season, user play rows per season, log per season: the season-30 breakdown divided out. */
  liveStateBytes: 60 * MB,
  snapshotBytes: 90 * MB,
  summaryBytesPerSeason: 100 * MB / 30,
  userFilmBytesPerSeason: 25 * MB / 3,
  userPlayRowBytesPerSeason: 45 * MB / 30,
  logBytesPerSeason: 180 * MB / 30,
} as const;

const window = (name: string, value: number, leaf: string, basis: 'bible' | 'assumption') => ({
  name: `store.retention.${name}`, value, min: 1, max: 100, unit: 'seasons', belongsTo: 'P5.4.1 retention profile',
  basis, leaf, constrainedBy: 'P5.4.1 acceptance 1 (save size at season 30, measured at phase 6)', status: 'starting' as const,
});
const bytes = (name: string, value: number, basis: 'bible' | 'assumption') => ({
  name: `store.retention.${name}`, value, min: 1, max: 10_000 * MB, unit: 'bytes', belongsTo: 'P5.4.1 size planning',
  basis, leaf: 'P5.4.1', constrainedBy: 'test/retention size run; measured row sizes at phase 1 and 3 (P5.4.1 open question)', status: 'starting' as const,
});

export const PARAMS: ParamFile = {
  module: 'store.retention',
  version: 'g83.1',
  params: [
    window('standard.playRowsAllGames', 2, 'P5.4.1', 'bible'),
    window('standard.gameInputs', 2, 'P5.4.1', 'bible'),
    window('standard.userFilm', 3, 'P5.4.1', 'bible'),
    window('compact.playRowsAllGames', 1, 'P5.4.1', 'bible'),
    window('compact.gameInputs', 1, 'P5.4.1', 'assumption'),
    window('compact.userFilm', 1, 'P5.4.1', 'bible'),
    bytes('target.standardSeason30', SIZE_TARGETS.standardSeason30, 'bible'),
    bytes('target.standardSeason1', SIZE_TARGETS.standardSeason1, 'bible'),
    bytes('target.compactSeason30', SIZE_TARGETS.compactSeason30, 'assumption'), // Marlon ruling 2026-11-26: 600 MB replaces P5.4.1's 300 MB
    bytes('planning.bytesPerPlayRow', PLANNING.bytesPerPlayRow, 'bible'),
    bytes('planning.bytesPerGameInput', PLANNING.bytesPerGameInput, 'bible'),
  ],
};
