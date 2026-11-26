import { describe, expect, it } from 'vitest';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';

const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);

function build(policy?: turnover.RosterPolicy) {
  const binding: turnover.TurnoverBinding = { content, rule, ...(policy ? { policy } : {}) };
  const w = loop.createWorld({ setup: setup({}), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
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
  return { w, sys, binding };
}

const drafted = (w: loop.LiveWorld): string[] => w.log.rows().filter((e) => e.type === turnover.PLAYER_DRAFTED).map((e) => `${e.payload.team}:${e.subjects[0]!.id}`);

describe('the front office AI as the roster policy (K7, TO-06)', () => {
  const g = build(turnover.gmPolicy());
  for (let i = 0; i < 3; i++) loop.runSeason(g.w, g.sys, testSchedule);
  const d = build();
  for (let i = 0; i < 3; i++) loop.runSeason(d.w, d.sys, testSchedule);

  it('drafts every pick and chooses differently from the default board', () => {
    const pro = g.w.teams.filter((t) => turnover.levelOfTeam(g.w, t.id) === 'pro').length;
    const picks = drafted(g.w);
    expect(picks.length).toBe(2 * pro * PRO_LOOKUP(turnover.RULE_KEY.draftRounds)!);
    const base = new Set(drafted(d.w));
    expect(picks.filter((x) => !base.has(x)).length).toBeGreaterThan(0);
  });

  // No league holds a position minimum (C5); a legal roster is the count limit with no player held twice.
  it('keeps every roster at its limit with no player on two rosters (legal AI rosters)', () => {
    const seen = new Set<number>();
    for (const [teamId, ids] of g.w.rosters) {
      expect(ids.length).toBe(turnover.specOf(g.binding, g.w, teamId).rosterLimit);
      for (const id of ids) { expect(seen.has(id)).toBe(false); seen.add(id); expect(g.w.status.get(id)).toBe('active'); }
    }
  });

  it('signs undrafted players and free agents through the general manager', () => {
    const kinds = new Set(g.w.log.rows().filter((e) => e.type === turnover.PLAYER_SIGNED).map((e) => e.payload.kind));
    expect(kinds.has('undrafted')).toBe(true);
    expect(kinds.has('free_agent')).toBe(true);
  });

  // C-level acceptance: class quality follows program reputation (T4, K7.5.1).
  it('gives higher-prestige programs better recruiting classes than the default order does', () => {
    const corr = (w: loop.LiveWorld): number => {
      const sum = new Map<number, { s: number; n: number }>();
      for (const e of w.log.rows()) {
        if (e.type !== turnover.PLAYER_SIGNED || e.payload.kind !== 'recruit') continue;
        const attrs = Object.values(w.people.get(e.subjects[0]!.id)!.playing!.attributes);
        const v = attrs.reduce((a, x) => a + x, 0) / attrs.length;
        const r = sum.get(e.payload.team as number) ?? { s: 0, n: 0 };
        r.s += v; r.n++; sum.set(e.payload.team as number, r);
      }
      const rows = [...sum].map(([t, r]) => [w.teams.find((x) => x.id === t)!.prestige, r.s / r.n] as const);
      const mx = rows.reduce((a, r) => a + r[0], 0) / rows.length, my = rows.reduce((a, r) => a + r[1], 0) / rows.length;
      let sxy = 0, sxx = 0, syy = 0;
      for (const [x, y] of rows) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
      return sxy / Math.sqrt(sxx * syy);
    };
    const cg = corr(g.w), cd = corr(d.w);
    console.log('prestige vs class quality: gm', cg.toFixed(3), 'default', cd.toFixed(3));
    expect(cg).toBeGreaterThan(0.3);
    expect(cg).toBeGreaterThan(cd);
  });

  it('is deterministic with the policy bound', () => {
    const again = build(turnover.gmPolicy());
    for (let i = 0; i < 3; i++) loop.runSeason(again.w, again.sys, testSchedule);
    expect(loop.worldHash(again.w)).toBe(loop.worldHash(g.w));
  });
});

describe('the D8.2.1 curve read as a K7 age curve', () => {
  const c = turnover.ageCurve();
  it('ends prime at the last flat band and declines faster for running backs than quarterbacks', () => {
    expect(c.primeEndAge('RB')).toBe(25);
    expect(c.primeEndAge('K')).toBeGreaterThan(c.primeEndAge('QB'));
    expect(c.declineIssPerYear('RB')).toBeGreaterThan(c.declineIssPerYear('QB'));
    expect(c.declineIssPerYear('QB')).toBeGreaterThan(0);
  });
});
