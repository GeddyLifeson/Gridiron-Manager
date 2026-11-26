// G-36 recruiting: one test per T4 acceptance line the module owns. Rule values are fixtures (fixtures.ts).
import { describe, expect, it } from 'vitest';
import {
  academicFraud, addEvidence, bumpEdge, edgeOf, breachesOf, decommitHazard, finalRuling, gradeOf, generateClass, generateJucoClass, hostOfficialVisit,
  jucoSeasonsLeft, makeOffer, meetsTransferRule, negativeClaim, numbersBoard, poolUse, previewAct, prospectPage, qualifies,
  queueByHand, readAcademics, recruiterLeaves, refuseCommitment, rosterLimitCheck, settleClaims, takeAct, takeLook, tieOf,
  trueInterest, trueStanding, withdrawOffer, circleRead, statement, nameRecruiters, prospectWeek, toJucoPool,
  TRUTH_FIELDS, VISIT_BLOCKS, P,
  type Prospect, type RecruitingState, type VisitPlan,
} from '../../src/recruiting/index.ts';
import { D, RULES_2026, circleIds, context, factory, freshState, hook, makePrograms, rs } from './fixtures.ts';

function world(n = 3, seed = 7) {
  const programs = makePrograms(n);
  const { ctx, facts } = context(programs, seed);
  const state = freshState();
  const req = { classYear: 2027, programs: n, topPrograms: n, favourites: programs.map((p) => ({ teamId: p.teamId, weight: p.prestige })), advisersAllowed: true };
  const hs = generateClass(state, req, factory(3), circleIds(), ctx.rng);
  return { programs, ctx, facts, state, hs, h: hook(), req };
}
const first = (s: RecruitingState): Prospect => Object.values(s.prospects).find((p) => p.source === 'high_school')!;
const act = (kind: 'contact_off_campus' | 'evaluation' | 'call' | 'message' | 'official_visit' | 'unofficial_visit', prospectId: number, day: string, teamId = 1, staffId = 101) =>
  ({ kind, teamId, staffId, prospectId, day: D(day) }) as const;

describe('T4.1.1 prospect pool', () => {
  it('star tiers at real size are within 20 percent of the 2026 class counts', () => {
    const programs = makePrograms(136);
    const { ctx } = context(programs);
    const state = freshState();
    const hs = generateClass(state, { classYear: 2027, programs: 136, topPrograms: 136, favourites: [], advisersAllowed: true }, factory(), circleIds(), ctx.rng);
    const five = hs.filter((p) => p.publicStars === 5).length;
    const four = hs.filter((p) => p.publicStars === 4).length;
    expect(Math.abs(five - P('stars.fiveNational'))).toBeLessThanOrEqual(0.2 * P('stars.fiveNational'));
    expect(Math.abs(four - P('stars.fourNational'))).toBeLessThanOrEqual(0.2 * P('stars.fourNational'));
    expect(hs.length).toBe(Math.round(P('pool.classPerProgram') * 136 * P('pool.oversize')));
  });
  it('is deterministic for a seed', () => {
    const a = world(); const b = world();
    expect(a.hs.map((p) => [p.region, p.position, p.publicStars])).toEqual(b.hs.map((p) => [p.region, p.position, p.publicStars]));
  });
});

describe('T4.2.1 calendar and contact rules', () => {
  it('a contact in the dead period warns, gives its normal effect and writes exactly one log row', () => {
    const { ctx, state, h } = world();
    const p = first(state);
    const a = act('contact_off_campus', p.personId, '2026-11-30');
    const party = h.party(a.staffId, a.teamId);
    const pre = previewAct(state, ctx, a, party);
    expect(pre.breaches.map((b) => b.rule)).toContain('contact_out_of_period');
    expect(pre.warning).not.toBeNull();
    const before = tieOf(state, p.personId, 1).impression;
    const r = takeAct(state, ctx, h, a);
    expect(r.logId).not.toBeNull();
    expect(state.violations).toHaveLength(1);
    expect(tieOf(state, p.personId, 1).impression).toBeGreaterThan(before);
  });
  it('nothing is disabled: an in-period legal contact has no warning', () => {
    const { ctx, state, h } = world();
    const p = first(state);
    const a = act('contact_off_campus', p.personId, '2027-01-18');
    expect(previewAct(state, ctx, a, h.party(101, 1)).warning).toBeNull();
    expect(takeAct(state, ctx, h, a).logId).toBeNull();
  });
  it('a second contact in one week and a seventh contact overall break the limits', () => {
    const { ctx, state, h } = world();
    const p = first(state);
    takeAct(state, ctx, h, act('contact_off_campus', p.personId, '2027-01-18'));
    expect(breachesOf(state, ctx, act('contact_off_campus', p.personId, '2027-01-20')).map((b) => b.rule)).toContain('weekly_contact_limit');
    tieOf(state, p.personId, 1).offCampusContacts = 6;
    expect(breachesOf(state, ctx, act('contact_off_campus', p.personId, '2027-01-26')).map((b) => b.rule)).toContain('total_contact_limit');
  });
  it('a contact before the class start date breaks the start-date rule', () => {
    const { ctx, state } = world();
    expect(breachesOf(state, ctx, act('contact_off_campus', first(state).personId, '2026-01-10')).map((b) => b.rule)).toContain('contact_before_start_date');
  });
});

