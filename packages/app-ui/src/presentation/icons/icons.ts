// PV-13: turns glyph data into SVG, and the two checks the set must pass in every theme and
// colour-vision palette: non-text contrast (WCAG 2.2 SC 1.4.11) and the protected-emblem rule.
import { GLYPHS, ICON_GRID, ICON_STROKE, glyphById, type Glyph, type GlyphPart } from './glyphs.ts';
import {
  THEME_IDS, COLOUR_VISION_IDS, CONTRAST_FLOOR, contrastRatio, parseHex, resolveColours, tokenValue, v,
  type ThemeId, type ColourVisionId, type TokenFile, TOKENS,
} from '../../tokens/index.ts';

/**
 * Interface states (O2.5.3, MB-15). `disabled` dims the drawing and must be shown with its reason
 * text; `holding` draws the hold-to-confirm ring; `active` marks the selected item.
 */
export type IconState = 'normal' | 'active' | 'disabled' | 'holding';

/** Token paths for each colour role in a state. Paper is the panel the icon sits on. */
export function roleTokens(g: Glyph, state: IconState = 'normal'): { ink: string; tone: string; paper: string } {
  if (state === 'disabled') return { ink: 'text.muted', tone: 'surface.raised', paper: 'surface.panel' };
  return { ink: g.ink ?? 'text.ink', tone: g.tone, paper: 'surface.panel' };
}

/** Surfaces an icon may sit on; each must hold its colours at the non-text floor. */
export const ICON_SURFACES = ['surface.bg', 'surface.panel', 'surface.raised'] as const;

export interface SvgNode { tag: 'path' | 'circle' | 'ellipse' | 'rect'; attrs: Record<string, string | number> }

/** The SVG nodes of a glyph; `colour` maps a token path to a paint value (a CSS variable by default). */
export function glyphNodes(g: Glyph, state: IconState = 'normal', colour: (path: string) => string = v): SvgNode[] {
  const t = roleTokens(g, state);
  const ink = colour(t.ink), tone = colour(t.tone), paper = colour(t.paper);
  return g.parts.map((part) => node(part, ink, tone, paper));
}

function node(part: GlyphPart, ink: string, tone: string, paper: string): SvgNode {
  const w = part.w ?? ICON_STROKE;
  const paint: Record<string, string | number> =
    part.role === 'line' ? { fill: 'none', stroke: ink, 'stroke-width': w } :
    part.role === 'solid' ? { fill: ink } :
    part.role === 'shape' ? { fill: tone, stroke: ink, 'stroke-width': w } :
    part.role === 'tone' ? { fill: tone } :
    part.role === 'paper' ? { fill: paper } :
    { fill: 'none', stroke: paper, 'stroke-width': w };
  if (paint['stroke-width'] !== undefined) { paint['stroke-linecap'] = 'round'; paint['stroke-linejoin'] = 'round'; }
  if (part.el === 'path') return { tag: 'path', attrs: { d: part.d, ...(part.dash ? { 'stroke-dasharray': part.dash } : {}), ...paint } };
  if (part.el === 'circle') return { tag: 'circle', attrs: { cx: part.cx, cy: part.cy, r: part.r, ...paint } };
  if (part.el === 'ellipse') return { tag: 'ellipse', attrs: { cx: part.cx, cy: part.cy, rx: part.rx, ry: part.ry, ...(part.rot ? { transform: `rotate(${part.rot} ${part.cx} ${part.cy})` } : {}), ...paint } };
  return { tag: 'rect', attrs: { x: part.x, y: part.y, width: part.width, height: part.height, ...(part.rx ? { rx: part.rx } : {}), ...paint } };
}

