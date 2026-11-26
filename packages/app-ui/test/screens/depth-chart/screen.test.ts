// team.depth_chart screen: renders in the shell frame, shows lists, the player on the field, inherited
// package jobs, the emergency card, battles and problems; every change is a button or picker that sends an
// edit; nothing is editable for a recommending seat.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS } from '../../../src/shell/index.ts';
import { DepthChartScreen, depthChartRoute, dt, SCREEN_ID, type DepthChartUi, type Tab } from '../../../src/screens/depth-chart/index.ts';

const e = (personId: number, name: string, position: string, over = {}) => ({ personId, name, position, out: false, active: true, ...over });

function view(over: Partial<DepthChartUi> = {}): DepthChartUi {
  return {
    clubId: 7, week: 3, locked: false, onField: 11,
    units: [
      { unitId: 'off:11', side: 'off', base: null, core: false, gaps: [], shares: [{ personId: 1, share: 1 }],
        jobs: [
          { job: 'QB', group: 'qb', mapsTo: null, inherited: false, list: [e(1, 'Al Arm', 'QB', { out: true }), e(2, 'Bo Back', 'QB')], onField: 2 },
          { job: 'RB', group: 'rb', mapsTo: null, inherited: false, list: [], onField: null },
        ] },
      { unitId: 'off:12', side: 'off', base: 'off:11', core: false, gaps: [], shares: [],
        jobs: [{ job: 'QB', group: 'qb', mapsTo: null, inherited: true, list: [e(2, 'Bo Back', 'QB')], onField: 2 }] },
      { unitId: 'st:punt', side: 'st', base: null, core: true, gaps: ['G1'], shares: [],
        jobs: [{ job: 'P', group: 'p', mapsTo: null, inherited: false, list: [e(91, 'Pat Punt', 'P')], onField: 91 }] },
    ],
    problems: [{ leaf: 'M2.1.1', unitId: 'off:11', message: 'RB: empty column, filled at game time and logged as a preparation error' }],
    emergency: [{ need: 'quarterback', personId: 3, name: 'Cy Third' }, { need: 'holder', personId: null, name: null }],
    specialTeams: [{ personId: 63, name: 'Lee Backer', firsts: 2 }], lowValueBackups: [],
    battles: [{ unitId: 'off:11', job: 'X', decideBy: 190, late: true, readinessPenalty: false, competitors: [
      { personId: 20, name: 'Wes Wide', split: 0.5, reps: 40, raw: 70, weighted: 72 }, { personId: 23, name: 'Zed Zone', split: 0.5, reps: 0, raw: null, weighted: null },
    ] }],
    simDepth: { QB: [2], RB: [], P: [91] },
    ...over,
  };
}
const roster = [{ personId: 3, name: 'Cy Third', position: 'QB' }, { personId: 10, name: 'Ray Run', position: 'RB' }];
const html = (v: DepthChartUi | null, tab: Tab, readOnly = false, unitId: string | null = null) =>
  renderToStaticMarkup(createElement(DepthChartScreen, { view: v, roster, tab, unitId, readOnly, refusal: null, onTab: () => {}, onUnit: () => {}, onIntent: () => {} }));
const esc = (x: string) => x.replace(/'/g, '&#x27;');

describe('depth chart screen (M2)', () => {
  it('is registered and its route renders in the shell frame', () => {
    expect(SCREENS.some((s) => s.id === SCREEN_ID)).toBe(true);
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/team/depth-chart?tab=st', routes: { [SCREEN_ID]: depthChartRoute({ view: () => view(), roster: () => roster, dispatch: () => null }) } }));
    expect(out).toContain(`data-screen="${SCREEN_ID}"`);
    expect(out).toContain('data-unit="st:punt"');
  });

  it('shows the order, who is out, and who is on the field', () => {
    const out = html(view(), 'off');
    expect(out).toContain('data-list="off:11/QB"');
    expect(out).toContain(dt('dc.out'));
    expect(out).toContain('data-on-field="2"');
    expect(out).toContain(esc(dt('dc.up', { name: 'Bo Back', job: 'QB' })));
    expect(out).toContain(esc(dt('dc.remove', { name: 'Al Arm', job: 'QB' })));
    expect(out).toContain('data-on-field="none"');
  });

  it('a package job filled from its base says so and can be given its own list', () => {
    const out = html(view(), 'off', false, 'off:12');
    expect(out).toContain('data-inherited="yes"');
    expect(out).toContain(dt('dc.inherited', { base: 'off:11' }));
  });

  it('special teams shows unit gaps and firsts', () => {
    const out = html(view(), 'st');
    expect(out).toContain(dt('dc.unit.gaps', { jobs: 'G1' }));
    expect(out).toContain(dt('dc.st.row', { name: 'Lee Backer', count: 2 }));
  });

  it('the emergency card names each need and flags an empty one', () => {
    const out = html(view(), 'emergency');
    expect(out).toContain('data-need="quarterback"');
    expect(out).toContain('Cy Third');
    expect(out).toContain(dt('dc.emergency.none'));
  });

  it('battles show reps, grades and the clock, with a button to decide', () => {
    const out = html(view(), 'battles');
    expect(out).toContain(dt('dc.battle.late'));
    expect(out).toContain(dt('dc.battle.decide', { name: 'Zed Zone' }));
    expect(out).toContain(dt('dc.battle.noGrade'));
  });

  it('problems come from the model', () => {
    expect(html(view(), 'problems')).toContain('data-leaf="M2.1.1"');
    expect(html(view({ problems: [] }), 'problems')).toContain(dt('dc.problems.none'));
  });

  it('a recommending seat cannot edit', () => {
    const out = html(view(), 'off', true);
    expect(out).toContain(esc(dt('dc.readOnly')));
    expect(out).not.toContain(esc(dt('dc.up', { name: 'Bo Back', job: 'QB' })));
    expect(out).not.toContain(dt('dc.addButton'));
  });

  it('says how much of the chart the game will use', () => {
    expect(html(view(), 'off')).toContain(dt('dc.gameMap', { count: 2 }));
  });
});
