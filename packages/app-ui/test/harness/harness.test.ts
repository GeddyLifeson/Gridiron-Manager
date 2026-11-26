// G-73 self-tests: the harness must catch what it exists to catch (each Q1.5.x acceptance has a
// failing case), and it must pass on the real registry and key map.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { SCREENS, DEFAULT_KEYMAP, navReducer, keyForHub, HUB_IDS, screensInHub, hasParams, type ScreenRecord, type Binding } from '../../src/shell/index.ts';
import { TOKENS, THEME_IDS, type TokenFile } from '../../src/tokens/index.ts';
import {
  VirtualKeyboard, digitCode, letterCode, runTrace, pauseRefusals, findPauseCommands, crawl, placeholderSeats, shellOpener, markerProblems, greyFailures, greyPairs, GREY_PAIR_FLOOR,
  COMMAND_ATTR, MISSING_BINDING_ATTR, type KeyTrace, type Seat, type RouteOpener,
} from './index.ts';

// ---- Q1.5.3 route crawl ----------------------------------------------------------------------
describe('Q1.5.3 route crawl', () => {
  it('every route opens for every seat on the real shell', () => {
    const r = crawl();
    expect(r.problems).toEqual([]);
    expect(r.opened).toBe(SCREENS.length * placeholderSeats().length);
  });
  it('an unlisted route is refused; one that opens anyway fails', () => {
    const seat: Seat = { ...placeholderSeats()[0]!, id: 'limited', listed: new Set(SCREENS.filter((s) => s.hub !== 'coach').map((s) => s.id)) };
    const good = crawl({ seats: [seat], open: shellOpener(undefined, SCREENS) });
    expect(good.problems).toEqual([]);
    expect(good.refused).toBe(SCREENS.filter((s) => s.hub === 'coach').length);
    const leaky: RouteOpener = shellOpener(undefined, SCREENS);
    const leakyOpen: RouteOpener = (path, st) => leaky(path, { ...st, listed: new Set(SCREENS.map((s) => s.id)) });
    const bad = crawl({ seats: [seat], open: leakyOpen });
    expect(bad.problems.some((p) => p.message.includes('not listed for this seat but opened'))).toBe(true);
  });
  it('a route with a missing data binding fails (acceptance)', () => {
    const base = shellOpener(undefined, SCREENS);
    const open: RouteOpener = (path, st) => (base(path, st) ?? '').replace('<main', `<main ${MISSING_BINDING_ATTR}="roster.rows"`);
    const r = crawl({ seats: [placeholderSeats()[0]!], open });
    expect(r.problems.length).toBe(SCREENS.length);
    expect(r.problems[0]!.message).toBe('missing data binding');
  });
  it('error text and empty regions fail', () => {
    const base = shellOpener(undefined, SCREENS);
    const seat = placeholderSeats()[0]!;
    const withText: RouteOpener = (p, st) => (base(p, st) ?? '').replace('</main>', '<p>Rows: undefined</p></main>');
    expect(crawl({ seats: [seat], open: withText, screens: SCREENS.slice(0, 1) }).problems[0]!.message).toContain('error text on screen');
    const empty: RouteOpener = (p, st) => (base(p, st) ?? '').replace(/<main([^>]*)>[\s\S]*<\/main>/, '<main$1></main>');
    expect(crawl({ seats: [seat], open: empty, screens: SCREENS.slice(0, 1) }).problems.some((p) => p.message === 'main region is empty')).toBe(true);
  });
  it('a control whose command the seat lacks rights for fails', () => {
    const base = shellOpener(undefined, SCREENS);
    const seat: Seat = { ...placeholderSeats()[0]!, rights: new Set(['roster.cut']) };
    const open: RouteOpener = (p, st) => (base(p, st) ?? '').replace('</main>', `<button ${COMMAND_ATTR}="roster.cut">Cut</button><button ${COMMAND_ATTR}="contract.sign">Sign</button></main>`);
    const r = crawl({ seats: [seat], open, screens: SCREENS.slice(0, 1) });
    expect(r.problems.map((p) => p.message)).toEqual(['control for command contract.sign but the seat has no right to it']);
  });
  it('a route entry that throws is reported, not swallowed', () => {
    const open: RouteOpener = () => { throw new Error('boom'); };
    expect(crawl({ seats: [placeholderSeats()[0]!], open, screens: SCREENS.slice(0, 1) }).problems[0]!.message).toBe('opening threw: boom');
  });
  it('screens not yet built are listed as stubs, not errors', () => {
    const r = crawl({ seats: [placeholderSeats()[0]!] });
    expect(r.problems).toEqual([]);
    expect(r.stubs.length).toBeGreaterThan(0);
  });
  it('a screen package\'s route entry is crawled in place of the frame text', () => {
    const routes = { 'team.roster': { render: () => createElement('p', null, 'rows') } };
    const r = crawl({ seats: [placeholderSeats()[0]!], open: shellOpener(routes, SCREENS), screens: SCREENS.filter((s) => s.id === 'team.roster') });
    expect(r.problems).toEqual([]);
    expect(r.stubs).toEqual([]);
  });
});

