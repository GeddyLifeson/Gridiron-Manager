// Routes (O1.1.3): `/<hub>/<screen>/<params>?<view options>`. Parameters are entity ids. View
// options hold sort, filter and tab. A route only shows things; it never carries an action.
import { SCREENS, type ScreenRecord } from './registry.ts';

export interface Location {
  path: string;
  screenId: string;
  params: Record<string, string>;
  view: Record<string, string>;
}

function splitPath(full: string): { path: string; query: string } {
  const i = full.indexOf('?');
  return i < 0 ? { path: full, query: '' } : { path: full.slice(0, i), query: full.slice(i + 1) };
}

export function parseView(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!query) return out;
  for (const part of query.split('&')) {
    if (!part) continue;
    const [k, val = ''] = part.split('=');
    out[decodeURIComponent(k!)] = decodeURIComponent(val);
  }
  return out;
}

export function formatView(view: Record<string, string>): string {
  const keys = Object.keys(view).filter((k) => view[k] !== '').sort();
  return keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(view[k]!)}`).join('&');
}

/** Matches a path against one route pattern; returns the parameters or null. */
export function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean), b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const seg = a[i]!, got = b[i]!;
    if (seg.startsWith(':')) { if (!got) return null; params[seg.slice(1)] = decodeURIComponent(got); }
    else if (seg !== got) return null;
  }
  return params;
}

/** Resolves a full address to a location, or null when no screen has it. */
export function resolve(full: string, screens: readonly ScreenRecord[] = SCREENS): Location | null {
  const { path, query } = splitPath(full);
  for (const s of screens) {
    const params = matchPattern(s.route, path);
    if (params) return { path: buildPath(s, params, {}), screenId: s.id, params, view: parseView(query) };
  }
  return null;
}

/** The address of a screen with its parameters and view options. */
export function buildPath(s: ScreenRecord, params: Record<string, string> = {}, view: Record<string, string> = {}): string {
  const path = s.route.replace(/:([A-Za-z]+)/g, (_m, k: string) => {
    const val = params[k];
    if (val === undefined || val === '') throw new Error(`route ${s.route} needs ${k}`);
    return encodeURIComponent(val);
  });
  const q = formatView(view);
  return q ? `${path}?${q}` : path;
}

/** The full address of a location, view options included. */
export const href = (loc: Location): string => {
  const q = formatView(loc.view);
  return q ? `${loc.path}?${q}` : loc.path;
};
