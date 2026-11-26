import { calendar, college } from '@gm/league';
import { describe, expect, it } from 'vitest';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as portal from '../../src/portal/index.ts';
import { dayOfWorld } from '../../src/recruiting/calendar.ts';

const content = trimmed();
const base: turnover.TurnoverBinding = { content, rule: (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k) };
const pb: portal.PortalBinding = { turnover: base, calendarFiles: calendar.CALENDAR_FILES };

function build(seedHex?: string) {
  const w = loop.createWorld({
    setup: setup(seedHex ? { seedHex } : {}), content, names: NAMES,
    eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...portal.PORTAL_EVENT_TYPES],
  });
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const col = w.teams.length - pro;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: () => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
    }),
    development: turnover.developmentStep(base),
    moves: portal.movesWithPortal(pb, turnover.movesStep(base, turnover.rosterMovesStep(base))),
  }, 'test: not bound');
  return { w, sys };
}

const collegeTeams = (w: loop.LiveWorld) => w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'college').map((t) => t.id);

describe('transfer portal rules and window (T6.1.1)', () => {
  it('reads the transfer keys from the league rules (F-college-keys-0024 to 0028)', () => {
    expect(portal.transferRules(pb, 'college').transfer).toEqual({ postseasonExtraDays: 5, coachChangeDelayDays: 5, coachChangeWindowDays: 15, maxFree: 0, aidEndsOnEntry: false });
  });

  it('takes the 2026 window from the dated calendar (January 2 to 16, Verified) and the market close from week one', () => {
    const d = portal.cycleDates(pb, 2026)!;
    expect(calendar.civil(d.window.open)).toMatchObject({ y: 2026, m: 1, d: 2 });
    expect(calendar.civil(d.window.close)).toMatchObject({ y: 2026, m: 1, d: 16 });
    expect(d.windowStatus).toBe('Verified');
    expect(d.marketClose).toBeGreaterThan(d.window.close);
    // Years without a dated file use the pattern, whose status says so.
    expect(portal.cycleDates(pb, 2031)!.windowStatus).not.toBe('Verified');
  });
});