describe('T4.2.2 staff limits', () => {
  it('the fall evaluation pool resets on 2026-09-01 to its rule value', () => {
    const { ctx, state, h } = world();
    const p = first(state);
    takeAct(state, ctx, h, act('evaluation', p.personId, '2026-04-20'));
    const fall = poolUse(state, ctx, 1, 'eval_fall', D('2026-09-01'));
    expect(fall).toEqual({ used: 0, size: RULES_2026['recruiting.eval_days_fall'] });
  });
  it('naming more seats than allowed breaks the seat rule; an unnamed coach has no seat', () => {
    const { ctx, state } = world();
    expect(nameRecruiters(state, ctx, 1, Array.from({ length: 12 }, (_, k) => 100 + k), D('2026-09-02')).map((b) => b.rule)).toEqual(['offcampus_seats_exceeded']);
    nameRecruiters(state, ctx, 1, [101], D('2026-09-02'));
    expect(breachesOf(state, ctx, act('evaluation', first(state).personId, '2026-09-02', 1, 105)).map((b) => b.rule)).toContain('no_offcampus_seat');
  });
  it('the 2027 model counts opportunities: the fifth spring one breaks the limit, and the head coach may not go out in spring', () => {
    const { ctx, state } = world();
    const p = first(state);
    tieOf(state, p.personId, 1).oppsSpring = 4;
    expect(breachesOf(state, ctx, act('evaluation', p.personId, '2027-04-20')).map((b) => b.rule)).toContain('opportunities_exceeded');
    expect(breachesOf(state, ctx, act('evaluation', p.personId, '2027-04-27', 1, 100)).map((b) => b.rule)).toContain('head_coach_spring_offcampus');
  });
});

describe('T4.3.1 evaluation', () => {
  it('a full film look narrows production by its share, a repeat by half as much, and a camp measures', () => {
    const { ctx, state } = world();
    const p = first(state);
    const w0 = gradeOf(state, 1, p.personId).band.production;
    const opts = { skill: 0.5, competition: 1, byPositionCoach: false };
    takeLook(state, ctx, 1, p.personId, 'full_film', D('2026-04-20'), opts);
    const w1 = gradeOf(state, 1, p.personId).band.production;
    expect(w1).toBeCloseTo(w0 * (1 - P('look.filmNarrow')));
    takeLook(state, ctx, 1, p.personId, 'full_film', D('2026-04-21'), opts);
    expect(gradeOf(state, 1, p.personId).band.production).toBeCloseTo(w1 * (1 - P('look.filmNarrow') / 2));
    const g = takeLook(state, ctx, 1, p.personId, 'camp', D('2026-06-10'), opts);
    expect(g.measured?.heightIn).toBe(p.heightIn);
    expect(Math.abs(g.measured!.fortyS - p.fortyS)).toBeLessThanOrEqual(P('look.campTimingError'));
  });
  it('a prospect can be queued by hand whatever his grade', () => {
    const { state } = world();
    queueByHand(state, 1, first(state).personId);
    expect(state.boards[1]!.queue).toContain(first(state).personId);
  });
});

