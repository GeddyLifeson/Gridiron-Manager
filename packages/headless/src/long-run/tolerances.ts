// Q1.6.4 drift tolerances taken from real league variation (G-88 research). Each row names the fact rows behind it
// (facts/drift-variation.json, computed from nflverse; status 1 of 3 until a second and third independent source is read).
// A fixed-rule sim should drift no more than the real league did across 2002-2024, so the real slope and band are the limits.
// Real data is league-wide NFL, so rows apply to the pro league-wide series only. Series with no row here (college,
// by-position, class quality, career length, money) keep the Assumption defaults in params.ts; by-position and FBS
// variation are still owed (FBS needs the CollegeFootballData key, which the cloud cannot reach).

export interface RealTolerance {
  /** Largest |slope| per season as a share of the series mean. */
  readonly slopeShare: number;
  /** Every season within this share of the fitted mean. */
  readonly bandShare: number;
  readonly factIds: readonly string[];
  readonly note: string;
}

/** By series name, or prefix ending in '.'. */
export const REAL_TOLERANCES: Readonly<Record<string, RealTolerance>> = {
  'stats.points_per_game': { slopeShare: 0.0041, bandShare: 0.12, factIds: ['F-measured-rate-0354', 'F-measured-rate-0355'], note: 'NFL points per game, 2002-2024' },
  'age.rostered.mean.pro.all': { slopeShare: 0.0011, bandShare: 0.017, factIds: ['F-measured-rate-0357', 'F-measured-rate-0358'], note: 'NFL opening-week roster mean age, 2002-2024' },
  'turnover.roster_share': { slopeShare: 0.014, bandShare: 0.27, factIds: ['F-measured-rate-0360', 'F-measured-rate-0361'], note: 'NFL share of roster new to the league, 2003-2024' },
  // Proxy: real talent is not observable, so spread of team win percentage (talent plus luck) stands in for it.
  'talent.rostered.sd.pro.all': { slopeShare: 0.005, bandShare: 0.17, factIds: ['F-measured-rate-0363', 'F-measured-rate-0364'], note: 'NFL spread of team win percentage, 2002-2024 (outcome proxy for talent spread)' },
};
