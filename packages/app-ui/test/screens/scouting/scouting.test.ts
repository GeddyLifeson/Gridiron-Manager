// G-66 screens: the self-scout and scouting report routes render tables with counts beside every rate.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell } from '../../../src/shell/index.ts';
import { scoutingRoutes, cellText, ScoutingScreen, type ScoutingView } from '../../../src/screens/scouting/index.ts';

const view: ScoutingView = {
  subject: 'self', teamName: 'Rivertown', windowLabel: 'last 3 games', windowGames: 3, measure: 'run or pass', cuts: ['formation'],
  cells: [
    { key: 'heavy', cuts: { formation: 'heavy' }, calls: 20, nEff: 20, thin: false, countsOnly: false, band: 'strong', bandOutcome: 'run', outcomes: [{ outcome: 'run', count: 18, rate: 0.9, low: 0.74, high: 0.97, leagueRate: null }, { outcome: 'pass', count: 2, rate: 0.1, low: 0.03, high: 0.26, leagueRate: null }] },
    { key: 'empty', cuts: { formation: 'empty' }, calls: 4, nEff: 4, thin: true, countsOnly: true, band: null, bandOutcome: null, outcomes: [{ outcome: 'pass', count: 4, rate: null, low: null, high: null, leagueRate: null }] },
  ],
  exposure: [{ key: 'heavy', label: 'heavy formation', band: 'strong', calls: 20, shareInWindow: 1, top: true }],
  tells: [{ feature: 'formation', value: 'heavy', givesAway: 'run', count: 18, snaps: 20, kept: false }],
  predictability: { index: 0.081, calls: 180, words: 'an opponent guessing from your situations alone would call run or pass right 71% of the time' },
  taggerLine: null,
};

describe('scouting screens', () => {
  it('no rate appears without its count; counts only under 5 calls', () => {
    expect(cellText(view.cells[0]!, 'run')).toBe('90%, 18 of 20, 74% to 97%');
    expect(cellText(view.cells[1]!, 'pass')).toBe('4 of 4');
    expect(cellText(view.cells[1]!, 'run')).toBe('0 of 4');
  });
  it('both routes render inside the shell, and each highlighted cell names its window and count', () => {
    const routes = scoutingRoutes(() => view);
    for (const path of ['/football/self-scout', '/week/scouting-report']) {
      const out = renderToStaticMarkup(createElement(Shell, { initialPath: path, routes }));
      expect(out).toContain('data-scouting');
      expect(out).toContain('strong: run (last 3 games, 20 calls)');
      expect(out).toContain('71% of the time');
    }
  });
  it('an empty window says so rather than hiding the screen', () => {
    const out = renderToStaticMarkup(createElement(ScoutingScreen, { view: null, screenId: 'week.scouting_report', window: 'last3' }));
    expect(out).toContain('No charted plays');
    expect(out).toContain('aria-pressed="true"');
  });
});
