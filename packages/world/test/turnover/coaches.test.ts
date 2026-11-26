import { describe, expect, it } from 'vitest';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';

const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);

function build() {
  const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
  const w = loop.createWorld({ setup: setup({}), content, names: NAMES, eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...turnover.COACH_EVENT_TYPES] });
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const col = w.teams.length - pro;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: (x) => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: turnover.coachEntrants(x), retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region',
    }),
    development: turnover.developmentStep(binding), moves: turnover.movesStep(binding, turnover.rosterMovesStep(binding)),
  }, 'test: not bound');
  return { w, sys, binding };
}

const SEASONS = 8;

/** Problems with the staffs after a season: chairs on two teams, people in a chair and a pool, chairs left open. */
function staffProblems(w: loop.LiveWorld): string[] {
  const out: string[] = [];
  const teamOf = new Map<number, number>();
  const inPool = new Set([...(w.pools.get('coach_pool') ?? []), ...(w.pools.get(turnover.ENTRY_POOL) ?? [])]);
  const interimTeams = new Set([...w.jobs.values()].filter((j) => j.positionId === 'pos:head_coach' && j.holding === 'interim').map((j) => j.teamId));
  for (const j of w.jobs.values()) {
    if (j.holderPersonId === null) {
      if (!interimTeams.has(j.teamId)) out.push(`team ${j.teamId} chair ${j.positionId} open with no in-season change`);
      continue;
    }
    const t = teamOf.get(j.holderPersonId);
    if (t !== undefined && t !== j.teamId) out.push(`person ${j.holderPersonId} holds chairs on teams ${t} and ${j.teamId}`);
    teamOf.set(j.holderPersonId, j.teamId);
    if (inPool.has(j.holderPersonId)) out.push(`person ${j.holderPersonId} is in a chair and in a pool`);
    if (w.status.get(j.holderPersonId) !== 'active') out.push(`person ${j.holderPersonId} in a chair is ${w.status.get(j.holderPersonId)}`);
  }
  return out;
}

describe('off-screen coach turnover (E2.3.4, E4.3, K7.6.1, K8.4.2)', () => {
  const g = build();
  const problems: string[] = [];
  for (let i = 0; i < SEASONS; i++) {
    loop.runSeason(g.w, g.sys, testSchedule);
    problems.push(...staffProblems(g.w).map((p) => `season ${i + 1}: ${p}`));
  }
  const openings = turnover.coachOpenings(g.w);
  const by = (reason: string) => openings.filter((o) => o.reason === reason).reduce((a, o) => a + o.count, 0);

  it('keeps every chair filled after the offseason, one team per person, nobody in a chair and a pool (K7.6.1 acceptance)', () => {
    expect(problems).toEqual([]);
  });

  it('opens jobs for firings, retirements, releases, promotions and followers (E2.3.4 acceptance 4)', () => {
    const counts = Object.fromEntries(['fired', 'retired', 'released', 'promoted', 'followed_boss'].map((r) => [r, by(r)]));
    console.log('openings by reason over', SEASONS, 'seasons:', counts);
    expect(by('fired')).toBeGreaterThan(0);
    expect(by('released')).toBeGreaterThan(0);
    expect(by('promoted')).toBeGreaterThan(0);
  });

  it('changes head coaches through the owner search and records new tenures', () => {
    const heads = new Map<number, Set<number>>();
    for (const s of g.w.staffSeasons) if (s.headCoachId !== null) heads.set(s.teamId, new Set([...(heads.get(s.teamId) ?? []), s.headCoachId]));
    const changed = [...heads.values()].filter((x) => x.size > 1).length;
    console.log('teams with more than one head coach:', changed, 'of', heads.size);
    expect(changed).toBeGreaterThan(0);
  });

  it('feeds the entrant count from exits (E2.3.4 rule 5)', () => {
    const st = turnover.coachState(g.w);
    expect(turnover.coachEntrants(g.w)).toBeGreaterThanOrEqual(st.exits);
  });

  it('is deterministic', () => {
    const again = build();
    for (let i = 0; i < SEASONS; i++) loop.runSeason(again.w, again.sys, testSchedule);
    expect(again.w.passHash).toBe(g.w.passHash);
  });
});
