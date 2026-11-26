// G-70 screen: renders inside the shell frame for team.roster_moves, every action is a button (Q1.5.2),
// the counters, coverage board and refusals come from the model, and nothing is editable after the lock
// or for a seat that only recommends.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS } from '../../../src/shell/index.ts';
import { RosterMovesScreen, rosterMovesRoute, rmTextIds, rt, SCREEN_ID, type RosterIntent, type RosterMovesUi, type Tab } from '../../../src/screens/roster-moves/index.ts';

const player = (personId: number, over: Partial<RosterMovesUi['players'][number]> = {}) => ({
  personId, name: `Player ${personId}`, position: personId === 10 ? 'QB' : 'X', elevated: false, designation: null, out: false, quarterback: personId === 10 || personId === 12,
  jobs: [], specialTeamsFirsts: 0, candidate: true, active: personId <= 48, ...over,
});

function view(over: Partial<RosterMovesUi> = {}, active: Partial<NonNullable<RosterMovesUi['active']>> = {}): RosterMovesUi {
  const actives = Array.from({ length: 48 }, (_, i) => i + 1);
  return {
    clubId: 1, hasGameDayLimit: true, hasPracticeSquad: true,
    markers: [
      { type: 'injury_review', status: 'closed', hoursLeft: 0, target: 'review', button: null },
      { type: 'last_transactions', status: 'amber', hoursLeft: 20, target: 'elevations', button: 'do_it' },
      { type: 'inactives', status: 'open', hoursLeft: 45, target: 'active_list', button: 'do_it' },
    ],
    players: [...Array.from({ length: 53 }, (_, i) => player(i + 1)), player(101, { candidate: false, active: false })],
    coverage: [
      { unitId: 'off:base', role: 'qb', starter: 10, backup: 12, emergency: null, level: 'ok' },
      { unitId: 'off:base', role: 'rb', starter: null, backup: null, emergency: null, level: 'red' },
    ],
    units: [{ unitId: 'st:punt', named: 10, needed: 11, level: 'red' }],
    active: {
      actives, emergencyQb: null, count: 48, limit: 48, linemenActive: 8, minLinemen: 8, floor: 44, inactives: [49, 50, 51, 52, 53], refusal: null,
      locked: false, minutesToLock: 2700, redGaps: ['off:base/rb', 'st:punt (10 of 11)'], amberGaps: [], outDressed: [], staffDraft: actives,
      staffReasons: { 1: 'draft.starter' }, emergencyQbOffered: true, ...active,
    },
    elevations: { perGame: 2, usedThisGame: 2, rows: [
      { personId: 101, name: 'Player 101', position: 'QB', used: 1, left: 2, elevated: true, blocked: null },
      { personId: 102, name: 'Player 102', position: 'X', used: 0, left: 3, elevated: false, blocked: 'the club has used both elevations for this game' },
    ] },
    buttons: { game_day_list: 'do_it', elevate: 'ask' },
    ...over,
  };
}

