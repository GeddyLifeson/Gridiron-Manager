import { describe, expect, it } from 'vitest';
import { compliance } from '@gm/league';
import type { RuleSet } from '@gm/schema';
import {
  weeklyRequestChance, tooCloseToKickoff, drawRequest, decideRequest, foundationYear,
  answerClips, standardLearned, startingAwareness, afterOfficialsMeeting, afterCrewPractice, foulHazardMultiplier, emphasisFactor, staffAdviceErrorChance,
  documentaryPublicShare, documentaryAccessOrders, conversationOnCamera, drawDocumentaryClub, disciplineBody, conferenceSanction, priorConductFindings, CONFERENCE_KEYS,
  severityAtDetection, pipelineResponse, responseConsequences, restrictionsFrom, activeRestrictions, interviewOutcome, rowsAnswerableAsInterim,
  invitationCount, attendClinic, type CommunityRequest, type DecisionContext, type ClinicInvitation,
} from '../../src/community/index.ts';
import type { Order } from '../../src/crisis/index.ts';
import { day, ruleSet, streams } from '../crisis/fixtures.ts';

/** Order kinds that touch only relationships, time, mood, ties, notices: never an attribute, culture value or contest. */
const RELATIONSHIP_KINDS = new Set(['memory', 'group_memory', 'hours', 'fan_mood', 'booster_mood', 'standing_with_boss', 'tie', 'familiarity', 'notice', 'notability', 'scouting_note']);

describe('L8.1.1 community events', () => {
  it('runs one a month in season and two out of season, as a weekly chance', () => {
    expect(weeklyRequestChance(true)).toBeCloseTo(12 / compliance.weeksPerYear(), 10);
    expect(weeklyRequestChance(false)).toBeCloseTo(24 / compliance.weeksPerYear(), 10);
  });
  it('never lands inside the 24 hours before kickoff, and a crisis week suppresses requests', () => {
    expect(tooCloseToKickoff(day(10), day(10))).toBe(true);
    expect(tooCloseToKickoff(day(9), day(10))).toBe(true);
    expect(tooCloseToKickoff(day(7), day(10))).toBe(false);
    const askers = [{ kind: 'owner' as const, personId: 1 }];
    let n = 0;
    for (let w = 0; w < 400; w++) {
      if (drawRequest(1, day(w % 300), { inSeason: false, crisisThisWeek: true, nextKickoff: null }, askers, streams(2))) n++;
    }
    expect(n).toBe(0);
    for (let w = 0; w < 400; w++) {
      const r = drawRequest(1, day(w % 300), { inSeason: true, crisisThisWeek: false, nextKickoff: day((w % 300) + 3) }, askers, streams(2));
      if (r) expect(tooCloseToKickoff(r.date, day((w % 300) + 3))).toBe(false);
    }
  });
  const req = (over: Partial<CommunityRequest> = {}): CommunityRequest => ({ id: 'r', teamId: 1, asker: { kind: 'owner', personId: 2 }, date: day(5), minutes: 120, playerCharity: false, ...over });
  const ctx = (over: Partial<DecisionContext> = {}): DecisionContext => ({ coachId: 9, coachIsHeadCoach: true, standInId: 8, ownerValuesPresence: true, ownerDeclinesThisSeason: 0, ...over });
  it('attending charges its hours and writes only fan mood and a memory', () => {
    const { orders } = decideRequest(req(), 'attend', ctx());
    expect(orders).toContainEqual({ kind: 'hours', personId: 9, minutes: 120, what: 'community:r' });
    expect(orders).toContainEqual({ kind: 'fan_mood', teamId: 1, delta: 0.5 });
    expect(orders.some((o) => o.kind === 'memory' && o.amount === 2)).toBe(true);
    expect(orders.every((o) => RELATIONSHIP_KINDS.has(o.kind))).toBe(true);
  });
  it('a player\'s own charity event is a personal kindness with a 52-week half-life', () => {
    const { orders } = decideRequest(req({ asker: { kind: 'player', personId: 30 }, playerCharity: true }), 'attend', ctx());
    expect(orders).toContainEqual({ kind: 'memory', holderId: 30, aboutId: 9, memoryClass: 'personal_kindness', amount: 6, halfLifeWeeks: 52, sourceEventId: null });
  });
  it('a stand-in keeps half the effect, in his own name', () => {
    const { orders } = decideRequest(req(), 'stand_in', ctx());
    expect(orders).toContainEqual({ kind: 'fan_mood', teamId: 1, delta: 0.25 });
    expect(orders.some((o) => o.kind === 'memory' && o.aboutId === 8 && o.amount === 1)).toBe(true);
  });
  it('declining costs one, or four on the third decline of an owner who values presence', () => {
    expect(decideRequest(req(), 'decline', ctx({ ownerDeclinesThisSeason: 0 })).orders[0]).toMatchObject({ amount: -1 });
    expect(decideRequest(req(), 'decline', ctx({ ownerDeclinesThisSeason: 2 })).orders[0]).toMatchObject({ amount: -4 });
    expect(decideRequest(req(), 'decline', ctx({ ownerDeclinesThisSeason: 2, ownerValuesPresence: false })).orders[0]).toMatchObject({ amount: -1 });
    expect(decideRequest(req(), 'move', ctx()).orders).toEqual([]);
  });
  it('a foundation writes one notability event a year', () => {
    expect(foundationYear(9, 1)).toMatchObject({ kind: 'notability', what: 'foundation' });
  });
});

