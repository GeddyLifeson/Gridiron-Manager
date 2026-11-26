// Contingency sheets (G7.8.1), the pre-lock review and lock (G7.9.1), and printing (G7.9.2, O3.4.3).
// A version shares the base sheet's layout, so keys never move; it removes, adds or reorders entries.
import type { Call, Playbook } from '../playbook/index.ts';
import { CATALOGUE_BY_ID, checkCatalogue, missingRows, tierOf, type Category, type RowCheck } from './catalogue.ts';
import { param } from './params.ts';
import type { PlanWarning } from './plan.ts';
import { runPassOf } from './plan.ts';
import type { ReferenceTable } from './reference.ts';
import { boxTextPt, brokenEntries, callKey, situationMap, uniqueCalls, type Entry, type Sheet } from './sheet.ts';
import { situationGrid } from './situations.ts';
import type { Trigger } from './possession.ts';

export interface SheetVersion {
  readonly id: string;
  readonly trigger: Trigger;
  /** Entry ids removed from the base. */
  readonly removed: readonly string[];
  readonly added: readonly { readonly boxId: string; readonly entry: Entry }[];
  readonly order: readonly { readonly boxId: string; readonly entryIds: readonly string[] }[];
}

/** The sheet a version produces: same boxes in the same places, different entries. */
export function applyVersion(base: Sheet, v: SheetVersion): Sheet {
  const removed = new Set(v.removed);
  return {
    ...base,
    boxes: base.boxes.map((b) => {
      let entries = [...b.entries.filter((e) => !removed.has(e.id)), ...v.added.filter((a) => a.boxId === b.id).map((a) => a.entry)];
      const ord = v.order.find((o) => o.boxId === b.id);
      if (ord) { const byId = new Map(entries.map((e) => [e.id, e])); entries = [...ord.entryIds.map((id) => byId.get(id)).filter((e): e is Entry => !!e), ...entries.filter((e) => !ord.entryIds.includes(e.id))]; }
      return { ...b, entries };
    }),
  };
}

/** Draft the backup quarterback's version: keep entries whose readiness with him passes the threshold; add his audibles to the given box. */
export function draftBackupVersion(base: Sheet, id: string, backupId: string, readinessWithBackup: (c: Call) => number, audibles: readonly { boxId: string; entry: Entry }[] = []): SheetVersion {
  const removed = base.boxes.flatMap((b) => b.entries.filter((e) => readinessWithBackup(e.call) < param('version.backupReadiness')).map((e) => e.id));
  return { id, trigger: { kind: 'qb_out', backupId }, removed, added: [...audibles], order: [] };
}

/** Weather versions drop entries marked as weather risks; the wind version also drops kicks beyond the card's line for the direction. */
export function draftWeatherVersion(base: Sheet, id: string, what: 'wet' | 'wind', fieldGoalLine: number | null = null): SheetVersion {
  const removed = base.boxes.flatMap((b) => b.entries.filter((e) => e.weatherRisk || (what === 'wind' && e.kickYardsToGoal !== undefined && (fieldGoalLine === null || e.kickYardsToGoal > fieldGoalLine))).map((e) => e.id));
  return { id, trigger: { kind: 'weather', what }, removed, added: [], order: [] };
}

/** Backup version size warning: under 20 calls, or missing a tier 1 situation. */
export function checkVersion(base: Sheet, v: SheetVersion, table: ReferenceTable | null): PlanWarning[] {
  const s = applyVersion(base, v);
  const w: PlanWarning[] = [];
  const n = uniqueCalls(s).size;
  if (v.trigger.kind === 'qb_out' && n < param('version.backupMinCalls')) w.push({ leaf: 'G7.8.1', code: 'version.small', subject: v.id, text: `${v.id} has ${n} calls`, severity: 'warning' });
  if (v.trigger.kind === 'qb_out') {
    for (const b of s.boxes) if (b.entries.length === 0 && b.catalogueRef) {
      const row = CATALOGUE_BY_ID.get(b.catalogueRef);
      if (row && tierOf(row, table) === 1) w.push({ leaf: 'G7.8.1', code: 'version.tier1_empty', subject: `${v.id}/${b.id}`, text: `${v.id} leaves ${b.title} empty`, severity: 'warning' });
    }
  }
  return w;
}

// ---- G7.9.1 pre-lock review ------------------------------------------------------------------------------

export interface ReviewInput {
  readonly sheet: Sheet;
  readonly book: Playbook;
  readonly table: ReferenceTable | null;
  /** Calls practised this week (at least one rep against a relevant look, H3). */
  readonly practiced: (c: Call) => boolean;
  readonly readiness: (c: Call) => number;
  readonly overLimit: (c: Call) => boolean;
  /** A player the call needs who is doubtful (H5); null when none. */
  readonly needsDoubtful: (c: Call) => string | null;
  readonly repsAvailable: number;
  readonly qbDislikes: ReadonlySet<string>;
}

export interface ReviewItem { readonly code: string; readonly subject: string; readonly text: string; readonly blocks: boolean }
export interface SheetReview { readonly items: readonly ReviewItem[]; readonly catalogue: readonly RowCheck[] }

