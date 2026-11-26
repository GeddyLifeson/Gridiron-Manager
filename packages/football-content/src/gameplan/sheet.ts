// The sheet object (G7.1.1) and the layout editor's rules (G7.1.2, O3.4.2): boxes on a 24 x 16 grid per
// side, no overlaps, keys assigned from position in reading order, a density meter and the smallest text
// size. The sheet stores references only (play ids and tags); call strings, diagrams and readiness are
// looked up live, so a retired play shows as a broken entry.
import type { Call, Playbook } from '../playbook/index.ts';
import type { Category } from './catalogue.ts';
import { param } from './params.ts';
import type { Condition, FocusBox, Hash, SituationRule } from './situations.ts';

export type Unit = 'offense' | 'defense' | 'special_teams' | 'head_coach';
export type Relay = 'radio' | 'wristband' | 'signals';
/** I2.5.2 freedom levels: no changes, checks within a packaged call, the full audible list. */
export type QbFreedom = 'none' | 'package' | 'full';
/** Set, stress, break order inside a defensive box (G6.4.1, G7.7.1). */
export type SetRole = 'set' | 'stress' | 'break';

export interface Entry {
  readonly id: string;
  readonly call: Call;
  readonly personnel?: string;
  readonly hash?: Hash;
  /** The user's text; a condition note such as "if they stay in two-high" is only text (G7.3.1). */
  readonly note?: string;
  /** 1, 2, 3 ranks for third downs and two-point plays. */
  readonly rank?: number;
  readonly setRole?: SetRole;
  /** Fakes: the look that must be present to run it (G7.7.2). */
  readonly requiredLook?: string;
  /** Marked by the user as a weather risk (the weather versions drop it, G7.8.1). */
  readonly weatherRisk?: boolean;
  /** Field goal entries: the kick's yards to goal, so the wind version can drop kicks beyond the line. */
  readonly kickYardsToGoal?: number;
}

export interface Box extends FocusBox {
  readonly title: string;
  readonly side: 0 | 1;
  readonly col: number;
  readonly row: number;
  readonly w: number;
  readonly h: number;
  readonly category: Category | null;
  /** The catalogue row this box was made for (G7.2.2 "has a box"). */
  readonly catalogueRef: string | null;
  readonly colour: string;
  /** Columns shown: call string, personnel, hash, note, readiness, length. */
  readonly columns: readonly string[];
  readonly entries: readonly Entry[];
}

export type ScriptPurpose = 'show_formation' | 'early_completion' | 'test_matchup' | 'set_up' | 'best_vs_look' | 'other';
export interface ScriptEntry {
  readonly id: string;
  readonly call: Call;
  readonly purpose: ScriptPurpose;
  readonly purposeText?: string;
  /** What the booth answers after the play (I2.3.4, I7), for example a hunted matchup (G6.3.1). */
  readonly watchingFor?: string;
  /** Skipped when the condition fails (down and distance band or hash). */
  readonly onlyIf?: readonly Condition[];
  /** The script entry this one sets up (its reminder shows once this one has run). */
  readonly setsUp?: string;
}
export type ScriptMode = 'all' | 'drive_openers' | 'first_downs';

export interface BandCellRef { readonly label: string; readonly call: Call }
export interface Audible { readonly name: string; readonly call: Call }

export type MustTarget = { readonly kind: 'by_half' } | { readonly kind: 'at_least'; readonly times: number };
export interface MustCall { readonly id: string; readonly call: Call; readonly target: MustTarget }
export interface TouchTarget { readonly playerId: string; readonly min: number; readonly max?: number; readonly promised: boolean }

export type NoteKind = 'tendency' | 'matchup' | 'pressure' | 'rule';
export interface PinnedNote {
  readonly id: string;
  /** Box the note sits in; null = page edge. */
  readonly boxId: string | null;
  readonly kind: NoteKind;
  readonly text: string;
  /** A tendency note carries the scouted rate and its sample (never the rate alone, G7.5.2). */
  readonly tendency?: { readonly cell: string; readonly count: number; readonly n: number };
}

export interface PageSpec { readonly orientation: 'landscape' | 'portrait'; readonly cols: number; readonly rows: number }

export interface Sheet {
  readonly unit: Unit;
  readonly gameId: string;
  readonly page: PageSpec;
  readonly situations: readonly SituationRule[];
  readonly boxes: readonly Box[];
  readonly script: readonly ScriptEntry[];
  readonly scriptMode: ScriptMode;
  readonly secondHalfScript: readonly ScriptEntry[];
  readonly wristband: readonly BandCellRef[];
  readonly audibleList: readonly Audible[];
  readonly relayDefault: Relay;
  readonly qbFreedomDefault: QbFreedom;
  readonly mustCalls: readonly MustCall[];
  readonly touchTargets: readonly TouchTarget[];
  readonly notes: readonly PinnedNote[];
  readonly version: number;
  /** Game-week tick at lock; null while a draft. */
  readonly lockedAt: number | null;
}

