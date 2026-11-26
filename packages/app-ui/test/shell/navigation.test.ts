// O1.3.1 (two key presses), O1.3.2 (palette), O1.3.3 (history), O1.4.2 (game-day lock), O1.4.3
// (alerts): the shell's keyboard reach, driven through the default key map exactly as a key press is.
import { describe, it, expect } from 'vitest';
import {
  SCREENS, DEFAULT_KEYMAP, initialNav, navReducer, navActionFor, actionFor, contextsFor, resolve, buildPath, href, hasParams,
  screenItems, search, alertLine, officeMarked, availability, ALERT_SHOW_MS, HISTORY_MAX, keysOnScreen, type NavState, type PaletteItem, type Alert,
} from '../../src/shell/index.ts';

const B = DEFAULT_KEYMAP.bindings;

/** One key press as the shell handles it: pending-hub letters first, then the key map. */
function press(s: NavState, code: string, mods: { shiftKey?: boolean; altKey?: boolean } = {}): NavState {
  if (s.pendingHub && /^Key[A-Z]$/.test(code) && !mods.shiftKey && !mods.altKey) return navReducer(s, { type: 'screenKey', letter: code.slice(3).toLowerCase() });
  const chord = [mods.altKey && 'Alt', mods.shiftKey && 'Shift', code].filter(Boolean).join('+');
  const action = actionFor(chord, contextsFor(s), B);
  const a = action ? navActionFor(action) : null;
  return a ? navReducer(s, a) : navReducer(s, { type: 'clearPending' });
}
const hubCode = (hub: string) => { const k = DEFAULT_KEYMAP.bindings.find((b) => b.action === `hub.${hub}`)!.keys[0]!; return k; };

const plain = SCREENS.filter((s) => !hasParams(s));

describe('two key presses from any screen to any screen (O1.3.1 acceptance 1, Q1.5.2 for the shell)', () => {
  it(`all ${plain.length} x ${plain.length} pairs`, () => {
    let pairs = 0;
    for (const from of plain) {
      // Visit some other screen in each hub first, so "last used" differs from the target.
      let start = initialNav(buildPath(from));
      for (const to of plain) {
        let s = press(start, hubCode(to.hub));
        let n = 1;
        if (s.location.screenId !== to.id) { s = press(s, `Key${to.hotkey!.toUpperCase()}`); n++; }
        expect(s.location.screenId, `${from.id} -> ${to.id}`).toBe(to.id);
        expect(n).toBeLessThanOrEqual(2);
        start = s; // the next pair starts from wherever this one ended, so last-used state varies
        pairs++;
      }
    }
    expect(pairs).toBe(plain.length * plain.length);
  });
  it('screens with parameters are reached by keyboard through the palette', () => {
    const items: PaletteItem[] = [
      { id: 'p1', group: 'player', label: 'Marcus Hale', terms: ['12', 'QB', 'Rivertown'], to: '/team/player/p1', detail: 'QB 12' },
      { id: 'c1', group: 'staff', label: 'Dana Ortiz', terms: ['OC'], to: '/people/coach/c1' },
      { id: 't1', group: 'team', label: 'Rivertown', terms: [], to: '/league/team/t1' },
    ];
    let s = press(initialNav(), 'Slash');
    expect(s.overlay).toBe('palette');
    for (const [q, screen] of [['12 qb', 'team.player'], ['ortiz', 'people.coach'], ['rivertown', 'league.team']] as const) {
      const top = search([...screenItems(), ...items], q)[0]!;
      s = navReducer(s, { type: 'navigate', to: top.to });
      expect(s.location.screenId, q).toBe(screen);
      expect(s.overlay).toBeNull();
    }
  });
  it('a letter that is not a hotkey in the pending hub only clears the pending hub', () => {
    let s = press(initialNav(), hubCode('team'));
    const at = s.location.screenId;
    s = press(s, 'KeyQ');
    expect(s.location.screenId).toBe(at);
    expect(s.pendingHub).toBeNull();
  });
});

