// Legends screen (G-84, bible X3, O4): pages, the season chronicle, era views, coaching trees, rivalry
// pages, the record book and search. Draws read models only and holds no football logic. Every name is a
// link that opens its page by id (X3.1.1 rule 5); back and forward walk the page history. Lines show
// their source mark when the viewer knows them first-hand or was told (X3.1.3).
import type { ReactNode } from 'react';
import TEXT from './text.json';
import {
  LEGENDS_TABS, type ChronicleData, type EraData, type LegendsData, type LegendsTab, type Link, type PageData, type PageLine,
  type RecordsData, type RivalryData, type SearchData, type SourceMark, type TreeData,
} from './types.ts';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

/** Legends text by id with `{slot}` filled; an unknown id shows itself so a gap is visible (O6.6.1). */
export function lt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}
export const legendsTextIds = (): string[] => Object.keys(STRINGS);

export function parseTab(v: string | undefined): LegendsTab {
  return (LEGENDS_TABS as readonly string[]).includes(v ?? '') ? (v as LegendsTab) : 'page';
}

export interface LegendsScreenProps {
  tab: LegendsTab;
  data: LegendsData;
  onTab(tab: LegendsTab): void;
  onOpen(link: Link): void;
  onBack?(): void;
  onForward?(): void;
  onSearch?(text: string): void;
}

const keyOf = (l: Link) => `${l.kind}:${l.id}`;

function NameLink({ link, data, onOpen }: { link: Link; data: LegendsData; onOpen(l: Link): void }) {
  const label = data.names[keyOf(link)] ?? `#${link.id}`;
  return <button type="button" className="gm-link" data-link={keyOf(link)} onClick={() => onOpen(link)}>{label}</button>;
}

function name(data: LegendsData, kind: Link['kind'], id: number | null): string {
  return id === null ? lt('legends.search.unknown') : data.names[`${kind}:${id}`] ?? `#${id}`;
}

function markText(m: SourceMark, data: LegendsData): string | null {
  if (m.via === 'public') return null;
  if (m.via === 'witnessed') return lt('legends.mark.witnessed');
  const base = m.sourcePersonId === null ? lt('legends.mark.told_public', { season: m.seasonYear }) : lt('legends.mark.told', { source: name(data, 'person', m.sourcePersonId), season: m.seasonYear });
  return m.reported ? `${lt('legends.mark.reported')}: ${base}` : base;
}

/** A line's text: its template with the event's payload slots and named links filled. */
export function lineText(l: PageLine, data: LegendsData): string {
  const tpl = data.lineText[l.textKey] ?? STRINGS[l.textKey] ?? l.textKey;
  const slots: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(l.params)) if (v !== null) slots[k] = typeof v === 'boolean' ? String(v) : v;
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

function Line({ line, data, onOpen }: { line: PageLine; data: LegendsData; onOpen(l: Link): void }) {
  const mark = markText(line.mark, data);
  return (
    <li className="gm-line" data-event={line.eventId} data-reversed={line.reversed || undefined}>
      <span>{lineText(line, data)}</span>
      {line.links.filter((k) => k.kind === 'person' || k.kind === 'team').map((k) => <span key={keyOf(k)}> <NameLink link={k} data={data} onOpen={onOpen} /></span>)}
      {line.reversed ? <em> {lt('legends.page.reversed')}</em> : null}
      {mark ? <small className="gm-source" data-mark={line.mark.via}> {mark}</small> : null}
    </li>
  );
}

function PageView({ page, data, onOpen }: { page: PageData; data: LegendsData; onOpen(l: Link): void }) {
  const header = name(data, page.link.kind, page.link.id);
  const tabPrefix = page.link.kind === 'person' || page.link.kind === 'team' ? `legends.tab.${page.link.kind}.` : null;
  return (
    <article data-view="page" data-link={keyOf(page.link)}>
      <h2>{header}</h2>
      {page.years ? <p className="gm-line">{lt('legends.page.years', page.years)}</p> : null}
      {page.labels.length ? <p className="gm-line">{lt('legends.page.labels')}: {page.labels.map((l) => data.lineText[l] ?? STRINGS[l] ?? l).join(', ')}</p> : null}
      {tabPrefix && page.tabs.length ? <nav aria-label={header}>{page.tabs.map((t) => <span key={t.id} className="gm-tab" data-tab={t.id}>{lt(tabPrefix + t.id)} ({t.count}) </span>)}</nav> : null}
      {page.summariesOnly ? <p className="gm-line">{lt('legends.page.summaries')}</p> : null}
      {page.empty ? <p className="gm-line">{lt('legends.page.empty')}</p> : null}
      {page.seasons.map((s) => (
        <section key={s.seasonYear} data-season={s.seasonYear}>
          <h3>{lt('legends.page.season', { season: s.seasonYear })}</h3>
          {s.notable.length ? <><h4>{lt('legends.page.notable')}</h4><ul>{s.notable.map((l) => <Line key={l.eventId} line={l} data={data} onOpen={onOpen} />)}</ul></> : null}
          <ul>{s.lines.map((l) => <Line key={l.eventId} line={l} data={data} onOpen={onOpen} />)}</ul>
        </section>
      ))}
    </article>
  );
}

