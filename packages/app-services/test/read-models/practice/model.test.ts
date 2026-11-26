// The practice desk view (H3.1.1, H3.5.2) built from a real PracticeDesk on the league-rules files: the week's
// plans with their checks, the staff week when the user plans nothing, the padded counter, the reports of one
// season newest first, and the `practice.planner` source over the same desk.
import { describe, expect, it } from 'vitest';
import { practice as pr } from '@gm/league';
import { buildPracticeDeskView, plannerSource, weekPlans } from '../../../src/read-models/practice/index.ts';
import { brokenPlan, COLLEGE_RULES, contextOf, desk, NOW, PRO_RULES, userPlan } from './fixture.ts';

describe('the week plans', () => {
  it('shows the staff week when the user has planned nothing (CY-08)', () => {
    const v = buildPracticeDeskView(3, contextOf(desk()));
    expect(v.plannedBy).toBe('staff');
    expect(v.plans).toHaveLength(1);
    expect(v.plans[0]!.by).toBe('staff');
    expect(v.plans[0]!.practiceId).toBe(`staff-${NOW.seasonYear}-${NOW.week}`);
    expect(v.plans[0]!.day).toBe(NOW.day);
    expect(v.plans[0]!.pads).toBe('shells');
  });
  it('shows the user plans with minutes, reps and their checks', () => {
    const d = desk([userPlan('mine'), userPlan('two', NOW.day + 1)]);
    const v = buildPracticeDeskView(3, contextOf(d));
    expect(v.plannedBy).toBe('user');
    expect(v.plans.map((p) => p.practiceId)).toEqual(['mine', 'two']);
    const p = v.plans[0]!;
    const direct = pr.practiceView({ practice: userPlan().practice, rules: contextOf(d).rules, coverage: pr.coverage([], []), findings: [], participation: [], paddedUsed: 1 });
    expect(p.minutes).toEqual({ planned: direct.minutes.planned, block: 150, remaining: direct.minutes.remaining });
    expect(p.expectedReps).toBe(direct.expectedReps);
    expect(p.expectedReps).toBeGreaterThan(0);
    expect(p.periods).toBe(7);
    expect(p.pads).toBe('full');
    expect(p.problems).toEqual([]);
    expect(p.ok).toBe(d.check(userPlan()).ok);
  });
  it('carries a broken plan kept in an old save with its problems', () => {
    const v = buildPracticeDeskView(3, contextOf(desk([brokenPlan()])));
    expect(v.plans[0]!.ok).toBe(false);
    expect(v.plans[0]!.problems.some((x) => x.code === 'over_block')).toBe(true);
    expect(v.plans[0]!.minutes.remaining).toBeLessThan(0);
  });
  it('counts padded practices used and left under the pro rules, and has no padded budget at college', () => {
    const pro = buildPracticeDeskView(3, contextOf(desk()));
    expect(pro.padded.used).toBe(1);
    expect(pro.padded.left).toBe(PRO_RULES(pr.KEYS.seasonPadded)! - 1);
    expect(pr.hasPaddedBudget(COLLEGE_RULES)).toBe(false);
    const college = buildPracticeDeskView(3, contextOf(desk([], 'college'), 'college'));
    expect(college.padded).toEqual({ used: 1, left: null });
  });
});

describe('the practice reports (H3.5.2)', () => {
  it('lists the current season newest first, with names the club knows', () => {
    const v = buildPracticeDeskView(3, contextOf(desk()));
    expect(v.reportSeason).toBe(2027);
    expect(v.reports.map((r) => r.practiceId)).toEqual(['mine-b', 'mine-a', 'staff-2027-1']);
    expect(v.seasons).toEqual([2027, 2026]);
    const r = v.reports[0]!;
    expect(r.errors).toEqual([{ period: 3, rep: 2, person: { personId: '101', name: 'A. Able' } }]);
    expect(r.standouts).toEqual([{ personId: '102', name: 'B. Baker' }]);
    expect(r.poor).toEqual([{ personId: '103', name: 'C. Cole' }]);
    expect(r.injuries[0]!.person).toEqual({ personId: '106', name: null });
    expect(r.participation.map((x) => [x.person.personId, x.label])).toEqual([['101', 'full'], ['106', 'limited']]);
    expect(r.competition.map((c) => [c.person.personId, c.wins, c.reps])).toEqual([['104', 3, 5], ['105', 2, 5]]);
  });
  it('sorts reps most first and joins full-speed reps', () => {
    const r = buildPracticeDeskView(3, contextOf(desk())).reports[0]!;
    expect(r.reps.map((x) => [x.person.personId, x.reps, x.fullSpeed])).toEqual([['102', 34, 10], ['101', 20, 0], ['103', 12, 0], ['104', 0, 5]]);
  });
  it('shows an earlier season on request, and none for a season without reports', () => {
    expect(buildPracticeDeskView(3, contextOf(desk()), 2026).reports.map((r) => r.week)).toEqual([17]);
    expect(buildPracticeDeskView(3, contextOf(desk()), 2020).reports).toEqual([]);
  });
});

describe('the practice.planner source', () => {
  it('answers the planner input of a planned practice, the staff week, and null otherwise', () => {
    const d = desk([userPlan('mine')]);
    const src = plannerSource((teamId) => (teamId === 3 ? contextOf(d) : null));
    const inp = src(3, 'mine')!;
    expect(inp.practice.id).toBe('mine');
    expect(inp.paddedUsed).toBe(1);
    expect(pr.practiceView(inp).practiceId).toBe('mine');
    expect(src(3, 'nope')).toBeNull();
    expect(src(5, 'mine')).toBeNull();
    const staff = plannerSource(() => contextOf(desk()));
    expect(staff(3, weekPlans(contextOf(desk())).plans[0]!.practice.id)).not.toBeNull();
  });
});
