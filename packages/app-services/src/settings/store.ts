// The settings store (O5.3.1). One validated place with three scopes:
//   user    - a settings file per user (desktop settings folder, browser storage on the web)
//   save    - a settings block in each save header (rule set, content packs, certified flag)
//   session - temporary view states, never written
// Unknown keys in a stored file are kept and written back, so a downgrade loses nothing. A corrupt
// file is set aside under another name and defaults are loaded, with a notice.
import { SETTINGS, SETTINGS_BY_KEY, checkValue, defaultValues, type SettingDef, type SettingScope, type SettingValue } from './schema.ts';

export const SETTINGS_FILE_FORMAT = 'gm-settings';
export const SETTINGS_FILE_VERSION = 1;

/** Where the user-scope file lives. Shells implement it; `memorySettingsBackend` serves tests and headless runs. */
export interface SettingsBackend {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  /** Keeps a corrupt file under another name so the user can recover it. */
  setAside(text: string): Promise<void>;
}

export interface SettingsNotice { kind: 'corrupt-file' | 'invalid-value' | 'newer-file'; key?: string; message: string }

export interface ParsedSettings {
  values: Record<string, SettingValue>;
  /** Keys this build does not know, kept as stored. */
  unknown: Record<string, unknown>;
  notices: SettingsNotice[];
  corrupt: boolean;
}

/** Reads a user settings file. Never throws: anything unreadable falls back to defaults with a notice. */
export function parseSettingsFile(text: string | null): ParsedSettings {
  const values = defaultValues('user');
  const out: ParsedSettings = { values, unknown: {}, notices: [], corrupt: false };
  if (text === null || text.trim() === '') return out;
  let doc: unknown;
  try { doc = JSON.parse(text); } catch { doc = undefined; }
  const d = doc as { format?: unknown; version?: unknown; values?: unknown } | undefined;
  if (!d || typeof d !== 'object' || d.format !== SETTINGS_FILE_FORMAT || !d.values || typeof d.values !== 'object' || Array.isArray(d.values)) {
    out.corrupt = true;
    out.notices.push({ kind: 'corrupt-file', message: 'The settings file could not be read. It was kept under another name and the defaults were loaded.' });
    return out;
  }
  if (typeof d.version === 'number' && d.version > SETTINGS_FILE_VERSION) {
    out.notices.push({ kind: 'newer-file', message: `The settings file was written by a newer build (format ${d.version}). Settings this build does not know are kept.` });
  }
  for (const [key, raw] of Object.entries(d.values as Record<string, unknown>)) {
    const def = SETTINGS_BY_KEY.get(key);
    if (!def || def.scope !== 'user') { out.unknown[key] = raw; continue; }
    const why = checkValue(def, raw);
    if (why) { out.notices.push({ kind: 'invalid-value', key, message: `${why}. The default was loaded.` }); continue; }
    values[key] = structuredClone(raw) as SettingValue;
  }
  return out;
}

/** Writes the user file: known values that differ from their default, plus every unknown key. */
export function serializeSettings(values: Record<string, SettingValue>, unknown: Record<string, unknown> = {}): string {
  const stored: Record<string, unknown> = { ...unknown };
  for (const def of SETTINGS) {
    if (def.scope !== 'user') continue;
    const val = values[def.key];
    if (val !== undefined && JSON.stringify(val) !== JSON.stringify(def.default)) stored[def.key] = val;
  }
  const sorted = Object.fromEntries(Object.keys(stored).sort().map((k) => [k, stored[k]]));
  return JSON.stringify({ format: SETTINGS_FILE_FORMAT, version: SETTINGS_FILE_VERSION, values: sorted }, null, 2) + '\n';
}

/** The save-scope block written to a save header (O5.3.1) and shown on the load screen. */
export type SaveSettingsBlock = Record<string, SettingValue>;

export function makeSaveBlock(input: Partial<SaveSettingsBlock> = {}): { block: SaveSettingsBlock; problems: string[] } {
  const block = defaultValues('save');
  const problems: string[] = [];
  for (const [key, raw] of Object.entries(input)) {
    const def = SETTINGS_BY_KEY.get(key);
    if (!def || def.scope !== 'save') { problems.push(`${key} is not a save setting`); continue; }
    const why = checkValue(def, raw);
    if (why) problems.push(why); else block[key] = structuredClone(raw) as SettingValue;
  }
  return { block, problems };
}

