// PV-17 gallery: every presentation surface that is plain DOM, drawn once per theme and colour-vision
// palette as one static HTML page. The same page feeds the SSR tests (test/presentation-qa/*.test.ts) and the
// browser script (scripts/presentation-qa/screenshots.ts), so what the tests check is what the screenshot shows.
// The field view draws on a canvas and is covered by its own tests (test/field-view) and by the token pairs
// in `checkContrast`; PV-03 adds its screenshot when the field art lands.
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GLYPHS, Icon } from '../../src/presentation/icons/index.ts';
import { Strip, stripModel, type StripInput } from '../../src/presentation/strip/index.ts';
import { BannerView, BANNER_KINDS, bannerLines, type ShowingBanner } from '../../src/presentation/banners/index.ts';
import { CaptionStripView, type CaptionLine } from '../../src/presentation/captions/index.ts';
import { tokenCss, v, COLOUR_VISION_IDS, THEME_IDS, type ColourVisionId, type ThemeId } from '../../src/tokens/index.ts';

export const STRIP_SAMPLE: StripInput = {
  teams: [{ short: 'Harbor', primary: '#1d4e89', secondary: '#f2b134' }, { short: 'Ridge', primary: '#7a1f2b', secondary: '#e8e1d0' }],
  possession: 1, quarter: 2, clock: '4:07', clockRunning: false, score: [10, 7], downDistance: '3rd & 7', spot: 'OWN 25',
  timeouts: [3, 1], timeoutsPerHalf: 3, playClockTenths: 74, live: false,
  noise: 0.72, noiseBase: 0.4, windMph: 12, gustMph: 18, windDirDeg: 90, indoors: false,
};

const CAPTIONS: CaptionLine[] = [
  { text: 'whistle', count: 1, fromMs: 0, untilMs: 2500 },
  { text: 'hit', count: 3, fromMs: 400, untilMs: 2900 },
  { text: 'crowd rising', count: 1, fromMs: 900, untilMs: 3400 },
];

export const SURFACES = ['strip-classic', 'strip-plain', 'banners', 'captions', 'icons', 'states'] as const;
export type Surface = (typeof SURFACES)[number];

function banner(kind: (typeof BANNER_KINDS)[number], i: number): ShowingBanner {
  return { kind, key: `${kind}-${i}`, rank: i, lines: bannerLines(kind, { team: 'Harbor', player: 'No. 22', yards: 12, down: '3rd', distance: 7 } as never), cueRow: null, enqueuedMs: 0, startMs: 0, endMs: 3000 };
}

const section = (id: Surface, title: string, child: ReactElement | ReactElement[]): ReactElement =>
  createElement('section', { 'data-surface': id, key: id, style: { margin: 'calc(var(--gm-space) * 3) 0', padding: 'calc(var(--gm-space) * 2)', background: v('surface.panel'), color: v('text.ink'), border: `var(--gm-line-weight-thin) solid ${v('line.default')}` } },
    createElement('h2', { style: { margin: '0 0 var(--gm-space)', fontSize: 'var(--gm-type-md)', color: v('text.muted') } }, title), child);

/** The state colours as labelled chips: the label carries the state, the colour is a second channel (O6.3.1). */
function states(): ReactElement {
  const chips = ['good', 'caution', 'bad', 'neutral'] as const;
  return createElement('div', { style: { display: 'flex', gap: 'calc(var(--gm-space) * 2)', flexWrap: 'wrap' } },
    ...chips.map((s) => createElement('span', { key: s, 'data-state-chip': s, style: { color: v(`state.${s}`), border: `var(--gm-line-weight-medium) solid ${v(`state.${s}`)}`, padding: 'var(--gm-space) calc(var(--gm-space) * 2)', fontWeight: 700 } }, s)),
    createElement('span', { key: 'h', 'data-team': 'home', style: { color: v('team.home'), fontWeight: 700 } }, 'Home'),
    createElement('span', { key: 'a', 'data-team': 'away', style: { color: v('team.away'), fontWeight: 700 } }, 'Away'));
}

/** Body markup (no html or head) for one surface. */
export function surfaceMarkup(s: Surface, theme: ThemeId): string {
  const render = (e: ReactElement) => renderToStaticMarkup(e);
  switch (s) {
    case 'strip-classic': return render(section(s, 'Score strip, Classic look', createElement(Strip, { model: stripModel(STRIP_SAMPLE), look: theme === 'high-contrast' ? 'plain' : 'classic' })));
    case 'strip-plain': return render(section(s, 'Score strip, plain look', createElement(Strip, { model: stripModel({ ...STRIP_SAMPLE, playClockTenths: 214, live: false }), look: 'plain' })));
    case 'banners': return render(section(s, 'Banners (both looks, every kind)', BANNER_KINDS.flatMap((k, i) => [
      createElement('div', { key: `${k}-c`, style: { margin: 'var(--gm-space) 0' } }, createElement(BannerView, { banner: banner(k, i), look: theme === 'high-contrast' ? 'plain' : 'classic', onSkip: () => undefined })),
      createElement('div', { key: `${k}-p`, style: { margin: 'var(--gm-space) 0' } }, createElement(BannerView, { banner: banner(k, i), look: 'plain', onSkip: () => undefined })),
    ])));
    case 'captions': return render(section(s, 'Captions strip', createElement(CaptionStripView, { lines: CAPTIONS, visible: true })));
    case 'icons': return render(section(s, 'Icons (normal, active, disabled)', createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--gm-space)' } },
      ...GLYPHS.flatMap((g) => [
        createElement(Icon, { key: `${g.id}-n`, id: g.id }),
        createElement(Icon, { key: `${g.id}-a`, id: g.id, state: 'active' }),
        createElement(Icon, { key: `${g.id}-d`, id: g.id, state: 'disabled', reason: 'not now' }),
      ]))));
    case 'states': return render(section(s, 'State colours', states()));
  }
}

export interface GalleryOptions { theme: ThemeId; vision?: ColourVisionId; interfaceScalePct?: number; textScalePct?: number; surfaces?: readonly Surface[] }

/** A whole page: tokens as CSS variables on :root, the page background, and the chosen surfaces. */
export function galleryHtml(o: GalleryOptions): string {
  const css = tokenCss({ theme: o.theme, colourVision: o.vision ?? 'none', ...(o.interfaceScalePct ? { interfaceScalePct: o.interfaceScalePct } : {}), ...(o.textScalePct ? { textScalePct: o.textScalePct } : {}) });
  const body = (o.surfaces ?? SURFACES).map((s) => surfaceMarkup(s, o.theme)).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PV-17 gallery ${o.theme} ${o.vision ?? 'none'}</title>
<style>${css}
html,body{margin:0;background:var(--gm-surface-bg);color:var(--gm-text-ink);font-family:var(--gm-font);font-feature-settings:var(--gm-font-features);font-size:var(--gm-type-md)}
body{padding:calc(var(--gm-space) * 2);width:1200px}</style></head><body data-theme="${o.theme}" data-vision="${o.vision ?? 'none'}">${body}</body></html>`;
}

/** Every theme and palette the gallery is built for: the full cross of the token file's lists. */
export const GALLERY_VARIANTS: readonly { theme: ThemeId; vision: ColourVisionId }[] =
  THEME_IDS.flatMap((theme) => COLOUR_VISION_IDS.map((vision) => ({ theme, vision })));
