// The game plan's call sheet (G-68 `gameplan.Sheet`, G7) as the calling console reads it (G-60 `CallSheet`,
// I2.2.2, O2.2). Boxes keep their place, title and order; each box's situation becomes a console rule; entries
// become call templates from the content book (the engine call minus players: the console adds whoever the
// depth chart sends). A situation the console cannot test stays on the sheet as a box the user opens by key
// (its rule never matches), and a call whose play is missing from the book is left out and listed.
import { gameplan as gp } from '@gm/football-content';
import type { BoxRule, CallSheet, CallTemplate, Readiness, SheetBox, SheetEntry } from '../commands/game-calling/sheet.ts';
import { defenseCall, offenseCall } from '../coach-calling/build.ts';
import { contentBook, type ContentBook } from '../coach-calling/content.ts';

type Call = gp.Entry['call'];
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Two-minute boxes are "half seconds left at most 120" (G7.2.2), as the console's two-minute flag. */
export const TWO_MINUTE_S = 120;
/** Last play of a half: 5 seconds or less (the catalogue's LAST_PLAY_S, an Assumption there). */
export const LAST_PLAY_S = 5;

/** A rule that never matches: the box is reached only by its key. */
export const MANUAL_ONLY: BoxRule = { downs: [] };

/**
 * A G-68 situation as a console rule, or null when it says something the console cannot test (a try or a
 * kicking play, game seconds, timeouts, hash, formation, a lost-yardage play, rules joined by "or").
 */
export function toBoxRule(rule: gp.SituationRule): BoxRule | null {
  if (rule.anyOf.length !== 1) return null;
  const out: Mutable<BoxRule> = {};
  for (const c of rule.anyOf[0]!.all) {
    switch (c.on) {
      case 'down': out.downs = [...c.in]; break;
      case 'distance': if (c.min !== undefined) out.distMin = c.min; if (c.max !== undefined) out.distMax = c.max; break;
      case 'yardsToGoal': if (c.min !== undefined) out.toGoalMin = c.min; if (c.max !== undefined) out.toGoalMax = c.max; break;
      case 'scoreDiff': if (c.min !== undefined) out.scoreMin = c.min; if (c.max !== undefined) out.scoreMax = c.max; break;
      case 'personnel': out.personnel = [...c.in]; break;
      case 'kind': if (c.in.length !== 1 || c.in[0] !== 'scrimmage') return null; break;
      case 'halfSecondsLeft':
        if (c.min === undefined && c.max === TWO_MINUTE_S) out.twoMinute = true;
        else if (c.min === undefined && c.max === LAST_PLAY_S) out.lastPlayOfHalf = true;
        else if (c.min === TWO_MINUTE_S + 1 && c.max === undefined) out.twoMinute = false;
        else return null;
        break;
      case 'afterEvent': if (c.in.length === 1 && c.in[0] === 'turnover') out.suddenChange = true; else return null; break;
      case 'tempo':
        if (c.in.length > 0 && c.in.every((t) => t !== 'huddle')) out.noHuddle = true;
        else if (c.in.length === 1 && c.in[0] === 'huddle') out.noHuddle = false;
        else return null;
        break;
      default: return null;
    }
  }
  return out;
}

export interface ConsoleSheetInputs {
  readonly book?: ContentBook;
  /** Staff readiness estimate of a call against the week's thresholds (G5.4.1). Default 'ready' (see DECISIONS.md). */
  readonly readiness?: (call: Call) => Readiness;
  /** Spoken length in the team's terminology (G4.3.1), tenths. Default 0 (no terminology yet). */
  readonly spokenTenths?: (call: Call) => number;
  /** The call text as the coach says it (G-67 renderCall). Default the content name plus tags. */
  readonly label?: (call: Call) => string;
  readonly signal?: (call: Call) => boolean;
  /** Who runs the call when a player it needs is out (I6); null when nobody is out. */
  readonly replacement?: (call: Call) => string | null;
}

export interface ConsoleSheetResult {
  readonly sheet: CallSheet;
  /** Boxes whose situation the console cannot test; the user opens them by key. */
  readonly manualOnly: readonly string[];
  /** "boxId/entryId" whose play is not in the book. */
  readonly broken: readonly string[];
}

