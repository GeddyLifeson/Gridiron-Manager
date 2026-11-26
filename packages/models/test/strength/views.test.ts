// Plain-data views for the read models: strength table from game rows, access from staff jobs, the
// chart gated by the report plan, tracking cut to what the program tracks.
import { describe, it, expect } from 'vitest';
import { MATH, baselineWp, fixtureRules } from '../helpers/fixtures.ts';
import {
  strengthGames, strengthView, accessView, chartView, trackingView, buildDecisionChart, chartRuleValues, neutralBase,
  ASSUMED_ANALYTICS_DUTY, type GameRowLike, type TeamRowLike,
} from '../../src/strength/index.ts';

const teams: TeamRowLike[] = [1, 2, 3, 4].map((id) => ({ id, competitionId: 1, identity: { name: `Town ${id}`, abbreviation: `T${id}` } }));
let gid = 1;
const game = (season: number, week: number, a: number, b: number, pa: number, pb: number, over: Partial<GameRowLike> = {}): GameRowLike =>
  ({ id: gid++, competitionId: 1, seasonYear: season, week, teamIds: [a, b], neutralSite: false, phase: 'regular', status: 'final', finalScore: [pa, pb], ...over });

describe('strength view', () => {
  const rows: GameRowLike[] = [
    game(2029, 1, 1, 2, 35, 10), game(2029, 1, 3, 4, 20, 17), game(2029, 2, 1, 3, 31, 14), game(2029, 2, 2, 4, 13, 20),
    game(2030, 1, 1, 4, 28, 7), game(2030, 1, 2, 3, 17, 20),
    game(2030, 2, 1, 2, 0, 0, { status: 'scheduled', finalScore: null }),
    game(2030, 0, 1, 2, 3, 40, { phase: 'preseason' }),
    game(2030, 1, 1, 2, 3, 40, { competitionId: 9 }),
  ];

  it('reads final regular and postseason games of the season only', () => {
    expect(strengthGames(rows, 1, 2030).map((g) => g.teamIds)).toEqual([[1, 4], [2, 3]]);
  });

  it('uses last season as the prior and sorts best first with marks and the games behind each row', () => {
    const v = strengthView(rows, teams, 1, 2030, 2, MATH);
    expect(v.teams.map((t) => t.teamId)[0]).toBe(1);
    expect(v.teams[0]!.name).toBe('Town 1');
    expect(v.teams[0]!.gameIds).toEqual([5]);
    expect(v.teams.every((t) => t.mark === 'thin')).toBe(true);
    const noPrior = strengthView(rows.filter((g) => g.seasonYear === 2030), teams, 1, 2030, 2, MATH);
    expect(noPrior.teams[0]!.total).not.toBeCloseTo(v.teams[0]!.total, 6);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
  });

  it('a competition with fewer than two teams shows an empty table', () => {
    expect(strengthView(rows, teams.slice(0, 1), 1, 2030, 2, MATH).teams).toEqual([]);
  });
});

describe('access and chart views', () => {
  const jobs = [
    { teamId: 1, holderPersonId: 11, dutyIds: [ASSUMED_ANALYTICS_DUTY] },
    { teamId: 1, holderPersonId: null, dutyIds: [ASSUMED_ANALYTICS_DUTY] },
    { teamId: 2, holderPersonId: 12, dutyIds: [ASSUMED_ANALYTICS_DUTY] },
    { teamId: 1, holderPersonId: 13, dutyIds: ['practice.plan'] },
  ];
  const rules = chartRuleValues(fixtureRules({ 'try.kick_points': 1, 'try.two_point_points': 2, 'series.yards_to_gain': 10, 'field.goal_to_goal_yd': 100, 'fg.miss_spot_min_yardline': 20 }));
  const est = { convert: () => 0.5, fieldGoal: (y: number) => (y < 30 ? 0.8 : 0), missedFieldGoalSpot: (y: number) => 93 - y, punt: (y: number) => (y < 40 ? null : 75), kickTry: 0.95, twoPoint: 0.48 };
  const chart = buildDecisionChart(baselineWp(), neutralBase(3, 0, false), rules, est, [], MATH);

  it('counts held analytics seats of the team only', () => {
    expect(accessView(jobs, 1, 'full').analysts).toBe(1);
    expect(accessView([], 1, 'full').reports.every((r) => r.delivery === 'user_builds')).toBe(true);
  });

  it('the chart reaches the screen only when the analysts delivered it', () => {
    const v = chartView(chart, accessView(jobs, 1, 'full'));
    expect(v.delivery).toBe('on_schedule');
    expect(v.cells!.length).toBe(chart.cells.length);
    const none = chartView(chart, accessView([], 1, 'full'));
    expect(none).toEqual({ delivery: 'user_builds', cells: null, twoPoint: null, edits: [] });
  });
});

describe('tracking view', () => {
  const daily = new Map<number, number>(Array.from({ length: 28 }, (_, i) => [i, i >= 21 ? 2500 : 1000]));
  const players = [{ personId: 7, name: 'P7', dailyDistance: daily, historyStartDay: 0, gameTopSpeeds: [9.8, 9.2, 9.1], lastGame: null }];

  it('full tracking flags a spike and the top-speed drop; a program without tracking shows nothing', () => {
    const v = trackingView('full', 27, players);
    expect(v.rows[0]).toMatchObject({ personId: 7, flag: 'spike', checkOnHim: true, yesterdayYd: 2500 });
    expect(trackingView('practice_only', 27, players).rows[0]!.checkOnHim).toBe(false);
    expect(trackingView('none', 27, players)).toEqual({ level: 'none', practice: false, games: false, rows: [] });
  });
});
