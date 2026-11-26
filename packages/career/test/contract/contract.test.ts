// E3 acceptance cases: record, pay, incentives, termination, offset, cause, buyouts, settlements.
import { describe, expect, it } from 'vitest';
import {
  applyOffset, bandPosition, buyoutPayer, causeNotice, coachAcceptsSettlement, contractProblems, cparam, evaluateIncentives,
  ladderStage, leaveEarly, monthCashFlow, monthIndex, owedOnEnd, payBand, resolveCauseDispute, scheduledPayments, settle,
  settlementOffer, settlementOfferShare, sum, toWorldTerms, totalSalary, yearPayments, CONTRACT_TIERS, type CoachContract,
} from '../../src/contract/index.ts';
import { CoachContractTerms } from '@gm/schema';
import { draft, flat, rng, usd } from './helpers.ts';

const SEATS = ['head_coach', 'assistant'] as const;

describe('E3.1.1 contract record', () => {
  it('drafted contracts are well formed for every tier and seat, and map onto the world contract', () => {
    for (const tier of CONTRACT_TIERS) for (const seat of SEATS) for (let s = 1; s <= 20; s++) {
      const c = draft({ tier, seat, rung: seat === 'head_coach' ? 9 : 5, supplementalShare: seat === 'head_coach' ? 0.9 : 0, agentId: 7 }, s);
      expect(contractProblems(c), `${tier}.${seat}`).toEqual([]);
      CoachContractTerms.parse(toWorldTerms(c));
    }
  });
  it('drafting is deterministic for a seed', () => {
    expect(draft({ tier: 'power_four' }, 42)).toEqual(draft({ tier: 'power_four' }, 42));
  });
  it('the professional head coach default is 5 years, fully guaranteed, offset on, no buyout', () => {
    const c = draft();
    expect(c.endYear - c.startYear + 1).toBe(5);
    expect(c.guarantee.share).toBe(1);
    expect(c.offset.on).toBe(true);
    expect(c.buyout.form).toBe('none');
    expect(c.releaseHeldByClub).toBe(true);
  });
  it('the sum of scheduled payments equals the sum of salary fields plus the signing bonus, to the cent', () => {
    for (let s = 1; s <= 10; s++) {
      const c = draft({ tier: 'power_four', supplementalShare: 0.9, signingBonusCents: usd(250_000) }, s);
      expect(sum(scheduledPayments(c).map((p) => ({ month: p.month, cents: p.grossCents })))).toBe(totalSalary(c) + c.signingBonusCents);
    }
  });
});

describe('E3.2 pay', () => {
  it('twelve monthly payments sum to the year salary to the cent (E3.2.3)', () => {
    const c = { ...draft({ tier: 'power_four', seat: 'assistant', rung: 5, firstYearPayCents: usd(350_000.07) }), payPeriods: 12 };
    const ps = yearPayments(c, 0);
    expect(ps.length).toBe(12);
    expect(ps.reduce((x, p) => x + p.grossCents, 0)).toBe(c.salary[0]!.baseCents);
  });
  it('supplemental pay is quarterly and not withheld; the agent fee posts with each payment at the agreed share', () => {
    const c = { ...draft({ tier: 'power_four', supplementalShare: 0.9, agentId: 3 }), payPeriods: 12 };
    const ps = yearPayments(c, 0);
    expect(ps.filter((p) => p.stream === 'supplemental').length).toBe(4);
    expect(ps.filter((p) => p.stream === 'supplemental').every((p) => !p.withheld)).toBe(true);
    for (const p of ps) expect(p.agentFeeCents).toBe(Math.round(p.grossCents * c.agentFeeShare));
    const m = monthCashFlow(ps, ps[2]!.month);
    expect(m.feesCents).toBeGreaterThan(0);
  });
  it('band position words (E3.2.1)', () => {
    const b = payBand('pro', 9);
    expect(bandPosition(b.lowCents - 1, b, 0.2, 0.8)).toBe('below_band');
    expect(bandPosition(b.lowCents, b, 0.2, 0.8)).toBe('bottom');
    expect(bandPosition(b.highCents, b, 0.2, 0.8)).toBe('top');
    expect(payBand('pro', 9, 1.1).lowCents).toBe(Math.round(b.lowCents * 1.1));
    expect(payBand('pro', 0).highCents).toBe(0);
  });
});

