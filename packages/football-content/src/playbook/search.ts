// G3.5.1 search and filters: one field that accepts call strings, part names and filters. "Beats" filters
// read the user's own intent labels, never outcome data. Retired plays are hidden unless asked for.
import { partIdsOf } from './library.ts';
import { parseCall, type ParseIndex } from './parse.ts';
import type { Book, PlayEntry, Playbook, PlayStatus, PlayUsage, Role } from './types.ts';
import { norm, type WordList } from './words.ts';

export interface Filters {
  readonly book?: Book;
  readonly personnel?: string;
  readonly formation?: string;
  readonly concept?: string;
  readonly role?: Role;
  readonly situation?: string;
  readonly status?: PlayStatus;
  readonly readinessAtLeast?: number;
  readonly beats?: string;
  readonly calledAtLeast?: number;
  readonly lastCalledSince?: number;
  readonly includeRetired?: boolean;
  /** Free text: part words or a call string. */
  readonly text?: string;
}

/** The search index: one entry per play with its part words, rebuilt on edit. */
export interface SearchIndex {
  readonly book: Playbook;
  readonly words: WordList;
  readonly entries: readonly { readonly play: PlayEntry; readonly words: ReadonlySet<string> }[];
  readonly parse?: ParseIndex;
}

export function buildSearchIndex(book: Playbook, words: WordList, parse?: ParseIndex): SearchIndex {
  const entries = [...book.plays.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((play) => {
    const ws = new Set<string>();
    for (const id of partIdsOf(play)) { const w = words.entries.get(id)?.word; if (w) ws.add(norm(w)); }
    return { play, words: ws };
  });
  return { book, words, entries, parse };
}

function passes(play: PlayEntry, words: ReadonlySet<string>, f: Filters, usage: (id: string) => PlayUsage | undefined, ix: SearchIndex): boolean {
  if (!f.includeRetired && play.status === 'retired') return false;
  if (f.book && play.book !== f.book) return false;
  if (f.personnel && play.parts.personnel !== f.personnel) return false;
  if (f.formation && play.parts.formation !== f.formation) return false;
  if (f.concept && play.parts.concept !== f.concept && play.parts.run !== f.concept && play.parts.coverage !== f.concept) return false;
  if (f.role && play.role !== f.role) return false;
  if (f.situation && !play.situations.includes(f.situation)) return false;
  if (f.status && play.status !== f.status) return false;
  if (f.beats && !play.beats.includes(f.beats)) return false;
  const u = usage(play.id);
  if (f.readinessAtLeast !== undefined && (u?.readinessEstimate ?? 0) < f.readinessAtLeast) return false;
  if (f.calledAtLeast !== undefined && (u?.called ?? 0) < f.calledAtLeast) return false;
  if (f.lastCalledSince !== undefined && (u?.lastCalledWeek ?? -1) < f.lastCalledSince) return false;
  if (f.text) {
    const q = norm(f.text);
    const all = [...words].join(' ');
    if (!q.split(' ').every((t) => all.split(' ').includes(t))) return false;
  }
  void ix;
  return true;
}

/**
 * Search (G3.5.1). With text, a call string that parses to plays puts those first; part-word matches follow.
 * Every filter combination returns exactly what a brute-force scan returns (G3.5.1 acceptance, tested).
 */
export function search(ix: SearchIndex, f: Filters, usage: (id: string) => PlayUsage | undefined = () => undefined): PlayEntry[] {
  const hits = ix.entries.filter((e) => passes(e.play, e.words, f, usage, ix)).map((e) => e.play);
  if (!f.text || !ix.parse) return hits;
  const parsed = parseCall(ix.parse, f.text, { maxCandidates: 5 });
  const first = parsed.candidates.filter((c) => c.exact).map((c) => c.call.playId);
  const firstSet = new Set(first);
  const extra = first.map((id) => ix.book.plays.get(id)!).filter((p) => passes(p, new Set(), { ...f, text: undefined }, usage, ix) && !hits.some((h) => h.id === p.id));
  return [...hits.filter((h) => firstSet.has(h.id)), ...extra, ...hits.filter((h) => !firstSet.has(h.id))];
}
