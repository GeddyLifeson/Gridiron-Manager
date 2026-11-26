// The pro player board (M3.1.1): coverage plan, the scouts' queue with finite hours, and board rows built
// from estimates only. The colour-tier view (M3.1.2). Level-neutral: a college program runs the same board
// over its portal pool (M3.7.1).
import { P } from './params.ts';
import defaults from './defaults.json' with { type: 'json' };
import type { Graded } from './types.ts';

// ---------- coverage plan (M3.1.1 rules 1 and 4) ----------

export interface Scout { readonly staffId: number; readonly hoursPerWeek: number }

/**
 * Splits the clubs among the pro scouts in order (clubs listed by division keep divisions together), as
 * evenly as the count allows. Warns when a scout holds fewer than 4 or more than 6 (starting range).
 */
export function assignClubs(scouts: readonly Scout[], clubIds: readonly number[]): { assignments: Record<string, number[]>; warnings: string[] } {
  const assignments: Record<string, number[]> = {};
  const warnings: string[] = [];
  const ids = [...scouts].map((s) => s.staffId).sort((a, b) => a - b);
  if (ids.length === 0) return { assignments, warnings: clubIds.length ? ['no pro scouts: every club shows only the public estimate'] : [] };
  for (const id of ids) assignments[String(id)] = [];
  const per = Math.ceil(clubIds.length / ids.length);
  clubIds.forEach((c, i) => { assignments[String(ids[Math.min(ids.length - 1, Math.floor(i / per))]!)]!.push(c); });
  for (const id of ids) {
    const n = assignments[String(id)]!.length;
    if (n < P.clubsPerScoutMin || n > P.clubsPerScoutMax) warnings.push(`scout ${id} covers ${n} clubs (starting range ${P.clubsPerScoutMin} to ${P.clubsPerScoutMax})`);
  }
  return { assignments, warnings };
}

/** Scout-hours to grade a number of snaps (rule 3: starting 1 scout-hour per 40 snaps). */
export function hoursForSnaps(snaps: number): number { return snaps / P.snapsPerScoutHour; }

/**
 * Average age in days of the club's looks on a scout's clubs over a steady year: each club gets the
 * full reviews the scout's hours allow (rule 1 schedules a starting two a year; `scheduledReviewsMet` says
 * whether the hours reach them). Fewer scouts means more clubs each and older looks (acceptance: one scout removed, looks age).
 */
export function averageLookAgeDays(scout: Scout, clubCount: number, snapsPerClubReview: number): number {
  if (clubCount <= 0) return 0;
  const hoursPerYear = scout.hoursPerWeek * P.weeksPerYear;
  const reviewsPerYear = hoursPerYear / (hoursForSnaps(snapsPerClubReview) * clubCount);
  if (!(reviewsPerYear > 0)) return P.daysPerYear;
  // A look's age runs evenly from zero to the review interval, so its mean is half the interval.
  return P.daysPerYear / reviewsPerYear / P.lookAgeMeanDivisor;
}

/** Whether a scout's hours cover the scheduled full reviews of his clubs (rule 1: a starting two a year). */
export function scheduledReviewsMet(scout: Scout, clubCount: number, snapsPerClubReview: number): boolean {
  return scout.hoursPerWeek * P.weeksPerYear >= hoursForSnaps(snapsPerClubReview) * clubCount * P.fullReviewsPerYear;
}

// ---------- the queue (rules 2, 3 and 4) ----------

export type WorkKind = 'request' | 'advance' | 'review';
export interface WorkItem {
  readonly id: string;
  readonly kind: WorkKind;
  /** A player id, or a club id for a review or advance item. */
  readonly target: number;
  readonly snaps: number;
  readonly dueDay: number;
  /** Day the item entered the queue; user requests ask for a look "next" and so go first. */
  readonly addedDay: number;
}

const KIND_ORDER: Record<WorkKind, number> = { request: 0, advance: 1, review: 1 };

/** Queue order: user requests first (rule 4: they displace scheduled work), then by due day, then entry, then id. */
export function queueOrder(items: readonly WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.dueDay - b.dueDay || a.addedDay - b.addedDay || a.id.localeCompare(b.id));
}

/** One week's work for one scout: items done inside his hours, and what slips (shown on screen, rule 4). */
export function planWeek(items: readonly WorkItem[], hours: number): { done: WorkItem[]; slipped: WorkItem[] } {
  const done: WorkItem[] = [], slipped: WorkItem[] = [];
  let left = hours;
  for (const it of queueOrder(items)) {
    const h = hoursForSnaps(it.snaps);
    if (h <= left) { done.push(it); left -= h; } else slipped.push(it);
  }
  return { done, slipped };
}

// ---------- board rows (rules 5 and 6) ----------

export interface ClubLook {
  readonly grade: Graded;
  readonly lastLookDay: number;
  readonly evaluatorId: number;
}

