import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCREENS } from '../../src/shell/registry.ts';
import { COMPOSITIONS, checkComposition, loopSeconds, midiOf, pitchOf } from '../../src/audio/music/compositions.ts';
import { MENU_TRACKS, MenuMusic, SILENT_HUBS, menuTrackFor, type MenuTrack, type MusicContext } from '../../src/audio/music/menu-music.ts';
import { toMusicXml } from '../../src/audio/music/musicxml.ts';
import { settings } from '@gm/app-services';
const { SETTINGS_BY_KEY } = settings;

const ctx = (hub: string, over: Partial<MusicContext> = {}): MusicContext => ({ hub, inGame: false, offseason: false, enabled: true, ...over });

describe('menu music route rule (MB-11, plan rule 6)', () => {
  const gameDayOrFilm = SCREENS.filter((s) => SILENT_HUBS.has(s.hub));

  it('covers every game-day and film screen in the registry', () => {
    expect(gameDayOrFilm.map((s) => s.hub)).toContain('game');
    expect(gameDayOrFilm.map((s) => s.hub)).toContain('film');
    for (const s of SCREENS) if (s.route.startsWith('/game/') || s.route.startsWith('/film/')) expect(SILENT_HUBS.has(s.hub)).toBe(true);
  });

  it('plays nothing on any game-day or film screen, in season or offseason', () => {
    for (const s of gameDayOrFilm) {
      expect(menuTrackFor(ctx(s.hub))).toBeNull();
      expect(menuTrackFor(ctx(s.hub, { offseason: true }))).toBeNull();
    }
  });

  it('plays nothing on any screen while a game is on, overlays included', () => {
    for (const s of SCREENS) expect(menuTrackFor(ctx(s.hub, { inGame: true }))).toBeNull();
    expect(menuTrackFor(ctx('title', { inGame: true }))).toBeNull();
  });

  it('plays nothing anywhere while the setting is off, and the setting defaults to off', () => {
    const def = SETTINGS_BY_KEY.get('audio.menuMusicOn');
    expect(def?.type).toBe('boolean');
    expect(def?.default).toBe(false);
    for (const s of SCREENS) expect(menuTrackFor(ctx(s.hub, { enabled: false }))).toBeNull();
    expect(menuTrackFor(ctx('title', { enabled: false }))).toBeNull();
  });

  it('picks a loop on menu screens when switched on', () => {
    expect(menuTrackFor(ctx('title'))).toBe('title');
    expect(menuTrackFor(ctx('week'))).toBe('weekHub');
    expect(menuTrackFor(ctx('office', { offseason: true }))).toBe('offseason');
    expect(menuTrackFor(ctx('coach'))).toBe('career');
    for (const s of SCREENS) if (!SILENT_HUBS.has(s.hub)) expect(menuTrackFor(ctx(s.hub))).not.toBeNull();
  });

  it('stops when the user walks from a menu into the game and restarts after', () => {
    const calls: string[] = [];
    const music = new MenuMusic({ play: (t: MenuTrack) => calls.push(`play:${t.id}`), stop: () => calls.push('stop') });
    music.update(ctx('week'));
    music.update(ctx('team'));
    music.update(ctx('game'));
    music.update(ctx('school', { inGame: true }));
    music.update(ctx('film'));
    music.update(ctx('week'));
    expect(calls).toEqual(['play:weekHub', 'stop', 'play:weekHub']);
    expect(music.playing).toBe('weekHub');
  });
});

describe('menu loops', () => {
  it('has 4 loops, each with whole bars in every part', () => {
    expect(COMPOSITIONS).toHaveLength(4);
    expect(MENU_TRACKS.map((t) => t.id)).toEqual(['title', 'weekHub', 'career', 'offseason']);
    for (const c of COMPOSITIONS) expect(checkComposition(c)).toEqual([]);
  });

  it('keeps each loop short (10 to 40 seconds)', () => {
    for (const c of COMPOSITIONS) {
      expect(loopSeconds(c)).toBeGreaterThanOrEqual(10);
      expect(loopSeconds(c)).toBeLessThanOrEqual(40);
    }
  });

  it('keeps pitched parts inside playable ranges (MIDI 28 to 84)', () => {
    for (const c of COMPOSITIONS) for (const p of c.parts) for (const bar of p.bars) {
      for (const tok of bar.split(/\s+/)) {
        const head = tok.split(':')[0]!;
        if (head === 'r' || head === 'x') continue;
        for (const pt of head.split('+')) expect(midiOf(pt), `${c.id}/${p.name} ${pt}`).toBeGreaterThanOrEqual(28);
        for (const pt of head.split('+')) expect(midiOf(pt), `${c.id}/${p.name} ${pt}`).toBeLessThanOrEqual(84);
      }
    }
  });

  it('round-trips pitch names', () => {
    for (const p of ['C4', 'Bb1', 'F#5', 'C#4', 'Eb5']) expect(pitchOf(midiOf(p))).toBe(p);
  });

  it('writes the same MusicXML every time, with every bar and part', () => {
    for (const c of COMPOSITIONS) {
      const xml = toMusicXml(c);
      expect(toMusicXml(c)).toBe(xml);
      expect(xml.match(/<part id=/g)).toHaveLength(c.parts.length);
      expect(xml.match(/<measure /g)).toHaveLength(c.parts.length * c.parts[0]!.bars.length);
      expect(xml).toContain(`<sound tempo="${c.bpm}"/>`);
    }
  });

  it('refuses a bar of the wrong length', () => {
    const bad = { ...COMPOSITIONS[0]!, parts: [{ ...COMPOSITIONS[0]!.parts[0]!, bars: ['C4:q'] }] };
    expect(() => toMusicXml(bad)).toThrow(/units, expected 16/);
  });

  it('has a rendered file for every loop, each listed in the licence register with its hash', () => {
    const reg = JSON.parse(readFileSync('assets/LICENSES.json', 'utf8')) as { assets: Array<{ path: string; sha256: string }> };
    for (const t of MENU_TRACKS) {
      const row = reg.assets.find((r) => r.path === t.file);
      expect(row, t.file).toBeDefined();
      expect(createHash('sha256').update(readFileSync(t.file)).digest('hex')).toBe(row!.sha256);
    }
  });
});
