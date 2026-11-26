// World game days: club rosters of world people as the real game's teams (gameday), and the player lines
// the games step keeps (loop/player-stats.ts).
import { describe, expect, it } from 'vitest';
import { field } from '@gm/engine-core';
import { stats } from '@gm/engine-game';
import { miniWorld, testSchedule, loop } from '../fixtures.ts';
import * as gameday from '../../src/gameday/index.ts';
import * as turnover from '../../src/turnover/index.ts';
import { createRealGameCore, KICK_ROLES, OFFENSE_ROLES } from '../../src/season/index.ts';

const w = miniWorld();
const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro');
const grades = turnover.gradeContext(w, turnover.rosteredSet(w));
const opts = { gradeOf: (t: number, p: number) => grades.grade(t, p) };
const posOf = (id: number): string => w.people.get(id)!.playing!.position;
const eligibleNumber = (n: number): boolean => n <= 49 || (n >= 80 && n <= 89);

describe('lineup plans', () => {
  it('fills the eligible slots from the personnel code', () => {
    const fits = (code: string) => gameday.offensePlan(code).slots.slice(7).map((f) => f[0]);
    expect(fits('11')).toEqual(['WR', 'WR', 'TE', 'WR']);
    expect(fits('12')).toEqual(['WR', 'WR', 'TE', 'TE']);
    expect(fits('21')).toEqual(['WR', 'WR', 'TE', 'FB']);
    expect(fits('13')).toEqual(['WR', 'TE', 'TE', 'TE']);
    expect(fits('10')).toEqual(['WR', 'WR', 'WR', 'WR']);
    for (const [, plan] of gameday.unitPlans()) expect(plan.slots).toHaveLength(11);
  });
  it('takes the best fit, then the higher staff grade, and spares starters on coverage units', () => {
    const c = [{ id: 1, position: 'G', grade: 90 }, { id: 2, position: 'T', grade: 40 }, { id: 3, position: 'T', grade: 60 }];
    expect(gameday.fillUnit({ slots: [['T', 'G']], bench: [false] }, c, new Set())).toEqual([3]);
    expect(gameday.fillUnit({ slots: [['T', 'G']], bench: [true] }, c, new Set([3]))).toEqual([2]);
    // Nobody fits: the best player left stands in (a club must field the slot).
    expect(gameday.fillUnit({ slots: [['QB']], bench: [false] }, c, new Set())).toEqual([1]);
  });
  it('hands numbers from the position bands, keeping a fitting last number', () => {
    const j = gameday.assignJerseys([{ id: 5, position: 'T', lastJersey: 3 }, { id: 6, position: 'QB', lastJersey: 7 }, { id: 7, position: 'WR', lastJersey: 7 }]);
    expect(j.get(5)).toBe(60);
    expect(j.get(6)).toBe(7);
    expect(j.get(7)).toBe(10);
  });
});

