// PV-18 Classic era skin, colours (plan 2.1, O6.2.1, O5.5.1). The Classic theme and the era colour group
// live in tokens/tokens.json with every other colour, so every contrast, greyscale and icon check that loops
// over THEME_IDS covers Classic too. This file adds only what is era-specific: the era key list, CSS-variable
// helpers, and the venue surface (grass or period artificial turf) that Classic lays over the field.
import SURFACE_FILE from './field-surfaces.json';
import {
  TOKENS, COLOUR_VISION_IDS, CONTRAST_FLOOR, contrastRatio, resolveColours, tokenValue, tokenVariables, cssVar,
  type ThemeId, type ColourVisionId, type ColourBlock, type StyleOptions, type ContrastPair, type TokenFile,
} from '../../tokens/index.ts';

export const ERA_KEYS = [
  'lampPanel', 'lampOn', 'lampAlert', 'lampOff', 'segmentOn', 'segmentOff',
  'cgBar', 'cgBarAlt', 'cgText', 'cgShadow',
  'leaderBg', 'leaderInk', 'grainLight', 'grainDark', 'vignette', 'counterInk', 'counterBg',
] as const;
export type EraKey = (typeof ERA_KEYS)[number];

export const FIELD_SURFACES = ['grass', 'artificial'] as const;
export type FieldSurface = (typeof FIELD_SURFACES)[number];
export type SurfaceColours = Record<FieldSurface, Record<'turf' | 'endZone' | 'surround', string>>;
export const SURFACE_COLOURS = { grass: SURFACE_FILE.grass, artificial: SURFACE_FILE.artificial } as SurfaceColours;

export interface EraOptions {
  theme: ThemeId;
  colourVision?: ColourVisionId;
  /** Venue surface: only the Classic theme changes the field for it; plain themes keep their own turf. */
  surface?: FieldSurface;
}

/** Every token group for a theme, with the colour-vision palette and (Classic only) the venue surface. */
export function resolveEraColours(o: EraOptions, file: TokenFile = TOKENS, surfaces: SurfaceColours = SURFACE_COLOURS): ColourBlock {
  const block = resolveColours(o.theme, o.colourVision ?? 'none', file);
  if (o.theme === 'classic') Object.assign(block.field, surfaces[o.surface ?? 'grass']);
  return block;
}

/** CSS variable for an era colour: `lampOn` -> `--gm-era-lamp-on`. */
export const eraVar = (key: EraKey) => cssVar(`era.${key}`);
/** `var(--gm-era-lamp-on)` for component styles. */
export const ev = (key: EraKey) => `var(${eraVar(key)})`;

/** Every CSS variable a root element needs, with the venue surface laid over the field for Classic. */
export function eraTokenVariables(o: EraOptions & Omit<StyleOptions, 'theme' | 'colourVision'>, file: TokenFile = TOKENS): Record<string, string> {
  const out = tokenVariables({ ...o, colourVision: o.colourVision ?? 'none' }, file);
  if (o.theme === 'classic') for (const [k, val] of Object.entries(SURFACE_COLOURS[o.surface ?? 'grass'])) out[cssVar(`field.${k}`)] = val;
  return out;
}

export interface EraContrastFailure { vision: ColourVisionId; surface: FieldSurface; fg: string; bg: string; ratio: number; floor: number }

/**
 * The base contrast check (tokens checkContrast) already covers Classic on grass. This adds the artificial
 * surface: every declared pair, every colour-vision palette, both surfaces.
 */
export function checkSurfaceContrast(file: TokenFile = TOKENS, surfaces: SurfaceColours = SURFACE_COLOURS, pairs: readonly ContrastPair[] = file.contrastPairs): EraContrastFailure[] {
  const fails: EraContrastFailure[] = [];
  for (const surface of FIELD_SURFACES) for (const vision of COLOUR_VISION_IDS) {
    const block = resolveEraColours({ theme: 'classic', colourVision: vision, surface }, file, surfaces);
    for (const p of pairs) {
      const ratio = contrastRatio(tokenValue(block, p.fg), tokenValue(block, p.bg));
      if (ratio < CONTRAST_FLOOR[p.floor]) fails.push({ vision, surface, fg: p.fg, bg: p.bg, ratio: Math.round(ratio * 100) / 100, floor: CONTRAST_FLOOR[p.floor] });
    }
  }
  return fails;
}
