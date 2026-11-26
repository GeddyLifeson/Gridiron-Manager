import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compliance } from '@gm/league';
import type { WorldEvent } from '@gm/schema';
import {
  ASSISTANT_TERMS_UNVERIFIED, PARAMS, RULE_KEYS, STAFF_EVENT_TYPES, answerObjection, attendanceMisuse, autonomyGiven, autonomyUnmet, budgetLine,
  buyIn, chapelWeek, coachPrep, computeTies, coverTasks, defaultChaplain, departure, developmentFactor, firingMemories, freshClock,
  headCoachMessageWeight, hoursFor, hoursStress, inheritedStaff, interviewBlockAct, mayGoPublic, mayPushOnHeadset, needWeek, noviceCaller,
  objectionThreshold, offerMode, offerProblems, passedOver, productiveHours, provenRight, raisesObjection, recruiterSlots, recruitsWithoutSlot,
  refusalMemories, releaseCost, reportUp, requestOptions, roomTunedOut, roomWeek, setRecruiterSlot, sidelineTier, signContract, silentStaffWarning,
  tamperingAct, type AssistantContract, type Offer, type RoomState,
} from '../../src/staff/index.ts';
import { generateStaff, headCoachTasks, limitsFrom, fillSeat, vacateSeat, headCoachSeat } from '../../src/positions/index.ts';
import { COLLEGE_RULES, D0, NEEDS, PRO_RULES, row, ruleSet } from './fixtures.ts';

describe('L4.1.4 and L4.2.5 budget and contracts', () => {
  const c = (personId: number, salaryCents: number, firstYear = 2026, years = 2): AssistantContract => ({ personId, seatId: personId, firstYear, years, salaryCents, guaranteed: true, offset: true, titleKey: 't', promiseIds: [] });
  const offer: Offer = { seatId: 9, rung: 5, titleKey: 'qb', years: 2, salaryCents: 40, callsPlays: false, promises: [] };
  it('offers that would push salaries over the budget are refused; terms outside the rules block too', () => {
    const contracts = [c(1, 50), c(2, 30)];
    expect(budgetLine(contracts, 100, 2026)).toEqual({ budgetCents: 100, usedCents: 80, leftCents: 20, headcount: 2 });
    expect(offerProblems(offer, contracts, 100, 2026).length).toBeGreaterThan(0);
    expect(offerProblems({ ...offer, salaryCents: 20 }, contracts, 100, 2026)).toEqual([]);
    expect(offerProblems({ ...offer, salaryCents: 1, years: 5 }, [], 100, 2026)[0]).toMatch(/years/);
  });
  it('dead money is the guaranteed remainder less the new job when offset applies; inherited list sorted by end', () => {
    const k = c(3, 100, 2025, 3);
    expect(releaseCost(k, 2026)).toBe(200);
    expect(releaseCost(k, 2026, 60)).toBe(80);
    expect(releaseCost({ ...k, offset: false }, 2026, 60)).toBe(200);
    expect(inheritedStaff([c(4, 10, 2026, 3), c(5, 10, 2026, 1)], 2026).map((x) => x.personId)).toEqual([5, 4]);
    expect(signContract(offer, 77, 2026, [1]).personId).toBe(77);
    expect(ASSISTANT_TERMS_UNVERIFIED).toBe(true);
    expect(offerMode('general_manager')).toBe('recommend');
  });
  it('removing a role moves its tasks to someone (good staff means less head coach work)', () => {
    let staff = generateStaff({ teamId: 1, level: 'pro', band: 'top', limits: limitsFrom({}), firstSeatId: 1, date: D0 });
    const empty = headCoachTasks(staff).length;
    for (const s of staff.seats) staff = fillSeat(staff, s.seatId, 1000 + s.seatId, D0);
    const full = headCoachTasks(staff).length;
    expect(full).toBeLessThan(empty);
    const oc = staff.seats.find((s) => s.positionId === 'pos:offensive_coordinator')!;
    expect(headCoachTasks(vacateSeat(staff, oc.seatId, D0)).length).toBeGreaterThan(full);
  });
});

