// Keys page (G-98: O5.2.1, O5.2.2). Lists every action by context with its key, searches by action
// or key, remaps by capturing a key press, and handles profiles: the built-in default and "left hand
// only" profiles, plus export and import of a profile file. Overrides stay differences from the
// default (G-04 keymap.ts), so new default actions in later versions appear without breaking a
// profile. Keys never change football, so certified games allow any key map (O5.2.2).
import {
  DEFAULT_KEYMAP, KEY_CONTEXTS, applyOverrides, chordOf, displayChord, findCollisions, normaliseChord, rebind,
  type Binding, type KeyInput, type KeyMapProblem, type KeyOverrides,
} from '../../shell/keymap.ts';
import { t as shellText } from '../../shell/text.ts';
import { sx } from './model.ts';

export interface KeyRow {
  context: string;
  contextLabel: string;
  action: string;
  actionLabel: string;
  /** Normalised chords. */
  keys: string[];
  /** Chords as the user reads them. */
  display: string[];
  isDefault: boolean;
  noDefault: boolean;
}

/** The action's readable name (settings text `act.<action>`; hubs name their hub from the shell text), else the id. */
export function actionLabel(_context: string, action: string): string {
  if (action.startsWith('hub.')) return sx('act.hub', { hub: shellText(`hub.${action.slice(4)}`) });
  return sx(`act.${action}`);
}

export function keyRows(overrides: KeyOverrides = {}, base: readonly Binding[] = DEFAULT_KEYMAP.bindings): KeyRow[] {
  const { bindings } = applyOverrides(overrides, base);
  const order = new Map(KEY_CONTEXTS.map((c, i) => [c, i]));
  return bindings
    .map((b) => ({
      context: b.context, contextLabel: sx(`context.${b.context}`),
      action: b.action, actionLabel: actionLabel(b.context, b.action),
      keys: b.keys.map(normaliseChord), display: b.keys.map((k) => displayChord(normaliseChord(k))),
      isDefault: !(`${b.context}|${b.action}` in overrides),
      noDefault: (base.find((x) => x.context === b.context && x.action === b.action)?.keys.length ?? 0) === 0,
    }))
    .sort((a, b) => (order.get(a.context) ?? 99) - (order.get(b.context) ?? 99));
}

/**
 * Search by action or by key (O5.2.1). A query matches the action id, its label, the context, or a
 * key in either form (`KeyT`, `T`, `Shift+/`). Case does not matter.
 */
export function searchKeys(rows: readonly KeyRow[], query: string): KeyRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) =>
    r.action.toLowerCase().includes(q) || r.actionLabel.toLowerCase().includes(q) || r.contextLabel.toLowerCase().includes(q) ||
    r.keys.some((k) => k.toLowerCase() === q) || r.display.some((k) => k.toLowerCase() === q));
}

/** Remap capture: the next non-modifier key press becomes the action's key. Escape cancels. */
export type CaptureResult =
  | { kind: 'waiting' }
  | { kind: 'cancelled' }
  | { kind: 'refused'; reason: string; chord: string }
  | { kind: 'bound'; chord: string; overrides: KeyOverrides };

export function captureKey(overrides: KeyOverrides, context: string, action: string, e: KeyInput, base: readonly Binding[] = DEFAULT_KEYMAP.bindings): CaptureResult {
  const chord = chordOf(e);
  if (chord === '') return { kind: 'waiting' };
  if (chord === 'Escape') return { kind: 'cancelled' };
  const r = rebind(overrides, context, action, [chord], base);
  if (!r.ok) return { kind: 'refused', reason: r.reason, chord };
  return { kind: 'bound', chord: normaliseChord(chord), overrides: r.overrides };
}

/** Puts one action back to its default key. */
export function resetKey(overrides: KeyOverrides, context: string, action: string): KeyOverrides {
  const next = { ...overrides };
  delete next[`${context}|${action}`];
  return next;
}

// ---- Profiles (O5.2.2) ----

export const KEY_PROFILE_FORMAT = 'gm-key-profile';
export const KEY_PROFILE_VERSION = 1;

const CONSOLES = ['console.offense', 'console.defense', 'console.special'] as const;

/**
 * "Left hand only" (O5.2.2): every action the default puts under the right hand moves to the left
 * half of the keyboard, so the right hand can stay on the mouse. Entries 6 to 0 become Shift with 1 to
 * 5; confirm moves to Space and clear to Q. The key choices are a design choice (no bible values);
 * the collision test proves the result is legal in every context.
 */
