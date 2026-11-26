import { calendar, recruiting } from '@gm/league';
import { describe, expect, it } from 'vitest';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as rec from '../../src/recruiting/index.ts';

const content = trimmed();
const base: turnover.TurnoverBinding = { content, rule: (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k) };

function build(opts: { seedHex?: string; policy?: boolean; user?: rec.RecruitingBinding['user'] } = {}) {
  const calls = { offers: 0 };
  const gmPolicy = rec.gmRecruitingPolicy();
  const rb: rec.RecruitingBinding = {
    turnover: base, calendarFiles: calendar.CALENDAR_FILES,
    policy: opts.policy === false ? undefined : () => ({ ...gmPolicy, offersWanted: (q) => { calls.offers++; return gmPolicy.offersWanted!(q); } }),
    ...(opts.user ? { user: opts.user } : {}),
  };
  const binding: turnover.TurnoverBinding = { ...base, policy: rec.lettersPolicy(undefined) };
  const w = loop.createWorld({ setup: setup(opts.seedHex ? { seedHex: opts.seedHex } : {}), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const col = w.teams.length - pro;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: () => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
      recruitLeadYears: rec.param('cohort.leadYears'),
    }),
    development: turnover.developmentStep(binding), moves: rec.movesWithRecruiting(rb, turnover.rosterMovesStep(binding)),
  }, 'test: not bound');
  return { w, sys, calls };
}

const signedKinds = (w: loop.LiveWorld) => w.log.rows().filter((e) => e.type === turnover.PLAYER_SIGNED).map((e) => e.payload.kind);

describe('off-screen recruiting (T4, X12.1.1)', () => {
  const t0 = Date.now();
  const { w, sys, calls } = build();
  const digests: Record<string, unknown>[] = [];
  for (let i = 0; i < 4; i++) {
    loop.runSeason(w, sys, testSchedule);
    digests.push({ ...rec.recruitingOf(w), state: undefined });
  }
  const ms = Date.now() - t0;

  it('runs every recruiting week of the year and opens one class per year', () => {
    const r = rec.recruitingOf(w);
    expect(r.throughDay).not.toBeNull();
    // Four seasons in: the class enrolling next season is open and has prospects.
    expect(r.classes.length).toBeGreaterThan(0);
    expect(Object.keys(r.state.prospects).length).toBeGreaterThan(0);
    expect(r.seen).toContain(w.date.seasonYear);
  });

  it('enrols recruited classes through their signed letters', () => {
    const rows = w.log.rows().filter((e) => e.type === turnover.PLAYER_SIGNED && e.payload.kind === 'recruit');
    expect(rows.length).toBeGreaterThan(0);
    expect(signedKinds(w)).toContain('recruit');
  });

  it('asks the front office policy for offers', () => {
    expect(calls.offers).toBeGreaterThan(0);
  });

  it('holds every roster at its limit with no player on two rosters', () => {
    const seen = new Set<number>();
    for (const [teamId, ids] of w.rosters) {
      expect(ids.length).toBe(turnover.specOf(base, w, teamId).rosterLimit);
      for (const id of ids) { expect(seen.has(id)).toBe(false); seen.add(id); }
    }
  });

  it('replays to the same world hash from the same seed', () => {
    const again = build();
    for (let i = 0; i < 4; i++) loop.runSeason(again.w, again.sys, testSchedule);
    expect(loop.worldHash(again.w)).toBe(loop.worldHash(w));
  });

  it('reports its timing', () => {
    const programs = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) !== 'pro').length;
    console.log(`recruiting world: ${programs} programs, 4 seasons in ${ms} ms`);
    expect(ms).toBeGreaterThan(0);
  });
});

describe('the user\'s own program (T4 user binding)', () => {
  let userTeam = -1;
  const days: number[] = [];
  let looked: number | null = null;
  const { w, sys } = build({
    user: (world) => {
      if (userTeam < 0) userTeam = world.teams.find((t) => turnover.levelOfTeam(world, t.id) === 'college')!.id;
      return {
        teamIds: [userTeam],
        act: (d) => {
          days.push(d.day);
          if (looked !== null) return;
          const p = Object.values(d.state.prospects).find((x) => x.classYear === d.classYear);
          if (!p) return;
          looked = p.personId;
          recruiting.takeLook(d.state, d.ctx, userTeam, p.personId, 'full_film', d.day, { skill: 0.5, competition: 1, byPositionCoach: false });
          recruiting.makeOffer(d.state, d.ctx, userTeam, p.personId, d.day, false);
        },
      };
    },
  });
  for (let i = 0; i < 2; i++) loop.runSeason(w, sys, testSchedule);
  const r = rec.recruitingOf(w);

  it('is asked on every recruiting day and its acts land on the board', () => {
    expect(days.length).toBeGreaterThan(0);
    expect(looked).not.toBeNull();
    expect(recruiting.gradeOf(r.state, userTeam, looked!).looks.full_film).toBe(1);
  });

  it('is not run as an AI program', () => {
    expect(recruiting.boardOf(r.state, userTeam).builtClasses).toEqual([]);
    const other = w.teams.find((t) => t.id !== userTeam && turnover.levelOfTeam(w, t.id) === 'college')!.id;
    expect(recruiting.boardOf(r.state, other).builtClasses.length).toBeGreaterThan(0);
  });
});
