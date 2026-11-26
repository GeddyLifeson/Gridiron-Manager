// E3.4 authority clauses, E3.5 negotiation and leverage, E3.6 agent, E3.7 extensions.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CLAUSE_CONSUMERS, NEUTRAL_WEIGHTS, ROSTER_AUTHORITY_STEPS, agentRead, applyRollover, canReleaseAssistant, canSignAssistant,
  clubResponds, extend, finalYearEffects, fullControlAvailable, interferenceIsBreach, leverageMultiplier, openNegotiation,
  ownerOffersExtension, promiseBreaches, relationshipMarkOnSigning, resolveRosterDispute, rosterDecider, sameAgencyClusters,
  sharedRepresentation, termCost, type ClubPosture, type NegotiableTerms, type RosterMove,
} from '../../src/contract/index.ts';
import { draft, rng, usd } from './helpers.ts';

const MOVES: readonly RosterMove[] = ['cut_or_keep_53', 'depth_chart', 'trade', 'draft_pick', 'free_agent_signing'];

describe('E3.4 authority', () => {
  it('in a roster dispute the outcome follows the authority flag in every case', () => {
    for (const a of ROSTER_AUTHORITY_STEPS) for (const m of MOVES) {
      const r = resolveRosterDispute(a, m, 'coach', 'gm', 'owner');
      const by = rosterDecider(a, m);
      expect(r.executed).toBe(by === 'coach' ? 'coach' : by === 'owner' ? 'owner' : 'gm');
      expect(r.event === null).toBe(by === 'coach');
    }
    expect(resolveRosterDispute('coach_full', 'cut_or_keep_53', 1, 2, 3).executed).toBe(1);
    expect(resolveRosterDispute('gm_final', 'cut_or_keep_53', 1, 2, 3).executed).toBe(2);
  });
  it('full control needs a proven record or two competing offers', () => {
    expect(fullControlAvailable({ headCoachSeasons: 0, winShare: 0 }, 0)).toBe(false);
    expect(fullControlAvailable({ headCoachSeasons: 0, winShare: 0 }, 2)).toBe(true);
    expect(fullControlAvailable({ headCoachSeasons: 5, winShare: 0.65 }, 0)).toBe(true);
  });
  it('the coach cannot sign assistants whose total exceeds the pool; owner-required keeps need a conversation', () => {
    const staff = { poolCents: usd(10_000_000), sizeCap: 24, mayReplaceAll: false, requiredKeepIds: [5], assistantsMayBring: 4 };
    expect(canSignAssistant(staff, [usd(9_000_000)], usd(1_000_000)).ok).toBe(true);
    expect(canSignAssistant(staff, [usd(9_000_000)], usd(1_000_001)).reason).toBe('over_pool');
    expect(canReleaseAssistant(staff, 5, true)).toEqual({ ok: false, reason: 'owner_required_keep' });
    expect(canReleaseAssistant(staff, 6, false)).toEqual({ ok: false, reason: 'no_replace_authority' });
  });
  it('each other clause maps to a consuming rule; a missed promise or interference is a breach only when written', () => {
    for (const v of Object.values(CLAUSE_CONSUMERS)) expect(v.length).toBeGreaterThan(0);
    const c = { ...draft(), otherClauses: ['facilities_promise', 'play_calling_freedom'] as const };
    expect(promiseBreaches(c, [{ clause: 'facilities_promise', dueMonth: 10, delivered: false }], 11).length).toBe(1);
    expect(promiseBreaches(c, [{ clause: 'facilities_promise', dueMonth: 10, delivered: true }], 11).length).toBe(0);
    expect(interferenceIsBreach(c, 'changed_play_caller')).toBe(true);
    expect(interferenceIsBreach(c, 'set_depth_chart')).toBe(false);
  });
});

const opening: NegotiableTerms = { salaryPerYearCents: usd(5_000_000), years: 5, guaranteeShare: 1, rosterAuthority: 'gm_final', staffPoolCents: usd(10_000_000), perquisiteCount: 2 };
const club = (budgetMul = 1.2, weights = NEUTRAL_WEIGHTS): ClubPosture => ({ budgetUnits: termCost(opening, weights) * budgetMul, weights, opening });

const termsArb = fc.record({
  salaryPerYearCents: fc.integer({ min: usd(5_000_000), max: usd(15_000_000) }),
  years: fc.integer({ min: 5, max: 8 }),
  guaranteeShare: fc.constant(1),
  rosterAuthority: fc.constantFrom(...ROSTER_AUTHORITY_STEPS),
  staffPoolCents: fc.integer({ min: usd(10_000_000), max: usd(20_000_000) }),
  perquisiteCount: fc.integer({ min: 2, max: 6 }),
});