describe('history, back and breadcrumbs (O1.3.3)', () => {
  it('ten links then ten backs return to the start with every view state intact', () => {
    let s = initialNav('/team/roster?sort=pos&filter=ol');
    const start = href(s.location);
    const trail: string[] = [start];
    for (const sc of plain.slice(0, 10)) {
      s = navReducer(s, { type: 'navigate', to: buildPath(sc, {}, { tab: `t-${sc.id}` }) });
      s = navReducer(s, { type: 'setScroll', y: trail.length * 10 });
      trail.push(href(s.location));
    }
    for (let i = 0; i < 10; i++) s = press(s, 'ArrowLeft', { altKey: true });
    expect(href(s.location)).toBe(start);
    expect(s.location.view).toEqual({ sort: 'pos', filter: 'ol' });
    for (let i = 0; i < 10; i++) s = navReducer(s, { type: 'forward' });
    expect(href(s.location)).toBe(trail[10]);
    expect(s.scroll[trail[10]!]).toBe(100);
  });
  it('keeps at most 100 entries', () => {
    let s = initialNav();
    for (let i = 0; i < HISTORY_MAX + 30; i++) s = navReducer(s, { type: 'navigate', to: `/team/player/p${i}` });
    expect(s.back.length).toBe(HISTORY_MAX);
  });
  it('Esc closes a panel first, then goes back', () => {
    let s = navReducer(initialNav(), { type: 'navigate', to: '/team/roster' });
    s = press(s, 'Slash', { shiftKey: true });
    expect(s.overlay).toBe('keys');
    s = press(s, 'Escape');
    expect(s.overlay).toBeNull();
    expect(s.location.screenId).toBe('team.roster');
    s = press(s, 'Escape');
    expect(s.location.screenId).toBe('office.today');
  });
  it('view options change in place without a history entry', () => {
    let s = navReducer(initialNav(), { type: 'navigate', to: '/team/roster' });
    const n = s.back.length;
    s = navReducer(s, { type: 'setView', view: { sort: 'age' } });
    expect(s.back.length).toBe(n);
    expect(href(s.location)).toBe('/team/roster?sort=age');
  });
  it('an unknown address is refused with a notice and the screen stays', () => {
    const s = navReducer(initialNav(), { type: 'navigate', to: '/nowhere' });
    expect(s.location.screenId).toBe('office.today');
    expect(s.notice?.id).toBe('shell.unknownRoute');
  });
});

describe('game-day mode (O1.4.2)', () => {
  it('no route outside the Game hub opens between kickoff and the end of the game', () => {
    let s = navReducer(navReducer(initialNav(), { type: 'navigate', to: '/team/roster' }), { type: 'startGame' });
    expect(s.location.screenId).toBe('game.console');
    expect(s.back).toEqual([]);
    for (const sc of plain.filter((x) => x.hub !== 'game')) {
      const t = navReducer(s, { type: 'navigate', to: buildPath(sc) });
      expect(t.location.screenId, sc.id).toBe('game.console');
      const h = navReducer(s, { type: 'hub', hub: sc.hub });
      expect(h.location.screenId).toBe('game.console');
    }
    s = press(s, 'Escape'); // back cannot leave the console: the history was cleared
    expect(s.location.screenId).toBe('game.console');
  });
  it('the glossary and settings open as side panels during a game', () => {
    const s = navReducer(navReducer(initialNav(), { type: 'startGame' }), { type: 'navigate', to: '/school/glossary' });
    expect(s.location.screenId).toBe('game.console');
    expect(s.panelScreen).toBe('school.glossary');
  });
  it('the console owns the keyboard: digits are call entries, Esc and ? stay global', () => {
    const s = navReducer(initialNav(), { type: 'startGame' });
    expect(actionFor('Digit2', contextsFor(s), B)).toBe('call.entry_2');
    expect(actionFor('Escape', contextsFor(s), B)).toBe('nav.back');
    expect(actionFor('Shift+Slash', contextsFor(s), B)).toBe('help.keys');
    const shown = keysOnScreen(s, B).filter((b) => b.context === 'global').map((b) => b.action).sort();
    expect(shown).toEqual(['help.keys', 'nav.back']);
  });
  it('history is restored when the game ends', () => {
    let s = navReducer(initialNav(), { type: 'navigate', to: '/team/roster' });
    s = navReducer(navReducer(s, { type: 'startGame' }), { type: 'navigate', to: '/game/halftime' });
    s = navReducer(s, { type: 'endGame' });
    expect(s.mode).toBe('normal');
    expect(s.back.map((l) => l.screenId)).toEqual(['office.today']);
    expect(navReducer(s, { type: 'navigate', to: '/team/roster' }).location.screenId).toBe('team.roster');
  });
  it('a game-day screen outside game day opens with the "no game now" line', () => {
    const g = SCREENS.find((x) => x.id === 'game.console')!;
    expect(availability(g, null, false)).toEqual({ readOnly: true, lineId: 'shell.noGameNow' });
    expect(availability(g, null, true)).toEqual({ readOnly: false, lineId: null });
    expect(availability({ ...SCREENS[0]!, phases: ['regular'] }, 'offseason', false).readOnly).toBe(true);
  });
});

