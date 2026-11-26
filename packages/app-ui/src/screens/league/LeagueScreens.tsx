// League pages (unbuilt-work item 5; C1, C2, C3, C8, C9, C10, T3): standings with the playoff picture and,
// at the college level, rankings and bowls; the league schedule; the team page; the transaction wire; the
// news page; awards, records and history. They draw read models only and hold no football logic. Every
// control is a button, so the pages work by keyboard alone (Q1.5.2), and every team name is a button that
// opens its team page. Colours come from the theme tokens, so the Classic skin applies (PV-18).
import type { ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import TEXT from './text.json';
import type {
  BracketLine, NewsView, RecordsView, ScheduleGame, ScheduleView, StandingsGroup, StandingsLine, StandingsView, TeamPageView, TeamRef,
  TransactionLine, TransactionsView, WLT,
} from './types.ts';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;

/** League text by id with `{slot}` filled; an unknown id shows itself so a gap is visible (O6.6.1). */
export function lgt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}
export const leagueTextIds = (): string[] => Object.keys(STRINGS);

/** Text owned by other packages (news templates, event line templates, content names), when the host has it. */
export type TextOf = (key: string) => string | undefined;

/** Fill a template key from another package with params; the key shows when no text is known. */
export function templateText(key: string, params: Readonly<Record<string, string | number | boolean | null>>, text?: TextOf): string {
  const tpl = text?.(key) ?? STRINGS[key] ?? key;
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in params && params[k] !== null ? String(params[k]) : m));
}

export const recordText = (r: WLT): string => lgt(r.t ? 'league.record' : 'league.record.no_ties', { w: r.w, l: r.l, t: r.t });
/** Winning percentage as printed in standings: three places, no leading zero below one. */
export const pctText = (p: number): string => (p >= 1 ? p.toFixed(3) : p.toFixed(3).replace(/^0/, ''));

const panel = { border: `1px solid ${v('line.default')}`, background: v('surface.panel'), padding: '8px', margin: '8px 0' };
const cell = { padding: '2px 6px', textAlign: 'right' as const };
const left = { ...cell, textAlign: 'left' as const };

export type Open = (teamId: number) => void;

function teamName(teams: Readonly<Record<string, TeamRef>>, id: number | null): string {
  return id === null ? '' : teams[String(id)]?.name ?? `#${id}`;
}

export function TeamButton({ id, teams, onOpen, short }: { id: number; teams: Readonly<Record<string, TeamRef>>; onOpen: Open; short?: boolean }) {
  const t = teams[String(id)];
  return <button type="button" className="gm-link" data-team={id} onClick={() => onOpen(id)}>{t ? (short ? t.abbreviation : t.name) : `#${id}`}</button>;
}

function Tabs<T extends string>({ label, tabs, current, onTab, prefix }: { label: string; tabs: readonly T[]; current: T; onTab(t: T): void; prefix: string }) {
  return (
    <nav aria-label={label} className="gm-tabs">
      {tabs.map((t) => <button key={t} type="button" className="gm-tab" data-tab={t} aria-pressed={t === current} onClick={() => onTab(t)}>{lgt(prefix + t)}</button>)}
    </nav>
  );
}

const Waiting = () => <p className="gm-line" data-waiting>{lgt('league.waiting')}</p>;

// --- Standings ------------------------------------------------------------------------------------

export const STANDINGS_TABS = ['divisions', 'conferences', 'playoffs', 'rankings', 'ties'] as const;
export type StandingsTab = (typeof STANDINGS_TABS)[number];
export const parseStandingsTab = (s: string | undefined): StandingsTab => ((STANDINGS_TABS as readonly string[]).includes(s ?? '') ? s as StandingsTab : 'divisions');

function tabsFor(view: StandingsView): StandingsTab[] {
  const hasDivisions = view.groups.some((g) => g.kind === 'division');
  return STANDINGS_TABS.filter((t) => {
    if (t === 'divisions') return hasDivisions;
    if (t === 'rankings') return view.college !== null;
    if (t === 'ties') return view.tieNotes.length > 0;
    if (t === 'playoffs') return view.seeds.length > 0 || view.bracket.length > 0;
    return true;
  });
}