describe('L8.3.1 clip submissions', () => {
  it('answers from the truth record at the honest share and never more than five', () => {
    const plays = Array.from({ length: 5 }, (_, i) => ({ playId: i + 1, callWasRight: false, foulType: 'holding' }));
    let incorrect = 0;
    let total = 0;
    for (let g = 0; g < 400; g++) {
      const { answers } = answerClips(1, g, plays, 'league', 77, streams(9));
      incorrect += answers.filter((a) => a.verdict === 'incorrect_call').length;
      total += answers.length;
      expect(answers.every((a) => a.verdict !== 'correct_call')).toBe(true);
    }
    expect(incorrect / total).toBeGreaterThan(0.81);
    expect(incorrect / total).toBeLessThan(0.89);
    const right = answerClips(1, 1, [{ playId: 1, callWasRight: true, foulType: null }], 'conference', null, streams(9));
    expect(right.answers[0]).toEqual({ playId: 1, verdict: 'correct_call', foulType: null, recipient: 'coordinator_of_officials' });
    expect(() => answerClips(1, 1, [...plays, plays[0]!], 'league', 77, streams(9))).toThrow();
  });
  it('costs the quality control coach ten minutes a clip and yields only knowledge of the standard', () => {
    const r = answerClips(1, 1, [{ playId: 1, callWasRight: false, foulType: 'holding' }, { playId: 2, callWasRight: true, foulType: 'holding' }], 'league', 77, streams(9));
    expect(r.orders).toEqual([{ kind: 'hours', personId: 77, minutes: 20, what: 'clips:1' }]);
    expect(standardLearned(r.answers)).toEqual(['holding']);
  });
});

describe('L8.3.2 rule changes and points of emphasis', () => {
  it('awareness starts at 20, the officials add 15 and the crew practice 10 for players with reps', () => {
    expect(startingAwareness()).toBe(20);
    expect(startingAwareness(65)).toBe(65);
    expect(afterOfficialsMeeting(20)).toBe(35);
    expect(afterCrewPractice(35, true)).toBe(45);
    expect(afterCrewPractice(35, false)).toBe(35);
    expect(afterOfficialsMeeting(95)).toBe(100);
  });
  it('the foul multiplier is exactly 1 at awareness 100 and 1.2 at zero', () => {
    expect(foulHazardMultiplier(100)).toBe(1);
    expect(foulHazardMultiplier(0)).toBeCloseTo(1.2, 12);
    expect(foulHazardMultiplier(20)).toBeCloseTo(1.16, 12);
  });
  it('emphasis starts at 1.2 and falls to 1.0 by mid-season; skipped staff sessions mislead in the first four games', () => {
    expect(emphasisFactor(0)).toBeCloseTo(1.2, 12);
    expect(emphasisFactor(9)).toBe(1);
    expect(emphasisFactor(4)).toBeGreaterThan(1);
    expect(staffAdviceErrorChance(3, true, true)).toBe(0.1);
    expect(staffAdviceErrorChance(4, true, true)).toBe(0);
    expect(staffAdviceErrorChance(0, false, true)).toBe(0);
  });
});

