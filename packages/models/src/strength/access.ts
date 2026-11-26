// Who produces the numbers, by staff and program (N2.7.1). Analytics is staff work: each report costs
// staff hours, staff capacity sets how many arrive by the weekly deadline, and with no analyst the user
// builds them himself from the query screens. The models are always computed for scoring (N3, N4):
// only access varies (rule 2).
import { param } from './params.ts';
import type { TrackingLevel } from './tracking.ts';

export type AnalyticsReport = 'decision_chart' | 'team_strength' | 'load_report' | 'game_tracking' | 'variance_brief' | 'live_wp';
/** Default build order with a thin staff; the head coach may reorder it (N2.7.1 decision created). */
export const DEFAULT_REPORT_ORDER: readonly AnalyticsReport[] = ['decision_chart', 'team_strength', 'load_report', 'game_tracking', 'variance_brief', 'live_wp'];

const HOURS_PARAM: Record<AnalyticsReport, string> = {
  decision_chart: 'access.hours.chart',
  team_strength: 'access.hours.strength',
  load_report: 'access.hours.load',
  game_tracking: 'access.hours.gameTracking',
  variance_brief: 'access.hours.variance',
  live_wp: 'access.hours.liveWp',
};

export function reportHours(r: AnalyticsReport): number { return param(HOURS_PARAM[r]); }

/** One person who can build reports: an analyst on staff, or the user at an analyst or quality-control rung. */
export interface AnalyticsWorker {
  readonly personId: number;
  /** Share of a full analyst week this person gives to analytics (0 to 1). */
  readonly share: number;
  /** Observed work rate relative to a typical analyst (1 = typical). From the staff record, never a picked trait. */
  readonly rate: number;
  /** The worker started this week: reports begin the following week (edge cases). */
  readonly startedThisWeek?: boolean;
}

export type Delivery = 'on_schedule' | 'late' | 'user_builds' | 'not_available';

export interface ReportPlan {
  readonly report: AnalyticsReport;
  readonly delivery: Delivery;
  readonly hours: number;
}

export interface AccessInputs {
  readonly workers: readonly AnalyticsWorker[];
  /** Tracking the program has (rule 5 of N2.5.1); game tracking and load reports need it. */
  readonly tracking: TrackingLevel;
  readonly order?: readonly AnalyticsReport[];
}

/**
 * The week's report plan (rule 1). Capacity is the sum of each worker's share times rate times a full
 * analyst week; reports are built in order while capacity lasts, the rest arrive late. With no worker at
 * all every report is left for the user to build. Reports the program's tracking cannot support are
 * "not available at this program".
 */
export function reportPlan(inp: AccessInputs): ReportPlan[] {
  const order = inp.order ?? DEFAULT_REPORT_ORDER;
  const active = inp.workers.filter((w) => w.startedThisWeek !== true);
  let capacity = 0;
  for (const w of active) capacity += w.share * w.rate * param('access.analystHours');
  const out: ReportPlan[] = [];
  for (const r of order) {
    const hours = reportHours(r);
    const needsTracking = r === 'game_tracking' ? inp.tracking === 'full' : r === 'load_report' ? inp.tracking !== 'none' : true;
    if (!needsTracking) { out.push({ report: r, delivery: 'not_available', hours }); continue; }
    if (active.length === 0) { out.push({ report: r, delivery: 'user_builds', hours }); continue; }
    if (hours <= capacity + 1e-9) { capacity -= hours; out.push({ report: r, delivery: 'on_schedule', hours }); }
    else out.push({ report: r, delivery: 'late', hours });
  }
  return out;
}

/** Whether a report reaches the user's screen this week on schedule (the Friday chart, live win probability). */
export function delivered(plan: readonly ReportPlan[], r: AnalyticsReport): boolean {
  return plan.some((p) => p.report === r && p.delivery === 'on_schedule');
}

/**
 * Starting table of tracking by program resource band (N2.5.1 rule 5, N2.7.1 rule 3 `analytics_access.college`).
 * A named assumption until the league-rules key exists: pro clubs pass `full` directly.
 */
export const ASSUMED_TRACKING_BY_BAND: Readonly<Record<'low' | 'middle' | 'top', TrackingLevel>> = { low: 'none', middle: 'practice_only', top: 'full' };
