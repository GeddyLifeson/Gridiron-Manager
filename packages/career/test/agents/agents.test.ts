// G-49 acceptance: holdouts and trade requests per L7.2; families as outside voices (L7.3); agents (L7.1);
// lower rungs (L7.4.1).
import { describe, expect, it } from 'vitest';
import { EventTypeDef, ParamFile, RuleKeyDef } from '@gm/schema';
import {
  AGENT_EVENT_TYPES, DEFAULT_DISCLOSURE, EVENT, PARAMS, RULE_KEYS, accruedSeasonLost, agentStance, agentView, answerCall, answerRepresentative,
  answerTradeRequest, assignRepresentation, assistantPromises, brokenPromiseCopies, campDayPosting, campFine, chooseOffer, clientOutcomeMemory,
  conflictFlag, contractYearMultipliers, familyActMemories, familyAdviceDelta, forfeitureMaxShare, guardFamilies, halfLifeFactor, holdinFine,
  holdinRoomMemories, holdoutWitnessMemories, hsAccess, hsCoachStance, interviewWeight, latePullMemories, memoryValueAfter, minicampMaxFine,
  pastAuthorityStanding, publicCriticismMemories, readinessLossShare, recruiterLeaves, representativesActive, returnTalk, routeWeeklyCalls,
  scheduleFrom, shareOptions, shareWithFamily, tradeRequestEvents, tradeRequestFires, tradeRequestVenue, tradeRequestWeek, waiveCampFine,
  withholdingChoice, type AgentRecord, type CallTrigger, type ContractClass, type FamilyMember, type Offer,
} from '../../src/agents/index.ts';
import { COLLEGE_2020, COLLEGE_2026, PRO, seeded } from './fixtures.ts';

const META = { date: { year: 2026, month: 8, day: 1 }, competitionId: null, tier: 1, source: 'sim' } as never;

describe('module contract', () => {
  it('PARAMS parse, names are unique, every row cites an L7 leaf', () => {
    ParamFile.parse(PARAMS);
    const names = PARAMS.params.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const p of PARAMS.params) expect(p.leaf).toMatch(/^L7\./);
  });
  it('RULE_KEYS are valid dictionary rows and event types parse', () => {
    for (const k of RULE_KEYS) RuleKeyDef.parse(k);
    for (const t of AGENT_EVENT_TYPES) EventTypeDef.parse(t);
  });
  it('family contact is a personal type that can never land on an imported person', () => {
    const t = AGENT_EVENT_TYPES.find((x) => x.id === EVENT.familyContact)!;
    expect(t.harmClass).toBe('personal');
    expect(t.importedAllowed).toBe(false);
  });
});