describe('L8.3.3 league assignments', () => {
  it('cameras change routing only: standard 30, minimal 10 percent', () => {
    expect(documentaryPublicShare('standard')).toBe(0.3);
    expect(documentaryPublicShare('minimal')).toBe(0.1);
    let n = 0;
    for (let k = 0; k < 4000; k++) if (conversationOnCamera(1, k, 'standard', streams(3))) n++;
    expect(n / 4000).toBeGreaterThan(0.27);
    expect(n / 4000).toBeLessThan(0.33);
  });
  it('minimal access costs the owner\'s memory if he wanted exposure; open access lifts fan mood', () => {
    expect(documentaryAccessOrders(1, 'minimal', 9, 2, true)).toEqual([{ kind: 'memory', holderId: 2, aboutId: 9, memoryClass: 'refused_exposure', amount: -3, halfLifeWeeks: null, sourceEventId: null }]);
    expect(documentaryAccessOrders(1, 'minimal', 9, 2, false)).toEqual([]);
    expect(documentaryAccessOrders(1, 'open', 9, 2, true)).toEqual([{ kind: 'fan_mood', teamId: 1, delta: 3 }]);
  });
  it('the yearly draw picks among eligible clubs only, deterministically', () => {
    expect(drawDocumentaryClub([], 2026, streams(1))).toBeNull();
    const a = drawDocumentaryClub([5, 3, 9], 2026, streams(1));
    expect([3, 5, 9]).toContain(a);
    expect(drawDocumentaryClub([9, 5, 3], 2026, streams(1))).toBe(a);
  });
});

describe('L8.4.1 the conference office', () => {
  const tracking = (values: Record<string, number | string>) => {
    const read: string[] = [];
    const base = ruleSet(values);
    const rs: RuleSet = { ...base, num: (k) => { read.push(k); return base.num(k); }, opt: (k) => { read.push(k); return base.opt(k); } };
    return { rs, read };
  };
  it('falls back to the default tier when empty and reads no other key', () => {
    const { rs, read } = tracking({ 'compliance.work_rules_practice.fine_head_coach_first_cents': 1 });
    expect(conferenceSanction(0, rs)).toEqual({ kind: 'public_reprimand' });
    expect(conferenceSanction(1, rs)).toEqual({ kind: 'fine', cents: null });
    expect(conferenceSanction(2, rs)).toEqual({ kind: 'suspension', games: 1 });
    expect(read.every((k) => k.startsWith('conference_discipline.'))).toBe(true);
  });
  it('uses conference values when present and names the body from the rule set', () => {
    const { rs } = tracking({ [CONFERENCE_KEYS.fineCents]: 2_500_000, [CONFERENCE_KEYS.body]: 'conference' });
    expect(conferenceSanction(1, rs)).toEqual({ kind: 'fine', cents: 2_500_000 });
    expect(disciplineBody(rs)).toBe('conference');
    expect(disciplineBody(ruleSet({}))).toBe('league');
  });
  it('one record follows the coach between conferences', () => {
    const rec: compliance.LeagueRecordEntry[] = [
      { caseId: 1, rowId: 1, party: { kind: 'person', id: 9 }, classId: 'media_policy', severity: 'minor', date: day(0), repeat: false },
      { caseId: 2, rowId: 2, party: { kind: 'person', id: 9 }, classId: 'media_policy', severity: 'minor', date: day(0, 2027), repeat: true },
    ];
    expect(priorConductFindings(rec, 9, 'media_policy')).toBe(2);
  });
});

describe('L8.4.2 compliance responses and the restriction that follows a coach', () => {
  const row = (severity: 'major' | 'minor') => ({ id: 4, severity, date: day(10) });
  it('a minor self-report inside two weeks stays minor; found later it is major about 30 percent of the time', () => {
    expect(severityAtDetection(row('minor'), day(20), true, streams(1))).toBe('minor');
    expect(severityAtDetection(row('major'), day(20), true, streams(1))).toBe('major');
    let major = 0;
    for (let i = 0; i < 2000; i++) if (severityAtDetection({ ...row('minor'), id: i }, day(60), false, streams(1)) === 'major') major++;
    expect(major / 2000).toBeGreaterThan(0.26);
    expect(major / 2000).toBeLessThan(0.34);
  });
  it('maps responses onto the G-28 pipeline and charges their costs', () => {
    expect(pipelineResponse('cooperate')).toBe('cooperate');
    expect(pipelineResponse('minimise')).toBe('fight');
    const base = { caseId: 1, teamId: 1, coachId: 9, blamedId: 12, blameTrue: false, logsShowCoach: true };
    const blame = responseConsequences('blame_assistant', base, streams(1));
    expect(blame.addedPenalty).toBe(true);
    expect(blame.orders.some((o) => o.kind === 'group_memory' && o.memoryClass === 'lied_to_found_out')).toBe(true);
    expect(responseConsequences('blame_assistant', { ...base, blameTrue: true }, streams(1)).addedPenalty).toBe(false);
    expect(responseConsequences('cooperate', base, streams(1))).toEqual({ addedPenalty: false, orders: [] });
    let added = 0;
    for (let i = 0; i < 2000; i++) if (responseConsequences('minimise', { ...base, caseId: i }, streams(1)).addedPenalty) added++;
    expect(added / 2000).toBeGreaterThan(0.21);
    expect(added / 2000).toBeLessThan(0.29);
  });
  it('a show-cause order persists across a job change and is readable for its term', () => {
    const comp: compliance.ComplianceState = {
      ...compliance.emptyCompliance(),
      cases: [{ id: 3, teamId: 1, body: 'national_body', rowIds: [1], opened: day(0), resolveBy: day(100), response: 'cooperate', falseAccusation: false, status: 'closed', outcome: 'finding' }],
      orders: [{ caseId: 3, order: { kind: 'show_cause', personId: 9, years: 2 } }],
    };
    const r = restrictionsFrom(comp);
    expect(r).toEqual([{ personId: 9, kind: 'show_cause', caseId: 3, from: day(100), years: 2 }]);
    expect(activeRestrictions(r, 9, day(200, 2027))).toHaveLength(1);
    expect(activeRestrictions(r, 9, day(150, 2028))).toHaveLength(0);
    expect(activeRestrictions(r, 10, day(200, 2027))).toHaveLength(0);
  });
});

