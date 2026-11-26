// The coach's own file in the save (career.coach, CR-CS-2): made on first read from the career modules, kept,
// the same for the same save, and redrafted only when his seat changes. Rulings CS-1 to CS-8 (coach-state.ts).
import { describe, expect, it } from 'vitest';
import { wealth } from '@gm/career';
import { money as wmoney } from '@gm/world';
import { runningSave } from './live-world.ts';
import { careerHost, coachStateOf, COACH_KEY, ensureCoachState, type CoachState } from '../../../src/read-models/career/index.ts';

const fixture = runningSave(2);
const seatOf = (w: typeof fixture.w, id: number) => [...w.jobs.values()].filter((j) => j.holderPersonId === id).sort((a, b) => b.rung - a.rung)[0] ?? null;

describe('the coach file (career.coach)', () => {
  it('is made once, kept in system state, and read back unchanged', () => {
    const { w, user } = fixture;
    const a = ensureCoachState(w, user)!;
    expect(w.systemState.get(COACH_KEY)).toBe(a);
    expect(ensureCoachState(w, user)).toBe(a);
    expect(coachStateOf(w, user)).toBe(a);
    expect(coachStateOf(w, user + 1_000_000)).toBeNull();
  });
  it('is the same for the same save (keyed streams, no platform random)', () => {
    const b = runningSave(2);
    expect(JSON.stringify(ensureCoachState(b.w, b.user))).toBe(JSON.stringify(ensureCoachState(fixture.w, fixture.user)));
  });
  it('rulings: no debt or costs, single, flagged mid-range boss hours, risk 3 and no savings until he sets them', () => {
    const s = ensureCoachState(fixture.w, fixture.user)!;
    expect(s.money.opening.liabilities).toEqual([]);
    expect(s.life?.household.members).toEqual([]);
    expect(s.life?.health.state).toBe('well');
    expect(s.boss).toMatchObject({ hoursCulture: 0.5, basis: 'assumption' });
    expect(s.money.riskLevel).toBe(3);
    expect(s.money.savingsRate).toBe(0);
    expect(s.market.applications).toEqual([]);
  });
  it('the contract is drafted for his seat at the seat\'s pay, ending no later than the world's contract end', () => {
    const { w, user } = fixture;
    const s = ensureCoachState(w, user)!;
    const job = seatOf(w, user)!;
    expect(s.jobId).toBe(job.id);
    const pay = wmoney.seatPay(w, job);
    if (s.contract === null) { expect(pay === null || pay <= 0 || wmoney.defaultPayTier(w, job.teamId) === 'college_second').toBe(true); return; }
    const first = s.contract.salary[0]!;
    expect(first.baseCents + first.supplementalCents).toBe(pay);
    const end = w.staffContractEndYear.get(user);
    // The world's staff contract end wins inside the E3.4.2 term range; a longer world term is clamped to the range.
    if (end !== undefined && end >= s.contract.startYear) expect(s.contract.endYear).toBeLessThanOrEqual(end);
    const v = careerHost(w).contract();
    expect(v.terms.length).toBeGreaterThan(0);
  });
  it('a new seat redrafts the contract and keeps his money and life', () => {
    const { w, user } = fixture;
    const s = ensureCoachState(w, user)!;
    w.systemState.set(COACH_KEY, { ...s, jobId: -1, contract: null } satisfies CoachState);
    const r = ensureCoachState(w, user)!;
    expect(r.jobId).toBe(s.jobId);
    expect(r.contract).toEqual(s.contract);
    expect(r.money).toBe(s.money);
    expect(r.life).toBe(s.life);
  });
  it('the money screen shows the opening sheet and this year\'s pay; the life screen his planned week; the board the open seats', () => {
    const { w, user } = fixture;
    const h = careerHost(w, { week: () => 'game' });
    const f = h.finance();
    const s = ensureCoachState(w, user)!;
    expect(f.netWorth).toEqual([{ date: expect.any(String), cents: wealth.netWorth(s.money.opening) }]);
    expect(f.plan.savingRatePct).toBe(0);
    const paid = wmoney.personIncomeOf(w).income.filter((r) => r.personId === user && r.seasonYear === w.date.seasonYear).reduce((a, r) => a + r.cents, 0);
    expect(f.income.reduce((a, r) => a + r.cents, 0)).toBe(paid);
    const life = h.life();
    expect(life.template.length).toBe(1);
    expect(life.family).toEqual([]);
    const m = h.jobMarket();
    const vacant = [...w.jobs.values()].filter((j) => j.holderPersonId === null);
    for (const o of m.openings) expect(vacant.some((j) => j.id === o.id)).toBe(true);
    expect(m.yearOut).toBeNull();
  });
});