describe('L7.1.1 agents as people', () => {
  const agents: AgentRecord[] = [{ personId: 900, agencyId: 1, style: 20 }, { personId: 901, agencyId: 2, style: 85 }];
  it('every represented player has an agent or a self-represented flag; imported players get generated agents', () => {
    const players = Array.from({ length: 60 }, (_, i) => ({ playerId: i + 1, represented: true }));
    const reps = assignRepresentation(players, agents, seeded(1), 0.1);
    expect(reps).toHaveLength(60);
    for (const r of reps) expect(r.selfRepresented ? r.agentId === null : agents.some((a) => a.personId === r.agentId)).toBe(true);
    expect(reps.some((r) => r.selfRepresented)).toBe(true);
    expect(assignRepresentation([{ playerId: 1, represented: false }], agents, seeded(1))).toEqual([]);
  });
  it('no more than one agent call a week reaches the head coach; contract calls go first', () => {
    const triggers: CallTrigger[] = [
      { agentId: 900, clientId: 1, unmetRoleWeeks: 5, contractEventNear: false },
      { agentId: 901, clientId: 2, unmetRoleWeeks: 0, contractEventNear: true },
      { agentId: 900, clientId: 3, unmetRoleWeeks: 3, contractEventNear: false },
      { agentId: 900, clientId: 4, unmetRoleWeeks: 2, contractEventNear: false },
    ];
    const routed = routeWeeklyCalls(triggers);
    expect(routed).toHaveLength(3);
    expect(routed.filter((r) => r.routedTo === 'coach')).toEqual([{ agentId: 901, clientId: 2, reason: 'contract', routedTo: 'coach' }]);
    const delegated = routeWeeklyCalls(triggers, 'assistants_first');
    expect(delegated.filter((r) => r.routedTo === 'coach')).toHaveLength(0);
    expect(delegated.filter((r) => r.routedTo === 'assistant').map((r) => r.clientId)).toEqual([1, 3]);
  });
  it('a hopeful statement to an agent creates a full-strength promise ledger entry', () => {
    const ctx = { coachId: 10, agentId: 900, clientId: 1, gmId: 20, agentTrust: 50, reason: 'role' as const, statedRole: 'starter', byWeek: 8, gmOwnsAgentContact: false, gmAsked: false };
    const out = answerCall('hopeful', ctx, seeded(2));
    expect(out.promise).toMatchObject({ promiserId: 10, holderId: 1, about: 'role', statedRole: 'starter', byWeek: 8, strength: 1 });
    const honest = answerCall('honest', ctx, seeded(2));
    expect(honest.agentTrustDelta).toBe(3);
    expect(honest.promise).toBeNull();
    expect(Math.abs(honest.roleBeliefDelta)).toBeLessThanOrEqual(5);
    expect(honest.minutes).toBe(10);
  });
  it('honest answers advise patience about 60 percent of the time', () => {
    const d = seeded(3);
    const ctx = { coachId: 10, agentId: 900, clientId: 1, gmId: null, agentTrust: 50, reason: 'role' as const, gmOwnsAgentContact: false, gmAsked: false };
    let patient = 0;
    for (let i = 0; i < 2000; i++) if (answerCall('honest', ctx, d).advice === 'be_patient') patient++;
    expect(patient / 2000).toBeGreaterThan(0.56);
    expect(patient / 2000).toBeLessThan(0.64);
  });
  it('taking a contract call the general manager owns writes -3 with him unless he asked', () => {
    const ctx = { coachId: 10, agentId: 900, clientId: 1, gmId: 20, agentTrust: 50, reason: 'contract' as const, gmOwnsAgentContact: true, gmAsked: false };
    expect(answerCall('nothing', ctx, seeded(4)).memories).toEqual([{ holderId: 20, aboutId: 10, delta: -3, halfLifeWeeks: null, strength: 1, cause: 'took_agent_contract_call' }]);
    expect(answerCall('nothing', { ...ctx, gmAsked: true }, seeded(4)).memories).toEqual([]);
  });
});

describe('L7.1.2 reputation with agents', () => {
  it('stance is derived from trust plus half the client memories, bands 35/50/65', () => {
    expect(agentStance(60, 10)).toBe('favourable');
    expect(agentStance(50, 0)).toBe('neutral');
    expect(agentStance(40, 0)).toBe('wary');
    expect(agentStance(40, -20)).toBe('hostile');
  });
  it('the user view of an agent carries no trust, style or stance', () => {
    const v = agentView(900, [1], [55], [{ eventId: 7, kind: 'public_complaint', source: 'seen' }]);
    const keys = JSON.stringify(v);
    for (const banned of ['trust', 'style', 'stance', 'band']) expect(keys).not.toContain(banned);
  });
  it('a client paid more after playing here writes +10 with a 156-week half-life; a silent cut writes -15', () => {
    const paid = clientOutcomeMemory(900, 10, 'paid_more_after');
    expect(paid).toMatchObject({ delta: 10, halfLifeWeeks: 156 });
    expect(memoryValueAfter(paid, 156)).toBeCloseTo(5, 9);
    expect(memoryValueAfter(paid, 312)).toBeCloseTo(2.5, 9);
    expect(clientOutcomeMemory(900, 10, 'cut_without_word').delta).toBe(-15);
    expect(halfLifeFactor(0, 156)).toBe(1);
  });
  it('1,000 equal offers: a favourable agent wins more than half and never more than 65 percent', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const d = seeded(seed);
      const offers: Offer[] = [{ teamId: 1, value: 10_000_000, stance: 'favourable' }, { teamId: 2, value: 10_000_000, stance: 'neutral' }];
      let wins = 0;
      for (let i = 0; i < 1000; i++) if (chooseOffer(offers, d)!.teamId === 1) wins++;
      expect(wins).toBeGreaterThan(500);
      expect(wins).toBeLessThanOrEqual(650);
    }
  });
  it('stance gives no preference outside 5 percent of the best offer', () => {
    const d = seeded(16);
    const offers: Offer[] = [{ teamId: 1, value: 9_000_000, stance: 'favourable' }, { teamId: 2, value: 10_000_000, stance: 'hostile' }];
    let wins = 0;
    for (let i = 0; i < 1000; i++) if (chooseOffer(offers, d)!.teamId === 1) wins++;
    // Hostile stance is in band (best offer) and is cut 3 percent; favourable at -10 percent gets nothing.
    expect(wins / 1000).toBeLessThan(0.5);
  });
});

