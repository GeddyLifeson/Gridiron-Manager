// League pages over the running season (unstarted-work item 2a): the season session laid out as world tables
// and read through the public observer. A pro week and a college week are played (the seat's game delegated
// to the staff), then every page is checked against the season session itself: the same records, the same
// scores, every group named from the content, the pro table tiebroken, college guests kept off the table.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { describe, it, expect } from 'vitest';
import { season as seasons } from '@gm/world';
import { SeasonPlay } from '../../../src/play/index.ts';
import { ReadModelRegistry, crawlReadModels, crawlPassed, PUBLIC_OBSERVER, tablesOf } from '../../../src/observer/index.ts';
import { LiveLeague, LIVE_COMPETITION_ID, LEAGUE_MODELS, epochDayOfYearStart, leagueSpecs } from '../../../src/read-models/league/index.ts';
import { LEAGUE_DATA } from './data-schema.ts';

const ROOT = resolvePath(import.meta.dirname, '../../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const CONTENT: seasons.LeagueContent = {
  proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
  college: read('packages', 'football-content', 'data', 'world', 'college.json'),
  proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
  collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
};
const SEED = '3a5c7e9b1d2f4608';

/** Plays the season up to and through the seat's next game, the staff coaching it. */
function playWeek(sp: SeasonPlay): void {
  sp.advanceToGame();
  if (sp.nextSeatGame()) sp.delegateGame();
}

describe('epoch day of a year start', () => {
  it('counts days from 1970-01-01 with leap years', () => {
    expect(epochDayOfYearStart(1970)).toBe(0);
    expect(epochDayOfYearStart(1971)).toBe(365);
    expect(epochDayOfYearStart(1973)).toBe(365 * 3 + 1); // 1972 was a leap year
    expect(epochDayOfYearStart(2026)).toBe(20454); // 2026-01-01
  });
});

