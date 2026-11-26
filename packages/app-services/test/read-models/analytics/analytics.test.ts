// Analytics read models (G-71): registration passes the truth scan, team-internal models build only for
// a team the observer can see inside, and the crawler finds no leak. The view functions are stand-ins
// with the real output shapes; the real ones (@gm/models strength views) are tested in packages/models
// and bound by the integrator (CR-G71-2).
import { describe, it, expect } from 'vitest';
import {
  ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, PUBLIC_OBSERVER, tablesOf,
} from '../../../src/observer/index.ts';
import { analyticsReadModels, ANALYTICS_MODELS, seesTeam, type AnalyticsFunctions, type AnalyticsSources } from '../../../src/read-models/analytics/index.ts';
import { ObservedWorld } from '../../../src/observer/index.ts';
import { fixtureTables, HOME, AWAY, USER, AWAY_COACH } from '../../observer/fixture-world.ts';
import { ANALYTICS_SCHEMAS } from '@gm/schema';

type Access = { teamId: number; tracking: 'full' | 'practice_only' | 'none'; analysts: number; reports: { report: 'decision_chart'; delivery: 'on_schedule' | 'user_builds'; hours: number }[] };

const calls: string[] = [];
const fns: AnalyticsFunctions<unknown, Access, unknown, unknown, string, { personId: number }> = {
  strengthView: (games, teams, competitionId, seasonYear, h) => {
    calls.push(`strength:${games.length}:${teams.length}:${h}`);
    return { competitionId, seasonYear, homeAdvantage: h, homeAdvantageSe: 0, teams: [] };
  },
  accessView: (jobs, teamId, tracking) => {
    const n = (jobs as { teamId?: number }[]).filter((j) => j.teamId === teamId).length;
    return { teamId, tracking, analysts: n, reports: [{ report: 'decision_chart', delivery: n > 0 ? 'on_schedule' : 'user_builds', hours: 6 }] };
  },
  chartView: (chart, access) => (chart && access.reports[0]!.delivery === 'on_schedule'
    ? { delivery: 'on_schedule', cells: [{ yardsToGoalYd: 1, distanceYd: 1, approved: 'go', model: 'go', marginWp: 0.2, coachsCall: false, mark: 'solid' }], twoPoint: [], edits: [] }
    : { delivery: access.reports[0]!.delivery, cells: null, twoPoint: null, edits: [] }),
  trackingView: (level, _today, players) => ({ level, practice: level !== 'none', games: level === 'full', rows: players.map((p) => ({ personId: p.personId, name: `P${p.personId}`, yesterdayYd: 0, ratio: null, flag: null, fromReturnPlan: false, checkOnHim: false, game: null })) }),
};
const sources: AnalyticsSources<string, { personId: number }> = {
  homeAdvantagePrior: () => 1.75,
  trackingLevel: () => 'full',
  chart: (_w, teamId) => `chart-${teamId}`,
  tracking: () => ({ today: 3, players: [{ personId: 101 }] }),
};

const registry = () => {
  const r = new ReadModelRegistry();
  for (const s of analyticsReadModels(ANALYTICS_SCHEMAS, fns, sources)) r.register(s);
  return r;
};

describe('analytics read models', () => {
  const world = tablesOf(fixtureTables());

  it('register: every data field is classed and none is truth', () => {
    expect(registry().names()).toEqual(Object.values(ANALYTICS_MODELS).sort());
  });

  it('strength is public: any observer builds it from games and teams with the home advantage prior', () => {
    calls.length = 0;
    const b = buildReadModel(registry(), world, PUBLIC_OBSERVER, ANALYTICS_MODELS.strength, { competitionId: 1, seasonYear: 2030 });
    expect(b.model.key).toBe('analyticsStrength(competitionId=1,seasonYear=2030)');
    expect(b.inputs).toEqual(['games', 'teams']);
    expect(calls[0]).toMatch(/^strength:1:2:1.75$/);
    expect(() => buildReadModel(registry(), world, PUBLIC_OBSERVER, ANALYTICS_MODELS.strength, { competitionId: 1 })).toThrow(/seasonYear/);
  });

  it('team-internal models build for the observer’s own team and stay empty for another club', () => {
    const me = observerFor(world, USER);
    expect(seesTeam(new ObservedWorld(world, me), HOME)).toBe(true);
    const own = buildReadModel(registry(), world, me, ANALYTICS_MODELS.chart, { teamId: HOME }).model.data as { visible: boolean; chart: { cells: unknown[] | null } };
    expect(own.visible).toBe(true);
    expect(own.chart.cells).not.toBeNull();
    for (const name of [ANALYTICS_MODELS.chart, ANALYTICS_MODELS.access, ANALYTICS_MODELS.tracking]) {
      expect(buildReadModel(registry(), world, me, name, { teamId: AWAY }).model.data).toEqual({ teamId: AWAY, visible: false });
      expect(buildReadModel(registry(), world, PUBLIC_OBSERVER, name, { teamId: HOME }).model.data).toEqual({ teamId: HOME, visible: false });
    }
    const t = buildReadModel(registry(), world, me, ANALYTICS_MODELS.tracking, { teamId: HOME }).model.data as { report: { rows: unknown[] } };
    expect(t.report.rows.length).toBe(1);
  });

  it('Q1.4.2 crawl: no truth reaches any analytics model for the user, the other coach or the public', () => {
    const report = crawlReadModels({
      registry,
      source: world,
      observers: [{ name: 'user', observer: observerFor(world, USER) }, { name: 'away', observer: observerFor(world, AWAY_COACH) }, { name: 'public', observer: PUBLIC_OBSERVER }],
      params: (m) => (m === ANALYTICS_MODELS.strength ? [{ competitionId: 1, seasonYear: 2030 }] : [{ teamId: HOME }, { teamId: AWAY }]),
    });
    expect(report.errors).toEqual([]);
    expect(crawlPassed(report)).toBe(true);
    expect(report.built).toBeGreaterThan(0);
  });
});
