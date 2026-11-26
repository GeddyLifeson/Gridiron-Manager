// Measured real-world numbers this module's assumptions are fitted against. They are calibration targets,
// never inputs to a draw. Each row repeats the bible leaf's own source and status; the status is the
// bible's count of independent sources and is not raised here.

export interface MeasuredTarget {
  readonly id: string;
  readonly leaf: string;
  readonly what: string;
  readonly value: Readonly<Record<string, number>>;
  readonly source: string;
  readonly status: string;
}

/** Outdoor pass attempts by steady wind bin, nflverse play-by-play 2015 to 2025 (J12.3.1): 86,147 / 33,168 / 9,845. */
export const WIND_BIN_SHARE: MeasuredTarget = {
  id: 'target.wind_bin_share',
  leaf: 'J12.3.1',
  what: 'Share of outdoor pass attempts by steady wind bin (under 10, 10 to 15, over 15 mph)',
  value: { under10: 86147 / 129160, from10to15: 33168 / 129160, over15: 9845 / 129160 },
  source: 'nflverse play-by-play 2015 to 2025 regular season, computed 2026-11-26 (bible J12.3.1; research/depth-pass/J12-log.md)',
  status: '1 of 3',
};

/** Outdoor pass attempts with precipitation in the game-start weather text, same data (J12.4.1). */
export const PRECIP_SHARE_OUTDOOR: MeasuredTarget = {
  id: 'target.precip_share_outdoor',
  leaf: 'J12.4.1',
  what: 'Share of outdoor pass attempts in games with rain, showers or snow at kickoff (attempt-weighted proxy for the game share)',
  value: { share: (9507 + 1356) / (130284 + 9507 + 1356) },
  source: 'nflverse play-by-play 2015 to 2025 regular season, computed 2026-11-26 (bible J12.4.1); the weather field is game-start text, so it understates later rain',
  status: '1 of 3',
};

export const SNOW_SHARE_OF_PRECIP: MeasuredTarget = {
  id: 'target.snow_share_of_precip',
  leaf: 'J12.4.1',
  what: 'Snow share of outdoor pass attempts with precipitation at kickoff',
  value: { share: 1356 / (9507 + 1356) },
  source: 'nflverse play-by-play 2015 to 2025 regular season, computed 2026-11-26 (bible J12.4.1)',
  status: '1 of 3',
};

export const MEASURED_TARGETS: readonly MeasuredTarget[] = [WIND_BIN_SHARE, PRECIP_SHARE_OUTDOOR, SNOW_SHARE_OF_PRECIP];