describe('E3.2.2 incentives', () => {
  const c = draft({ tier: 'power_four', seat: 'assistant', rung: 5, firstYearPayCents: usd(350_000) });
  const yes = { employedOnEventMonth: () => true, employedOnPayMonth: () => true, pendingInvestigation: false };
  const m = monthIndex(2030, 12);
  it('a triggered bonus posts once', () => {
    const e = [{ trigger: 'conference_title' as const, month: m, count: 1 }];
    const r1 = evaluateIncentives(c, e, yes);
    expect(r1.payments.length).toBe(1);
    expect(r1.payments[0]!.grossCents).toBe(usd(20_000));
    const r2 = evaluateIncentives(c, e, yes, r1.posted);
    expect(r2.payments.length).toBe(0);
  });
  it('a coach not employed on the event date earns nothing; a pending investigation holds a head coach bonus; the cap binds', () => {
    expect(evaluateIncentives(c, [{ trigger: 'conference_title', month: m, count: 1 }], { ...yes, employedOnEventMonth: () => false }).payments).toEqual([]);
    const hc = draft({ tier: 'power_four', firstYearPayCents: usd(5_000_000) });
    expect(evaluateIncentives(hc, [{ trigger: 'conference_title', month: m, count: 1 }], { ...yes, pendingInvestigation: true }).withheld[0]!.reason).toBe('investigation');
    const near = new Map([[0, c.incentiveCapCents - usd(1_000)]]);
    expect(evaluateIncentives(c, [{ trigger: 'conference_title', month: m, count: 1 }], yes, new Set(), near).payments[0]!.grossCents).toBe(usd(1_000));
  });
});

describe('E3.3.1 termination without cause', () => {
  it('three full years left at $6M under full guarantee: $18M over the original schedule', () => {
    const c = flat(draft(), usd(6_000_000));
    const r = owedOnEnd(c, monthIndex(2032, 1), 'fired_without_cause');
    expect(r.owedCents).toBe(usd(18_000_000));
    expect(r.schedule.length).toBe(36);
  });
  it('power four assistant at $350,000 with a 70% guarantee fired with 18 months left: $367,500 monthly', () => {
    const base = draft({ tier: 'power_four', seat: 'assistant', rung: 5, years: 3, firstYearPayCents: usd(350_000) });
    const c: CoachContract = { ...flat(base, usd(350_000)), guarantee: { ...base.guarantee, share: 0.7 } };
    const r = owedOnEnd(c, monthIndex(2031, 7), 'fired_without_cause');
    expect(r.schedule.length).toBe(18);
    expect(r.owedCents).toBe(usd(367_500));
  });
  it('a Group of Six assistant whose head coach leaves is owed at most two months', () => {
    const c = draft({ tier: 'group_of_six', seat: 'assistant', rung: 5, firstYearPayCents: usd(120_000) });
    const r = owedOnEnd(c, monthIndex(2030, 3), 'head_coach_changed');
    expect(r.schedule.length).toBeLessThanOrEqual(2);
    expect(r.owedCents).toBe(usd(20_000));
    expect(owedOnEnd(c, monthIndex(2030, 3), 'fired_without_cause').owedCents).toBe(0);
  });
  it('guaranteed_through ends what is owed early; death pays the current year in full', () => {
    const c0 = flat(draft(), usd(6_000_000));
    const c = { ...c0, guarantee: { ...c0.guarantee, guaranteedThroughYear: 2032 } };
    expect(owedOnEnd(c, monthIndex(2031, 1), 'fired_without_cause').owedCents).toBe(usd(12_000_000));
    expect(owedOnEnd(c0, monthIndex(2031, 7), 'death_or_disability').owedCents).toBe(usd(3_000_000));
  });
});

