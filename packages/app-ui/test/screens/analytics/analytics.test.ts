// Analytics screen (G-71): every tab renders from read-model data, the chart and tracking reports
// respect delivery and program limits, the limits note is always reachable, and the route entry fills
// the registered statistics screen inside the shell.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS, type ScreenProps } from '../../../src/shell/index.ts';
import {
  AnalyticsScreen, analyticsRoute, analyticsTextIds, at, spotLabel, parseTab, ANALYTICS_SCREEN_ID, ANALYTICS_TABS, LIMITS_NOTE_IDS,
  type AnalyticsData, type AnalyticsTab, type ChartCell,
} from '../../../src/screens/analytics/index.ts';

const cells: ChartCell[] = [];
for (const y of [1, 40, 50, 60, 90]) for (const d of [1, 2]) cells.push({ yardsToGoalYd: y, distanceYd: d, approved: y === 90 ? 'punt' : y === 40 ? 'field_goal' : 'go', model: y === 60 ? 'punt' : y === 90 ? 'punt' : y === 40 ? 'field_goal' : 'go', marginWp: y === 50 ? 0.004 : 0.03, coachsCall: y === 50, mark: 'fair' });

const data: AnalyticsData = {
  strength: {
    competitionId: 1, seasonYear: 2030, homeAdvantage: 1.8, homeAdvantageSe: 0.6,
    teams: [
      { teamId: 3, name: 'Town 3', abbreviation: 'T3', offense: 4.2, defense: 1.1, specialTeams: 0.3, total: 5.6, seOffense: 1.2, seDefense: 1.1, seSpecialTeams: 0.4, seTotal: 1.7, games: 6, priorWeight: 0.2, gameIds: [1, 2, 3, 4, 5, 6], mark: 'fair' },
      { teamId: 5, name: 'Town 5', abbreviation: 'T5', offense: -2, defense: -1, specialTeams: 0, total: -3, seOffense: 1.2, seDefense: 1.1, seSpecialTeams: 0.4, seTotal: 1.7, games: 5.25, priorWeight: 0.3, gameIds: [1, 2], mark: 'thin' },
    ],
  },
  access: { teamId: 3, visible: true, plan: { teamId: 3, tracking: 'full', analysts: 2, reports: [{ report: 'decision_chart', delivery: 'on_schedule', hours: 6 }, { report: 'live_wp', delivery: 'late', hours: 3 }] } },
  chart: {
    teamId: 3, visible: true,
    chart: {
      delivery: 'on_schedule', cells,
      twoPoint: [{ scoreDiffBeforeTry: -2, gameSecondsLeft: 120, choice: 'two', marginWp: 0.05, coachsCall: false }, { scoreDiffBeforeTry: 0, gameSecondsLeft: 120, choice: 'kick', marginWp: 0.002, coachsCall: true }],
      edits: [{ id: 'e1', option: 'go', offsetWp: 0.05, reason: 'game_plan_aggression' }],
    },
  },
  tracking: {
    teamId: 3, visible: true,
    report: { level: 'full', practice: true, games: true, rows: [{ personId: 101, name: 'P101 L101', yesterdayYd: 2500, ratio: 1.42, flag: 'spike', fromReturnPlan: false, checkOnHim: true, game: { distanceYd: 1820, highSpeedYd: 300, sprints: 9, topSpeedYdS: 9.6, accelerations: 20, decelerations: 18 } }] },
  },
};

