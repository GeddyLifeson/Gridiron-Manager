// League pages (unbuilt-work item 5): each of the six screens renders from read-model data, team names are
// buttons that open the team page, every control is a button so the pages work by keyboard alone (Q1.5.2),
// view options keep the tab, week, team, filter and season (O1.1.3), no text id leaks to the page, the
// registry rows and help text exist, and the app-ui copy of the shapes equals the app-services one.
import { describe, it, expect } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  leagueRoutes, LEAGUE_SCREEN_IDS, teamPath, lgt, leagueTextIds, pctText, recordText, wireKeeps, parseStandingsTab,
  StandingsScreen, ScheduleScreen, TeamPage, TransactionsScreen, NewsScreen, RecordsScreen,
  type StandingsView, type ScheduleView, type TeamPageView, type TransactionsView, type NewsView, type RecordsView, type ScheduleGame, type TransactionLine,
} from '../../../src/screens/league/index.ts';
import type { ScreenProps } from '../../../src/shell/index.ts';
import SCREENS from '../../../src/shell/screens.json';
import SHELL_TEXT from '../../../src/shell/text.json';

const teams = {
  '1': { teamId: 1, name: 'Plains Hawks', abbreviation: 'PLH' }, '2': { teamId: 2, name: 'Harbor Gulls', abbreviation: 'HBG' },
  '3': { teamId: 3, name: 'River Cats', abbreviation: 'RVC' }, '4': { teamId: 4, name: 'Mesa Owls', abbreviation: 'MSO' },
};
const W = (w: number, l: number, t = 0) => ({ w, l, t });
const line = (teamId: number, w: number, l: number, extra: Partial<StandingsView['lines'][number]> = {}): StandingsView['lines'][number] => ({
  teamId, record: W(w, l), pct: w / Math.max(1, w + l), pointsFor: 20 * w, pointsAgainst: 20 * l, netPoints: 20 * (w - l), home: W(w, 0), road: W(0, l), division: W(w, l), conference: W(w, l),
  streakKind: w ? 'W' : 'L', streakLength: 1, lastFive: W(w, l), strengthOfVictory: 0.5, strengthOfSchedule: 0.5, marks: [], odds: null, ranking: null, ...extra,
});
const standings: StandingsView = {
  competitionId: 1, seasonYear: 2030, level: 'pro', teams,
  lines: [line(1, 2, 0, { marks: ['clinched_playoffs'], odds: { playoffs: 0.9, division: 0.6, topSeed: 0.2 } }), line(2, 1, 1), line(3, 1, 1), line(4, 0, 2, { marks: ['eliminated'] })],
  groups: [
    { groupId: 10, name: 'North Conference', kind: 'conference', parentId: null, teamIds: [1, 2, 3, 4], final: false },
    { groupId: 11, name: 'Division 11', kind: 'division', parentId: 10, teamIds: [1, 3], final: true },
    { groupId: 12, name: 'Division 12', kind: 'division', parentId: 10, teamIds: [2, 4], final: false },
  ],
  seeds: [{ conferenceId: 10, name: 'North Conference', seeds: [1, 2], divisionWinners: [1, 2], rest: [3, 4] }],
  tieNotes: [{ listKey: 'standings.list.division', stepKey: 'standings.step.head_to_head', teamIds: [2, 3], advanced: 2 }],
  uncertain: true,
  bracket: [{ key: '10:1:0', round: 1, group: 10, teams: [1, 2], seeds: [1, 2], host: 1, winner: null }],
  champion: null, college: null, gamesCounted: 4,
};
const college: StandingsView = {
  ...standings, level: 'college', seeds: [], tieNotes: [], bracket: [], uncertain: false,
  groups: [{ groupId: 30, name: 'Lakes Conference', kind: 'conference', parentId: null, teamIds: [1, 2, 3, 4], final: true }],
  lines: standings.lines.map((l, i) => ({ ...l, ranking: i < 2 ? i + 1 : null, marks: i === 0 ? ['conference_champion'] : [] })),
  college: {
    rankings: [{ rank: 1, teamId: 1, record: W(2, 0), scheduleStrength: 0.6, bestWins: [3] }], poll: [{ rank: 1, teamId: 1, points: 75 }],
    bowls: [{ bowlId: 7, nameKey: 'bowl.name.7', teams: [3, 4] }, { bowlId: 8, nameKey: 'bowl.name.8', teams: null }], eligible: [3, 4], shortFill: [4],
    titleGames: [{ conferenceId: 30, teams: [1, 2], champion: 1 }],
  },
};
const game = (gameId: number, week: number, home: number, away: number, score: [number, number] | null, extra: Partial<ScheduleGame> = {}): ScheduleGame => ({
  gameId, week, phase: 'regular', kickoff: { seasonYear: 2030, dayIndex: 10 + week * 7 }, teamIds: [home, away], venueName: 'Generated Field', neutralSite: false,
  status: score ? 'final' : 'scheduled', score, conferenceGame: true, ...extra,
});
const schedule: ScheduleView = {
  competitionId: 1, seasonYear: 2030, teams, teamId: null, teamRows: [],
  weeks: [{ week: 1, games: [game(1, 1, 1, 2, [24, 17])], byes: [3, 4] }, { week: 2, games: [game(2, 2, 3, 1, null)], byes: [2, 4] }],
};
const teamSchedule: ScheduleView = {
  ...schedule, teamId: 1,
  teamRows: [
    { week: 1, game: game(1, 1, 1, 2, [24, 17]), opponentId: 2, site: 'home', tag: 'normal', restDays: null, result: 'W', opponentRecord: W(0, 1) },
    { week: 2, game: game(2, 2, 3, 1, null), opponentId: 3, site: 'away', tag: 'short', restDays: 4, result: null, opponentRecord: W(1, 0) },
    { week: 3, game: null, opponentId: null, site: null, tag: 'bye', restDays: null, result: null, opponentRecord: null },
  ],
};
const team: TeamPageView = {
  teamId: 2, team: teams['2'], nickname: 'Gulls', place: 'Harbor City', competitionName: 'Pro League', groupNames: ['North Conference', 'Division 12'],
  venue: { name: 'Generated Field', place: 'Harbor City', capacity: 61000, roof: 'open', surfaceType: 'core:grass' }, resourceBand: 'middle', seasonYear: 2030,
  record: W(1, 1), results: [game(1, 1, 1, 2, [24, 17])], upcoming: [game(3, 3, 2, 4, null)],
  staff: [{ jobId: 1, catalogueId: 'core:pro_hc', personId: 9, name: 'Hal Ruiz', holding: 'permanent' }, { jobId: 2, catalogueId: 'core:pro_qb_coach', personId: null, name: null, holding: null }],
  openChairs: 1, roster: [{ personId: 501, name: 'Dee Okafor', position: 'QB', jersey: 10, list: 'active' }], rivals: [1],
  tendencies: [{ situationBucket: 'first_down', callKey: 'run.inside_zone', count: 6, share: 0.75 }, { situationBucket: 'first_down', callKey: 'pass.play_action', count: 2, share: 0.25 }],
  teams,
};
const tx = (eventId: number, over: Partial<TransactionLine>): TransactionLine => ({
  eventId, type: 'player_signed', date: { seasonYear: 2030, dayIndex: 20 }, teamId: 2, personIds: [501], lineTemplate: 'wire.signed', params: {}, mine: false, opponent: false, division: false, readyList: false, ...over,
});
const transactions: TransactionsView = {
  competitionId: 1, teams, people: { '501': 'Dee Okafor', '502': 'Sam Ito', '503': 'Lou Park' },
  lines: [tx(3, { mine: true, personIds: [503] }), tx(2, { teamId: 4, personIds: [502], readyList: true, type: 'player_released', lineTemplate: 'wire.released' }), tx(1, { teamId: 3 })],
};
const news: NewsView = {
  teams, people: { '503': 'Lou Park' }, kinds: ['result', 'transaction'],
  lines: [
    { newsId: 2, date: { seasonYear: 2030, dayIndex: 21 }, kind: 'result', templateKey: 'news.result', params: { score: '24-17' }, teamIds: [1, 2], personIds: [], audience: 'fans', mine: true },
    { newsId: 1, date: { seasonYear: 2030, dayIndex: 19 }, kind: 'transaction', templateKey: 'news.signed', params: {}, teamIds: [2], personIds: [503], audience: 'fans', mine: false },
  ],
};
const records: RecordsView = {
  competitionId: 1, seasonYear: null, teams, people: { '501': 'Dee Okafor', '502': 'Sam Ito' },
  honours: [
    { eventId: 5, type: 'season_award', seasonYear: 2030, lineTemplate: 'awards.line.award', params: { award: 'mvp', points: 41 }, personIds: [501], teamId: 1, reversed: false },
    { eventId: 6, type: 'season_award', seasonYear: 2030, lineTemplate: 'awards.line.award', params: { award: 'oroy', points: 12 }, personIds: [502], teamId: 3, reversed: true },
  ],
  books: [{ recordId: 'pass_yards_season', statistic: 'pass_yards', scope: 'season', holder: 'player', direction: 'most', entries: [
    { rank: 1, holderId: 502, value: 5000, season: 1990, gameId: null, seasonGames: 16, imported: true }, { rank: 2, holderId: 501, value: 4100, season: 2030, gameId: null, seasonGames: 17, imported: false },
  ] }],
  history: [{ seasonYear: 2030, champion: 4, honours: 1 }, { seasonYear: 2029, champion: null, honours: 0 }],
};
const otherText: Record<string, string> = {
  'wire.signed': 'signed {person}', 'wire.released': 'released {person}', 'news.result': '{team}: {score}', 'news.signed': '{team} signed {person}',
  'awards.line.award': '{award}, {points} points', 'bowl.name.7': 'Prairie Bowl', 'bowl.name.8': 'Coast Bowl', 'core:pro_hc': 'Head coach', 'core:pro_qb_coach': 'Quarterbacks coach',
};
const text = (k: string) => otherText[k];

