// The ui folder (P4.5.1) and its build-time checks: every screen's read-model keys exist; every action
// has at most one default key per context; every colour pair used for text meets the contrast rule;
// every rung has a row in rung_defaults. Record fields follow P3.6.1.
import { Level } from '@gm/schema';
import { envelopeKind, parseShape, type KindDef, type KindRegistry } from './kinds.ts';
import { anyOf, arr, bool, int, nul, obj, oneOf, opt, record, str, type Shape } from './shape.ts';
import type { ContentSet, Problem } from './types.ts';

/**
 * Text contrast (O5.5: "at least 4.5 to 1 in every theme", WCAG 2.2 SC 1.4.3 Level AA: 4.5:1 normal
 * text, 3:1 large text; status Verified in O5.5 by three sources).
 */
export const CONTRAST_NORMAL = 4.5;
export const CONTRAST_LARGE = 3;

/** Career rungs 0 to 9 (S1.1.1 job record, from E2.1.1) and the two levels. */
export const RUNGS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const LEVELS: readonly Level[] = Level.options;

const Hex = /^#[0-9a-fA-F]{6}$/;
const LevelShape = oneOf(Level.options);

export interface ScreenRecord {
  readonly id: string; readonly titleKey: string; readonly hub: string; readonly route: string; readonly readModels: readonly string[];
  readonly task: string | null; readonly levels: readonly string[]; readonly rungs: readonly number[]; readonly shortcut: string | null;
  readonly helpKey: string; readonly secondWindow: boolean;
}
export interface ScreensFile { readonly contentSchemaVersion: number; readonly screens: readonly ScreenRecord[] }
export const ScreensShape = obj({
  contentSchemaVersion: int({ min: 1 }),
  screens: arr(obj({
    id: str({ min: 1 }), titleKey: str({ min: 1 }), hub: str({ min: 1 }), route: str({ min: 1 }), readModels: arr(str()),
    task: nul(str()), levels: arr(LevelShape, { min: 1 }), rungs: arr(int(), { min: 1 }), shortcut: nul(str()),
    helpKey: str({ min: 1 }), secondWindow: bool(),
  })),
});

export interface KeymapFile { readonly contentSchemaVersion: number; readonly bindings: readonly { action: string; context: string; defaultKey: string }[] }
export const KeymapShape = obj({ contentSchemaVersion: int({ min: 1 }), bindings: arr(obj({ action: str({ min: 1 }), context: str({ min: 1 }), defaultKey: str({ min: 1 }) })) });

export interface TokensFile {
  readonly contentSchemaVersion: number;
  readonly themes: Readonly<Record<string, Readonly<Record<string, string | number>>>>;
  /** Token pairs used for text: foreground on background; large text gets the large threshold. */
  readonly textPairs: readonly { fg: string; bg: string; large?: boolean }[];
}
export const TokensShape = obj({
  contentSchemaVersion: int({ min: 1 }),
  themes: record(record(anyOf(str(), int()))),
  textPairs: arr(obj({ fg: str(), bg: str(), large: opt(bool()) })),
});

export interface RungDefaultsFile { readonly contentSchemaVersion: number; readonly rows: readonly { level: string; rung: number; screens: readonly string[]; home: string; delegation?: Record<string, string> }[] }
export const RungDefaultsShape = obj({
  contentSchemaVersion: int({ min: 1 }),
  rows: arr(obj({ level: LevelShape, rung: int(), screens: arr(str(), { min: 1 }), home: str({ min: 1 }), delegation: opt(record(str())) })),
});

function uiKind(kind: string, file: string, shape: Shape): KindDef {
  return {
    kind, match: `ui/${file}`, version: 1,
    parse(data, ctx) {
      const { value, problems } = parseShape<unknown>(shape, data, ctx);
      return { items: value ? [{ id: file.replace(/\.json$/, ''), data: value, levelTags: ['both'], draft: false }] : [], problems };
    },
  };
}

export function registerUiKinds(r: KindRegistry): KindRegistry {
  r.register(uiKind('ui/screens', 'screens.json', ScreensShape));
  r.register(uiKind('ui/keymap', 'keymap.default.json', KeymapShape));
  r.register(uiKind('ui/tokens', 'tokens.json', TokensShape));
  r.register(uiKind('ui/rung-defaults', 'rung_defaults.json', RungDefaultsShape));
  // Owned by O6.3 and O5.3.1; carried as objects until those packages register their schemas.
  for (const f of ['markers.json', 'diagram_symbols.json', 'settings.schema.json']) {
    r.register({ ...envelopeKind(`ui/${f.replace(/\.json$/, '')}`, `ui/${f}`), parse: (data) => (typeof data === 'object' && data !== null && !Array.isArray(data)
      ? { items: [{ id: f.replace(/\.json$/, ''), data, levelTags: ['both'], draft: false }], problems: [] }
      : { items: [], problems: [{ severity: 'error', code: 'schema.type', path: '$', message: `${f} is an object` }] }) });
  }
  return r;
}