describe('E3.5.1 negotiation loop', () => {
  it('a counter inside the hidden budget is always accepted', () => {
    fc.assert(fc.property(termsArb, (t) => {
      const k = club(1.3);
      const r = clubResponds(openNegotiation(k), t, k);
      return termCost(t, k.weights) <= k.budgetUnits ? r.reply.kind === 'accept' : r.reply.kind !== 'accept';
    }));
  });
  it('the value the club concedes never exceeds its budget', () => {
    fc.assert(fc.property(termsArb, fc.constantFrom(1, 1.1, 1.5), (t, mul) => {
      const k = club(mul, { ...NEUTRAL_WEIGHTS, control: 2, salary: 1.5 });
      const r = clubResponds(openNegotiation(k), t, k);
      return r.reply.kind === 'withdrawn' || termCost(r.reply.terms, k.weights) <= k.budgetUnits + 1e-6;
    }));
  });
  it('the club trims the term the owner values most first', () => {
    const k = club(1.05, { ...NEUTRAL_WEIGHTS, control: 3 });
    const ask = { ...opening, rosterAuthority: 'coach_full' as const };
    const r = clubResponds(openNegotiation(k), ask, k);
    expect(r.reply.kind).not.toBe('accept');
    if (r.reply.kind !== 'withdrawn') {
      expect(r.reply.terms.rosterAuthority).not.toBe('coach_full');
      expect(r.reply.terms.salaryPerYearCents).toBe(opening.salaryPerYearCents);
    }
  });
  it('far-above demands cost patience and the -3 mark per round; zero patience withdraws; the last round is a final offer', () => {
    const k = club(1.0);
    const greedy = { ...opening, salaryPerYearCents: usd(30_000_000) };
    let s = openNegotiation(k);
    const kinds: string[] = [];
    for (let i = 0; i < 3; i++) { const r = clubResponds(s, greedy, k); s = r.state; kinds.push(r.reply.kind); if (s.status !== 'open') break; }
    expect(kinds[kinds.length - 1]).toBe('withdrawn');
    expect(s.relationshipMark).toBe(-9);
    expect(relationshipMarkOnSigning(s)).toBe(0);
    const slight = { ...opening, salaryPerYearCents: opening.salaryPerYearCents + usd(200_000) };
    let t = openNegotiation(club(1.0));
    let last = '';
    for (let i = 0; i < 4 && t.status === 'open'; i++) { const r = clubResponds(t, slight, club(1.0)); t = r.state; last = r.reply.kind; }
    expect(last).toBe('final_offer');
  });
  it('without an agent the user sees no budget estimate; a better agent reads closer', () => {
    const k = club(1.3);
    expect(agentRead(rng(1), k, null)).toBeNull();
    let errGood = 0, errBad = 0; const r = rng(3);
    for (let i = 0; i < 500; i++) { errGood += Math.abs(agentRead(r, k, 95)!.budgetEstimateUnits - k.budgetUnits); errBad += Math.abs(agentRead(r, k, 5)!.budgetEstimateUnits - k.budgetUnits); }
    expect(errGood).toBeLessThan(errBad);
  });
});

describe('E3.5.2 leverage', () => {
  it('adding a competing offer never lowers the multiplier, which stays in 0.8 to 1.5', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 5 }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), fc.boolean(), (n, gap, rec, unemp) => {
      const a = leverageMultiplier({ competingLiveOffers: n, candidateGap: gap, recordTerm: rec, unemployedWithNoOtherOffer: unemp });
      const b = leverageMultiplier({ competingLiveOffers: n + 1, candidateGap: gap, recordTerm: rec, unemployedWithNoOtherOffer: unemp });
      return b >= a && a >= 0.8 && a <= 1.5;
    }));
  });
});

describe('E3.6 agent', () => {
  it('shared representation helps the candidacy and softens the agent; agency clusters are found', () => {
    const a = { id: 1, feeShare: 0.04, negotiationSkill: 70, clientIds: [100, 200], minClientRung: 5 };
    expect(sharedRepresentation(a, [100])).toEqual({ shared: true, candidateBonus: 10, effectiveSkill: 60 });
    expect(sharedRepresentation(a, [300]).candidateBonus).toBe(0);
    expect(sameAgencyClusters(new Map([[1, [7, 7, 7, null]], [2, [7, 8, null]]]))).toEqual([1]);
  });
});

describe('E3.7 extensions and the final year', () => {
  it('the owner offers with high confidence and two or fewer years left; the final-year flag clears on signing', () => {
    const c = draft();
    expect(ownerOffersExtension(0.9, c, 2033)).toBe(true);
    expect(ownerOffersExtension(0.9, c, 2031)).toBe(false);
    expect(ownerOffersExtension(0.3, c, 2033)).toBe(false);
    expect(finalYearEffects(c, 2034).finalYear).toBe(true);
    const e = extend(c, { fromYear: 2035, newEndYear: 2038, firstYearPayCents: usd(8_000_000), raise: 0.04, rosterAuthority: 'coach_53_gm_draft_fa' });
    expect(finalYearEffects(e, 2034).finalYear).toBe(false);
    expect(e.endYear).toBe(2038);
    expect(e.rosterAuthority).toBe('coach_53_gm_draft_fa');
    expect(e.salary.length).toBe(9);
  });
  it('a playoff rollover adds a year up to five unexpired years, without reopening authority', () => {
    const c0 = draft({ tier: 'power_four', years: 5 });
    const c = { ...c0, rollover: { trigger: 'playoff_appearance' as const, winTotal: null, maxUnexpiredYears: 5 } };
    const r1 = applyRollover(c, 2031, { kind: 'playoff_appearance' });
    expect(r1.endYear).toBe(c.endYear + 1);
    expect(r1.rosterAuthority).toBe(c.rosterAuthority);
    const once = applyRollover(c, 2030, { kind: 'playoff_appearance' });
    expect(once.endYear).toBe(2035);
    expect(applyRollover(once, 2030, { kind: 'playoff_appearance' }).endYear).toBe(2035);
    expect(applyRollover(c, 2031, { kind: 'season_wins', wins: 12 }).endYear).toBe(c.endYear);
  });
});
