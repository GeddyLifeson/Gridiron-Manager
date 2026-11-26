// G-87 season runner (R1.2.7 gate item 1; Q1.3.1 season replay). FAKE game port: these tests cover the
// order of a season, not football outcomes.
import { describe, expect, it } from 'vitest';
import { calendar, week as weekly } from '@gm/league';
import {
  SeasonInvariantError, createSeason, delegatingDriver, gameSeedHex, leaders, recordsBroken, runSeason, seasonProblems, seatPort,
  seededBracketPlan, selectionPlan, stepSeason, summariseSeason, aiPreparation,
  type PrepContext, type SeasonPorts, type SeasonSpec, type SeasonState, type SeatWeekSource, type SelectionPostState, type BracketPostState,
} from '../../src/season/index.ts';
import { COLLEGE_RULES, PRO_RULES, fakeGame, proTeams, roundRobin } from './fixtures.ts';

const SEED = '00c0ffee12345678';
const WEEKS = 17;

function proSpec(over: Partial<SeasonSpec> = {}): SeasonSpec {
  const teams = proTeams();
  // Team 5 sits out week 9 with its partner: a bye for the seat test.
  const fixtures = roundRobin(teams.map((t) => t.id), WEEKS).filter((f) => !(f.week === 9 && (f.home === 5 || f.away === 5)));
  return { season: 2026, seedHex: SEED, ruleSetId: 'pro_2026', teams, fixtures, leagueRules: PRO_RULES, postseason: seededBracketPlan(), seatTeamId: null, ...over };
}
const ports = (over: Partial<SeasonPorts> = {}): SeasonPorts => ({ playGame: fakeGame({ allowTies: true }), ...over });

/** Twelve teams in two conferences of five plus two independents; one conference holds a title game. */
function collegeSpec(over: Partial<SeasonSpec> = {}): SeasonSpec {
  const ids = Array.from({ length: 16 }, (_, i) => i + 1);
  const conf = (id: number) => (id <= 7 ? 1 : id <= 14 ? 2 : 0);
  const teams = ids.map((id) => ({ id, key: `school.${id}`, conferenceId: conf(id), divisionId: conf(id) }));
  const fixtures = roundRobin(ids, 11, { conference: (a, b) => conf(a) !== 0 && conf(a) === conf(b) });
  // One guest from outside the competition (a lower-subdivision opponent, T3.1.1): team 900 visits team 1 in week 12.
  fixtures.push({ gameId: fixtures.length + 1, week: 12, phase: 'regular', home: 1, away: 900, neutralSite: false, conferenceGame: false, dayIndex: null, postKey: null });
  const postseason = selectionPlan({
    conferences: [
      { conferenceId: 1, power: true, teamIds: ids.filter((i) => conf(i) === 1), titleMethod: 'standings' },
      { conferenceId: 2, power: false, teamIds: ids.filter((i) => conf(i) === 2), titleMethod: 'title_game' },
    ],
    independents: ids.filter((i) => conf(i) === 0),
    bowls: [{ bowlId: 1, order: 1, slots: [null, null] }],
    academicScore: (id) => id,
  });
  return { season: 2026, seedHex: SEED, ruleSetId: 'college_2026', teams, fixtures, leagueRules: COLLEGE_RULES, postseason, seatTeamId: null, ...over };
}

