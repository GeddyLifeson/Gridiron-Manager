// League pages read models (unbuilt-work item 5): standings with tie order, seeds, clinching and the bracket
// (C3), the college picture (T3.3 to T3.6), the league and team schedule with week tags (C2.2, C2.2.2, T3.1),
// the team page (C1, X8), the transaction wire and news page (C10.1, C10.7), and the awards and records page
// (C9). Everything goes through the observer filter (G-27) and the Q1.4.2 crawler.
//
// Rule values here are FIXTURE values copied from packages/league/test/standings/fixture.ts, which cites
// research/audit-r-schedule-tiebreak-playoffs.md for each (tie value 2 of 3, common games 4 Verified, field
// size 7 Verified, restarts 1 of 3). They test wiring, not football facts.
import { describe, expect, it } from 'vitest';
import { standings, postseason } from '@gm/league';
import {
  ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, ObservedWorld, PUBLIC_OBSERVER,
} from '../../../src/observer/index.ts';
import {
  buildNews, buildRecords, buildSchedule, buildStandings, buildTeamPage, buildTransactions, leagueSpecs, observedResults,
  LEAGUE_MODELS, type LeagueSources, type StandingsSource,
} from '../../../src/read-models/league/index.ts';
import { LEAGUE_DATA } from './data-schema.ts';

const PRO_RULES: standings.RuleValues = {
  'standings.tie_win_value': 0.5, 'tiebreak.common_games_min': 4, 'tiebreak.restarts': 'restart_on_three', 'playoff.field_size': 7,
};
const PRO = 1, COLLEGE = 2, YEAR = 2030;
const USER = 900, RIVAL_HC = 901;
const d = (dayIndex: number) => ({ seasonYear: YEAR, dayIndex });

