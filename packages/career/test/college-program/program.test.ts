// G-38 acceptance: budget, booster and staff-pay cases from T9 (T9.1.1, T9.2.1, T9.2.2, T9.3.1,
// T9.4.1, T9.6.1, L5.4.2, L5.4.3, L5.4.6).
import { describe, expect, it } from 'vitest';
import { FactRow, ParamFile, RuleKeyManifest, computeStatus } from '@gm/schema';
import { compliance } from '@gm/league';
import {
  BUDGET_LINES, DEFAULT_POWER, PARAMS, PROGRAM_FACTS, RULE_KEYS, P,
  answerRequest, boardMustApprove, buyoutFunding, drawPowerArrangement, drawSalaryCents, embarrass,
  facilityEffects, generateBoosters, grantToLine, headroom, hire, inflationFactor, lineSum, midYearCut,
  moodAfterAccess, moodAfterGame, moveBetweenLines, nextYearBudget, openingBudget, presidentBackingChance,
  presidentInvolvementChance, proposeProject, provisionalLabel, raiseRequest, removeGiving, rollFacilities,
  seatSummary, setSalary, shareSum, boosterSeason, answerOffer, disassociate, aiSplitStaffPool, accessGain,
  yearlyGiving, newSeasonWarnings, checkHire, programFactNumber,
  type AthleticDirector, type BoosterActContext, type BoosterGroup, type Facility, type FacilityProject, type RequestContext,
} from '../../src/college-program/index.ts';
import { COLLEGE, D, DOLLAR, MILLION, MemorySink, SEAT_VALUES, program, rng, ruleSet, seat } from './fixtures.ts';

const AD: AthleticDirector = { personId: 1, patience: 0.5, footballKnowledge: 0.5, riskAppetite: 0.5, boosterCloseness: 0.5, interim: false, hiredCurrentCoach: true, startYear: 2026, plannedEndYear: 2033 };
const CTX: RequestContext = { year: 2026, week: 3, totalBudgetCents: 60 * MILLION, headroomCents: 5 * MILLION, resultsVsExpectation: 0, boosterMood: 50 };

describe('data files', () => {
  it('PARAMS, RULE_KEYS and fact rows validate; line shares sum to 1', () => {
    ParamFile.parse(PARAMS);
    RuleKeyManifest.parse(RULE_KEYS);
    for (const r of PROGRAM_FACTS) FactRow.parse(r);
    expect(shareSum()).toBeCloseTo(1, 10);
  });

  it('fact status is computed from sources and anything short of Verified prints PROVISIONAL', () => {
    for (const r of PROGRAM_FACTS) expect(r.status).toBe(computeStatus(r));
    expect(PROGRAM_FACTS.find((r) => r.id === 'F-collegeprog-0001')!.status).toBe('1 of 3');
    expect(provisionalLabel('F-collegeprog-0001')).toBe('PROVISIONAL');
    expect(provisionalLabel('F-collegeprog-0007')).toBe('');
  });

  it('seat limits are rule keys, not constants (T9.4.1 acceptance)', () => {
    expect(RULE_KEYS.map((k) => k.key).sort()).toEqual(Object.keys(SEAT_VALUES).sort());
  });
});