describe('L7.1.3 agencies', () => {
  it('shared agency changes interview selection only; the evaluation is identical', () => {
    const c = { personId: 5, agencyId: 3, evaluation: 71 };
    expect(interviewWeight(c, [3])).toBe(1.5);
    expect(interviewWeight(c, [4, null])).toBe(1);
    expect(c.evaluation).toBe(71);
    expect(conflictFlag(3, 3)).toBe(true);
    expect(conflictFlag(null, null)).toBe(false);
  });
});

describe('L7.2.1 contract years', () => {
  it('only need weights change: pay and security x1.5, playing time x1.2', () => {
    expect(contractYearMultipliers(true)).toEqual({ pay: 1.5, security: 1.5, playingTime: 1.2 });
    expect(contractYearMultipliers(false)).toEqual({ pay: 1, security: 1, playingTime: 1 });
  });
});

describe('L7.2.2 holdouts (2026 values)', () => {
  const a = { daysMissed: 10, preseasonGamesMissed: 2, weeklySalaryUsd: 100_000 };
  it('fines post from league data for each of the four contract classes', () => {
    expect(campFine(PRO, 'veteran', a)).toEqual({ dailyUsd: 600_000, salaryUsd: 0, totalUsd: 600_000, waivable: false });
    expect(campFine(PRO, 'ufa_signee', a)).toEqual({ dailyUsd: 600_000, salaryUsd: 200_000, totalUsd: 800_000, waivable: false });
    expect(campFine(PRO, 'rookie', a)).toEqual({ dailyUsd: 450_000, salaryUsd: 0, totalUsd: 450_000, waivable: true });
    expect(campFine(PRO, 'option_year', a)).toEqual({ dailyUsd: 450_000, salaryUsd: 200_000, totalUsd: 650_000, waivable: true });
    expect(campFine(PRO, 'unsigned', a).totalUsd).toBe(0);
    expect(campDayPosting(PRO, 'veteran', 1)).toBe(60_000);
  });
  it('a league without the rule posts nothing; a generated league scales every dollar', () => {
    expect(campFine(COLLEGE_2026, 'veteran', a).totalUsd).toBe(0);
    const scaled = scheduleFrom({ 'discipline.camp_absence_fine_usd.veteran': 60000, 'discipline.schedule_scale': 0.5 });
    expect(campFine(scaled, 'veteran', { ...a, daysMissed: 1 }).totalUsd).toBe(30_000);
  });
  it('minicamp maximums by day, day 3 and after at the day-3 value', () => {
    expect([1, 2, 3, 4].map((d) => minicampMaxFine(PRO, d))).toEqual([17986, 35973, 53952, 53952]);
  });
  it('waiving a mandatory fine is allowed and writes one violation; waivable classes write none', () => {
    for (const c of ['veteran', 'ufa_signee'] as const) expect(waiveCampFine(PRO, c)).toMatchObject({ allowed: true, violation: true });
    for (const c of ['rookie', 'option_year'] as const) expect(waiveCampFine(PRO, c)).toEqual({ allowed: true, violation: false, warning: null });
  });
  it('forfeiture: none for five days, 15 percent at six, +1 a day, never above 25 percent before the first game', () => {
    const share = (d: number) => forfeitureMaxShare(PRO, { campDaysMissed: d, missedFirstGame: false, regularWeeksMissed: 0 });
    expect(share(5)).toBe(0);
    expect(share(6)).toBeCloseTo(0.15, 12);
    expect(share(7)).toBeCloseTo(0.16, 12);
    for (let d = 0; d <= 60; d++) expect(share(d)).toBeLessThanOrEqual(0.25);
    const firstGame = forfeitureMaxShare(PRO, { campDaysMissed: 40, missedFirstGame: true, regularWeeksMissed: 1 });
    expect(firstGame).toBeCloseTo(0.25 + 0.25 * 0.75, 12);
    const week6 = forfeitureMaxShare(PRO, { campDaysMissed: 40, missedFirstGame: true, regularWeeksMissed: 6 });
    expect(week6).toBeCloseTo(0.4375 + 2 / 17, 12);
    expect(forfeitureMaxShare(PRO, { campDaysMissed: 40, missedFirstGame: true, regularWeeksMissed: 30 })).toBe(1);
  });
  it('a missed reporting date records no accrued season unless hardship is found', () => {
    expect(accruedSeasonLost(PRO, { underContract: true, reportedOnMandatoryDate: false, hardshipFound: false })).toBe(true);
    expect(accruedSeasonLost(PRO, { underContract: true, reportedOnMandatoryDate: false, hardshipFound: true })).toBe(false);
    expect(accruedSeasonLost(PRO, { underContract: false, reportedOnMandatoryDate: false, hardshipFound: false })).toBe(false);
  });
  it('trigger needs a contract, an unmet pay need, a non-favourable agent and gain above cost; dear holdouts become hold-ins', () => {
    const base = { contractClass: 'veteran' as ContractClass, breakpointFired: true, payNeedUnmet: true, agentStance: 'wary' as const, expectedGainUsd: 5e6, ruleCostUsd: 1e5, yearlyPayUsd: 1e7 };
    expect(withholdingChoice(base)).toBe('holdout');
    expect(withholdingChoice({ ...base, ruleCostUsd: 1e6 })).toBe('holdin');
    expect(withholdingChoice({ ...base, contractClass: 'unsigned' })).toBeNull();
    expect(withholdingChoice({ ...base, agentStance: 'favourable' })).toBeNull();
    expect(withholdingChoice({ ...base, breakpointFired: false })).toBeNull();
    expect(withholdingChoice({ ...base, expectedGainUsd: 1e4 })).toBeNull();
  });
  it('the room: +2 for teammates with a pay need, -3 for his room only after three weeks; public criticism -10/-4', () => {
    const mates = [
      { personId: 2, hasPayNeed: true, carriesHisSnaps: false, sharesHisAgent: false },
      { personId: 3, hasPayNeed: false, carriesHisSnaps: true, sharesHisAgent: true },
      { personId: 4, hasPayNeed: false, carriesHisSnaps: false, sharesHisAgent: false },
    ];
    expect(holdoutWitnessMemories(1, mates, 2).map((m) => [m.holderId, m.delta])).toEqual([[2, 2]]);
    expect(holdoutWitnessMemories(1, mates, 4).map((m) => [m.holderId, m.delta])).toEqual([[2, 2], [3, -3]]);
    expect(publicCriticismMemories(10, 1, mates).map((m) => [m.holderId, m.delta])).toEqual([[1, -10], [3, -4]]);
  });
  it('a return talk halves the negative memories and leaves positives alone', () => {
    const rows = returnTalk([{ holderId: 1, aboutId: 10, delta: -10, halfLifeWeeks: null, strength: 1, cause: 'x' }, { holderId: 1, aboutId: 10, delta: 4, halfLifeWeeks: null, strength: 1, cause: 'y' }]);
    expect(rows.map((r) => r.strength)).toEqual([0.5, 1]);
  });
});