function StandingsTable({ group, view, onOpen }: { group: StandingsGroup; view: StandingsView; onOpen: Open }) {
  const byId = new Map(view.lines.map((l) => [l.teamId, l]));
  const pro = view.level === 'pro';
  const showOdds = view.lines.some((l) => l.odds);
  return (
    <section style={panel} data-group={group.groupId} data-final={group.final || undefined}>
      <h3>{group.name}</h3>
      {!group.final ? <p className="gm-line" data-not-final>{lgt('standings.not_final')}</p> : null}
      <table>
        <thead>
          <tr>
            {view.college ? <th style={cell}>{lgt('standings.col.rank')}</th> : null}
            <th style={left}>{lgt('standings.col.team')}</th><th style={cell}>{lgt('standings.col.record')}</th><th style={cell}>{lgt('standings.col.pct')}</th>
            <th style={cell}>{lgt('standings.col.pf')}</th><th style={cell}>{lgt('standings.col.pa')}</th><th style={cell}>{lgt('standings.col.net')}</th>
            <th style={cell}>{lgt('standings.col.home')}</th><th style={cell}>{lgt('standings.col.road')}</th>
            {pro ? <th style={cell}>{lgt('standings.col.div')}</th> : null}<th style={cell}>{lgt('standings.col.conf')}</th>
            <th style={cell}>{lgt('standings.col.streak')}</th><th style={cell}>{lgt('standings.col.last')}</th>
            {pro ? <><th style={cell}>{lgt('standings.col.sov')}</th><th style={cell}>{lgt('standings.col.sos')}</th></> : null}
            {showOdds ? <th style={cell}>{lgt('standings.col.odds')}</th> : null}
          </tr>
        </thead>
        <tbody>
          {group.teamIds.map((id) => {
            const l = byId.get(id);
            return l ? <StandingsRow key={id} l={l} view={view} pro={pro} showOdds={showOdds} onOpen={onOpen} /> : null;
          })}
        </tbody>
      </table>
    </section>
  );
}

function StandingsRow({ l, view, pro, showOdds, onOpen }: { l: StandingsLine; view: StandingsView; pro: boolean; showOdds: boolean; onOpen: Open }) {
  return (
    <tr data-team-row={l.teamId}>
      {view.college ? <td style={cell}>{l.ranking ?? ''}</td> : null}
      <td style={left}>
        <TeamButton id={l.teamId} teams={view.teams} onOpen={onOpen} />
        {l.marks.map((m) => <small key={m} className="gm-mark" data-mark={m} style={{ marginLeft: '4px', color: v(m === 'eliminated' ? 'text.muted' : 'accent.default') }}>{lgt(`standings.mark.${m}`)}</small>)}
      </td>
      <td style={cell}>{recordText(l.record)}</td><td style={cell}>{pctText(l.pct)}</td>
      <td style={cell}>{l.pointsFor}</td><td style={cell}>{l.pointsAgainst}</td><td style={cell}>{l.netPoints > 0 ? `+${l.netPoints}` : l.netPoints}</td>
      <td style={cell}>{recordText(l.home)}</td><td style={cell}>{recordText(l.road)}</td>
      {pro ? <td style={cell}>{recordText(l.division)}</td> : null}<td style={cell}>{recordText(l.conference)}</td>
      <td style={cell}>{l.streakKind ? `${l.streakKind}${l.streakLength}` : ''}</td><td style={cell}>{recordText(l.lastFive)}</td>
      {pro ? <><td style={cell}>{pctText(l.strengthOfVictory)}</td><td style={cell}>{pctText(l.strengthOfSchedule)}</td></> : null}
      {showOdds ? <td style={cell}>{l.odds ? `${Math.round(l.odds.playoffs * 100)}%` : ''}</td> : null}
    </tr>
  );
}

