// M2.3.2 snap limits and pitch counts: kinds of limit, removal at the dead ball, medical suggestions,
// development minimums, and the college redshirt tracker (rule key from T5.2.1).
import { P } from './params.ts';
import type { DepthRules } from './keys.ts';

export type LimitKind = 'snaps' | 'share' | 'series';

export interface SnapLimit {
  readonly kind: LimitKind;
  /** A snap count, a share 0 to 1, or a series count. */
  readonly value: number;
  /** Set by the medical staff (D11.3.1): never waits for the end of a drive. */
  readonly medical: boolean;
}

const expected = (side: 'off' | 'def') => P(side === 'off' ? 'limits.expectedOffSnaps' : 'limits.expectedDefSnaps');

/** A limit in snaps, converting by the game plan's expected snaps (rule 1). Floors, so a cap is never overshot. */
export function limitInSnaps(limit: SnapLimit, side: 'off' | 'def'): number {
  if (limit.kind === 'snaps') return limit.value;
  if (limit.kind === 'share') return Math.floor(limit.value * expected(side));
  return Math.floor(limit.value * P('limits.expectedSnapsPerSeries'));
}

export interface LimitContext {
  readonly snapsThisGame: number;
  /** Series played this game, for a series limit. */
  readonly seriesThisGame: number;
  /** A two-minute drive is in progress (edge case: a non-medical limit waits for the series to end). */
  readonly twoMinuteDrive: boolean;
  /** The coach overrode the limit for this game; logged by the caller (N3) and raises re-injury risk (D11). */
  readonly override: boolean;
}

/** I6 removes a player at his limit at the next dead ball, unless overridden (rule list, acceptance: never a 31st of 30). */
export function mustComeOff(limit: SnapLimit, side: 'off' | 'def', c: LimitContext): boolean {
  if (c.override) return false;
  const reached = limit.kind === 'series' ? c.seriesThisGame >= limit.value : c.snapsThisGame >= limitInSnaps(limit, side);
  if (!reached) return false;
  return limit.medical || !c.twoMinuteDrive;
}

/** Staff medical suggestion for a player back from a soft-tissue injury (rule 2): a share limit, or null for none. */
export function medicalSuggestion(gamesBack: number, usualShare: number): SnapLimit | null {
  if (gamesBack <= 1) return { kind: 'share', value: usualShare * P('limits.medicalFirstGame'), medical: true };
  if (gamesBack - 1 === 1) return { kind: 'share', value: usualShare * P('limits.medicalSecondGame'), medical: true };
  return null;
}

/** Development minimum (rule 3): swap the young player in at the first low-leverage dead ball until he has his snaps. */
export function developmentSwapIn(minimum: number, snapsThisGame: number, scoreMargin: number, nonCriticalSeries: boolean): boolean {
  if (snapsThisGame >= minimum) return false;
  return Math.abs(scoreMargin) > P('limits.developmentMargin') || nonCriticalSeries;
}

export interface RedshirtStatus {
  readonly counted: number;
  readonly maxGames: number;
  /** Appearances left before the season is used. */
  readonly remaining: number;
  /** Warn before any snap: the next appearance uses the season (acceptance: four appearances warn before a fifth). */
  readonly warnBeforeSnap: boolean;
  readonly seasonUsed: boolean;
}

/** Redshirt tracker (rule 4), or null where the level's rules have no redshirt line. */
export function redshirtStatus(appearances: { readonly regular: number; readonly postseason: number }, playedToday: boolean, isPostseasonGame: boolean, rules: DepthRules): RedshirtStatus | null {
  const r = rules.redshirt;
  if (r === null) return null;
  const counted = appearances.regular + (r.postseasonCounts ? appearances.postseason : 0);
  const todayCounts = !isPostseasonGame || r.postseasonCounts;
  return {
    counted,
    maxGames: r.maxGames,
    remaining: Math.max(0, r.maxGames - counted),
    warnBeforeSnap: todayCounts && !playedToday && counted >= r.maxGames,
    seasonUsed: counted > r.maxGames,
  };
}