function ChronicleView({ c, data }: { c: ChronicleData; data: LegendsData }) {
  const summary = c.summary ? lt(c.summary.textKey, { ...c.summary.params, team: name(data, 'team', Number(c.summary.params['team'])) }) : null;
  return (
    <article data-view="chronicle">
      <h2>{lt('legends.chronicle.caption', { season: c.seasonYear })}</h2>
      {summary ? <p className="gm-line" data-summary>{summary}</p> : null}
      {c.seasonLevelOnly ? <p className="gm-line">{lt('legends.chronicle.season_level')}</p> : null}
      {c.sections.map((s) => (
        <section key={`${s.section}:${s.week}`} data-section={s.section}>
          <h3>{s.section === 'week' ? lt('legends.chronicle.week', { week: s.week }) : lt(`legends.chronicle.${s.section}`)}</h3>
          <ul>{s.entries.map((e) => <li key={e.eventId} data-event={e.eventId} data-guaranteed={e.guaranteed || undefined}>{data.lineText[`line.${e.type}`] ?? e.type}</li>)}</ul>
          {s.more.length ? <details><summary>{lt('legends.chronicle.more', { n: s.more.length })}</summary><ul>{s.more.map((e) => <li key={e.eventId} data-event={e.eventId}>{data.lineText[`line.${e.type}`] ?? e.type}</li>)}</ul></details> : null}
        </section>
      ))}
    </article>
  );
}

const fx = (v: number, d = 1) => v.toFixed(d);

