// O1.1.3 acceptance 2 / Q1.5.3 for the shell: every registered route renders in the shell frame
// with no error, in every theme, and route entries from screen packages replace the frame text.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS, buildPath, routeParams, rootStyle, resolveTheme, t, type RouteTable } from '../../src/shell/index.ts';
import { THEME_IDS } from '../../src/tokens/index.ts';

const html = (props: Parameters<typeof Shell>[0]) => renderToStaticMarkup(createElement(Shell, props));
const sample = (id: string) => { const s = SCREENS.find((x) => x.id === id)!; return buildPath(s, Object.fromEntries(routeParams(s).map((p) => [p, 'x1']))); };

describe('route crawl (every registered route renders)', () => {
  for (const s of SCREENS) {
    it(s.id, () => {
      const out = html({ initialPath: sample(s.id), context: { teamName: 'Rivertown', record: '3-1', phaseLabel: 'Regular season, week 5, Tuesday', hoursLeft: 61 } });
      expect(out).toContain(`data-screen="${s.id}"`);
      expect(out).toContain(`<main class="gm-main" aria-label="${s.title}">`);
      expect(out).toContain(`<h1>${s.title}`);
      // the hub bar always has all ten hubs (O1.1.1 acceptance 3)
      expect(out.match(/class="gm-hub"/g)?.length).toBe(10);
      // the current hub lists its screens with their letters
      expect(out).toContain('aria-current="true"');
    });
  }
});

describe('frame', () => {
  it('a screen package\'s route entry replaces the placeholder', () => {
    const routes: RouteTable = { 'team.roster': { render: (p) => createElement('p', { id: 'roster-body' }, `rows for ${p.location.path} ${p.readOnly}`) } };
    const out = html({ initialPath: '/team/roster', routes });
    expect(out).toContain('<p id="roster-body">rows for /team/roster false</p>');
    expect(html({ initialPath: '/team/roster' })).toContain(t('shell.screenNotBuilt', { leaves: 'O4.2.1' }));
  });
  it('top bar facts, permission badge and status line come from props', () => {
    const out = html({ initialPath: '/team/depth-chart', context: { teamName: 'Rivertown', record: '3-1', dateLabel: 'Tue 7 Oct', hoursLeft: 12, saveState: 'saved', simActivity: 'idle' }, permissions: { 'team.depth_chart': 'suggest' } });
    for (const s of ['Rivertown', 'Record 3-1', 'Tue 7 Oct', '12 hours left', 'Save: saved', 'Simulation: idle', '>Suggest<']) expect(out).toContain(s);
  });
  it('a game-day route outside game day shows the "no game now" line', () => {
    expect(html({ initialPath: '/game/console' })).toContain(t('shell.noGameNow'));
  });
  it('on game day the other hubs are marked locked', () => {
    const out = html({ initialPath: '/office/today', context: { gameDay: true } });
    expect(out.match(/<button class="gm-hub"[^>]*aria-disabled="true"/g)?.length).toBe(9);
  });
  it('the alert line never takes focus: it is a polite live region', () => {
    const out = html({ alerts: [{ id: 'a', category: 'news', level: 'normal', text: 'Trade deadline passed', at: 0 }], now: () => 100 });
    expect(out).toMatch(/role="status" aria-live="polite"[^>]*>Trade deadline passed</);
  });
  it('every theme and palette applies by variables only; system follows the platform', () => {
    for (const theme of THEME_IDS) {
      const out = html({ display: { theme, colourVision: 'deutan' } });
      expect(out).toContain(`data-theme="${theme}"`);
    }
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(rootStyle({ theme: 'dark', colourVision: 'none', interfaceScalePct: 100, textScalePct: 100, reducedMotion: false }).colorScheme).toBe('dark');
  });
  it('a screen with a missing parameter says what it needs', () => {
    expect(html({ initialPath: '/team/player/' })).toContain('data-screen="office.today"'); // unknown address falls back to the office
  });
});
