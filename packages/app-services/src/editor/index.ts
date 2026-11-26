// Shared editor core (O3.7.1): every planning editor works on a draft with undo and redo, autosave on every
// change, deliberate publishing and a version history. Pure and generic: an edit is a function
// (value, edit) => value supplied by the editor (play designer G-90, defensive call designer G-91, plans,
// sheets). Values are kept as canonical JSON text, so undo returns a byte-identical earlier state
// (O3.7.1 acceptance 1) and a value can be saved and reloaded exactly. Hours (O3.7.2) and the save itself
// (P5) are the caller's: this module only says what changed.

/** O3.7.1: "at least 200 steps". */
export const PARAMS = { module: 'app.editor', version: '1', undoSteps: 200 } as const;

/** One published version: its number, the caller's label (a date string from the game calendar) and the value. */
export interface Version { readonly n: number; readonly label: string; readonly json: string }

export interface Draft<T> {
  readonly id: string;
  /** Current draft value as canonical JSON. */
  readonly json: string;
  readonly past: readonly string[];
  readonly future: readonly string[];
  readonly versions: readonly Version[];
  /** Number of the version the draft was last published as or restored from; 0 when never published. */
  readonly base: number;
  /** Type witness only. */
  readonly _t?: T;
}

/** Canonical JSON: object keys sorted, so equal values give equal bytes. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

export function createDraft<T>(id: string, value: T, versions: readonly Version[] = []): Draft<T> {
  return { id, json: canonical(value), past: [], future: [], versions, base: versions.length > 0 ? versions[versions.length - 1]!.n : 0 };
}

export function valueOf<T>(d: Draft<T>): T {
  return JSON.parse(d.json) as T;
}

/** Apply one edit. An edit that changes nothing adds no undo step. The redo list is cleared. */
export function apply<T, E>(d: Draft<T>, edit: E, reduce: (value: T, edit: E) => T, undoSteps: number = PARAMS.undoSteps): Draft<T> {
  const next = canonical(reduce(valueOf(d), edit));
  if (next === d.json) return d;
  const past = [...d.past, d.json];
  while (past.length > undoSteps) past.shift();
  return { ...d, json: next, past, future: [] };
}

export function canUndo(d: Draft<unknown>): boolean { return d.past.length > 0; }
export function canRedo(d: Draft<unknown>): boolean { return d.future.length > 0; }

export function undo<T>(d: Draft<T>): Draft<T> {
  if (d.past.length === 0) return d;
  const prev = d.past[d.past.length - 1]!;
  return { ...d, json: prev, past: d.past.slice(0, -1), future: [d.json, ...d.future] };
}

export function redo<T>(d: Draft<T>): Draft<T> {
  if (d.future.length === 0) return d;
  const next = d.future[0]!;
  return { ...d, json: next, past: [...d.past, d.json], future: d.future.slice(1) };
}

/** True when the draft differs from the version it was based on (or was never published). */
export function isDirty(d: Draft<unknown>): boolean {
  const base = d.versions.find((v) => v.n === d.base);
  return base === undefined || base.json !== d.json;
}

/**
 * Publish the draft as the live version (O3.7.1). Publishing is never blocked by a rule failure; the caller
 * refuses only what the engine cannot run, by passing `refuse` (for example a call with twelve slots).
 */
export function publish<T>(d: Draft<T>, label: string, refuse?: (value: T) => string | null): { draft: Draft<T>; published: Version | null; refusedBecause: string | null } {
  const why = refuse ? refuse(valueOf(d)) : null;
  if (why !== null) return { draft: d, published: null, refusedBecause: why };
  const n = (d.versions.length > 0 ? d.versions[d.versions.length - 1]!.n : 0) + 1;
  const v: Version = { n, label, json: d.json };
  return { draft: { ...d, versions: [...d.versions, v], base: n }, published: v, refusedBecause: null };
}

/** Restore a published version into the draft; it is one undoable step. */
export function restore<T>(d: Draft<T>, n: number): Draft<T> {
  const v = d.versions.find((x) => x.n === n);
  if (v === undefined) throw new Error(`editor: no version ${n} in draft ${d.id}`);
  if (v.json === d.json) return { ...d, base: n };
  const past = [...d.past, d.json];
  while (past.length > PARAMS.undoSteps) past.shift();
  return { ...d, json: v.json, past, future: [], base: n };
}

/** The live (published) value the simulation reads, or null before the first publish (O3.7.1: only published objects are simulated). */
export function live<T>(d: Draft<T>): T | null {
  const v = d.versions[d.versions.length - 1];
  return v === undefined ? null : (JSON.parse(v.json) as T);
}

/** Keys of top-level fields that differ between two values: the "new teaching" list on publishing a changed installed object (G5). */
export function changedFields(before: unknown, after: unknown): string[] {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((k) => canonical(a[k]) !== canonical(b[k]));
}
