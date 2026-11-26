// X3.1.1 page model: one page per person, team, game, competition season, trophy, record and staff
// position, built by query from the viewer's visible events on open. A page is never a stored document:
// deleting any cache changes nothing shown. Every line maps to one event id and is rendered by its type's
// line template; no judgment word appears unless it is a held label, and no X1 number appears at all.
import { history } from '@gm/league';
import pagesJson from './pages.json' with { type: 'json' };
import { byDate, personsOf, reversedIds, teamsOf, DEFAULT_TYPES, type EventRow, type LegendsTypes, type Link, type PageKind } from './types.ts';
import type { SourceMark, VisibleEvent } from './visibility.ts';

export interface PageKindContent { readonly families: readonly string[]; readonly group: 'season' | 'none'; readonly sort: 'date'; readonly tabs: readonly string[] }
export const PAGE_CONTENT = (pagesJson as unknown as { kinds: Record<PageKind, PageKindContent> }).kinds;

export interface PageQuery { readonly kind: PageKind; readonly id: number; /** Competition season pages only. */ readonly seasonYear?: number }

/** What the page needs to know about event types (X2.1.2 rows from the save). */
export interface TypeInfo { readonly family: string; readonly lineTemplate: string }

export interface PageContext {
  readonly types: ReadonlyMap<string, TypeInfo>;
  /** X4 keep line: lines at or above it sit in the Notable block (X3.1.1 rule 2). */
  readonly keepLine: number;
  /** X13 tier of the subject; tier 3 shows season summaries only (rule 3). */
  readonly tier: 1 | 2 | 3;
  /** Held public labels of the subject (X2.2.2). The only judgment words a page may show (rule 4). */
  readonly labels: readonly string[];
  /** Counts for tabs fed by other modules (relationships X7.4.1, rivalries X3.3.2, culture X9). */
  readonly extraTabCounts?: Readonly<Record<string, number>>;
  readonly legendsTypes?: LegendsTypes;
}

export interface PageLine {
  readonly eventId: number;
  readonly type: string;
  readonly seasonYear: number;
  readonly dayIndex: number;
  /** Text key of the type's line template; parameters are the event's own scalar payload. */
  readonly textKey: string;
  readonly params: Readonly<Record<string, string | number | boolean | null>>;
  readonly links: readonly Link[];
  readonly notability: number | null;
  readonly mark: SourceMark;
  /** A reversal names this row: both lines show (X3.1.1 edge case, X2.1.3). */
  readonly reversed: boolean;
}

export interface PageSeason { readonly seasonYear: number; readonly notable: readonly PageLine[]; readonly lines: readonly PageLine[] }

export interface PageModel {
  readonly link: Link;
  readonly seasonYear: number | null;
  readonly labels: readonly string[];
  /** First and last season with a line, or null for "No record yet". */
  readonly years: { readonly first: number; readonly last: number } | null;
  readonly summariesOnly: boolean;
  readonly empty: boolean;
  readonly seasons: readonly PageSeason[];
  /** Tabs with content, in content order; a tab with no content is hidden. */
  readonly tabs: readonly { readonly id: string; readonly count: number }[];
}

function matches(q: PageQuery, e: EventRow): boolean {
  switch (q.kind) {
    case 'person': return personsOf(e).includes(q.id);
    case 'team': return teamsOf(e).includes(q.id);
    case 'game': return e.subjects.some((s) => s.kind === 'game' && s.id === q.id);
    case 'competition_season': return e.competitionId === q.id && e.when.date.seasonYear === q.seasonYear;
    case 'record': return e.subjects.some((s) => s.kind === 'record' && s.id === q.id);
    case 'position': return e.subjects.some((s) => s.kind === 'position' && s.id === q.id);
    case 'trophy': return e.payload['trophyId'] === q.id;
  }
}

