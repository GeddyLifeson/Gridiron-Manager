// Plain-data views of the analytics models for the read models and screens (G-71). Inputs are rows as
// an observer sees them (public game results, public team identity, the user's own staff jobs), typed
// structurally so this core module needs no app package. The read models in
// app-services/src/read-models/analytics/ call these functions on `ObservedWorld` tables.
import type { DeterministicMath } from '@gm/schema';
import { DEFAULT_REPORT_ORDER, delivered, reportPlan, type AnalyticsWorker, type Delivery, type ReportPlan, type AnalyticsReport } from './access.ts';
import type { DecisionChart, FourthDownOption } from './chart.ts';
import type { ConfidenceMark } from './limits.ts';
import { fitStrength, preseasonPrior, type StrengthGame, type StrengthTable } from './strength.ts';
import { loadRatio, topSpeedNote, trackingReports, type GameMovement, type LoadFlag, type TrackingLevel } from './tracking.ts';

/** The public fields of a game row the strength fit reads (world contract GameRecord). */
export interface GameRowLike {
  readonly id?: number;
  readonly competitionId?: number;
  readonly seasonYear?: number;
  readonly week?: number;
  readonly teamIds?: readonly [number, number];
  readonly neutralSite?: boolean;
  readonly phase?: 'preseason' | 'regular' | 'postseason';
  readonly status?: string;
  readonly finalScore?: readonly [number, number] | null;
}

export interface TeamRowLike {
  readonly id?: number;
  readonly competitionId?: number;
  readonly identity?: { readonly name?: string; readonly abbreviation?: string };
}

/** Final regular-season and postseason games of one competition and season, as strength inputs. Preseason is left out. */
export function strengthGames(rows: readonly GameRowLike[], competitionId: number, seasonYear: number): StrengthGame[] {
  const out: StrengthGame[] = [];
  for (const g of rows) {
    if (g.competitionId !== competitionId || g.seasonYear !== seasonYear) continue;
    if (g.status !== 'final' || !g.finalScore || !g.teamIds || g.id === undefined) continue;
    if (g.phase !== 'regular' && g.phase !== 'postseason') continue;
    out.push({ gameId: g.id, week: g.week ?? 0, teamIds: g.teamIds, neutralSite: g.neutralSite === true, points: g.finalScore });
  }
  return out;
}

export interface StrengthRowView {
  readonly teamId: number;
  readonly name: string;
  readonly abbreviation: string;
  readonly offense: number;
  readonly defense: number;
  readonly specialTeams: number;
  readonly total: number;
  readonly seOffense: number;
  readonly seDefense: number;
  readonly seSpecialTeams: number;
  readonly seTotal: number;
  readonly games: number;
  readonly priorWeight: number;
  readonly gameIds: readonly number[];
  readonly mark: ConfidenceMark;
}

export interface StrengthView {
  readonly competitionId: number;
  readonly seasonYear: number;
  readonly homeAdvantage: number;
  readonly homeAdvantageSe: number;
  /** Rows sorted by total, best first; ties by team id. */
  readonly teams: readonly StrengthRowView[];
}

/**
 * Mark of a strength row: thin while the preseason prior still carries over half the weight, solid
 * once it is under 10 percent (the two points N2.6.1 rule 2 names), fair between.
 */
export function strengthMark(priorWeight: number): ConfidenceMark {
  return priorWeight > 0.5 ? 'thin' : priorWeight < 0.1 ? 'solid' : 'fair';
}

/**
 * The league strength table of one season (N2.6.1 what the user sees). The prior is last season's fit
 * regressed to the mean; the caller adds quarterback changes and college priors when their owners exist.
 */
export function strengthView(
  games: readonly GameRowLike[], teams: readonly TeamRowLike[], competitionId: number, seasonYear: number, homeAdvantagePrior: number, math: DeterministicMath,
): StrengthView {
  const ids = teams.filter((t) => t.competitionId === competitionId && t.id !== undefined).map((t) => t.id!).sort((a, b) => a - b);
  if (ids.length < 2) return { competitionId, seasonYear, homeAdvantage: homeAdvantagePrior, homeAdvantageSe: 0, teams: [] };
  const last = strengthGames(games, competitionId, seasonYear - 1);
  let priors: ReturnType<typeof preseasonPrior>[] = [];
  if (last.length > 0) {
    const prev = fitStrength({ games: last, priors: [], teamIds: ids, homeAdvantagePrior }, math);
    priors = prev.teams.map((t) => preseasonPrior(t.teamId, t));
  }
  const table: StrengthTable = fitStrength({ games: strengthGames(games, competitionId, seasonYear), priors, teamIds: ids, homeAdvantagePrior }, math);
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rows: StrengthRowView[] = table.teams.map((t) => ({
    teamId: t.teamId,
    name: byId.get(t.teamId)?.identity?.name ?? '',
    abbreviation: byId.get(t.teamId)?.identity?.abbreviation ?? '',
    offense: t.offense, defense: t.defense, specialTeams: t.specialTeams, total: t.total,
    seOffense: t.se.offense, seDefense: t.se.defense, seSpecialTeams: t.se.specialTeams, seTotal: t.se.total,
    games: t.games, priorWeight: t.priorWeight, gameIds: [...t.gameIds], mark: strengthMark(t.priorWeight),
  })).sort((a, b) => b.total - a.total || a.teamId - b.teamId);
  return { competitionId, seasonYear, homeAdvantage: table.homeAdvantage, homeAdvantageSe: table.homeAdvantageSe, teams: rows };
}

// ---------------------------------------------------------------- staff access (N2.7.1)

