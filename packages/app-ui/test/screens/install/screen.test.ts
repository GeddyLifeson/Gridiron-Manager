// Install board screen (O3.3.2): registered and rendered in the shell frame, days as columns with load and
// the overload warning with the projected loss, cards with periods and prerequisite flags, the tray for a
// short week, readiness with laggers and the D9.4 mental-error line, and the edit lock (G5.3.1).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell, SCREENS } from '../../../src/shell/index.ts';
import { InstallScreen, installRoute, ib, ibTextIds, per100, SCREEN_ID, type InstallUi, type UiCard } from '../../../src/screens/install/index.ts';

const lock = (allowed: boolean, heldBy: string | null = null, suggest = false) => ({ allowed, heldBy, suggest });
const card = (unitId: string, over: Partial<UiCard> = {}): UiCard => ({
  unitId, label: unitId.toUpperCase(), kind: 'part', groups: [{ group: 'OL', units: 2 }], load: 2, periods: [], missing: [], installed: false, alwaysUp: false, tray: null, ...over,
});

function view(over: Partial<InstallUi> = {}): InstallUi {
  return {
    teamId: 3, side: 'offense', mode: 'week',
    days: [
      { id: 'practice1', label: 'Practice 1', cards: [card('trips', { installed: true, alwaysUp: true })], load: [{ group: 'OL', units: 14, limit: 12, over: 2, lostShare: 0.75 }], overloaded: true },
      { id: 'practice2', label: 'Practice 2', cards: [card('stick', { kind: 'play', missing: ['slide'], periods: [{ kind: 'meeting', label: 'Install', minutes: 40, reps: null }, { kind: 'practice', label: 'Team 2', minutes: null, reps: 6 }] })], load: [{ group: 'OL', units: 3, limit: 12, over: 0, lostShare: 0 }], overloaded: false },
    ],
    tray: [card('check', { tray: 'day_removed' })],
    readiness: [
      { unitId: 'stick', label: 'STICK', installed: false, groups: [
        { group: 'WR', players: 2, readiness: 31.25, weakest: 20, unjudged: false, laggers: [{ player: 103, name: 'Rookie Receiver', position: 'Z', estimate: 20, errorChance: 0.432, delayS: 0.6 }] },
        { group: 'OL', players: 1, readiness: 0, weakest: 0, unjudged: true, laggers: [] },
      ] },
      { unitId: 'slide', label: 'SLIDE', installed: false, groups: [] },
    ],
    order: ['trips', 'slide', 'stick', 'check'], orderProblem: null,
    numbers: { threshold: 60, dailyLimit: 12, overLimitYield: 0.25, shortWeek: true },
    totals: { placed: 2, unplaced: 1, installed: 1 },
    locks: { edit: lock(true) },
    ...over,
  };
}
const esc = (x: string) => x.replace(/'/g, '&#x27;');
const html = (v: InstallUi | null, readOnly = false) => renderToStaticMarkup(createElement(InstallScreen, { view: v, readOnly, onMode: () => {}, onIntent: () => {} }));

describe('install board screen (O3.3.2)', () => {
  it('is registered and its route renders in the shell frame with side and mode from the address', () => {
    expect(SCREENS.some((s) => s.id === SCREEN_ID)).toBe(true);
    let asked: [string, string] | null = null;
    const host = { view: (side: 'offense' | 'defense' | 'special_teams', mode: 'week' | 'camp') => { asked = [side, mode]; return view({ mode }); }, dispatch: () => {} };
    const out = renderToStaticMarkup(createElement(Shell, { initialPath: '/football/install?side=defense&mode=camp', routes: { [SCREEN_ID]: installRoute(host) } }));
    expect(out).toContain(`data-screen="${SCREEN_ID}"`);
    expect(out).toContain('data-board="install"');
    expect(asked).toEqual(['defense', 'camp']);
  });
  it('days are columns; an overloaded day turns to a warning and states the projected loss', () => {
    const out = html(view());
    expect(out.match(/data-day=/g)?.length).toBe(2);
    expect(out).toContain('data-overloaded="true"');
    expect(out).toContain(ib('ib.day.overloaded'));
    expect(out).toContain(ib('ib.day.over', { group: 'OL', over: 2, lost: 75 }));
    expect(out).toContain(ib('ib.day.load', { group: 'OL', units: 14, limit: 12 }));
  });
  it('cards show load, periods, installed, always-up and a missing prerequisite by name', () => {
    const out = html(view());
    expect(out).toContain(ib('ib.period.meeting', { label: 'Install', minutes: 40 }));
    expect(out).toContain(ib('ib.period.practice', { label: 'Team 2', reps: 6 }));
    expect(out).toContain(ib('ib.card.missing', { units: 'SLIDE' }));
    expect(out).toContain('data-missing="true"');
    expect(out).toContain(ib('ib.card.alwaysUp'));
    expect(out).toContain(ib('ib.card.installed'));
  });
  it('a short week shows the note and the removed day\'s card in the tray', () => {
    const out = html(view());
    expect(out).toContain(ib('ib.shortWeek'));
    expect(out).toContain(ib('ib.tray.day_removed'));
  });
  it('readiness lists groups, unjudged groups and laggers with the D9.4 mental-error line', () => {
    const out = html(view());
    expect(out).toContain(ib('ib.ready.group', { group: 'WR', readiness: 31, weakest: 20, players: 2 }));
    expect(out).toContain(ib('ib.ready.unjudged', { group: 'OL', players: 1 }));
    expect(out).toContain(esc(ib('ib.ready.lagger', { name: 'Rookie Receiver', position: 'Z', estimate: 20, chance: 43, delay: 0.6 })));
    expect(per100(0.004)).toBe(1);
    expect(per100(0)).toBe(0);
  });
  it('a coordinator moves cards and fills; a position coach sees suggest labels; read-only shows no controls', () => {
    const out = html(view());
    expect(out).toContain(ib('ib.fill'));
    expect(out).toContain(ib('ib.card.moveTo', { label: 'STICK' }));
    expect(out).toContain('draggable="true"');
    const pc = html(view({ locks: { edit: lock(false, 'coordinator', true) } }));
    expect(pc).toContain(ib('ib.suggest', { label: ib('ib.fill'), holder: ib('ib.holder.coordinator') }));
    const ro = html(view(), true);
    expect(ro).toContain(ib('ib.readOnly'));
    expect(ro).not.toContain(ib('ib.fill'));
    expect(ro).not.toContain('draggable="true"');
  });
  it('the install order lists units by name; a loop is reported', () => {
    expect(html(view())).toContain('data-order="install"');
    expect(html(view({ orderProblem: 'prerequisite cycle among a, b', order: [] }))).toContain(ib('ib.order.problem', { text: 'prerequisite cycle among a, b' }));
  });
  it('no view shows the empty line; every id used exists', () => {
    expect(html(null)).toContain(ib('ib.empty'));
    for (const id of ['ib.mode.camp', 'ib.period.walkthrough', 'ib.period.film', 'ib.holder.head_coach', 'ib.tray.unplaced']) expect(ibTextIds()).toContain(id);
  });
});