/** Every person, team, game and record named in a line is a link, resolved by id (rule 5). */
export function linksOf(e: EventRow): Link[] {
  const out: Link[] = [];
  for (const p of personsOf(e)) out.push({ kind: 'person', id: p });
  for (const t of teamsOf(e)) out.push({ kind: 'team', id: t });
  for (const s of e.subjects) {
    if (s.kind === 'game') out.push({ kind: 'game', id: s.id });
    if (s.kind === 'record') out.push({ kind: 'record', id: s.id });
    if (s.kind === 'position') out.push({ kind: 'position', id: s.id });
  }
  const trophy = e.payload['trophyId'];
  if (typeof trophy === 'number') out.push({ kind: 'trophy', id: trophy });
  if (e.competitionId !== null) out.push({ kind: 'competition_season', id: e.competitionId });
  return out;
}

function tabOf(kind: PageKind, e: EventRow, family: string, t: LegendsTypes): string[] {
  if (kind === 'person') {
    const tabs = ['seasons'];
    if (family === 'career' || family === 'roster') tabs.push('career');
    if (family === 'media') tabs.push('what_people_say');
    if (e.type === t.record) tabs.push('records');
    return tabs;
  }
  if (kind === 'team') {
    const tabs = ['seasons'];
    if (t.coachChanges.includes(e.type)) tabs.push('coaches');
    if (e.type === t.record) tabs.push('records');
    return tabs;
  }
  return [];
}

export function buildPage(q: PageQuery, visible: readonly VisibleEvent[], ctx: PageContext): PageModel {
  const t = ctx.legendsTypes ?? DEFAULT_TYPES;
  const content = PAGE_CONTENT[q.kind];
  const rev = reversedIds(visible.map((v) => v.event), t);
  const families = new Set(content.families);
  let rows = visible.filter((v) => matches(q, v.event) && families.has(ctx.types.get(v.event.type)?.family ?? 'world'));
  const summariesOnly = ctx.tier === 3;
  if (summariesOnly) rows = rows.filter((v) => v.event.type === history.HISTORY_SUMMARY_TYPE);
  rows.sort((a, b) => byDate(a.event, b.event));

  const counts = new Map<string, number>();
  const line = (v: VisibleEvent): PageLine => {
    const e = v.event;
    const info = ctx.types.get(e.type);
    for (const tab of tabOf(q.kind, e, info?.family ?? 'world', t)) counts.set(tab, (counts.get(tab) ?? 0) + 1);
    return {
      eventId: e.id, type: e.type, seasonYear: e.when.date.seasonYear, dayIndex: e.when.date.dayIndex,
      textKey: info?.lineTemplate ?? `legends.line.${e.type}`, params: { ...e.payload }, links: linksOf(e),
      notability: e.notability, mark: v.mark, reversed: rev.has(e.id),
    };
  };

  const seasons: PageSeason[] = [];
  const bySeason = new Map<number, PageLine[]>();
  for (const v of rows) {
    const key = content.group === 'season' ? v.event.when.date.seasonYear : 0;
    (bySeason.get(key) ?? bySeason.set(key, []).get(key)!).push(line(v));
  }
  for (const [seasonYear, lines] of [...bySeason].sort((a, b) => a[0] - b[0])) {
    const notable = lines.filter((l) => l.notability !== null && l.notability >= ctx.keepLine);
    const ids = new Set(notable.map((l) => l.eventId));
    seasons.push({ seasonYear, notable, lines: lines.filter((l) => !ids.has(l.eventId)) });
  }

  for (const [k, n] of Object.entries(ctx.extraTabCounts ?? {})) counts.set(k, (counts.get(k) ?? 0) + n);
  const tabs = content.tabs.map((id) => ({ id, count: counts.get(id) ?? 0 })).filter((x) => x.count > 0);
  const years = rows.length === 0 ? null : { first: rows[0]!.event.when.date.seasonYear, last: rows[rows.length - 1]!.event.when.date.seasonYear };
  return {
    link: { kind: q.kind, id: q.id }, seasonYear: q.seasonYear ?? null, labels: [...ctx.labels].sort(), years, summariesOnly,
    empty: rows.length === 0, seasons, tabs,
  };
}

/** Every link on a page, for the dead-link crawl (X3.1.1 acceptance). */
export function pageLinks(p: PageModel): Link[] {
  const seen = new Map<string, Link>();
  for (const s of p.seasons) for (const l of [...s.notable, ...s.lines]) for (const k of l.links) seen.set(`${k.kind}:${k.id}`, k);
  return [...seen.values()];
}
