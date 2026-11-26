// PV-14 (presentation plan 4.1 and 7, amendment A-3): one volume and one switch per mixer bus, a mono
// switch and the captions setting; the old whistle-and-crowd and alert keys carry over.
import { describe, expect, it } from 'vitest';
import { LEGACY_AUDIO_KEYS, SETTINGS_BY_KEY, parseSettingsFile } from '../../src/settings/index.ts';

const BUSES = ['master', 'crowd', 'officials', 'contact', 'cadence', 'ui', 'ambience', 'music'] as const;
const switchKey = (b: string) => (b === 'music' ? 'audio.menuMusicOn' : `audio.${b}On`);
const file = (values: Record<string, unknown>) => JSON.stringify({ format: 'gm-settings', version: 1, values });

describe('audio settings (PV-14)', () => {
  it('has a 0..100 volume and an off switch for each of the eight buses', () => {
    for (const b of BUSES) {
      const vol = SETTINGS_BY_KEY.get(`audio.${b}Volume`);
      expect(vol?.type, b).toBe('number');
      if (vol?.type === 'number') { expect(vol.min).toBe(0); expect(vol.max).toBe(100); expect(vol.default).toBe(100); }
      expect(SETTINGS_BY_KEY.get(switchKey(b))?.type, b).toBe('boolean');
    }
  });
  it('ships ambience and music off, the rest on (plan 4.2, plan 9)', () => {
    for (const b of BUSES) expect(SETTINGS_BY_KEY.get(switchKey(b))?.default, b).toBe(!(b === 'ambience' || b === 'music'));
  });
  it('has a mono switch, off by default, and a captions setting that defaults to auto', () => {
    expect(SETTINGS_BY_KEY.get('audio.mono')?.default).toBe(false);
    const c = SETTINGS_BY_KEY.get('accessibility.captions');
    expect(c?.type).toBe('enum');
    if (c?.type === 'enum') expect([...c.options]).toEqual(['auto', 'on', 'off']);
    expect(c?.default).toBe('auto');
  });
  it('no audio or accessibility setting is locked in certified careers (they change no result)', () => {
    for (const d of SETTINGS_BY_KEY.values()) if (d.group === 'audio' || d.group === 'accessibility') expect(d.lockedInCertified, d.key).toBe(false);
  });
  it('drops the old keys from the schema', () => {
    for (const k of Object.keys(LEGACY_AUDIO_KEYS)) expect(SETTINGS_BY_KEY.has(k), k).toBe(false);
  });
});

describe('carrying old audio settings over', () => {
  it('copies the whistle-and-crowd volume to crowd and officials, and alerts to ui', () => {
    const p = parseSettingsFile(file({ 'audio.whistleCrowdVolume': 40, 'audio.whistleCrowdOn': false, 'audio.alertsVolume': 70, 'audio.alertsOn': false }));
    expect(p.values['audio.crowdVolume']).toBe(40);
    expect(p.values['audio.officialsVolume']).toBe(40);
    expect(p.values['audio.crowdOn']).toBe(false);
    expect(p.values['audio.officialsOn']).toBe(false);
    expect(p.values['audio.uiVolume']).toBe(70);
    expect(p.values['audio.uiOn']).toBe(false);
    // The old keys are kept as unknown keys, so a downgrade loses nothing.
    expect(p.unknown['audio.whistleCrowdVolume']).toBe(40);
    expect(p.notices).toEqual([]);
  });
  it('never overwrites a new key the file already holds', () => {
    const p = parseSettingsFile(file({ 'audio.whistleCrowdVolume': 40, 'audio.crowdVolume': 90 }));
    expect(p.values['audio.crowdVolume']).toBe(90);
    expect(p.values['audio.officialsVolume']).toBe(40);
  });
  it('ignores an old value that is not valid', () => {
    const p = parseSettingsFile(file({ 'audio.whistleCrowdVolume': 45 }));
    expect(p.values['audio.crowdVolume']).toBe(100);
  });
});
