// G-98 settings screen: O5.3.1 (every setting once, help line, reset, scopes and locks), O5.2 (key map
// page, search, remap, profiles), O5.4.1 (playback never changes the game), O5.5 (contrast, labels,
// audio cues with visual twins, motion and timing aids that never touch the clock).
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { settings } from '@gm/app-services';
import { SCREENS, applyOverrides, findCollisions, initialNav, keysOnScreen, displayChord, DEFAULT_KEYMAP, type Binding } from '../../../src/shell/index.ts';
import {
  AllSettings, SettingsScreen, SETTINGS_TABS, SETTINGS_SCREEN_ID, settingsPage, settingsTextIds, sx, parseSettingsTab, parseInput,
  keyRows, searchKeys, captureKey, resetKey, exportProfile, importProfile, keyMapProblems, BUILTIN_PROFILES, actionLabel,
  presentGame, presentPlay, deadTimeOnScreen, isKeyPlay, playbackPrefs, SHORT_DEAD_SECONDS, CERTIFIED_COMPRESSION, SPEED_FACTOR,
  contrastAudit, AUDIO_CUES, cueTableProblems, motionFlags, inputAids, CLOCK_KEYS, stickyStep, scanStep, findUnlabelledControls,
  type PresentedPlay, type PlaybackPrefs, type SettingsTab, type WatchOption, type SpeedOption, type CompressionOption,
} from '../../../src/screens/settings/index.ts';

const defaults = (): Record<string, settings.SettingValue> => settings.defaultValues();
const all = (values = defaults(), context = {}) => renderToStaticMarkup(createElement(AllSettings, { values, context }));
const tab = (t: SettingsTab, values = defaults(), extra = {}) => renderToStaticMarkup(createElement(SettingsScreen, { tab: t, values, ...extra }));

describe('settings screen (O5.3.1)', () => {
  it('fills the registered settings screen', () => {
    expect(SCREENS.some((s) => s.id === SETTINGS_SCREEN_ID)).toBe(true);
  });

  it('every setting in the schema appears exactly once', () => {
    const rows = settingsPage(defaults()).flatMap((g) => g.rows.map((r) => r.key));
    expect(rows.sort()).toEqual(settings.SETTINGS.map((d) => d.key).sort());
    const h = all();
    for (const d of settings.SETTINGS) expect(h.split(`data-key="${d.key}"`).length - 1, d.key).toBe(1);
  });

  it('each setting has a label, a one-line explanation and a reset; text ids all resolve', () => {
    const ids = new Set(settingsTextIds());
    for (const d of settings.SETTINGS) {
      expect(ids.has(`label.${d.key}`), `label.${d.key}`).toBe(true);
      expect(ids.has(d.help), d.help).toBe(true);
      if (d.type === 'enum') for (const o of d.options) expect(ids.has(`option.${o}`), `option.${o}`).toBe(true);
    }
    for (const g of settings.SETTING_GROUPS) expect(ids.has(`group.${g}`)).toBe(true);
    for (const c of DEFAULT_KEYMAP.contexts) expect(ids.has(`context.${c}`)).toBe(true);
    const h = all();
    expect(h.split('>Reset</button>').length - 1).toBe(settings.SETTINGS.length);
    expect(h).not.toMatch(/>(label|settings|option|group)\.[a-zA-Z]/);
  });

  it('reset is disabled at the default and enabled once a value changes', () => {
    const v = { ...defaults(), 'display.theme': 'dark' };
    const row = settingsPage(v).flatMap((g) => g.rows).find((r) => r.key === 'display.theme')!;
    expect(row.isDefault).toBe(false);
    const h = all(v);
    expect(h).toMatch(/data-key="display.theme" data-default="no"/);
    expect(h).toMatch(/aria-label="Reset Theme to its default"[^>]*>Reset/);
    expect(h).toMatch(/aria-label="Reset Window mode to its default" disabled=""/);
  });

  it('certified careers lock the locked settings and creation-fixed settings show as fixed', () => {
    const rows = settingsPage(defaults(), { certified: true, afterCreation: true }).flatMap((g) => g.rows);
    expect(rows.find((r) => r.key === 'playback.stoppageCompression')!.lock).toBe('certified');
    expect(rows.find((r) => r.key === 'mods.enabled')!.lock).toBe('certified');
    expect(rows.find((r) => r.key === 'display.theme')!.lock).toBeNull();
    const open = settingsPage(defaults(), { afterCreation: true }).flatMap((g) => g.rows);
    expect(open.find((r) => r.key === 'gameplay.certified')!.lock).toBe('creation');
    expect(all(defaults(), { certified: true })).toContain(sx('screen.locked_certified'));
  });

  it('there is no difficulty and no pacing setting', () => {
    expect(settings.SETTINGS.some((d) => /difficulty|pacing|coachTime|study/i.test(d.key))).toBe(false);
    expect(tab('gameplay')).toContain(sx('screen.no_difficulty'));
    expect(tab('playback')).toContain(sx('screen.clock_rule'));
  });

  it('tabs: every group plus keys, and an unknown tab falls back to display', () => {
    expect(SETTINGS_TABS).toContain('keys');
    expect(parseSettingsTab('nope')).toBe('display');
    for (const t of SETTINGS_TABS) expect(tab(t)).toContain('role="tablist"');
  });

  it('control input parses to the setting type', () => {
    const d = (k: string) => settings.SETTINGS_BY_KEY.get(k)!;
    expect(parseInput(d('display.interfaceScale'), '120')).toBe(120);
    expect(parseInput(d('audio.masterOn'), false)).toBe(false);
    expect(parseInput(d('display.theme'), 'dark')).toBe('dark');
  });
});