// ---- Q1.5.2 keyboard only --------------------------------------------------------------------
describe('Q1.5.2 keyboard-only reach', () => {
  const SEQ = (s: ScreenRecord) => [digitCode(keyForHub(s.hub)), letterCode(s.hotkey!)];
  const flat = SCREENS.filter((s) => !hasParams(s));

  for (const s of flat) {
    it(`${s.id} opens in two key presses from the Office`, () => {
      const kb = new VirtualKeyboard();
      kb.pressAll(SEQ(s));
      expect(kb.screenId).toBe(s.id);
      expect(kb.presses).toBe(2); // O1.3.1: any screen in two presses
    });
  }
  it('every hub has a home screen reachable by its number key alone', () => {
    for (const hub of HUB_IDS) {
      const kb = new VirtualKeyboard();
      kb.press(digitCode(keyForHub(hub)));
      expect(screensInHub(hub).some((s) => s.id === kb.screenId)).toBe(true);
    }
  });
  it('slash opens the palette, Escape closes it, ? and F1 open help, Escape closes those', () => {
    const kb = new VirtualKeyboard();
    kb.press('Slash'); expect(kb.nav.overlay).toBe('palette');
    kb.nav = { ...kb.nav, overlay: null };
    kb.press('Shift+Slash'); expect(kb.nav.overlay).toBe('keys');
    kb.press('Escape'); expect(kb.nav.overlay).toBeNull();
    kb.press('F1'); expect(kb.nav.overlay).toBe('help');
    kb.press('Escape'); expect(kb.nav.overlay).toBeNull();
  });
  it('global keys are inactive while a text field has focus', () => {
    const kb = new VirtualKeyboard({ textFocus: true });
    kb.press(digitCode('5'));
    expect(kb.screenId).toBe('office.today');
  });
  it('on game day the other hubs refuse with a notice; on the console the digits belong to the console', () => {
    const kb = new VirtualKeyboard();
    kb.startGame();
    expect(kb.press(digitCode('2')).effect).toBe('passed-to-console');
    expect(kb.screenId).toBe('game.console');
    kb.nav = navReducer(kb.nav, { type: 'navigate', to: '/game/pregame' });
    kb.press(digitCode('2'));
    expect(kb.nav.notice?.id).toBe('shell.gameDayLocked');
    expect(kb.screenId).toBe('game.pregame');
  });
  it('on the console the shell passes call keys through and keeps Escape and ?', () => {
    const kb = new VirtualKeyboard();
    kb.startGame();
    expect(kb.press('Digit1').effect).toBe('passed-to-console');
    expect(kb.press('Shift+Slash').effect).toBe('overlay');
  });
  it('Space advances only on Today', () => {
    const kb = new VirtualKeyboard();
    kb.press('Space'); expect(kb.advances).toBe(1);
    kb.pressAll([digitCode('2'), letterCode('r')]);
    kb.press('Space'); expect(kb.advances).toBe(1);
  });

  describe('trace runner', () => {
    // Play clock lengths are B1.3.1: 40 seconds in the normal case, 25 after the listed stoppages.
    const CLOCK_40 = 40, CLOCK_25 = 25;
    const trace = (clock: number, keys: string[], readMs = 0): KeyTrace => ({
      id: 't', rung: 9, level: 'pro',
      calls: (['offense', 'defense', 'special', 'timeout', 'challenge', 'penalty'] as const).map((kind) => ({ label: kind, kind, keys, clockSeconds: clock, readMs })),
    });
    it('a trace with every call kind and short reach passes', () => {
      const kb = new VirtualKeyboard({ keyIntervalMs: 250 });
      const r = runTrace(trace(CLOCK_25, [digitCode('5'), letterCode('c')]), kb);
      expect(r.passed).toBe(true);
      expect(r.calls[0]!.spentMs).toBe(500);
    });
    it('a call that runs past the clock is a delay of game caused by reach', () => {
      const kb = new VirtualKeyboard({ keyIntervalMs: 250 });
      const r = runTrace(trace(CLOCK_25, [digitCode('5')], CLOCK_25 * 1000), kb);
      expect(r.passed).toBe(false);
      expect(r.calls.every((c) => c.delayOfGame)).toBe(true);
    });
    it('a key the map does not bind is a trace error', () => {
      const kb = new VirtualKeyboard();
      const r = runTrace(trace(CLOCK_40, ['KeyQ']), kb);
      expect(r.passed).toBe(false);
      expect(r.calls[0]!.unbound).toEqual(['KeyQ']);
    });
    it('a trace missing timeouts, challenges or penalties fails', () => {
      const kb = new VirtualKeyboard();
      const t: KeyTrace = { id: 'short', rung: 9, level: 'pro', calls: [{ label: 'o', kind: 'offense', keys: [digitCode('5')], clockSeconds: CLOCK_40 }] };
      expect(runTrace(t, kb).missingKinds).toEqual(['defense', 'special', 'timeout', 'challenge', 'penalty']);
    });
    it('the virtual clock never runs backwards or stops', () => {
      const kb = new VirtualKeyboard({ keyIntervalMs: 10 });
      const times = [digitCode('5'), 'Escape', 'Slash', 'Escape'].map((k) => kb.press(k).atMs);
      expect(times).toEqual([10, 20, 30, 40]);
    });
  });

  describe('no pause command outside practice and the school (acceptance 2)', () => {
    it('the real key map and registry hold none', () => { expect(findPauseCommands()).toEqual([]); });
    it('a pause action or a game-time pause screen is caught', () => {
      const b: Binding = { context: 'global', action: 'game.pause', keys: ['KeyP'], device: 'keyboard' };
      expect(findPauseCommands({ bindings: [...DEFAULT_KEYMAP.bindings, b] })).toEqual([{ kind: 'binding', id: 'global|game.pause', why: 'key action stops or slows a clock' }]);
      const s = { ...SCREENS.find((x) => x.id === 'game.console')!, id: 'game.hold_clock', title: 'Hold clock' };
      expect(findPauseCommands({ screens: [s] }).map((f) => f.id)).toEqual(['game.hold_clock']);
      const practice = { ...SCREENS.find((x) => x.id === 'week.practice')!, title: 'Pause drill' };
      expect(findPauseCommands({ screens: [practice] })).toEqual([]);
    });
    it('a core that takes a pause command fails the probe check', () => {
      expect(pauseRefusals({ send: () => ({ accepted: false }) }).every((r) => !r.accepted)).toBe(true);
      expect(pauseRefusals({ send: (c) => ({ accepted: c === 'Pause' }) }).filter((r) => r.accepted).map((r) => r.command)).toEqual(['Pause']);
    });
  });
});

