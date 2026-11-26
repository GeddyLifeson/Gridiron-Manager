// O5.3.1 settings store: scopes, validation, unknown keys kept, corrupt file set aside, certified
// locks, save-scope block; and the binding rulings (no difficulty, no pacing mode).
import { describe, it, expect } from 'vitest';
import { scanForbiddenJson } from '@gm/schema';
import {
  SETTINGS, SETTINGS_BY_KEY, SETTING_GROUPS, checkValue, defaultValues, parseSettingsFile, serializeSettings, makeSaveBlock,
  SettingsStore, memorySettingsBackend, keyValueSettingsBackend, INTERFACE_SCALE_PCT, FAVOURITES_MAX,
} from '../../src/settings/index.ts';

describe('schema', () => {
  it('every setting appears once, with a valid default, group and scope', () => {
    expect(new Set(SETTINGS.map((s) => s.key)).size).toBe(SETTINGS.length);
    for (const s of SETTINGS) {
      expect(checkValue(s, s.default), s.key).toBeNull();
      expect(SETTING_GROUPS).toContain(s.group);
      expect(s.key.startsWith(`${s.group}.`) || s.scope === 'session').toBe(true);
      expect(s.bible.length).toBeGreaterThan(0);
    }
  });
  it('holds no difficulty, slider, points or pacing mode (one difficulty: real life; the play clock always runs)', () => {
    expect(scanForbiddenJson('settings', Object.fromEntries(SETTINGS.map((s) => [s.key.split('.')[1], s.default])))).toEqual([]);
    expect(scanForbiddenJson('settings', defaultValues())).toEqual([]);
    for (const s of SETTINGS) expect(s.key).not.toMatch(/difficulty|pacing|pause|slow|clock_?speed/i);
    const playback = SETTINGS.filter((s) => s.group === 'playback').map((s) => s.key).sort();
    expect(playback).toEqual(['playback.speed', 'playback.stoppageCompression', 'playback.watch']);
  });
  it('the O5.3.2 interface scale range, the O1.1.3 favourites cap and the O5.4.1 options', () => {
    const scale = SETTINGS_BY_KEY.get('display.interfaceScale')!;
    expect(scale).toMatchObject({ min: INTERFACE_SCALE_PCT.min, max: INTERFACE_SCALE_PCT.max });
    expect([INTERFACE_SCALE_PCT.min, INTERFACE_SCALE_PCT.max]).toEqual([80, 200]);
    expect(checkValue(scale, 70)).toMatch(/80 to 200/);
    expect(checkValue(scale, 85)).toMatch(/steps/);
    expect(FAVOURITES_MAX).toBe(12);
    expect(checkValue(SETTINGS_BY_KEY.get('navigation.favourites')!, Array.from({ length: 13 }, (_, i) => `/r${i}`))).toMatch(/at most 12/);
    expect(SETTINGS_BY_KEY.get('playback.stoppageCompression')).toMatchObject({ options: ['real', 'short', 'instant'], lockedInCertified: true });
    expect(SETTINGS_BY_KEY.get('display.theme')).toMatchObject({ options: ['system', 'light', 'dark', 'high-contrast', 'classic'] });
  });
  it('scopes: display, audio, controls, accessibility and privacy are user; rule set, packs and certified are save', () => {
    for (const s of SETTINGS) if (['display', 'audio', 'controls', 'accessibility', 'privacy'].includes(s.group)) expect(s.scope, s.key).toBe('user');
    expect(SETTINGS.filter((s) => s.scope === 'save').map((s) => s.key).sort()).toEqual(['gameplay.certified', 'gameplay.contentPacks', 'gameplay.ruleSetId']);
  });
});

describe('file', () => {
  it('round-trips, storing only values that differ from the default', () => {
    const v = { ...defaultValues('user'), 'display.theme': 'dark', 'accessibility.textScale': 150 };
    const text = serializeSettings(v);
    expect(JSON.parse(text).values).toEqual({ 'accessibility.textScale': 150, 'display.theme': 'dark' });
    expect(parseSettingsFile(text).values).toEqual(v);
  });
  it('keeps unknown keys so a downgrade loses nothing', () => {
    const text = JSON.stringify({ format: 'gm-settings', version: 3, values: { 'display.theme': 'light', 'future.thing': { a: 1 } } });
    const p = parseSettingsFile(text);
    expect(p.unknown).toEqual({ 'future.thing': { a: 1 } });
    expect(p.notices.map((n) => n.kind)).toEqual(['newer-file']);
    expect(JSON.parse(serializeSettings(p.values, p.unknown)).values['future.thing']).toEqual({ a: 1 });
  });
  it('an invalid value loads the default with a notice', () => {
    const p = parseSettingsFile(JSON.stringify({ format: 'gm-settings', version: 1, values: { 'display.interfaceScale': 999 } }));
    expect(p.values['display.interfaceScale']).toBe(100);
    expect(p.notices[0]).toMatchObject({ kind: 'invalid-value', key: 'display.interfaceScale' });
  });
  it('save-scope keys in a user file are not loaded as user values', () => {
    const p = parseSettingsFile(JSON.stringify({ format: 'gm-settings', version: 1, values: { 'gameplay.certified': true } }));
    expect(p.values['gameplay.certified']).toBeUndefined();
    expect(p.unknown['gameplay.certified']).toBe(true);
  });
});

