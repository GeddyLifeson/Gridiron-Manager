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

  it('hires people whose views fit the boss who interviewed them (Marlon 2026-11-26 14:26)', () => {
    const start = g.w.date.seasonYear - SEASONS;
    const gap = (a: number, b: number): number => {
      const x = turnover.coachViews(g.w, a)!; const y = turnover.coachViews(g.w, b)!;
      const ks = Object.keys(x);
      return ks.reduce((s, k) => s + Math.abs(x[k]! - y[k]!), 0) / ks.length;
    };
    const jobs = [...g.w.jobs.values()];
    const bosses = jobs.filter((j) => j.holderPersonId !== null && j.rung >= 5).map((j) => j.holderPersonId!);
    let own = 0; let other = 0; let n = 0;
    for (const j of jobs) {
      if (j.holderPersonId === null || j.reportsToJobId === null || (j.holderSince?.seasonYear ?? start) <= start) continue;
      const boss = g.w.jobs.get(j.reportsToJobId)?.holderPersonId ?? null;
      if (boss === null || boss === j.holderPersonId) continue;
      const stranger = bosses[(j.id * 7919) % bosses.length]!;
      if (stranger === boss || stranger === j.holderPersonId) continue;
      own += gap(j.holderPersonId, boss); other += gap(j.holderPersonId, stranger); n++;
    }
    console.log('hires', n, 'mean view gap to own boss', (own / n).toFixed(3), 'to another boss', (other / n).toFixed(3));
    expect(n).toBeGreaterThan(20);
    expect(own / n).toBeLessThan(other / n);
  });

  it('is deterministic', () => {
    const again = build();
    for (let i = 0; i < SEASONS; i++) loop.runSeason(again.w, again.sys, testSchedule);
    expect(again.w.passHash).toBe(g.w.passHash);
  });
});

// E2.3.4 acceptance on the trimmed world (GM_COACH_ACCEPTANCE=30 or 50). The rates are printed for the PR;
// acceptance 1 (an opening every year at every rung 2 to 9) needs the full world, so only invariants are asserted.
const LONG = Number(process.env.GM_COACH_ACCEPTANCE ?? 0);
describe.skipIf(!LONG)(`coach turnover over ${LONG} seasons (E2.3.4 acceptance)`, () => {
  it('keeps staffs legal and reports the opening rates', () => {
    const g = build();
    const problems: string[] = [];
    const t0 = Date.now();
    for (let i = 0; i < LONG; i++) {
      loop.runSeason(g.w, g.sys, testSchedule);
      problems.push(...staffProblems(g.w).map((p) => `season ${i + 1}: ${p}`));
    }
    const rows = turnover.coachOpenings(g.w);
    const seasons = new Set(rows.map((r) => r.season)).size;
    const teams = (lvl: string) => g.w.teams.filter((t) => turnover.levelOfTeam(g.w, t.id) === lvl).length;
    const report: Record<string, unknown> = { seconds: Math.round((Date.now() - t0) / 1000), seasonsWithOpenings: seasons };
    for (const lvl of ['pro', 'college']) {
      const head = rows.filter((r) => r.level === lvl && r.reason === 'fired' && (r.rung === 9 || r.rung === 8)).reduce((a, r) => a + r.count, 0);
      const heads = rows.filter((r) => r.level === lvl && (r.rung === 9 || r.rung === 8)).reduce((a, r) => a + r.count, 0);
      report[`${lvl}_head_firings_per_team_season`] = +(head / teams(lvl) / LONG).toFixed(3);
      report[`${lvl}_head_openings_per_team_season`] = +(heads / teams(lvl) / LONG).toFixed(3);
      const years: Record<number, number> = {};
      for (let rung = 2; rung <= 9; rung++) years[rung] = new Set(rows.filter((r) => r.level === lvl && r.rung === rung).map((r) => r.season)).size;
      report[`${lvl}_years_with_an_opening_by_rung`] = years;
    }
    const reasons: Record<string, number> = {};
    for (const r of rows) reasons[r.reason] = (reasons[r.reason] ?? 0) + r.count;
    report.reasons = reasons;
    const ages = [...g.w.jobs.values()].filter((j) => j.holderPersonId !== null).map((j) => g.w.date.seasonYear - g.w.people.get(j.holderPersonId!)!.birthDate.seasonYear);
    report.mean_coach_age = +(ages.reduce((a, x) => a + x, 0) / ages.length).toFixed(1);
    process.stderr.write(`\ncoach acceptance: ${JSON.stringify(report)}\n`);
    expect(problems).toEqual([]);
  }, 3_600_000);
});
