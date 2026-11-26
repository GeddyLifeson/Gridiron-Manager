// The systemState save slot (CR-G28-1) on a real world: every system's carried state, after a season
// with compliance and recruiting running, survives save rows and JSON text with the same world hash.
import { describe, expect, it } from 'vitest';
import { calendar } from '@gm/league';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as compliance from '../../src/compliance/index.ts';
import * as rec from '../../src/recruiting/index.ts';

const content = trimmed();
const base: turnover.TurnoverBinding = { content, rule: (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k), policy: turnover.gmPolicy() };

function build() {
  const rb: rec.RecruitingBinding = { turnover: base, calendarFiles: calendar.CALENDAR_FILES, policy: () => rec.gmRecruitingPolicy() };
  const binding: turnover.TurnoverBinding = { ...base, policy: rec.lettersPolicy(undefined) };
  const w = loop.createWorld({ setup: setup({}), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
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
    compliance: compliance.complianceStep(compliance.complianceBindingFrom(base, 'pro')),
  }, 'test: not bound');
  return { w, sys };
}

describe('systemState save slot on a live world (CR-G28-1)', () => {
  const { w } = (() => { const b = build(); loop.runSeason(b.w, b.sys, testSchedule); return b; })();

  it('carries the systems that ran', () => {
    const keys = [...w.systemState.keys()];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toContain(rec.RECRUITING_KEY);
  });

  it('restores every system state from JSON text with the same world hash', () => {
    const before = loop.worldHash(w);
    const saved = new Map(w.systemState);
    const text = JSON.stringify(loop.saveSystemState(w));
    w.systemState.clear();
    expect(loop.worldHash(w)).not.toBe(before);
    loop.loadSystemState(w, JSON.parse(text));
    expect(loop.worldHash(w)).toBe(before);
    expect(w.systemState).toEqual(saved);
  });

  it('writes the same text twice', () => {
    const once = JSON.stringify(loop.saveSystemState(w));
    loop.loadSystemState(w, JSON.parse(once));
    expect(JSON.stringify(loop.saveSystemState(w))).toBe(once);
  });
});