describe('help keys (O1.3.1 acceptance 2)', () => {
  it('the advance key is listed only on the office screen', () => {
    expect(keysOnScreen(initialNav('/office/today'), B).some((b) => b.action === 'office.advance')).toBe(true);
    expect(keysOnScreen(initialNav('/team/roster'), B).some((b) => b.action === 'office.advance')).toBe(false);
  });
});

describe('palette search (O1.3.2)', () => {
  const people: PaletteItem[] = Array.from({ length: 2000 }, (_, i) => ({ id: `p${i}`, group: 'player', label: `Player ${i} Name${i % 97}`, terms: [String(i % 99), ['QB', 'RB', 'WR', 'TE', 'OT'][i % 5]!], to: `/team/player/p${i}` }));
  it('prefix before word-start before fuzzy, and recent picks rank up', () => {
    const items = screenItems();
    expect(search(items, 'dep')[0]!.id).toBe('team.depth_chart');
    expect(search(items, 'call sheet')[0]!.id).toBe('football.call_sheet');
    const r = search(items, 'pl');
    const recentPick = r[1]!.id;
    expect(search(items, 'pl', [recentPick])[0]!.id).toBe(recentPick);
  });
  it('a jersey number and a position find the player among 2,000 people, exact matches first', () => {
    const r = search(people, '42 te');
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeGreaterThanOrEqual(4);
    for (const x of r.slice(0, 4)) expect(x.terms).toEqual(expect.arrayContaining(['42', 'TE']));
  });
  it('lists only addresses: every screen item resolves to a registered route', () => {
    for (const i of screenItems()) expect(resolve(i.to)?.screenId).toBe(i.id);
  });
});

describe('alerts (O1.4.3)', () => {
  const a = (id: string, at: number, level: Alert['level'] = 'normal', category = 'news'): Alert => ({ id, category, level, text: `alert ${id}`, at });
  it('shows the newest alert for 6 s', () => {
    const list = [a('1', 0), a('2', 1000)];
    expect(alertLine(list, 1500).text).toBe('alert 2');
    expect(alertLine(list, 1000 + ALERT_SHOW_MS).text).toBeNull();
  });
  it('folds a burst of more than five in one second into one line with a count', () => {
    const list = Array.from({ length: 7 }, (_, i) => a(String(i), i * 100));
    expect(alertLine(list, 700)).toMatchObject({ text: null, burstCount: 7 });
    expect(alertLine(list.slice(0, 5), 700).burstCount).toBe(0);
  });
  it('the user can lower or raise a category; quiet never shows; urgent marks the Office hub', () => {
    expect(alertLine([a('1', 0)], 10, { news: 'quiet' }).text).toBeNull();
    expect(officeMarked([a('1', 0)], { news: 'urgent' })).toBe(true);
    expect(officeMarked([a('1', 0, 'urgent')], { news: 'normal' })).toBe(false);
  });
  it('during a game nothing shows in the top bar (game alerts go to the booth line)', () => {
    expect(alertLine([a('1', 0, 'urgent', 'game')], 10, {}, true).text).toBeNull();
  });
});