describe('E3.3.2 offset', () => {
  const c = flat(draft(), usd(6_000_000));
  const monthly = usd(500_000);
  const ctx = { newAnnualSalaryCents: usd(2_000_000), newBandMedianCents: payBand('pro', 7).medianCents };
  it('owed $6M a year, takes a $2M coordinator job: $4M from the old club and $2M from the new one', () => {
    let old = 0;
    for (let k = 0; k < 12; k++) old += applyOffset(c, monthly, { coachingCents: Math.round(usd(2_000_000) / 12), otherFootballCents: 0, nonFootballCents: 0 }, ctx).paidCents;
    expect(Math.abs(old - usd(4_000_000))).toBeLessThanOrEqual(12);
  });
  it('media pay offsets only under football_related; non-football income never does; no offset pays twice', () => {
    const media = { coachingCents: 0, otherFootballCents: usd(100_000), nonFootballCents: usd(50_000) };
    const none = { newAnnualSalaryCents: 0, newBandMedianCents: 0 };
    expect(applyOffset({ ...c, offset: { ...c.offset, income: 'coaching_only' } }, monthly, media, none).paidCents).toBe(monthly);
    expect(applyOffset({ ...c, offset: { ...c.offset, income: 'football_related' } }, monthly, media, none).paidCents).toBe(monthly - usd(100_000));
    expect(applyOffset({ ...c, offset: { ...c.offset, on: false } }, monthly, { ...media, coachingCents: monthly }, none).paidCents).toBe(monthly);
  });
  it('a new salary far below market uses the band median, by arbitration in a professional contract', () => {
    const low = { newAnnualSalaryCents: usd(10_000), newBandMedianCents: payBand('pro', 7).medianCents };
    const r = applyOffset(c, monthly, { coachingCents: Math.round(usd(10_000) / 12), otherFootballCents: 0, nonFootballCents: 0 }, low);
    expect(r.marketFloorUsed).toBe(true);
    expect(r.arbitrationEvent).toBe(true);
    const college = { ...c, offset: { ...c.offset, marketFloor: 'in_contract' as const } };
    expect(applyOffset(college, monthly, { coachingCents: 0, otherFootballCents: 0, nonFootballCents: 0 }, low).arbitrationEvent).toBe(false);
  });
});

describe('E3.3.3 termination for cause', () => {
  const c = draft({ tier: 'power_four' });
  const m = monthIndex(2031, 5);
  const n = { conductEventId: 99, month: m, curedInDays: null, suspendDays: null };
  it('losing games alone never produces a for-cause notice; no conduct event, no notice', () => {
    expect(causeNotice(c, { ...n, ground: 'win_loss_record' })).toEqual({ kind: 'invalid', reason: 'not_a_ground' });
    expect(causeNotice(c, { ...n, ground: 'gambling_on_sport', conductEventId: null })).toEqual({ kind: 'invalid', reason: 'no_conduct_event' });
  });
  it('a cure-eligible ground cured within 5 days ends the case with no termination', () => {
    expect(causeNotice(c, { ...n, ground: 'unauthorized_absence', curedInDays: 5 })).toEqual({ kind: 'cured' });
    expect(causeNotice(c, { ...n, ground: 'unauthorized_absence', curedInDays: 6 }).kind).toBe('terminated');
  });
  it('an unpaid suspension up to the contract limit; none in a professional contract', () => {
    expect(causeNotice(c, { ...n, ground: 'harassment_policy', suspendDays: 90 }).kind).toBe('suspended');
    expect(causeNotice(draft(), { ...n, ground: 'harassment_policy', suspendDays: 30 }).kind).toBe('terminated');
  });
  it('disputes resolve deterministically by seed, with delay and legal cost in range', () => {
    const a = resolveCauseDispute(rng(5), 'conduct_unbecoming_only', usd(10_000_000));
    expect(a).toEqual(resolveCauseDispute(rng(5), 'conduct_unbecoming_only', usd(10_000_000)));
    expect(a.delayMonths).toBeGreaterThanOrEqual(3); expect(a.delayMonths).toBeLessThanOrEqual(9);
    let wins = 0; const r = rng(9);
    for (let i = 0; i < 2000; i++) if (resolveCauseDispute(r, 'league_or_association_finding', 1).employerWins) wins++;
    expect(wins / 2000).toBeGreaterThan(0.65); expect(wins / 2000).toBeLessThan(0.75);
  });
});

