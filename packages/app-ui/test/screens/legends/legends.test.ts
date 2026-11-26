// Legends screen (G-84): every tab renders from read-model data, names are links by id, source marks
// and the Reported word show, empty tabs show their waiting or empty line, and the route entry keeps the
// opened page in the view options.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LegendsScreen, legendsRoute, linkView, parseTab, lt, lineText, legendsTextIds, LEGENDS_TABS, LEGENDS_SCREEN_ID, type LegendsData, type LegendsTab } from '../../../src/screens/legends/index.ts';
import type { ScreenProps } from '../../../src/shell/index.ts';

const data: LegendsData = {
  names: { 'person:101': 'Dale Whitcombe', 'team:1': 'Plains Hawks', 'team:2': 'Harbor City Gulls', 'person:77': 'Line coach Ruiz' },
  lineText: { 'line.game_result': '{homeScore} to {awayScore}', 'line.staff_meeting': 'Staff meeting', 'line.title_won': 'Won the title' },
  page: {
    link: { kind: 'person', id: 101 }, seasonYear: null, labels: ['label.steady'], years: { first: 2030, last: 2031 }, summariesOnly: false, empty: false,
    seasons: [{
      seasonYear: 2030,
      notable: [{ eventId: 5, type: 'game_result', seasonYear: 2030, dayIndex: 100, textKey: 'line.game_result', params: { homeScore: 21, awayScore: 7 }, links: [{ kind: 'team', id: 1 }], notability: 80, mark: { via: 'public' }, reversed: true }],
      lines: [{ eventId: 9, type: 'staff_meeting', seasonYear: 2030, dayIndex: 120, textKey: 'line.staff_meeting', params: {}, links: [], notability: 10, mark: { via: 'told', sourcePersonId: 77, seasonYear: 2030, dayIndex: 130, reported: true }, reversed: false }],
    }],
    tabs: [{ id: 'career', count: 2 }, { id: 'seasons', count: 2 }],
  },
  chronicle: {
    competitionId: 1, seasonYear: 2030, summary: { textKey: 'legends.chronicle.summary.first_since', params: { team: 1, year: 2021 } }, seasonLevelOnly: false,
    sections: [{ section: 'week', week: 3, entries: [{ eventId: 5, type: 'title_won', notability: 95, guaranteed: true }], more: [{ eventId: 6, type: 'game_result', notability: 20, guaranteed: false }] }],
  },
  eras: {
    competitionId: 1,
    blocks: [{ index: 0, firstSeason: 2030, lastSeason: 2039, partial: false, teams: [{ teamId: 1, wins: 60, losses: 10, ties: 0, winShare: 0.857, titles: 4, conferenceTitles: 5, headCoaches: [101], dynasty: true, seasonsSinceTitle: 0, seasonsSinceWinningSeason: 0 }], rates: { teamGames: 100, pointsPerTeamGame: 22.4, passShare: 0.58, yardsPerPlay: 5.4, turnoversPerTeamGame: 1.4, penaltiesPerTeamGame: 6.1 }, topEventIds: [5], ruleMarkers: [{ seasonYear: 2034, ruleSetId: 'pro_2034' }] }],
  },
  tree: {
    rootId: 101, depth: 2, headCoachesProduced: 3, producedByLevel: { pro: 3 },
    nodes: [
      { personId: 102, parentId: 101, level: 1, underParent: [{ teamId: 1, role: 'offensive_coordinator', firstSeason: 2030, lastSeason: 2033, hireEventIds: [1] }], laterChairs: [{ teamId: 2, role: 'head_coach', level: 'pro', firstSeason: 2035, lastSeason: 2038 }], becameHeadCoach: true, expanded: true },
      { personId: 104, parentId: 102, level: 3, underParent: [], laterChairs: [], becameHeadCoach: false, expanded: false },
    ],
  },
  rivalry: {
    teamA: 1, teamB: 2, exists: true,
    page: { teamA: 1, teamB: 2, winsA: 5, winsB: 2, ties: 1, first: { eventId: 1, seasonYear: 2030 }, last: { eventId: 8, seasonYear: 2037 }, current: { teamId: 1, games: 1 }, longest: { teamId: 1, games: 3 }, largestA: { gameId: 1, eventId: 1, margin: 24, seasonYear: 2033 }, largestB: null, byVenue: [{ venueId: 1, meetings: 4, winsA: 3, winsB: 1, ties: 0 }], topGameEventIds: [8], coaches: [{ personId: 101, teamId: 1, wins: 5, losses: 2, ties: 1 }], trophyKey: null },
  },
  records: {
    competitionId: null, teamId: null, postseason: false,
    lists: [{ categoryId: 'yards_per_pass', scope: 'season', postseason: false, minimum: { per: 'pass_attempts', value: 14, perTeamGame: true, factId: 'F-legends-0001' },
      thisWorld: [{ rank: 1, holderId: 101, value: 9.25, teamId: 1, seasonYear: 2030, gameId: null, imported: false }],
      allTime: [{ rank: 1, holderId: 900, value: 9.5, teamId: 0, seasonYear: 1990, gameId: null, imported: true }, { rank: 2, holderId: 101, value: 9.25, teamId: 1, seasonYear: 2030, gameId: null, imported: false }],
      vacated: [{ rank: 1, holderId: 103, value: 10, teamId: 2, seasonYear: 2031, gameId: null, imported: false }] }],
  },
  search: { text: 'whit', rows: [{ kind: 'person', id: 101, first: 'Dale', last: 'Whitcombe', birthYear: 1975, role: 'head_coach', lastTeamId: 1, match: 'prefix' }] },
};