describe('T4.4 relationships, reads and negative recruiting', () => {
  it('the staff read does not change without evidence, and the circle is unknown before contact', () => {
    const { ctx, state } = world();
    const p = first(state);
    expect(circleRead(state, 1, p.personId)).toHaveLength(0);
    makeOffer(state, ctx, 2, p.personId, D('2026-09-02'), true);
    expect(state.boards[1]?.reads[p.personId]?.standing ?? 'unknown').toBe('unknown');
  });
  it('a statement is evidence that moves the read; the read model shows no truth', () => {
    const { ctx, state } = world();
    const p = first(state);
    addEvidence(state, 1, p.personId, statement(state, ctx, p.personId, 1, 101, p.personId, 'said_to_recruiter', D('2026-09-02'), 0));
    expect(state.boards[1]!.reads[p.personId]!.evidence.length).toBeGreaterThan(0);
    const page = prospectPage(state, 1, p.personId)!;
    for (const f of TRUTH_FIELDS) expect(JSON.stringify(page)).not.toContain(`"${f}"`);
  });
  it('removing the recruiter lowers interest and raises the decommitment chance', () => {
    const { ctx, state, h } = world();
    const p = first(state);
    takeAct(state, ctx, h, act('contact_off_campus', p.personId, '2027-01-18'));
    const t = tieOf(state, p.personId, 1);
    const before = trueInterest(state, ctx, p.personId, 1);
    state.status[p.personId] = { ...state.status[p.personId]!, status: 'committed', teamId: 1, sinceDay: D('2027-01-18') };
    const h0 = decommitHazard(state, ctx, p.personId, D('2027-01-19'));
    recruiterLeaves(state, 1, t.recruiterId!, D('2027-01-19'), 2);
    expect(trueInterest(state, ctx, p.personId, 1)).toBeLessThan(before);
    expect(decommitHazard(state, ctx, p.personId, D('2027-01-20'))).toBeGreaterThan(h0);
  });
  it('a negative claim writes no compliance row; a false claim found out costs the speaker', () => {
    const { ctx, state } = world();
    const p = first(state);
    const self = p.circle.find((m) => m.relation === 'self')!;
    bumpEdge(state, 101, self.memberId, 50, D('2026-09-01'));
    const id = negativeClaim(state, ctx, { speakerTeamId: 1, speakerId: 101, rivalTeamId: 2, prospectId: p.personId, topic: 'playingTime', isTrue: false, day: D('2026-09-02') });
    expect(state.violations).toHaveLength(0);
    for (let w = 0; w < 200 && !state.claims.find((c) => c.id === id)!.settled; w++) settleClaims(state, ctx, D('2026-09-09') + 7 * w, () => false);
    expect(state.claims.find((c) => c.id === id)!.settled).toBe(true);
    expect(edgeOf(state, 101, self.memberId)).toBeLessThan(50);
  });
});

describe('T4.4.4 and T4.4.5 offers', () => {
  it('withdrawing an offer writes no warning or row, costs standing with the high school coach, and is refused after signing', () => {
    const { ctx, state } = world();
    const p = first(state);
    const coach = p.circle.find((m) => m.relation === 'hs_coach')!;
    bumpEdge(state, 100, coach.memberId, 50, D('2026-09-01'));
    makeOffer(state, ctx, 1, p.personId, D('2026-09-02'), true);
    expect(withdrawOffer(state, ctx, 1, p.personId, D('2026-10-01'), 'head_coach_call', 'chosen')).toEqual({ ok: true });
    expect(state.violations).toHaveLength(0);
    expect(edgeOf(state, 100, coach.memberId)).toBeLessThan(50);
    makeOffer(state, ctx, 1, p.personId, D('2026-10-02'), true);
    state.status[p.personId] = { ...state.status[p.personId]!, status: 'signed', teamId: 1, signedDay: D('2026-12-02') };
    expect(withdrawOffer(state, ctx, 1, p.personId, D('2026-12-10'), 'head_coach_call', 'chosen')).toEqual({ ok: false, reason: 'signed' });
  });
  it('another school contacting a signed prospect breaks a rule', () => {
    const { ctx, state } = world();
    const p = first(state);
    state.status[p.personId] = { ...state.status[p.personId]!, status: 'signed', teamId: 1, signedDay: D('2026-12-02') };
    expect(breachesOf(state, ctx, act('call', p.personId, '2027-01-18', 2, 201)).map((b) => b.rule)).toContain('contact_signed_prospect');
  });
  it('refusing a commitment on a non-committable offer leaves a memory with the prospect and coach', () => {
    const { ctx, state } = world();
    const p = first(state);
    refuseCommitment(state, ctx, 1, p.personId, D('2026-10-01'));
    expect(state.memory.filter((m) => m.kind === 'commitment_refused').length).toBeGreaterThanOrEqual(2);
  });
});

describe('T4.5.1 visits', () => {
  const plan = (hours: number, paidCompanions: number): VisitPlan => ({ blocks: [...VISIT_BLOCKS], hours, paidCompanions, hostId: 1, hostUnhappy: false, inducement: false });
  it('a second official visit, over 48 hours, or extra paid companions break rules; a new head coach allows a second', () => {
    const { ctx, facts, state, h } = world();
    const p = first(state);
    const day = '2026-09-12';
    const ok = hostOfficialVisit(state, ctx, h, 1, 100, p.personId, D(day), plan(48, 2));
    expect(ok.breaches).toHaveLength(0);
    const second = hostOfficialVisit(state, ctx, h, 1, 100, p.personId, D('2026-10-03'), plan(60, 3));
    const rules = second.breaches.map((b) => b.rule);
    expect(rules).toEqual(expect.arrayContaining(['second_official_visit', 'visit_too_long', 'paid_companions']));
    facts.fire(1, D('2026-10-05'), 199);
    expect(hostOfficialVisit(state, ctx, h, 1, 199, p.personId, D('2026-10-17'), plan(48, 2)).breaches.map((b) => b.rule)).not.toContain('second_official_visit');
  });
});

