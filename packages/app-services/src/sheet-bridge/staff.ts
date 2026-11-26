// The staff's draft of the call sheet (Marlon's ruling, 2026-11-26 07:06 UTC: "staff draft it from the game plan
// and their skill, and he can edit anything before kickoff"). The draft runs the same K3.4.2 sheet builder the AI
// coordinators use (coach-ai preparation `buildSheet`): which situations get a box and how long the script is
// follow the staff's preparation (K2.1.4 through `prepDepth`); each box holds the plan's calls chosen for that
// situation, sized by expected snaps (G7.2.3). The result is a G-68 sheet the user edits with the game plan
// commands. Learned preferences (prefs.ts) are applied on top, and what the staff still want is kept as their
// suggestions. Nothing here reads a true rating.
import { preparation } from '@gm/coach-ai';
import { gameplan as gp } from '@gm/football-content';
import { contentBook, type ContentBook } from '../coach-calling/content.ts';
import { applyPreferences, type Preferences, type Suggestion } from './prefs.ts';

export type DraftUnit = 'offense' | 'defense';

/** K4.5.1: the opening script draws from first and 10, then second and medium (as `SheetInput.scriptSituations`). */
export const SCRIPT_SITUATIONS: readonly string[] = ['first_10', 'second_medium'];

export interface PlanEstimates {
  /** K3.3 payoff estimates of the staff for this game, when the week built them. */
  readonly table: preparation.PayoffTable;
  readonly shares: preparation.SheetInput['shares'];
}

export interface StaffDraftInput {
  readonly unit: DraftUnit;
  readonly gameId: string;
  /** The week's game plan menu for this side (G6). Empty: the staff list the whole book (see DECISIONS.md). */
  readonly menu: readonly gp.MenuEntry[];
  /** K2.1.4 preparation (and evaluation) of the coach who owns the plan, as z values. */
  readonly preparationZ: number;
  readonly evaluationZ?: number;
  /** Expected snaps by situation (G7.2.3); default the pro 2024 table (no college table exists yet). */
  readonly reference?: gp.ReferenceTable | null;
  /** Total entries the sheet aims for; default the G7.3.2 low end of the usual sheet (`size.sheetMin`). */
  readonly sizeLimit?: number;
  readonly book?: ContentBook;
  /** The staff's K3 estimates. Without them the staff rank calls in the plan's own order. */
  readonly estimates?: PlanEstimates;
  /** What the staff learned from the user's past edits (prefs.ts). */
  readonly preferences?: Preferences;
}

export interface StaffDraft {
  readonly sheet: gp.Sheet;
  /** The K3 sheet the draft was laid out from (before preferences). */
  readonly ai: preparation.AiSheet;
  /** Calls the staff would have placed that a learned preference took out, or calls they would add: for the week's one-on-one. */
  readonly suggestions: readonly Suggestion[];
  /** Plan entries whose call is not in the content book, and AI boxes with no sheet slot. */
  readonly skipped: readonly string[];
}

/** Plan entries for a side when the user has no plan yet: every book call for the side, in book order, any situation. */
export function bookMenu(unit: DraftUnit, book: ContentBook = contentBook()): gp.MenuEntry[] {
  const ids = unit === 'offense' ? [...book.plays.keys()] : [...book.defense.keys()];
  return ids.map((id) => ({ id: `book.${id}`, side: unit, call: { playId: id, tags: [] }, situationIds: [], targetReps: 0 }));
}

function catalogueDefs(reference: gp.ReferenceTable): preparation.SituationDef[] {
  return gp.catalogueEntries(reference)
    .filter((e) => e.expectedSnaps !== null && gp.CATALOGUE_BY_ID.get(e.id)?.situation)
    .map((e) => ({ id: e.id, parentId: e.parentId, expectedSnaps: e.expectedSnaps!, clock: e.clock !== null }));
}

/** No estimates: every call is valued by its place in the plan, first highest, against a single 'other' look. */
function planOrderTable(unit: DraftUnit, ids: readonly string[]): PlanEstimates {
  const cells = new Map<string, preparation.PayoffCell>();
  ids.forEach((callId, i) => cells.set(preparation.cellKey(callId, preparation.OTHER_LOOK), { callId, look: preparation.OTHER_LOOK, mean: -i, sd: 0, reps: 0 }));
  return {
    table: { unit, looks: [preparation.OTHER_LOOK], cells, repsUsed: 0 },
    shares: { all: [{ look: preparation.OTHER_LOOK, share: 1, count: 0 }], byBucket: new Map() },
  };
}