const html = (el: ReactElement) => renderToStaticMarkup(el).replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const noop = () => {};

/** Every interactive element is a button: nothing needs a pointer, and nothing is draggable (Q1.5.2). */
function keyboardOnly(out: string) {
  expect(out).not.toContain('draggable');
  expect(out).not.toMatch(/<(div|span|li|td|tr|a)\b[^>]*\b(onclick|tabindex)/i);
  expect(out).not.toMatch(/<a\b/);
}
/** No text id of this package shows through as raw text (O6.6.1 gaps are visible, so test there are none). */
function noLeakedIds(out: string) {
  const visible = out.replace(/<[^>]+>/g, ' ');
  for (const id of leagueTextIds()) expect(visible.includes(` ${id} `) || visible.trim() === id).toBe(false);
  expect(visible).not.toMatch(/\b(standings|schedule|team|wire|news|records|league)\.[a-z_.]+\b/);
}

describe('standings screen (C3, T3)', () => {
  it('draws divisions with the full C3.1.2 columns, marks, odds, and says when the order is not final', () => {
    const out = html(createElement(StandingsScreen, { view: standings, tab: 'divisions', onTab: noop, onOpen: noop }));
    expect(out).toContain('data-group="11"');
    expect(out).toContain('data-final="true"');
    expect(out).toContain(lgt('standings.not_final'));
    expect(out).toContain(lgt('standings.mark.clinched_playoffs'));
    expect(out).toContain('90%');
    expect(out).toContain('1.000');
    expect(out).toContain('.500');
    expect(out).toContain(lgt('standings.uncertain'));
    expect(out).toContain(lgt('standings.col.sov'));
    keyboardOnly(out); noLeakedIds(out);
  });
  it('the playoff picture shows seeds, division winners, the hunt and the bracket; ties list each step', () => {
    const out = html(createElement(StandingsScreen, { view: standings, tab: 'playoffs', onTab: noop, onOpen: noop }));
    expect(out).toContain('data-seed="1"');
    expect(out).toContain(lgt('standings.hunt'));
    expect(out).toContain('(1) Plains Hawks against (2) Harbor Gulls');
    const ties = html(createElement(StandingsScreen, { view: standings, tab: 'ties', onTab: noop, onOpen: noop }));
    expect(ties).toContain('Division tie: head-to-head among Harbor Gulls, River Cats; Harbor Gulls advanced');
    noLeakedIds(out); noLeakedIds(ties);
  });
  it('the college page shows rank on each line, the committee ranking, poll, title games and bowls; no division columns', () => {
    const out = html(createElement(StandingsScreen, { view: college, tab: 'rankings', onTab: noop, onOpen: noop, text }));
    expect(out).toContain('data-level="college"');
    expect(out).toContain('Prairie Bowl');
    expect(out).toContain(lgt('standings.bowl.unfilled'));
    expect(out).toContain(lgt('standings.poll.points', { points: 75 }));
    expect(out).toContain('Plains Hawks against Harbor Gulls');
    const table = html(createElement(StandingsScreen, { view: college, tab: 'divisions', onTab: noop, onOpen: noop }));
    expect(table).not.toContain(lgt('standings.col.div'));
    expect(table).toContain(lgt('standings.mark.conference_champion'));
    expect(table).not.toContain('data-tab="divisions"');   // no divisions at this level: the tab is hidden
    noLeakedIds(out);
  });
  it('a missing tab falls back, and no data shows the waiting line', () => {
    expect(parseStandingsTab('nonsense')).toBe('divisions');
    expect(html(createElement(StandingsScreen, { view: null, tab: 'divisions', onTab: noop, onOpen: noop }))).toContain(lgt('league.waiting'));
  });
});

