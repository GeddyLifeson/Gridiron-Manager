// D10.6.1 reference snap shares, shown beside the user's rotation plan and used as the AI calibration target.
// Mean share of team snaps for the most-used, second, third and fourth player at each position per
// team-game, 2021 to 2025 regular seasons, 2,718 team-games, computed 2026-11-25 from
// /mnt/project-files/data/people/nfl_snap_counts_2012_2025.csv. STATUS: 1 of 3 (one computed source,
// not triple verified). Position labels are the data's own; offensive line rows are left out and the
// defensive line rows are approximate (D10.6.1). College has no data in the pack.
export interface ReferenceShareRow {
  readonly position: string;
  /** Shares 0 to 1 by depth rank, most used first. */
  readonly shares: readonly number[];
}

export const REFERENCE_SHARES_STATUS = '1 of 3' as const;
export const REFERENCE_SHARES_LEAF = 'D10.6.1' as const;

export const REFERENCE_SHARES_PRO: readonly ReferenceShareRow[] = [
  { position: 'QB', shares: [0.96] },
  { position: 'RB', shares: [0.64, 0.30] },
  { position: 'WR', shares: [0.87, 0.76, 0.56, 0.24] },
  { position: 'TE', shares: [0.74, 0.40] },
  { position: 'DT', shares: [0.66, 0.49, 0.34] },
  { position: 'DE', shares: [0.67, 0.51, 0.36] },
  { position: 'LB', shares: [0.96, 0.82, 0.53, 0.34] },
  { position: 'CB', shares: [0.97, 0.88, 0.54] },
  { position: 'FS', shares: [0.86] },
  { position: 'SS', shares: [0.82] },
];