/** The staff job fields the access plan reads (world contract JobRecord), for the observer's own team. */
export interface JobRowLike {
  readonly teamId?: number;
  readonly holderPersonId?: number | null;
  readonly dutyIds?: readonly string[];
  readonly holderSince?: unknown;
}

/**
 * Duty id that marks an analytics seat. A named assumption until the S3 duty catalogue (G-55) names the
 * analytics duties: any seat whose duties include it counts as one full analyst.
 */
export const ASSUMED_ANALYTICS_DUTY = 'analytics.reports';

export interface AccessView {
  readonly teamId: number;
  readonly tracking: TrackingLevel;
  readonly analysts: number;
  readonly reports: readonly ReportPlan[];
}

/** The week's report plan from the team's held analytics seats (N2.7.1). Rates are typical until G-47 records observed work. */
export function accessView(jobs: readonly JobRowLike[], teamId: number, tracking: TrackingLevel, order: readonly AnalyticsReport[] = DEFAULT_REPORT_ORDER): AccessView {
  const workers: AnalyticsWorker[] = jobs
    .filter((j) => j.teamId === teamId && j.holderPersonId !== null && j.holderPersonId !== undefined && (j.dutyIds ?? []).includes(ASSUMED_ANALYTICS_DUTY))
    .map((j) => ({ personId: j.holderPersonId!, share: 1, rate: 1 }));
  return { teamId, tracking, analysts: workers.length, reports: reportPlan({ workers, tracking, order }) };
}

// ---------------------------------------------------------------- decision chart (N2.4.1)

export interface ChartCellView {
  readonly yardsToGoalYd: number;
  readonly distanceYd: number;
  readonly approved: FourthDownOption;
  readonly model: FourthDownOption;
  readonly marginWp: number;
  readonly coachsCall: boolean;
  readonly mark: ConfidenceMark;
}

export interface ChartView {
  readonly delivery: Delivery;
  /** Null when the chart was not delivered this week (no analyst, or late). */
  readonly cells: readonly ChartCellView[] | null;
  readonly twoPoint: readonly { readonly scoreDiffBeforeTry: number; readonly gameSecondsLeft: number; readonly choice: 'kick' | 'two'; readonly marginWp: number; readonly coachsCall: boolean }[] | null;
  readonly edits: readonly { readonly id: string; readonly option: FourthDownOption; readonly offsetWp: number; readonly reason: string }[];
}

/** The chart as the screen shows it, gated by the week's report plan (N2.7.1 acceptance). */
export function chartView(chart: DecisionChart | null, access: AccessView): ChartView {
  const plan = access.reports.find((p) => p.report === 'decision_chart');
  const delivery: Delivery = plan?.delivery ?? 'user_builds';
  if (!chart || !delivered(access.reports, 'decision_chart')) return { delivery, cells: null, twoPoint: null, edits: [] };
  return {
    delivery,
    cells: chart.cells.map((c) => ({ yardsToGoalYd: c.yardsToGoalYd, distanceYd: c.distanceYd, approved: c.approved, model: c.model, marginWp: c.margin, coachsCall: c.coachsCall, mark: c.confidence.mark })),
    twoPoint: chart.twoPoint.map((c) => ({ scoreDiffBeforeTry: c.scoreDiffBeforeTry, gameSecondsLeft: c.gameSecondsLeft, choice: c.choice, marginWp: c.margin, coachsCall: c.coachsCall })),
    edits: chart.edits.map((e) => ({ id: e.id, option: e.option, offsetWp: e.offsetWp, reason: e.reason })),
  };
}

// ---------------------------------------------------------------- tracking (N2.5.1)

/** One player's inputs for the morning load report and the game tracking report. */
export interface TrackingPlayerInput {
  readonly personId: number;
  readonly name: string;
  /** Daily load (distance, yards) by day index; from practice plans (rule 2) and games (rule 1). */
  readonly dailyDistance: ReadonlyMap<number, number>;
  readonly historyStartDay: number;
  /** Weekly load from the return-to-play plan when he has no 28-day base (edge cases). */
  readonly returnPlanWeekly?: number | null;
  /** Last game's movement (rule 1); null when no game is tracked. */
  readonly lastGame?: GameMovement | null;
  /** Top speed of each game this season, in order (rule 4). */
  readonly gameTopSpeeds?: readonly number[];
}

export interface TrackingRowView {
  readonly personId: number;
  readonly name: string;
  readonly yesterdayYd: number;
  readonly ratio: number | null;
  readonly flag: LoadFlag | null;
  readonly fromReturnPlan: boolean;
  readonly checkOnHim: boolean;
  readonly game: GameMovement | null;
}

export interface TrackingView {
  readonly level: TrackingLevel;
  readonly practice: boolean;
  readonly games: boolean;
  readonly rows: readonly TrackingRowView[];
}

/** The load report and game tracking rows (N2.5.1 what the user sees), cut to what the program tracks (rule 5). */
export function trackingView(level: TrackingLevel, today: number, players: readonly TrackingPlayerInput[]): TrackingView {
  const avail = trackingReports(level);
  if (!avail.practice) return { level, practice: false, games: false, rows: [] };
  const rows = players.map((p) => {
    const r = loadRatio(p.dailyDistance, today, p.historyStartDay, p.returnPlanWeekly ?? null);
    return {
      personId: p.personId, name: p.name, yesterdayYd: p.dailyDistance.get(today) ?? 0,
      ratio: r.ratio, flag: r.flag, fromReturnPlan: r.fromReturnPlan,
      checkOnHim: avail.games && topSpeedNote(p.gameTopSpeeds ?? []),
      game: avail.games ? p.lastGame ?? null : null,
    };
  }).sort((a, b) => a.personId - b.personId);
  return { level, practice: avail.practice, games: avail.games, rows };
}