describe('G-87 season runner: a season from week 1 to the final game', () => {
  it('plays a conference-bracket season to a champion (C3.3.1, C3.4.1)', () => {
    const spec = proSpec();
    const end = runSeason(spec, ports());
    const sum = summariseSeason(spec, end);
    expect(end.stage).toBe('final');
    expect(sum.regularGames).toBe(spec.fixtures.length);
    // Field of 7 with 1 bye per conference: 3 + 2 + 1 games per conference, then the final.
    expect(sum.postseasonGames).toBe(13);
    const post = end.post as BracketPostState;
    expect(post.seeds.map((g) => g.seeds.length)).toEqual([7, 7]);
    expect(post.seeds.flatMap((g) => g.seeds)).toContain(end.champion);
    // The champion won the last game played.
    const last = end.games[end.games.length - 1]!;
    expect(last.outcome.points[0] > last.outcome.points[1] ? last.fixture.home : last.fixture.away).toBe(end.champion);
    // Every regular game is one win and one loss or two ties.
    const w = sum.teams.reduce((s, t) => s + t.wins, 0), l = sum.teams.reduce((s, t) => s + t.losses, 0), t = sum.teams.reduce((s, x) => s + x.ties, 0);
    expect(w).toBe(l);
    expect(w + t / 2).toBe(sum.regularGames);
    expect(t / 2).toBe(sum.tiedGames);
  });

  it('plays a selection season: title game, committee field, national bracket, bowls (T3.3 to T3.6)', () => {
    const spec = collegeSpec();
    const end = runSeason(spec, ports({ playGame: fakeGame({ strength: (id) => (id === 900 ? 0 : id % 3) }) }));
    const post = end.post as SelectionPostState;
    expect(end.stage).toBe('final');
    expect(post.titleGames).toHaveLength(1);
    expect(post.titleGames[0]!.winner).not.toBeNull();
    expect(post.champions.map((c) => c.conferenceId).sort()).toEqual([1, 2]);
    expect(post.champions.find((c) => c.conferenceId === 2)!.teamId).toBe(post.titleGames[0]!.winner);
    expect(post.field).toHaveLength(12);
    expect(post.field.find((f) => f.reason === 'power_champion')!.teamId).toBe(post.champions.find((c) => c.conferenceId === 1)!.teamId);
    expect(post.ranking).toHaveLength(16);
    expect(post.ranking).not.toContain(900);
    expect(post.field.map((f) => f.teamId)).toContain(end.champion);
    // 1 title game + 11 bracket games + bowls that could be filled.
    const sum = summariseSeason(spec, end);
    expect(sum.postseasonGames).toBe(1 + 11 + post.bowls.length);
    expect(post.bowls.every((b) => b.winner !== null)).toBe(true);
    // The guest has no standings line; its host counts one game outside the competition.
    expect(sum.teams).toHaveLength(16);
    expect(sum.teams.find((t) => t.teamId === 1)!.gamesOutside).toBe(1);
  });

  it('refuses to start without the league rules the postseason reads, and names them', () => {
    const { 'playoff.byes': _dropped, ...rules } = PRO_RULES;
    expect(seasonProblems(proSpec({ leagueRules: rules }))).toEqual(['league rule playoff.byes is missing (postseason plan seeded_bracket)']);
    expect(() => createSeason(proSpec({ leagueRules: rules }))).toThrow(SeasonInvariantError);
    expect(seasonProblems(proSpec({ seedHex: 'XYZ' }))[0]).toMatch(/16 lower-case hex/);
    const twice = proSpec();
    expect(seasonProblems({ ...twice, fixtures: [...twice.fixtures, { ...twice.fixtures[0]!, gameId: 9999 }] }).some((p) => /plays twice in week 1/.test(p))).toBe(true);
  });

  it('stops on a tied postseason game instead of guessing a winner (C3.4.1 rule 5)', () => {
    const spec = proSpec();
    const tieInPlayoffs: SeasonPorts = { playGame: (ctx) => (ctx.fixture.phase === 'postseason' ? { points: [10, 10], touchdowns: [1, 1], overtime: true, stateHash: 'x', plays: 1, lines: [] } : fakeGame()(ctx)) };
    expect(() => runSeason(spec, tieInPlayoffs)).toThrow(/must have a winner/);
  });
});

