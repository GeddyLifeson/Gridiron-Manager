// Block stencil letters for painted field text (plan 2.1: "painted numbers in a blocky stencil style, a
// plain end zone with the generated team name in block letters"; MB-4 field text). Drawn by code on a
// 5 by 7 cell grid, so there is no font file to license and the width of any string is known exactly
// (the text layout needs that to keep labels from stacking). Lit cells in a row join into one bar and
// rows keep a thin gap between them, which reads as a painted stencil at field scale and as a period
// character-generator caption at label scale. The glyph shapes are original to this file.
import type { Canvas2DLike } from './renderer.ts';

export const GLYPH_COLS = 5;
export const GLYPH_ROWS = 7;
/** Advance per character in cells: the glyph plus one empty column. */
export const ADVANCE_COLS = GLYPH_COLS + 1;
/** Gap between rows of lit cells (the stencil bridge), as a fraction of the cell. */
const GAP = 0.08;

// '#' is a lit cell. Rows top to bottom.
const RAW: Record<string, readonly string[]> = {
  '0': ['.###.', '##.##', '#...#', '#...#', '#...#', '##.##', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

/** Lit runs per glyph as flat (col, row, length) triples, built once. */
const RUNS = new Map<string, Int8Array>();
const LIT = new Map<string, number>();
for (const [ch, rows] of Object.entries(RAW)) {
  if (rows.length !== GLYPH_ROWS || rows.some((r) => r.length !== GLYPH_COLS)) throw new Error(`block glyph ${ch} is not ${GLYPH_COLS} by ${GLYPH_ROWS}`);
  const out: number[] = [];
  let lit = 0;
  rows.forEach((r, y) => {
    for (let x = 0; x < GLYPH_COLS; x++) {
      if (r[x] !== '#') continue;
      let n = 1;
      while (x + n < GLYPH_COLS && r[x + n] === '#') n++;
      out.push(x, y, n); lit += n; x += n - 1;
    }
  });
  RUNS.set(ch, Int8Array.from(out));
  LIT.set(ch, lit);
}

/** The characters the block face can draw. Anything else draws as a space. */
export const BLOCK_CHARS: readonly string[] = [...RUNS.keys()];

/** Upper-cases and maps unknown characters to spaces, so what is drawn is what is measured. */
export function blockText(text: string): string {
  let out = '';
  for (const ch of text.toUpperCase()) out += RUNS.has(ch) ? ch : ' ';
  return out;
}

/** Width in units of glyph height for a string (no trailing gap). */
export function blockWidth(text: string, height: number): number {
  const n = blockText(text).length;
  if (n === 0) return 0;
  return ((n * ADVANCE_COLS - 1) / GLYPH_ROWS) * height;
}

/**
 * Fills `text` centred on (0, 0) of the current transform, `height` pixels tall, in the current
 * fillStyle. The caller sets translation and rotation (the bottom of the letters is local +y).
 */
export function fillBlockText(ctx: Canvas2DLike, text: string, height: number): void {
  const s = blockText(text);
  const cell = height / GLYPH_ROWS, inset = cell * GAP, tall = cell - 2 * inset;
  const x0 = -blockWidth(s, height) / 2, y0 = -height / 2;
  for (let i = 0; i < s.length; i++) {
    const runs = RUNS.get(s[i]!)!;
    const gx = x0 + i * ADVANCE_COLS * cell;
    for (let k = 0; k < runs.length; k += 3) ctx.fillRect(gx + runs[k]! * cell, y0 + runs[k + 1]! * cell + inset, runs[k + 2]! * cell, tall);
  }
}

/** Filled bars a string draws (one per run of lit cells in a row), for tests and the draw budget. */
export function blockCellCount(text: string): number {
  let n = 0;
  for (const ch of blockText(text)) n += RUNS.get(ch)!.length / 3;
  return n;
}

/** Lit cells of a string. */
export function blockLitCells(text: string): number {
  let n = 0;
  for (const ch of blockText(text)) n += LIT.get(ch)!;
  return n;
}