describe('accessibility checks (O5.5)', () => {
  it('every interactive control on every settings page has an accessible name', () => {
    expect(findUnlabelledControls(all())).toEqual([]);
    expect(findUnlabelledControls(all(defaults(), { certified: true }))).toEqual([]);
    for (const t of SETTINGS_TABS) expect(findUnlabelledControls(tab(t)), t).toEqual([]);
    expect(findUnlabelledControls(tab('keys', defaults(), { capturing: { context: 'global', action: 'palette.open' } }))).toEqual([]);
  });

  it('the label checker itself catches unnamed controls and accepts each naming form', () => {
    expect(findUnlabelledControls('<button type="button"></button><input type="text"/><select></select>').map((x) => x.tag)).toEqual(['button', 'input', 'select']);
    expect(findUnlabelledControls('<button>Go</button><input aria-label="A"/><label for="x">X</label><input id="x"/><label>Y <input type="checkbox"/></label><input type="hidden"/>')).toEqual([]);
  });

  it('text contrast passes in every theme and colour-vision palette (O5.5.1)', () => {
    const r = contrastAudit();
    expect(r.combos).toBe(16); // 4 themes (light, dark, high contrast, classic) x 4 palettes
    expect(r.failures).toEqual([]);
  });

  it('every audio cue has a visual twin and a switch that exists (O5.5.2)', () => {
    expect(cueTableProblems()).toEqual([]);
    for (const id of ['whistle', 'snap', 'playClockTick', 'alert']) expect(AUDIO_CUES.some((c) => c.id === id), id).toBe(true);
    expect(cueTableProblems([{ id: 'x', sound: 's', visual: ' ', switch: 'nope', bible: [] }])).toEqual(['x: no visual cue', 'x: switch nope is not a setting']);
  });

  it('reduced motion gives stills and no eased camera; markers and focus ring follow their settings', () => {
    expect(motionFlags(defaults())).toEqual({ stills: false, easedCamera: true, boldMarkers: false, thickFieldLines: false, focusRingPx: 2 });
    const m = motionFlags({ ...defaults(), 'accessibility.reducedMotion': true, 'accessibility.boldMarkers': true, 'accessibility.focusHighlight': 'larger' });
    expect(m.stills).toBe(true);
    expect(m.easedCamera).toBe(false);
    expect(m.boldMarkers).toBe(true);
    expect(m.focusRingPx).toBe(4);
  });

  it('timing aids lengthen input windows only; no accessibility output carries a clock control', () => {
    expect(inputAids(defaults())).toMatchObject({ chordTimeoutMs: 1500, holdToConfirmMs: 0 });
    expect(inputAids({ ...defaults(), 'accessibility.chordTimeout': 'longer', 'accessibility.holdToConfirm': 'long' })).toMatchObject({ chordTimeoutMs: 4500, holdToConfirmMs: 800 });
    const every = [motionFlags, inputAids, playbackPrefs].flatMap((f) => Object.keys(f({ ...defaults(), 'accessibility.reducedMotion': true, 'accessibility.switchScanning': true })));
    for (const k of every) expect((CLOCK_KEYS as readonly string[]).includes(k), k).toBe(false);
  });

  it('sticky modifiers latch, toggle off and carry to the next key', () => {
    let s = stickyStep({ latched: [] }, { code: 'ShiftLeft' });
    expect(s.emit).toBeNull();
    s = stickyStep(s.state, { code: 'KeyB' });
    expect(s.emit).toEqual({ code: 'KeyB', ctrlKey: false, altKey: false, shiftKey: true, metaKey: false });
    expect(s.state.latched).toEqual([]);
    const off = stickyStep(stickyStep({ latched: [] }, { code: 'ControlLeft' }).state, { code: 'ControlRight' });
    expect(off.state.latched).toEqual([]);
  });

  it('single-switch scanning steps boxes, enters, steps entries, selects, and backs out', () => {
    const sizes = [3, 2];
    let st = { level: 'box' as const, box: 0, entry: 0 } as Parameters<typeof scanStep>[0];
    st = scanStep(st, 'step', sizes).state;
    expect(st.box).toBe(1);
    st = scanStep(st, 'press', sizes).state;
    expect(st.level).toBe('entry');
    st = scanStep(st, 'step', sizes).state;
    const sel = scanStep(st, 'press', sizes);
    expect(sel.out).toEqual({ kind: 'select', box: 1, entry: 1 });
    let b = scanStep({ level: 'entry', box: 1, entry: 0 }, 'step', sizes).state;
    b = scanStep(b, 'step', sizes).state;
    expect(b.entry).toBe(2);
    expect(scanStep(b, 'press', sizes)).toEqual({ state: { level: 'box', box: 1, entry: 0 }, out: { kind: 'none' } });
  });
});