/** Pro: 32 clubs, conferences 1 and 2, divisions 11..14 and 21..24 (four clubs each). College: one conference 30, teams 101..104. */
function tables(): Record<string, unknown[]> {
  const team = (id: number, competitionId: number, conferenceId: number) => ({
    id, competitionId, conferenceId,
    identity: { name: `Club ${id}`, nickname: 'Testers', place: `Place ${id}`, abbreviation: `C${id}`, colours: ['#112233'] },
    homeVenueId: 1, ownerPersonId: null, athleticDirectorPersonId: null, presidentPersonId: null,
    finalSay: { roster: null, contracts: null, draft: null, staffHiring: null }, resourceBand: 'middle', facilities: {}, rivalTeamIds: id === 1 ? [2] : [], prestige: 0.5,
  });
  const div = (id: number) => (id <= 16 ? 10 : 20) + Math.floor(((id - 1) % 16) / 4) + 1;
  const teams: ReturnType<typeof team>[] = [];
  for (let id = 1; id <= 32; id++) teams.push(team(id, PRO, div(id)));
  for (let id = 101; id <= 104; id++) teams.push(team(id, COLLEGE, 30));
  const conferences = [
    { id: 1, competitionId: PRO, parentId: null, name: 'North Conference', kind: 'conference', teamIds: [] },
    { id: 2, competitionId: PRO, parentId: null, name: 'South Conference', kind: 'conference', teamIds: [] },
    ...[11, 12, 13, 14, 21, 22, 23, 24].map((g) => ({ id: g, competitionId: PRO, parentId: g < 20 ? 1 : 2, name: `Division ${g}`, kind: 'division', teamIds: teams.filter((t) => t.conferenceId === g).map((t) => t.id) })),
    { id: 30, competitionId: COLLEGE, parentId: null, name: 'Lakes Conference', kind: 'conference', teamIds: [101, 102, 103, 104] },
  ];
  let gid = 0;
  const game = (week: number, day: number, home: number, away: number, score: [number, number] | null, competitionId = PRO, extra: Record<string, unknown> = {}) => ({
    id: ++gid, competitionId, seasonYear: YEAR, week, kickoff: d(day), teamIds: [home, away], venueId: 1, neutralSite: false, phase: 'regular',
    status: score ? 'final' : 'scheduled', environment: null, seedHex: 'feedfacecafebeef', crewId: null, finalScore: score, stateHash: null, tier: 1, ...extra,
  });
  const games = [
    game(1, 10, 1, 2, [24, 17]), game(1, 10, 3, 4, [10, 13]), game(1, 10, 5, 6, [20, 20]),
    game(2, 14, 2, 3, [31, 7]),           // club 1 has a Thursday-short week next
    game(2, 17, 4, 1, [14, 21]),
    game(3, 21, 1, 3, null), game(4, 28, 2, 1, null),
    game(1, 10, 101, 102, [35, 14], COLLEGE), game(1, 10, 103, 104, [21, 24], COLLEGE), game(2, 17, 101, 103, [28, 27], COLLEGE),
    game(0, 2, 1, 9, [3, 10], PRO, { phase: 'preseason' }),
  ];
  const person = (id: number, first: string, last: string, position: string | null) => ({
    id, origin: 'generated', externalRef: null, provenance: { generatorVersion: 'g1', seedHex: 'abcdefabcdefabcd' }, name: { first, last, suffix: null, nickname: null },
    birthDate: d(0), hometown: null, appearanceSeed: id, roles: ['player'], agentId: null, diedYear: null,
    ...(position ? { playing: { position, lastJersey: null, heightIn: 74, weightLb: 220, attributes: { speed: 88.5 }, tests: {}, ceilings: { speed: 95 } } } : {}),
  });
  const people = [person(USER, 'Marlo', 'Grant', null), person(RIVAL_HC, 'Hal', 'Ruiz', null), person(501, 'Dee', 'Okafor', 'QB'), person(502, 'Sam', 'Ito', 'WR'), person(503, 'Lou', 'Park', 'CB')];
  const job = (id: number, teamId: number, holder: number | null, rung: number) => ({
    id, teamId, catalogueId: rung === 9 ? 'core:pro_hc' : 'core:pro_qb_coach', positionId: 'core:x', rung, side: 'offense', positionGroup: 'QB', dutyIds: [],
    callsPlays: false, recruitsOffCampus: false, gamedaySeat: 'sideline', paid: 'salary', termLimitYears: null, reportsToJobId: null, holderPersonId: holder,
    namedDeputyPersonId: null, holderSince: holder ? d(0) : null, vacantSince: holder ? null : d(5), holding: holder ? 'permanent' : null,
  });
  const ev = (id: number, type: string, teamId: number | null, personId: number | null, witnesses: unknown, payload: Record<string, unknown> = {}, day = 20, causeId: number | null = null) => ({
    id, type, when: { date: d(day), period: null, clockTenths: null }, competitionId: PRO, where: { teamId, venueId: null },
    actors: personId ? [{ personId, role: 'subject' }] : [], subjects: [...(personId ? [{ kind: 'person', id: personId }] : []), ...(teamId ? [{ kind: 'team', id: teamId }] : [])],
    payload, witnesses, causeId, notability: 30, tier: 1, source: 'sim',
  });
  const etype = (id: number | string, family: string, lineTemplate: string) => ({ id, family, payloadSchema: {}, witnessRule: 'public', lineTemplate, harmClass: 'none', importedAllowed: true, minTier: 1, consumers: ['league.news'], compactable: false });
  return {
    world: [{ formatVersion: 1, masterSeedHex: '00000000000000aa', calendar: d(22), userPersonId: USER, certified: false }],
    competitions: [
      { id: PRO, name: 'Pro League', level: 'pro', ruleSetId: 'pro_2026', leagueRulesId: 'pro', conferenceIds: [1, 2], teamIds: [], seasonFormat: 'x', postseasonFormat: 'x' },
      { id: COLLEGE, name: 'College Division', level: 'college', ruleSetId: 'college_2026', leagueRulesId: 'college', conferenceIds: [30], teamIds: [], seasonFormat: 'x', postseasonFormat: 'x' },
    ],
    conferences, teams,
    venues: [{ id: 1, name: 'Generated Field', place: 'Place 1', surfaceType: 'core:grass', roof: 'open', altitudeFt: 600, capacity: 61000, noiseBase: 0.5, climateId: null }],
    seasons: [{ competitionId: PRO, year: YEAR, gameIds: [], awardEventIds: [], archive: 'live' }, { competitionId: PRO, year: YEAR - 1, gameIds: [], awardEventIds: [], archive: 'archived' }],
    games, people,
    jobs: [job(1, 1, USER, 9), job(2, 1, null, 5), job(3, 2, RIVAL_HC, 9)],
    rosterSlots: [501, 502].map((personId, i) => ({ teamId: 2, personId, list: 'active', jersey: 10 + i, gameDayStatus: 'active', since: d(0) })),
    tendencies: [
      { teamId: 2, seasonYear: YEAR, situationBucket: 'first_down', callKey: 'run.inside_zone', count: 6, results: {} },
      { teamId: 2, seasonYear: YEAR, situationBucket: 'first_down', callKey: 'pass.play_action', count: 2, results: {} },
    ],
    eventTypes: [etype('player_signed', 'roster', 'wire.signed'), etype('player_released', 'roster', 'wire.released'), etype('season_award', 'honors', 'awards.line.award'), etype('league_title', 'honors', 'awards.line.title'), etype('award_rescinded', 'honors', 'awards.line.rescinded'), etype('game.result', 'game', 'line.game')],
    events: [
      ev(1, 'player_signed', 2, 503, { kind: 'public' }, {}, 19),
      ev(2, 'player_released', 5, 502, { kind: 'public' }, {}, 21),
      ev(3, 'player_signed', 2, 501, { kind: 'team', teamId: 2 }, {}, 22),   // not yet public: only club 2 sees it
      ev(4, 'game.result', 1, null, { kind: 'public' }),
      ev(5, 'season_award', 1, 501, { kind: 'public' }, { award: 'mvp', points: 41 }, 300),
      ev(6, 'season_award', 3, 502, { kind: 'public' }, { award: 'oroy', points: 12 }, 300),
      ev(7, 'award_rescinded', 3, 502, { kind: 'public' }, {}, 320, 6),
      ev(8, 'league_title', 4, null, { kind: 'public' }, {}, 310),
    ],
    news: [
      { id: 1, date: d(19), kind: 'transaction', subjectPersonIds: [503], subjectTeamIds: [2], templateKey: 'news.signed', params: { years: 2 }, audience: 'fans', sourceEventIds: [1] },
      { id: 2, date: d(21), kind: 'result', subjectPersonIds: [], subjectTeamIds: [1, 4], templateKey: 'news.result', params: {}, audience: 'fans', sourceEventIds: [4] },
    ],
  };
}