describe('T9.1.1 athletic director and president', () => {
  it('a head coach cannot set his own budget', () => {
    expect(answerRequest(AD, { kind: 'set_budget_total', amountCents: 1 }, { ...CTX, resultsVsExpectation: 1, boosterMood: 100 })).toEqual({ outcome: 'refused', reason: 'not_coach_decision' });
  });

  it('every answer carries a reason code and is logged in the history', () => {
    let h: readonly import('../../src/college-program/index.ts').AdExchange[] = [];
    const reqs = [
      { kind: 'budget_line' as const, line: 'recruiting_travel' as const, amountCents: MILLION },
      { kind: 'schedule_preference' as const },
      { kind: 'staff_seat' as const, amountCents: 200_000 * DOLLAR },
      { kind: 'budget_line' as const, line: 'nutrition' as const },
    ];
    for (const r of reqs) h = raiseRequest(h, AD, r, CTX).history;
    expect(h).toHaveLength(4);
    for (const e of h) expect(e.reason).toBeTruthy();
    expect(h[3]!.reason).toBe('no_amount');
  });

  it('results and booster mood move the answer; money that does not exist is never granted', () => {
    expect(answerRequest(AD, { kind: 'discipline_matter' }, { ...CTX, resultsVsExpectation: 1, boosterMood: 90 }).outcome).toBe('granted');
    expect(answerRequest(AD, { kind: 'discipline_matter' }, { ...CTX, resultsVsExpectation: -1, boosterMood: 5 }).outcome).not.toBe('granted');
    const tooMuch = answerRequest(AD, { kind: 'budget_line', line: 'nutrition', amountCents: 6 * MILLION }, { ...CTX, resultsVsExpectation: 1, boosterMood: 100 });
    expect(tooMuch).toEqual({ outcome: 'deferred', reason: 'no_money' });
  });

  it('an interim AD defers all large requests', () => {
    expect(answerRequest({ ...AD, interim: true }, { kind: 'facility_project', amountCents: 1 }, { ...CTX, resultsVsExpectation: 1, boosterMood: 100 })).toEqual({ outcome: 'deferred', reason: 'interim_ad' });
    expect(answerRequest({ ...AD, interim: true }, { kind: 'schedule_preference' }, { ...CTX, resultsVsExpectation: 1, boosterMood: 100 }).outcome).toBe('granted');
  });

  it('college default power: the head coach holds roster, payments and staff; variants at the stated odds', () => {
    expect(DEFAULT_POWER).toMatchObject({ roster: 'head_coach', contracts: 'head_coach', staff: 'head_coach', draft: null, reports: 'athletic_director' });
    const r = rng(7, 'power');
    let adPays = 0; let gmToAd = 0; const n = 4000;
    for (let i = 0; i < n; i++) { const p = drawPowerArrangement(r); if (p.contracts === 'athletic_director') adPays++; if (p.generalManagerReportsTo === 'athletic_director') gmToAd++; }
    expect(adPays / n).toBeGreaterThan(P('power.ad_holds_payments_odds') - 0.02);
    expect(adPays / n).toBeLessThan(P('power.ad_holds_payments_odds') + 0.02);
    expect(gmToAd / n).toBeGreaterThan(P('power.gm_reports_to_ad_odds') - 0.025);
    expect(gmToAd / n).toBeLessThan(P('power.gm_reports_to_ad_odds') + 0.025);
  });

  it('L5.4.2: president backing formula, board threshold, involvement rises with buyout and a case', () => {
    expect(presidentBackingChance({ personId: 1, academicStrictness: 0.5, footballPriority: 0.5 })).toBeCloseTo(0.5);
    expect(presidentBackingChance({ personId: 1, academicStrictness: 0, footballPriority: 1 })).toBeCloseTo(0.9);
    expect(presidentBackingChance({ personId: 1, academicStrictness: 1, footballPriority: 0 })).toBeCloseTo(0.1);
    expect(boardMustApprove(MILLION)).toBe(true);
    expect(boardMustApprove(MILLION - 1)).toBe(false);
    const low = presidentInvolvementChance(0, false);
    expect(presidentInvolvementChance(20 * MILLION, false)).toBeGreaterThan(low);
    expect(presidentInvolvementChance(0, true)).toBeGreaterThan(low);
    expect(presidentInvolvementChance(1000 * MILLION, true)).toBe(P('president.involve_max'));
  });
});