describe('G-87 season runner: determinism (Q1.3.1 season replay, J13.2.1)', () => {
  it('gives the same season hash twice, and a different one for another seed', () => {
    const a = summariseSeason(proSpec(), runSeason(proSpec(), ports()));
    const b = summariseSeason(proSpec(), runSeason(proSpec(), ports()));
    const c = summariseSeason(proSpec({ seedHex: '00c0ffee12345679' }), runSeason(proSpec({ seedHex: '00c0ffee12345679' }), ports()));
    expect(b).toEqual(a);
    expect(c.seasonHash).not.toBe(a.seasonHash);
  });

  it('continues from a saved state: stepping through a JSON round trip gives the same season', () => {
    for (const spec of [proSpec(), collegeSpec()]) {
      const whole = runSeason(spec, ports());
      let state: SeasonState = createSeason(spec);
      let steps = 0;
      while (state.stage !== 'final') {
        state = JSON.parse(JSON.stringify(stepSeason(spec, state, ports()))) as SeasonState;
        steps++;
      }
      expect(state.chain).toBe(whole.chain);
      expect(state.champion).toBe(whole.champion);
      expect(steps).toBeGreaterThan(state.lastRegularWeek);
      expect(stepSeason(spec, state, ports())).toBe(state);
    }
  });

  it('seeds a game from the season and the game id only, never from the order played', () => {
    const spec = proSpec();
    const seen = new Map<number, string>();
    runSeason(spec, ports({ playGame: (ctx) => { seen.set(ctx.fixture.gameId, ctx.seedHex); return fakeGame()(ctx); } }));
    for (const [gameId, seed] of seen) expect(seed).toBe(gameSeedHex(SEED, 2026, gameId));
    expect(new Set(seen.values()).size).toBe(seen.size);
    // The same fixtures listed backwards play the same season.
    const reversed = { ...spec, fixtures: [...spec.fixtures].reverse() };
    expect(runSeason(reversed, ports()).chain).toBe(runSeason(spec, ports()).chain);
  });
});

