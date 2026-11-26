// Command palette and search (O1.3.2). Matching is prefix-first, then word-start, then fuzzy, with
// the user's recent picks ranked up. Only screens, entities, terms and actions that change nothing in
// the world are listed; world-changing actions live on their own screens.
import { SCREENS, hasParams, type ScreenRecord } from './registry.ts';
import { buildPath } from './routes.ts';

export type PaletteGroup = 'screen' | 'player' | 'staff' | 'team' | 'play' | 'term' | 'action' | 'past';
export interface PaletteItem {
  id: string;
  group: PaletteGroup;
  label: string;
  /** Extra words that also match: jersey number, position, team, search terms. */
  terms: string[];
  /** Where Enter goes. Every item opens an address; none runs a command. */
  to: string;
  /** Shown beside the label to tell same-named people apart (team, position, number). */
  detail?: string;
}

export function screenItems(screens: readonly ScreenRecord[] = SCREENS): PaletteItem[] {
  return screens.filter((s) => !hasParams(s)).map((s) => ({ id: s.id, group: 'screen', label: s.title, terms: [...s.search_terms, s.hub], to: buildPath(s) }));
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function subsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
}

/** Score of one item for a query; 0 means no match. */
export function scoreItem(item: PaletteItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const label = item.label.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  const pool = [...words(item.label), ...item.terms.flatMap(words), ...item.terms.map((x) => x.toLowerCase())];
  let score = 0;
  for (const tok of tokens) {
    if (pool.includes(tok)) score += 3;
    else if (pool.some((w) => w.startsWith(tok))) score += 2;
    else if (label.replace(/\s+/g, '').includes(tok)) score += 1;
    else if (subsequence(tok, label.replace(/\s+/g, ''))) score += 0.5;
    else return 0;
  }
  if (label.startsWith(q)) score += 4;
  return score;
}

/** Results for a query, best first. `recent` holds item ids, most recent first. */
export function search(items: readonly PaletteItem[], query: string, recent: readonly string[] = [], limit = 30): PaletteItem[] {
  const scored: { item: PaletteItem; score: number }[] = [];
  for (const item of items) {
    const s = scoreItem(item, query);
    if (s <= 0) continue;
    const r = recent.indexOf(item.id);
    scored.push({ item, score: s + (r >= 0 ? 1 + (recent.length - r) / (recent.length + 1) : 0) });
  }
  scored.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, 'en'));
  return scored.slice(0, limit).map((x) => x.item);
}