describe('L7.2.3 hold-ins', () => {
  it('no fine for a present player; readiness at half; room turns only after a missed regular-season game', () => {
    expect(holdinFine()).toBe(0);
    expect(readinessLossShare('holdin')).toBe(0.5);
    expect(readinessLossShare('holdout')).toBe(1);
    expect(holdinRoomMemories(1, [1, 2, 3], 0)).toEqual([]);
    expect(holdinRoomMemories(1, [1, 2, 3], 1).map((m) => [m.holderId, m.delta])).toEqual([[2, -2], [3, -2]]);
  });
});

describe('L7.2.4 trade requests', () => {
  it('never fires below the stress breakpoint', () => {
    for (let s = 0; s <= 75; s++) expect(tradeRequestFires({ stress: s, loyalty: 0 })).toBe(false);
    expect(tradeRequestFires({ stress: 80, loyalty: 10 })).toBe(true);
    expect(tradeRequestFires({ stress: 80, loyalty: 60 })).toBe(false);
  });
  it('public when trust is under 30 or a combative agent is hostile; public makes one story and one room event', () => {
    expect(tradeRequestVenue(20, null, null)).toBe('public');
    expect(tradeRequestVenue(50, 90, 'hostile')).toBe('public');
    expect(tradeRequestVenue(50, 90, 'wary')).toBe('private');
    expect(tradeRequestVenue(50, 10, 'hostile')).toBe('private');
    const ev = tradeRequestEvents('public', 'agent', META, 7, 1, 10);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.type).toBe(EVENT.tradeRequestPublic);
    expect(ev[0]!.witnesses).toEqual({ kind: 'public' });
    const priv = tradeRequestEvents('private', 'player', META, 7, 1, 10);
    expect(priv[0]!.witnesses).toEqual({ kind: 'people', personIds: [1, 10] });
  });
  it('honest refusal costs 5; a role promise costs 30 if broken; passing to the GM is kept at once', () => {
    expect(answerTradeRequest('refuse_with_reason', 10, 1)).toEqual({ trustDelta: -5, promise: null, brokenCost: 0 });
    expect(answerTradeRequest('promise_role', 10, 1, 'starter', 9)).toMatchObject({ brokenCost: -30, promise: { about: 'role', keptAtOnce: false } });
    expect(answerTradeRequest('pass_to_gm', 10, 1).promise).toMatchObject({ about: 'pass_to_gm', keptAtOnce: true });
  });
  it('withdrawn after six straight weeks of met need; after the deadline it adds 1 a week to stress', () => {
    let s = { playerId: 1, venue: 'private' as const, open: true, weeksNeedMet: 0 };
    for (let w = 0; w < 5; w++) { const r = tradeRequestWeek(s, 10, true, false); expect(r.withdrawn).toBe(false); s = r.state as typeof s; }
    const done = tradeRequestWeek(s, 10, true, false);
    expect(done.withdrawn).toBe(true);
    expect(done.memories[0]!.delta).toBeGreaterThan(0);
    expect(tradeRequestWeek({ ...s, weeksNeedMet: 3 }, 10, false, true)).toMatchObject({ stressInflow: 1, withdrawn: false, state: { weeksNeedMet: 0 } });
  });
});

