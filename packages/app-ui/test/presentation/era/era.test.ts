// PV-18 acceptance (plan section 8): both display faces drawn by code with no font file; Classic
// tokens pass every contrast and greyscale test; grain draws from cosmetic.display, never shifts a
// marker, and turns off under reduced motion and high contrast; 16mm before 1986 and tape after;
// no NFL or real-broadcast names or marks.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ERA_KEYS, FIELD_SURFACES, SURFACE_COLOURS, resolveEraColours, eraTokenVariables, checkSurfaceContrast, eraVar,
  GLYPH_CHARS, GLYPH_COLS, GLYPH_ROWS, glyphBits, normaliseChar,
  lampLayout, segmentCells, clockText, SEGMENT_CHARS,
  cgLayout, cgBits, lowerThirdLayout, CG_COLS,
  filmStockFor, filmLookActive, grainFrame, filmLayers, frameCounter, leaderTitle, leaderCard, quarterLabel, FILM_LAYER_KINDS, GRAIN_NONE,
  LampText, SegmentClock, CgText, LowerThird, LeaderCardView,
} from '../../../src/presentation/era/index.ts';
import { TOKENS, THEME_IDS, TOKEN_GROUPS, COLOUR_VISION_IDS, checkContrast, contrastRatio, tokenValue, cssVar, resolveColours, type ThemeId, type TokenFile } from '../../../src/tokens/index.ts';
import { GREY_PAIR_FLOOR } from '../../harness/greyscale.ts';
import { cosmeticStream } from '../../../../app-services/src/cosmetic/index.ts';

const ERA_DIR = join(import.meta.dirname, '../../../src/presentation/era');
const eraFiles = readdirSync(ERA_DIR).filter((f) => statSync(join(ERA_DIR, f)).isFile());

describe('Classic theme colours (O5.5.1, O6.2.1)', () => {
  const ERA = (th: ThemeId) => TOKENS.themes[th].era;
  it('is one of the game themes, with every group and key the base themes have', () => {
    expect(THEME_IDS).toContain('classic');
    for (const g of TOKEN_GROUPS) expect(Object.keys(TOKENS.themes.classic[g]).sort(), g).toEqual(Object.keys(TOKENS.themes.light[g]).sort());
  });
  it('every theme has every era key', () => {
    for (const th of THEME_IDS) expect(Object.keys(ERA(th)).sort(), th).toEqual([...ERA_KEYS].sort());
  });
  it('passes every contrast pair in every theme and palette (tokens check) and on both venue surfaces', () => {
    expect(checkContrast()).toEqual([]);
    expect(checkSurfaceContrast()).toEqual([]);
  });
  it('a muddy Classic panel or a bright unlit lamp fails the check (the check can fail)', () => {
    const bad = structuredClone(TOKENS) as TokenFile;
    bad.themes.classic.surface.panel = '#8a7a62';
    expect(checkContrast(bad).some((f) => f.theme === 'classic' && f.bg === 'surface.panel')).toBe(true);
    const bad2 = structuredClone(TOKENS) as TokenFile;
    bad2.themes.classic.era.lampOff = '#c08a30';
    expect(checkContrast(bad2).some((f) => f.theme === 'classic' && f.bg === 'era.lampOff')).toBe(true);
    const turf = structuredClone(SURFACE_COLOURS);
    turf.artificial.turf = '#9fdc9f';
    expect(checkSurfaceContrast(TOKENS, turf).some((f) => f.surface === 'artificial' && f.bg === 'field.turf')).toBe(true);
  });
  it('greyscale: home and away, and the state colours, stay apart in grey wherever the dark theme does', () => {
    const names = ['team.home', 'team.away'];
    const states = ['state.good', 'state.bad'];
    for (const surface of FIELD_SURFACES) for (const vision of COLOUR_VISION_IDS) {
      const b = resolveEraColours({ theme: 'classic', colourVision: vision, surface });
      const dark = resolveColours('dark', vision);
      const plainHomeAway = contrastRatio(tokenValue(dark, names[0]!), tokenValue(dark, names[1]!));
      const classicHomeAway = contrastRatio(tokenValue(b, names[0]!), tokenValue(b, names[1]!));
      if (plainHomeAway >= GREY_PAIR_FLOOR) expect(classicHomeAway, `${surface}/${vision} home-away`).toBeGreaterThanOrEqual(GREY_PAIR_FLOOR);
      const plainStates = contrastRatio(tokenValue(dark, states[0]!), tokenValue(dark, states[1]!));
      const classicStates = contrastRatio(tokenValue(b, states[0]!), tokenValue(b, states[1]!));
      if (plainStates >= GREY_PAIR_FLOOR) expect(classicStates, `${surface}/${vision} good-bad`).toBeGreaterThanOrEqual(GREY_PAIR_FLOOR);
    }
  });
  it('greyscale: lit and unlit lamps and segments differ by at least 3:1 in every theme', () => {
    for (const th of THEME_IDS) {
      const e = ERA(th);
      expect(contrastRatio(e.lampOn!, e.lampOff!), th).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(e.lampAlert!, e.lampOff!), th).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(e.segmentOn!, e.segmentOff!), th).toBeGreaterThanOrEqual(3);
    }
  });
  it('artificial turf changes only the field surface colours', () => {
    const g = resolveEraColours({ theme: 'classic', surface: 'grass' });
    const a = resolveEraColours({ theme: 'classic', surface: 'artificial' });
    expect(a.field.turf).not.toBe(g.field.turf);
    expect({ ...a.field, turf: 0, endZone: 0, surround: 0 }).toEqual({ ...g.field, turf: 0, endZone: 0, surround: 0 });
    expect(a.surface).toEqual(g.surface);
  });
  it('the plain themes resolve exactly as the token module does, whatever the surface', () => {
    for (const th of ['light', 'dark', 'high-contrast'] as const) for (const cv of COLOUR_VISION_IDS) expect(resolveEraColours({ theme: th, colourVision: cv, surface: 'artificial' })).toEqual(resolveColours(th, cv));
  });
  it('variables: same keys in every theme, era variables present, Classic colours applied', () => {
    const keys = (th: ThemeId) => Object.keys(eraTokenVariables({ theme: th })).sort();
    for (const th of THEME_IDS) expect(keys(th)).toEqual(keys('light'));
    const c = eraTokenVariables({ theme: 'classic', surface: 'artificial' });
    expect(c[cssVar('surface.bg')]).toBe(TOKENS.themes.classic.surface.bg);
    expect(c[eraVar('lampOn')]).toBe(TOKENS.themes.classic.era.lampOn);
    expect(c[eraVar('lampAlert')]).toBe(TOKENS.themes.classic.era.lampAlert);
    expect(eraVar('lampAlert')).toBe('--gm-era-lamp-alert');
    expect(c[cssVar('field.turf')]).toBe(SURFACE_COLOURS.artificial.turf);
    expect(c['color-scheme']).toBe('dark');
    expect(eraTokenVariables({ theme: 'classic', interfaceScalePct: 200 })['--gm-row']).toBe('48px');
  });
});