const PINNED_LABEL_CARRIED_PAIRS = [
  'state.bad|state.neutral', 'state.caution|state.bad', 'state.caution|state.neutral',
  'state.good|state.bad', 'state.good|state.caution', 'state.good|state.neutral',
];

// ---- Q1.5.1 greyscale ------------------------------------------------------------------------
describe('Q1.5.1 greyscale', () => {
  it('the marker table keeps every group and both sides apart by shape alone', () => { expect(markerProblems()).toEqual([]); });
  it('two groups with one look are caught', () => {
    const t = JSON.parse(JSON.stringify({ groups: { OL: { shape: 'circle', fill: 'filled', outline: 'normal', mark: 'none' }, WR: { shape: 'circle', fill: 'filled', outline: 'normal', mark: 'none' }, DL: { shape: 'circle', fill: 'open', outline: 'normal', mark: 'none' } }, roles: {}, fallback: { offense: 'OL', defense: 'DL' } }));
    expect(markerProblems(t)).toEqual(['WR and OL share the look circle/filled/normal/none', 'offence and defence both use circle']);
  });
  it('a grey-on-grey pair fails and a declared label rescues it', () => {
    const grey: TokenFile = JSON.parse(JSON.stringify(TOKENS));
    for (const th of THEME_IDS) { grey.themes[th].state.good = '#808080'; grey.themes[th].state.bad = '#838383'; }
    const names = ['state.good', 'state.bad'];
    expect(greyPairs(names, 'light', 'none', grey)[0]!.ratio).toBeLessThan(GREY_PAIR_FLOOR);
    const fails = greyFailures(names, new Set(), GREY_PAIR_FLOOR, grey);
    expect(fails.length).toBeGreaterThan(0);
    expect(greyFailures(names, new Set(['state.bad|state.good']), GREY_PAIR_FLOOR, grey)).toEqual([]);
  });
  it('real state colours: pairs that rely on a label or shape are pinned', () => {
    // Finding for the O6 owner: several state colours share a grey level (good and bad are equal in
    // the light theme), so every use of a state colour must also carry a word or shape. The pairs
    // are pinned here; a token change that adds one fails this test until it is reviewed.
    const fails = greyFailures(['state.good', 'state.caution', 'state.bad', 'state.neutral']);
    const unique = [...new Set(fails.map((f) => `${f.a}|${f.b}`))].sort();
    expect(unique).toEqual(PINNED_LABEL_CARRIED_PAIRS);
    const worst = fails.reduce((m, f) => (f.ratio < m.ratio ? f : m));
    expect(worst.ratio).toBeGreaterThanOrEqual(1);
  });
});