describe('L4.3.1 needs and buy-in', () => {
  it('buy_in is 0.5 trust + 0.3 respect + 0.2 role belief', () => {
    expect(buyIn({ trust: 80, respect: 50, familiarity: 10, roleBelief: 20 })).toBeCloseTo(59);
  });
  it('a need unmet for six weeks adds stress and costs one trust a week; met needs reset', () => {
    let rec = { trust: 50, respect: 50, familiarity: 50, roleBelief: 50 };
    let clock = freshClock();
    for (let w = 0; w < 5; w += 1) { const r = needWeek(rec, clock, NEEDS, new Set(['autonomy', 'credit', 'security', 'heard', 'loyalty_returned'])); rec = r.record; clock = r.clock; expect(r.stressFrom).toEqual([]); }
    const r6 = needWeek(rec, clock, NEEDS, new Set(['autonomy', 'credit', 'security', 'heard', 'loyalty_returned']));
    expect(r6.stressFrom).toEqual(['advancement']);
    expect(r6.record.trust).toBe(49);
    expect(r6.clock.family_time).toBe(0); // weight below the floor: never unmet
    expect(needWeek(r6.record, r6.clock, NEEDS, new Set(['advancement', 'autonomy', 'credit', 'security', 'heard', 'loyalty_returned'])).clock.advancement).toBe(0);
  });
});

describe('L4.3.2 autonomy and rooms', () => {
  it('autonomy is computed from settings and edits', () => {
    expect(autonomyGiven([{ task: 'a', setting: 'he_decides', proposals: 0, changed: 0 }, { task: 'b', setting: 'i_do_it', proposals: 0, changed: 0 }])).toBe(50);
    expect(autonomyGiven([{ task: 'a', setting: 'he_proposes', proposals: 4, changed: 4 }])).toBe(0);
    expect(autonomyGiven([{ task: 'a', setting: 'he_proposes', proposals: 4, changed: 0 }])).toBe(50);
    expect(autonomyUnmet(80, 50)).toBe(true);
    expect(autonomyUnmet(80, 51)).toBe(false);
  });
  it('room conditions fire only on their thresholds', () => {
    const r: RoomState = { coachBond: 71, buyInToHeadCoach: 39, weeksBondLow: 0 };
    expect(headCoachMessageWeight(r)).toBe(0.5);
    expect(headCoachMessageWeight({ ...r, coachBond: 70 })).toBe(1);
    expect(headCoachMessageWeight({ ...r, buyInToHeadCoach: 40 })).toBe(1);
    let s: RoomState = { coachBond: 50, buyInToHeadCoach: 50, weeksBondLow: 0 };
    for (let w = 0; w < 3; w += 1) s = roomWeek(s, 29, 50);
    expect(roomTunedOut(s)).toBe(false);
    s = roomWeek(s, 29, 50);
    expect(roomTunedOut(s)).toBe(true);
    expect(roomTunedOut(roomWeek(s, 30, 50))).toBe(false);
  });
});

describe('L4.3.3 disagreement', () => {
  const quiet = { outcomes: [] as const, weeksSinceAnyObjection: 0 };
  it('speaks up more with trust, less after three dismissals without reason', () => {
    expect(objectionThreshold(90, quiet)).toBeLessThan(objectionThreshold(10, quiet));
    const dismissed = { outcomes: ['overruled_no_reason', 'overruled_no_reason', 'overruled_no_reason'] as const, weeksSinceAnyObjection: 0 };
    expect(objectionThreshold(50, dismissed)).toBeGreaterThan(objectionThreshold(50, quiet));
    expect(raisesObjection(0.5, 50, quiet)).toBe(true);
    expect(raisesObjection(0.1, 50, quiet)).toBe(false);
  });
  it('answers, evidence, headset and the public floor', () => {
    expect(answerObjection('overrule_no_reason').trustDelta).toBe(-1);
    expect(answerObjection('overrule_reason').trustDelta).toBe(0);
    expect(answerObjection('accept').heardMet).toBe(true);
    expect(provenRight(true, false)).toBe(-2);
    expect(provenRight(false, false)).toBe(2);
    expect(mayPushOnHeadset(0)).toBe(true); expect(mayPushOnHeadset(1)).toBe(false);
    expect(mayGoPublic(24, true)).toBe(true); expect(mayGoPublic(25, true)).toBe(false); expect(mayGoPublic(10, false)).toBe(false);
    expect(silentStaffWarning(6)).toBe(true);
  });
});

