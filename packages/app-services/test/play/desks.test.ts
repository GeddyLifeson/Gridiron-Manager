// Practice, scouting and recruiting desks of the career year (playtest findings practice.not_in_barrel:unbound,
// scouting.exported:unbound, recruiting.no_context:unbound): the user's practice plan is checked and run on the
// seat team's world roster at the week's advance (the staff week when he leaves it), the staff's eye turns
// practices and seat games into D6 estimates, a college career's own program recruits only through the acts
// the user queues, and all three come back from a save.
import { readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { describe, it, expect } from 'vitest';
import { practice as pr, recruiting as lrec } from '@gm/league';
import { generation, loop, recruiting as wrec, season as seasons, turnover } from '@gm/world';
import { CareerYear, STAFF_WEEK, type PracticePlan } from '../../src/play/index.ts';
import { appWorldContent, type AppWorldContent } from '../../src/newgame/content.ts';
import { bindSystems } from '../../src/newgame/binding.ts';

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

const setupOf = () => generation.createSetup({
  seedHex: '00000000c0ffee01', size: 'small', historySeasons: 1, packs: [], careerCurveDial: null, rulebookEra: 'era:2026',
  eraProgression: false, firstSeasonYear: 2026,
});

function freshWorld(): loop.LiveWorld {
  const app = appWorldContent();
  return loop.createWorld({ setup: setupOf(), content: app.content, names: app.names, eventTypes: turnover.TURNOVER_EVENT_TYPES });
}

/** The app's content cut to 8 pro clubs and 6 schools of one conference (the world tests' `trimmed`). */
function trimmedApp(): AppWorldContent {
  const app = appWorldContent();
  const c = app.content;
  const clubs = c.pro.league.clubs.slice(0, 8);
  const clubIds = new Set(clubs.map((x) => x.id));
  const conf = c.college.conferences[0]!;
  const schoolIds = new Set(conf.memberIds.slice(0, 6));
  return {
    ...app,
    content: {
      ...c,
      pro: { league: { ...c.pro.league, clubs }, stadiums: c.pro.stadiums.filter((s) => clubIds.has(s.clubId)), rivalries: c.pro.rivalries.filter((r) => clubIds.has(r.a) && clubIds.has(r.b)) },
      college: { ...c.college, conferences: [{ ...conf, memberIds: [...schoolIds] }], independents: [], schools: c.college.schools.filter((s) => schoolIds.has(s.id)), rivalries: c.college.rivalries.filter((r) => schoolIds.has(r.a) && schoolIds.has(r.b)) },
      collegeLevelsBySize: { full: ['college_top'], standard: ['college_top'], small: ['college_top'] },
    },
  };
}

const teamAt = (w: loop.LiveWorld, level: string): number => w.teams.find((t) => turnover.levelOfTeam(w, t.id) === level)!.id;

/** The user's own practice: the staff week with a live competition period added, in full pads. */
function userPlan(day: number): PracticePlan {
  const me: pr.PeriodLeader = { staffId: 'me', role: 'head_coach', user: true };
  const periods = [...STAFF_WEEK.periods, pr.newPeriod(7, 'one_on_one_wr_db', me, { minutes: 10, tempo: 'live', groups: ['WR', 'CB'] })];
  return { practice: { id: 'mine', blockId: 'b', blockMinutes: 150, day, pads: 'full', periods, environment: pr.NO_ENVIRONMENT, headCoachPresent: true }, scripts: {} };
}

describe('career desks', () => {
  it('runs the user practice, then the staff week, feeds the staff eye, and saves', () => {
    const world = freshWorld();
    const seat = teamAt(world, 'pro');
    const y = CareerYear.start({ world, content: CONTENT, seatTeamId: seat, games: doubleGames, resolver: 'reference' });

    // A broken plan is refused with its problems; a good one is kept and shown.
    const broken: PracticePlan = { ...userPlan(0), practice: { ...userPlan(0).practice, blockMinutes: 30 } };
    const bad = y.practice.plan([broken]);
    expect(bad[0]!.ok).toBe(false);
    expect(y.practice.planned).toHaveLength(0);
    const good = y.practice.plan([userPlan(wrec.dayOfWorld(world.date))]);
    expect(good[0]!.problems).toEqual([]);
    expect(y.practice.planned).toHaveLength(1);
    const view = y.practice.view(y.practice.planned[0]!);
    expect(view.periods).toHaveLength(7);
    expect(view.paddedLeft).not.toBeNull();

    y.delegateWeek();
    const first = y.lastWeek.practices;
    expect(first).toHaveLength(1);
    expect(first[0]!.by).toBe('user');
    expect(first[0]!.report.repsCompleted).toBeGreaterThan(0);
    expect(first[0]!.paddedUsed).toBe(true);
    expect(y.practice.paddedUsed).toBe(1);
    // Reps went to the seat's own players.
    const roster = new Set((world.rosters.get(seat) ?? []).map(String));
    for (const id of Object.keys(first[0]!.reps)) expect(roster.has(id)).toBe(true);
    expect(y.practice.planned).toHaveLength(0);
    expect(y.scouting.sessionCount).toBeGreaterThanOrEqual(1);
    const seenAfterPractice = y.scouting.playersSeen;
    expect(seenAfterPractice).toBeGreaterThan(0);

    // A week left alone runs on the staff week; a seat game adds film looks.
    let games = 0;
    for (let i = 0; i < 4; i++) { y.delegateWeek(); expect(y.lastWeek.practices[0]!.by).toBe('staff'); games += y.lastWeek.gamesSeen; }
    expect(games).toBeGreaterThan(0);
    const anyId = Number(Object.keys(first[0]!.reps)[0]);
    const seen = y.scouting.player(anyId)!;
    for (const b of Object.values(seen.attributes)) { expect(b.low).toBeLessThanOrEqual(b.mean); expect(b.high).toBeGreaterThanOrEqual(b.mean); expect(b.looks).toBeGreaterThan(0); }

    // The save keeps the desks and the same world.
    const saved = JSON.parse(JSON.stringify(y.save()));
    const back = CareerYear.restore({ content: CONTENT, games: doubleGames, resolver: 'reference' }, saved);
    expect(back.view().worldHash).toBe(y.view().worldHash);
    expect(back.practice.history).toHaveLength(y.practice.history.length);
    expect(back.scouting.player(anyId)).toEqual(seen);
    y.delegateWeek(); back.delegateWeek();
    expect(back.view().worldHash).toBe(y.view().worldHash);
    expect(back.scouting.save()).toEqual(y.scouting.save());
  }, 600_000);

  it('takes a college career program out of the AI programs and takes the acts the user queues', () => {
    // A small world (8 clubs, 6 schools) so a college season runs in the test's time. It is made without its
    // history, so it has no recruit pool yet: one season point brings the classes in.
    const app = trimmedApp();
    const world = loop.createWorld({ setup: setupOf(), content: app.content, names: app.names, eventTypes: turnover.TURNOVER_EVENT_TYPES });
    const pre = bindSystems(world, { games: doubleGames, recruiting: true, content: app });
    while (world.week < pre.schedule.weeksInSeason(world)) loop.runWeek(world, pre.systems);
    loop.runSeasonPoint(world, pre.systems);
    const seat = teamAt(world, 'college');
    const y = CareerYear.start({ world, content: CONTENT, seatTeamId: seat, games: doubleGames, resolver: 'reference', worldContent: app });
    expect(y.level).toBe('college');
    let r = wrec.recruitingOf(world);
    const openNow = () => Object.values(r.state.prospects).filter((p) => r.classes.includes(p.classYear) && r.state.status[p.personId]?.status === 'open');
    for (let i = 0; i < 52 && openNow().length === 0 && y.delegateWeek(); i++) r = wrec.recruitingOf(world);
    const open = openNow();
    expect(open.length).toBeGreaterThan(0);
    // No AI week acted for the user's program: its board holds no class the AI built.
    expect(lrec.boardOf(r.state, seat).builtClasses).toEqual([]);

    const target = open[0]!.personId;
    y.recruiting.queueAct({ type: 'look', kind: 'full_film', prospectId: target });
    y.recruiting.queueAct({ type: 'offer', prospectId: target, committable: false });
    y.recruiting.queueAct({ type: 'act', kind: 'call', prospectId: target });
    // The world's recruiting Wednesdays resume once its calendar passes the February signing day it ran ahead to at week 0.
    for (let i = 0; i < 20 && y.recruiting.queued.length > 0; i++) y.delegateWeek();
    expect(y.recruiting.queued).toHaveLength(0);
    const log = y.recruiting.record;
    expect(log.map((l) => l.act.type)).toEqual(['look', 'offer', 'act']);
    expect(log.slice(0, 2).every((l) => l.outcome === 'taken')).toBe(true);
    r = wrec.recruitingOf(world);
    expect(lrec.gradeOf(r.state, seat, target).looks.full_film).toBe(1);
    expect(lrec.activeOffer(r.state, target, seat)).toBeDefined();

    const back = CareerYear.restore({ content: CONTENT, games: doubleGames, resolver: 'reference', worldContent: app }, JSON.parse(JSON.stringify(y.save())));
    expect(back.recruiting.record).toEqual(log);
    expect(back.view().worldHash).toBe(y.view().worldHash);
  }, 600_000);
});
