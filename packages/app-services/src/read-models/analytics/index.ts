// Analytics read models (G-71, N2.4 to N2.7): the league strength table, the week's analytics report
// plan, the decision chart and the tracking report, each built from an ObservedWorld only.
//
// Wiring is injected, for two contract reasons the PR names:
//   - CR-G71-1 (same as CR-G27-4): app-services may not import zod, so the data schemas are passed in.
//     Their definitions sit in test/read-models/analytics/schemas.ts until they move to @gm/schema.
//   - CR-G71-2: the view functions live in @gm/models `strength` (packages/models/src/strength/views.ts),
//     which reaches app-services through the models barrel; the integrator binds them with the engine
//     math (`DMATH`) in `analyticsReadModels(schemas, { ...strength views }, sources)`.
// Team-internal models (access, chart, tracking) build only for a team the observer has a scope on, so
// another club's chart or load report never reaches a screen (K9.1.1).
import type { Params, ReadModelSpec, Schema } from '../../observer/index.ts';
import type { ObservedWorld } from '../../observer/index.ts';

export type TrackingLevel = 'full' | 'practice_only' | 'none';

/** What the access view must expose for the chart gate. */
export interface AccessLike { readonly reports: readonly { readonly report: string; readonly delivery: string }[] }

/** The `strength` view functions of @gm/models, with the engine math bound (CR-G71-2). */
export interface AnalyticsFunctions<S = unknown, A extends AccessLike = AccessLike, C = unknown, T = unknown, Chart = unknown, Player = unknown> {
  strengthView(games: readonly unknown[], teams: readonly unknown[], competitionId: number, seasonYear: number, homeAdvantagePrior: number): S;
  accessView(jobs: readonly unknown[], teamId: number, tracking: TrackingLevel): A;
  chartView(chart: Chart | null, access: A): C;
  trackingView(level: TrackingLevel, today: number, players: readonly Player[]): T;
}

/** Data the analytics models need that other packages own. */
export interface AnalyticsSources<Chart = unknown, Player = unknown> {
  /** Prior centre of home advantage for the competition (rule key `analytics.home_advantage_pts`). */
  homeAdvantagePrior(competitionId: number): number;
  /** Tracking the program has (N2.5.1 rule 5): the program resource table (T area, C1.2.2). */
  trackingLevel(world: ObservedWorld, teamId: number): TrackingLevel;
  /** This week's built chart for the team (G-68 game plan with the staff's estimates), or null. */
  chart(world: ObservedWorld, teamId: number): Chart | null;
  /** Players' load inputs for the team (H3 practice plans, game tracking), or null before any exist. */
  tracking(world: ObservedWorld, teamId: number): { today: number; players: readonly Player[] } | null;
}

export interface AnalyticsSchemas {
  readonly strength: Schema;
  readonly access: Schema;
  readonly chart: Schema;
  readonly tracking: Schema;
}

/** Read-model names, for the route entry and the crawler. */
export const ANALYTICS_MODELS = { strength: 'analyticsStrength', access: 'analyticsAccess', chart: 'analyticsChart', tracking: 'analyticsTracking' } as const;

/** S3 task ids whose permission the chart screen shows (O7.1.1). Named here until G-55 publishes the duty list. */
export const ANALYTICS_TASK_IDS = { chart: ['analytics.decision_chart'], tracking: ['practice.load'] } as const;

function num(p: Params, k: string): number {
  const v = p[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`analytics read model: parameter ${k} must be a number`);
  return v;
}

/** The observer may read inside this team (holds a job, roster spot or executive seat there). */
export function seesTeam(world: ObservedWorld, teamId: number): boolean {
  const s = world.observer.teamScopes[String(teamId)];
  return s !== undefined && s.length > 0;
}

export function analyticsReadModels<A extends AccessLike, Chart, Player>(
  schemas: AnalyticsSchemas, fns: AnalyticsFunctions<unknown, A, unknown, unknown, Chart, Player>, sources: AnalyticsSources<Chart, Player>,
): ReadModelSpec[] {
  const access = (world: ObservedWorld, teamId: number): A => fns.accessView(world.table('jobs'), teamId, sources.trackingLevel(world, teamId));
  const noTeam = (teamId: number) => ({ teamId, visible: false });

  const strength: ReadModelSpec = {
    name: ANALYTICS_MODELS.strength,
    data: schemas.strength,
    build(world, p) {
      const competitionId = num(p, 'competitionId'), seasonYear = num(p, 'seasonYear');
      return { data: fns.strengthView(world.table('games'), world.table('teams'), competitionId, seasonYear, sources.homeAdvantagePrior(competitionId)) };
    },
  };

  const accessModel: ReadModelSpec = {
    name: ANALYTICS_MODELS.access,
    data: schemas.access,
    build(world, p) {
      const teamId = num(p, 'teamId');
      if (!seesTeam(world, teamId)) return { data: noTeam(teamId) };
      return { data: { teamId, visible: true, plan: access(world, teamId) } };
    },
  };

  const chart: ReadModelSpec = {
    name: ANALYTICS_MODELS.chart,
    data: schemas.chart,
    taskIds: ANALYTICS_TASK_IDS.chart,
    build(world, p) {
      const teamId = num(p, 'teamId');
      if (!seesTeam(world, teamId)) return { data: noTeam(teamId) };
      return { data: { teamId, visible: true, chart: fns.chartView(sources.chart(world, teamId), access(world, teamId)) } };
    },
  };

  const tracking: ReadModelSpec = {
    name: ANALYTICS_MODELS.tracking,
    data: schemas.tracking,
    taskIds: ANALYTICS_TASK_IDS.tracking,
    build(world, p) {
      const teamId = num(p, 'teamId');
      if (!seesTeam(world, teamId)) return { data: noTeam(teamId) };
      const level = sources.trackingLevel(world, teamId);
      const t = sources.tracking(world, teamId);
      return { data: { teamId, visible: true, report: fns.trackingView(level, t?.today ?? 0, t?.players ?? []) } };
    },
  };

  return [strength, accessModel, chart, tracking];
}