describe('T9.2.1 budget', () => {
  it('the sum of lines equals the total after every operation and never exceeds it', () => {
    for (const tier of ['power', 'other', 'second'] as const) {
      let b = openingBudget(tier, 2026, 3 * MILLION, rng(3, tier));
      expect(lineSum(b)).toBe(b.totalCents);
      expect(b.lines.staff_pool).toBeGreaterThanOrEqual(P(`budget.staff_pool_min_usd.${tier}`) * DOLLAR - 100);
      expect(b.lines.staff_pool).toBeLessThanOrEqual(P(`budget.staff_pool_max_usd.${tier}`) * DOLLAR + 100);
      b = nextYearBudget(b, { winsAboveExpectation: 3, games: 12, givingChange: 0.2, rosterMoneyCents: 4 * MILLION });
      expect(lineSum(b)).toBe(b.totalCents);
      b = grantToLine(b, 'nutrition', 250_000 * DOLLAR);
      expect(lineSum(b)).toBe(b.totalCents);
      b = midYearCut(b, [], 0.1);
      expect(lineSum(b)).toBe(b.totalCents);
      b = removeGiving(b, 2 * MILLION);
      expect(lineSum(b)).toBe(b.totalCents);
      for (const l of BUDGET_LINES) expect(b.lines[l]).toBeGreaterThanOrEqual(0);
    }
  });

  it('results and giving move the total, capped per year; roster money is T7s figure', () => {
    const b = openingBudget('other', 2026, 0, rng(4));
    const up = nextYearBudget(b, { winsAboveExpectation: 12, games: 12, givingChange: 5, rosterMoneyCents: 0 });
    expect(up.totalCents / b.totalCents).toBeCloseTo(1 + P('budget.max_yearly_change'), 3);
    const down = nextYearBudget(b, { winsAboveExpectation: -2, games: 12, givingChange: 0, rosterMoneyCents: 7 * MILLION });
    expect(down.totalCents - 7 * MILLION).toBeLessThan(b.totalCents);
    expect(down.lines.roster_money).toBe(7 * MILLION);
  });

  it('the coach moves money only between the lines he controls, and never below promised pay', () => {
    const p = program('power');
    const staff = [seat({ salaryCents: p.budget.lines.staff_pool - 100 * DOLLAR })];
    expect(moveBetweenLines(p.budget, staff, 'nutrition', 'recruiting_travel', DOLLAR)).toEqual({ ok: false, reason: 'not_coach_line' });
    expect(moveBetweenLines(p.budget, staff, 'staff_pool', 'recruiting_travel', 1000 * DOLLAR)).toEqual({ ok: false, reason: 'below_committed_pay' });
    const ok = moveBetweenLines(p.budget, staff, 'recruiting_travel', 'staff_pool', 1000 * DOLLAR);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.budget.totalCents).toBe(p.budget.totalCents);
      expect(ok.budget.lines.staff_pool).toBe(p.budget.lines.staff_pool + 1000 * DOLLAR);
      // Changing a line changes the consuming system's input: the staff pool now has room for a hire.
      expect(headroom(ok.budget, staff)).toBe(headroom(p.budget, staff) + 1000 * DOLLAR);
    }
  });

  it('a mid-year cut freezes open seats and keeps promised pay', () => {
    const p = program('other');
    const staff = [seat({ salaryCents: Math.floor(p.budget.lines.staff_pool * 0.95) })];
    const cut = midYearCut(p.budget, staff, 0.2);
    expect(cut.seatsFrozen).toBe(true);
    expect(cut.lines.staff_pool).toBeGreaterThanOrEqual(staff[0]!.salaryCents);
    const frozen = { ...p, budget: cut, staff };
    expect(checkHire(frozen, seat({ salaryCents: 1 }), COLLEGE).money).toBe('seats_frozen');
  });
});

describe('T9.2.2 facilities', () => {
  const base: Facility[] = [
    { kind: 'weight_room', exists: true, grade: 50, lastBuiltYear: 2010 },
    { kind: 'training_room', exists: true, grade: 50, lastBuiltYear: 2010 },
  ];

  it('no indoor field lowers bad-weather practice quality', () => {
    expect(facilityEffects(base).badWeatherPracticeQuality).toBe(P('facility.no_indoor_practice_quality'));
  });

  it('projects take 1 to 3 years and change their input the season after completion', () => {
    expect(proposeProject('x', 'indoor_field', 'build', MILLION, 2026, 4, base).ok).toBe(false);
    expect(proposeProject('x', 'indoor_field', 'renovate', MILLION, 2026, 2, base).ok).toBe(false);
    const prop = proposeProject('x', 'indoor_field', 'build', 30 * MILLION, 2026, 2, base);
    expect(prop.ok).toBe(true);
    if (!prop.ok) return;
    const funded = { ...prop.project, funded: true };
    let fac: readonly Facility[] = base; let proj: readonly FacilityProject[] = [funded];
    for (const season of [2027, 2028]) {
      ({ facilities: fac, projects: proj } = rollFacilities(fac, proj, season));
      expect(facilityEffects(fac).badWeatherPracticeQuality, `${season}`).toBeLessThan(1);
    }
    ({ facilities: fac, projects: proj } = rollFacilities(fac, proj, 2029));
    expect(proj).toHaveLength(0);
    expect(facilityEffects(fac).badWeatherPracticeQuality).toBe(1);
  });

  it('an unfunded project never completes; grades decay with age; effects are small', () => {
    const prop = proposeProject('w', 'weight_room', 'renovate', MILLION, 2026, 1, base);
    if (!prop.ok) throw new Error('expected ok');
    const r = rollFacilities(base, [prop.project], 2030);
    expect(r.projects).toHaveLength(1);
    expect(r.facilities.find((f) => f.kind === 'weight_room')!.grade).toBeLessThan(50);
    const e = facilityEffects([{ kind: 'weight_room', exists: true, grade: 100, lastBuiltYear: 2026 }]);
    expect(e.strengthGain).toBeGreaterThan(1);
    expect(e.strengthGain).toBeLessThan(1.1);
  });
});