describe('L8.5.1 interviews below head coach', () => {
  const input = { userId: 5, bossId: 20, harmsBoss: true, bossLearns: true, logsContradict: true };
  it('the truth protects him and costs standing if it harms the boss and he learns of it', () => {
    const t = interviewOutcome('truth', input);
    expect(t.party).toBe(false);
    expect(t.orders).toEqual([{ kind: 'standing_with_boss', personId: 5, bossId: 20, delta: -15 }]);
    expect(interviewOutcome('truth', { ...input, bossLearns: false }).orders).toEqual([]);
  });
  it('covering makes him a party only when the logs contradict him', () => {
    expect(interviewOutcome('cover', input).party).toBe(true);
    expect(interviewOutcome('cover', { ...input, logsContradict: false }).party).toBe(false);
    expect(interviewOutcome('dont_know', { ...input, logsContradict: false }).party).toBe(false);
  });
  it('an interim promoted mid-case answers only for acts after his promotion', () => {
    const mk = (id: number, d: number): compliance.ViolationLogRow => ({ id, classId: 'recruiting_contact', actor: { personId: 1, role: 'head_coach', teamId: 1, origin: 'generated' }, orderedBy: null, knew: [], date: day(d), competitionId: null, gain: 0, severity: 'minor', certainTrace: false, actSourcesDrawn: false, caseId: null, eventId: id });
    expect(rowsAnswerableAsInterim([mk(1, 10), mk(2, 40)], day(30)).map((r) => r.id)).toEqual([2]);
  });
});

describe('L8.4.3 clinics', () => {
  const inv = (kind: ClinicInvitation['kind']): ClinicInvitation => ({ id: 1, kind, date: day(150), minutes: 480, attendeeIds: Array.from({ length: 40 }, (_, i) => 100 + i), highSchoolCoachIds: [500, 501] });
  it('every tie cites its dated source event; no order touches an attribute', () => {
    const r = attendClinic(9, inv('speak'), 4242, streams(6));
    const ties = r.orders.filter((o): o is Extract<Order, { kind: 'tie' }> => o.kind === 'tie');
    expect(ties.length).toBeGreaterThan(0);
    expect(ties.every((t) => t.sourceEventId === 4242 && t.strength === 20 && t.date.dayIndex === 150)).toBe(true);
    expect(r.orders.filter((o) => o.kind === 'familiarity')).toHaveLength(2);
    expect(r.orders.every((o) => RELATIONSHIP_KINDS.has(o.kind))).toBe(true);
  });
  it('a staff visit writes ties of 30 to that staff and hands over concepts as ideas only', () => {
    const r = attendClinic(9, { ...inv('visit'), attendeeIds: [1, 2, 3] }, 1, streams(6), { visitedConcepts: ['mesh'] });
    expect(r.orders.filter((o) => o.kind === 'tie')).toHaveLength(3);
    expect(r.conceptIdeas).toEqual(['mesh']);
  });
  it('sharing real detail gives opponents tied to an attendee one tendency note each', () => {
    const r = attendClinic(9, inv('speak'), 1, streams(6), { sharedConcept: 'sail', coachTeamId: 7, opponentTies: [{ teamId: 3, attendeeId: 100 }, { teamId: 3, attendeeId: 101 }, { teamId: 4, attendeeId: 999 }] });
    expect(r.orders.filter((o) => o.kind === 'scouting_note')).toEqual([{ kind: 'scouting_note', teamId: 3, aboutTeamId: 7, concept: 'sail' }]);
  });
  it('invitations follow visible history; a graduate assistant gets none to speak', () => {
    expect(invitationCount(0.1, true)).toBeGreaterThan(invitationCount(0.6, true));
    expect(invitationCount(0.1, false)).toBe(0);
  });
});
