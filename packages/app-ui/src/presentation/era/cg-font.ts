// PV-18 character-generator face (plan 2.1: banners and stoppage text drawn as character-generator
// lower thirds, a blocky uppercase display font with a hard drop shadow, flat colour bars, cut on and
// off with no motion). Built from the shared 5 x 7 bitmap: each set cell becomes a square block,
// emboldened one cell to the right (the heavy stroke of period caption text), on a fixed pitch.
import { GLYPH_COLS, GLYPH_ROWS, glyphBits, normaliseText } from './glyphs.ts';

/** Cell width after emboldening. */
export const CG_COLS = GLYPH_COLS + 1;
export const CG_ROWS = GLYPH_ROWS;
/** Hard shadow offset in cells (down and right). */
export const CG_SHADOW = { dx: 1, dy: 1 } as const;
/** Gap between characters in cells. */
export const CG_GAP = 1;

/** One horizontal run of filled cells (merged so the SVG stays small). */
export interface CgRun { x: number; y: number; w: number }
export interface CgLayout { cols: number; rows: number; runs: CgRun[]; text: string }

/** Emboldened bit rows for one character. */
export function cgBits(ch: string): boolean[][] {
  return glyphBits(ch).map((row) => {
    const out = Array<boolean>(CG_COLS).fill(false);
    row.forEach((on, c) => { if (on) { out[c] = true; out[c + 1] = true; } });
    return out;
  });
}

/** Lays a line of caption text out as merged runs. The width excludes the shadow. */
export function cgLayout(text: string): CgLayout {
  const chars = normaliseText(text);
  const n = chars.length;
  const cols = n === 0 ? 0 : n * CG_COLS + (n - 1) * CG_GAP;
  const grid: boolean[][] = Array.from({ length: CG_ROWS }, () => Array<boolean>(cols).fill(false));
  chars.forEach((ch, i) => {
    const bits = cgBits(ch);
    const x0 = i * (CG_COLS + CG_GAP);
    for (let r = 0; r < CG_ROWS; r++) for (let c = 0; c < CG_COLS; c++) if (bits[r]![c]) grid[r]![x0 + c] = true;
  });
  const runs: CgRun[] = [];
  for (let r = 0; r < CG_ROWS; r++) {
    let c = 0;
    while (c < cols) {
      if (!grid[r]![c]) { c++; continue; }
      const start = c;
      while (c < cols && grid[r]![c]) c++;
      runs.push({ x: start, y: r, w: c - start });
    }
  }
  return { cols, rows: CG_ROWS, runs, text: chars.join('') };
}

/** Lower-third banner layout: bars and lines in cell units, ready for any pixel scale. */
export interface LowerThirdLine { text: string; bar: 'cgBar' | 'cgBarAlt'; layout: CgLayout; x: number; y: number }
export interface LowerThirdLayout { cols: number; rows: number; lines: LowerThirdLine[] }

/** Padding around each line inside its bar, in cells. */
export const LOWER_THIRD_PAD = { x: 3, y: 2 } as const;

/**
 * Stacks one to three caption lines on flat bars (first line on the main bar, the rest on the
 * second bar colour), left-aligned like a period caption. Bars are as wide as the widest line.
 */
export function lowerThirdLayout(lines: readonly string[]): LowerThirdLayout {
  if (lines.length < 1 || lines.length > 3) throw new Error('a lower third holds one to three lines');
  const layouts = lines.map((t) => cgLayout(t));
  const inner = Math.max(...layouts.map((l) => l.cols));
  const cols = inner + 2 * LOWER_THIRD_PAD.x + CG_SHADOW.dx;
  const lineH = CG_ROWS + 2 * LOWER_THIRD_PAD.y + CG_SHADOW.dy;
  const out: LowerThirdLine[] = layouts.map((layout, i) => ({
    text: layout.text, bar: i === 0 ? 'cgBar' : 'cgBarAlt', layout, x: LOWER_THIRD_PAD.x, y: i * lineH + LOWER_THIRD_PAD.y,
  }));
  return { cols, rows: lines.length * lineH, lines: out };
}