describe('L4.3.4 to L4.3.6 and L4.4.3', () => {
  it('development factor is clamped to 0.95..1.05; novice callers flagged for 8 games', () => {
    expect(developmentFactor(3)).toBe(1.05);
    expect(developmentFactor(0)).toBe(0.95);
    expect(developmentFactor(null)).toBe(1);
    expect(noviceCaller(7)).toBe(true); expect(noviceCaller(8)).toBe(false);
  });
  it('hours: settings, short-week cap, diminishing returns past 80, stress, no task without hours', () => {
    expect(hoursFor('long')).toBe(80);
    expect(hoursFor('all_in', undefined, 60)).toBe(60);
    expect(productiveHours(90)).toBe(85);
    expect(productiveHours(70)).toBe(70);
    expect(hoursStress(90, true)).toBeGreaterThan(hoursStress(70, false));
    const cov = coverTasks([{ task: 'film', ownerPersonId: 1, hours: 50 }, { task: 'plan', ownerPersonId: 1, hours: 40 }, { task: 'st', ownerPersonId: 2, hours: 10 }], new Map([[1, 70]]));
    expect(cov.map((c) => c.short)).toEqual([false, true, true]);
    expect(cov[2]!.done).toBe(0);
  });
  it('coach_prep and the sideline tier; reviewing a delegated plan raises prep', () => {
    expect(sidelineTier(coachPrep(0, 1, 0))).toBe('summary');
    expect(coachPrep(0, 1, 0.5)).toBe(0.5);
    expect(sidelineTier(coachPrep(1, 0, 0))).toBe('full');
  });
  it('report_up is clamped 5..95% and falls when a coach protects his room', () => {
    const rec = { trust: 100, respect: 50, familiarity: 50, roleBelief: 50 };
    expect(reportUp(80, rec)).toBe(0.95);
    expect(reportUp(0, { ...rec, trust: 0 })).toBe(0.05);
    const low = { ...rec, trust: 30 };
    expect(reportUp(60, low, { coachBond: 80, buyInToHeadCoach: 50, weeksBondLow: 0 })).toBeLessThan(reportUp(60, low));
  });
});

describe('L4.4 leaving', () => {
  it('for a promotion the refuse choice is present and marked; lateral refusal is legal', () => {
    const promo = requestOptions('promotion', PRO_RULES);
    expect(promo.map((o) => o.choice)).toEqual(['grant', 'refuse', 'counter']);
    expect(promo.find((o) => o.choice === 'refuse')).toMatchObject({ violation: true, ruleText: 'staff.permission.promotion' });
    expect(requestOptions('lateral', PRO_RULES).find((o) => o.choice === 'refuse')!.violation).toBe(false);
    expect(requestOptions('promotion', COLLEGE_RULES).find((o) => o.choice === 'refuse')!.violation).toBe(false);
  });
  const ties = computeTies([row(1, 10, 'job:pro.head_coach', 2016, null), row(2, 10, 'job:pro.coordinator.offense', 2016, null), row(3, 10, 'job:pro.position_coach.qb', 2016, null), row(4, 10, 'job:pro.analyst', 2026, null)], D0);
  it('refusal: blocked-my-move memory of strength 50 plus witness copies to ties above 60', () => {
    const m = refusalMemories(3, 1, [1, 2, 3, 4], ties);
    expect(m[0]).toMatchObject({ holderId: 3, sign: -1, strength: 50 });
    expect(m.slice(1).map((x) => x.holderId)).toEqual([2]);
  });
  it('a departing position coach costs trusting players role belief and resets the bond', () => {
    const d = departure([{ personId: 1, trustInCoach: 61, roleBeliefToStaff: 50 }, { personId: 2, trustInCoach: 60, roleBeliefToStaff: 50 }], null);
    expect(d.players.map((p) => p.roleBeliefToStaff)).toEqual([45, 50]);
    expect(d.coachBond).toBe(40);
    expect(passedOver(5, [{ personId: 5, wantsAdvancement: true }, { personId: 6, wantsAdvancement: true }, { personId: 7, wantsAdvancement: false }])).toEqual([6]);
  });
  it('firing: witness memories neutral after a seen pattern, negative for blame-shifting', () => {
    expect(firingMemories(2, 1, [1, 2, 3, 4], ties, { documentedFailures: 2, roomTunedOut: false }).map((m) => m.sign)).toEqual([0]);
    expect(firingMemories(2, 1, [1, 2, 3, 4], ties, { documentedFailures: 0, roomTunedOut: false }).map((m) => [m.holderId, m.sign])).toEqual([[3, -1]]);
  });
  it('no outcome variable reads "recently fired a coach" (L4.4.2 acceptance)', () => {
    const dir = join(__dirname, '../../src/staff');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/recently_?fired|firedRecently|firingBounce/i);
  });
});