const src = (t = tables()) => tablesOf(t);
const world = (personId: number | null = USER, t = tables()) => { const s = src(t); return new ObservedWorld(s, personId === null ? PUBLIC_OBSERVER : observerFor(s, personId)); };
const firstDraw: standings.TieDraw = { draw: (ids) => [...ids].sort((a, b) => a - b) };

function proSource(w: ObservedWorld): StandingsSource {
  const results = observedResults(w, PRO, YEAR, {});
  const places = [];
  for (let id = 1; id <= 32; id++) places.push({ id, conferenceId: id <= 16 ? 1 : 2, divisionId: (id <= 16 ? 10 : 20) + Math.floor(((id - 1) % 16) / 4) + 1 });
  const table = standings.seasonTable(places, results, PRO_RULES, firstDraw);
  const bracket = postseason.createBracket({ grouping: 'conference', fieldSize: 7, byes: 1, reseed: true, campusRounds: 3 }, table.conferences.map((c) => ({ groupId: c.conferenceId, seeds: c.seeds })));
  return {
    rules: PRO_RULES, pro: { table, clinch: [{ teamId: 1, clinchedPlayoffs: true, clinchedDivision: false, clinchedTopSeed: false, eliminated: false, method: 'bounded' }], odds: [{ teamId: 1, playoffs: 0.9, division: 0.6, topSeed: 0.2 }] },
    bracket,
  };
}