export function staffDraft(inp: StaffDraftInput): StaffDraft {
  const book = inp.book ?? contentBook();
  const skipped: string[] = [];
  const known = (id: string) => (inp.unit === 'offense' ? book.plays.has(id) : book.defense.has(id));
  const source = (inp.menu.length ? inp.menu : bookMenu(inp.unit, book)).filter((m) => m.side === inp.unit);
  const menu = source.filter((m) => { if (known(m.call.playId)) return true; skipped.push(`plan:${m.id}`); return false; });
  const byId = new Map(menu.map((m) => [m.id, m]));
  const situationIds = new Set(gp.CATALOGUE.filter((r) => r.situation !== null).map((r) => r.id));
  const kindOf = (id: string) => (inp.unit === 'offense' ? book.plays.get(id)!.kind : book.defense.get(id)!.coverageFamily);

  const calls: preparation.CallOption[] = menu.map((m) => {
    const sits = m.situationIds.filter((s) => situationIds.has(s));
    // A call chosen only for category boxes (shots, screens) gets no situation box; one chosen for nothing fits anywhere.
    const fits = m.situationIds.length === 0 ? null : sits;
    const k = kindOf(m.call.playId);
    return { callId: m.id, unit: inp.unit, conceptFamily: k, kind: k, tags: [...m.call.tags], fits, readiness: 1, carryOver: false, pairings: [] };
  });
  const est = inp.estimates ?? planOrderTable(inp.unit, menu.map((m) => m.id));
  const aiMenu: preparation.MenuEntry[] = menu.map((m, order) => ({ callId: m.id, source: 'standing', wrinkle: false, wrinkleTarget: null, value: -order, order, plannedSnaps: null }));
  const depth = preparation.prepDepth({ preparationZ: inp.preparationZ, evaluationZ: inp.evaluationZ ?? inp.preparationZ, tellHours: 0 });
  const ai = preparation.buildSheet({
    unit: inp.unit, gameId: 0, menu: aiMenu, calls, table: est.table, catalogue: catalogueDefs(inp.reference ?? gp.proReference2024()),
    shares: est.shares, sizeLimit: inp.sizeLimit ?? gp.param('size.sheetMin'), scriptSituations: SCRIPT_SITUATIONS,
  }, depth);

  const template = gp.offenseTemplate();
  const slotOf = new Map(template.boxes.filter((b) => b.catalogueRef !== null).map((b) => [b.catalogueRef!, b]));
  const boxes: gp.Box[] = [];
  for (const b of ai.boxes) {
    const slot = slotOf.get(b.situationId);
    if (!slot) { skipped.push(`box:${b.situationId}`); continue; }
    boxes.push({ ...slot, entries: [...b.entries].sort((x, y) => x.rank - y.rank).map((e, i) => ({ id: `${slot.id}.${i + 1}`, call: byId.get(e.callId)!.call })) });
  }
  // Category boxes (G7.2.2: shots, screens, play action ...): the plan's calls chosen for that category, in plan order.
  for (const slot of template.boxes) {
    if (slot.category === null || slot.category === 'script') continue;
    const chosen = menu.filter((m) => m.situationIds.includes(slot.catalogueRef ?? slot.id)).slice(0, gp.param('size.boxScanMax'));
    if (chosen.length) boxes.push({ ...slot, entries: chosen.map((m, i) => ({ id: `${slot.id}.${i + 1}`, call: m.call })) });
  }
  const used = new Set(boxes.map((b) => b.situationId).filter((s): s is string => s !== null));
  const script: gp.ScriptEntry[] = ai.script.map((s, i) => {
    const rule = gp.CATALOGUE_BY_ID.get(s.onlyIf)?.situation;
    return { id: `script.${i + 1}`, call: byId.get(s.callId)!.call, purpose: 'other', purposeText: 'staff script', ...(rule && rule.anyOf.length === 1 ? { onlyIf: rule.anyOf[0]!.all } : {}) };
  });
  const drafted: gp.Sheet = {
    ...gp.emptySheet(inp.unit, inp.gameId), situations: template.situations.filter((s) => used.has(s.id)), boxes: gp.withReadingOrder(boxes), script,
  };
  const { sheet, suggestions } = applyPreferences(drafted, inp.preferences ?? null);
  return { sheet, ai, suggestions, skipped };
}
