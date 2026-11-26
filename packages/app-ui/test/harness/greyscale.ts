// Q1.5.1 greyscale checks. Colour is turned into its grey level (WCAG relative luminance, the same
// formula the token tests use) and every pair of colours that carries a state must either differ
// in grey or be declared as carried by a shape or a label as well. Marker shapes (O6.3.1) are
// checked as a table: no two groups on the same side may share a look, and offence and defence
// never share a shape.
import { resolveColours, tokenValue, relativeLuminance, contrastRatio, THEME_IDS, COLOUR_VISION_IDS, type ThemeId, type ColourVisionId, type ColourBlock, type TokenFile, TOKENS } from '../../src/tokens/index.ts';
import { DEFAULT_MARKERS, type MarkerTable, type MarkerStyle } from '../../src/field-view/markers.ts';

/**
 * Smallest grey-level contrast between two state colours that still reads as two colours.
 * Assumption (design), not a standard: the bible's O6 names no figure for greyscale. Revisit when
 * the O6 owner sets one.
 */
export const GREY_PAIR_FLOOR = 1.25;

export interface GreyPair { a: string; b: string; ratio: number; theme: ThemeId; vision: ColourVisionId }
export interface GreyFailure extends GreyPair { reason: string }

const value = tokenValue;

/** Every pair among `names` with its grey-level contrast, in one theme and palette. */
export function greyPairs(names: readonly string[], theme: ThemeId, vision: ColourVisionId, file: TokenFile = TOKENS): GreyPair[] {
  const block = resolveColours(theme, vision, file);
  const out: GreyPair[] = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = names[i]!, b = names[j]!;
    out.push({ a, b, ratio: Math.round(contrastRatio(value(block, a), value(block, b)) * 100) / 100, theme, vision });
  }
  return out;
}

/**
 * Pairs that look alike in greyscale and are not declared as carried by a shape or label.
 * `carried` holds `a|b` keys (either order).
 */
export function greyFailures(names: readonly string[], carried: ReadonlySet<string> = new Set(), floor: number = GREY_PAIR_FLOOR, file: TokenFile = TOKENS): GreyFailure[] {
  const out: GreyFailure[] = [];
  for (const theme of THEME_IDS) for (const vision of COLOUR_VISION_IDS) {
    for (const p of greyPairs(names, theme, vision, file)) {
      if (p.ratio >= floor || carried.has(`${p.a}|${p.b}`) || carried.has(`${p.b}|${p.a}`)) continue;
      out.push({ ...p, reason: `grey contrast ${p.ratio} is under ${floor} and neither is carried by a shape or label` });
    }
  }
  return out;
}

/** Grey level 0..1 of a colour, for report output. */
export const greyLevel = (hex: string): number => Math.round(relativeLuminance(hex) * 1000) / 1000;

const sig = (s: MarkerStyle) => `${s.shape}/${s.fill}/${s.outline}/${s.mark}`;
const OFFENCE = new Set(['OL', 'C', 'QB', 'B', 'TE', 'WR']);

/** O6.3.1 greyscale rule on the marker table: shapes alone tell the sides and groups apart. */
export function markerProblems(table: MarkerTable = DEFAULT_MARKERS): string[] {
  const out: string[] = [];
  const seen = new Map<string, string>();
  const off = new Set<string>(), def = new Set<string>();
  for (const [g, style] of Object.entries(table.groups)) {
    const k = sig(style);
    const other = seen.get(k);
    if (other) out.push(`${g} and ${other} share the look ${k}`);
    seen.set(k, g);
    if (g === 'ST') continue; // special teams have no side
    (OFFENCE.has(g) ? off : def).add(style.shape);
  }
  for (const sh of off) if (def.has(sh)) out.push(`offence and defence both use ${sh}`);
  return out;
}