describe('T9.3.1 and L5.4.3 boosters', () => {
  const group = (over: Partial<BoosterGroup> = {}): BoosterGroup => ({
    id: 1, leaderPersonId: 900, wealthCents: P('booster.wealth_mean_usd.power') * DOLLAR, givingHistoryCents: [], mood: 50, closeness: 0.5,
    toldCoachWillLookAway: false, disassociated: false, ties: {}, ...over,
  });
  const actCtx: BoosterActContext = { teamId: 1, competitionId: 1, date: D(2026, 100), tier: 1, source: 'sim', leaderOrigin: 'generated', headCoachPersonId: 10, headCoachOrigin: 'user' };

  it('generates 1 to 5 groups with symmetric ties', () => {
    for (let s = 0; s < 20; s++) {
      const gs = generateBoosters('power', 1, 1, [900, 901, 902, 903, 904], rng(s, 'boost'));
      expect(gs.length).toBeGreaterThanOrEqual(1);
      expect(gs.length).toBeLessThanOrEqual(5);
      for (const a of gs) for (const b of gs) if (a.id !== b.id) expect(a.ties[b.id]).toBe(b.ties[a.id]);
    }
  });

  it('rivalry games count double (config value); access has diminishing returns', () => {
    const plain = moodAfterGame(group(), 1, false).mood - 50;
    const rival = moodAfterGame(group(), 1, true).mood - 50;
    expect(rival).toBeCloseTo(plain * P('booster.rivalry_weight'));
    expect(accessGain(2) / 2).toBeGreaterThan((accessGain(8) - accessGain(6)) / 2);
    expect(moodAfterAccess(group({ mood: 99 }), 100).mood).toBe(100);
  });

  it('an embarrassed donor costs a lot and the cost travels by ties', () => {
    const gs = [group({ id: 1, ties: { 2: 1, 3: 0 } }), group({ id: 2, ties: { 1: 1, 3: 0 } }), group({ id: 3, ties: { 1: 0, 2: 0 } })];
    const after = embarrass(gs, 1);
    expect(after[0]!.mood).toBe(50 - P('booster.embarrass_cost'));
    expect(after[1]!.mood).toBeLessThan(50);
    expect(after[2]!.mood).toBe(50);
  });

  it('only unhappy groups fund a buyout, at most half of it (L5.4.6)', () => {
    const cost = 20 * MILLION;
    expect(buyoutFunding([group({ mood: 80 })], cost)).toBe(0);
    const paid = buyoutFunding([group({ mood: 0, wealthCents: 1000 * MILLION })], cost);
    expect(paid).toBe(cost * P('booster.buyout_share_max'));
    expect(buyoutFunding([group({ mood: 0, disassociated: true })], cost)).toBe(0);
  });

  it('booster-initiated violations occur at programs whose coaches never asked (T9.3.1 acceptance)', () => {
    const sink = new MemorySink();
    let acts = 0;
    for (let prog = 0; prog < 400; prog++) {
      const r = rng(prog, 'season');
      const res = boosterSeason(compliance.emptyCompliance(), group(), 'power', 1, COLLEGE, sink, { ...actCtx, teamId: prog + 1 }, r);
      if (res.acted) {
        acts++;
        const row = res.state.log[0]!;
        expect(row.classId).toBe('pay_rules');
        expect(row.actor.role).toBe('booster');
        expect(row.orderedBy).toBeNull();
        expect(row.knew).not.toContain(actCtx.headCoachPersonId);
      }
    }
    expect(acts).toBeGreaterThan(0);
    expect(acts).toBeLessThan(400 * P('booster.pay_max_per_season'));
  });

  it('a coach who looks away raises the chance and is among those who knew', () => {
    const ignored = answerOffer(compliance.emptyCompliance(), group(), 'ignore', COLLEGE, new MemorySink(), actCtx);
    expect(ignored.commit).toBeNull();
    expect(ignored.group.toldCoachWillLookAway).toBe(true);
    let n = 0; let withCoach = 0;
    for (let i = 0; i < 300; i++) {
      const res = boosterSeason(compliance.emptyCompliance(), ignored.group, 'power', 0, COLLEGE, new MemorySink(), actCtx, rng(i, 'look'));
      if (res.acted) { n++; if (res.state.log[0]!.knew.includes(actCtx.headCoachPersonId)) withCoach++; }
    }
    expect(withCoach).toBe(n);
    expect(n).toBeGreaterThan(300 * P('booster.pay_base_per_season'));
  });

  it('accepting the offer is never blocked and logs the coach as the one who ordered it', () => {
    const res = answerOffer(compliance.emptyCompliance(), group(), 'accept', COLLEGE, new MemorySink(), actCtx);
    expect(res.commit?.ok).toBe(true);
    expect(res.state.log[0]!.orderedBy?.personId).toBe(actCtx.headCoachPersonId);
    const declined = answerOffer(compliance.emptyCompliance(), group(), 'decline', COLLEGE, new MemorySink(), actCtx);
    expect(declined.state.log).toHaveLength(0);
    expect(declined.group.mood).toBeLessThan(50);
  });

  it('an imported (real) booster never acts outside the rules', () => {
    const res = answerOffer(compliance.emptyCompliance(), group(), 'accept', COLLEGE, new MemorySink(), { ...actCtx, leaderOrigin: 'imported' });
    expect(res.commit).toMatchObject({ ok: false, reason: 'protected_person' });
  });

  it('a disassociated booster gives nothing and his money leaves the budget', () => {
    const g = group();
    const giving = yearlyGiving(g);
    expect(giving).toBeGreaterThan(0);
    expect(yearlyGiving(disassociate(g))).toBe(0);
    const b = openingBudget('power', 2026, 0, rng(9));
    const after = removeGiving(b, giving);
    expect(b.totalCents - after.totalCents).toBe(Math.min(giving, b.totalCents - b.lines.staff_pool - b.lines.support_staff));
  });
});