/** WCAG relative luminance of an sRGB colour (WCAG 2.2 definition). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** P4.5.1 build-time checks over a loaded set. `readModelKeys` comes from @gm/schema's registry. */
export function uiChecks(set: ContentSet, readModelKeys: readonly string[]): Problem[] {
  const out: Problem[] = [];
  const get = (kind: string) => [...set.items.values()].find((i) => i.kind === kind);
  const prob = (item: { packId: string; file: string }, code: string, path: string, message: string, severity: Problem['severity'] = 'error') =>
    out.push({ severity, code, packId: item.packId, file: item.file, path, message });

  const screensItem = get('ui/screens');
  const screenIds = new Set<string>();
  if (screensItem) {
    const f = screensItem.data as ScreensFile;
    const known = new Set(readModelKeys);
    f.screens.forEach((s, i) => {
      if (screenIds.has(s.id)) prob(screensItem, 'ui.screen_duplicate', `$.screens[${i}].id`, `screen ${s.id} appears twice`);
      screenIds.add(s.id);
      s.readModels.forEach((k, j) => { if (!known.has(k)) prob(screensItem, 'ui.read_model_missing', `$.screens[${i}].readModels[${j}]`, `screen ${s.id} reads ${k}, which no read model defines`); });
      s.rungs.forEach((r, j) => { if (!RUNGS.includes(r)) prob(screensItem, 'ui.rung_range', `$.screens[${i}].rungs[${j}]`, `rung ${r} is not 0 to 9`); });
    });
  }

  const keymap = get('ui/keymap');
  if (keymap) {
    const f = keymap.data as KeymapFile;
    const seen = new Map<string, number>();
    const keys = new Map<string, string>();
    f.bindings.forEach((b, i) => {
      const ak = `${b.context}|${b.action}`;
      if (seen.has(ak)) prob(keymap, 'ui.key_duplicate_action', `$.bindings[${i}]`, `action ${b.action} has two default keys in context ${b.context}`);
      seen.set(ak, i);
      const kk = `${b.context}|${b.defaultKey}`;
      const other = keys.get(kk);
      if (other !== undefined && other !== b.action) prob(keymap, 'ui.key_conflict', `$.bindings[${i}]`, `key ${b.defaultKey} is bound to ${other} and ${b.action} in context ${b.context}`);
      keys.set(kk, b.action);
    });
  }

  const tokens = get('ui/tokens');
  if (tokens) {
    const f = tokens.data as TokensFile;
    for (const [theme, map] of Object.entries(f.themes)) {
      f.textPairs.forEach((p, i) => {
        const fg = map[p.fg], bg = map[p.bg];
        const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
        if (!isHex(fg) || !isHex(bg)) { prob(tokens, 'ui.token_missing', `$.textPairs[${i}]`, `theme ${theme} lacks colour token ${!isHex(fg) ? p.fg : p.bg}`); return; }
        const need = p.large ? CONTRAST_LARGE : CONTRAST_NORMAL;
        const got = contrastRatio(fg, bg);
        if (got < need) prob(tokens, 'ui.contrast', `$.themes.${theme}`, `${p.fg} on ${p.bg} is ${got.toFixed(2)}:1 in theme ${theme}; text needs ${need}:1 (O5.5)`);
      });
    }
  }

  const rd = get('ui/rung-defaults');
  if (rd) {
    const f = rd.data as RungDefaultsFile;
    const have = new Set(f.rows.map((r) => `${r.level}|${r.rung}`));
    for (const level of LEVELS) for (const rung of RUNGS) if (!have.has(`${level}|${rung}`)) prob(rd, 'ui.rung_row_missing', '$.rows', `no rung_defaults row for ${level} rung ${rung}`);
    if (screensItem) f.rows.forEach((r, i) => {
      for (const s of [...r.screens, r.home]) if (!screenIds.has(s)) prob(rd, 'ui.screen_unknown', `$.rows[${i}]`, `${r.level} rung ${r.rung} names screen ${s}, which is not in ui/screens.json`);
    });
  }
  return out;
}