describe('schedule screen (C2.2, C2.2.2, T3.1)', () => {
  it('shows one week at a time with scores, byes, and previous and next buttons', () => {
    const out = html(createElement(ScheduleScreen, { view: schedule, week: 1, onWeek: noop, onTeam: noop, onOpen: noop }));
    expect(out).toContain('Harbor Gulls 17, Plains Hawks 24');
    expect(out).toContain(lgt('schedule.byes', { teams: 'River Cats, Mesa Owls' }));
    expect(out).toMatch(/<button type="button" disabled="">Previous<\/button>/);
    keyboardOnly(out); noLeakedIds(out);
  });
  it('a team\'s schedule shows site, rest days, week tags, the bye and the opponent\'s record', () => {
    const out = html(createElement(ScheduleScreen, { view: teamSchedule, week: null, onWeek: noop, onTeam: noop, onOpen: noop }));
    expect(out).toContain('data-tag="short"');
    expect(out).toContain(lgt('schedule.rest', { days: 4 }));
    expect(out).toContain(lgt('schedule.tag.bye'));
    expect(out).toContain('W 24-17');
    expect(out).toContain(lgt('schedule.team.clear'));
    noLeakedIds(out);
  });
});

describe('team page (C1, X8)', () => {
  it('shows identity, record, venue, staff with open chairs, roster and tendencies seen; names are buttons', () => {
    const out = html(createElement(TeamPage, { view: team, loaded: true, onOpen: noop, onSchedule: noop, text }));
    expect(out).toContain('Harbor Gulls');
    expect(out).toContain('Quarterbacks coach: <em>' + lgt('team.staff.open'));
    expect(out).toContain('data-open-chairs="1"');
    expect(out).toContain('Dee Okafor');
    expect(out).toContain(lgt('team.tendency', { call: 'run.inside_zone', count: 6, share: 75 }));
    expect(out).toContain('data-team="1"');
    keyboardOnly(out);
    expect(html(createElement(TeamPage, { view: null, loaded: true, onOpen: noop, onSchedule: noop }))).toContain(lgt('team.unknown'));
  });
});