describe('display faces drawn by code (no font file)', () => {
  it('no font file sits in the era folder and no component loads one', () => {
    expect(eraFiles.filter((f) => /\.(ttf|otf|woff2?|eot|fnt|bdf|pcf)$/i.test(f))).toEqual([]);
    for (const f of eraFiles) expect(readFileSync(join(ERA_DIR, f), 'utf8'), f).not.toMatch(/@font-face|FontFace\(|fontFamily/);
  });
  it('every glyph is 5 x 7 and every printable glyph lights something', () => {
    for (const ch of GLYPH_CHARS) {
      const b = glyphBits(ch);
      expect(b.length, ch).toBe(GLYPH_ROWS);
      for (const row of b) expect(row.length, ch).toBe(GLYPH_COLS);
      if (ch !== ' ') expect(b.flat().some(Boolean), ch).toBe(true);
    }
  });
  it('covers A-Z, 0-9 and the strip and banner punctuation; folds case; unknown becomes ?', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-+/\'"!?&#%()<>') expect(GLYPH_CHARS, ch).toContain(ch);
    expect(normaliseChar('q')).toBe('Q');
    expect(normaliseChar('é')).toBe('?');
  });
  it('no two characters share a bitmap (each reads as itself)', () => {
    const seen = new Map<string, string>();
    for (const ch of GLYPH_CHARS) {
      const k = glyphBits(ch).map((r) => r.map((x) => (x ? 1 : 0)).join('')).join('/');
      expect(seen.get(k), `${ch} duplicates ${seen.get(k)}`).toBeUndefined();
      seen.set(k, ch);
    }
  });
  it('lamp layout: fixed pitch, every grid cell is a lamp, lit lamps match the glyphs', () => {
    const l = lampLayout('3RD');
    expect(l.cols).toBe(3 * 5 + 2);
    expect(l.lamps.length).toBe(l.cols * 7);
    const lit = l.lamps.filter((x) => x.on).length;
    const expected = ['3', 'R', 'D'].reduce((n, c) => n + glyphBits(c).flat().filter(Boolean).length, 0);
    expect(lit).toBe(expected);
  });
  it('lamp layout pads and clips to a fixed number of board cells', () => {
    expect(lampLayout('7', { cells: 2, align: 'right' }).text).toBe(' 7');
    expect(lampLayout('HOMETEAM', { cells: 4 }).text).toBe('HOME');
    expect(lampLayout('', { cells: 3 }).cols).toBe(17);
  });
  it('segment clock: digits and colon; rejects letters', () => {
    const c = segmentCells('12:34');
    expect(c.map((x) => x.kind)).toEqual(['digit', 'digit', 'colon', 'digit', 'digit']);
    const eight = segmentCells('8')[0]!;
    expect(eight.kind === 'digit' && Object.values(eight.lit).every(Boolean)).toBe(true);
    expect(() => segmentCells('A')).toThrow();
    expect(SEGMENT_CHARS).toContain(':');
    expect(clockText(754)).toBe('12:34');
    expect(clockText(65)).toBe(' 1:05');
    expect(clockText(-3)).toBe(' 0:00');
  });
  it('character generator: emboldened by one cell, runs cover exactly the set cells', () => {
    expect(cgBits('I')[0]!.length).toBe(CG_COLS);
    const l = cgLayout('PUNT');
    const cells = l.runs.reduce((n, r) => n + r.w, 0);
    const expected = ['P', 'U', 'N', 'T'].reduce((n, ch) => n + cgBits(ch).flat().filter(Boolean).length, 0);
    expect(cells).toBe(expected);
    expect(l.text).toBe('PUNT');
  });
  it('lower third: one to three lines, first on the main bar', () => {
    const l = lowerThirdLayout(['FLAG ON THE PLAY', 'HOLDING  OFFENSE']);
    expect(l.lines.map((x) => x.bar)).toEqual(['cgBar', 'cgBarAlt']);
    expect(() => lowerThirdLayout([])).toThrow();
    expect(() => lowerThirdLayout(['A', 'B', 'C', 'D'])).toThrow();
  });
  it('components render SVG with era variables only and an accessible name', () => {
    const html = [
      renderToStaticMarkup(createElement(LampText, { text: 'HOME 14' })),
      renderToStaticMarkup(createElement(SegmentClock, { value: '12:34' })),
      renderToStaticMarkup(createElement(CgText, { text: '3RD AND 7' })),
      renderToStaticMarkup(createElement(LowerThird, { lines: ['TIMEOUT', 'HOME  2 LEFT'] })),
      renderToStaticMarkup(createElement(LeaderCardView, { card: leaderCard({ reel: 2, quarter: 3, seasonYear: 1979 }) })),
    ];
    for (const h of html) {
      expect(h).toContain('<svg');
      expect(h).toMatch(/aria-label="[^"]+"/);
      for (const m of h.matchAll(/fill="([^"]+)"/g)) expect(m[1]).toMatch(/^var\(--gm-era-[a-z-]+\)$/);
      expect(h).not.toMatch(/animate|transition/);
    }
    expect(html[3]).toContain('role="status"');
  });
});