describe('G-87 season runner: preparation and the head coach seat (K3.6.1, H1.1.3)', () => {
  const templates = weekly.DEFAULT_SETS;
  const set = Object.values(templates)[0]!;
  const SUNDAY = calendar.dayNumber({ y: 2026, m: 9, d: 13 });
  const source: SeatWeekSource = {
    set, countable: false,
    kickoff: (ctx) => ({ day: SUNDAY + (ctx.week - 1) * calendar.DAYS_PER_WEEK, minute: 13 * 60 }),
    previousGameDay: (ctx) => {
      const last = ctx.results.filter((r) => r.teams.includes(ctx.teamId)).reduce((m, r) => Math.max(m, r.week), 0);
      return last === 0 ? null : SUNDAY + (last - 1) * calendar.DAYS_PER_WEEK;
    },
  };

  it('prepares every AI team with a game once a week, on results from before the week only', () => {
    const spec = proSpec();
    const calls: PrepContext[] = [];
    const end = runSeason(spec, ports({ prepare: (ctx) => { calls.push(ctx); return { plan: `${ctx.teamId}@${ctx.week}` }; }, playGame: (ctx) => {
      if (ctx.fixture.phase === 'regular') expect(ctx.preparation).toEqual([{ plan: `${ctx.fixture.home}@${ctx.fixture.week}` }, { plan: `${ctx.fixture.away}@${ctx.fixture.week}` }]);
      return fakeGame({ allowTies: true })(ctx);
    } }));
    const regular = calls.filter((c) => c.week <= WEEKS);
    expect(regular).toHaveLength(spec.fixtures.length * 2);
    expect(end.preparations).toBe(calls.length);
    for (const c of calls) expect(c.results.every((r) => r.week < c.week)).toBe(true);
    // Team order inside a week is by id (K3.6.1 rule 1).
    const week1 = calls.filter((c) => c.week === 1).map((c) => c.teamId);
    expect(week1).toEqual([...week1].sort((a, b) => a - b));
  });

  it('scopes preparation streams by season, week and team (K3.6.1 rule 5)', () => {
    const draws = (ctx: Pick<PrepContext, 'week' | 'teamId'>) => {
      const port = aiPreparation(() => ({}), (_input, streams: (n: 'scouting' | 'payoffNoise') => { uniform(): number }) => [streams('scouting').uniform(), streams('payoffNoise').uniform()]);
      return port({ season: 2026, fixture: null, results: [], seedHex: SEED, ...ctx });
    };
    expect(draws({ week: 3, teamId: 7 })).toEqual(draws({ week: 3, teamId: 7 }));
    expect(draws({ week: 3, teamId: 7 })).not.toEqual(draws({ week: 3, teamId: 8 }));
    expect(draws({ week: 3, teamId: 7 })).not.toEqual(draws({ week: 4, teamId: 7 }));
    const d = draws({ week: 3, teamId: 7 })!;
    expect(d[0]).not.toBe(d[1]);
    expect(aiPreparation(() => null, () => 1)({ season: 2026, week: 1, teamId: 1, fixture: null, results: [], seedHex: SEED })).toBeNull();
  });

  it('runs the seat team through every week, its bye included, to game day', () => {
    const spec = proSpec({ seatTeamId: 5 });
    const prepared: number[] = [];
    const end = runSeason(spec, ports({ seatWeek: seatPort(source, delegatingDriver('head_coach')), prepare: (ctx) => { prepared.push(ctx.teamId); return null; } }));
    const regular = end.seat.filter((s) => s.week <= WEEKS);
    expect(regular.map((s) => s.week)).toEqual(Array.from({ length: WEEKS }, (_, i) => i + 1));
    expect(regular.filter((s) => s.bye).map((s) => s.week)).toEqual([9]);
    for (const s of regular) {
      expect(s.reachedGameDay).toBe(!s.bye);
      expect(s.blocksRun > 0).toBe(!s.bye);
    }
    // The open days belong to the long week that leads to the next game (H1.1.1 bye shape).
    expect(regular[9]!.blocksRun).toBeGreaterThan(regular[7]!.blocksRun);
    // League deadlines passed with the staff default, since the driver answered nothing.
    const gameWeek = regular.find((s) => !s.bye)!;
    expect(gameWeek.decisions.length).toBeGreaterThan(0);
    expect(gameWeek.decisions.every((d) => !d.chosen && d.value === 'staff_default')).toBe(true);
    // The seat team is never prepared by the AI port.
    expect(prepared).not.toContain(5);
    expect(summariseSeason(spec, end).seatWeeks).toBe(end.seat.length);
  });

  it('records the choices of a head coach who answers the required items himself', () => {
    const spec = proSpec({ seatTeamId: 5 });
    const driver = { ...delegatingDriver('head_coach'), decide: (item: weekly.PendingItem) => `mine:${item.id.split('#')[0]}` };
    const first = stepSeason(spec, createSeason(spec), ports({ seatWeek: seatPort(source, driver) })).seat[0]!;
    const chosen = first.decisions.filter((d) => d.chosen);
    expect(chosen.map((d) => d.value).sort()).toEqual(['mine:elevations', 'mine:game_status', 'mine:inactives']);
    expect(first.decisions.some((d) => !d.chosen)).toBe(true);
  });

  it('stops when the seat port returns a week that never reached game day', () => {
    const spec = proSpec({ seatTeamId: 5 });
    const broken: SeasonPorts = ports({ seatWeek: (ctx) => ({ teamId: ctx.teamId, week: ctx.week, bye: false, blocksRun: 0, blocksDelegated: 0, decisions: [], reachedGameDay: false, preparation: null }) });
    expect(() => stepSeason(spec, createSeason(spec), broken)).toThrow(/before game day/);
  });
});

describe('G-87 season summary (Q1.7.2 season rows, C9 records)', () => {
  it('totals player statistics over the regular season and finds broken records', () => {
    const spec = proSpec();
    const end = runSeason(spec, ports());
    const sum = summariseSeason(spec, end);
    const best = leaders(sum, 'pass_touchdowns', 3);
    expect(best).toHaveLength(3);
    expect(best[0]!.value).toBeGreaterThanOrEqual(best[1]!.value);
    const byHand = end.games.filter((g) => g.fixture.phase === 'regular').flatMap((g) => g.outcome.lines).filter((l) => l.playerId === best[0]!.playerId).reduce((s, l) => s + l.value, 0);
    expect(best[0]!.value).toBe(byHand);
    expect(recordsBroken(sum, [{ statId: 'pass_touchdowns', value: best[0]!.value - 1 }])).toEqual([{ statId: 'pass_touchdowns', previous: best[0]!.value - 1, value: best[0]!.value, playerId: best[0]!.playerId }]);
    expect(recordsBroken(sum, [{ statId: 'pass_touchdowns', value: best[0]!.value }])).toEqual([]);
  });
});