export interface SettingChange { key: string; scope: SettingScope; from: SettingValue; to: SettingValue; group: SettingDef['group'] }
export type SetResult = { ok: true; change: SettingChange | null } | { ok: false; reason: string };

export interface SetContext {
  /** The open career is certified: settings marked `lockedInCertified` refuse changes (N4). */
  certified?: boolean;
  /** Changing a save setting after creation. Settings fixed at creation refuse. */
  afterCreation?: boolean;
}

/**
 * The store held by a running app. Save-scope changes come back as a `SettingChange` so the caller
 * writes them to the save header and, mid-season, to the decision log (O5.3.1 acceptance 2).
 */
export class SettingsStore {
  private values: Record<string, SettingValue>;
  private unknown: Record<string, unknown>;
  private listeners = new Set<(c: SettingChange) => void>();

  private constructor(private readonly backend: SettingsBackend, parsed: ParsedSettings, save: SaveSettingsBlock) {
    this.values = { ...parsed.values, ...save, ...defaultValues('session') };
    this.unknown = parsed.unknown;
  }

  static async open(backend: SettingsBackend, save: SaveSettingsBlock = defaultValues('save')): Promise<{ store: SettingsStore; notices: SettingsNotice[] }> {
    const text = await backend.read();
    const parsed = parseSettingsFile(text);
    if (parsed.corrupt && text !== null) { await backend.setAside(text); await backend.write(serializeSettings(parsed.values)); }
    return { store: new SettingsStore(backend, parsed, save), notices: parsed.notices };
  }

  get<T extends SettingValue = SettingValue>(key: string): T {
    if (!SETTINGS_BY_KEY.has(key)) throw new Error(`unknown setting ${key}`);
    return structuredClone(this.values[key]) as T;
  }

  /** Every current value, all scopes. */
  all(): Record<string, SettingValue> { return structuredClone(this.values); }

  saveBlock(): SaveSettingsBlock {
    const out: SaveSettingsBlock = {};
    for (const d of SETTINGS) if (d.scope === 'save') out[d.key] = structuredClone(this.values[d.key]!);
    return out;
  }

  onChange(fn: (c: SettingChange) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  async set(key: string, value: unknown, ctx: SetContext = {}): Promise<SetResult> {
    const def = SETTINGS_BY_KEY.get(key);
    if (!def) return { ok: false, reason: `unknown setting ${key}` };
    if (ctx.certified && def.lockedInCertified) return { ok: false, reason: `${key} is locked in a certified career` };
    if (def.scope === 'save' && ctx.afterCreation && def.fixedAtCreation) return { ok: false, reason: `${key} is fixed when the career is created` };
    const why = checkValue(def, value);
    if (why) return { ok: false, reason: why };
    const from = this.values[key]!;
    if (JSON.stringify(from) === JSON.stringify(value)) return { ok: true, change: null };
    const to = structuredClone(value) as SettingValue;
    this.values[key] = to;
    const change: SettingChange = { key, scope: def.scope, from, to, group: def.group };
    if (def.scope === 'user') await this.backend.write(serializeSettings(this.values, this.unknown));
    for (const fn of this.listeners) fn(change);
    return { ok: true, change };
  }

  async reset(key: string, ctx: SetContext = {}): Promise<SetResult> {
    const def = SETTINGS_BY_KEY.get(key);
    if (!def) return { ok: false, reason: `unknown setting ${key}` };
    return this.set(key, structuredClone(def.default), ctx);
  }
}

export function memorySettingsBackend(initial: string | null = null): SettingsBackend & { text: string | null; asideText: string[] } {
  const b = {
    text: initial,
    asideText: [] as string[],
    async read() { return b.text; },
    async write(t: string) { b.text = t; },
    async setAside(t: string) { b.asideText.push(t); },
  };
  return b;
}

/** A backend over any storage with getItem and setItem (browser local storage in the web shell). */
export function keyValueSettingsBackend(storage: { getItem(k: string): string | null; setItem(k: string, v: string): void }, key = 'gm.settings'): SettingsBackend {
  return {
    async read() { return storage.getItem(key); },
    async write(t) { storage.setItem(key, t); },
    async setAside(t) { storage.setItem(`${key}.corrupt`, t); },
  };
}