describe('transactions and news (C10.1, C10.7)', () => {
  it('the default view keeps his club, opponent, division and ready-list moves; Everything shows all', () => {
    expect(transactions.lines.filter((l) => wireKeeps(l, 'default')).map((l) => l.eventId)).toEqual([3, 2]);
    const out = html(createElement(TransactionsScreen, { view: transactions, filter: 'default', onFilter: noop, onOpen: noop, text }));
    expect(out).toContain('data-event="3"');
    expect(out).not.toContain('data-event="1"');
    expect(out).toContain(lgt('wire.ready'));
    expect(out).toContain('signed Lou Park');
    const all = html(createElement(TransactionsScreen, { view: transactions, filter: 'all', onFilter: noop, onOpen: noop, text }));
    expect(all).toContain('data-event="1"');
    keyboardOnly(out); noLeakedIds(out);
  });
  it('an empty filter offers Everything', () => {
    const out = html(createElement(TransactionsScreen, { view: { ...transactions, lines: [tx(9, {})] }, filter: 'mine', onFilter: noop, onOpen: noop }));
    expect(out).toContain(lgt('wire.empty_filter'));
    expect(out).toContain(lgt('wire.filter.all'));
  });
  it('news lists every item newest first, filters by kind, and marks items about his club', () => {
    const out = html(createElement(NewsScreen, { view: news, kind: null, onKind: noop, onOpen: noop, text }));
    expect(out.indexOf('data-news="2"')).toBeLessThan(out.indexOf('data-news="1"'));
    expect(out).toContain('Harbor Gulls signed Lou Park');
    expect(out).toContain(lgt('news.mine'));
    expect(html(createElement(NewsScreen, { view: news, kind: 'transaction', onKind: noop, onOpen: noop }))).not.toContain('data-news="2"');
    keyboardOnly(out); noLeakedIds(out);
  });
});

