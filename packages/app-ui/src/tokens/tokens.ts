// Design tokens (O6.2.1). One data file holds every colour, size and line weight; themes (O5.3.2)
// and colour-vision palettes (O5.5.1) change them in one place. Components read CSS variables
// named here and never a literal colour (lint test in test/tokens/).
import TOKEN_FILE from './tokens.json';

export const THEME_IDS = ['light', 'dark', 'high-contrast'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const COLOUR_VISION_IDS = ['none', 'protan', 'deutan', 'tritan'] as const;
export type ColourVisionId = (typeof COLOUR_VISION_IDS)[number];

export const TOKEN_GROUPS = ['surface', 'text', 'line', 'accent', 'state', 'team', 'field', 'overlay'] as const;
export type TokenGroup = (typeof TOKEN_GROUPS)[number];
export type ColourBlock = Record<TokenGroup, Record<string, string>>;
export type PartialColourBlock = Partial<Record<TokenGroup, Record<string, string>>>;

export interface TokenScale {
  spaceUnitPx: number; tableRowPx: number; gridColumns: number;
  typePx: Record<string, number>; lineWeightPx: Record<string, number>;
  fontFamily: string; fontFeatures: string;
}
export interface ContrastPair { fg: string; bg: string; floor: 'text' | 'large' }
export interface TokenFile {
  version: number;
  scale: TokenScale;
  themes: Record<ThemeId, ColourBlock>;
  colourVision: Record<Exclude<ColourVisionId, 'none'>, { light: PartialColourBlock; dark: PartialColourBlock }>;
  contrastPairs: ContrastPair[];
}

export const TOKENS = TOKEN_FILE as unknown as TokenFile;

/**
 * Contrast floors (O5.5.1, quoting WCAG 2.2 success criterion 1.4.3, Level AA): 4.5:1 for normal
 * text, 3:1 for large text. Status in the bible leaf: Verified (W3C, WebAIM, MDN).
 */
export const CONTRAST_FLOOR = { text: 4.5, large: 3 } as const;

/**
 * WCAG 2.2 "relative luminance" definition (sRGB). Named assumption constants: the bible states the
 * contrast floor but not the formula. Source: the W3C WCAG 2.2 definition text (w3c/wcag repository,
 * guidelines/relative-luminance.html, read 2026-11-26). Only one primary source was read: PROVISIONAL.
 */
export const WCAG_LUMINANCE = {
  red: 0.2126, green: 0.7152, blue: 0.0722,
  linearThreshold: 0.04045, linearDivisor: 12.92,
  offset: 0.055, scale: 1.055, gamma: 2.4,
  flare: 0.05,
} as const;

export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const W = WCAG_LUMINANCE;
  const lin = (c8: number) => {
    const c = c8 / 255;
    return c <= W.linearThreshold ? c / W.linearDivisor : Math.pow((c + W.offset) / W.scale, W.gamma);
  };
  const [r, g, b] = parseHex(hex);
  return W.red * lin(r) + W.green * lin(g) + W.blue * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + WCAG_LUMINANCE.flare) / (lo + WCAG_LUMINANCE.flare);
}

/** The colour block for a theme, with a colour-vision palette laid over it (high contrast keeps its own). */
export function resolveColours(theme: ThemeId, vision: ColourVisionId = 'none', file: TokenFile = TOKENS): ColourBlock {
  const base = file.themes[theme];
  const out = Object.fromEntries(TOKEN_GROUPS.map((g) => [g, { ...base[g] }])) as ColourBlock;
  if (vision !== 'none' && theme !== 'high-contrast') {
    const over = file.colourVision[vision][theme];
    for (const g of TOKEN_GROUPS) Object.assign(out[g], over[g] ?? {});
  }
  return out;
}

export function tokenValue(block: ColourBlock, path: string): string {
  const [g, k] = path.split('.') as [TokenGroup, string];
  const v = block[g]?.[k];
  if (v === undefined) throw new Error(`unknown token ${path}`);
  return v;
}

/** CSS variable name for a token path: `text.ink` -> `--gm-text-ink`. */
export const cssVar = (path: string) => `--gm-${path.replace(/\./g, '-').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
/** `var(--gm-text-ink)` for use in component styles. */
export const v = (path: string) => `var(${cssVar(path)})`;

export interface StyleOptions { theme: ThemeId; colourVision?: ColourVisionId; interfaceScalePct?: number; textScalePct?: number }

/** Every token as CSS custom properties, ready for a root element's style. */
export function tokenVariables(o: StyleOptions, file: TokenFile = TOKENS): Record<string, string> {
  const block = resolveColours(o.theme, o.colourVision ?? 'none', file);
  const out: Record<string, string> = {};
  for (const g of TOKEN_GROUPS) for (const [k, val] of Object.entries(block[g])) out[cssVar(`${g}.${k}`)] = val;
  const ui = (o.interfaceScalePct ?? 100) / 100;
  const tx = (o.textScalePct ?? 100) / 100;
  const s = file.scale;
  out['--gm-space'] = `${s.spaceUnitPx * ui}px`;
  out['--gm-row'] = `${s.tableRowPx * ui}px`;
  for (const [k, px] of Object.entries(s.typePx)) out[`--gm-type-${k}`] = `${px * ui * tx}px`;
  for (const [k, px] of Object.entries(s.lineWeightPx)) out[`--gm-line-weight-${k}`] = `${px * ui}px`;
  out['--gm-font'] = s.fontFamily;
  out['--gm-font-features'] = s.fontFeatures;
  out['color-scheme'] = o.theme === 'light' ? 'light' : 'dark';
  return out;
}

/** The same variables as a `:root { ... }` rule, for shells that style the document. */
export function tokenCss(o: StyleOptions, selector = ':root', file: TokenFile = TOKENS): string {
  const vars = tokenVariables(o, file);
  return `${selector} {\n${Object.entries(vars).map(([k, val]) => `  ${k}: ${val};`).join('\n')}\n}\n`;
}

export interface ContrastFailure { theme: ThemeId; vision: ColourVisionId; fg: string; bg: string; ratio: number; floor: number }

/** Checks every declared pair in every theme and palette (Q1.5.1, token level). */
export function checkContrast(file: TokenFile = TOKENS): ContrastFailure[] {
  const fails: ContrastFailure[] = [];
  for (const theme of THEME_IDS) for (const vision of COLOUR_VISION_IDS) {
    const block = resolveColours(theme, vision, file);
    for (const p of file.contrastPairs) {
      const ratio = contrastRatio(tokenValue(block, p.fg), tokenValue(block, p.bg));
      const floor = CONTRAST_FLOOR[p.floor];
      if (ratio < floor) fails.push({ theme, vision, fg: p.fg, bg: p.bg, ratio: Math.round(ratio * 100) / 100, floor });
    }
  }
  return fails;
}
