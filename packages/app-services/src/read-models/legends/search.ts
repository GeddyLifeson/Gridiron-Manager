// X3.5.1 search and filters. The index holds one entry per person, team, competition season and trophy:
// normalized name tokens (X11.4.2 normalization), birth year, current and past teams, roles, levels and
// held labels. It is built incrementally (upsert when a person is created or an event changes a public
// field), never rebuilt from the full log in play. Matching: exact token, then prefix, then one edit for
// tokens of 5 or more letters. Ranking inside each match class: X4 notability, then most recent season
// active, then name. Filters read public facts and held labels only; the static check in the tests maps
// every filter key against the truth-data list. Each row shows birth year, role and last team, because
// shared names are common.
import { cohorts } from '@gm/people';
import { param } from './params.ts';

export type EntryKind = 'person' | 'team' | 'competition_season' | 'trophy';

/** One index entry. Every field is public (P3.2.3 PersonView fields or public event facts). */
export interface IndexEntry {
  readonly kind: EntryKind;
  readonly id: number;
  /** Display name pieces; people give first and last, others give the whole name in `last`. */
  readonly first: string;
  readonly last: string;
  readonly birthYear: number | null;
  readonly roles: readonly string[];
  readonly levels: readonly string[];
  readonly teams: readonly number[];
  readonly lastTeamId: number | null;
  readonly jobs: readonly number[];
  readonly labels: readonly string[];
  readonly honors: readonly string[];
  readonly treeRoots: readonly number[];
  readonly firstSeason: number | null;
  readonly lastSeason: number | null;
  readonly notability: number;
}

/** Filter keys and their types (X3.5.1 rule 4). The only keys a filter may use. */
export const FILTER_KEYS = {
  role: 'enum', level: 'enum', age: 'range', team: 'link', seasonsActive: 'range', jobsHeld: 'link_list', label: 'enum', treeRoot: 'link', honor: 'enum',
} as const;
export type FilterKey = keyof typeof FILTER_KEYS;

export interface SearchFilter {
  readonly kinds?: readonly EntryKind[];
  readonly role?: string;
  readonly level?: string;
  /** Age range on `asOfYear` (age = asOfYear - birthYear). */
  readonly age?: { readonly min?: number; readonly max?: number };
  readonly team?: number;
  readonly seasonsActive?: { readonly min?: number; readonly max?: number };
  readonly jobsHeld?: readonly number[];
  readonly label?: string;
  readonly treeRoot?: number;
  readonly honor?: string;
}

export type MatchClass = 'exact' | 'prefix' | 'fuzzy' | 'all';
export interface SearchRow {
  readonly kind: EntryKind;
  readonly id: number;
  readonly first: string;
  readonly last: string;
  readonly birthYear: number | null;
  readonly role: string | null;
  readonly lastTeamId: number | null;
  readonly match: MatchClass;
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function tokensOf(e: Pick<IndexEntry, 'kind' | 'first' | 'last'>): string[] {
  const base = e.kind === 'person' ? cohorts.normalizeName(e.first, e.last) : fold(`${e.first} ${e.last}`);
  return [...new Set([...base.split(/\s+/), ...fold(`${e.first} ${e.last}`).split(/\s+/)].filter(Boolean))];
}

/** Edit distance capped at `cap + 1` (early exit). */
export function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** The legends search index. Token map keeps a sorted token list for prefix lookups (no scan of entries). */
export class SearchIndex {
  readonly #entries = new Map<string, IndexEntry>();
  readonly #byToken = new Map<string, Set<string>>();
  #sorted: string[] | null = null;

  static key(kind: EntryKind, id: number): string { return `${kind}:${id}`; }