/** Circumference-based ring for the hold-to-confirm state, `fraction` 0..1 of the hold done. */
export function holdRing(fraction: number, colour: (path: string) => string = v): SvgNode {
  const radius = ICON_GRID / 2 - 0.75;
  const len = 2 * Math.PI * radius;
  const f = Math.min(1, Math.max(0, fraction));
  return { tag: 'circle', attrs: { cx: 12, cy: 12, r: radius, fill: 'none', stroke: colour('accent.default'), 'stroke-width': 1.5, 'stroke-dasharray': `${len * f} ${len}`, transform: 'rotate(-90 12 12)' } };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export interface IconSvgOptions { state?: IconState; sizePx?: number; holdFraction?: number; colour?: (path: string) => string }

/** A standalone SVG string with the label as its accessible name (`role="img"`, `<title>`). */
export function iconSvg(id: string, o: IconSvgOptions = {}): string {
  const g = glyphById(id);
  const size = o.sizePx ?? ICON_GRID;
  const nodes = glyphNodes(g, o.state ?? 'normal', o.colour);
  if (o.state === 'holding') nodes.push(holdRing(o.holdFraction ?? 0, o.colour));
  const body = nodes.map((n) => `<${n.tag} ${Object.entries(n.attrs).map(([k, val]) => `${k}="${esc(String(val))}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON_GRID} ${ICON_GRID}" width="${size}" height="${size}" role="img" aria-label="${esc(g.label)}" data-icon="${g.id}"><title>${esc(g.label)}</title>${body}</svg>`;
}

// ---------------------------------------------------------------------------------------------
// Contrast (WCAG 2.2 SC 1.4.11 Non-text Contrast, Level AA): "Parts of graphics required to
// understand the content" need at least 3:1 against adjacent colours. Sources read 2026-11-26:
// W3C Understanding 1.4.11 (WCAG 2.2), WebAIM "Contrast and Color Accessibility", and the floor
// already Verified in O5.5.1 (CONTRAST_FLOOR.large = 3). Status: Verified.
// Checked pairs, per theme and palette: ink against each surface (the outline is the graphic),
// tone against each surface (a tone area must read on its own), and paper knock-outs against
// the tone (the same pair as tone on panel). Tone against ink is not required: the ink outline
// bounds every tone area, and the text label carries the meaning (SC 1.4.11 exempts graphics
// with visible text for the same information). Disabled icons are exempt (inactive components).
// ---------------------------------------------------------------------------------------------

export const NON_TEXT_FLOOR = CONTRAST_FLOOR.large;

export interface IconContrastFailure { icon: string; theme: ThemeId; vision: ColourVisionId; fg: string; bg: string; ratio: number }

export function checkIconContrast(file: TokenFile = TOKENS, glyphs: readonly Glyph[] = GLYPHS): IconContrastFailure[] {
  const fails: IconContrastFailure[] = [];
  for (const theme of THEME_IDS) for (const vision of COLOUR_VISION_IDS) {
    const block = resolveColours(theme, vision, file);
    for (const g of glyphs) {
      const t = roleTokens(g);
      const usesTone = g.parts.some((p) => p.role === 'shape' || p.role === 'tone');
      const pairs: [string, string][] = ICON_SURFACES.map((s) => [t.ink, s]);
      if (usesTone && t.tone !== t.ink) for (const s of ICON_SURFACES) pairs.push([t.tone, s]);
      for (const [fg, bg] of pairs) {
        const ratio = contrastRatio(tokenValue(block, fg), tokenValue(block, bg));
        if (ratio < NON_TEXT_FLOOR) fails.push({ icon: g.id, theme, vision, fg, bg, ratio: Math.round(ratio * 100) / 100 });
      }
    }
  }
  return fails;
}

// ---------------------------------------------------------------------------------------------
// Protected emblem (Geneva Convention I art. 38 "the heraldic emblem of the red cross on a white
// ground"; art. 53 forbids any "sign or designation constituting an imitation thereof, whatever
// the object of such use"; 18 U.S.C. 706 forbids "the emblem of the Greek red cross on a white
// ground, or any sign or insignia made or colored in imitation thereof"; British Red Cross: "The
// red cross emblem is not a first aid or medical sign."). Status: Verified (three primary or
// official texts, read 2026-11-26). Rule for every icon drawn with a plus or cross: none of its
// colours may be red in any theme or palette. The injury icon is a plus in a ring in ink only.
// ---------------------------------------------------------------------------------------------

/** Hue window counted as red, in degrees either side of 0, and the minimum saturation to count. */
export const EMBLEM_RED = { hueHalfWidthDeg: 30, minSaturation: 0.25 } as const;

/** HSL hue (degrees) and saturation (0..1) of a #rrggbb colour. */
export function hueSat(hex: string): { hue: number; sat: number } {
  const [r8, g8, b8] = parseHex(hex);
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const light = (max + min) / 2;
  if (d === 0) return { hue: 0, sat: 0 };
  const sat = d / (1 - Math.abs(2 * light - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, sat };
}

export function isRed(hex: string): boolean {
  const { hue, sat } = hueSat(hex);
  const fromRed = Math.min(hue, 360 - hue);
  return sat >= EMBLEM_RED.minSaturation && fromRed <= EMBLEM_RED.hueHalfWidthDeg;
}

/** Icons that draw a plus or cross mark and so fall under the emblem rule. */
export const CROSS_ICONS = ['injury'] as const;

export interface EmblemFailure { icon: string; theme: ThemeId; vision: ColourVisionId; token: string; colour: string }

export function checkEmblemRule(file: TokenFile = TOKENS): EmblemFailure[] {
  const fails: EmblemFailure[] = [];
  for (const theme of THEME_IDS) for (const vision of COLOUR_VISION_IDS) {
    const block = resolveColours(theme, vision, file);
    for (const id of CROSS_ICONS) {
      const t = roleTokens(glyphById(id));
      for (const token of [t.ink, t.tone]) {
        const colour = tokenValue(block, token);
        if (isRed(colour)) fails.push({ icon: id, theme, vision, token, colour });
      }
    }
  }
  return fails;
}
