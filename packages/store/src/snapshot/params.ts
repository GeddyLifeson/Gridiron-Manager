// How many snapshots a save keeps (P5.3.1). None of these is a football fact.
import type { ParamFile } from '@gm/schema';

/** P5.3.1: "at each week boundary (keep the latest 3)". */
export const KEEP_WEEK_SNAPSHOTS = 3;
/** P5.3.1: season-start snapshots, "default the latest 3 seasons". */
export const KEEP_SEASON_SNAPSHOTS_STANDARD = 3;
/**
 * Assumption. P5.4.1 names a `compact` profile and gives it no snapshot count. One season-start
 * snapshot is the least that still lets P5.8.1's second recovery step run.
 */
export const KEEP_SEASON_SNAPSHOTS_COMPACT = 1;

const row = (name: string, value: number, basis: 'bible' | 'assumption', leaf: string) => ({
  name: `store.snapshot.${name}`, value, min: 1, max: 1000, unit: 'count', belongsTo: 'P5.3.1 snapshot retention',
  basis, leaf, constrainedBy: 'P5.4.1 acceptance 1 (save size at season 30, measured at phase 6)', status: 'starting' as const,
});

export const PARAMS: ParamFile = {
  module: 'store.snapshot',
  version: 'g01.1',
  params: [
    row('keepWeek', KEEP_WEEK_SNAPSHOTS, 'bible', 'P5.3.1'),
    row('keepSeasonStandard', KEEP_SEASON_SNAPSHOTS_STANDARD, 'bible', 'P5.3.1'),
    row('keepSeasonCompact', KEEP_SEASON_SNAPSHOTS_COMPACT, 'assumption', 'P5.4.1'),
  ],
};

export interface SnapshotRetention {
  /** Week-boundary snapshots kept. */
  readonly week: number;
  /** Season-start snapshots kept; null keeps every one. */
  readonly season: number | null;
}

/**
 * Retention for a save's profile (a save-scope setting, P5.4.1). `full` thins nothing. An unknown
 * profile name gets the standard counts, so a save written by a later build still opens.
 */
export function retentionFor(profile: string): SnapshotRetention {
  if (profile === 'full') return { week: KEEP_WEEK_SNAPSHOTS, season: null };
  if (profile === 'compact') return { week: KEEP_WEEK_SNAPSHOTS, season: KEEP_SEASON_SNAPSHOTS_COMPACT };
  return { week: KEEP_WEEK_SNAPSHOTS, season: KEEP_SEASON_SNAPSHOTS_STANDARD };
}
