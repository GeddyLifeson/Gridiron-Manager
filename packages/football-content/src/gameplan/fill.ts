// Filling the boxes (G7.3.1), sheet size and the reduction (G7.3.2), and expected snaps beside each box
// (G7.2.3). Readiness shown is always the staff's estimate (G5.4.1), passed in, never D9's true value.
import type { Call } from '../playbook/index.ts';
import { tierOf, CATALOGUE_BY_ID } from './catalogue.ts';
import { param } from './params.ts';
import type { MenuEntry, PlanWarning } from './plan.ts';
import { depthMark, expectedSnaps, type DepthMark, type ExpectedSnaps, type ReferenceTable } from './reference.ts';
import { callKey, situationMap, uniqueCalls, type Box, type Entry, type Sheet } from './sheet.ts';

/** Add an entry to a box. The call need not be on the menu: an off-plan call is marked "not practiced this week". */
export function addEntry(sheet: Sheet, boxId: string, entry: Entry, at?: number): Sheet {
  return {
    ...sheet,
    boxes: sheet.boxes.map((b) => {
      if (b.id !== boxId) return b;
      const entries = [...b.entries];
      entries.splice(at === undefined ? entries.length : Math.max(0, Math.min(at, entries.length)), 0, entry);
      return { ...b, entries };
    }),
  };
}

export function removeEntry(sheet: Sheet, boxId: string, entryId: string): Sheet {
  return { ...sheet, boxes: sheet.boxes.map((b) => (b.id === boxId ? { ...b, entries: b.entries.filter((e) => e.id !== entryId) } : b)) };
}

/** Reorder a box; the order is the user's alone and never changes on game day (G7.3.1). */
export function reorderBox(sheet: Sheet, boxId: string, entryIds: readonly string[]): Sheet {
  return {
    ...sheet,
    boxes: sheet.boxes.map((b) => {
      if (b.id !== boxId) return b;
      const byId = new Map(b.entries.map((e) => [e.id, e]));
      const head = entryIds.map((id) => byId.get(id)).filter((e): e is Entry => e !== undefined);
      return { ...b, entries: [...head, ...b.entries.filter((e) => !entryIds.includes(e.id))] };
    }),
  };
}

export interface EntryView {
  readonly boxId: string;
  readonly entryId: string;
  readonly key: string;
  readonly notInPlan: boolean;
  /** How many boxes the same call already sits in. */
  readonly boxesWith: number;
  readonly readiness: number;
}

/** Entry facts the designer shows beside each call (G7.3.1). */
export function entryViews(sheet: Sheet, menu: readonly MenuEntry[], readiness: (c: Call) => number): EntryView[] {
  const planned = new Set(menu.map((m) => callKey(m.call)));
  const plays = new Set(menu.map((m) => m.call.playId));
  const count = new Map<string, number>();
  for (const b of sheet.boxes) for (const k of new Set(b.entries.map((e) => callKey(e.call)))) count.set(k, (count.get(k) ?? 0) + 1);
  return sheet.boxes.flatMap((b) => b.entries.map((e) => {
    const key = callKey(e.call);
    return { boxId: b.id, entryId: e.id, key, notInPlan: !planned.has(key) && !plays.has(e.call.playId), boxesWith: count.get(key)!, readiness: readiness(e.call) };
  }));
}

export interface BoxSnaps { readonly boxId: string; readonly entries: number; readonly expected: ExpectedSnaps | null; readonly mark: DepthMark }

/** G7.2.3 expected snaps per situation box, with its source and game count, and the deep and thin marks. */
export function boxSnaps(sheet: Sheet, table: ReferenceTable | null): BoxSnaps[] {
  const sits = situationMap(sheet);
  return sheet.boxes.filter((b) => b.situationId !== null).map((b) => {
    const s = sits.get(b.situationId!);
    const expected = s && table ? expectedSnaps(s, table) : null;
    return { boxId: b.id, entries: b.entries.length, expected, mark: expected ? depthMark(b.entries.length, expected.value) : null };
  });
}

