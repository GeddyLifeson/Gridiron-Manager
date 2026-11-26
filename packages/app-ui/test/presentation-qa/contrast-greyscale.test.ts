// PV-17 contrast and greyscale checks (O5.5.1, Q1.5.1; WCAG 2.2 SC 1.4.3, Verified in O5.5.1).
// Two levels: the token pairs (already in test/tokens, repeated here as the suite's gate), and the drawn pairs:
// every run of text in every surface of the gallery against the background it is really drawn on, in every
// theme and colour-vision palette. Greyscale: the state colours must differ in grey or carry a label, and the
// drawn text must keep its ratio in grey (the ratio is luminance only, so a hue-only difference cannot pass).
import { describe, expect, it } from 'vitest';
import { checkContrast, CONTRAST_FLOOR, THEME_IDS, COLOUR_VISION_IDS, relativeLuminance, resolveColours, tokenValue } from '../../src/tokens/index.ts';
import { greyFailures, markerProblems } from '../harness/greyscale.ts';
import { GALLERY_VARIANTS, SURFACES, surfaceMarkup } from './gallery.ts';
import { ratio, textRuns } from './markup.ts';

describe('token pairs (suite gate)', () => {
  it('every declared pair meets its floor in every theme and palette', () => expect(checkContrast()).toEqual([]));
});

describe('drawn text against its own background', () => {
  for (const { theme, vision } of GALLERY_VARIANTS) {
    it(`${theme} / ${vision}: every text run is at least ${CONTRAST_FLOOR.text}:1`, () => {
      const fails: string[] = [];
      let runs = 0;
      for (const s of SURFACES) {
        // The plain look is the fallback for high contrast, so the Classic strip in that theme is the plain one (plan 2.1).
        for (const r of textRuns(surfaceMarkup(s, theme), theme, vision)) {
          runs++;
          const c = ratio(r.fg, r.bg);
          if (c < CONTRAST_FLOOR.text) fails.push(`${s}: "${r.text.slice(0, 30)}" ${r.fg} on ${r.bg} = ${c.toFixed(2)}`);
        }
      }
      expect(runs).toBeGreaterThan(100);
      expect(fails).toEqual([]);
    });
  }

  it('the reader really sees the colours: a planted low-contrast style is caught', () => {
    const planted = '<section data-surface="x" style="background:#777777"><span style="color:#808080">hello</span></section>';
    const [r] = textRuns(planted, 'dark', 'none');
    expect(r!.text).toBe('hello');
    expect(ratio(r!.fg, r!.bg)).toBeLessThan(CONTRAST_FLOOR.text);
  });
});

describe('greyscale (Q1.5.1)', () => {
  // The chips are labelled with their state word, so a pair that looks alike in grey is carried by the label.
  const STATE_COLOURS = ['state.good', 'state.caution', 'state.bad', 'state.neutral'] as const;
  const LABELLED = new Set(STATE_COLOURS.flatMap((a) => STATE_COLOURS.map((b) => `${a}|${b}`)));

  it('state chips are labelled, in every variant', () => {
    for (const { theme, vision } of GALLERY_VARIANTS) {
      const html = surfaceMarkup('states', theme);
      for (const s of ['good', 'caution', 'bad', 'neutral']) expect(html, `${theme}/${vision}`).toContain(`data-state-chip="${s}"`);
    }
  });

  it('state colours either differ in grey or are carried by their label', () => {
    expect(greyFailures(STATE_COLOURS, LABELLED)).toEqual([]);
  });

  // PV-17 found team.home and team.away 1.02 to 1.17:1 apart in grey (hue only). Fixed 2026-11-26: the tokens now
  // keep them 1.32 to 1.38:1 apart in every theme and palette. The name and possession carriers stay required too.
  it('home and away stay apart in grey in every theme and palette, and their name and shape carriers are present', () => {
    expect(greyFailures(['team.home', 'team.away'])).toEqual([]);
    for (const theme of THEME_IDS) {
      const strip = surfaceMarkup('strip-plain', theme);
      expect(strip, theme).toMatch(/data-item="teams"/);
      expect(strip, theme).toMatch(/data-item="possession"/);
    }
  });

  it('marker shapes alone tell the sides and groups apart', () => expect(markerProblems()).toEqual([]));

  it('drawn text keeps its contrast when every colour is turned into its grey level', () => {
    for (const { theme, vision } of GALLERY_VARIANTS) {
      const block = resolveColours(theme, vision);
      for (const [fg, bg] of [['text.ink', 'surface.panel'], ['text.muted', 'surface.panel'], ['text.ink', 'surface.raised']] as const) {
        const grey = (hex: string) => { const l = relativeLuminance(hex); const c = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)); return `#${[c, c, c].map((x) => x.toString(16).padStart(2, '0')).join('')}`; };
        const colour = ratio(tokenValue(block, fg), tokenValue(block, bg));
        const grayRatio = ratio(grey(tokenValue(block, fg)), grey(tokenValue(block, bg)));
        // Rounding to 8 bits moves the ratio a little; it must not move it across the floor.
        expect(Math.abs(colour - grayRatio) / colour, `${theme}/${vision} ${fg} on ${bg}`).toBeLessThan(0.08);
      }
    }
  });
});