describe('T9.4.1 staff limits and T9.6.1 staff pay', () => {
  const hc = { hirerPersonId: 10, hirerRole: 'head_coach' as const, hirerOrigin: 'user' as const, competitionId: 1, date: D(2026, 50), tier: 1 as const, source: 'user' as const };

  it('the 12th off-campus recruiter warns once, writes one row per hire, and is never blocked', () => {
    let p = program('power');
    let cs = compliance.emptyCompliance();
    const sink = new MemorySink();
    for (let i = 0; i < 11; i++) {
      const r = hire(p, cs, seat({ counts: ['off_campus_recruiter'], salaryCents: DOLLAR }), COLLEGE, sink, hc);
      if (!r.ok) throw new Error('hire refused');
      expect(r.warnings).toHaveLength(0);
      p = r.program; cs = r.compliance;
    }
    const twelfth = hire(p, cs, seat({ counts: ['off_campus_recruiter'], salaryCents: DOLLAR }), COLLEGE, sink, hc);
    if (!twelfth.ok) throw new Error('blocked');
    expect(twelfth.warnings).toEqual([expect.objectContaining({ seat: 'off_campus_recruiter', limit: 11, countAfter: 12, show: true })]);
    expect(twelfth.compliance.log).toHaveLength(1);
    expect(twelfth.compliance.log[0]!.classId).toBe('recruiting_contact');
    const thirteenth = hire(twelfth.program, twelfth.compliance, seat({ counts: ['off_campus_recruiter'], salaryCents: DOLLAR }), COLLEGE, sink, hc);
    if (!thirteenth.ok) throw new Error('blocked');
    expect(thirteenth.warnings[0]!.show).toBe(false);
    expect(thirteenth.compliance.log).toHaveLength(2);
    expect(newSeasonWarnings(thirteenth.program).warnedSeats).toEqual([]);
  });

  it('limits are read from the rule set: a different value moves the line, an absent key means no limit', () => {
    const p = { ...program('power'), staff: [1, 2, 3, 4].map(() => seat({ counts: ['graduate_assistant'], salaryCents: DOLLAR })) };
    expect(checkHire(p, seat({ counts: ['graduate_assistant'] }), COLLEGE).warnings).toHaveLength(1);
    const six = ruleSet({ ...SEAT_VALUES, 'staff.graduate_assistant_limit': 6 });
    expect(checkHire(p, seat({ counts: ['graduate_assistant'] }), six).warnings).toHaveLength(0);
    const none = ruleSet({});
    expect(checkHire(p, seat({ counts: ['graduate_assistant'] }), none).warnings).toHaveLength(0);
    expect(seatSummary(p.staff, COLLEGE).find((s) => s.seat === 'graduate_assistant')).toEqual({ seat: 'graduate_assistant', count: 4, limit: 4 });
  });

  it('salaries cannot exceed the staff pool', () => {
    const p = program('other');
    expect(hire(p, compliance.emptyCompliance(), seat({ salaryCents: p.budget.lines.staff_pool + 1 }), COLLEGE, new MemorySink(), hc)).toEqual({ ok: false, reason: 'no_money' });
    const first = hire(p, compliance.emptyCompliance(), seat({ salaryCents: p.budget.lines.staff_pool }), COLLEGE, new MemorySink(), hc);
    if (!first.ok) throw new Error('refused');
    expect(hire(first.program, first.compliance, seat({ salaryCents: 1 }), COLLEGE, new MemorySink(), hc)).toEqual({ ok: false, reason: 'no_money' });
    const job = first.program.staff[0]!.jobId;
    expect(setSalary(first.program, job, p.budget.lines.staff_pool + 1)).toEqual({ ok: false, reason: 'no_money' });
    expect(setSalary(first.program, job, DOLLAR).ok).toBe(true);
  });

  it('an AI split of the staff pool never pays more than the pool', () => {
    const seats = [
      seat({ payRole: 'coordinator' }), seat({ payRole: 'coordinator' }), seat({ payRole: 'coordinator' }),
      ...Array.from({ length: 10 }, () => seat({ payRole: 'position_coach' })),
      ...Array.from({ length: 4 }, () => seat({ payRole: 'graduate_assistant' })),
    ];
    for (const tier of ['power', 'other', 'second'] as const) {
      const pool = P(`budget.staff_pool_min_usd.${tier}`) * DOLLAR;
      const paid = aiSplitStaffPool(seats, pool, tier, 2026, 0.5, rng(11, tier));
      expect(paid.reduce((s, x) => s + x.salaryCents, 0)).toBeLessThanOrEqual(pool);
      for (const x of paid) expect(x.salaryCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('head coach pay in a 138-team world has 80 to 105 coaches at 1 million or more (2025 values)', () => {
    const anchor = programFactNumber('F-collegeprog-0001');
    expect(anchor).toBeGreaterThanOrEqual(80);
    expect(anchor).toBeLessThanOrEqual(105);
    for (let s = 0; s < 25; s++) {
      const r = rng(s, 'hcpay');
      let atMillion = 0;
      for (let t = 0; t < 138; t++) {
        const cents = drawSalaryCents('head_coach', t < 68 ? 'power' : 'other', 2025, r);
        if (cents >= MILLION) atMillion++;
      }
      expect(atMillion, `seed ${s}`).toBeGreaterThanOrEqual(80);
      expect(atMillion, `seed ${s}`).toBeLessThanOrEqual(105);
    }
  });

  it('bands follow the T9.6.1 table and inflate by year', () => {
    expect(inflationFactor(2025)).toBe(1);
    expect(inflationFactor(2027)).toBeCloseTo((1 + P('pay.inflation_per_year')) * (1 + P('pay.inflation_per_year')));
    const r = rng(5, 'bands');
    for (let i = 0; i < 200; i++) {
      const hc = drawSalaryCents('head_coach', 'other', 2025, r);
      expect(hc).toBeGreaterThanOrEqual(programFactNumber('F-collegeprog-0004') * DOLLAR);
      expect(hc).toBeLessThanOrEqual(programFactNumber('F-collegeprog-0003') * DOLLAR);
      const ga = drawSalaryCents('graduate_assistant', 'power', 2025, r);
      expect(ga).toBeLessThanOrEqual(1500 * 9 * DOLLAR);
      const oc = drawSalaryCents('coordinator', 'power', 2025, r);
      expect(oc).toBeLessThanOrEqual(programFactNumber('F-collegeprog-0005') * DOLLAR);
    }
  });
});