export interface SizeReport {
  readonly unique: number;
  readonly repsAvailable: number;
  /** Fires exactly when unique calls exceed reps x ratio (G7.3.2 acceptance). */
  readonly overReps: boolean;
  readonly warnings: readonly PlanWarning[];
}

function isTier1(b: Box, table: ReferenceTable | null): boolean {
  const row = b.catalogueRef ? CATALOGUE_BY_ID.get(b.catalogueRef) : undefined;
  return row !== undefined && tierOf(row, table) === 1;
}

/** G7.3.2 counter and warnings: unique calls against reps, the sheet range, boxes hard to scan, thin tier 1 boxes. */
export function sizeReport(sheet: Sheet, repsAvailable: number, table: ReferenceTable | null = null): SizeReport {
  const unique = uniqueCalls(sheet).size;
  const overReps = unique > repsAvailable * param('size.repRatio');
  const w: PlanWarning[] = [];
  if (overReps) w.push({ leaf: 'G7.3.2', code: 'size.over_reps', subject: 'sheet', text: `${unique} unique calls, ${repsAvailable} team reps`, severity: 'warning' });
  if (unique < param('size.sheetMin') || unique > param('size.sheetMax')) w.push({ leaf: 'G7.3.2', code: 'size.range', subject: 'sheet', text: `${unique} calls; the usual range is ${param('size.sheetMin')} to ${param('size.sheetMax')}`, severity: 'note' });
  for (const b of sheet.boxes) {
    if (b.entries.length > param('size.boxScanMax')) w.push({ leaf: 'G7.3.2', code: 'size.box_scan', subject: b.id, text: `${b.title}: ${b.entries.length} entries is hard to scan`, severity: 'note' });
    if (isTier1(b, table) && b.entries.length < param('size.tier1BoxMin')) w.push({ leaf: 'G7.3.2', code: 'size.box_thin', subject: b.id, text: `${b.title}: ${b.entries.length} entries`, severity: 'note' });
  }
  return { unique, repsAvailable, overReps, warnings: w };
}

export interface CutLogLine { readonly afterPractice: number; readonly callKey: string; readonly reason: string }
export interface PracticeResult { readonly callKey: string; readonly reps: number; readonly busts: number; readonly completionRate: number | null; readonly qbDislike: boolean }

/** Calls that repped badly, listed as cut candidates after each practice (busts, low completion, the quarterback's dislike). */
export function cutCandidates(results: readonly PracticeResult[], bustShare = param('size.cutBustShare'), lowCompletion = param('size.cutLowCompletion')): PracticeResult[] {
  return results.filter((r) => r.qbDislike || (r.reps > 0 && r.busts / r.reps >= bustShare) || (r.completionRate !== null && r.completionRate < lowCompletion));
}

/** Cut calls from the sheet and log the reason. */
export function cutCalls(sheet: Sheet, keys: readonly string[], afterPractice: number, reason: string, log: readonly CutLogLine[]): { sheet: Sheet; log: CutLogLine[] } {
  const drop = new Set(keys);
  return {
    sheet: { ...sheet, boxes: sheet.boxes.map((b) => ({ ...b, entries: b.entries.filter((e) => !drop.has(callKey(e.call))) })) },
    log: [...log, ...keys.map((k) => ({ afterPractice, callKey: k, reason }))],
  };
}

/** The execution penalty the engine applies when the quarterback runs a pass he dislikes (G7.3.2 starting value). */
export function qbDislikePenalty(): number { return param('size.qbDislikePenalty'); }

/** After the game: the share of unique sheet calls actually called. Information only, no target. */
export function useRate(sheet: Sheet, calledKeys: readonly string[]): number {
  const u = uniqueCalls(sheet);
  if (u.size === 0) return 0;
  return new Set(calledKeys.filter((k) => u.has(k))).size / u.size;
}