const esc = (x: string) => x.replace(/'/g, '&#x27;');
const html = (v: RosterMovesUi | null, tab: Tab, readOnly = false) =>
  renderToStaticMarkup(createElement(RosterMovesScreen, { view: v, tab, readOnly, onTab: () => {}, onIntent: () => {} }));

describe('roster moves screen (H6.1, H6.2, H6.3.1)', () => {
  it('is registered and its route entry renders in the shell frame', () => {
    expect(SCREENS.some((s) => s.id === SCREEN_ID)).toBe(true);
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/team/roster-moves?tab=active_list', routes: { [SCREEN_ID]: rosterMovesRoute({ view: () => view(), dispatch: () => {} }) } }));
    expect(out).toContain(`data-screen="${SCREEN_ID}"`);
    expect(out).toContain('data-counter="active"');
  });
  it('the strip shows each marker with its status and opens the matching tab', () => {
    const out = html(view(), 'strip');
    expect(out).toContain('data-marker="last_transactions" data-status="amber"');
    expect(out).toContain(rt('rm.status.amber'));
    expect(out).toContain(rt('rm.strip.hoursLeft', { hours: 20 }));
    expect(out.match(/>Open<\/button>/g)?.length).toBe(2);
  });
  it('a bye week says so', () => {
    expect(html(view({ markers: [] }), 'strip')).toContain(rt('rm.strip.bye'));
  });
  it('the active list shows counters, both columns, the coverage board and the gap confirmations', () => {
    const out = html(view(), 'active_list');
    expect(out).toContain(rt('rm.active.counter', { count: 48, limit: 48 }));
    expect(out).toContain(rt('rm.active.linemen', { linemen: 8, min: 8 }));
    expect(out).toContain(rt('rm.active.inactiveCount', { count: 5 }));
    expect(out.match(/data-player="/g)?.length).toBe(53);
    expect(out).toContain('data-level="red"');
    expect(out).toContain('data-gap="off:base/rb"');
    expect(out).toContain(rt('rm.coverage.unitCount', { named: 10, needed: 11 }));
    expect(out).toContain(rt('rm.reason.draft.starter'));
    // red gaps not yet confirmed: the submit button is disabled
    expect(out).toMatch(/<button type="button" disabled="">Submit the list \(Do it\)<\/button>/);
    expect(out).toContain(rt('rm.active.emergencyQb'));
  });
  it('every action is a keyboard-reachable button or form control; no drag is required', () => {
    const out = html(view(), 'active_list');
    expect(out).not.toContain('draggable');
    expect(out).toContain(rt('rm.active.makeInactive', { name: 'Player 1' }));
    expect(out).toContain(rt('rm.active.makeActive', { name: 'Player 49' }));
  });
  it('a refused list and a player dressed against the report are announced', () => {
    const out = html(view({}, { refusal: { rule: 'C5.2.1', message: '49 active with 8 offensive linemen; the limit is 48', fix: 'make more players inactive' }, outDressed: [7] }), 'active_list');
    expect(out).toContain('data-refusal="C5.2.1"');
    expect(out).toContain('role="alert"');
    expect(out).toContain(esc(rt('rm.active.outWarning', { name: 'Player 7' })));
  });
  it('after the lock, and for a seat that recommends, nothing can be changed', () => {
    for (const out of [html(view({}, { locked: true, minutesToLock: 0 }), 'active_list'), html(view(), 'active_list', true)]) {
      expect(out).not.toContain(rt('rm.active.makeInactive', { name: 'Player 1' }));
      expect(out).not.toContain(rt('rm.active.submit'));
    }
    expect(html(view({}, { locked: true }), 'active_list')).toContain(rt('rm.active.locked'));
    expect(html(view(), 'active_list', true)).toContain(esc(rt('rm.readOnly')));
  });
  it('elevations show use, seasons left, the league reason a player is greyed, and the decider button', () => {
    const out = html(view(), 'elevations');
    expect(out).toContain(rt('rm.elev.used', { used: 2, perGame: 2 }));
    expect(out).toContain(rt('rm.elev.elevated'));
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain('the club has used both elevations for this game');
    const free = html(view({ elevations: { perGame: 2, usedThisGame: 0, rows: [{ personId: 103, name: 'Player 103', position: 'X', used: 0, left: 3, elevated: false, blocked: null }] } }), 'elevations');
    expect(free).toContain(`${rt('rm.elev.elevate', { name: 'Player 103' })} (${rt('rm.button.ask')})`);
  });
  it('a level without a practice squad has no elevations tab and shows a dress list', () => {
    const out = html(view({ hasPracticeSquad: false, hasGameDayLimit: false, active: null, elevations: null }), 'active_list');
    expect(out).not.toContain(rt('rm.tab.elevations'));
    expect(out).toContain(rt('rm.college.note'));
  });
  it('intents carry what the host needs', () => {
    const got: RosterIntent[] = [];
    const entry = rosterMovesRoute({ view: () => view(), dispatch: (i) => got.push(i) });
    const el = entry.render({ screen: SCREENS.find((s) => s.id === SCREEN_ID)!, location: { path: '/team/roster-moves', screenId: SCREEN_ID, params: {}, view: { tab: 'elevations' } }, readOnly: false, navigate: () => {}, setView: () => {} }) as { props: { tab: Tab; onIntent(i: RosterIntent): void } };
    expect(el.props.tab).toBe('elevations');
    el.props.onIntent({ kind: 'elevate', personId: 103 });
    expect(got).toEqual([{ kind: 'elevate', personId: 103 }]);
  });
  it('every string the screen uses has text (O6.6.1)', () => {
    const out = [html(view(), 'strip'), html(view(), 'active_list'), html(view(), 'elevations')].join('');
    expect(out).not.toMatch(/>rm\.[a-z_.]+</);
    expect(rmTextIds().length).toBeGreaterThan(40);
  });
});