const render = (tab: LegendsTab, d: LegendsData = data) => renderToStaticMarkup(createElement(LegendsScreen, { tab, data: d, onTab: () => {}, onOpen: () => {} }));

describe('legends screen', () => {
  it('a page shows header, years, labels, the Notable block, reversal, source marks and the Reported word', () => {
    const h = render('page');
    expect(h).toContain('Dale Whitcombe');
    expect(h).toContain('Active 2030 to 2031');
    expect(h).toContain('21 to 7');
    expect(h).toContain('Notable');
    expect(h).toContain('Later reversed');
    expect(h).toContain('Reported: Told to you by Line coach Ruiz, 2030');
    expect(h).toContain('data-link="team:1"');
    expect(h).toContain('Career (2)');
  });

  it('chronicle, eras, tree, rivalry, records and search tabs render', () => {
    expect(render('chronicle')).toContain('Plains Hawks won its first title since 2021.');
    expect(render('chronicle')).toContain('More this week (1)');
    const era = render('eras');
    expect(era).toContain('data-dynasty="true"');
    expect(era).toContain('Rule change in 2034');
    const tree = render('tree');
    expect(tree).toContain('depth 2, 3 head coaches produced');
    expect(tree).toContain('Later: head_coach at Harbor City Gulls');
    expect(tree).toMatch(/data-person="104"[^>]*hidden/);
    expect(render('rivalry')).toContain('Longest streak: Plains Hawks 3');
    const rec = render('records');
    expect(rec).toContain('Minimum 14 pass_attempts per team game');
    expect(rec).toContain('provisional');
    expect(rec).toContain('All time including imported careers');
    expect(rec).toContain('imported career');
    expect(rec).toContain('data-vacated');
    expect(render('search')).toContain('Dale Whitcombe, born 1975, head_coach, last team Plains Hawks');
  });

  it('a missing model shows the waiting line; no rivalry and no results show their own lines', () => {
    expect(render('tree', { ...data, tree: null })).toContain(lt('legends.waiting'));
    expect(render('rivalry', { ...data, rivalry: { teamA: 3, teamB: 4, exists: false, page: null } })).toContain(lt('legends.rivalry.none'));
    expect(render('search', { ...data, search: { text: 'zz', rows: [] } })).toContain(lt('legends.search.empty'));
    expect(render('page', { ...data, page: { ...data.page!, empty: true, years: null, seasons: [], tabs: [] } })).toContain('No record yet.');
  });

  it('line text fills payload slots; every tab has a text id; parseTab falls back to page', () => {
    expect(lineText(data.page!.seasons[0]!.notable[0]!, data)).toBe('21 to 7');
    for (const t of LEGENDS_TABS) expect(legendsTextIds()).toContain(`legends.tab.${t}`);
    expect(parseTab('nope')).toBe('page');
    expect(parseTab('records')).toBe('records');
  });

  it('the route opens a page by id in the view options and keeps the tab', () => {
    const views: Record<string, string>[] = [];
    const props = { screen: { id: LEGENDS_SCREEN_ID }, location: { path: '/league/legends', screenId: LEGENDS_SCREEN_ID, params: {}, view: { tab: 'records' } }, readOnly: false, navigate: () => {}, setView: (v: Record<string, string>) => views.push(v) } as unknown as ScreenProps;
    const html = renderToStaticMarkup(legendsRoute(() => data).render(props) as never);
    expect(html).toContain('data-view="records"');
    expect(linkView({ tab: 'records' }, { kind: 'team', id: 2 })).toEqual({ tab: 'page', kind: 'team', id: '2' });
  });
});
