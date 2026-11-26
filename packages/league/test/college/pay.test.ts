import { describe, expect, it } from 'vitest';
import {
  PAY_POSITIONS, PERMITTED_NIL_ACTS, arbitrationPlayerWins, collegeAct, collegeRules, footballBudget, fundedFraction, marketValue, mustReport,
  paymentShares, rejectionChance, reviewDeal, startingSplit, validateAgreement, validateSheet, COLLEGE_ACTS,
  type Agreement, type SheetLine,
} from '../../src/college/index.ts';
import { commitAct } from '../../src/compliance/index.ts';
import { COLLEGE_VALUES, MemorySink, emptyCompliance, party, ruleSet as complianceRules } from '../compliance/fixtures.ts';
import { RULES, ruleSet, stream } from './helpers.ts';

describe('budget division (T7.1.1)', () => {
  it('a top-tier school in 2026-27: 21.3 million cap, no scholarship credit, football 65 percent', () => {
    const b = footballBudget(RULES, 'top', 0);
    expect(b.cap).toBe(21300000);
    expect(b.paymentRoom).toBe(21300000);
    expect(b.schoolPool).toBe(21300000);
    expect(b.football).toBe(Math.round(21300000 * 0.65));
  });
  it('in 2025-26 up to 2.5 million of scholarship cost counted against the cap', () => {
    const b = footballBudget(collegeRules(ruleSet({}, 2025)), 'top', 0);
    expect(b.cap).toBe(20500000);
    expect(b.paymentRoom).toBe(18000000);
  });
  it('an AI athletic director at a top-tier school gives football 60 to 70 percent; the reserve comes off the top and is capped', () => {
    const s = startingSplit();
    expect(s.football).toBeGreaterThanOrEqual(0.6); expect(s.football).toBeLessThanOrEqual(0.7);
    expect(s.football + s.mensBasketball + s.womensBasketball + s.other + s.reserve).toBeCloseTo(1, 12);
    expect(startingSplit(0.5).reserve).toBe(0.1);
    const withReserve = footballBudget(RULES, 'top', 0, startingSplit(0.1));
    expect(withReserve.reserve).toBe(2130000);
  });
  it('football budgets across a generated top subdivision span at least a tenfold range', () => {
    const top = footballBudget(RULES, 'top', 1).football;
    const low = footballBudget(RULES, 'lower', 0).football;
    expect(top / low).toBeGreaterThanOrEqual(10);
    expect(fundedFraction('middle', 0.5)).toBeCloseTo(0.55, 12);
    expect(footballBudget(RULES, 'not_opted_in', 0).football).toBe(0);
  });
});

describe('the roster sheet (T7.3.1)', () => {
  const b = footballBudget(RULES, 'top', 0, startingSplit(0.1));
  const lines = (amount: number, n = 10): SheetLine[] => Array.from({ length: n }, (_, i) => ({ personId: i + 1, position: PAY_POSITIONS[i % PAY_POSITIONS.length]!, amount }));
  it('school payments never exceed the football budget: the excess is refused', () => {
    const r = validateSheet(lines(b.football / 10 + 1), b, RULES);
    expect(r).toMatchObject({ ok: false, reason: 'over_budget' });
  });
  it('January reserve released to football makes room', () => {
    expect(validateSheet(lines(b.football / 10 + 1000), b, RULES, 100000).ok).toBe(true);
  });
  it('totals by position and the quarterback share', () => {
    const r = validateSheet([{ personId: 1, position: 'QB', amount: 2000000 }, { personId: 2, position: 'OT', amount: 1000000 }], b, RULES);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.byPosition.QB).toBe(2000000); expect(r.quarterbackShare).toBeCloseTo(2000000 / b.football, 12); expect(r.left).toBe(b.football - 3000000); }
    expect(validateSheet([{ personId: 1, position: 'QB', amount: -1 }], b, RULES).ok).toBe(false);
  });
  it('no more paid players than the aid limit', () => {
    const tight = collegeRules(ruleSet({ 'league.aid_limit': 5 }));
    expect(validateSheet(lines(1000, 6), b, tight)).toMatchObject({ ok: false, reason: 'over_aid_limit' });
  });
});

describe('market value (T7.3.1 depth pass acceptance)', () => {
  const at = (position: (typeof PAY_POSITIONS)[number], grade = 40, seasonsLeft = 2, programsInterested = 1, budgetScale = 1) => marketValue({ position, grade, seasonsLeft, programsInterested, budgetScale });
  it("a top-tier program's starting quarterback is valued between 1 and 5 million; its long snapper below 50,000", () => {
    expect(at('QB')).toBeGreaterThanOrEqual(1000000); expect(at('QB')).toBeLessThanOrEqual(5000000);
    expect(at('QB', 50, 2, 3)).toBeLessThanOrEqual(5000000 * 2);
    expect(at('LS')).toBeLessThan(50000);
  });
  it('ten grade points over a typical starter doubles value; one season left is 85 percent; demand adds 15 percent per program up to double', () => {
    expect(at('WR', 50) / at('WR', 40)).toBeCloseTo(2, 6);
    expect(at('WR', 40, 1) / at('WR', 40, 2)).toBeCloseTo(0.85, 3);
    expect(at('WR', 40, 2, 3) / at('WR')).toBeCloseTo(1.3, 3);
    expect(at('WR', 40, 2, 20) / at('WR')).toBeCloseTo(2, 3);
  });
  it('scales with the program budget', () => {
    expect(at('QB', 40, 2, 1, 0.2)).toBe(Math.round(at('QB') * 0.2));
  });
});