describe('a club as the real game sees it', () => {
  const home = gameday.worldTeam(w, pro[0]!.id, 0, opts)!;
  const roster = new Set(w.rosters.get(pro[0]!.id));
  it('dresses only its own active people, each unit eleven distinct men', () => {
    expect(home.players.map((p) => p.playerId)).toEqual([...home.players.map((p) => p.playerId)].sort((a, b) => a - b));
    for (const p of home.players) expect(roster.has(p.playerId)).toBe(true);
    const dressed = new Set(home.players.map((p) => p.playerId));
    for (const [key, ids] of Object.entries(home.depth)) {
      expect(ids, key).toHaveLength(11);
      expect(new Set(ids).size, key).toBe(11);
      for (const id of ids) expect(dressed.has(id)).toBe(true);
    }
    expect(new Set(home.players.map((p) => p.jersey)).size).toBe(home.players.length);
  });
  it('puts linemen in ineligible numbers and the kick unit\'s ends and backs in eligible ones', () => {
    const jersey = (id: number) => home.players.find((p) => p.playerId === id)!.jersey;
    home.depth.offense!.slice(0, 5).forEach((id) => expect(eligibleNumber(jersey(id))).toBe(false));
    expect(posOf(home.depth.offense![OFFENSE_ROLES.indexOf('Q')]!)).toBe('QB');
    for (const key of ['kick:punt', 'kick:field_goal']) {
      const ids = home.depth[key]!;
      for (const role of ['LE', 'RE', 'LW', 'RW']) expect(eligibleNumber(jersey(ids[KICK_ROLES.indexOf(role as typeof KICK_ROLES[number])]!)), `${key} ${role}`).toBe(true);
    }
    expect(posOf(home.depth['kick:punt']![KICK_ROLES.indexOf('K')]!)).toBe('P');
    expect(posOf(home.depth['kick:field_goal']![KICK_ROLES.indexOf('K')]!)).toBe('K');
  });
  it('orders by the staff grade it is given, and leaves out players who are out', () => {
    const qbs = [...roster].filter((id) => posOf(id) === 'QB');
    const flipped = gameday.worldTeam(w, pro[0]!.id, 0, { gradeOf: (t, p) => -grades.grade(t, p) })!;
    const q = OFFENSE_ROLES.indexOf('Q');
    expect(qbs.length).toBeGreaterThan(1);
    expect(flipped.depth.offense![q]).not.toBe(home.depth.offense![q]);
    const starter = home.depth.offense![q]!;
    const without = gameday.worldTeam(w, pro[0]!.id, 0, { ...opts, isOut: (id) => id === starter })!;
    expect(without.players.some((p) => p.playerId === starter)).toBe(false);
    expect(without.depth.offense![q]).not.toBe(starter);
  });
  it('plays a real game whose credits and injuries name world people of the two clubs', () => {
    const away = gameday.worldTeam(w, pro[1]!.id, 1, opts)!;
    const g = createRealGameCore('pro_2026');
    const res = g.simulate({ ...g.input(0, '00000000000000a1'), teams: [home, away] });
    const ids = new Set([...home.players, ...away.players].map((p) => p.playerId));
    const s = stats.createStatsModule({ geometry: field.fieldGeometry(g.rules), params: g.params });
    let credited = 0, formation = 0;
    for (const rec of res.records) {
      for (const c of s.credits(rec)) if (c.playerId !== null) { expect(ids.has(c.playerId)).toBe(true); credited++; }
      for (const e of rec.truth.events) {
        if (e.type === 'injury') expect(ids.has(e.playerId)).toBe(true);
        if (e.type === 'foul_committed' && e.foulId === 'illegal_formation') formation++;
      }
    }
    expect(credited).toBeGreaterThan(500);
    // The placeholder rosters draw a few formation flags a game; world rosters must not add a kick-unit numbering foul on every kick.
    expect(formation).toBeLessThan(10);
  }, 120_000);
});

describe('player lines in the games step', () => {
  it('keeps the week\'s lines and season totals, regular and postseason apart, and folds careers at the next season', () => {
    const world = miniWorld();
    const [a, b] = [...world.rosters.values()].map((r) => r[0]!);
    const port: loop.GamePort = (req) => ({
      homePoints: 10, awayPoints: 7, passPlays: 30, runPlays: 30, injuries: [],
      lines: [{ personId: a!, teamId: req.game.homeTeamId, statId: 'rushing_yards', value: 50 }, { personId: a!, teamId: req.game.homeTeamId, statId: 'snaps_offense', value: 40 },
        { personId: b!, teamId: req.game.awayTeamId, statId: 'tackles_solo', value: 3 }],
    });
    const step = loop.gamesStep(testSchedule, port);
    const ctx = { world, step: 'games', source: 'sim', tierOfTeam: () => 3, open: () => { throw new Error('no streams'); }, emit: () => { throw new Error('no events'); }, markOutOfFootball: () => {} } as unknown as loop.StepContext;
    const digest = step(ctx) as Record<string, number>;
    const games = digest.games!;
    expect(games).toBeGreaterThan(0);
    expect(digest.linedGames).toBe(games);
    const week = world.systemState.get(loop.GAME_LINES_KEY) as loop.WeekLines;
    expect(week.lines).toHaveLength(3 * games);
    const s = loop.playerStatsOf(world);
    expect(s.season[a!]!.regular.rushing_yards).toBe(50 * games);
    expect(s.season[a!]!.regular[loop.GAMES_PLAYED]).toBe(games);
    loop.addGameLines(world, 'postseason', [{ personId: b!, teamId: 1, statId: 'tackles_solo', value: 2 }]);
    expect(s.season[b!]!.postseason.tackles_solo).toBe(2);
    world.date = { ...world.date, seasonYear: world.date.seasonYear + 1 };
    loop.addGameLines(world, 'regular', [{ personId: b!, teamId: 1, statId: 'tackles_solo', value: 1 }]);
    expect(loop.careerOf(world, a!)!.regular.rushing_yards).toBe(50 * games);
    expect(loop.careerOf(world, b!)!.postseason.tackles_solo).toBe(2);
    expect(loop.seasonLineOf(world, a!)).toBeNull();
    expect(loop.seasonLineOf(world, b!)!.regular.tackles_solo).toBe(1);
  });
});