describe('E3.3.4 the coach leaves early', () => {
  const out = { isPromotion: false, insideWindow: false, retiring: false };
  it('a college coach leaving in year 2 owes the year 2 buyout exactly', () => {
    const c0 = draft({ tier: 'group_of_six', rung: 9, firstYearPayCents: usd(1_000_000) });
    expect(c0.buyout.form).toBe('fixed_by_year');
    const r = leaveEarly(c0, { ...out, month: monthIndex(2031, 6) });
    expect(r).toEqual({ kind: 'owes', amountCents: c0.buyout.fixedByYearCents[1], dueInDays: cparam('buyoutDueDays'), breach: false });
  });
  it('an Oregon-style assistant leaving September 15 of the first season owes 50%, nothing for a play-calling coordinator job', () => {
    const base = draft({ tier: 'power_four', seat: 'assistant', rung: 5, years: 3, startMonth: 2, firstYearPayCents: usd(350_000) });
    const c: CoachContract = { ...flat(base, usd(350_000)), guarantee: { ...base.guarantee, share: 1 } };
    const sept = monthIndex(2030, 9);
    expect(ladderStage(c, monthIndex(2030, 7))).toBe(0);
    expect(ladderStage(c, sept)).toBe(1);
    expect(ladderStage(c, monthIndex(2031, 2))).toBe(2);
    const remaining = usd(350_000) * 3 - Math.round(usd(350_000) / 12) * 7;
    const r = leaveEarly(c, { ...out, month: sept });
    expect(r.kind).toBe('owes');
    if (r.kind === 'owes') expect(Math.abs(r.amountCents - Math.round(remaining * 0.5))).toBeLessThanOrEqual(4);
    expect(leaveEarly(c, { ...out, month: sept, isPromotion: true })).toEqual({ kind: 'free', why: 'promotion_waiver' });
  });
  it('a resignation inside the season window is possible and is a breach; a professional move needs a release; retirement owes nothing', () => {
    const c = draft({ tier: 'power_four' });
    const r = leaveEarly(c, { ...out, month: monthIndex(2031, 10), insideWindow: true });
    expect(r.kind === 'owes' && r.breach).toBe(true);
    expect(leaveEarly(draft(), { ...out, month: monthIndex(2031, 10) }).kind).toBe('needs_release');
    expect(leaveEarly(c, { ...out, month: monthIndex(2031, 10), retiring: true })).toEqual({ kind: 'free', why: 'retired' });
  });
  it('a new employer that pays adds the gross-up', () => {
    const p = buyoutPayer(rng(1), usd(9_000_000), 1);
    expect(p).toEqual({ payer: 'new_employer', totalCents: usd(11_700_000) });
    expect(buyoutPayer(rng(1), usd(9_000_000), 0).payer).toBe('coach');
  });
});

describe('E3.3.5 settlements', () => {
  it('offer share runs from 85% down to the 55% floor as the expected offset grows', () => {
    expect(settlementOfferShare(usd(20_000_000), 0)).toBeCloseTo(0.85);
    expect(settlementOfferShare(usd(20_000_000), usd(20_000_000))).toBeCloseTo(0.55);
    expect(settlementOffer(usd(10_000_000), usd(5_000_000))).toBe(usd(7_000_000));
    expect(coachAcceptsSettlement(usd(7_000_000), usd(10_000_000), usd(5_000_000))).toBe(true);
    expect(coachAcceptsSettlement(usd(7_000_000), usd(10_000_000), 0)).toBe(false);
  });
  it('accepting a settlement closes the contract and removes the offset', () => {
    const s = settle(draft());
    expect(s.state).toBe('settled');
    expect(s.offset.on).toBe(false);
  });
});