describe('standings (C3.1.2, C3.1.3, C3.3)', () => {
  it('rebuilds every row from the final games seen; preseason and unplayed games do not count', () => {
    const w = world();
    const v = buildStandings(w, PRO, YEAR, { rules: PRO_RULES });
    expect(v.gamesCounted).toBe(5);
    const one = v.lines.find((l) => l.teamId === 1)!;
    expect(one.record).toEqual({ w: 2, l: 0, t: 0 });
    expect(one).toMatchObject({ pointsFor: 45, pointsAgainst: 31, netPoints: 14, streakKind: 'W', streakLength: 2 });
    expect(v.lines.find((l) => l.teamId === 5)!.record).toEqual({ w: 0, l: 0, t: 1 });
    expect(v.lines.find((l) => l.teamId === 5)!.pct).toBe(0.5);
  });
  it('without league tables, groups fall back to percentage order and say they are not final', () => {
    const v = buildStandings(world(), PRO, YEAR, { rules: PRO_RULES });
    const d11 = v.groups.find((g) => g.groupId === 11)!;
    expect(d11).toMatchObject({ kind: 'division', parentId: 1, final: false });
    expect(d11.teamIds[0]).toBe(1);
    expect(v.seeds).toEqual([]);
  });
  it('with the league table, divisions take the tiebroken order, seeds, tie notes, clinch marks, odds and the bracket', () => {
    const w = world();
    const s = proSource(w);
    const v = buildStandings(w, PRO, YEAR, s);
    const d11 = v.groups.find((g) => g.groupId === 11)!;
    expect(d11.final).toBe(true);
    expect(d11.teamIds).toEqual([...s.pro!.table!.divisions.find((x) => x.divisionId === 11)!.order]);
    expect(v.seeds).toHaveLength(2);
    expect(v.seeds[0]!.seeds).toHaveLength(7);
    expect(v.seeds[0]!.name).toBe('North Conference');
    expect(v.tieNotes.length).toBeGreaterThan(0);
    expect(v.tieNotes[0]!.stepKey).toMatch(/^standings\.step\./);
    const one = v.lines.find((l) => l.teamId === 1)!;
    expect(one.marks).toEqual(['clinched_playoffs']);
    expect(one.odds).toEqual({ playoffs: 0.9, division: 0.6, topSeed: 0.2 });
    expect(v.bracket.length).toBeGreaterThan(0);
    expect(v.bracket.every((b) => v.teams[String(b.teams[0])] && v.teams[String(b.teams[1])])).toBe(true);
  });
});

describe('college standings, rankings and bowls (T3.3 to T3.6)', () => {
  it('shows conference order, title game, committee rank on each line, the poll and the bowls', () => {
    const w = world();
    const results = observedResults(w, COLLEGE, YEAR, {});
    const conf = standings.conferenceStandings({ conferenceId: 30, teamIds: [101, 102, 103, 104], chain: standings.STARTING_CHAIN, titleMethod: 'standings' }, results, PRO_RULES, firstDraw);
    const v = buildStandings(w, COLLEGE, YEAR, {
      rules: PRO_RULES,
      college: {
        conferences: [conf],
        ranking: { order: [101, 104], resumes: [{ teamId: 101, score: 1, record: { w: 2, l: 0, t: 0 }, scheduleStrength: 0.25, bestWins: [103] }] },
        poll: { order: [101, 104, 103], points: new Map([[101, 75], [104, 40], [103, 9]]) },
        bowls: { games: [{ bowlId: 7, teams: [104, 103] }], eligible: [104, 103], shortFill: [], unfilled: [8] },
        bowlNameKey: (b) => `bowl.name.${b}`,
      },
    });
    expect(v.level).toBe('college');
    expect(v.groups[0]).toMatchObject({ groupId: 30, final: true });
    expect(v.groups[0]!.teamIds[0]).toBe(101);
    expect(v.lines.find((l) => l.teamId === 101)!.ranking).toBe(1);
    expect(v.lines.find((l) => l.teamId === 102)!.ranking).toBeNull();
    expect(v.lines.find((l) => l.teamId === 101)!.marks).toEqual(['conference_champion']);
    expect(v.college!.rankings[0]).toEqual({ rank: 1, teamId: 101, record: { w: 2, l: 0, t: 0 }, scheduleStrength: 0.25, bestWins: [103] });
    expect(v.college!.rankings[1]!.record).toEqual({ w: 0, l: 0, t: 0 });
    expect(v.college!.poll.map((p) => p.points)).toEqual([75, 40, 9]);
    expect(v.college!.bowls).toEqual([{ bowlId: 7, nameKey: 'bowl.name.7', teams: [104, 103] }, { bowlId: 8, nameKey: 'bowl.name.8', teams: null }]);
  });
});