export interface BoardRow {
  readonly personId: number;
  readonly grade: Graded;
  readonly source: 'club' | 'public';
  readonly lastLookDay: number | null;
  readonly evaluatorId: number | null;
  readonly noClubLook: boolean;
}

/**
 * The club's row for a player: its own look when one is recent enough, else the public (media consensus)
 * estimate with a "no club look" mark and a band widened to at least the public floor (rule 6). The row
 * takes estimates only, so changing a hidden rating with evidence frozen cannot move it (acceptance).
 */
export function boardRow(personId: number, look: ClubLook | null, publicEstimate: Graded, today: number): BoardRow {
  if (look && today - look.lastLookDay <= P.recentLookDays) {
    return { personId, grade: look.grade, source: 'club', lastLookDay: look.lastLookDay, evaluatorId: look.evaluatorId, noClubLook: false };
  }
  const variance = Math.max(publicEstimate.variance, P.publicEstimateMinVariance);
  return { personId, grade: { mean: publicEstimate.mean, variance }, source: 'public', lastLookDay: look?.lastLookDay ?? null, evaluatorId: look?.evaluatorId ?? null, noClubLook: true };
}

// ---------- colour tiers (M3.1.2) ----------

export type ColourTier = 'blue' | 'red' | 'purple' | 'orange' | 'none';
export interface TierCuts { readonly blue: number; readonly red: number; readonly purple: number; readonly orange: number }
export const DEFAULT_CUTS: TierCuts = { blue: defaults.tierCuts.blue, red: defaults.tierCuts.red, purple: defaults.tierCuts.purple, orange: defaults.tierCuts.orange };
export const TIER_SHARES = { blue: defaults.tierShares.blue, red: defaults.tierShares.red, purple: defaults.tierShares.purple, orange: defaults.tierShares.orange } as const;

export function tierOf(mean: number, cuts: TierCuts = DEFAULT_CUTS): ColourTier {
  return mean >= cuts.blue ? 'blue' : mean >= cuts.red ? 'red' : mean >= cuts.purple ? 'purple' : mean >= cuts.orange ? 'orange' : 'none';
}

/** Index of the tier (blue 0 .. none 4), for "one tier-step" comparisons (M3.4.1 rule 1, M3.6.1 edge case). */
export function tierIndex(t: ColourTier): number { return ['blue', 'red', 'purple', 'orange', 'none'].indexOf(t); }

/**
 * Per-position cut points from grades so the shares of rostered players per tier are about the starting
 * blue 5, red 30, purple 40, orange 25 percent (rule 1). Cut points are data; this refits them.
 */
export function calibrateTierCuts(means: readonly number[], shares: typeof TIER_SHARES = TIER_SHARES): TierCuts {
  if (means.length === 0) return DEFAULT_CUTS;
  const s = [...means].sort((a, b) => b - a);
  const at = (share: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(share * s.length) - 1))]!;
  return { blue: at(shares.blue), red: at(shares.blue + shares.red), purple: at(shares.blue + shares.red + shares.purple), orange: at(shares.blue + shares.red + shares.purple + shares.orange) };
}

export type Arrow = 'rising' | 'steady' | 'falling';

export interface TierCell {
  readonly tier: ColourTier;
  readonly arrow: Arrow | null;
  /** Position inside the tier: plus above its midpoint, minus below. */
  readonly sign: '+' | '-' | null;
  /** Drawn hatched when the band spans a cut point (rule 3). */
  readonly hatched: boolean;
}

/** Band half-width on the ISS scale (D6.1.1 band, the same z as G-19's display). */
export function bandHalf(g: Graded): number { return P.bandZ * Math.sqrt(Math.max(0, g.variance)); }

/**
 * The colour-tier view of one estimate (M3.1.2). Display only: it reads, never writes (rule 4). Arrow
 * compares with the estimate about 12 months earlier, up or down when the change exceeds the band (rule 2).
 */
export function tierCell(g: Graded, yearAgo: Graded | null, cuts: TierCuts = DEFAULT_CUTS): TierCell {
  const tier = tierOf(g.mean, cuts);
  const half = bandHalf(g);
  const list = [cuts.blue, cuts.red, cuts.purple, cuts.orange];
  const hatched = list.some((c) => g.mean - half < c && g.mean + half >= c);
  let arrow: Arrow | null = null;
  if (yearAgo) arrow = g.mean - yearAgo.mean > half ? 'rising' : yearAgo.mean - g.mean > half ? 'falling' : 'steady';
  const bounds: Record<ColourTier, [number, number] | null> = {
    blue: [cuts.blue, cuts.blue + (cuts.blue - cuts.red)], red: [cuts.red, cuts.blue], purple: [cuts.purple, cuts.red], orange: [cuts.orange, cuts.purple], none: null,
  };
  const b = bounds[tier];
  const sign = b ? (g.mean - b[0] >= b[1] - g.mean ? '+' : '-') : null;
  return { tier, arrow, sign, hatched };
}