describe('awards, records and history (C9)', () => {
  it('shows awards with votes, a rescinded award struck through, the record book with imported marks, and history', () => {
    const out = html(createElement(RecordsScreen, { view: records, tab: 'awards', onTab: noop, onSeason: noop, onOpen: noop, text }));
    expect(out).toContain('mvp, 41 points');
    expect(out).toContain('data-reversed="true"');
    expect(out).toContain(lgt('records.rescinded'));
    const book = html(createElement(RecordsScreen, { view: records, tab: 'records', onTab: noop, onSeason: noop, onOpen: noop }));
    expect(book).toContain(lgt('records.entry', { rank: 1, holder: 'Sam Ito', value: 5000, season: 1990 }));
    expect(book).toContain(lgt('records.imported'));
    const hist = html(createElement(RecordsScreen, { view: records, tab: 'history', onTab: noop, onSeason: noop, onOpen: noop }));
    expect(hist).toContain('2030: Mesa Owls');
    expect(hist).toContain(lgt('records.history.no_champion'));
    keyboardOnly(out); noLeakedIds(out); noLeakedIds(book); noLeakedIds(hist);
  });
});

describe('route entries (O1.1.3)', () => {
  const props = (screenId: string, view: Record<string, string> = {}, params: Record<string, string> = {}) => {
    const log = { views: [] as Record<string, string>[], paths: [] as string[] };
    const p = { screen: { id: screenId }, location: { path: '/', screenId, params, view }, readOnly: true, navigate: (to: string) => log.paths.push(to), setView: (v: Record<string, string>) => log.views.push(v) } as unknown as ScreenProps;
    return { p, log };
  };
  const calls: string[] = [];
  const routes = leagueRoutes({
    standings: () => standings, schedule: (_p, t) => { calls.push(`schedule:${t}`); return t === null ? schedule : teamSchedule; },
    team: (_p, id) => { calls.push(`team:${id}`); return id === 2 ? team : null; }, transactions: () => transactions, news: () => news,
    records: (_p, s) => { calls.push(`records:${s}`); return records; }, text,
  });
  it('fills exactly the six registry screens; a host without a loader leaves its screen a placeholder', () => {
    expect(Object.keys(routes).sort()).toEqual(Object.values(LEAGUE_SCREEN_IDS).sort());
    expect(Object.keys(leagueRoutes({ news: () => news }))).toEqual(['league.news']);
  });
  it('tabs, weeks, teams, filters and seasons live in the view options; team names open the team page', () => {
    const s = props('league.standings', { tab: 'playoffs' });
    const el = routes['league.standings']!.render(s.p) as ReactElement<{ tab: string; onTab(t: string): void; onOpen(id: number): void }>;
    expect(el.props.tab).toBe('playoffs');
    el.props.onTab('ties'); el.props.onOpen(3);
    expect(s.log.views).toEqual([{ tab: 'ties' }]);
    expect(s.log.paths).toEqual([teamPath(3)]);

    const sch = props('league.schedule', { team: '1', week: '2' });
    const sel = routes['league.schedule']!.render(sch.p) as ReactElement<{ week: number | null; onTeam(t: number | null): void; onWeek(w: number): void }>;
    expect(calls).toContain('schedule:1');
    expect(sel.props.week).toBe(2);
    sel.props.onTeam(null); sel.props.onWeek(3);
    expect(sch.log.views).toEqual([{ week: '2' }, { team: '1', week: '3' }]);

    const tp = props('league.team', {}, { teamId: '2' });
    const tel = routes['league.team']!.render(tp.p) as ReactElement<{ view: TeamPageView | null; onSchedule(id: number): void }>;
    expect(tel.props.view?.teamId).toBe(2);
    tel.props.onSchedule(2);
    expect(tp.log.paths).toEqual(['/league/schedule?team=2']);

    const w = props('league.transactions', { filter: 'division' });
    expect((routes['league.transactions']!.render(w.p) as ReactElement<{ filter: string }>).props.filter).toBe('division');

    const r = props('league.records', { tab: 'history', season: '2030' });
    const rel = routes['league.records']!.render(r.p) as ReactElement<{ onSeason(s: number | null): void }>;
    expect(calls).toContain('records:2030');
    rel.props.onSeason(null);
    expect(r.log.views).toEqual([{ tab: 'history' }]);
  });
});

describe('registry, help text and shapes', () => {
  it('every screen id is a screens.json row on the league hub with help text', () => {
    const rows = (SCREENS as { screens: { id: string; hub: string; route: string }[] }).screens;
    const strings = (SHELL_TEXT as { strings: Record<string, string> }).strings;
    for (const id of Object.values(LEAGUE_SCREEN_IDS)) {
      const row = rows.find((x) => x.id === id);
      expect(row?.hub).toBe('league');
      expect(strings[`help.screen.${id}`]).toBeTruthy();
    }
    expect(rows.find((x) => x.id === 'league.team')!.route).toBe('/league/team/:teamId');
  });
  it('the app-ui shapes equal the app-services read-model shapes', () => {
    const body = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').split('\n').filter((l) => !l.startsWith('//')).join('\n').trim();
    expect(body('../../../src/screens/league/types.ts')).toBe(body('../../../../app-services/src/read-models/league/types.ts'));
  });
  it('helpers print records and percentages the standard way', () => {
    expect(recordText(W(10, 7))).toBe('10-7');
    expect(recordText({ w: 9, l: 7, t: 1 })).toBe('9-7-1');
    expect(pctText(0.6667)).toBe('.667');
    expect(pctText(1)).toBe('1.000');
  });
});