describe('store', () => {
  it('a corrupt file is set aside and defaults are loaded, with a notice', async () => {
    const be = memorySettingsBackend('{not json');
    const { store, notices } = await SettingsStore.open(be);
    expect(notices.map((n) => n.kind)).toEqual(['corrupt-file']);
    expect(be.asideText).toEqual(['{not json']);
    expect(store.get('display.theme')).toBe('system');
    expect(JSON.parse(be.text!).format).toBe('gm-settings');
  });
  it('set validates, writes user settings at once, and reports the change', async () => {
    const be = memorySettingsBackend();
    const { store } = await SettingsStore.open(be);
    const seen: string[] = [];
    store.onChange((c) => seen.push(`${c.key}:${c.from}->${c.to}`));
    expect(await store.set('display.theme', 'neon')).toMatchObject({ ok: false });
    expect(await store.set('display.theme', 'dark')).toMatchObject({ ok: true, change: { scope: 'user' } });
    expect(JSON.parse(be.text!).values).toEqual({ 'display.theme': 'dark' });
    expect(await store.set('display.theme', 'dark')).toEqual({ ok: true, change: null });
    expect(await store.reset('display.theme')).toMatchObject({ ok: true });
    expect(seen).toEqual(['display.theme:system->dark', 'display.theme:dark->system']);
    expect(await store.set('no.such', 1)).toMatchObject({ ok: false });
  });
  it('save-scope changes are returned for the save header and are never written to the user file', async () => {
    const be = memorySettingsBackend();
    const { block } = makeSaveBlock({ 'gameplay.ruleSetId': 'pro_2026' });
    const { store } = await SettingsStore.open(be, block);
    const r = await store.set('gameplay.contentPacks', ['base']);
    expect(r).toMatchObject({ ok: true, change: { scope: 'save', key: 'gameplay.contentPacks' } });
    expect(be.text).toBeNull();
    expect(store.saveBlock()).toEqual({ 'gameplay.ruleSetId': 'pro_2026', 'gameplay.contentPacks': ['base'], 'gameplay.certified': false });
    expect(await store.set('gameplay.ruleSetId', 'college_2026', { afterCreation: true })).toMatchObject({ ok: false });
  });
  it('certified careers lock the settings marked locked_in_certified', async () => {
    const { store } = await SettingsStore.open(memorySettingsBackend());
    expect(await store.set('playback.stoppageCompression', 'instant', { certified: true })).toMatchObject({ ok: false });
    expect(await store.set('mods.enabled', ['x'], { certified: true })).toMatchObject({ ok: false });
    expect(await store.set('display.theme', 'dark', { certified: true })).toMatchObject({ ok: true }); // display never changes football
  });
  it('makeSaveBlock refuses unknown and user keys', () => {
    expect(makeSaveBlock({ 'display.theme': 'dark' }).problems).toHaveLength(1);
    expect(makeSaveBlock({ 'gameplay.certified': 'yes' as unknown as boolean }).problems).toHaveLength(1);
  });
  it('the key-value backend reads and writes one key', async () => {
    const m = new Map<string, string>();
    const be = keyValueSettingsBackend({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) });
    const { store } = await SettingsStore.open(be);
    await store.set('accessibility.reducedMotion', true);
    expect(JSON.parse(m.get('gm.settings')!).values).toEqual({ 'accessibility.reducedMotion': true });
  });
  it('alert level overrides accept only the three levels', async () => {
    const { store } = await SettingsStore.open(memorySettingsBackend());
    expect(await store.set('navigation.alertLevels', { news: 'loud' })).toMatchObject({ ok: false });
    expect(await store.set('navigation.alertLevels', { news: 'quiet' })).toMatchObject({ ok: true });
  });
});