describe('off-screen transfer portal (T6, X12.1.1)', () => {
  const t0 = Date.now();
  const { w, sys } = build();
  const SEASONS = 4;
  const seen: { year: number; day: number; input: ReturnType<typeof portal.portalInput> }[] = [];
  for (let i = 0; i < SEASONS; i++) {
    const weeks = testSchedule.weeksInSeason(w);
    while (w.week < weeks) {
      loop.runWeek(w, sys);
      seen.push({ year: w.date.seasonYear, day: dayOfWorld(w.date), input: portal.portalInput(w) });
    }
    loop.runSeasonPoint(w, sys);
  }
  const ms = Date.now() - t0;
  const s = portal.portalOf(w);
  const rows = w.log.rows();
  const entered = rows.filter((e) => e.type === portal.TRANSFER_ENTERED);
  const signedTransfers = rows.filter((e) => e.type === turnover.PLAYER_SIGNED && e.payload.kind === 'transfer');
  const unplaced = rows.filter((e) => e.type === portal.TRANSFER_UNPLACED);

  it('opens a cycle each season and keeps a history row for each closed one', () => {
    expect(s.history.length).toBe(SEASONS - 1);
    expect(s.history.map((h) => h.year)).toEqual([1996, 1997, 1998]);
    expect(s.cycle?.year).toBe(w.date.seasonYear - 1);
  });

  it('players enter, and every entry is on a day the league window rule accepts', () => {
    expect(entered.length).toBeGreaterThan(0);
    const rules = portal.transferRules(pb, 'college');
    for (const h of s.history) expect(h.entered).toBe(h.byVia.window + h.byVia.postseason + h.byVia.coach_change);
    for (const e of s.cycle!.entries) {
      const c = s.cycle!;
      const verdict = college.entryAllowed(e.enteredDay, c.window, {
        teamLastGameDay: e.via === 'postseason' ? portal.finalDay(pb, c.year - 1) : null,
        headCoachHiredDay: null, priorTransfers: 0, hasEligibilityLeft: true, graduated: false,
      }, rules);
      if (e.via === 'coach_change') expect(e.enteredDay).toBeGreaterThan(c.window.open);
      else expect(verdict.ok).toBe(true);
    }
  });

  it('programs sign entrants only within roster room, nobody on two rosters, nobody back to his own team', () => {
    expect(signedTransfers.length).toBeGreaterThan(0);
    const seenIds = new Set<number>();
    for (const [teamId, ids] of w.rosters) {
      expect(ids.length).toBeLessThanOrEqual(turnover.specOf(base, w, teamId).rosterLimit);
      for (const id of ids) { expect(seenIds.has(id)).toBe(false); seenIds.add(id); }
    }
    for (const e of s.cycle!.entries) if (e.status === 'signed') expect(e.toTeamId).not.toBe(e.fromTeamId);
  });

  it('entrants nobody signs by the season leave playing and are recorded (some then start coaching, TO-15)', () => {
    const total = s.history.reduce((a, h) => a + h.unplaced, 0);
    expect(unplaced.length).toBe(total);
    const onRoster = new Set([...w.rosters.values()].flat());
    for (const e of unplaced) {
      const id = e.subjects[0]!.id;
      expect(onRoster.has(id)).toBe(false);
      expect(w.outOfFootballSince.has(id) || w.people.get(id)!.roles.includes('coach')).toBe(true);
    }
  });

  it('feeds the recruiting board portal tab: window and announced entries only, newest first', () => {
    const during = seen.filter((x) => x.input && x.input.entries.length > 0);
    expect(during.length).toBeGreaterThan(0);
    for (const x of during) {
      for (const e of x.input!.entries) expect(e.enteredDay).toBeLessThanOrEqual(x.day);
      const days = x.input!.entries.map((e) => e.enteredDay);
      expect([...days].sort((a, b) => b - a)).toEqual(days);
      expect(Object.keys(x.input!.entries[0]!).sort()).toEqual(['enteredDay', 'fromTeamId', 'personId', 'position']);
    }
  });

  it('a coaching change opens the coaching-change window for that team only', () => {
    const { w: w2, sys: sys2 } = build();
    loop.runSeason(w2, sys2, testSchedule);
    loop.runWeek(w2, sys2);
    const c = portal.portalOf(w2).cycle!;
    const teamId = collegeTeams(w2).find((t) => !c.coachDraws.includes(t))!;
    const job = [...w2.jobs.values()].find((j) => j.teamId === teamId && j.positionId === 'pos:head_coach')!;
    w2.jobs.set(job.id, { ...job, holderPersonId: (job.holderPersonId ?? 0) + 9_000_000 });
    const hired = dayOfWorld(w2.date);
    loop.runWeek(w2, sys2);
    expect(c.coachDraws).toContain(teamId);
    const win = college.coachChangeWindow(hired, portal.transferRules(pb, 'college'))!;
    for (const e of c.entries.filter((x) => x.via === 'coach_change')) {
      expect(e.fromTeamId).toBe(teamId);
      expect(e.enteredDay).toBeGreaterThanOrEqual(win.open);
      expect(e.enteredDay).toBeLessThanOrEqual(win.close);
    }
  }, 120_000);

  it('replays to the same world hash from the same seed', () => {
    const again = build();
    for (let i = 0; i < SEASONS; i++) loop.runSeason(again.w, again.sys, testSchedule);
    expect(loop.worldHash(again.w)).toBe(loop.worldHash(w));
  }, 120_000);

  it('reports volume against the T6.2.1 target (a quarter or more of players, about 36 per top-level team)', () => {
    const teams = collegeTeams(w).length;
    const limit = content.levels.college.rosterLimit;
    for (const h of s.history) {
      const perTeam = h.entered / h.programs;
      console.log(`portal ${h.year}: ${h.entered} entered (${perTeam.toFixed(1)} per team, ${(100 * perTeam / limit).toFixed(0)}% of a ${limit} roster), ${h.signed} signed, ${h.unplaced} unplaced (${(100 * h.unplaced / Math.max(1, h.entered)).toFixed(0)}%), via ${JSON.stringify(h.byVia)}`);
    }
    console.log(`portal world: ${teams} programs, ${SEASONS} seasons in ${ms} ms`);
    expect(teams).toBeGreaterThan(0);
  });
});