/** G7.9.1 report. Only broken entries block locking (G7.1.1); every other item can be locked with. */
export function reviewSheet(i: ReviewInput): SheetReview {
  const s = i.sheet, items: ReviewItem[] = [];
  const present = new Set<Category>(s.script.length > 0 ? ['script'] : []);
  const catalogue = checkCatalogue(s.boxes, situationMap(s), situationGrid(), i.table, present);
  for (const r of missingRows(catalogue)) items.push({ code: r.status === 'partly' ? 'partly_covered' : 'missing_situation', subject: r.row.id, text: `${r.row.label}: ${r.status}`, blocks: false });
  for (const b of s.boxes) if (b.entries.length === 0 && b.category !== 'halftime') items.push({ code: 'empty_box', subject: b.id, text: `${b.title} is empty`, blocks: false });
  for (const x of brokenEntries(s, i.book)) items.push({ code: 'broken_entry', subject: `${x.boxId}/${x.entryId}`, text: `${x.playId} is missing or retired`, blocks: true });
  const seen = new Set<string>();
  for (const b of s.boxes) for (const e of b.entries) {
    const k = callKey(e.call);
    if (seen.has(k)) continue;
    seen.add(k);
    if (!i.practiced(e.call)) items.push({ code: 'unpracticed', subject: k, text: `${k} not practised this week`, blocks: false });
    if (i.readiness(e.call) < param('review.lowReadiness')) items.push({ code: 'low_readiness', subject: k, text: `${k} readiness ${i.readiness(e.call)}`, blocks: false });
    if (i.overLimit(e.call)) items.push({ code: 'over_length', subject: k, text: `${k} is over the length limit`, blocks: false });
    const p = i.needsDoubtful(e.call);
    if (p) items.push({ code: 'doubtful_player', subject: k, text: `${k} needs ${p}, who is doubtful`, blocks: false });
    if (i.qbDislikes.has(k)) items.push({ code: 'qb_dislike', subject: k, text: `the quarterback dislikes ${k}`, blocks: false });
  }
  // Tendencies the sheet would show (G8): every call from one formation is a run, or every one a pass.
  const byForm = new Map<string, Set<string>>();
  const formCount = new Map<string, number>();
  for (const k of seen) {
    const playId = k.split('+')[0]!.split('|')[0]!;
    const p = i.book.plays.get(playId);
    const f = p?.parts.formation;
    if (!f) continue;
    (byForm.get(f) ?? byForm.set(f, new Set()).get(f)!).add(runPassOf(p));
    formCount.set(f, (formCount.get(f) ?? 0) + 1);
  }
  for (const [f, kinds] of byForm) if (kinds.size === 1 && formCount.get(f)! >= param('review.tellMinEntries') && !kinds.has('other')) {
    items.push({ code: 'formation_tell', subject: f, text: `every call from ${f} is a ${[...kinds][0]}`, blocks: false });
  }
  if (seen.size > i.repsAvailable * param('size.repRatio')) items.push({ code: 'size_vs_reps', subject: 'sheet', text: `${seen.size} calls, ${i.repsAvailable} reps`, blocks: false });
  return { items, catalogue };
}

export class LockError extends Error {}

/** Lock the sheet (G7.9.1): allowed with open items except broken entries. */
export function lockSheet(sheet: Sheet, review: SheetReview, at: number): Sheet {
  const blocking = review.items.filter((x) => x.blocks);
  if (blocking.length > 0) throw new LockError(`cannot lock: ${blocking.map((b) => b.subject).join(', ')}`);
  return { ...sheet, lockedAt: at, version: sheet.version + 1 };
}

/** Edits a locked sheet still allows at I1: inactives and weather (the same rule in every career, N4 rule 1). */
export function lockedEditAllowed(sheet: Sheet, kind: 'inactives' | 'weather' | 'other'): boolean {
  return sheet.lockedAt === null || kind !== 'other';
}

// ---- G7.9.2 / O3.4.3 print -------------------------------------------------------------------------------

export type Paper = 'letter' | 'legal' | 'tabloid';
const PAPER_IN: Record<Paper, readonly [number, number]> = { letter: [11, 8.5], legal: [14, 8.5], tabloid: [17, 11] };
export interface PrintBox { readonly id: string; readonly side: 0 | 1; readonly xIn: number; readonly yIn: number; readonly wIn: number; readonly hIn: number; readonly textPt: number; readonly lines: readonly string[]; readonly overflow: boolean }

/**
 * Print layout from the same grid as the console (G7.9.2): box positions scale with the paper; text never
 * shrinks below 7 pt, and a box that would need smaller text is flagged before printing. Lines come from
 * the caller's renderer (call strings, key hints); the sheet holds no names (A6).
 */
export function printLayout(sheet: Sheet, paper: Paper, render: (e: Entry, key: string | null) => string, keys: ReadonlyMap<string, readonly string[]> | null = null): PrintBox[] {
  const [long, short] = PAPER_IN[paper];
  const [wIn, hIn] = sheet.page.orientation === 'landscape' ? [long, short] : [short, long];
  const scale = hIn / (sheet.page.orientation === 'landscape' ? param('layout.pageShortIn') : param('layout.pageLongIn'));
  return sheet.boxes.map((b) => {
    const pt = boxTextPt(b, sheet.page) * scale;
    return {
      id: b.id, side: b.side, xIn: (b.col / sheet.page.cols) * wIn, yIn: (b.row / sheet.page.rows) * hIn, wIn: (b.w / sheet.page.cols) * wIn, hIn: (b.h / sheet.page.rows) * hIn,
      textPt: Math.max(pt, param('layout.minTextPt')), overflow: pt < param('layout.minTextPt'),
      lines: [b.title, ...b.entries.map((e) => render(e, keys?.get(`${b.id}/${e.id}`)?.join('') ?? null))],
    };
  });
}