describe('L7.3.1 families', () => {
  const people = new Map([[1, { personId: 1, imported: false }], [2, { personId: 2, imported: true }]]);
  const fam = (id: number, of: number): FamilyMember => ({ personId: id, ofPersonId: of, role: 'parent', closeness: 0.8, metCoach: false });
  it('no person flagged as imported keeps any family record', () => {
    expect(guardFamilies([fam(100, 1), fam(101, 2)], people).map((m) => m.personId)).toEqual([100]);
    expect(() => familyActMemories(10, fam(101, 2), people.get(2)!, 'meeting_given')).toThrow();
  });
  it('coach acts write the same memory on family and player: +8 surgery call, +4 meeting, -6 refused', () => {
    expect(familyActMemories(10, fam(100, 1), people.get(1)!, 'call_after_surgery').map((m) => [m.holderId, m.delta])).toEqual([[100, 8], [1, 8]]);
    expect(familyActMemories(10, fam(100, 1), people.get(1)!, 'meeting_refused')[0]!.delta).toBe(-6);
  });
  it('family advice is at most 5 points, scaled by family value and closeness (clamped 0.3 to 1)', () => {
    expect(familyAdviceDelta(100, 1, 'stay')).toBe(5);
    expect(familyAdviceDelta(100, 0.1, 'leave')).toBeCloseTo(-1.5, 12);
    expect(familyAdviceDelta(50, 0.8, 'stay')).toBeCloseTo(2, 12);
  });
  it('medical detail is never an option when the flag is off; sharing it anyway writes -15', () => {
    expect(shareOptions(DEFAULT_DISCLOSURE)).toEqual(['football']);
    expect(shareWithFamily(10, 1, 'medical', DEFAULT_DISCLOSURE)[0]!.delta).toBe(-15);
    expect(shareWithFamily(10, 1, 'football', DEFAULT_DISCLOSURE)).toEqual([]);
  });
  it('a recruiting promise broken writes a full-strength copy to each parent witness, half to others', () => {
    const p = answerRepresentative(10, 1, 'role', true).promise;
    const copies = brokenPromiseCopies(p, 'recruiting', -30, [{ personId: 100, kind: 'parent' }, { personId: 101, kind: 'parent' }, { personId: 5, kind: 'teammate' }]);
    expect(copies.map((c) => [c.holderId, c.strength])).toEqual([[100, 1], [101, 1], [5, 0.5]]);
    expect(brokenPromiseCopies(p, 'other', -30, [{ personId: 100, kind: 'parent' }])[0]!.strength).toBe(0.5);
  });
});

