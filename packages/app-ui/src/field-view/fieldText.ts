// Text painted over the field during and after a play (MB-4, O2.3.5): "FLAG", the yards of the result,
// "UNDER REVIEW". Three rules: the text is one pixel size at any zoom, two labels never overlap on
// screen, and repeats of the same text merge into one label with a count ("FLAG X2"). The layout works
// in screen pixels after the camera, so it holds at every zoom, orientation and view size.
import { blockWidth, GLYPH_ROWS } from './blockFont.ts';

/** A label anchored at a field spot, shown from `fromTick` (default: the whole play). */
export interface FieldNote {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fromTick?: number;
}

/** A merged label: the text with its count, anchored at the first note's spot. */
export interface MergedNote {
  readonly text: string;
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly fromTick: number;
}

export interface PlacedNote {
  readonly text: string;
  /** Centre of the label box in CSS pixels. */
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

/** "FLAG" twice becomes "FLAG X2". The block face is upper case, so the count is too. */
export function noteLabel(n: MergedNote): string {
  return n.count > 1 ? `${n.text} X${n.count}` : n.text;
}

/**
 * Merges notes with the same text (case-insensitive) that are showing at tick `t`. The merged label sits
 * at the earliest note's spot and appears with it; a later repeat raises the count when its tick comes.
 */
export function mergeNotes(notes: readonly FieldNote[], t: number): MergedNote[] {
  const byText = new Map<string, { text: string; count: number; x: number; y: number; fromTick: number }>();
  for (const n of notes) {
    const from = n.fromTick ?? -Infinity;
    if (from > t) continue;
    const key = n.text.toUpperCase();
    const m = byText.get(key);
    if (!m) byText.set(key, { text: key, count: 1, x: n.x, y: n.y, fromTick: from });
    else {
      m.count++;
      if (from < m.fromTick) { m.fromTick = from; m.x = n.x; m.y = n.y; }
    }
  }
  return [...byText.values()].sort((a, b) => a.fromTick - b.fromTick || (a.text < b.text ? -1 : 1));
}

function overlaps(a: PlacedNote, b: PlacedNote, gap: number): boolean {
  return Math.abs(a.cx - b.cx) * 2 < a.w + b.w + gap * 2 && Math.abs(a.cy - b.cy) * 2 < a.h + b.h + gap * 2;
}

/**
 * Places labels `heightPx` tall above their anchors. A label that would overlap one already placed moves
 * up (screen) a row at a time until it is clear, so labels never stack on each other. `avoid` boxes
 * (for example a scoreboard strip) are treated as already placed.
 */
export function layoutNotes(
  notes: readonly MergedNote[], toScreen: (x: number, y: number) => { x: number; y: number }, heightPx: number, gapPx: number, avoid: readonly PlacedNote[] = [],
): PlacedNote[] {
  const placed: PlacedNote[] = [...avoid];
  const out: PlacedNote[] = [];
  const padY = heightPx / GLYPH_ROWS;
  for (const n of notes) {
    const label = noteLabel(n);
    const w = blockWidth(label, heightPx) + 2 * padY, h = heightPx + 2 * padY;
    const a = toScreen(n.x, n.y);
    let box: PlacedNote = { text: label, cx: a.x, cy: a.y - h, w, h };
    // Bounded: each step clears at least one placed box's row, so n boxes need at most n steps.
    for (let step = 0; step <= placed.length && placed.some((p) => overlaps(box, p, gapPx)); step++) {
      const top = Math.min(...placed.filter((p) => overlaps(box, p, gapPx)).map((p) => p.cy - p.h / 2));
      box = { ...box, cy: top - gapPx - h / 2 };
    }
    placed.push(box);
    out.push(box);
  }
  return out;
}
