// PV-18 lamp-board face and segmented clock digits (plan 2.1: the score strip is drawn as a stadium
// lamp scoreboard, a grid of round lamps on a dark panel with segmented clock digits). Pure layout:
// components turn these into SVG with era colour variables only.
import { GLYPH_COLS, GLYPH_ROWS, glyphBits, normaliseText } from './glyphs.ts';

export interface Lamp { col: number; row: number; on: boolean }
export interface LampLayout { cols: number; rows: number; lamps: Lamp[]; text: string }

export interface LampOptions {
  /** Unlit columns between characters. Default 1. */
  gapCols?: number;
  /** Pad or clip to a fixed number of characters (a board has fixed cells). Right-aligned when `align` is 'right'. */
  cells?: number;
  align?: 'left' | 'right';
}

/** Lays text out on a lamp grid. Every cell of the grid is a lamp, lit or not, as on a real board. */
export function lampLayout(text: string, o: LampOptions = {}): LampLayout {
  const gap = o.gapCols ?? 1;
  let chars = normaliseText(text);
  if (o.cells !== undefined) {
    if (chars.length > o.cells) chars = o.align === 'right' ? chars.slice(chars.length - o.cells) : chars.slice(0, o.cells);
    const pad = Array<string>(o.cells - chars.length).fill(' ');
    chars = o.align === 'right' ? [...pad, ...chars] : [...chars, ...pad];
  }
  const n = chars.length;
  const cols = n === 0 ? 0 : n * GLYPH_COLS + (n - 1) * gap;
  const lit = new Set<string>();
  chars.forEach((ch, i) => {
    const bits = glyphBits(ch);
    const x0 = i * (GLYPH_COLS + gap);
    for (let r = 0; r < GLYPH_ROWS; r++) for (let c = 0; c < GLYPH_COLS; c++) if (bits[r]![c]) lit.add(`${x0 + c},${r}`);
  });
  const lamps: Lamp[] = [];
  for (let r = 0; r < GLYPH_ROWS; r++) for (let c = 0; c < cols; c++) lamps.push({ col: c, row: r, on: lit.has(`${c},${r}`) });
  return { cols, rows: GLYPH_ROWS, lamps, text: chars.join('') };
}

/** Seven-segment names, standard order: a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle. */
export const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
export type Segment = (typeof SEGMENTS)[number];

const SEG_MAP: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg',
  '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '',
};

export const SEGMENT_CHARS: readonly string[] = [...Object.keys(SEG_MAP), ':'];

export interface SegmentDigit { kind: 'digit'; char: string; lit: Record<Segment, boolean> }
export interface SegmentColon { kind: 'colon'; lit: boolean }
export type SegmentCell = SegmentDigit | SegmentColon;

/** Clock text such as "12:34" or " 9" as segment cells. Characters a seven-segment board cannot show throw. */
export function segmentCells(text: string): SegmentCell[] {
  return [...text].map((ch): SegmentCell => {
    if (ch === ':') return { kind: 'colon', lit: true };
    const on = SEG_MAP[ch];
    if (on === undefined) throw new Error(`a segment clock cannot show "${ch}"`);
    return { kind: 'digit', char: ch, lit: Object.fromEntries(SEGMENTS.map((s) => [s, on.includes(s)])) as Record<Segment, boolean> };
  });
}

/**
 * Segment shapes in a 10 x 18 digit box (units), as polygons with bevelled ends, so components can
 * scale them. Thickness 2 units.
 */
export const DIGIT_BOX = { w: 10, h: 18, colonW: 4 } as const;
export const SEGMENT_POLYGONS: Record<Segment, ReadonlyArray<readonly [number, number]>> = {
  a: [[2, 0], [8, 0], [9, 1], [8, 2], [2, 2], [1, 1]],
  b: [[9, 1], [10, 2], [10, 8], [9, 9], [8, 8], [8, 2]],
  c: [[9, 9], [10, 10], [10, 16], [9, 17], [8, 16], [8, 10]],
  d: [[2, 16], [8, 16], [9, 17], [8, 18], [2, 18], [1, 17]],
  e: [[1, 9], [2, 10], [2, 16], [1, 17], [0, 16], [0, 10]],
  f: [[1, 1], [2, 2], [2, 8], [1, 9], [0, 8], [0, 2]],
  g: [[2, 8], [8, 8], [9, 9], [8, 10], [2, 10], [1, 9]],
};

/** Formats a game clock in seconds as M:SS or MM:SS for the segment board. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m < 10 ? ' ' : ''}${m}:${r < 10 ? '0' : ''}${r}`;
}