/** The canonical key of a call: play id plus sorted tags, and the packaged second play. */
export function callKey(c: Call): string {
  const one = (p: string, t: readonly string[]): string => [p, ...[...t].sort()].join('+');
  return c.second ? `${one(c.playId, c.tags)}|${one(c.second.playId, c.second.tags)}` : one(c.playId, c.tags);
}

export function defaultPage(): PageSpec {
  return { orientation: 'landscape', cols: param('layout.cols'), rows: param('layout.rows') };
}

export function emptySheet(unit: Unit, gameId: string): Sheet {
  return {
    unit, gameId, page: defaultPage(), situations: [], boxes: [], script: [], scriptMode: 'all', secondHalfScript: [],
    wristband: [], audibleList: [], relayDefault: 'radio', qbFreedomDefault: 'package', mustCalls: [], touchTargets: [], notes: [],
    version: 1, lockedAt: null,
  };
}

export function situationMap(sheet: Pick<Sheet, 'situations'>): Map<string, SituationRule> {
  return new Map(sheet.situations.map((s) => [s.id, s]));
}

export interface LayoutProblem { readonly kind: 'overlap' | 'outside'; readonly boxes: readonly string[] }

/** No two boxes on the same side overlap, and every box sits inside the grid (G7.1.2 acceptance). */
export function layoutProblems(sheet: Pick<Sheet, 'boxes' | 'page'>): LayoutProblem[] {
  const out: LayoutProblem[] = [];
  const { cols, rows } = sheet.page;
  for (const b of sheet.boxes) {
    if (b.col < 0 || b.row < 0 || b.w < 1 || b.h < 1 || b.col + b.w > cols || b.row + b.h > rows) out.push({ kind: 'outside', boxes: [b.id] });
  }
  for (let i = 0; i < sheet.boxes.length; i++) for (let j = i + 1; j < sheet.boxes.length; j++) {
    const a = sheet.boxes[i]!, b = sheet.boxes[j]!;
    if (a.side === b.side && a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h) out.push({ kind: 'overlap', boxes: [a.id, b.id] });
  }
  return out;
}

