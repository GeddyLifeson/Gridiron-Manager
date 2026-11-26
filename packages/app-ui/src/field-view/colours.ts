// Team colours on the field (I9.1.1, O2.3.2, O5). Contrast is the WCAG 2 contrast ratio of relative
// luminances; the 3:1 threshold is the I9.1.1 starting value. When the home and away colours fail
// against the field or each other, the away team's alternate is tried (O2.3.2), then the home
// alternate, then the colour-blind-safe pair.
import { param } from './params.ts';
import type { TeamColours } from './types.ts';

/** Field colours (display choice, Assumption). */
export const FIELD_COLOURS = { grass: '#3f7f3a', endZone: '#36702f', line: '#f4f4f0', surround: '#2c5a29' } as const;

/**
 * Colour-blind-safe pair (Assumption, design): one very dark and one very light colour, so the pair
 * is told apart by lightness alone, whatever the viewer's colour vision. Checked against the grass.
 */
export const COLOUR_BLIND_SAFE: readonly [string, string] = ['#101010', '#f0e442'];

/** Line of scrimmage and line to gain (display choice, Assumption). */
export const LINE_COLOURS = { lineOfScrimmage: '#2f6fd6', lineToGain: '#f2c230' } as const;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`colour ${hex} is not #rrggbb`);
  const v = parseInt(m[1]!, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export interface ResolvedColours {
  /** Indexed by side: 0 home, 1 visitor. */
  readonly sides: readonly [string, string];
  readonly source: 'primary' | 'awayAlternate' | 'homeAlternate' | 'colourBlindSafe';
}

function passes(a: string, b: string, field: string, min: number): boolean {
  return contrastRatio(a, field) >= min && contrastRatio(b, field) >= min && contrastRatio(a, b) >= min;
}

export function resolveTeamColours(home: TeamColours, away: TeamColours, opts: { colourBlindSafe?: boolean; field?: string } = {}): ResolvedColours {
  const field = opts.field ?? FIELD_COLOURS.grass;
  const min = param('minContrast');
  if (!opts.colourBlindSafe) {
    if (passes(home.primary, away.primary, field, min)) return { sides: [home.primary, away.primary], source: 'primary' };
    if (passes(home.primary, away.alternate, field, min)) return { sides: [home.primary, away.alternate], source: 'awayAlternate' };
    if (passes(home.alternate, away.alternate, field, min)) return { sides: [home.alternate, away.alternate], source: 'homeAlternate' };
  }
  return { sides: [COLOUR_BLIND_SAFE[0], COLOUR_BLIND_SAFE[1]], source: 'colourBlindSafe' };
}

/** Black or white, whichever reads better on the marker fill. */
export function inkOn(fill: string): string {
  return contrastRatio(fill, '#000000') >= contrastRatio(fill, '#ffffff') ? '#000000' : '#ffffff';
}