describe('film look (plan 2.1, O2.6)', () => {
  it('16mm before 1986, videotape from 1986 on', () => {
    expect(filmStockFor(1869)).toBe('16mm');
    expect(filmStockFor(1985)).toBe('16mm');
    expect(filmStockFor(1986)).toBe('videotape');
    expect(filmStockFor(2026)).toBe('videotape');
    expect(() => filmStockFor(1985.5)).toThrow();
  });
  it('turns off under reduced motion, high contrast and plain film', () => {
    const base = { reducedMotion: false, theme: 'classic' as const, plainFilm: false };
    expect(filmLookActive(base)).toBe(true);
    expect(filmLookActive({ ...base, reducedMotion: true })).toBe(false);
    expect(filmLookActive({ ...base, theme: 'high-contrast' })).toBe(false);
    expect(filmLookActive({ ...base, plainFilm: true })).toBe(false);
    const off = filmLayers({ ...base, reducedMotion: true, seasonYear: 1975, frame: 10 });
    expect(off.map((l) => l.kind)).toEqual(['counter']);
  });
  it('layers are overlays only: no position, offset, scale or transform anywhere', () => {
    for (const seasonYear of [1975, 1995]) {
      const layers = filmLayers({ reducedMotion: false, theme: 'classic', plainFilm: false, seasonYear, frame: 100 });
      for (const l of layers) {
        expect(FILM_LAYER_KINDS).toContain(l.kind);
        expect(Object.keys(l).filter((k) => /^(x|y|dx|dy|offset|translate|scale|rotate|transform|jitter|weave)/i.test(k))).toEqual([]);
      }
    }
    expect(readFileSync(join(ERA_DIR, 'film.ts'), 'utf8').replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '')).not.toMatch(/translate\(|rotate\(|\.position\b|positions/);
  });
  it('tape adds scan lines; film does not', () => {
    const k = (y: number) => filmLayers({ reducedMotion: false, theme: 'classic', plainFilm: false, seasonYear: y, frame: 0 }).map((l) => l.kind);
    expect(k(1975)).toEqual(['grain', 'vignette', 'counter']);
    expect(k(1990)).toEqual(['grain', 'vignette', 'tapeLines', 'counter']);
  });
  it('grain draws from cosmetic.display: one draw per cell, replay gives the same frames, frames differ', () => {
    const scope = { gameId: 7, playNumber: 42 };
    const a = cosmeticStream('a1b2c3', 'display', scope);
    const b = cosmeticStream('a1b2c3', 'display', scope);
    expect(a.name).toBe('cosmetic.display');
    const a1 = grainFrame(a, 40, 30, '16mm');
    const perFrame = a.draws;
    expect(perFrame).toBeGreaterThanOrEqual(40 * 30);
    const a2 = grainFrame(a, 40, 30, '16mm');
    expect(a.draws).toBe(2 * perFrame);
    expect(grainFrame(b, 40, 30, '16mm')).toEqual(a1);
    expect(grainFrame(b, 40, 30, '16mm')).toEqual(a2);
    expect(a2).not.toEqual(a1);
    const specks = a1.filter((x) => x !== GRAIN_NONE).length / a1.length;
    expect(specks).toBeGreaterThan(0.02);
    expect(specks).toBeLessThan(0.16);
  });
  it('grain never touches game data: drawing it leaves a set of marker positions identical', () => {
    const markers = Object.freeze([{ id: 1, x: 10.5, y: 26.65 }, { id: 2, x: 12, y: 30 }].map((m) => Object.freeze(m)));
    const before = JSON.stringify(markers);
    grainFrame(cosmeticStream('ff', 'display', { gameId: 1, playNumber: 1 }), 64, 36, 'videotape');
    filmLayers({ reducedMotion: false, theme: 'classic', plainFilm: false, seasonYear: 1977, frame: 5 });
    expect(JSON.stringify(markers)).toBe(before);
    expect(grainFrame.length).toBe(4); // draw, cols, rows, stock: no marker input exists
  });
  it('frame counter and leader cards', () => {
    expect(frameCounter(1234, '16mm')).toBe('FR 001234');
    expect(frameCounter(30 * 62 + 15, 'videotape')).toBe('00:01:02:15');
    expect(leaderTitle(2, 3, '16mm')).toBe('REEL 2  3RD QTR');
    expect(leaderTitle(1, 5, 'videotape')).toBe('TAPE 1  OT');
    expect(quarterLabel(6)).toBe('OT 2');
    expect(leaderCard({ reel: 1, quarter: 1, seasonYear: 1990, subtitle: 'third down' })).toMatchObject({ stock: 'videotape', subtitle: 'THIRD DOWN' });
    expect(() => leaderTitle(0, 1, '16mm')).toThrow();
  });
});

describe('legal lines (A6, plan 2.1 "Never")', () => {
  const banned = /\bNFL\b|NFL Films|National Football League|Super Bowl|Monday Night|\bCBS\b|\bNBC\b|\bABC\b|\bESPN\b|\bFox\b|Chyron|Chiron|Diamond Vision|Jumbotron|Daktronics|Astro ?Turf|Fox 40/;
  it('no NFL, broadcaster, stadium-product or trade names in the era folder', () => {
    for (const f of eraFiles) {
      const src = readFileSync(join(ERA_DIR, f), 'utf8');
      // The film-to-tape source citation names an NFL.com article; citations are allowed only inside FILM_TO_TAPE.
      const stripped = src.replace(/sources: \[[^\]]*\]/g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '');
      expect(stripped.match(banned)?.[0], `${relative(ERA_DIR, join(ERA_DIR, f))}`).toBeUndefined();
    }
  });
  it('the alert colour (late play clock) lights lamps and segments in the contrasting lamp colour', () => {
    const lamp = renderToStaticMarkup(createElement(LampText, { text: '9', colour: 'alert', sizePx: 20 }));
    expect(lamp).toContain('var(--gm-era-lamp-alert)');
    expect(lamp).toContain('height="20"');
    const clock = renderToStaticMarkup(createElement(SegmentClock, { value: '0:09', colour: 'alert' }));
    expect(clock).toContain('var(--gm-era-lamp-alert)');
    expect(clock).not.toContain('var(--gm-era-segment-on)');
    expect(renderToStaticMarkup(createElement(SegmentClock, { value: '0:40' }))).toContain('var(--gm-era-segment-on)');
  });
  it('no image, logo or shield field in the token file', () => {
    expect(JSON.stringify(TOKENS) + JSON.stringify(SURFACE_COLOURS)).not.toMatch(/logo|shield|image|url\(/i);
  });
});