describe('schedule (C2.2, C2.2.2, T3.1)', () => {
  it('lists every game by week with results, and the clubs on a bye', () => {
    const v = buildSchedule(world(), PRO, YEAR);
    expect(v.weeks.map((w) => w.week)).toEqual([0, 1, 2, 3, 4]);
    expect(v.weeks[1]!.games.map((g) => g.score)).toEqual([[24, 17], [10, 13], [20, 20]]);
    expect(v.weeks[1]!.byes).toContain(7);
    expect(v.weeks[1]!.byes).not.toContain(1);
    expect(v.weeks[0]!.byes).toEqual([]);   // preseason has no byes
  });
  it('a team\'s rows carry opponent, site, rest days, the C2.2.2 week tag and the opponent\'s record', () => {
    const rows = buildSchedule(world(), PRO, YEAR, 1).teamRows;
    expect(rows.map((r) => [r.week, r.site, r.result])).toEqual([[0, 'home', 'L'], [1, 'home', 'W'], [2, 'away', 'W'], [3, 'home', null], [4, 'away', null]]);
    expect(rows[1]).toMatchObject({ restDays: null, tag: 'normal' });
    expect(rows[2]).toMatchObject({ restDays: 7, opponentId: 4, opponentRecord: { w: 1, l: 1, t: 0 } });
    expect(rows[3]!.restDays).toBe(4);
    expect(rows[3]!.tag).not.toBe('normal');
  });
  it('a week with no game for the team is a bye row', () => {
    const rows = buildSchedule(world(), PRO, YEAR, 3).teamRows;
    expect(rows.find((r) => r.week === 4)).toMatchObject({ tag: 'bye', game: null, opponentId: null });
  });
  it('flags conference games at the college level', () => {
    const v = buildSchedule(world(), COLLEGE, YEAR, 101);
    expect(v.teamRows.every((r) => r.game?.conferenceGame)).toBe(true);
  });
});

describe('team page (C1, X8)', () => {
  it('shows identity, record, results, upcoming games, staff with open chairs, roster and tendencies seen', () => {
    const v = buildTeamPage(world(), 1, YEAR)!;
    expect(v.team.name).toBe('Club 1');
    expect(v.groupNames).toEqual(['North Conference', 'Division 11']);
    expect(v.record).toEqual({ w: 2, l: 0, t: 0 });
    expect(v.results.map((g) => g.week)).toEqual([2, 1, 0]);
    expect(v.upcoming.map((g) => g.week)).toEqual([3, 4]);
    expect(v.staff.map((s) => s.name)).toEqual(['Marlo Grant', null]);
    expect(v.openChairs).toBe(1);
    expect(v.rivals).toEqual([2]);
    expect(v.venue).toMatchObject({ name: 'Generated Field', capacity: 61000 });
    const two = buildTeamPage(world(), 2, YEAR)!;
    expect(two.roster.map((r) => [r.name, r.position, r.jersey])).toEqual([['Dee Okafor', 'QB', 10], ['Sam Ito', 'WR', 11]]);
    expect(two.tendencies.map((t) => [t.callKey, t.share])).toEqual([['run.inside_zone', 0.75], ['pass.play_action', 0.25]]);
  });
  it('an unknown team gives null', () => {
    expect(buildTeamPage(world(), 999, YEAR)).toBeNull();
  });
});

describe('transaction wire and news (C10.1, C10.7)', () => {
  it('lists the roster moves the viewer can see, newest first, with the default filter flags', () => {
    const v = buildTransactions(world(USER), PRO, { teamId: 1, opponentTeamId: 2, readyList: [502] });
    expect(v.lines.map((l) => l.eventId)).toEqual([2, 1]);
    expect(v.lines.find((l) => l.eventId === 1)).toMatchObject({ teamId: 2, opponent: true, mine: false, division: true, lineTemplate: 'wire.signed' });
    expect(v.lines.find((l) => l.eventId === 2)).toMatchObject({ readyList: true, division: false });
    expect(v.people['503']).toBe('Lou Park');
  });
  it('a move not yet public reaches only the club that made it (K9)', () => {
    expect(buildTransactions(world(RIVAL_HC), PRO).lines.map((l) => l.eventId)).toEqual([3, 2, 1]);
    expect(buildTransactions(world(null), PRO).lines.map((l) => l.eventId)).toEqual([2, 1]);
  });
  it('the news page holds every stored item, newest first, with kinds for filtering', () => {
    const v = buildNews(world(), { teamId: 1 });
    expect(v.lines.map((l) => [l.newsId, l.mine])).toEqual([[2, true], [1, false]]);
    expect(v.kinds).toEqual(['result', 'transaction']);
    expect(v.teams['4']!.name).toBe('Club 4');
  });
});