describe('league pages over a pro season', { timeout: 300_000 }, () => {
  const sp = SeasonPlay.start(CONTENT, { ruleSetId: 'pro_2026', seasonYear: 2026, seedHex: SEED, seatTeamKey: 'club.mby' });
  const live = new LiveLeague({ season: sp, content: CONTENT });

  it('before a game: every club on the table, every division named, all games scheduled', () => {
    const s = live.standings();
    expect(s.level).toBe('pro');
    expect(s.lines).toHaveLength(sp.built.spec.teams.length);
    expect(s.gamesCounted).toBe(0);
    const divisions = s.groups.filter((g) => g.kind === 'division');
    expect(divisions.length).toBe(8);
    expect(divisions.every((g) => g.name.startsWith('Harbor Conference') || !g.name.startsWith('#'))).toBe(true);
    expect(divisions.every((g) => g.teamIds.length === 4 && g.final)).toBe(true);
    const sch = live.schedule(null);
    expect(sch.weeks.flatMap((w) => w.games)).toHaveLength(sp.built.spec.fixtures.length);
    expect(sch.weeks.flatMap((w) => w.games).every((g) => g.status === 'scheduled' && g.kickoff.dayIndex >= 0 && g.kickoff.dayIndex < 400)).toBe(true);
  });

  it('after a week: records, scores and the seat team page agree with the season session', () => {
    playWeek(sp);
    const today = sp.today();
    const s = live.standings();
    expect(s.gamesCounted).toBe(sp.state.results.filter((r) => r.phase === 'regular').length);
    expect(s.gamesCounted).toBeGreaterThan(0);
    for (const row of today.standings) {
      const line = s.lines.find((l) => l.teamId === row.teamId)!;
      expect(line.record).toEqual({ w: row.wins, l: row.losses, t: row.ties });
      expect(line.pointsFor).toBe(row.pointsFor);
    }
    // Each division's order is the league's tiebroken order (C3.1.3), never a percentage fallback.
    const table = live.standingsSource().pro!.table!;
    for (const g of s.groups.filter((x) => x.kind === 'division')) expect(g.teamIds).toEqual(table.divisions.find((d) => d.divisionId === g.groupId)!.order);
    expect(s.seeds).toHaveLength(2);

    const played = sp.state.games;
    const sch = live.schedule(sp.seatTeamId);
    const finals = sch.weeks.flatMap((w) => w.games).filter((g) => g.status === 'final');
    expect(finals).toHaveLength(played.length);
    for (const p of played) expect(finals.find((g) => g.gameId === p.fixture.gameId)!.score).toEqual([p.outcome.points[0], p.outcome.points[1]]);
    expect(sch.teamRows.some((r) => r.result !== null)).toBe(true);

    const team = live.team(sp.seatTeamId)!;
    expect(team.team.name).toBe(today.seatTeamName);
    expect(team.record).toEqual({ w: today.record.wins, l: today.record.losses, t: today.record.ties });
    expect(team.venue).toMatchObject({ name: 'Marlbury Memorial Stadium', place: 'Marlbury', roof: 'open', capacity: 77700 });
    // A domed club's roof comes through in the schema's words (the world generator's mapping).
    const domed = live.team(sp.built.spec.teams.find((t) => t.key === 'club.hud')!.id)!;
    expect(domed.venue?.roof).toBe('fixed_dome');
    expect(team.groupNames.length).toBe(2);
    expect(team.results.length + team.upcoming.length).toBe(sch.teamRows.filter((r) => r.game).length);
    expect(team.rivals.length).toBeGreaterThan(0);
    // No world: no staff, roster, transactions or news to show, and the history is this season alone.
    expect(team.staff).toEqual([]);
    expect(live.transactions().lines).toEqual([]);
    expect(live.news().lines).toEqual([]);
    expect(live.records(null).history.map((h) => h.seasonYear)).toEqual([2026]);
  });

  it('every page builds through the registry, matches its schema and passes the crawler (Q1.4.2)', () => {
    const src = tablesOf(live.tables() as Record<string, unknown[]>);
    const registry = () => {
      const r = new ReadModelRegistry();
      const specs = leagueSpecs(LEAGUE_DATA, { standings: () => live.standingsSource(), context: () => live.wireContext() });
      r.register(specs.standings).register(specs.schedule).register(specs.team).register(specs.transactions).register(specs.news).register(specs.records);
      return r;
    };
    const p = { competitionId: LIVE_COMPETITION_ID, seasonYear: 2026 };
    const params = (m: string) => {
      switch (m) {
        case LEAGUE_MODELS.standings: return [p];
        case LEAGUE_MODELS.schedule: return [{ ...p, teamId: sp.seatTeamId }, { ...p, teamId: null }];
        case LEAGUE_MODELS.team: return [{ teamId: sp.seatTeamId, seasonYear: 2026 }];
        case LEAGUE_MODELS.transactions: return [{ competitionId: LIVE_COMPETITION_ID }];
        case LEAGUE_MODELS.records: return [{ competitionId: LIVE_COMPETITION_ID, seasonYear: null }];
        default: return [{}];
      }
    };
    const r = crawlReadModels({ registry, source: src, observers: [{ name: 'public', observer: PUBLIC_OBSERVER }], params });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });
});

describe('league pages over a college season', { timeout: 600_000 }, () => {
  const sp = SeasonPlay.start(CONTENT, { ruleSetId: 'college_2026', seasonYear: 2026, seedHex: SEED, seatTeamKey: 'school.wrenham' });
  const live = new LiveLeague({ season: sp, content: CONTENT });

  it('conferences named from the content, independents grouped, guests off the table, results in', () => {
    playWeek(sp);
    const s = live.standings();
    expect(s.level).toBe('college');
    expect(s.lines).toHaveLength(sp.built.spec.teams.length);
    const names = s.groups.map((g) => g.name);
    expect(names).toContain('Great Lakes Football Alliance');
    expect(names).toContain('Independents');
    expect(s.groups.every((g) => g.kind === 'conference')).toBe(true);
    const inTable = new Set(s.lines.map((l) => l.teamId));
    const guests = live.schedule(null).weeks.flatMap((w) => w.games).flatMap((g) => g.teamIds).filter((id) => !inTable.has(id));
    // Guests from other levels are on the schedule and named, but have no standings line.
    expect(guests.length).toBeGreaterThan(0);
    expect(guests.every((id) => !live.schedule(null).teams[String(id)]!.name.startsWith('#'))).toBe(true);
    const today = sp.today();
    for (const row of today.standings) expect(s.lines.find((l) => l.teamId === row.teamId)!.record).toEqual({ w: row.wins, l: row.losses, t: row.ties });
    expect(s.gamesCounted).toBeGreaterThan(0);
  });
});