describe('Violations go through the one L8.2.5 pipeline', () => {
  const ctx = { actor: { personId: 1, role: 'head_coach' as const, teamId: 10, origin: 'user' as const }, date: D0, competitionId: 1, tier: 1 as const, source: 'user' as const };
  const sink = { n: 0, append(_d: Omit<WorldEvent, 'id' | 'notability'>) { this.n += 1; return this.n; } };
  it('tampering with another club\'s coach writes one row; requested classes are refused cleanly until added', () => {
    const r = compliance.commitAct(compliance.emptyCompliance(), tamperingAct(ctx, 0.5), ruleSet({}), sink);
    expect(r.ok).toBe(true);
    const b = compliance.commitAct(compliance.emptyCompliance(), interviewBlockAct(ctx, 0.5), ruleSet({}), sink);
    expect(b).toMatchObject({ ok: false, reason: 'unknown_class' });
  });
});

describe('L4.5.1 recruiter slots', () => {
  it('naming more recruiters than the cap is allowed and flagged; head coach must hold one', () => {
    const limits = limitsFrom({ 'staff.offcampus_recruiters_max': 11, 'staff.grad_assistants_max': 4, 'staff.strength_staff_max': 5, 'staff.student_assistants_max': 11 });
    let staff = generateStaff({ teamId: 2, level: 'college', band: 'top', limits, firstSeatId: 1, date: D0 });
    for (const s of staff.seats) staff = fillSeat(staff, s.seatId, 2000 + s.seatId, D0);
    expect(recruiterSlots(staff).length).toBe(11);
    const extra = staff.seats.find((s) => !s.recruitsOffCampus && s.positionId === 'pos:analyst')!;
    const r = setRecruiterSlot(staff, extra.seatId, true, limits);
    expect(r.overCap).toBe(true);
    expect(recruitsWithoutSlot(staff, extra.holderPersonId!)).toBe(true);
    expect(setRecruiterSlot(staff, headCoachSeat(staff).seatId, false, limits).headCoachMissing).toBe(true);
  });
});

describe('L4.6.1 chaplain', () => {
  const people = [
    { personId: 1, disposition: 0.8, stressPastBreakpoint: true, trustInChaplain: 70 },
    { personId: 2, disposition: -0.5, stressPastBreakpoint: false, trustInChaplain: 0 },
    { personId: 3, disposition: null, stressPastBreakpoint: false, trustInChaplain: 0 },
    ...Array.from({ length: 6 }, (_, i) => ({ personId: 10 + i, disposition: 0.3, stressPastBreakpoint: false, trustInChaplain: 20 })),
  ];
  it('no chaplain: nothing happens and no early warning', () => {
    const w = chapelWeek(defaultChaplain(), people);
    expect(w.attendees).toEqual([]); expect(w.earlyWarning).toBe(false);
  });
  it('voluntary attendance, rough count, per-person pressure, imported people neutral', () => {
    const setup = { ...defaultChaplain(), holderPersonId: 99 };
    const w = chapelWeek(setup, people);
    expect(w.attendees).toEqual([1, 10, 11, 12, 13, 14, 15]);
    expect(w.shownCount % 5).toBe(0);
    expect(w.earlyWarning).toBe(true);
    expect(w.pressure.size).toBe(0);
    const pushed = chapelWeek({ ...setup, coachLedPrayer: true }, people);
    expect(pushed.pressure.get(1)).toBeGreaterThan(0);
    expect(pushed.pressure.get(2)).toBeLessThan(0);
    expect(pushed.pressure.has(3)).toBe(false);
    expect(attendanceMisuse(true, true)).toEqual(['grievance', 'school_complaint']);
    expect(attendanceMisuse(false, true)).toEqual([]);
  });
});

describe('Module surface', () => {
  it('declares its params and rule keys, and every event type is open to imported people', () => {
    expect(PARAMS.params.every((p) => p.belongsTo === 'career.staff')).toBe(true);
    expect(RULE_KEYS.every((k) => k.key.startsWith('hiring.'))).toBe(true);
    expect(STAFF_EVENT_TYPES.every((t) => t.importedAllowed && t.harmClass !== 'personal' && t.harmClass !== 'harmful')).toBe(true);
  });
});
