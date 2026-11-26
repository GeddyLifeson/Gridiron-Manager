// Career year (playtest finding offseason.no_real_world): a world from the app's own content keeps running
// after its start; the season session's games become the world's results for the seat's competition; the
// offseason runs the world's season point (development, cohorts, moves with recruiting); the next season
// starts; a save round-trips with the same world hash and continues the same way.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { describe, it, expect } from 'vitest';
import { generation, loop, season as seasons, turnover } from '@gm/world';
import { CareerYear } from '../../src/play/index.ts';
import { appWorldContent } from '../../src/newgame/content.ts';

const ROOT = resolvePath(import.meta.dirname, '../../../..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (...p: string[]): any => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
const CONTENT: seasons.LeagueContent = {
  proLeague: read('packages', 'football-content', 'data', 'world', 'pro-league.json'),
  college: read('packages', 'football-content', 'data', 'world', 'college.json'),
  proLeagueRules: read('packages', 'rules-data', 'data', 'league', 'proleague_2026.json'),
  collegeLeagueRules: read('packages', 'rules-data', 'data', 'league', 'collegeleague_2026.json'),
};

/** TEST DOUBLE for the world's own games (not a result model): home wins by a point, so the loop has rows. */
const doubleGames: loop.GamePort = () => ({ homePoints: 1, awayPoints: 0, passPlays: 0, runPlays: 0 });

function freshWorld(): loop.LiveWorld {
  const app = appWorldContent();
  const setup = generation.createSetup({
    seedHex: '00000000c0ffee01', size: 'small', historySeasons: 1, packs: [], careerCurveDial: null, rulebookEra: 'era:2026',
    eraProgression: false, firstSeasonYear: 2026,
  });
  return loop.createWorld({ setup, content: app.content, names: app.names, eventTypes: turnover.TURNOVER_EVENT_TYPES });
}

const proTeam = (w: loop.LiveWorld): number => w.teams.find((t) => turnover.levelOfTeam(w, t.id) === 'pro')!.id;

describe('career year', () => {
  it('plays a season into the world, runs the offseason, and saves to the same world hash', () => {
    const world = freshWorld();
    const seat = proTeam(world);
    const y = CareerYear.start({ world, content: CONTENT, seatTeamId: seat, games: doubleGames });
    expect(y.level).toBe('pro');
    const year = world.date.seasonYear;

    // A few weeks, then save and restore mid-season: the same world hash, and both continue alike.
    for (let i = 0; i < 3; i++) y.delegateWeek();
    const saved = JSON.parse(JSON.stringify(y.save()));
    const back = CareerYear.restore({ content: CONTENT, games: doubleGames }, saved);
    expect(back.view().worldHash).toBe(y.view().worldHash);
    y.delegateWeek(); back.delegateWeek();
    expect(back.view().worldHash).toBe(y.view().worldHash);

    while (y.delegateWeek()) { /* the staff runs the season */ }
    expect(y.season.stage).toBe('final');

    // The seat's competition in the world's results is the season the session played.
    const played = y.season.state.games.length;
    const seatRows = world.results.filter((r) => r.competitionId === y.seatCompetitionId);
    expect(seatRows.length).toBe(played);
    const sum = y.season.summary();
    const mine = sum.teams.find((t) => t.teamId === y.season.seatTeamId)!;

    const people0 = world.people.size;
    const s = y.runOffseason();
    expect(s.seasonYear).toBe(year);
    const rec = s.records[seat]!;
    expect([rec.wins, rec.losses, rec.ties]).toEqual([mine.wins, mine.losses, mine.ties]);
    expect(Object.keys(s.champions).map(Number)).toContain(y.seatCompetitionId);
    // The season point ran: a new class came in, and the next season started from the same world.
    expect(world.people.size).toBeGreaterThan(people0);
    expect(world.date.seasonYear).toBe(year + 1);
    expect(y.season.options.seasonYear).toBe(year + 1);
    expect(loop.unboundSteps(y.systems).map((u) => u.step)).not.toContain('moves');
  }, 600_000);
});