describe('keys page (O5.2.1, O5.2.2)', () => {
  it('lists every binding by context with a readable action name', () => {
    const rows = keyRows();
    expect(rows.length).toBe(DEFAULT_KEYMAP.bindings.length);
    expect(rows[0]!.context).toBe('global');
    for (const r of rows) expect(r.actionLabel, r.action).not.toMatch(/^(act\.|hub\.|[a-z]+\.[a-z_0-9]+$)/);
    expect(actionLabel('global', 'hub.film')).toBe('Open hub Film');
    expect(rows.find((r) => r.action === 'call.box_select')!.noDefault).toBe(true);
    expect(tab('keys')).toContain(sx('keys.no_default'));
  });

  it('searches by action or by key in either form', () => {
    const rows = keyRows();
    expect(searchKeys(rows, 'timeout').every((r) => r.action === 'call.timeout')).toBe(true);
    expect(searchKeys(rows, 'KeyT').map((r) => r.action)).toEqual(['call.timeout', 'call.timeout', 'call.timeout']);
    expect(searchKeys(rows, 't').map((r) => r.action)).toContain('call.timeout');
    expect(searchKeys(rows, '?').map((r) => r.action)).toEqual(['help.keys']);
    expect(tab('keys', defaults(), { keyQuery: 'zzzz' })).toContain('No action or key matches');
  });

  it('remap: a key press binds; a taken key is refused naming its holder; Escape cancels; a modifier waits', () => {
    const ok = captureKey({}, 'console.offense', 'call.timeout', { code: 'KeyO' });
    expect(ok).toEqual({ kind: 'bound', chord: 'KeyO', overrides: { 'console.offense|call.timeout': ['KeyO'] } });
    const no = captureKey({}, 'console.offense', 'call.timeout', { code: 'KeyC' });
    expect(no).toMatchObject({ kind: 'refused', reason: 'KeyC is already bound to call.challenge' });
    expect(captureKey({}, 'global', 'palette.open', { code: 'Escape' })).toEqual({ kind: 'cancelled' });
    expect(captureKey({}, 'global', 'palette.open', { code: 'ShiftLeft', shiftKey: true })).toEqual({ kind: 'waiting' });
    expect(resetKey({ 'console.offense|call.timeout': ['KeyO'] }, 'console.offense', 'call.timeout')).toEqual({});
  });

  it('after remapping, the help overlay and the keys page show the new key (O5.2.2 acceptance)', () => {
    const r = captureKey({}, 'global', 'palette.open', { code: 'KeyK', ctrlKey: true });
    expect(r.kind).toBe('bound');
    const overrides = (r as { overrides: Record<string, string[]> }).overrides;
    const shown = keysOnScreen(initialNav('/office/today'), applyOverrides(overrides).bindings).find((b) => b.action === 'palette.open')!;
    expect(shown.keys.map(displayChord)).toEqual(['Ctrl+K']);
    const page = tab('keys', { ...defaults(), 'controls.keyOverrides': overrides });
    expect(page).toMatch(/data-action="palette.open" data-default="no">.*?Ctrl\+K/);
  });

  it('the default map and the left-hand profile have no collisions in any context', () => {
    expect(findCollisions(DEFAULT_KEYMAP.bindings)).toEqual([]);
    expect(keyMapProblems(BUILTIN_PROFILES['left-hand'])).toEqual([]);
    expect(applyOverrides(BUILTIN_PROFILES['left-hand']).problems).toEqual([]);
  });

  it('the left-hand profile puts every console and global action on the left half of the keyboard', () => {
    const right = /^(Digit[6-90]|Key[YUIOPHJKLNM]|Bracket(Left|Right)|Backslash|Slash|Enter|Backspace|Semicolon|Quote|Comma|Period|Minus|Equal|Arrow\w+)$/;
    const { bindings } = applyOverrides(BUILTIN_PROFILES['left-hand']);
    const inScope = (b: Binding) => b.context === 'global' || b.context.startsWith('console.');
    const offenders = bindings.filter(inScope).flatMap((b) => b.keys.filter((k) => right.test(k.split('+').pop()!)).map((k) => `${b.context}|${b.action}=${k}`));
    expect(offenders).toEqual([]);
  });

  it('profiles export and import as a versioned file; unknown actions are ignored and reported', () => {
    const file = exportProfile('Mine', BUILTIN_PROFILES['left-hand']!);
    const back = importProfile(file);
    expect(back).toMatchObject({ ok: true, name: 'Mine', skipped: [] });
    expect((back as { overrides: object }).overrides).toEqual(BUILTIN_PROFILES['left-hand']);
    const doc = JSON.parse(file);
    doc.overrides['global|old.action'] = ['KeyQ'];
    const withUnknown = importProfile(JSON.stringify(doc));
    expect(withUnknown).toMatchObject({ ok: true, skipped: [{ context: 'global', action: 'old.action' }] });
    expect(importProfile('not json')).toEqual({ ok: false, reason: 'the file is not a key profile' });
    const clash = importProfile(exportProfile('x', { 'console.offense|call.timeout': ['KeyC'] }));
    expect(clash).toMatchObject({ ok: false });
  });
});