function leftHandOverrides(): KeyOverrides {
  const o: KeyOverrides = {};
  const shifted = ['Shift+Digit1', 'Shift+Digit2', 'Shift+Digit3', 'Shift+Digit4', 'Shift+Digit5'];
  ['hub.film', 'hub.people', 'hub.league', 'hub.coach', 'hub.school'].forEach((a, i) => { o[`global|${a}`] = [shifted[i]!]; });
  o['global|palette.open'] = ['KeyE'];
  o['global|help.keys'] = ['Shift+F1'];
  o['global|nav.history_back'] = ['Alt+KeyA'];
  o['global|nav.history_forward'] = ['Alt+KeyD'];
  for (const c of CONSOLES) {
    ['call.entry_6', 'call.entry_7', 'call.entry_8', 'call.entry_9', 'call.entry_0'].forEach((a, i) => { o[`${c}|${a}`] = [shifted[i]!]; });
    o[`${c}|call.confirm`] = ['Space'];
    o[`${c}|call.clear`] = ['KeyQ'];
    o[`${c}|playbook.search`] = ['KeyE'];
    o[`${c}|playback.replay_once`] = ['KeyX'];
  }
  o['console.offense|call.motion_tag'] = ['KeyV'];
  o['console.offense|call.protection_tag'] = ['KeyA'];
  o['console.offense|call.tempo_cycle'] = ['KeyZ'];
  o['console.offense|call.cadence_cycle'] = ['KeyW'];
  o['console.offense|call.relay_cycle'] = ['Shift+KeyW'];
  o['console.offense|call.precommit_cycle'] = ['KeyD'];
  return o;
}

export const BUILTIN_PROFILES: Readonly<Record<string, KeyOverrides>> = {
  'default': {},
  'left-hand': leftHandOverrides(),
};

export interface KeyProfileFile { format: string; version: number; name: string; overrides: KeyOverrides }

/** A profile as a single file with a version header (O5.6.1 export rule). */
export function exportProfile(name: string, overrides: KeyOverrides): string {
  const sorted = Object.fromEntries(Object.keys(overrides).sort().map((k) => [k, overrides[k]!.map(normaliseChord)]));
  return JSON.stringify({ format: KEY_PROFILE_FORMAT, version: KEY_PROFILE_VERSION, name, overrides: sorted } satisfies KeyProfileFile, null, 2) + '\n';
}

export type ImportResult =
  | { ok: true; name: string; overrides: KeyOverrides; skipped: KeyMapProblem[] }
  | { ok: false; reason: string };

/**
 * Reads a profile file. Rows naming an unknown action are ignored and reported (O5.2.2 edge case).
 * A profile whose keys collide within a context is refused whole, naming the first clash.
 */
export function importProfile(textIn: string, base: readonly Binding[] = DEFAULT_KEYMAP.bindings): ImportResult {
  let doc: unknown;
  try { doc = JSON.parse(textIn); } catch { return { ok: false, reason: 'the file is not a key profile' }; }
  const d = doc as Partial<KeyProfileFile> | null;
  if (!d || typeof d !== 'object' || d.format !== KEY_PROFILE_FORMAT || !d.overrides || typeof d.overrides !== 'object' || Array.isArray(d.overrides)) {
    return { ok: false, reason: 'the file is not a key profile' };
  }
  const name = typeof d.name === 'string' && d.name.length > 0 ? d.name.slice(0, 64) : 'imported';
  const known = new Set(base.map((b) => `${b.context}|${b.action}`));
  const overrides: KeyOverrides = {};
  const skipped: KeyMapProblem[] = [];
  for (const [id, keys] of Object.entries(d.overrides)) {
    const [context = '', action = ''] = id.split('|');
    if (!known.has(id) || !Array.isArray(keys) || !keys.every((k) => typeof k === 'string')) {
      skipped.push({ context, action, message: 'unknown action in the key profile; row ignored' });
      continue;
    }
    overrides[id] = (keys as string[]).map(normaliseChord);
  }
  const clash = applyOverrides(overrides, base).problems.find((p) => p.message.includes('already bound'));
  if (clash) return { ok: false, reason: `${clash.context}: ${clash.message}` };
  return { ok: true, name, overrides, skipped };
}

/** Problems in a key map: collisions in any context (the O5.2.1 validation test). */
export function keyMapProblems(overrides: KeyOverrides = {}): KeyMapProblem[] {
  return findCollisions(applyOverrides(overrides).bindings);
}