function EraView({ e, data, onOpen }: { e: EraData; data: LegendsData; onOpen(l: Link): void }) {
  return (
    <article data-view="eras">
      {e.blocks.map((b) => (
        <section key={b.index} data-block={b.index}>
          <h3>{lt('legends.era.block', { first: b.firstSeason, last: b.lastSeason })} {b.partial ? lt('legends.era.partial') : ''}</h3>
          {b.rates ? <p className="gm-line">{lt('legends.era.rates', { points: fx(b.rates.pointsPerTeamGame), turnovers: fx(b.rates.turnoversPerTeamGame), penalties: fx(b.rates.penaltiesPerTeamGame), ypp: fx(b.rates.yardsPerPlay), pass: fx(b.rates.passShare, 3) })}</p> : null}
          {b.ruleMarkers.map((m) => <p key={m.seasonYear} className="gm-line" data-rule={m.ruleSetId}>{lt('legends.era.rule', { season: m.seasonYear, ruleSet: m.ruleSetId })}</p>)}
          <table className="gm-table">
            <thead><tr>{['team', 'record', 'share', 'titles', 'conference', 'coaches', 'drought', 'dynasty'].map((k) => <th key={k} scope="col">{lt(`legends.era.${k}`)}</th>)}</tr></thead>
            <tbody>
              {b.teams.map((t) => (
                <tr key={t.teamId} data-team={t.teamId} data-dynasty={t.dynasty || undefined}>
                  <th scope="row"><NameLink link={{ kind: 'team', id: t.teamId }} data={data} onOpen={onOpen} /></th>
                  <td>{`${t.wins}-${t.losses}-${t.ties}`}</td>
                  <td>{t.winShare === null ? '' : t.winShare.toFixed(3)}</td>
                  <td>{t.titles}</td>
                  <td>{t.conferenceTitles}</td>
                  <td>{t.headCoaches.length}</td>
                  <td>{t.seasonsSinceTitle === null ? lt('legends.era.never') : t.seasonsSinceTitle}</td>
                  <td>{t.dynasty ? lt('legends.era.dynasty') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </article>
  );
}

function TreeView({ t, data, onOpen }: { t: TreeData; data: LegendsData; onOpen(l: Link): void }) {
  return (
    <article data-view="tree">
      <h2><NameLink link={{ kind: 'person', id: t.rootId }} data={data} onOpen={onOpen} /></h2>
      <p className="gm-line">{lt('legends.tree.caption', { depth: t.depth, n: t.headCoachesProduced })}</p>
      <ul>
        {t.nodes.map((n) => (
          <li key={`${n.parentId}:${n.personId}`} data-person={n.personId} data-level={n.level} hidden={!n.expanded || undefined} style={{ marginInlineStart: `${(n.level - 1) * 1.5}em` }}>
            <NameLink link={{ kind: 'person', id: n.personId }} data={data} onOpen={onOpen} />
            {n.underParent.map((u) => <span key={`${u.teamId}:${u.role}`}> {lt('legends.tree.under', { role: u.role, first: u.firstSeason, last: u.lastSeason })}</span>)}
            {n.becameHeadCoach ? <strong> {lt('legends.tree.head')}</strong> : null}
            {n.laterChairs.map((c) => <div key={`${c.teamId}:${c.role}`} className="gm-line">{lt('legends.tree.later', { role: c.role, team: name(data, 'team', c.teamId), first: c.firstSeason, last: c.lastSeason })}</div>)}
          </li>
        ))}
      </ul>
    </article>
  );
}

function RivalryView({ r, data }: { r: RivalryData; data: LegendsData }) {
  const p = r.page;
  if (!r.exists || !p) return <p className="gm-line">{lt('legends.rivalry.none')}</p>;
  const team = (id: number | null) => (id === null ? lt('legends.rivalry.no_streak') : name(data, 'team', id));
  return (
    <article data-view="rivalry">
      <p className="gm-line">{lt('legends.rivalry.series', { a: team(p.teamA), wa: p.winsA, b: team(p.teamB), wb: p.winsB, t: p.ties })}</p>
      {p.first && p.last ? <p className="gm-line">{lt('legends.rivalry.span', { first: p.first.seasonYear, last: p.last.seasonYear })}</p> : null}
      <p className="gm-line">{lt('legends.rivalry.streak', { team: team(p.current.teamId), n: p.current.games })}</p>
      <p className="gm-line" data-longest={p.longest.games}>{lt('legends.rivalry.longest', { team: team(p.longest.teamId), n: p.longest.games })}</p>
      {p.largestA ? <p className="gm-line">{lt('legends.rivalry.margin', { team: team(p.teamA), margin: p.largestA.margin, season: p.largestA.seasonYear })}</p> : null}
      {p.largestB ? <p className="gm-line">{lt('legends.rivalry.margin', { team: team(p.teamB), margin: p.largestB.margin, season: p.largestB.seasonYear })}</p> : null}
      {p.trophyKey ? <p className="gm-line">{lt('legends.rivalry.trophy', { trophy: data.lineText[p.trophyKey] ?? p.trophyKey })}</p> : null}
      <ul>{p.coaches.map((c) => <li key={`${c.personId}:${c.teamId}`}>{lt('legends.rivalry.coach', { coach: name(data, 'person', c.personId), team: team(c.teamId), w: c.wins, l: c.losses, t: c.ties })}</li>)}</ul>
      <ul>{p.byVenue.map((v) => <li key={String(v.venueId)}>{lt('legends.rivalry.venue', { venue: v.venueId === null ? lt('legends.search.unknown') : `#${v.venueId}`, n: v.meetings })}</li>)}</ul>
    </article>
  );
}

function RecordsView({ r, data, onOpen, provisional }: { r: RecordsData; data: LegendsData; onOpen(l: Link): void; provisional: (factId: string) => boolean }) {
  return (
    <article data-view="records">
      {r.lists.map((l) => (
        <section key={`${l.categoryId}:${l.scope}`} data-record={`${l.categoryId}:${l.scope}`}>
          <h3>{lt(`legends.rec.${l.categoryId}`)}: {lt(`legends.records.scope.${l.scope}`)}</h3>
          {l.minimum ? <p className="gm-line">{lt(l.minimum.perTeamGame ? 'legends.records.min_per_game' : 'legends.records.min_total', { value: l.minimum.value, per: l.minimum.per })}{provisional(l.minimum.factId) ? ` ${lt('legends.records.provisional', { fact: l.minimum.factId })}` : ''}</p> : null}
          {(['thisWorld', 'allTime'] as const).map((tab) => (
            <div key={tab} data-tab={tab}>
              <h4>{lt(tab === 'thisWorld' ? 'legends.records.this_world' : 'legends.records.all_time')}</h4>
              {l[tab].length === 0 ? <p className="gm-line">{lt('legends.records.empty')}</p> : (
                <ol>{l[tab].map((x) => (
                  <li key={`${x.holderId}:${x.seasonYear}:${x.gameId ?? ''}`} value={x.rank}>
                    {x.imported ? <span>{name(data, 'person', x.holderId)} ({lt('legends.records.imported')})</span> : <NameLink link={{ kind: 'person', id: x.holderId }} data={data} onOpen={onOpen} />}
                    {` ${Number.isInteger(x.value) ? x.value : x.value.toFixed(2)} (${x.seasonYear})`}
                  </li>
                ))}</ol>
              )}
            </div>
          ))}
          {l.vacated.map((x) => <p key={`v${x.holderId}:${x.seasonYear}`} className="gm-line" data-vacated>{lt('legends.records.vacated', { holder: name(data, 'person', x.holderId), value: x.value, season: x.seasonYear })}</p>)}
        </section>
      ))}
    </article>
  );
}

function SearchView({ s, data, onOpen, onSearch }: { s: SearchData; data: LegendsData; onOpen(l: Link): void; onSearch?(text: string): void }) {
  return (
    <article data-view="search">
      <label>{lt('legends.search.label')} <input type="search" defaultValue={s.text} onChange={(e) => onSearch?.(e.currentTarget.value)} /></label>
      {s.rows.length === 0 ? <p className="gm-line">{lt('legends.search.empty')}</p> : (
        <ul>{s.rows.map((r) => {
          const full = [r.first, r.last].filter(Boolean).join(' ');
          const link: Link = { kind: r.kind, id: r.id };
          return (
            <li key={keyOf(link)} data-match={r.match}>
              <button type="button" className="gm-link" onClick={() => onOpen(link)}>
                {r.kind === 'person'
                  ? lt('legends.search.row', { name: full, born: r.birthYear ?? lt('legends.search.unknown'), role: r.role ?? lt('legends.search.unknown'), team: name(data, 'team', r.lastTeamId) })
                  : lt('legends.search.row_team', { name: full })}
              </button>
            </li>
          );
        })}</ul>
      )}
    </article>
  );
}

export function LegendsScreen(p: LegendsScreenProps & { provisional?: (factId: string) => boolean }): ReactNode {
  const d = p.data;
  const waiting = <p className="gm-line">{lt('legends.waiting')}</p>;
  let body: ReactNode;
  switch (p.tab) {
    case 'page': body = d.page ? <PageView page={d.page} data={d} onOpen={p.onOpen} /> : waiting; break;
    case 'chronicle': body = d.chronicle ? <ChronicleView c={d.chronicle} data={d} /> : waiting; break;
    case 'eras': body = d.eras ? <EraView e={d.eras} data={d} onOpen={p.onOpen} /> : waiting; break;
    case 'tree': body = d.tree ? <TreeView t={d.tree} data={d} onOpen={p.onOpen} /> : waiting; break;
    case 'rivalry': body = d.rivalry ? <RivalryView r={d.rivalry} data={d} /> : waiting; break;
    case 'records': body = d.records ? <RecordsView r={d.records} data={d} onOpen={p.onOpen} provisional={p.provisional ?? (() => true)} /> : waiting; break;
    case 'search': body = d.search ? <SearchView s={d.search} data={d} onOpen={p.onOpen} onSearch={p.onSearch} /> : waiting; break;
  }
  return (
    <div className="gm-screen" data-screen="legends">
      <nav aria-label={lt('legends.tabs')} role="tablist">
        {p.onBack ? <button type="button" onClick={p.onBack}>{lt('legends.back')}</button> : null}
        {p.onForward ? <button type="button" onClick={p.onForward}>{lt('legends.forward')}</button> : null}
        {LEGENDS_TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={t === p.tab} data-tab={t} onClick={() => p.onTab(t)}>{lt(`legends.tab.${t}`)}</button>
        ))}
      </nav>
      {body}
    </div>
  );
}
