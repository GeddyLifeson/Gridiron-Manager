// Settings page model (G-98: O5.3.1). Builds the rows of the settings screen from the O5.3 schema so
// that every setting in the schema appears exactly once, with a label, a one-line explanation, its
// current value, whether it differs from the default, and why it cannot be changed (certified lock,
// fixed at creation). Holds no football logic and changes no result.
import { settings } from '@gm/app-services';
import TEXT from './text.json' with { type: 'json' };

type SettingDef = settings.SettingDef;
type SettingValue = settings.SettingValue;

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

/** Settings text by id with `{slot}` filled. An unknown id shows itself so a gap is visible (O6.6.1). */
export function sx(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}
export const settingsTextIds = (): string[] => Object.keys(STRINGS);

/** Screen order of the groups (O5.3.1 names Display, Audio, Controls, Gameplay, Accessibility, Privacy and data, Mods; playback and navigation are the G-04 store's extra groups). */
export const GROUP_ORDER: readonly settings.SettingGroup[] = ['display', 'audio', 'controls', 'playback', 'accessibility', 'gameplay', 'navigation', 'privacy', 'mods'];

export type LockReason = 'certified' | 'creation' | null;

export interface SettingRow {
  key: string;
  type: SettingDef['type'];
  scope: settings.SettingScope;
  label: string;
  help: string;
  value: SettingValue;
  isDefault: boolean;
  lock: LockReason;
  /** Enum options with display labels. */
  options?: { value: string; label: string }[];
  /** Number range. */
  range?: { min: number; max: number; step: number; unit: string };
  /** List and record settings show a count, edited on their own screens. */
  summary?: string;
}
export interface SettingGroupView { id: settings.SettingGroup; title: string; rows: SettingRow[] }

export interface PageContext {
  certified?: boolean;
  /** True once the career exists: settings fixed at creation show as fixed. */
  afterCreation?: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function lockOf(def: SettingDef, ctx: PageContext): LockReason {
  if (ctx.certified && def.lockedInCertified) return 'certified';
  if (def.scope === 'save' && ctx.afterCreation && def.fixedAtCreation) return 'creation';
  return null;
}

export function rowOf(def: SettingDef, value: SettingValue | undefined, ctx: PageContext = {}): SettingRow {
  const v = value === undefined ? def.default : value;
  const row: SettingRow = {
    key: def.key, type: def.type, scope: def.scope,
    label: sx(`label.${def.key}`), help: sx(def.help),
    value: v, isDefault: same(v, def.default), lock: lockOf(def, ctx),
  };
  if (def.type === 'enum') row.options = def.options.map((o) => ({ value: o, label: sx(`option.${o}`) }));
  if (def.type === 'number') row.range = { min: def.min, max: def.max, step: def.step, unit: def.unit };
  if (def.type === 'list') row.summary = sx('screen.items', { n: (v as string[]).length });
  if (def.type === 'record') row.summary = sx('screen.items', { n: Object.keys(v as object).length });
  return row;
}

/** Every setting of the schema, grouped in screen order. Each key appears once. */
export function settingsPage(values: Record<string, SettingValue>, ctx: PageContext = {}, defs: readonly SettingDef[] = settings.SETTINGS): SettingGroupView[] {
  const groups = new Map<settings.SettingGroup, SettingRow[]>(GROUP_ORDER.map((g) => [g, []]));
  for (const d of defs) {
    if (!groups.has(d.group)) groups.set(d.group, []);
    groups.get(d.group)!.push(rowOf(d, values[d.key], ctx));
  }
  return [...groups].filter(([, rows]) => rows.length > 0).map(([id, rows]) => ({ id, title: sx(`group.${id}`), rows }));
}

/** Turns a control's raw input (text from an input or select) into the setting's value type. */
export function parseInput(def: SettingDef, raw: string | boolean): SettingValue | undefined {
  switch (def.type) {
    case 'boolean': return typeof raw === 'boolean' ? raw : raw === 'true';
    case 'number': { const n = Number(raw); return Number.isFinite(n) ? n : undefined; }
    case 'enum': case 'string': return String(raw);
    default: return undefined;
  }
}

/**
 * The token theme a `display.theme` value draws with (O6.2.1, plan 2.1). `system` follows the platform's
 * light or dark preference; `classic` is the PV-18 Classic era skin. An unknown value falls back to system.
 */
export function themeForSetting(value: SettingValue | undefined, systemPrefersDark: boolean): 'light' | 'dark' | 'high-contrast' | 'classic' {
  if (value === 'light' || value === 'dark' || value === 'high-contrast' || value === 'classic') return value;
  return systemPrefersDark ? 'dark' : 'light';
}