describe('L7.3.2 high school coaches', () => {
  it('stance is derived from trust; open narrows the band 15 percent and adds 5 trust; closed removes evaluation', () => {
    expect([70, 55, 40, 10].map(hsCoachStance)).toEqual(['open', 'neutral', 'guarded', 'closed']);
    expect(hsAccess('open')).toEqual({ evalBandNarrowing: 0.15, inSchoolEvaluation: true, recruitTrust: 5 });
    expect(hsAccess('closed').inSchoolEvaluation).toBe(false);
  });
  it('a late pulled offer writes -20 with his coach and quarter-strength copies to neighbours', () => {
    expect(latePullMemories(10, 300, [301, 302]).map((m) => [m.holderId, m.delta, m.strength])).toEqual([[300, -20, 1], [301, -20, 0.25], [302, -20, 0.25]]);
  });
});

describe('L7.3.3 college representatives', () => {
  it('with representation off no representative exists', () => {
    expect(representativesActive(COLLEGE_2020)).toBe(false);
    expect(representativesActive(COLLEGE_2026)).toBe(true);
  });
  it('a money term the seat does not hold is allowed, warned and logged unfunded', () => {
    const a = answerRepresentative(10, 1, 'money', false);
    expect(a.warning).toBe('agents.warn.no_budget');
    expect(a.promise.unfunded).toBe(true);
    expect(answerRepresentative(10, 1, 'money', true).warning).toBeNull();
  });
});

describe('L7.4.1 lower rungs', () => {
  it('an assistant role statement creates a ledger entry in his own name; the head coach is bound at half', () => {
    const [own, hc] = assistantPromises({ assistantId: 30, headCoachId: 10, playerId: 1, statedRole: 'starter', byWeek: 5, aiUnderDelegation: false });
    expect(own).toMatchObject({ promiserId: 30, strength: 1 });
    expect(hc).toMatchObject({ promiserId: 10, strength: 0.5 });
    expect(pastAuthorityStanding(true)).toBe(-6);
    expect(pastAuthorityStanding(false)).toBe(0);
  });
  it('a recruiter who leaves breaks the promise in full for parents and at half for the player', () => {
    const r = recruiterLeaves({ recruiterId: 30, playerId: 1, parentIds: [100], brokenDelta: -30 });
    expect(r.memories.map((m) => [m.holderId, m.strength])).toEqual([[100, 1], [1, 0.5]]);
    expect(r.transferTrigger).toBe(true);
  });
});
