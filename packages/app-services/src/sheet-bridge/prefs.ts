// What the staff learn from the user's sheet edits (Marlon, 2026-11-26 07:08 UTC: "the staff should learn my
// preferences ... and they can have their own that they suggest to me"). Learning reads demonstrated behaviour
// only: each week the staff's draft is compared with the sheet the user locked, box by box. A call the user
// took out of a box counts against it there; a call he put in counts for it. Next week's draft follows the net
// count, and what the staff would still have placed is kept as their suggestion for the week's one-on-one
// (the meeting itself belongs to the meetings and week screens).
import type { gameplan as gp } from '@gm/football-content';
import { gameplan } from '@gm/football-content';

type Call = gp.Entry['call'];

export interface PrefRow {
  /** Sheet box id (the G7.2.2 catalogue id for a drafted box). */
  readonly boxId: string;
  readonly callKey: string;
  readonly call: Call;
  /** Weeks the user put this call in this box when the staff had not. */
  readonly added: number;
  /** Weeks the user took this call out of this box after the staff placed it. */
  readonly removed: number;
}

export interface Preferences {
  /** Weeks of edits learned from. */
  readonly weeks: number;
  readonly rows: readonly PrefRow[];
}

/** A staff idea for the one-on-one: a call they would place that the user's habits leave out. */
export interface Suggestion { readonly boxId: string; readonly call: Call; readonly callKey: string; readonly removedWeeks: number }

const rowKey = (boxId: string, key: string) => `${boxId}|${key}`;
const keysOf = (b: gp.Box | undefined) => new Map((b?.entries ?? []).map((e) => [gameplan.callKey(e.call), e.call] as const));

/** One week: the staff draft against the sheet the user locked. */
export function learnPreferences(prev: Preferences | null, draft: gp.Sheet, final: gp.Sheet): Preferences {
  const rows = new Map((prev?.rows ?? []).map((r) => [rowKey(r.boxId, r.callKey), { ...r }]));
  const bump = (boxId: string, key: string, call: Call, f: 'added' | 'removed') => {
    const k = rowKey(boxId, key);
    const r = rows.get(k) ?? { boxId, callKey: key, call, added: 0, removed: 0 };
    rows.set(k, { ...r, [f]: r[f] + 1 });
  };
  const finalBoxes = new Map(final.boxes.map((b) => [b.id, b]));
  const draftBoxes = new Map(draft.boxes.map((b) => [b.id, b]));
  for (const id of new Set([...draftBoxes.keys(), ...finalBoxes.keys()])) {
    const before = keysOf(draftBoxes.get(id));
    const after = keysOf(finalBoxes.get(id));
    for (const [k, c] of after) if (!before.has(k)) bump(id, k, c, 'added');
    for (const [k, c] of before) if (!after.has(k)) bump(id, k, c, 'removed');
  }
  const out = [...rows.values()].sort((a, b) => (a.boxId < b.boxId ? -1 : a.boxId > b.boxId ? 1 : a.callKey < b.callKey ? -1 : a.callKey > b.callKey ? 1 : 0));
  return { weeks: (prev?.weeks ?? 0) + 1, rows: out };
}

/**
 * A draft with the learned habits applied: a call with more weeks taken out than put in leaves the box (kept as
 * a staff suggestion); a call put in more than taken out joins the front of the box, most weeks first.
 */
export function applyPreferences(sheet: gp.Sheet, prefs: Preferences | null): { sheet: gp.Sheet; suggestions: Suggestion[] } {
  if (!prefs || prefs.rows.length === 0) return { sheet, suggestions: [] };
  const byBox = new Map<string, PrefRow[]>();
  for (const r of prefs.rows) byBox.set(r.boxId, [...(byBox.get(r.boxId) ?? []), r]);
  const suggestions: Suggestion[] = [];
  const boxes = sheet.boxes.map((b) => {
    const rs = byBox.get(b.id);
    if (!rs) return b;
    const net = new Map(rs.map((r) => [r.callKey, r]));
    const kept = b.entries.filter((e) => {
      const r = net.get(gameplan.callKey(e.call));
      if (r && r.removed > r.added) { suggestions.push({ boxId: b.id, call: e.call, callKey: r.callKey, removedWeeks: r.removed }); return false; }
      return true;
    });
    const have = new Set(kept.map((e) => gameplan.callKey(e.call)));
    const adds = rs.filter((r) => r.added > r.removed && !have.has(r.callKey)).sort((x, y) => (y.added - y.removed) - (x.added - x.removed) || (x.callKey < y.callKey ? -1 : 1));
    const front = adds.map((r, i) => ({ id: `${b.id}.u${i + 1}`, call: r.call }));
    return { ...b, entries: [...front, ...kept] };
  });
  return { sheet: { ...sheet, boxes }, suggestions };
}