const esc = (s: string) => s.replace(/'/g, '&#x27;');
const html = (tab: AnalyticsTab, d: AnalyticsData = data) => renderToStaticMarkup(createElement(AnalyticsScreen, { tab, data: d, onTab: () => {} }));

describe('analytics screen', () => {
  it('every tab renders without an unfilled text id or slot', () => {
    for (const tab of ANALYTICS_TABS) {
      const out = html(tab);
      expect(out).toContain(`data-tab="${tab}"`);
      expect(out).not.toMatch(/analytics\.[a-z_.]+/);
      expect(out).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it('strength: offense, defense, special teams and total with error bands, confidence and the games behind each row', () => {
    const out = html('strength');
    expect(out).toContain('+4.2 ± 1.2');
    expect(out).toContain('+5.6 ± 1.7');
    expect(out).toContain('data-mark="thin"');
    expect(out).toContain('Games behind Town 3: 6');
    expect(out).toContain('Home advantage 1.8 ± 0.6 points.');
  });

  it('chart: options by cell, coach’s call shading, shifted cells and the head coach’s edits', () => {
    const out = html('chart');
    expect(out).toContain('gm-call');
    expect(out).toContain('4th and 1 at opponent 40: field goal');
    expect(out).toContain('shifted by you from punt');
    expect(out).toContain('go +5.0 points: game_plan_aggression');
    expect(spotLabel(50)).toBe('midfield');
    expect(spotLabel(90)).toBe('own 10');
  });

  it('chart not delivered: the delivery line shows and no grid', () => {
    const noAnalyst: AnalyticsData = { chart: { teamId: 3, visible: true, chart: { delivery: 'user_builds', cells: null, twoPoint: null, edits: [] } } };
    const out = html('chart', noAnalyst);
    expect(out).toContain(esc(at('analytics.delivery.user_builds')));
    expect(out).not.toContain('data-view="chart"');
  });

  it('two-point chart by lead and time', () => {
    const out = html('two_point');
    expect(out).toContain('2:00 left');
    expect(out).toContain('>Two<');
  });

  it('tracking: load ratio, flag and the check-on-him note; a program without tracking says so', () => {
    const out = html('tracking');
    expect(out).toContain('1.42');
    expect(out).toContain('data-flag="spike"');
    expect(out).toContain(esc(at('analytics.tracking.check')));
    const none: AnalyticsData = { tracking: { teamId: 3, visible: true, report: { level: 'none', practice: false, games: false, rows: [] } } };
    expect(html('tracking', none)).toContain(esc(at('analytics.tracking.none')));
  });

  it('another club’s internal reports show the hidden line; a missing model shows waiting', () => {
    const other: AnalyticsData = { chart: { teamId: 5, visible: false }, tracking: { teamId: 5, visible: false }, access: { teamId: 5, visible: false } };
    for (const tab of ['chart', 'tracking', 'staff'] as const) expect(html(tab, other)).toContain(esc(at('analytics.hidden')));
    expect(html('strength', {})).toContain(esc(at('analytics.waiting')));
  });

  it('N2.7.2 rule 3: the limits page lists every item and is always a tab', () => {
    const out = html('limits');
    for (const id of LIMITS_NOTE_IDS) expect(out).toContain(esc(at(id)));
    expect(ANALYTICS_TABS).toContain('limits');
  });

  it('every text id the screen uses exists', () => {
    const ids = new Set(analyticsTextIds());
    for (const id of LIMITS_NOTE_IDS) expect(ids.has(id)).toBe(true);
    for (const k of ['decision_chart', 'team_strength', 'load_report', 'game_tracking', 'variance_brief', 'live_wp']) expect(ids.has(`analytics.report.${k}`)).toBe(true);
    for (const k of ['on_schedule', 'late', 'user_builds', 'not_available']) expect(ids.has(`analytics.delivery.${k}`)).toBe(true);
    expect(parseTab('nonsense')).toBe('strength');
    expect(parseTab('chart')).toBe('chart');
  });
});

describe('route entry', () => {
  it('fills the registered statistics screen in the shell, with the tab from the view options', () => {
    const screen = SCREENS.find((s) => s.id === ANALYTICS_SCREEN_ID)!;
    expect(screen.bible).toContain('N2');
    let seen: ScreenProps | null = null;
    const routes = { [ANALYTICS_SCREEN_ID]: analyticsRoute((p) => { seen = p; return data; }) };
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: `${screen.route}?tab=staff`, routes }));
    expect(out).toContain('data-tab="staff"');
    expect(out).toContain('Fourth-down and two-point chart');
    expect(seen).not.toBeNull();
  });
});