  upsert(e: IndexEntry): void {
    const k = SearchIndex.key(e.kind, e.id);
    this.remove(e.kind, e.id);
    this.#entries.set(k, e);
    for (const t of tokensOf(e)) {
      const s = this.#byToken.get(t);
      if (s) s.add(k); else { this.#byToken.set(t, new Set([k])); this.#sorted = null; }
    }
  }

  remove(kind: EntryKind, id: number): void {
    const k = SearchIndex.key(kind, id);
    const old = this.#entries.get(k);
    if (!old) return;
    this.#entries.delete(k);
    for (const t of tokensOf(old)) {
      const s = this.#byToken.get(t);
      s?.delete(k);
      if (s && s.size === 0) { this.#byToken.delete(t); this.#sorted = null; }
    }
  }

  get size(): number { return this.#entries.size; }
  entry(kind: EntryKind, id: number): IndexEntry | undefined { return this.#entries.get(SearchIndex.key(kind, id)); }

  #tokens(): string[] {
    this.#sorted ??= [...this.#byToken.keys()].sort();
    return this.#sorted;
  }

  /** Keys whose token starts with `p`, by binary search into the sorted token list. */
  #prefix(p: string): Set<string> {
    const toks = this.#tokens();
    let lo = 0, hi = toks.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (toks[mid]! < p) lo = mid + 1; else hi = mid; }
    const out = new Set<string>();
    for (let i = lo; i < toks.length && toks[i]!.startsWith(p); i++) for (const k of this.#byToken.get(toks[i]!) ?? []) out.add(k);
    return out;
  }

  #fuzzy(q: string): Set<string> {
    const out = new Set<string>();
    const minLetters = param('legends.search.fuzzy_min_letters');
    const edits = param('legends.search.fuzzy_edits');
    if (q.length < minLetters) return out;
    for (const t of this.#tokens()) {
      if (t.length < minLetters || Math.abs(t.length - q.length) > edits) continue;
      if (editDistance(q, t, edits) <= edits) for (const k of this.#byToken.get(t) ?? []) out.add(k);
    }
    return out;
  }

  /**
   * Search by text (name, team or year tokens), then filter. Each query token must match; an entry's
   * class is the weakest class among its token matches. `asOfYear` resolves the age filter.
   */
  search(text: string, filter: SearchFilter = {}, asOfYear?: number, limit: number = param('legends.search.page_size')): SearchRow[] {
    const qs = fold(text).split(/\s+/).filter(Boolean);
    const classOf = new Map<string, MatchClass>();
    const rankClass: Record<MatchClass, number> = { exact: 0, prefix: 1, fuzzy: 2, all: 3 };
    if (qs.length === 0) for (const k of this.#entries.keys()) classOf.set(k, 'all');
    qs.forEach((q, i) => {
      const found = new Map<string, MatchClass>();
      for (const k of this.#byToken.get(q) ?? []) found.set(k, 'exact');
      for (const k of this.#prefix(q)) if (!found.has(k)) found.set(k, 'prefix');
      for (const k of this.#fuzzy(q)) if (!found.has(k)) found.set(k, 'fuzzy');
      if (i === 0) for (const [k, c] of found) classOf.set(k, c);
      else for (const k of [...classOf.keys()]) {
        const c = found.get(k);
        if (!c) classOf.delete(k);
        else if (rankClass[c] > rankClass[classOf.get(k)!]) classOf.set(k, c);
      }
    });
    const rows: { e: IndexEntry; c: MatchClass }[] = [];
    for (const [k, c] of classOf) {
      const e = this.#entries.get(k)!;
      if (passes(e, filter, asOfYear)) rows.push({ e, c });
    }
    rows.sort((a, b) => rankClass[a.c] - rankClass[b.c] || b.e.notability - a.e.notability || (b.e.lastSeason ?? -Infinity) - (a.e.lastSeason ?? -Infinity)
      || a.e.last.localeCompare(b.e.last) || a.e.first.localeCompare(b.e.first) || a.e.id - b.e.id);
    return rows.slice(0, limit).map(({ e, c }) => ({ kind: e.kind, id: e.id, first: e.first, last: e.last, birthYear: e.birthYear, role: e.roles[e.roles.length - 1] ?? null, lastTeamId: e.lastTeamId, match: c }));
  }
}

const inRange = (v: number | null, r?: { min?: number; max?: number }) => !r || (v !== null && (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max));

export function passes(e: IndexEntry, f: SearchFilter, asOfYear?: number): boolean {
  if (f.kinds && !f.kinds.includes(e.kind)) return false;
  if (f.role !== undefined && !e.roles.includes(f.role)) return false;
  if (f.level !== undefined && !e.levels.includes(f.level)) return false;
  if (f.age && !inRange(e.birthYear === null || asOfYear === undefined ? null : asOfYear - e.birthYear, f.age)) return false;
  if (f.team !== undefined && !e.teams.includes(f.team)) return false;
  if (f.seasonsActive && !inRange(e.firstSeason === null || e.lastSeason === null ? null : e.lastSeason - e.firstSeason + 1, f.seasonsActive)) return false;
  if (f.jobsHeld && !f.jobsHeld.every((j) => e.jobs.includes(j))) return false;
  if (f.label !== undefined && !e.labels.includes(f.label)) return false;
  if (f.treeRoot !== undefined && !e.treeRoots.includes(f.treeRoot)) return false;
  if (f.honor !== undefined && !e.honors.includes(f.honor)) return false;
  return true;
}
