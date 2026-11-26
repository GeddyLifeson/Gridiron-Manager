import { describe, expect, it } from 'vitest';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';

const content = trimmed();
const binding: turnover.TurnoverBinding = { content, rule: (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k) };

function build(seedHex?: string) {
  const w = loop.createWorld({ setup: setup(seedHex ? { seedHex } : {}), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const col = w.teams.length - pro;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: () => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
    }),
    development: turnover.developmentStep(binding), moves: turnover.rosterMovesStep(binding),
  }, 'test: not bound');
  return { w, sys };
}

const meanAge = (w: loop.LiveWorld, level: string, year: number): number => {
  const ages: number[] = [];
  for (const [teamId, ids] of w.rosters) if (turnover.levelOfTeam(w, teamId) === level) for (const id of ids) ages.push(year - w.people.get(id)!.birthDate.seasonYear);
  return ages.reduce((a, x) => a + x, 0) / ages.length;
};
const count = (w: loop.LiveWorld, type: string): number => w.log.rows().filter((e) => e.type === type).length;

describe('roster turnover in the off-screen loop (D7, D8, C7, C8, M6, T4, T5, X12.1.2)', () => {
  const { w, sys } = build();
  const firstYear = w.date.seasonYear;
  const age0 = { pro: meanAge(w, 'pro', firstYear), college: meanAge(w, 'college', firstYear) };
  const attrs0 = new Map([...w.people].filter(([, p]) => p.playing).map(([id, p]) => [id, JSON.stringify(p.playing!.attributes)]));
  for (let i = 0; i < 4; i++) loop.runSeason(w, sys, testSchedule);
  const year = w.date.seasonYear;

  it('leaves no turnover step unbound', () => {
    const steps = loop.unboundSteps(sys).map((u) => u.step);
    expect(steps).not.toContain('development');
    expect(steps).not.toContain('moves');
  });

  it('keeps mean roster age from rising one year per season (the PR 168 drift failure)', () => {
    expect(meanAge(w, 'pro', year) - age0.pro).toBeLessThan(2);
    expect(meanAge(w, 'college', year) - age0.college).toBeLessThan(2);
  });

  it('develops and ages players every season point', () => {
    let changed = 0;
    for (const [id, before] of attrs0) if (JSON.stringify(w.people.get(id)?.playing?.attributes) !== before) changed++;
    expect(changed / attrs0.size).toBeGreaterThan(0.9);
  });

  // Four seasons hold three offseasons: the first runs on the first pass of the second season.
  it('runs a full draft each offseason in the C7.2.1 order, and signs undrafted players and free agents', () => {
    const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
    const rounds = PRO_LOOKUP(turnover.RULE_KEY.draftRounds)!;
    expect(count(w, turnover.PLAYER_DRAFTED)).toBe(3 * pro * rounds);
    const signed = w.log.rows().filter((e) => e.type === turnover.PLAYER_SIGNED).map((e) => e.payload.kind);
    for (const kind of ['undrafted', 'free_agent', 'recruit']) expect(signed).toContain(kind);
    expect(count(w, turnover.PLAYER_RETIRED)).toBeGreaterThan(0);
    expect(count(w, turnover.ELIGIBILITY_ENDED)).toBeGreaterThan(0);
    expect(count(w, turnover.LEFT_UNSIGNED)).toBeGreaterThan(0);
  });

  it('holds every roster at its limit, with no player on two rosters or rostered after leaving', () => {
    const seen = new Set<number>();
    for (const [teamId, ids] of w.rosters) {
      expect(ids.length).toBe(turnover.specOf(binding, w, teamId).rosterLimit);
      for (const id of ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        expect(w.status.get(id)).toBe('active');
      }
    }
  });

  it('advances eligibility and service counters, and no college player passes the T5 limits', () => {
    const seasons = COLLEGE_LOOKUP(turnover.RULE_KEY.seasonsOfCompetition)!;
    for (const [teamId, ids] of w.rosters) {
      for (const id of ids) {
        const e = w.people.get(id)!.playing!.eligibility;
        if (turnover.levelOfTeam(w, teamId) === 'college') expect(e.college.seasonsOfCompetitionUsed).toBeLessThanOrEqual(seasons);
      }
    }
    const veteran = [...w.rosters].filter(([t]) => turnover.levelOfTeam(w, t) === 'pro').flatMap(([, ids]) => ids).map((id) => w.people.get(id)!.playing!.eligibility.pro.seasonsOnRoster);
    expect(Math.max(...veteran)).toBeGreaterThanOrEqual(4);
  });

  it('records each team\'s regular-season line in the season summary', () => {
    const s = w.seasons.at(-1)!;
    const lines = Object.values(s.records);
    const regular = lines.reduce((a, r) => a + r.wins + r.losses + r.ties, 0);
    expect(regular).toBeGreaterThan(0);
    expect(lines.reduce((a, r) => a + r.wins, 0)).toBe(lines.reduce((a, r) => a + r.losses, 0));
  });

  it('is deterministic: the same seed gives the same world', () => {
    const again = build();
    for (let i = 0; i < 4; i++) loop.runSeason(again.w, again.sys, testSchedule);
    expect(loop.worldHash(again.w)).toBe(loop.worldHash(w));
  });
});

describe('counters (D1.1.2, T5)', () => {
  const base: { seasonsOfCompetitionUsed: number; clockStartYear: number | null; redshirtUsed: boolean } = { seasonsOfCompetitionUsed: 0, clockStartYear: null, redshirtUsed: false };
  const block = (college: typeof base) => ({ eligibility: { college, pro: { seasonsOnRoster: 0, accruedSeasons: 0, creditedSeasons: 0 } } }) as never;
  it('a founding college player\'s clock starts at the first college age', () => {
    const p = turnover.advanceCounters(block(base), 2000, true, 1979) as { eligibility: { college: typeof base } };
    expect(p.eligibility.college.clockStartYear).toBe(1997);
    expect(p.eligibility.college.seasonsOfCompetitionUsed).toBe(4);
  });
  it('a first-season non-starter redshirts once', () => {
    const p = turnover.advanceCounters(block({ ...base, clockStartYear: 2000 }), 2000, true, 1982, false) as { eligibility: { college: { seasonsOfCompetitionUsed: number; redshirtUsed: boolean } } };
    expect(p.eligibility.college).toMatchObject({ seasonsOfCompetitionUsed: 0, redshirtUsed: true });
  });
});