describe('outside deals and the clearinghouse (T7.2.1)', () => {
  it('deals of 600 dollars or more must be reported', () => {
    expect(mustReport({ amount: 600, associated: false, marketValue: 1000 }, RULES)).toBe(true);
    expect(mustReport({ amount: 599, associated: false, marketValue: 1000 }, RULES)).toBe(false);
  });
  it('the starting review model: 2 percent for unassociated deals, rising with amount over market for associated deals', () => {
    expect(rejectionChance({ amount: 5000, associated: false, marketValue: 1000 })).toBe(0.02);
    expect(rejectionChance({ amount: 1000, associated: true, marketValue: 1000 })).toBeCloseTo(0.03, 12);
    expect(rejectionChance({ amount: 2000, associated: true, marketValue: 1000 })).toBeCloseTo(0.38, 12);
    expect(rejectionChance({ amount: 10000, associated: true, marketValue: 1000 })).toBe(0.9);
  });
  it('an associated deal at twice market value is not cleared at least 30 percent of the time in seeded trials', () => {
    const rng = stream(77); let no = 0;
    for (let i = 0; i < 5000; i++) if (!reviewDeal({ amount: 2000, associated: true, marketValue: 1000 }, rng).cleared) no++;
    expect(no / 5000).toBeGreaterThanOrEqual(0.3);
  });
  it('review delay: half within a day, 80 percent within 14 days, all within 30', () => {
    const rng = stream(5); const days: number[] = [];
    for (let i = 0; i < 5000; i++) days.push(reviewDeal({ amount: 100, associated: false, marketValue: 1000 }, rng).days);
    const share = (d: number) => days.filter((x) => x <= d).length / days.length;
    expect(share(1)).toBeGreaterThan(0.47); expect(share(1)).toBeLessThan(0.53);
    expect(share(14)).toBeGreaterThan(0.77); expect(share(14)).toBeLessThan(0.83);
    expect(Math.max(...days)).toBeLessThanOrEqual(30);
  });
  it('at real-world size with a realistic deal mix, 3 to 7 percent by count and 12 to 25 percent by value are not cleared', () => {
    const rng = stream(2025); let n = 0, no = 0, value = 0, noValue = 0;
    for (let i = 0; i < 20000; i++) {
      const associated = rng.uniform() < 0.51;
      const big = rng.uniform() < 0.08;
      const market = big ? 150000 : 8000;
      const ratio = associated ? (rng.uniform() < 0.12 ? 1.5 + rng.uniform() * 2 : 0.6 + rng.uniform() * 0.4) : 0.5 + rng.uniform() * 0.5;
      const deal = { amount: Math.round(market * ratio), associated, marketValue: market };
      n++; value += deal.amount;
      if (!reviewDeal(deal, rng).cleared) { no++; noValue += deal.amount; }
    }
    expect(no / n).toBeGreaterThanOrEqual(0.03); expect(no / n).toBeLessThanOrEqual(0.07);
    expect(noValue / value).toBeGreaterThanOrEqual(0.12); expect(noValue / value).toBeLessThanOrEqual(0.25);
  });
  it('arbitration: the commission usually wins', () => {
    const rng = stream(9); let wins = 0;
    for (let i = 0; i < 2000; i++) if (arbitrationPlayerWins(rng)) wins++;
    expect(wins / 2000).toBeLessThan(0.25);
  });
});

describe('agreements (T7.3.2 acceptance)', () => {
  const a: Agreement = { personId: 1, amountPerYear: 500000, years: 2, schedule: 'monthly_hold_december', buyout: 250000, clauses: ['conduct_fines'], agentFeePct: 8 };
  it('every agreement has length, schedule and exit terms; length 1 to 3', () => {
    expect(validateAgreement(a, RULES)).toEqual({ ok: true });
    expect(validateAgreement({ ...a, years: 4 }, RULES)).toEqual({ ok: false, reason: 'length' });
    expect(validateAgreement({ ...a, years: 0 }, RULES).ok).toBe(false);
    expect(validateAgreement(a, collegeRules(ruleSet({ 'pay.multi_year': false })))).toEqual({ ok: false, reason: 'length' });
  });
  it('the agent fee cap applies only when switched on', () => {
    expect(validateAgreement(a, collegeRules(ruleSet({ 'pay.agent_fee_cap': true })))).toEqual({ ok: false, reason: 'agent_fee_over_cap' });
    expect(validateAgreement({ ...a, agentFeePct: 5 }, collegeRules(ruleSet({ 'pay.agent_fee_cap': true })))).toEqual({ ok: true });
  });
  it('payment schedules sum to the year', () => {
    for (const s of ['monthly_hold_december', 'bowl_month_bonus', 'half_and_half'] as const) {
      expect(paymentShares(s, 12, 6).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
    }
    const bowl = paymentShares('bowl_month_bonus', 12, 6);
    expect(bowl[6]! / bowl[0]!).toBeCloseTo(1.5, 12);
  });
});

describe('the coach and outside money (T7.4.1 acceptance)', () => {
  const ctx = { actor: party(30, 'position_coach', 3), day: 0, knew: [], tier: 1 as const, source: 'user' as const };
  it('stating an outside amount writes one violation row; a staff donation to an NIL entity is another', () => {
    for (const id of ['outside_amount_promise', 'staff_nil_donation'] as const) {
      const act = collegeAct(id, ctx, { personId: 90, origin: 'generated' })!;
      expect(act.classId).toBe('pay_rules');
      const r = commitAct(emptyCompliance(), act, complianceRules(COLLEGE_VALUES), new MemorySink());
      expect(r.ok && r.state.log.length).toBe(1);
    }
  });
  it('describing opportunities, introducing to the collective and attending a fundraiser are not acts', () => {
    for (const p of PERMITTED_NIL_ACTS) expect(Object.keys(COLLEGE_ACTS)).not.toContain(p);
  });
});