const NO_PLAYERS = () => [];

/** The call template of a sheet call, or null when the book has no such play on that side. A packaged call uses its first play. */
export function callTemplate(book: ContentBook, unit: 'offense' | 'defense', call: Call): CallTemplate | null {
  if (unit === 'offense') {
    const p = book.plays.get(call.playId);
    if (!p) return null;
    const { players: _p, ...t } = offenseCall(p, NO_PLAYERS);
    return { ...t, tags: [...call.tags] };
  }
  const d = book.defense.get(call.playId);
  if (!d) return null;
  const { players: _p, ...t } = defenseCall(d, NO_PLAYERS);
  return t;
}

function defaultLabel(book: ContentBook, call: Call): string {
  const name = (id: string) => book.plays.get(id)?.name ?? book.defense.get(id)?.name ?? id;
  const one = (id: string, tags: readonly string[]) => [name(id), ...tags].join(' ');
  return call.second ? `${one(call.playId, call.tags)} / ${one(call.second.playId, call.second.tags)}` : one(call.playId, call.tags);
}

const span = (r: BoxRule) => (r.distMax ?? 99) - (r.distMin ?? 0);
/** Only down and distance bounds: a box that can stand for a whole down. */
const openRule = (r: BoxRule) => Object.keys(r).every((k) => k === 'downs' || k === 'distMin' || k === 'distMax');

/**
 * K4.1.1 rule 4, as the AI caller's base boxes (coach-calling `baseBoxes`): for each down, the broadest box for
 * that down with entries and only down and distance bounds.
 */
function baseDownsOf(boxes: readonly SheetBox[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const open = boxes.filter((b) => b.rule !== null && b.rule !== MANUAL_ONLY && b.entries.length > 0 && openRule(b.rule));
  for (const d of [1, 2, 3, 4]) {
    const best = open.filter((b) => !b.rule!.downs || b.rule!.downs.includes(d))
      .sort((a, b) => span(b.rule!) - span(a.rule!) || (a.priority ?? 0) - (b.priority ?? 0) || (a.id < b.id ? -1 : 1))[0];
    if (best) out.set(best.id, [...(out.get(best.id) ?? []), d]);
  }
  return out;
}

export function toConsoleSheet(sheet: gp.Sheet, inp: ConsoleSheetInputs = {}): ConsoleSheetResult {
  if (sheet.unit !== 'offense' && sheet.unit !== 'defense') throw new Error(`toConsoleSheet: ${sheet.unit} sheets go through consoleSpecialSheet`);
  const unit = sheet.unit;
  const book = inp.book ?? contentBook();
  const sits = gp.situationMap(sheet);
  const manualOnly: string[] = [];
  const broken: string[] = [];
  const ordered = gp.withReadingOrder(sheet.boxes);
  const boxes: SheetBox[] = ordered.map((b) => {
    const sit = b.situationId === null ? undefined : sits.get(b.situationId);
    let rule = sit ? toBoxRule(sit) : null;
    if (!rule) { rule = MANUAL_ONLY; manualOnly.push(b.id); }
    const entries: SheetEntry[] = [];
    for (const e of b.entries) {
      const call = callTemplate(book, unit, e.call);
      if (!call) { broken.push(`${b.id}/${e.id}`); continue; }
      entries.push({
        id: `${b.id}/${e.id}`, label: inp.label?.(e.call) ?? defaultLabel(book, e.call), call, spokenTenths: inp.spokenTenths?.(e.call) ?? 0,
        readiness: inp.readiness?.(e.call) ?? 'ready', tags: [], onBand: gp.bandNumberOf(sheet, e.call) !== null, signal: inp.signal?.(e.call) ?? false,
        replacement: inp.replacement?.(e.call) ?? null,
      });
    }
    return { id: b.id, title: b.title, row: b.side * sheet.page.rows + b.row, col: b.col, rule, priority: b.priority * 1000 + b.order, entries };
  });
  const base = baseDownsOf(boxes);
  return {
    sheet: { id: `${unit}:${sheet.gameId}:v${sheet.version}`, unit, boxes: boxes.map((b) => (base.has(b.id) ? { ...b, baseDowns: base.get(b.id)! } : b)) },
    manualOnly, broken,
  };
}