/** Reading order: front then back, top row first, left to right. */
export function readingOrder<B extends Pick<Box, 'side' | 'row' | 'col' | 'id'>>(boxes: readonly B[]): B[] {
  return [...boxes].sort((a, b) => a.side - b.side || a.row - b.row || a.col - b.col || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Give each box its reading-order position (the `order` focus uses to break priority ties). */
export function withReadingOrder(boxes: readonly Box[]): Box[] {
  const pos = new Map(readingOrder(boxes).map((b, i) => [b.id, i]));
  return boxes.map((b) => ({ ...b, order: pos.get(b.id)! }));
}

export const BOX_KEYS = 'QWERTYUIOPASDFGHJKLZXCVBNM';
export const ENTRY_KEYS = '1234567890';

function keyPath(i: number, alphabet: string, total: number): string[] {
  if (total <= alphabet.length) return [alphabet[i]!];
  return [alphabet[Math.floor(i / alphabet.length)]!, alphabet[i % alphabet.length]!];
}

export interface KeyMap {
  /** Box id to its key presses. */
  readonly boxes: ReadonlyMap<string, readonly string[]>;
  /** "boxId/entryId" to the full key path (box keys then entry keys). */
  readonly entries: ReadonlyMap<string, readonly string[]>;
  /** Paths longer than the press limit (G7.1.2 acceptance: at most 3). */
  readonly tooLong: readonly string[];
}

/** I2.6.3 key map: boxes get keys in reading order, entries by row, so the layout is what the hands learn. */
export function keyMap(sheet: Pick<Sheet, 'boxes'>): KeyMap {
  const ordered = readingOrder(sheet.boxes);
  const boxes = new Map<string, string[]>();
  const entries = new Map<string, string[]>();
  const tooLong: string[] = [];
  const max = param('layout.maxPresses');
  ordered.forEach((b, i) => {
    const bk = keyPath(i, BOX_KEYS, ordered.length);
    boxes.set(b.id, bk);
    if (bk.length > max) tooLong.push(b.id);
    b.entries.forEach((e, j) => {
      const path = [...bk, ...keyPath(j, ENTRY_KEYS, b.entries.length)];
      entries.set(`${b.id}/${e.id}`, path);
      if (path.length > max) tooLong.push(`${b.id}/${e.id}`);
    });
  });
  return { boxes, entries, tooLong };
}

/** Boxes whose key changed from a saved template's key map: moving a box costs the user his own practice. */
export function keyChanges(saved: KeyMap, now: KeyMap): string[] {
  return [...saved.boxes].filter(([id, k]) => (now.boxes.get(id) ?? []).join('') !== k.join('')).map(([id]) => id);
}

export interface Density {
  readonly entriesBySide: readonly [number, number];
  readonly bandBySide: readonly ['clear' | 'dense' | 'too_dense', 'clear' | 'dense' | 'too_dense'];
  /** Smallest text size on the sheet at true page size, points. */
  readonly smallestTextPt: number;
  /** Boxes whose text falls under the minimum (they overflow to a scroll on the console, G7.3.1). */
  readonly overflow: readonly string[];
}

/** Text size a box allows: box height over its lines (title, entries, pinned notes) at the line spacing. */
export function boxTextPt(b: Pick<Box, 'h' | 'entries' | 'id'>, page: PageSpec, notesIn = 0): number {
  const pageHeightIn = page.orientation === 'landscape' ? param('layout.pageShortIn') : param('layout.pageLongIn');
  const heightIn = (b.h / page.rows) * pageHeightIn;
  const lines = 1 + b.entries.length + notesIn;
  return (heightIn * 72) / (lines * param('layout.lineSpacing'));
}

/** G7.1.2 density meter: entries per side against the clear and dense bands, and the smallest text size. */
export function density(sheet: Pick<Sheet, 'boxes' | 'page' | 'notes'>): Density {
  const per: [number, number] = [0, 0];
  let smallest = Number.POSITIVE_INFINITY;
  const overflow: string[] = [];
  for (const b of sheet.boxes) {
    per[b.side] += b.entries.length;
    const pt = boxTextPt(b, sheet.page, sheet.notes.filter((n) => n.boxId === b.id).length);
    smallest = Math.min(smallest, pt);
    if (pt < param('layout.minTextPt')) overflow.push(b.id);
  }
  const band = (n: number): 'clear' | 'dense' | 'too_dense' => (n < param('layout.denseEntries') ? 'clear' : n <= param('layout.tooDenseEntries') ? 'dense' : 'too_dense');
  return { entriesBySide: per, bandBySide: [band(per[0]), band(per[1])], smallestTextPt: smallest === Number.POSITIVE_INFINITY ? 0 : smallest, overflow };
}

/** A template: layout and situations without entries, script, band, marks or game (G7.1.1). */
export function toTemplate(sheet: Sheet): Sheet {
  return {
    ...sheet, gameId: '', boxes: sheet.boxes.map((b) => ({ ...b, entries: [] })), script: [], secondHalfScript: [], wristband: [],
    audibleList: [], mustCalls: [], touchTargets: [], notes: [], lockedAt: null, version: 1,
  };
}

export const SHEET_FORMAT = 'gm.callsheet/1';

/** Data file of a sheet (G7.9.2, P4): references only, no names or results. */
export function serializeSheet(sheet: Sheet): string {
  return JSON.stringify({ format: SHEET_FORMAT, sheet });
}

export class SheetFormatError extends Error {}

/** Parse a sheet data file; `asTemplate` strips entries so it can seed another save (G7.9.2). */
export function parseSheet(text: string, asTemplate = false): Sheet {
  const raw = JSON.parse(text) as { format?: unknown; sheet?: Sheet };
  if (raw.format !== SHEET_FORMAT || !raw.sheet || !Array.isArray(raw.sheet.boxes)) throw new SheetFormatError('not a call sheet file');
  return asTemplate ? toTemplate(raw.sheet) : raw.sheet;
}

/** Entries whose play is missing or retired (G7.1.1 edge case: broken entries block locking). */
export function brokenEntries(sheet: Pick<Sheet, 'boxes'>, book: Playbook): { boxId: string; entryId: string; playId: string }[] {
  const out: { boxId: string; entryId: string; playId: string }[] = [];
  for (const b of sheet.boxes) for (const e of b.entries) {
    for (const id of [e.call.playId, ...(e.call.second ? [e.call.second.playId] : [])]) {
      const p = book.plays.get(id);
      if (!p || p.status === 'retired') out.push({ boxId: b.id, entryId: e.id, playId: id });
    }
  }
  return out;
}

/** Distinct play-plus-tag calls on the sheet (G7.3.2 counter). */
export function uniqueCalls(sheet: Pick<Sheet, 'boxes'>): Set<string> {
  return new Set(sheet.boxes.flatMap((b) => b.entries.map((e) => callKey(e.call))));
}