describe('playback settings (O5.4.1)', () => {
  // A scripted drive: the engine's finished plays with their scores. Playback only reads them.
  const plays: PresentedPlay[] = [
    { id: 'p1', usersUnit: true, liveSeconds: 6, deadSeconds: 30, decisionOpen: true, gainYards: 4, score: { home: 0, away: 0 } },
    { id: 'p2', usersUnit: true, liveSeconds: 7, deadSeconds: 25, decisionOpen: false, gainYards: 24, score: { home: 0, away: 0 } },
    { id: 'p3', usersUnit: false, liveSeconds: 5, deadSeconds: 40, decisionOpen: false, sack: true, score: { home: 0, away: 0 } },
    { id: 'p4', usersUnit: true, liveSeconds: 8, deadSeconds: 60, decisionOpen: false, scoring: true, score: { home: 7, away: 0 } },
    { id: 'p5', usersUnit: false, liveSeconds: 6, deadSeconds: 20, decisionOpen: true, moneyDown: true, score: { home: 7, away: 3 } },
  ];
  const WATCH: WatchOption[] = ['every-play', 'own-plays', 'key-plays', 'results-only'];
  const SPEED: SpeedOption[] = ['normal', 'fast', 'faster'];
  const COMP: CompressionOption[] = ['real', 'short', 'instant'];

  it('every playback option gives the same final score and the same score after every play', () => {
    const base = presentGame(plays, { watch: 'every-play', speed: 'normal', compression: 'real', reducedMotion: false, certified: false });
    const times = new Set<number>();
    for (const watch of WATCH) for (const speed of SPEED) for (const compression of COMP) for (const reducedMotion of [false, true]) {
      const g = presentGame(plays, { watch, speed, compression, reducedMotion, certified: false });
      expect(g.finalScore).toEqual({ home: 7, away: 3 });
      expect(g.plays.map((p) => p.score)).toEqual(base.plays.map((p) => p.score));
      times.add(g.screenSeconds);
    }
    expect(times.size).toBeGreaterThan(1); // the options do change what is shown
    expect(plays.map((p) => p.score)).toEqual(base.plays.map((p) => p.score)); // and nothing was written back
  });

  it('compression never shortens dead time while a decision of the user is open', () => {
    for (const c of COMP) for (const certified of [false, true]) expect(deadTimeOnScreen({ deadSeconds: 30, decisionOpen: true }, c, certified)).toBe(30);
    expect(deadTimeOnScreen({ deadSeconds: 30, decisionOpen: false }, 'short')).toBe(SHORT_DEAD_SECONDS);
    expect(deadTimeOnScreen({ deadSeconds: 30, decisionOpen: false }, 'instant')).toBe(0);
    expect(deadTimeOnScreen({ deadSeconds: 30, decisionOpen: false }, 'real')).toBe(30);
  });

  it('certified careers use the fixed compression whatever the user picked', () => {
    for (const c of COMP) expect(deadTimeOnScreen({ deadSeconds: 30, decisionOpen: false }, c, true)).toBe(deadTimeOnScreen({ deadSeconds: 30, decisionOpen: false }, CERTIFIED_COMPRESSION));
  });

  it('speeds are real time and double only; no half speed in games (I9.2.1)', () => {
    expect(Object.values(SPEED_FACTOR).every((f) => f === 1 || f === 2)).toBe(true);
  });

  it('watch options pick plays; reduced motion shows stills; results only draws nothing', () => {
    const prefs = (watch: WatchOption, reducedMotion = false): PlaybackPrefs => ({ watch, speed: 'normal', compression: 'real', reducedMotion, certified: false });
    expect(plays.map((p) => presentPlay(p, prefs('own-plays')).show)).toEqual(['playback', 'playback', 'result', 'playback', 'result']);
    expect(plays.map(isKeyPlay)).toEqual([false, true, true, true, true]);
    expect(plays.map((p) => presentPlay(p, prefs('results-only')).show).every((s) => s === 'result')).toBe(true);
    expect(presentPlay(plays[0]!, prefs('every-play', true)).show).toBe('stills');
    expect(presentPlay(plays[1]!, { ...prefs('every-play'), speed: 'fast' }).playSeconds).toBe(3.5);
  });

  it('reads its preferences from the settings store values', () => {
    expect(playbackPrefs(defaults())).toEqual({ watch: 'every-play', speed: 'normal', compression: 'real', reducedMotion: false, certified: false });
  });
});