describe('T4.5.2 commitment and signing', () => {
  it('a head coach change multiplies the decommitment chance at least threefold', () => {
    const { ctx, facts, state } = world();
    const p = first(state);
    state.status[p.personId] = { ...state.status[p.personId]!, status: 'committed', teamId: 1, sinceDay: D('2026-08-01') };
    tieOf(state, p.personId, 1).lastContactDay = D('2026-10-10');
    const before = decommitHazard(state, ctx, p.personId, D('2026-10-14'));
    facts.fire(1, D('2026-10-13'), 199);
    expect(decommitHazard(state, ctx, p.personId, D('2026-10-14'))).toBeGreaterThanOrEqual(3 * before);
  });
  it('a prospect commits only to a school holding an offer', () => {
    const { ctx, state } = world();
    const s = prospectWeek(state, ctx, 2027, D('2026-09-02'), () => true);
    expect(s.commits).toBe(0);
  });
});

describe('T4.5.3 academics and T4.1.2 junior college', () => {
  it('qualification follows the rule-year values; a missing key applies no test', () => {
    const { state } = world();
    const p = first(state);
    const a = p.academics;
    a.coreCourses = 16; a.coreGpa = 2.3; a.coreBeforeFinalYear = 10; a.coreBeforeFinalYearEms = 7;
    expect(qualifies(rs(RULES_2026), p)).toBe(true);
    a.coreGpa = 2.2;
    expect(qualifies(rs(RULES_2026), p)).toBe(false);
    const { ['college.initial_eligibility.core_gpa']: _drop, ...noGpa } = RULES_2026;
    expect(qualifies(rs(noGpa), p)).toBe(true);
  });
  it('the final ruling moves non-qualifiers out of the class, and they can enter the junior college pool', () => {
    const { ctx, state } = world();
    const p = first(state);
    p.academics.coreGpa = 1.5;
    state.status[p.personId] = { ...state.status[p.personId]!, status: 'signed', teamId: 1, signedDay: D('2026-12-02') };
    expect(finalRuling(state, ctx, 2027, D('2027-07-15'))).toEqual([p.personId]);
    expect(toJucoPool(state, p.personId, 2029)?.source).toBe('juco');
  });
  it('the transfer rule and seasons left', () => {
    const r = rs(RULES_2026);
    const nq = { qualifierOutOfHighSchool: false, fullTimeTerms: 3, transferableHours: 48, transferGpa: 2.0, graduated: true, seasonsUsed: 2 };
    expect(meetsTransferRule(r, nq)).toBe(true);
    expect(meetsTransferRule(r, { ...nq, graduated: false })).toBe(false);
    expect(meetsTransferRule(r, { ...nq, transferGpa: 1.9 })).toBe(false);
    expect(meetsTransferRule(r, { ...nq, qualifierOutOfHighSchool: true, fullTimeTerms: 1, transferableHours: 12 })).toBe(true);
    expect(jucoSeasonsLeft(r, nq)).toBe(3);
  });
  it('the staff academic read uses the transcript, and academic fraud writes one row', () => {
    const { ctx, state, h } = world();
    const p = first(state);
    p.academics.coreGpa = 3.5;
    expect(readAcademics(state, ctx, 1, p.personId, D('2026-09-02'), 'transcript')).toBe('on_track');
    expect(academicFraud(state, ctx, h, 1, 101, p.personId, D('2026-09-02'))).not.toBeNull();
    expect(state.violations).toHaveLength(1);
  });
  it('junior college class is generated with transfer records', () => {
    const { ctx, state, req } = world();
    const j = generateJucoClass(state, req, factory(4), circleIds(), ctx.rng);
    expect(j.length).toBeGreaterThan(0);
    expect(j.every((p) => p.source === 'juco' && p.juco !== null)).toBe(true);
  });
});

describe('T4.8 numbers and the roster limit', () => {
  it('the numbers board total is returning plus incoming plus walk-ons and never refuses', () => {
    const { ctx, state } = world();
    const b = numbersBoard(state, ctx, 1, 2027, D('2026-09-02'), 5);
    expect(b.total).toBe(b.returning + b.incoming + 5);
    expect(b.limit).toBe(105);
  });
  it('over the limit writes a row only when the coach chose to stay over', () => {
    const { ctx, state, h } = world();
    expect(rosterLimitCheck(state, ctx, h, 1, 100, D('2026-08-15'), 110, false)).toEqual({ over: 5, logId: null });
    expect(rosterLimitCheck(state, ctx, h, 1, 100, D('2026-08-15'), 110, true).logId).not.toBeNull();
    expect(state.violations).toHaveLength(1);
  });
});

void trueStanding;