describe('awards, records and history (C9)', () => {
  it('lists honours by season, marks a rescinded award rather than dropping it, and names each season\'s champion', () => {
    const v = buildRecords(world(), PRO, null, { championTypes: ['league_title'] });
    expect(v.honours.map((h) => [h.type, h.reversed])).toEqual([['league_title', false], ['season_award', false], ['season_award', true]]);
    expect(v.honours.find((h) => h.eventId === 5)!.params).toMatchObject({ award: 'mvp', points: 41 });
    expect(v.history).toEqual([{ seasonYear: YEAR, champion: 4, honours: 2 }, { seasonYear: YEAR - 1, champion: null, honours: 0 }]);
  });
  it('ranks record books with imported prior marks beside this world\'s', () => {
    const v = buildRecords(world(), PRO, YEAR, {
      books: [{ def: { id: 'pass_yards_season', statistic: 'pass_yards', scope: 'season', holder: 'player' }, entries: [{ holderId: 501, value: 4100, season: YEAR, gameId: null, seasonGames: 17 }], prior: [{ holderId: 502, value: 5000, season: 1990, gameId: null, seasonGames: 16 }] }],
    });
    expect(v.books[0]!.entries.map((e) => [e.rank, e.holderId, e.imported])).toEqual([[1, 502, true], [2, 501, false]]);
    expect(v.people['501']).toBe('Dee Okafor');
  });
});

describe('registry and crawler (P1.3.2, Q1.4.2)', () => {
  const sources = (t: ReturnType<typeof tables>): LeagueSources => ({
    standings: (c) => (c === PRO ? proSource(new ObservedWorld(tablesOf(t), PUBLIC_OBSERVER)) : { rules: PRO_RULES }),
    records: () => ({ championTypes: ['league_title'] }),
    context: () => ({ teamId: 1, opponentTeamId: 2 }),
  });
  const registryFor = (t = tables()) => () => {
    const r = new ReadModelRegistry();
    const specs = leagueSpecs(LEAGUE_DATA, sources(t));
    r.register(specs.standings).register(specs.schedule).register(specs.team).register(specs.transactions).register(specs.news).register(specs.records);
    return r;
  };
  it('every model registers, builds and matches its schema', () => {
    const s = src();
    const reg = registryFor()();
    expect(reg.names()).toEqual(Object.values(LEAGUE_MODELS).sort());
    const b = buildReadModel(reg, s, observerFor(s, USER), LEAGUE_MODELS.standings, { competitionId: PRO, seasonYear: YEAR });
    expect(b.model.permission).toBe('Read');
    buildReadModel(reg, s, observerFor(s, USER), LEAGUE_MODELS.team, { teamId: 2, seasonYear: YEAR });
    buildReadModel(reg, s, observerFor(s, USER), LEAGUE_MODELS.schedule, { competitionId: COLLEGE, seasonYear: YEAR, teamId: 101 });
  });
  it('passes the crawler for every seat', () => {
    const s = src();
    const observers = [USER, RIVAL_HC, 501].map((id) => ({ name: `person ${id}`, observer: observerFor(s, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
    const params = (m: string) => {
      switch (m) {
        case LEAGUE_MODELS.standings: return [{ competitionId: PRO, seasonYear: YEAR }, { competitionId: COLLEGE, seasonYear: YEAR }];
        case LEAGUE_MODELS.schedule: return [{ competitionId: PRO, seasonYear: YEAR, teamId: 1 }, { competitionId: PRO, seasonYear: YEAR, teamId: null }];
        case LEAGUE_MODELS.team: return [{ teamId: 1, seasonYear: YEAR }, { teamId: 2, seasonYear: YEAR }];
        case LEAGUE_MODELS.transactions: return [{ competitionId: PRO }, { competitionId: null }];
        case LEAGUE_MODELS.records: return [{ competitionId: PRO, seasonYear: null }];
        default: return [{}];
      }
    };
    const r = crawlReadModels({ registry: registryFor(), source: s, observers, params, markedPersonIds: [501, 502, 503] });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(r.divergences).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });
});
