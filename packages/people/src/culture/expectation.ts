// Expectations by size and history, rising with success (X9.2.1). This module only sets the target; E4
// owns what happens when it is missed.
import { POSTSEASON_NONE, POSTSEASON_REPEAT, type Culture, type Expectation, type PostseasonTarget } from './record.ts';
import { cp } from './params.ts';

export interface SeasonResult {
  readonly year: number;
  readonly winRate: number;
  readonly wonTitle: boolean;
}

export interface ExpectationInput {
  /** Seasons so far, oldest first. The last is the season just finished. */
  readonly history: readonly SeasonResult[];
  /** The public preseason projection for next season as a win rate (the frozen X4.1.2 value). */
  readonly projection: number;
  /** The target that applied to the season just finished, or null for a first target. */
  readonly previous: Expectation | null;
  /**
   * The level's two postseason goal ids (league-rules content, C2 and T3): `cut` for a baseline above the
   * usual postseason line ("make the playoffs", "bowl game"), `top` for the top fifth ("win the division",
   * "compete for the conference"). Passed in so this code never branches on a level (P1.3.3).
   */
  readonly goals: { readonly cut: string; readonly top: string };
  /** Win rate that usually makes the postseason at this level (C2, T3). */
  readonly postseasonCutRate: number;
  /** Win rate at the edge of the level's top fifth (X9.2.1 rule 5). */
  readonly topFifthRate: number;
  /** Games next season, for whole-win display. */
  readonly games: number;
  readonly year: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function meanRate(rs: readonly SeasonResult[]): number | null {
  if (rs.length === 0) return null;
  return rs.reduce((s, r) => s + r.winRate, 0) / rs.length;
}

/**
 * Baseline (X9.2.1 rule 1): 40 percent long-run rate (10 seasons), 40 percent recent rate (3 seasons),
 * 20 percent the public projection. A team with no history uses the projection alone.
 */
export function baseline(history: readonly SeasonResult[], projection: number): number {
  const long = meanRate(history.slice(-cp('expect.longRunSeasons')));
  const recent = meanRate(history.slice(-cp('expect.recentSeasons')));
  if (long === null || recent === null) return projection;
  return cp('expect.w.longRun') * long + cp('expect.w.recent') * recent + cp('expect.w.projection') * projection;
}

/**
 * The ratchet (X9.2.1 rule 2): after a season above the previous target's band, next season's baseline
 * rises by half the overshoot; after a season below, it falls by a quarter of the undershoot.
 */
export function ratchet(previous: Expectation | null, last: SeasonResult | undefined): number {
  if (!previous || !last) return 0;
  if (last.winRate > previous.rateHigh) return cp('expect.ratchetUp') * (last.winRate - previous.rateHigh);
  if (last.winRate < previous.rateLow) return -cp('expect.ratchetDown') * (previous.rateLow - last.winRate);
  return 0;
}

function postseasonTarget(goals: { cut: string; top: string }, centre: number, cut: number, top: number): PostseasonTarget {
  if (centre >= top) return goals.top;
  if (centre >= cut) return goals.cut;
  return POSTSEASON_NONE;
}

/**
 * Next season's expectation (X9.2.1): centre = baseline plus the ratchet, as a win-rate band of width
 * 0.125 rounded to whole wins for display; a postseason target from where the centre sits. A team coming
 * off a title gets "win it again" with the band capped at the band containing the title season's rate.
 */
export function nextExpectation(i: ExpectationInput): Expectation {
  const last = i.history[i.history.length - 1];
  const half = cp('expect.bandWidth') / 2;
  let centre = clamp(baseline(i.history, i.projection) + ratchet(i.previous, last), half, 1 - half);
  let target = postseasonTarget(i.goals, centre, i.postseasonCutRate, i.topFifthRate);
  if (last?.wonTitle) {
    target = POSTSEASON_REPEAT;
    centre = Math.min(centre, clamp(last.winRate, half, 1 - half));
  }
  const rateLow = centre - half;
  const rateHigh = centre + half;
  return { year: i.year, rateLow, rateHigh, winsLow: Math.round(rateLow * i.games), winsHigh: Math.round(rateHigh * i.games), postseasonTarget: target };
}

/** Set the culture's expectation for next season and return it (event `expectation_set` is the caller's to log). */
export function setExpectation(c: Culture, i: ExpectationInput): Expectation {
  c.expectation = nextExpectation(i);
  return c.expectation;
}
