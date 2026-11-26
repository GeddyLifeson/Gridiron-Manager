// In-game playbook search and play drawing (I2.3, O2.4: "they have some plays and then they have some routes and
// sometimes they design plays in the game"). The caller searches the whole sheet and the rest of the week's game
// plan, and may draw a new call on the sideline from an installed play: flip its strength, set the run side, add
// route and protection tags the play already carries. Nothing new is invented: only installed pieces combine.
// A drawn call was never repped as a whole, so the staff marks it "shaky" (G5.4.1), and it is not on the
// wristband or the signal board: it goes in by radio or messenger. The call lands in the sheet's "Drawn in
// game" box and is selected, ready to send. Pure: the host passes the time and the new entry id.
import { playClockAt, type ConsoleState, type StepResult } from './console.ts';
import type { CallSheet, SheetEntry, SheetKeys, TagDef, Unit } from './sheet.ts';

export const IN_GAME_BOX = 'in_game';
/** Never matches a situation: the box opens by selection only, so it never takes the automatic focus. */
const MANUAL_ONLY = { downs: [] as number[] };

/** Every call the caller can reach in game for a unit, once each: the sheet's boxes first, in sheet order, then the plan pool. */
export function reachableCalls(s: ConsoleState, unit: Unit): { readonly entry: SheetEntry; readonly boxId: string | null }[] {
  const sheet = s.cfg.sheets[unit];
  const out: { entry: SheetEntry; boxId: string | null }[] = [];
  const seen = new Set<string>();
  for (const b of sheet?.boxes ?? []) for (const e of b.entries) { if (seen.has(e.label)) continue; out.push({ entry: e, boxId: b.id }); seen.add(e.label); }
  for (const e of s.cfg.pool?.[unit] ?? []) if (!seen.has(e.label)) out.push({ entry: e, boxId: null });
  return out;
}

/** Search by words in the call as the coach says it: every word typed must appear (O3.3.1 text filter). */
export function searchCalls(s: ConsoleState, unit: Unit, text: string): { readonly entry: SheetEntry; readonly boxId: string | null }[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return reachableCalls(s, unit).filter((x) => { const l = x.entry.label.toLowerCase(); return words.every((w) => l.includes(w)); });
}

export interface DrawSpec {
  /** New entry id from the host, so replays are identical. */
  readonly id: string;
  /** Tag ids from the base call's own tags (route, protection, motion, flip). One per group. */
  readonly tagIds?: readonly string[];
  readonly strength?: 'left' | 'right' | 'field' | 'boundary' | null;
  readonly runDirection?: 'left' | 'middle' | 'right' | null;
  /** The name the coach gives it; default the base call plus its tags. */
  readonly label?: string;
}

export type DrawResult = { readonly ok: true; readonly entry: SheetEntry } | { readonly ok: false; readonly refusal: string };

/** Draw a call from an installed one (first rule: installed pieces only). */
export function drawCall(base: SheetEntry, spec: DrawSpec): DrawResult {
  if (base.readiness === 'not_installed') return { ok: false, refusal: 'only installed plays can be drawn from in a game' };
  const picked: TagDef[] = [];
  for (const id of spec.tagIds ?? []) {
    const t = base.tags.find((x) => x.id === id);
    if (!t) return { ok: false, refusal: `${base.label} has no tag ${id}` };
    if (!t.installed) return { ok: false, refusal: `${t.label} is not installed` };
    if (picked.some((p) => p.group === t.group)) return { ok: false, refusal: `${t.label} conflicts with ${picked.find((p) => p.group === t.group)!.label}` };
    picked.push(t);
  }
  let call = base.call;
  if (call.unit === 'offense') {
    call = {
      ...call,
      tags: [...call.tags, ...picked.map((t) => t.id)],
      ...(spec.strength !== undefined ? { strength: spec.strength } : {}),
      ...(spec.runDirection !== undefined ? { runDirection: spec.runDirection } : {}),
    };
  } else if (picked.length || spec.strength !== undefined || spec.runDirection !== undefined) {
    return { ok: false, refusal: 'only offensive calls take drawn tags, strength or run side' };
  }
  const extra = [spec.strength ? `${spec.strength}` : null, spec.runDirection ? `run ${spec.runDirection}` : null, ...picked.map((t) => t.label)].filter(Boolean).join(' ');
  const label = spec.label?.trim() || (extra ? `${base.label} ${extra}` : base.label);
  return {
    ok: true,
    entry: {
      ...base, id: spec.id, label, call,
      spokenTenths: base.spokenTenths + picked.reduce((n, t) => n + t.spokenTenths, 0),
      // Drawn on the sideline: never repped as a whole (G5.4.1). A plain copy of a pool call keeps its estimate.
      readiness: picked.length || spec.strength !== undefined || spec.runDirection !== undefined ? 'shaky' : base.readiness,
      tags: base.tags.filter((t) => !picked.some((p) => p.group === t.group)),
      onBand: false, signal: false,
    },
  };
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => `Digit${d}`);

function withEntry(sheet: CallSheet, entry: SheetEntry): CallSheet {
  const box = sheet.boxes.find((b) => b.id === IN_GAME_BOX);
  if (box) return { ...sheet, boxes: sheet.boxes.map((b) => (b.id === IN_GAME_BOX ? { ...b, entries: [...b.entries, entry] } : b)) };
  const row = sheet.boxes.reduce((m, b) => Math.max(m, b.row), -1) + 1;
  return { ...sheet, boxes: [...sheet.boxes, { id: IN_GAME_BOX, title: 'Drawn in game', row, col: 0, rule: MANUAL_ONLY, entries: [entry] }] };
}

function withKey(keys: SheetKeys | undefined, sheet: CallSheet, entry: SheetEntry): SheetKeys {
  const n = sheet.boxes.find((b) => b.id === IN_GAME_BOX)!.entries.length - 1;
  const k = keys ?? { box: {}, entry: {} };
  return { box: k.box, entry: n < DIGITS.length ? { ...k.entry, [entry.id]: DIGITS[n]! } : k.entry };
}

/**
 * Put a call on the sheet's "Drawn in game" box (adding the box the first time) and select it when the console
 * is open on that unit. It does not send: the caller still confirms, on the running play clock.
 */
export function addInGameCall(s: ConsoleState, unit: Unit, entry: SheetEntry, atMs: number): StepResult {
  const sheet = s.cfg.sheets[unit];
  if (!sheet) return { state: { ...s, notice: 'console.noSheet' }, commands: [], handled: false };
  if (sheet.boxes.some((b) => b.entries.some((e) => e.id === entry.id))) return { state: s, commands: [], handled: false };
  const next = withEntry(sheet, entry);
  const cfg = { ...s.cfg, sheets: { ...s.cfg.sheets, [unit]: next }, keys: { ...s.cfg.keys, [unit]: withKey(s.cfg.keys[unit], next, entry) } };
  let st: ConsoleState = { ...s, cfg, nowMs: Math.max(s.nowMs, atMs), log: [...s.log, { atMs, playClockTenths: s.open ? playClockAt(s, atMs) : 0, what: 'drawn_call', detail: entry.id }] };
  if (st.open && st.open.unit === unit && st.step === 'select') {
    st = { ...st, selected: { unit, boxId: IN_GAME_BOX, entryId: entry.id }, focus: { boxId: IN_GAME_BOX, how: 'rule', empty: false }, tags: [], preTags: [], pendingBox: null, boxPrefix: null, notice: 'console.drawnCall' };
  }
  return { state: st, commands: [], handled: true };
}
