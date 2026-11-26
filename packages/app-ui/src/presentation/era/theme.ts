// PV-18 Classic era skin, colours (plan 2.1, O6.2.1, O5.5.1). The Classic theme is a skin only: it
// carries no information of its own, so it must pass the same contrast floors as the plain themes.
// Until the token owner adds 'classic' to THEME_IDS (change request in README.md), this module
// resolves it beside the three base themes and gives the extra era colours as CSS variables.
import ERA_FILE from './classic-tokens.json';
import {
  TOKENS, THEME_IDS, COLOUR_VISION_IDS, TOKEN_GROUPS, CONTRAST_FLOOR,
  contrastRatio, resolveColours, tokenValue, tokenVariables, cssVar,
  type ThemeId, type ColourVisionId, type ColourBlock, type StyleOptions, type ContrastPair,
} from '../../tokens/index.ts';

export const ERA_THEME_IDS = [...THEME_IDS, 'classic'] as const;
export type EraThemeId = (typeof ERA_THEME_IDS)[number];

export const ERA_KEYS = [
  'lampPanel', 'lampOn', 'lampOnAlt', 'lampOff', 'segmentOn', 'segmentOff',
  'cgBar', 'cgBarAlt', 'cgText', 'cgShadow',
  'leaderBg', 'leaderInk', 'grainLight', 'grainDark', 'vignette', 'counterInk', 'counterBg',
] as const;
export type EraKey = (typeof ERA_KEYS)[number];
export type EraBlock = Record<EraKey, string>;

export const FIELD_SURFACES = ['grass', 'artificial'] as const;
export type FieldSurface = (typeof FIELD_SURFACES)[number];

export interface EraPair { fg: EraKey; bg: EraKey; floor: 'text' | 'large' }

export interface EraTokenFile {
  version: number;
  classic: ColourBlock;
  fieldSurface: Record<FieldSurface, Record<'turf' | 'endZone' | 'surround', string>>;
  era: Record<EraThemeId, EraBlock>;
  eraContrastPairs: EraPair[];
}

export const ERA_TOKENS = ERA_FILE as unknown as EraTokenFile;

export interface EraOptions {
  theme: EraThemeId;
  colourVision?: ColourVisionId;
  /** Venue surface: only the Classic theme changes the field for it. */
  surface?: FieldSurface;
}

/** Every token group for a theme, Classic included, with a colour-vision palette laid over it. */
export function resolveEraColours(o: EraOptions, file: EraTokenFile = ERA_TOKENS): ColourBlock {
  const vision = o.colourVision ?? 'none';
  if (o.theme !== 'classic') return resolveColours(o.theme, vision);
  const out = Object.fromEntries(TOKEN_GROUPS.map((g) => [g, { ...file.classic[g] }])) as ColourBlock;
  Object.assign(out.field, file.fieldSurface[o.surface ?? 'grass']);
  if (vision !== 'none') {
    // Classic is a dark theme, so it takes the dark-theme colour-vision overrides.
    const over = TOKENS.colourVision[vision].dark;
    for (const g of TOKEN_GROUPS) Object.assign(out[g], over[g] ?? {});
  }
  return out;
}

export function eraBlock(theme: EraThemeId, file: EraTokenFile = ERA_TOKENS): EraBlock {
  return { ...file.era[theme] };
}

/** CSS variable for an era colour: `lampOn` -> `--gm-era-lamp-on`. */
export const eraVar = (key: EraKey) => cssVar(`era.${key}`);
/** `var(--gm-era-lamp-on)` for component styles. */
export const ev = (key: EraKey) => `var(${eraVar(key)})`;

/**
 * Every CSS variable a root element needs: the base token variables (sizes, type, groups) with the
 * theme's colours, plus the era colours. Works for all four themes.
 */
export function eraTokenVariables(o: EraOptions & Omit<StyleOptions, 'theme' | 'colourVision'>, file: EraTokenFile = ERA_TOKENS): Record<string, string> {
  const baseTheme: ThemeId = o.theme === 'classic' ? 'dark' : o.theme;
  const out = tokenVariables({ ...o, theme: baseTheme, colourVision: o.colourVision ?? 'none' });
  const block = resolveEraColours(o, file);
  for (const g of TOKEN_GROUPS) for (const [k, val] of Object.entries(block[g])) out[cssVar(`${g}.${k}`)] = val;
  for (const k of ERA_KEYS) out[eraVar(k)] = file.era[o.theme][k];
  out['color-scheme'] = o.theme === 'light' ? 'light' : 'dark';
  return out;
}

export interface EraContrastFailure { theme: EraThemeId; vision: ColourVisionId; surface: FieldSurface; fg: string; bg: string; ratio: number; floor: number }

/**
 * O5.5.1 floors for the Classic block (every base contrast pair, every colour-vision palette, both
 * field surfaces) and for the era colours in all four themes.
 */
export function checkEraContrast(file: EraTokenFile = ERA_TOKENS, basePairs: readonly ContrastPair[] = TOKENS.contrastPairs): EraContrastFailure[] {
  const fails: EraContrastFailure[] = [];
  const round = (r: number) => Math.round(r * 100) / 100;
  for (const surface of FIELD_SURFACES) for (const vision of COLOUR_VISION_IDS) {
    const block = resolveEraColours({ theme: 'classic', colourVision: vision, surface }, file);
    for (const p of basePairs) {
      const ratio = contrastRatio(tokenValue(block, p.fg), tokenValue(block, p.bg));
      if (ratio < CONTRAST_FLOOR[p.floor]) fails.push({ theme: 'classic', vision, surface, fg: p.fg, bg: p.bg, ratio: round(ratio), floor: CONTRAST_FLOOR[p.floor] });
    }
  }
  for (const theme of ERA_THEME_IDS) {
    const e = file.era[theme];
    for (const p of file.eraContrastPairs) {
      // High contrast hides unlit lamps entirely (off equals the panel); lit against unlit is then the panel pair.
      const ratio = contrastRatio(e[p.fg], e[p.bg]);
      if (ratio < CONTRAST_FLOOR[p.floor]) fails.push({ theme, vision: 'none', surface: 'grass', fg: `era.${p.fg}`, bg: `era.${p.bg}`, ratio: round(ratio), floor: CONTRAST_FLOOR[p.floor] });
    }
  }
  return fails;
}
