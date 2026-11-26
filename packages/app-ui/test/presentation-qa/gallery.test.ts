// PV-17 screenshot-set checks that need no browser: every theme and colour-vision palette draws every surface,
// every token variable the drawn markup names exists (or has its fallback), no literal colour is in the markup
// but the teams' own, and every 3.4 strip item is on the board in each variant.
import { describe, expect, it } from 'vitest';
import { STRIP_ITEMS } from '../../src/presentation/strip/index.ts';
import { GLYPHS } from '../../src/presentation/icons/index.ts';
import { tokenVariables, THEME_IDS, COLOUR_VISION_IDS } from '../../src/tokens/index.ts';
import { GALLERY_VARIANTS, STRIP_SAMPLE, SURFACES, galleryHtml, surfaceMarkup } from './gallery.ts';

describe('the gallery covers every theme and palette the token file has', () => {
  it('is the full cross of themes and colour-vision palettes', () => {
    expect(GALLERY_VARIANTS.length).toBe(THEME_IDS.length * COLOUR_VISION_IDS.length);
    expect(new Set(GALLERY_VARIANTS.map((x) => `${x.theme}/${x.vision}`)).size).toBe(GALLERY_VARIANTS.length);
  });

  for (const { theme, vision } of GALLERY_VARIANTS) {
    describe(`${theme} / ${vision}`, () => {
      const html = galleryHtml({ theme, vision });
      const vars = tokenVariables({ theme, colourVision: vision });

      it('draws every surface', () => {
        for (const s of SURFACES) expect(html, s).toContain(`data-surface="${s}"`);
      });

      it('every token variable in the markup is defined, or has a fallback', () => {
        const body = html.slice(html.indexOf('<body'));
        const missing = new Set<string>();
        for (const m of body.matchAll(/var\((--gm-[a-z0-9-]+)(\s*,)?/gi)) if (!(m[1]! in vars) && !m[2]) missing.add(m[1]!);
        expect([...missing]).toEqual([]);
      });

      it('no literal colour in any surface except the teams\' own swatches', () => {
        const body = html.slice(html.indexOf('<body'));
        const allowed = new Set(STRIP_SAMPLE.teams.flatMap((t) => [t.primary.toLowerCase(), t.secondary.toLowerCase()]));
        const literals = [...body.matchAll(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi)].map((m) => m[0].toLowerCase()).filter((c) => !allowed.has(c));
        expect(literals).toEqual([]);
      });

      it('every plan 3.4 strip item is on the board', () => {
        const strip = surfaceMarkup('strip-plain', theme);
        for (const item of STRIP_ITEMS) expect(strip, item).toContain(`data-item="${item}"`);
      });

      it('every icon is drawn normal, active and disabled, with its label', () => {
        const icons = surfaceMarkup('icons', theme);
        for (const g of GLYPHS) {
          expect((icons.match(new RegExp(`data-icon="${g.id}"`, 'g')) ?? []).length, g.id).toBe(3);
          expect(icons, g.id).toContain(`aria-label="${g.label}`);
        }
      });
    });
  }
});