function Bracket({ games, view, onOpen }: { games: readonly BracketLine[]; view: StandingsView; onOpen: Open }) {
  const rounds = [...new Set(games.map((g) => g.round))].sort((a, b) => a - b);
  return (
    <section style={panel} data-bracket>
      <h3>{lgt('standings.bracket')}</h3>
      {rounds.map((r) => (
        <div key={r} data-round={r}>
          <h4>{lgt('standings.bracket.round', { round: r })}</h4>
          <ul>
            {games.filter((g) => g.round === r).map((g) => (
              <li key={g.key} data-game={g.key}>
                {lgt('standings.bracket.game', { s1: g.seeds[0], t1: teamName(view.teams, g.teams[0]), s2: g.seeds[1], t2: teamName(view.teams, g.teams[1]) })}{' '}
                <small>{g.host === null ? lgt('standings.bracket.neutral') : lgt('standings.bracket.host', { team: teamName(view.teams, g.host) })}</small>
                {g.winner !== null ? <> <strong>{lgt('standings.bracket.winner', { team: teamName(view.teams, g.winner) })}</strong></> : null}
                {' '}<TeamButton id={g.teams[0]} teams={view.teams} onOpen={onOpen} short /> <TeamButton id={g.teams[1]} teams={view.teams} onOpen={onOpen} short />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Playoffs({ view, onOpen }: { view: StandingsView; onOpen: Open }) {
  return (
    <>
      {view.seeds.map((s) => (
        <section key={s.conferenceId} style={panel} data-seeds={s.conferenceId}>
          <h3>{lgt('standings.seeds', { conference: s.name })}</h3>
          <ol>
            {s.seeds.map((id, i) => (
              <li key={id} data-seed={i + 1}>
                <TeamButton id={id} teams={view.teams} onOpen={onOpen} />
                {s.divisionWinners.includes(id) ? <small> {lgt('standings.division_winner')}</small> : null}
              </li>
            ))}
          </ol>
          {s.rest.length ? <p className="gm-line">{lgt('standings.hunt')}: {s.rest.map((id) => <span key={id}><TeamButton id={id} teams={view.teams} onOpen={onOpen} short />{' '}</span>)}</p> : null}
        </section>
      ))}
      {view.bracket.length ? <Bracket games={view.bracket} view={view} onOpen={onOpen} /> : null}
      {view.champion !== null ? <p className="gm-line" data-champion><strong>{lgt('standings.champion', { team: teamName(view.teams, view.champion) })}</strong></p> : null}
    </>
  );
}

function Rankings({ view, onOpen, text }: { view: StandingsView; onOpen: Open; text?: TextOf }) {
  const c = view.college!;
  const names = (ids: readonly number[]) => ids.map((id) => teamName(view.teams, id)).join(', ');
  return (
    <>
      <section style={panel} data-rankings>
        <h3>{lgt('standings.rankings')}</h3>
        {c.rankings.length ? (
          <ol>{c.rankings.map((r) => (
            <li key={r.teamId} data-rank={r.rank}>
              <TeamButton id={r.teamId} teams={view.teams} onOpen={onOpen} /> {recordText(r.record)}{' '}
              <small>{lgt('standings.ranking.sos', { value: pctText(r.scheduleStrength) })}{r.bestWins.length ? `; ${lgt('standings.ranking.best_wins', { teams: names(r.bestWins) })}` : ''}</small>
            </li>
          ))}</ol>
        ) : <p className="gm-line">{lgt('league.none')}</p>}
      </section>
      {c.poll.length ? (
        <section style={panel} data-poll>
          <h3>{lgt('standings.poll')}</h3>
          <ol>{c.poll.map((p) => <li key={p.teamId} data-rank={p.rank}><TeamButton id={p.teamId} teams={view.teams} onOpen={onOpen} /> <small>{lgt('standings.poll.points', { points: p.points })}</small></li>)}</ol>
        </section>
      ) : null}
      {c.titleGames.length ? (
        <section style={panel} data-title-games>
          <h3>{lgt('standings.title_games')}</h3>
          <ul>{c.titleGames.map((g) => <li key={g.conferenceId}>{lgt('standings.title_game', { t1: teamName(view.teams, g.teams[0]), t2: teamName(view.teams, g.teams[1]) })}{g.champion !== null ? ` (${lgt('standings.bracket.winner', { team: teamName(view.teams, g.champion) })})` : ''}</li>)}</ul>
        </section>
      ) : null}
      {view.bracket.length ? <Bracket games={view.bracket} view={view} onOpen={onOpen} /> : null}
      {c.bowls.length ? (
        <section style={panel} data-bowls>
          <h3>{lgt('standings.bowls')}</h3>
          <p className="gm-line">{lgt('standings.bowl.eligible', { n: c.eligible.length })}</p>
          <ul>{c.bowls.map((b) => (
            <li key={b.bowlId} data-bowl={b.bowlId}>
              <strong>{templateText(b.nameKey, {}, text)}</strong>:{' '}
              {b.teams ? <><TeamButton id={b.teams[0]} teams={view.teams} onOpen={onOpen} /> <TeamButton id={b.teams[1]} teams={view.teams} onOpen={onOpen} /></> : lgt('standings.bowl.unfilled')}
            </li>
          ))}</ul>
          {c.shortFill.length ? <p className="gm-line">{lgt('standings.bowl.short_fill', { teams: names(c.shortFill) })}</p> : null}
        </section>
      ) : null}
    </>
  );
}

export interface StandingsScreenProps { view: StandingsView | null; tab: StandingsTab; onTab(t: StandingsTab): void; onOpen: Open; text?: TextOf }

export function StandingsScreen({ view, tab, onTab, onOpen, text }: StandingsScreenProps) {
  if (!view) return <article data-screen="league.standings"><Waiting /></article>;
  const tabs = tabsFor(view);
  const current = tabs.includes(tab) ? tab : tabs[0]!;
  const groups = view.groups.filter((g) => (current === 'divisions' ? g.kind === 'division' : g.kind === 'conference'));
  let body: ReactNode;
  if (current === 'playoffs') body = <Playoffs view={view} onOpen={onOpen} />;
  else if (current === 'rankings') body = <Rankings view={view} onOpen={onOpen} {...(text ? { text } : {})} />;
  else if (current === 'ties') {
    body = (
      <ul data-ties>{view.tieNotes.map((n, i) => (
        <li key={i}>{lgt('standings.tie', { list: lgt(n.listKey), step: lgt(n.stepKey), teams: n.teamIds.map((id) => teamName(view.teams, id)).join(', ') })}
          {n.advanced !== null ? `; ${lgt('standings.tie.advanced', { team: teamName(view.teams, n.advanced) })}` : ''}</li>
      ))}</ul>
    );
  } else body = groups.map((g) => <StandingsTable key={g.groupId} group={g} view={view} onOpen={onOpen} />);
  return (
    <article data-screen="league.standings" data-level={view.level}>
      <h2>{lgt('standings.title', { season: view.seasonYear })}</h2>
      <Tabs label={lgt('standings.tabs')} tabs={tabs} current={current} onTab={onTab} prefix="standings.tab." />
      {view.uncertain ? <p className="gm-line" data-uncertain style={{ color: v('state.caution') }}>{lgt('standings.uncertain')}</p> : null}
      {body}
      <p className="gm-line"><small>{lgt('standings.games_counted', { n: view.gamesCounted })}</small></p>
    </article>
  );
}

// --- Schedule -------------------------------------------------------------------------------------

function GameLine({ g, teams, onOpen }: { g: ScheduleGame; teams: Readonly<Record<string, TeamRef>>; onOpen: Open }) {
  const [home, away] = g.teamIds;
  const label = g.score
    ? lgt('schedule.score', { away: teamName(teams, away), as: g.score[1], home: teamName(teams, home), hs: g.score[0] })
    : lgt(g.neutralSite ? 'schedule.game.neutral' : 'schedule.game', { away: teamName(teams, away), home: teamName(teams, home) });
  return (
    <li data-game={g.gameId} data-status={g.status}>
      {label}{' '}
      {g.status !== 'final' ? <small>{lgt(`schedule.status.${g.status}`)}, {lgt('schedule.day', { day: g.kickoff.dayIndex })}</small> : null}
      {g.venueName ? <small> {g.venueName}</small> : null}
      {g.conferenceGame ? <small> {lgt('schedule.conference')}</small> : null}
      {' '}<TeamButton id={away} teams={teams} onOpen={onOpen} short /> <TeamButton id={home} teams={teams} onOpen={onOpen} short />
    </li>
  );
}

export interface ScheduleScreenProps {
  view: ScheduleView | null;
  week: number | null;
  onWeek(week: number): void;
  onTeam(teamId: number | null): void;
  onOpen: Open;
}

export function ScheduleScreen({ view, week, onWeek, onTeam, onOpen }: ScheduleScreenProps) {
  if (!view) return <article data-screen="league.schedule"><Waiting /></article>;
  if (view.teamId !== null) {
    return (
      <article data-screen="league.schedule" data-team={view.teamId}>
        <h2>{lgt('schedule.team', { team: teamName(view.teams, view.teamId) })}</h2>
        <button type="button" onClick={() => onTeam(null)}>{lgt('schedule.team.clear')}</button>
        <table style={panel}>
          <thead><tr>
            <th style={left}>{lgt('schedule.col.week')}</th><th style={left}>{lgt('schedule.col.opponent')}</th><th style={left}>{lgt('schedule.col.site')}</th>
            <th style={cell}>{lgt('schedule.col.rest')}</th><th style={left}>{lgt('schedule.col.week_type')}</th><th style={left}>{lgt('schedule.col.result')}</th><th style={cell}>{lgt('schedule.col.opp_record')}</th>
          </tr></thead>
          <tbody>{view.teamRows.map((r) => {
            const side = r.game && r.game.teamIds[0] === view.teamId ? 0 : 1;
            return (
              <tr key={`${r.game?.phase ?? 'bye'}:${r.week}`} data-week={r.week} data-tag={r.tag}>
                <td style={left}>{r.game?.phase === 'preseason' ? lgt('league.week.preseason', { week: r.week }) : lgt('league.week', { week: r.week })}</td>
                <td style={left}>{r.opponentId !== null ? <TeamButton id={r.opponentId} teams={view.teams} onOpen={onOpen} /> : lgt('schedule.tag.bye')}</td>
                <td style={left}>{r.site ? lgt(`schedule.site.${r.site}`) : ''}{r.game?.conferenceGame ? ` (${lgt('schedule.conference')})` : ''}</td>
                <td style={cell}>{r.restDays !== null ? lgt('schedule.rest', { days: r.restDays }) : ''}</td>
                <td style={left}>{lgt(`schedule.tag.${r.tag}`)}</td>
                <td style={left}>{r.result && r.game?.score ? lgt('schedule.result', { result: r.result, mine: r.game.score[side]!, theirs: r.game.score[side === 0 ? 1 : 0]! }) : r.game && r.game.status !== 'final' ? lgt(`schedule.status.${r.game.status}`) : ''}</td>
                <td style={cell}>{r.opponentRecord ? recordText(r.opponentRecord) : ''}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </article>
    );
  }
  const weeks = view.weeks.map((w) => w.week);
  const shown = week !== null && weeks.includes(week) ? week : (view.weeks.find((w) => w.games.some((g) => g.status !== 'final')) ?? view.weeks[view.weeks.length - 1])?.week ?? null;
  const w = view.weeks.find((x) => x.week === shown) ?? null;
  const i = shown === null ? -1 : weeks.indexOf(shown);
  const preseason = !!w && w.games.length > 0 && w.games.every((g) => g.phase === 'preseason');
  return (
    <article data-screen="league.schedule">
      <h2>{lgt('schedule.title', { season: view.seasonYear })}</h2>
      {w ? (
        <section style={panel} data-week={w.week}>
          <nav aria-label={lgt('schedule.title', { season: view.seasonYear })}>
            <button type="button" disabled={i <= 0} onClick={() => onWeek(weeks[i - 1]!)}>{lgt('league.prev')}</button>{' '}
            <strong>{lgt(preseason ? 'league.week.preseason' : 'league.week', { week: w.week })}</strong>{' '}
            <button type="button" disabled={i >= weeks.length - 1} onClick={() => onWeek(weeks[i + 1]!)}>{lgt('league.next')}</button>
          </nav>
          <ul>{w.games.map((g) => <GameLine key={g.gameId} g={g} teams={view.teams} onOpen={onOpen} />)}</ul>
          {w.byes.length ? <p className="gm-line" data-byes>{lgt('schedule.byes', { teams: w.byes.map((id) => teamName(view.teams, id)).join(', ') })}</p> : null}
        </section>
      ) : <p className="gm-line">{lgt('league.none')}</p>}
      <section aria-label={lgt('schedule.team.pick')}>
        <h3>{lgt('schedule.team.pick')}</h3>
        {Object.values(view.teams).sort((a, b) => a.teamId - b.teamId).map((t) => <span key={t.teamId}><button type="button" data-team-schedule={t.teamId} onClick={() => onTeam(t.teamId)}>{t.abbreviation}</button>{' '}</span>)}
      </section>
    </article>
  );
}

// --- Team page ------------------------------------------------------------------------------------

export interface TeamPageProps { view: TeamPageView | null; loaded: boolean; onOpen: Open; onSchedule(teamId: number): void; text?: TextOf }

export function TeamPage({ view, loaded, onOpen, onSchedule, text }: TeamPageProps) {
  if (!view) return <article data-screen="league.team">{loaded ? <p className="gm-line">{lgt('team.unknown')}</p> : <Waiting />}</article>;
  const tx = (k: string) => text?.(k) ?? k;
  const groupsBySituation = new Map<string, typeof view.tendencies[number][]>();
  for (const t of view.tendencies) groupsBySituation.set(t.situationBucket, [...(groupsBySituation.get(t.situationBucket) ?? []), t]);
  return (
    <article data-screen="league.team" data-team={view.teamId}>
      <h2>{lgt('team.title', { team: view.team.name })}</h2>
      <p className="gm-line">{lgt('team.subtitle', { nickname: view.nickname, place: view.place })}</p>
      <p className="gm-line">{[view.competitionName, ...view.groupNames].filter(Boolean).join(', ')}</p>
      <p className="gm-line" data-record><strong>{lgt('team.record', { season: view.seasonYear, record: recordText(view.record) })}</strong></p>
      {view.venue ? <p className="gm-line">{lgt('team.venue', { name: view.venue.name, place: view.venue.place, capacity: view.venue.capacity, roof: view.venue.roof, surface: tx(view.venue.surfaceType) })}</p> : null}
      <p className="gm-line">{lgt('team.resources', { band: view.resourceBand })}</p>
      {view.rivals.length ? <p className="gm-line">{lgt('team.rivals', { teams: '' })}{view.rivals.map((id) => <span key={id}><TeamButton id={id} teams={view.teams} onOpen={onOpen} />{' '}</span>)}</p> : null}
      <button type="button" onClick={() => onSchedule(view.teamId)}>{lgt('team.schedule')}</button>
      <section style={panel} data-results>
        <h3>{lgt('team.results')}</h3>
        {view.results.length ? <ul>{view.results.map((g) => <GameLine key={g.gameId} g={g} teams={view.teams} onOpen={onOpen} />)}</ul> : <p className="gm-line">{lgt('league.none')}</p>}
      </section>
      <section style={panel} data-upcoming>
        <h3>{lgt('team.upcoming')}</h3>
        {view.upcoming.length ? <ul>{view.upcoming.map((g) => <GameLine key={g.gameId} g={g} teams={view.teams} onOpen={onOpen} />)}</ul> : <p className="gm-line">{lgt('league.none')}</p>}
      </section>
      <section style={panel} data-staff>
        <h3>{lgt('team.staff')}</h3>
        <ul>{view.staff.map((s) => <li key={s.jobId} data-job={s.jobId} data-open={s.personId === null || undefined}>{tx(s.catalogueId)}: {s.name ?? <em>{lgt('team.staff.open')}</em>}</li>)}</ul>
        {view.openChairs ? <p className="gm-line" data-open-chairs={view.openChairs}>{lgt('team.staff.open_count', { n: view.openChairs })}</p> : null}
      </section>
      <section style={panel} data-roster>
        <h3>{lgt('team.roster')}</h3>
        <table><tbody>{view.roster.map((r) => (
          <tr key={r.personId} data-person={r.personId}><td style={cell}>{r.jersey ?? ''}</td><td style={left}>{r.position ?? ''}</td><td style={left}>{r.name}</td><td style={left}><small>{tx(r.list)}</small></td></tr>
        ))}</tbody></table>
      </section>
      <section style={panel} data-tendencies>
        <h3>{lgt('team.tendencies')}</h3>
        {view.tendencies.length ? [...groupsBySituation].map(([bucket, list]) => (
          <div key={bucket} data-situation={bucket}>
            <h4>{tx(bucket)}</h4>
            <ul>{list.map((t) => <li key={t.callKey}>{lgt('team.tendency', { call: tx(t.callKey), count: t.count, share: Math.round(t.share * 100) })}</li>)}</ul>
          </div>
        )) : <p className="gm-line">{lgt('team.tendencies.none')}</p>}
      </section>
    </article>
  );
}

// --- Transactions ---------------------------------------------------------------------------------

export const WIRE_FILTERS = ['default', 'all', 'mine', 'opponent', 'division'] as const;
export type WireFilter = (typeof WIRE_FILTERS)[number];
export const parseWireFilter = (s: string | undefined): WireFilter => ((WIRE_FILTERS as readonly string[]).includes(s ?? '') ? s as WireFilter : 'default');

/** C10.1 default: his club, this week's opponent, his division, and players on his ready list. */
export function wireKeeps(l: TransactionLine, f: WireFilter): boolean {
  switch (f) {
    case 'all': return true;
    case 'mine': return l.mine;
    case 'opponent': return l.opponent;
    case 'division': return l.division;
    default: return l.mine || l.opponent || l.division || l.readyList;
  }
}

export interface TransactionsScreenProps { view: TransactionsView | null; filter: WireFilter; onFilter(f: WireFilter): void; onOpen: Open; text?: TextOf }

export function TransactionsScreen({ view, filter, onFilter, onOpen, text }: TransactionsScreenProps) {
  if (!view) return <article data-screen="league.transactions"><Waiting /></article>;
  const shown = view.lines.filter((l) => wireKeeps(l, filter));
  return (
    <article data-screen="league.transactions">
      <h2>{lgt('wire.title')}</h2>
      <Tabs label={lgt('wire.filters')} tabs={WIRE_FILTERS} current={filter} onTab={onFilter} prefix="wire.filter." />
      {shown.length ? (
        <ul>{shown.map((l) => {
          const slots: Record<string, string | number | boolean | null> = { ...l.params, team: teamName(view.teams, l.teamId), person: l.personIds.map((p) => view.people[String(p)] ?? `#${p}`).join(', ') };
          return (
            <li key={l.eventId} data-event={l.eventId} data-type={l.type} data-ready={l.readyList || undefined}>
              <small>{lgt('schedule.day', { day: l.date.dayIndex })}</small>{' '}
              {l.teamId !== null ? <TeamButton id={l.teamId} teams={view.teams} onOpen={onOpen} /> : null}{' '}
              {templateText(l.lineTemplate, slots, text)}{' '}
              {l.personIds.map((p) => <span key={p}>{view.people[String(p)] ?? `#${p}`} </span>)}
              {l.readyList ? <strong style={{ color: v('accent.default') }}>{lgt('wire.ready')}</strong> : null}
            </li>
          );
        })}</ul>
      ) : (
        <p className="gm-line">{lgt('wire.empty_filter')} {filter !== 'all' ? <button type="button" onClick={() => onFilter('all')}>{lgt('wire.filter.all')}</button> : null}</p>
      )}
    </article>
  );
}

// --- News -----------------------------------------------------------------------------------------

export interface NewsScreenProps { view: NewsView | null; kind: string | null; onKind(kind: string | null): void; onOpen: Open; text?: TextOf }

export function NewsScreen({ view, kind, onKind, onOpen, text }: NewsScreenProps) {
  if (!view) return <article data-screen="league.news"><Waiting /></article>;
  const shown = kind === null ? view.lines : view.lines.filter((l) => l.kind === kind);
  return (
    <article data-screen="league.news">
      <h2>{lgt('news.title')}</h2>
      <nav aria-label={lgt('news.filters')} className="gm-tabs">
        <button type="button" className="gm-tab" aria-pressed={kind === null} onClick={() => onKind(null)}>{lgt('league.all')}</button>
        {view.kinds.map((k) => <button key={k} type="button" className="gm-tab" data-kind={k} aria-pressed={kind === k} onClick={() => onKind(k)}>{text?.(`news.kind.${k}`) ?? k}</button>)}
      </nav>
      {shown.length ? (
        <ul>{shown.map((l) => {
          const slots = { ...l.params, team: l.teamIds.map((t) => teamName(view.teams, t)).join(', '), person: l.personIds.map((p) => view.people[String(p)] ?? `#${p}`).join(', ') };
          return (
            <li key={l.newsId} data-news={l.newsId} data-mine={l.mine || undefined}>
              <small>{lgt('schedule.day', { day: l.date.dayIndex })}</small> {templateText(l.templateKey, slots, text)}{' '}
              {l.teamIds.map((t) => <span key={t}><TeamButton id={t} teams={view.teams} onOpen={onOpen} short />{' '}</span>)}
              {l.mine ? <small style={{ color: v('accent.default') }}>{lgt('news.mine')}</small> : null}
            </li>
          );
        })}</ul>
      ) : <p className="gm-line">{lgt('league.none')}</p>}
    </article>
  );
}

// --- Awards, records and history ------------------------------------------------------------------

export const RECORDS_TABS = ['awards', 'records', 'history'] as const;
export type RecordsTab = (typeof RECORDS_TABS)[number];
export const parseRecordsTab = (s: string | undefined): RecordsTab => ((RECORDS_TABS as readonly string[]).includes(s ?? '') ? s as RecordsTab : 'awards');

export interface RecordsScreenProps { view: RecordsView | null; tab: RecordsTab; onTab(t: RecordsTab): void; onSeason(season: number | null): void; onOpen: Open; text?: TextOf }

export function RecordsScreen({ view, tab, onTab, onSeason, onOpen, text }: RecordsScreenProps) {
  if (!view) return <article data-screen="league.records"><Waiting /></article>;
  const seasons = view.history.map((h) => h.seasonYear);
  const holder = (kind: 'player' | 'team', id: number) => (kind === 'team' ? teamName(view.teams, id) : view.people[String(id)] ?? `#${id}`);
  let body: ReactNode;
  if (tab === 'records') {
    body = view.books.length ? view.books.map((b) => (
      <section key={b.recordId} style={panel} data-record={b.recordId}>
        <h3>{lgt('records.book', { statistic: text?.(`stat.${b.statistic}`) ?? b.statistic, scope: b.scope })}</h3>
        <ol>{b.entries.map((e) => (
          <li key={`${e.holderId}:${e.season}:${e.gameId ?? ''}:${e.imported}`} data-imported={e.imported || undefined}>
            {lgt('records.entry', { rank: e.rank, holder: holder(b.holder, e.holderId), value: e.value, season: e.season })}
            {e.seasonGames !== null ? <small> {lgt('records.entry.games', { n: e.seasonGames })}</small> : null}
            {e.imported ? <small> {lgt('records.imported')}</small> : null}
          </li>
        ))}</ol>
      </section>
    )) : <p className="gm-line">{lgt('league.none')}</p>;
  } else if (tab === 'history') {
    body = (
      <ul data-history>{view.history.map((h) => (
        <li key={h.seasonYear} data-season={h.seasonYear}>
          {lgt('records.history.line', { season: h.seasonYear, champion: h.champion !== null ? teamName(view.teams, h.champion) : lgt('records.history.no_champion') })}{' '}
          {h.champion !== null ? <TeamButton id={h.champion} teams={view.teams} onOpen={onOpen} short /> : null}{' '}
          <small>{lgt('records.history.honours', { n: h.honours })}</small>
        </li>
      ))}</ul>
    );
  } else {
    body = (
      <>
        <nav aria-label={lgt('records.tabs')}>
          <button type="button" aria-pressed={view.seasonYear === null} onClick={() => onSeason(null)}>{lgt('records.season.all')}</button>{' '}
          {seasons.map((s) => <span key={s}><button type="button" data-season={s} aria-pressed={view.seasonYear === s} onClick={() => onSeason(s)}>{s}</button>{' '}</span>)}
        </nav>
        {view.honours.length ? (
          <ul>{view.honours.map((h) => {
            const slots = { ...h.params, team: teamName(view.teams, h.teamId), person: h.personIds.map((p) => view.people[String(p)] ?? `#${p}`).join(', '), season: h.seasonYear };
            return (
              <li key={h.eventId} data-event={h.eventId} data-reversed={h.reversed || undefined} style={h.reversed ? { textDecoration: 'line-through', color: v('text.muted') } : undefined}>
                <small>{h.seasonYear}</small> {templateText(h.lineTemplate, slots, text)}{' '}
                {h.personIds.map((p) => <span key={p}>{view.people[String(p)] ?? `#${p}`} </span>)}
                {h.teamId !== null ? <TeamButton id={h.teamId} teams={view.teams} onOpen={onOpen} short /> : null}
                {h.reversed ? <em> {lgt('records.rescinded')}</em> : null}
              </li>
            );
          })}</ul>
        ) : <p className="gm-line">{lgt('league.none')}</p>}
      </>
    );
  }
  return (
    <article data-screen="league.records">
      <h2>{lgt('records.title')}</h2>
      <Tabs label={lgt('records.tabs')} tabs={RECORDS_TABS} current={tab} onTab={onTab} prefix="records.tab." />
      {body}
    </article>
  );
}
