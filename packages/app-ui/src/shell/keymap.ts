// The key map (O5.2.1, O5.2.2). Every binding is data so it can be shown, remapped and tested.
// Overrides are stored as differences from the default, keyed `context|action`, so new default
// actions in later versions appear without breaking a profile.
import KEYMAP_FILE from './keymap.default.json';

export interface Binding { context: string; action: string; keys: string[]; device: 'keyboard'; note?: string }
export interface KeyMapFile { contexts: string[]; bindings: Binding[] }

export const DEFAULT_KEYMAP = KEYMAP_FILE as unknown as KeyMapFile;
export const KEY_CONTEXTS: readonly string[] = DEFAULT_KEYMAP.contexts;
/** Stored override form: `{ "global|palette.open": ["KeyK"] }`. */
export type KeyOverrides = Record<string, string[]>;

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

/** The minimal shape of a keyboard event the shell reads. */
export interface KeyInput { code: string; key?: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean }

/** `Shift+Slash` from a key event. Modifier keys alone give an empty chord. */
export function chordOf(e: KeyInput): string {
  if (/^(Shift|Control|Alt|Meta)(Left|Right)?$/.test(e.code)) return '';
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean) as string[];
  return [...mods, e.code].join('+');
}

/** Puts modifiers in the fixed order so `Shift+Ctrl+KeyA` and `Ctrl+Shift+KeyA` are one chord. */
export function normaliseChord(chord: string): string {
  const parts = chord.split('+');
  const code = parts.pop()!;
  const mods = MOD_ORDER.filter((m) => parts.includes(m));
  return [...mods, code].join('+');
}

export interface KeyMapProblem { context: string; action: string; message: string }

/** Two actions in one context may not share a key (O5.2.1 edge case). */
export function findCollisions(bindings: readonly Binding[]): KeyMapProblem[] {
  const out: KeyMapProblem[] = [];
  const seen = new Map<string, string>();
  for (const b of bindings) for (const k of b.keys) {
    const id = `${b.context}|${normaliseChord(k)}`;
    const first = seen.get(id);
    if (first && first !== b.action) out.push({ context: b.context, action: b.action, message: `${k} is already bound to ${first}` });
    else seen.set(id, b.action);
  }
  return out;
}

/** Applies stored overrides. Unknown actions are ignored and reported (O5.2.2 edge case). */
export function applyOverrides(overrides: KeyOverrides = {}, base: readonly Binding[] = DEFAULT_KEYMAP.bindings): { bindings: Binding[]; problems: KeyMapProblem[] } {
  const bindings = base.map((b) => ({ ...b, keys: [...b.keys] }));
  const problems: KeyMapProblem[] = [];
  for (const [id, keys] of Object.entries(overrides)) {
    const [context = '', action = ''] = id.split('|');
    const b = bindings.find((x) => x.context === context && x.action === action);
    if (!b || !Array.isArray(keys)) { problems.push({ context, action, message: 'unknown action in the key profile; row ignored' }); continue; }
    b.keys = keys.map(normaliseChord);
  }
  const clashes = findCollisions(bindings);
  return { bindings, problems: [...problems, ...clashes] };
}

/** The remap editor: refuses a key already used in the context and names the action holding it. */
export function rebind(overrides: KeyOverrides, context: string, action: string, keys: string[], base: readonly Binding[] = DEFAULT_KEYMAP.bindings): { ok: true; overrides: KeyOverrides } | { ok: false; reason: string } {
  const { bindings } = applyOverrides(overrides, base);
  if (!bindings.some((b) => b.context === context && b.action === action)) return { ok: false, reason: `no action ${action} in ${context}` };
  for (const k of keys.map(normaliseChord)) {
    const holder = bindings.find((b) => b.context === context && b.action !== action && b.keys.map(normaliseChord).includes(k));
    if (holder) return { ok: false, reason: `${k} is already bound to ${holder.action}` };
  }
  const next = { ...overrides };
  const def = base.find((b) => b.context === context && b.action === action)!;
  const same = def.keys.map(normaliseChord).join(' ') === keys.map(normaliseChord).join(' ');
  if (same) delete next[`${context}|${action}`]; else next[`${context}|${action}`] = keys.map(normaliseChord);
  return { ok: true, overrides: next };
}

/**
 * The action a chord triggers. `contexts` runs outermost first; the innermost context that binds
 * the chord wins.
 */
export function actionFor(chord: string, contexts: readonly string[], bindings: readonly Binding[]): string | undefined {
  const c = normaliseChord(chord);
  for (let i = contexts.length - 1; i >= 0; i--) {
    const hit = bindings.find((b) => b.context === contexts[i] && b.keys.some((k) => normaliseChord(k) === c));
    if (hit) return hit.action;
  }
  return undefined;
}

/** Every binding active under the context stack, innermost first, with shadowed keys removed (O1.3.1 acceptance 2). */
export function activeBindings(contexts: readonly string[], bindings: readonly Binding[]): Binding[] {
  const taken = new Set<string>();
  const out: Binding[] = [];
  for (let i = contexts.length - 1; i >= 0; i--) {
    for (const b of bindings.filter((x) => x.context === contexts[i])) {
      const keys = b.keys.map(normaliseChord).filter((k) => !taken.has(k));
      keys.forEach((k) => taken.add(k));
      if (keys.length) out.push({ ...b, keys });
    }
  }
  return out;
}

/** A chord as the user reads it: `Shift+Slash` -> `Shift+/`, `KeyT` -> `T`, `Digit1` -> `1`. */
export function displayChord(chord: string): string {
  const named: Record<string, string> = { Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Escape: 'Esc', ArrowLeft: 'Left', ArrowRight: 'Right', Space: 'Space', Backspace: 'Backspace', Enter: 'Enter', Tab: 'Tab' };
  if (chord === 'Shift+Slash') return '?';
  return chord.split('+').map((p) => named[p] ?? p.replace(/^Key/, '').replace(/^Digit/, '')).join('+');
}
