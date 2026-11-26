// The legends browser (G-84) over a draft of the past, before the career starts. The past is public from
// the first day (X3.6.2), so the viewer sees every public row of the history log; nothing is authored here,
// every line is an event the run wrote. The data has the shape app-ui's LegendsScreen draws.
// Gaps, said plainly on the screen through empty tabs: the history run does not yet write game results or
// titles as log rows (the games and season steps keep them in world state), so the chronicle, eras,
// rivalry and record tabs stay empty until those steps emit them (asked of the history thread).
import { awards } from '@gm/league';
import { loop } from '@gm/world';
import { buildPage, pageLinks, type PageModel } from '../read-models/legends/pages.ts';
import { SearchIndex, type IndexEntry } from '../read-models/legends/search.ts';
import { visibleEvents } from '../read-models/legends/visibility.ts';
import type { PageKind } from '../read-models/legends/types.ts';

export interface DraftLink { readonly kind: PageKind; readonly id: number }

/** The LegendsScreen data (app-ui screens/legends/types.ts LegendsData), page and search filled. */
export interface DraftLegendsData {
  page: PageModel | null;
  chronicle: null; eras: null; tree: null; rivalry: null; records: null;
  search: { text: string; rows: { kind: 'person' | 'team' | 'competition_season' | 'trophy'; id: number; first: string; last: string; birthYear: number | null; role: string | null; lastTeamId: number | null; match: 'exact' | 'prefix' | 'fuzzy' | 'all' }[] } | null;
  names: Record<string, string>;
  lineText: Record<string, string>;
}

export interface DraftLegendsQuery { readonly link?: DraftLink; readonly search?: string }

function nameOf(w: loop.LiveWorld, kind: string, id: number): string | null {
  if (kind === 'person') { const p = w.people.get(id); return p ? `${p.name.first} ${p.name.last}` : null; }
  if (kind === 'team') return w.teams.find((t) => t.id === id)?.identity.name ?? null;
  return null;
}

function words(id: string): string { return id.replace(/^event\./, '').replace(/_/g, ' '); }

/** Search entries for every person and team of the draft (X3.5.1), built once per draft. */
export function draftSearchIndex(w: loop.LiveWorld): SearchIndex {
  const ix = new SearchIndex();
  const lastSeason = w.seasons.at(-1)?.seasonYear ?? w.setup.firstSeasonYear;
  for (const t of w.teams) {
    const span = w.teamSpans.get(t.id);
    ix.upsert({
      kind: 'team', id: t.id, first: '', last: t.identity.name, birthYear: null, roles: [], levels: [], teams: [t.id], lastTeamId: t.id, jobs: [],
      labels: [], honors: [], treeRoots: [], firstSeason: span?.founded ?? w.setup.firstSeasonYear, lastSeason: span?.folded ?? lastSeason, notability: 0,
    } satisfies IndexEntry);
  }
  const hall = new Set(w.hall.members.map((m) => m.personId));
  for (const p of w.people.values()) {
    ix.upsert({
      kind: 'person', id: p.id, first: p.name.first, last: p.name.last, birthYear: p.birthDate?.seasonYear ?? null, roles: [], levels: [], teams: [],
      lastTeamId: null, jobs: [], labels: [], honors: hall.has(p.id) ? ['hall_of_fame'] : [], treeRoots: [], firstSeason: null, lastSeason: null, notability: hall.has(p.id) ? 1 : 0,
    } satisfies IndexEntry);
  }
  return ix;
}

export function draftLegends(w: loop.LiveWorld, q: DraftLegendsQuery, index?: SearchIndex): DraftLegendsData {
  const rows = w.log.rows().filter((e) => e.witnesses.kind === 'public');
  const types = new Map<string, { family: string; lineTemplate: string }>();
  for (const id of w.log.registry.ids()) { const d = w.log.registry.get(id); if (d) types.set(id, { family: d.family, lineTemplate: d.lineTemplate }); }
  const names: Record<string, string> = {};
  const lineText: Record<string, string> = {};
  for (const t of types.values()) lineText[t.lineTemplate] = words(t.lineTemplate);
  let page: PageModel | null = null;
  if (q.link) {
    page = buildPage({ kind: q.link.kind, id: q.link.id }, visibleEvents(rows, [], () => undefined), {
      types, keepLine: awards.keepLine(), tier: 1, labels: w.hall.members.some((m) => m.personId === q.link!.id) && q.link.kind === 'person' ? ['hall_of_fame'] : [], legendsTypes: undefined,
    });
    for (const l of [q.link, ...pageLinks(page)]) { const n = nameOf(w, l.kind, l.id); if (n) names[`${l.kind}:${l.id}`] = n; }
  }
  let search: DraftLegendsData['search'] = null;
  if (q.search !== undefined) {
    const ix = index ?? draftSearchIndex(w);
    const found = ix.search(q.search, {}, w.date.seasonYear);
    search = { text: q.search, rows: found.map((r) => ({ kind: r.kind, id: r.id, first: r.first, last: r.last, birthYear: r.birthYear, role: r.role, lastTeamId: r.lastTeamId, match: r.match })) };
    for (const r of found) names[`${r.kind}:${r.id}`] = r.kind === 'person' ? `${r.first} ${r.last}` : r.last;
  }
  return { page, chronicle: null, eras: null, tree: null, rivalry: null, records: null, search, names, lineText };
}
