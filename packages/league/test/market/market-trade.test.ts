import { describe, expect, it } from 'vitest';
import { FULLY_GUARANTEED, NOT_GUARANTEED, plainYear, type CapContract } from '../../src/cap/contract.ts';
import type { TeamCapInput } from '../../src/cap/charges.ts';
import {
  P, adjustForWindow, applyPitch, checkTrade, checkWeights, choose, coreNameWeight, deadlineStance, demandFactor, expectedContract, insistWeight,
  medianWeights, mustKeepWeight, physicalVoids, positionScale, positionSpendShares, requestKind, reservationScore, shareAt, surplusPoints,
  timeFactor, tradeRecord, untouchables, valueSide,
  type Chooser, type Offer, type PickRef, type TradeContext, type TradeProposal, type ValueInput, type Weights,
} from '../../src/market/index.ts';
import { league, PRO } from '../roster/helpers.ts';
import { $, at, DATES, MR, RS } from './fixtures.ts';

// ------------------------------------------------------------------ market value (C8.3.1)

const contracts = (pos: string, n: number, topUsd: number) => Array.from({ length: n }, (_, i) => ({ position: pos, apyCents: $(topUsd - i * 1_000_000) }));
const CAP = $(301_200_000);

describe('market value', () => {
  const scale = positionScale(contracts('WR', 20, 40_000_000), 'WR', CAP);
  const base: ValueInput = {
    scale, percentile: { low: 0.6, mid: 0.7, high: 0.8 }, suitors: 3, age: 26, primeEndAge: 29, productiveYearsLeft: 4, injuryFlag: false,
    capCents: CAP, minimumCents: $(1_215_000), now: at('2026-03-12'), dates: DATES,
  };
  it('demand factor', () => {
    expect(demandFactor(0)).toBeCloseTo(P.demandOneSuitor);
    expect(demandFactor(1)).toBeCloseTo(0.85);
    expect(demandFactor(3)).toBeCloseTo(1.05);
    expect(demandFactor(5)).toBeCloseTo(1.25);
    expect(demandFactor(9)).toBeCloseTo(1.25);
  });
  it('time discount', () => {
    expect(timeFactor(at('2026-03-13'), DATES)).toBe(1);
    expect(timeFactor(at('2026-03-15'), DATES)).toBeCloseTo(0.9);
    expect(timeFactor(at('2026-04-14', '17:00'), DATES)).toBeCloseTo(0.85);
    expect(timeFactor(at('2028-03-01'), DATES)).toBe(0);
    const late = expectedContract({ ...base, now: at('2028-03-01') });
    expect(late.apyCents.mid).toBe(base.minimumCents);
  });
  it('pooled scale', () => {
    const few = positionScale([...contracts('K/P', 4, 5_000_000)], 'K/P', CAP);
    expect(few.from).toEqual(['K/P']);
    const rb = positionScale([...contracts('RB', 4, 12_000_000), ...contracts('WR', 20, 40_000_000)], 'RB', CAP);
    expect(rb.from).toEqual(['RB', 'WR']);
    expect(rb.shares.length).toBe(24);
    expect(shareAt(scale, 1)).toBeCloseTo($(40_000_000) / CAP);
    expect(shareAt(scale, 0)).toBeCloseTo($(21_000_000) / CAP);
  });
  it('expected years', () => {
    expect(expectedContract(base).years).toBe(4);
    expect(expectedContract({ ...base, productiveYearsLeft: 9 }).years).toBe(P.maxContractYears);
    expect(expectedContract({ ...base, productiveYearsLeft: 0.2 }).years).toBe(1);
  });
  it('guarantee share', () => {
    const young = expectedContract(base);
    const old = expectedContract({ ...base, age: 32 });
    const hurt = expectedContract({ ...base, injuryFlag: true });
    expect(old.guaranteeShare).toBeLessThan(young.guaranteeShare);
    expect(hurt.guaranteeShare).toBeCloseTo(young.guaranteeShare * P.guaranteeInjuryFactor);
    expect(young.apyCents.low).toBeLessThanOrEqual(young.apyCents.mid);
    expect(young.apyCents.mid).toBeLessThanOrEqual(young.apyCents.high);
  });
  it('prices rise with the cap by themselves; never below the minimum', () => {
    const doubled = expectedContract({ ...base, capCents: CAP * 2, scale });
    expect(doubled.apyCents.mid / expectedContract(base).apyCents.mid).toBeCloseTo(2);
    const shares = positionSpendShares([...contracts('WR', 2, 10_000_000), ...contracts('QB', 1, 30_000_000)]);
    expect(shares.get('QB')).toBeCloseTo(30 / 49);
  });
});

// ------------------------------------------------------------------ choice (C8.3.2, M5.2.1)

const neutral = { role: 0.5, winning: 0.5, relationships: 0.5, scheme: 0.5, location: 0.5 };
const offer = (clubId: number, guaranteedUsd: number, over: Partial<Offer> = {}): Offer => ({
  clubId, madeAt: at('2026-03-11', '17:00'), guaranteedCents: $(guaranteedUsd), stateTaxPct: 5, terms: neutral, oldClubTreatment: null, ...over,
});
const chooser = (w: Weights = medianWeights()): Chooser => ({ personId: 9, weights: w, expectedGuaranteeCents: $(20_000_000), selfBelief: 1, referenceTaxPct: 5 });
const now = at('2026-03-12');

describe('free agent choice', () => {
  it('median weights', () => {
    const w = medianWeights();
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(w.money).toBe(0.5);
  });
  it('weights validation', () => {
    const r = checkWeights({ money: 9, role: 1, winning: 0, relationships: 0, scheme: 0, location: 0 });
    expect(r.weights.money).toBeCloseTo(0.9);
    expect(r.problems.length).toBe(1);
    expect(checkWeights({ money: 0.4, role: 0, winning: 0.6, relationships: 0, scheme: 0, location: 0 }).problems[0]).toMatch(/winning/);
  });
  it('takes the best score; ties go to the earlier offer; stores two reasons', () => {
    const c = choose(chooser(), [offer(1, 22_000_000), offer(2, 25_000_000)], now, DATES);
    expect(c).toMatchObject({ kind: 'signs', clubId: 2 });
    if (c.kind === 'signs') { expect(c.reasons.length).toBe(2); expect(c.reasons[0]).toBe('money'); }
    const tie = choose(chooser(), [offer(5, 22_000_000, { madeAt: at('2026-03-12') }), offer(4, 22_000_000, { madeAt: at('2026-03-11', '18:00') })], now, DATES);
    expect(tie).toMatchObject({ kind: 'signs', clubId: 4 });
  });
  it('player waits', () => {
    const c = choose(chooser(), [offer(1, 12_000_000)], now, DATES);
    expect(c.kind).toBe('waits');
    expect(reservationScore(chooser())).toBeCloseTo(0.75);
    // A month later his expectation has fallen with the market and the same offer is enough.
    expect(choose(chooser(), [offer(1, 18_500_000)], now, DATES).kind).toBe('waits');
    expect(choose(chooser(), [offer(1, 18_500_000)], at('2026-04-20'), DATES).kind).toBe('signs');
  });
  it('state tax counts: after-tax guaranteed money', () => {
    const c = choose(chooser({ ...medianWeights() }), [offer(1, 24_000_000, { stateTaxPct: 13 }), offer(2, 23_000_000, { stateTaxPct: 0 })], now, DATES);
    expect(c).toMatchObject({ kind: 'signs', clubId: 2 });
  });
  it('old club term', () => {
    const c = choose(chooser(), [offer(1, 22_000_000, { oldClubTreatment: 1 }), offer(2, 22_000_000, { madeAt: at('2026-03-11', '16:30') })], now, DATES);
    expect(c).toMatchObject({ kind: 'signs', clubId: 1 });
    const bad = choose(chooser(), [offer(1, 22_000_000, { oldClubTreatment: -1, madeAt: at('2026-03-11', '16:00') }), offer(2, 22_000_000)], now, DATES);
    expect(bad).toMatchObject({ kind: 'signs', clubId: 2 });
  });
  it('money gap cap', () => {
    const perfect = { role: 1, winning: 1, relationships: 1, scheme: 1, location: 1 };
    const close = choose(chooser(), [offer(1, 25_000_000), offer(2, 23_000_000, { terms: perfect })], now, DATES);
    expect(close).toMatchObject({ kind: 'signs', clubId: 2 });
    const far = choose(chooser(), [offer(1, 25_000_000), offer(2, 21_000_000, { terms: perfect })], now, DATES);
    expect(far).toMatchObject({ kind: 'signs', clubId: 1 });
  });
  it('relationship edge wins at equal money in at least 70 percent of trials', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const draw = () => ({ role: rnd(), winning: rnd(), relationships: rnd() * 0.3, scheme: rnd(), location: rnd() });
    let wins = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const a = draw(), b = draw();
      const c = choose(chooser(), [offer(1, 22_000_000, { terms: { ...a, relationships: 1 } }), offer(2, 22_000_000, { terms: b })], now, DATES);
      if (c.kind === 'signs' && c.clubId === 1) wins++;
    }
    expect(wins / trials).toBeGreaterThanOrEqual(0.7);
  });
  it('pitch', () => {
    const w: Weights = { money: 0.5, role: 0.3, winning: 0.05, relationships: 0.05, scheme: 0.05, location: 0.05 };
    const o = offer(1, 20_000_000);
    expect(applyPitch(o, w, { emphasis: 'scheme', specificPromise: true, filmFit: null }).terms).toEqual(o.terms);
    expect(applyPitch(o, w, { emphasis: 'role', specificPromise: false, filmFit: null }).terms.role).toBeCloseTo(0.5 + P.pitchGeneralGain);
    expect(applyPitch(o, w, { emphasis: 'role', specificPromise: true, filmFit: null }).terms.role).toBeCloseTo(0.5 + P.pitchSpecificPromiseGain);
    const schemeGuy: Weights = { ...w, role: 0.05, scheme: 0.3 };
    const fit = applyPitch(o, schemeGuy, { emphasis: 'scheme', specificPromise: false, filmFit: 1 }).terms.scheme;
    const poor = applyPitch(o, schemeGuy, { emphasis: 'scheme', specificPromise: false, filmFit: 0.1 }).terms.scheme;
    expect(fit).toBeGreaterThan(poor);
  });
});

// ------------------------------------------------------------------ trades (C8.4.1)

const contract = (id: number, baseUsd: number, bonusUsd = 0): CapContract => ({
  id, form: 'veteran', offset: false,
  years: [plainYear(2026, $(baseUsd), NOT_GUARANTEED), plainYear(2027, $(baseUsd), NOT_GUARANTEED)],
  tranches: bonusUsd > 0 ? [{ amountCents: $(bonusUsd), firstLeagueYear: 2026, paidLeagueYear: 2026, source: 'signing', guarantee: FULLY_GUARANTEED }] : [],
});
const facts = { creditedSeasons: 6, undraftedRookie: false };
const capIn = (fillerUsd: number, cs: CapContract[]): TeamCapInput => ({
  leagueYear: 2026, phase: 'offseason', adjustmentCents: 0,
  contracts: cs.map((c) => ({ contract: c, player: facts })), other: [{ label: 'rest of roster', amountCents: $(fillerUsd), kind: 'dead' }],
});
const A1 = contract(1001, 5_000_000, 4_000_000), B1 = contract(2001, 2_000_000);
const PICK: PickRef = { season: 2027, round: 3, originalClubId: 1 };

function ctx(over: Partial<TradeContext> = {}, bFiller = 295_000_000): TradeContext {
  return {
    now: at('2026-03-20'), dates: DATES, mr: MR, roster: league({ clubs: 2, perClub: 50 }), rosterRules: PRO, capRules: RS,
    caps: new Map([[1, capIn(290_000_000, [A1])], [2, capIn(bFiller, [B1])]]),
    contracts: new Map([[1001, { contract: A1, player: facts }], [2001, { contract: B1, player: facts }]]),
    leave: () => ({ leagueYear: 2026, timing: 'on_or_before_june1', basePaidCents: 0, earnedThisYearCents: 0 }),
    noTrade: new Set(), consents: new Set(), tendered: new Map(), tradeBackBlocks: [],
    ownsPick: (club, p) => club === p.originalClubId, ...over,
  };
}
const swap: TradeProposal = { clubA: 1, clubB: 2, aSends: { players: [1001], picks: [], rights: [] }, bSends: { players: [2001], picks: [], rights: [] } };

describe('trade legality', () => {
  it('a legal trade moves players, keeps proration as dead money and charges the new club the rest', () => {
    const r = checkTrade(swap, ctx());
    if (!r.ok) throw new Error(r.refusals.map((x) => x.message).join('; '));
    const club2 = r.roster.clubs.find((c) => c.clubId === 2)!;
    expect(club2.entries.some((e) => e.personId === 1001)).toBe(true);
    expect(r.dead[0]).toMatchObject({ personId: 1001, clubId: 1 });
    expect(r.dead[0]!.byYear.get(2026)).toBe($(4_000_000));
    expect(r.caps.get(1)!.teamSalaryCents).toBe($(290_000_000 + 4_000_000 + 2_000_000));
    expect(r.caps.get(2)!.teamSalaryCents).toBe($(295_000_000 + 5_000_000));
    expect(r.moved.find((m) => m.personId === 1001)!.contract.tranches).toEqual([]);
    expect(r.schemeKnowledgeReset).toEqual([1001, 2001]);
    expect(r.wire.length).toBe(2);
  });
  it('no trade completes over the cap', () => {
    const r = checkTrade(swap, ctx({}, 299_000_000));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusals.map((x) => x.code)).toContain('cap');
  });
  it('no trade before the league year or after the deadline', () => {
    expect(checkTrade(swap, ctx({ now: at('2026-03-10') })).ok).toBe(false);
    const late = checkTrade(swap, ctx({ now: at('2026-11-10', '16:00') }));
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.refusals[0]!.code).toBe('deadline');
    expect(checkTrade(swap, ctx({ now: at('2026-11-10', '15:59') })).ok).toBe(true);
    expect(checkTrade(swap, ctx({ roster: { ...league({ clubs: 2, perClub: 50 }), tradeDeadlinePassed: true } })).ok).toBe(false);
    expect(checkTrade(swap, ctx({ mr: { ...MR, tradeDeadlineAfterWeek: null } })).ok).toBe(false);
  });
  it('no-trade clause and the matched-offer-sheet block need the player\'s consent', () => {
    expect(checkTrade(swap, ctx({ noTrade: new Set([1001]) })).ok).toBe(false);
    expect(checkTrade(swap, ctx({ noTrade: new Set([1001]), consents: new Set([1001]) })).ok).toBe(true);
    const blocks = [{ personId: 1001, offeringClubId: 2, until: at('2027-01-01') }];
    expect(checkTrade(swap, ctx({ tradeBackBlocks: blocks })).ok).toBe(false);
    expect(checkTrade(swap, ctx({ tradeBackBlocks: blocks, now: at('2026-03-20'), consents: new Set([1001]) })).ok).toBe(true);
  });
  it('picks: only the holder trades them; a picks-only trade needs no roster move', () => {
    const picks: TradeProposal = { clubA: 1, clubB: 2, aSends: { players: [], picks: [PICK], rights: [] }, bSends: { players: [], picks: [{ season: 2027, round: 4, originalClubId: 2 }], rights: [] } };
    expect(checkTrade(picks, ctx()).ok).toBe(true);
    expect(checkTrade({ ...picks, aSends: { ...picks.aSends, picks: [{ season: 2027, round: 3, originalClubId: 2 }] } }, ctx()).ok).toBe(false);
    expect(checkTrade({ clubA: 1, clubB: 2, aSends: { players: [], picks: [], rights: [] }, bSends: { players: [], picks: [], rights: [] } }, ctx()).ok).toBe(false);
  });
  it('a player the club does not hold is refused by the roster engine', () => {
    const r = checkTrade({ ...swap, aSends: { ...swap.aSends, players: [2002] } }, ctx());
    expect(r.ok).toBe(false);
  });
  it('tendered rights: consent in the signing period, no player back, picks no better than the tender (CBA Art. 9 s.3(h))', () => {
    const tendered = new Map([[777, { personId: 777, clubId: 1, kind: 'compensation' as const, compensationRounds: [2] }]]);
    const deal = (back: TradeProposal['bSends']): TradeProposal => ({ clubA: 1, clubB: 2, aSends: { players: [], picks: [], rights: [777] }, bSends: back });
    const pick = (round: number): PickRef => ({ season: 2027, round, originalClubId: 2 });
    expect(checkTrade(deal({ players: [], picks: [pick(2)], rights: [] }), ctx({ tendered })).ok).toBe(false);
    const c = ctx({ tendered, consents: new Set([777]) });
    expect(checkTrade(deal({ players: [], picks: [pick(2)], rights: [] }), c).ok).toBe(true);
    expect(checkTrade(deal({ players: [], picks: [pick(1)], rights: [] }), c).ok).toBe(false);
    expect(checkTrade(deal({ players: [], picks: [pick(2), pick(5)], rights: [] }), c).ok).toBe(false);
    expect(checkTrade(deal({ players: [2001], picks: [], rights: [] }), c).ok).toBe(false);
    expect(checkTrade(deal({ players: [], picks: [pick(2)], rights: [] }), ctx({ tendered, now: at('2026-05-01') })).ok).toBe(true);
    const excl = new Map([[777, { personId: 777, clubId: 1, kind: 'exclusive' as const, compensationRounds: [] }]]);
    expect(checkTrade(deal({ players: [], picks: [pick(1)], rights: [] }), ctx({ tendered: excl })).ok).toBe(true);
  });
  it('physical', () => {
    expect(physicalVoids(false, 0)).toBe(false);
    expect(physicalVoids(true, 0.01)).toBe(true);
    expect(physicalVoids(true, 0.5)).toBe(false);
  });
});

describe('trade valuation', () => {
  const toPoints = (cents: number) => cents / $(1_000_000);
  it('surplus value can be negative for a good player on a large contract', () => {
    expect(surplusPoints([$(20_000_000), $(18_000_000)], [$(30_000_000), $(30_000_000)], toPoints)).toBe(-22);
    expect(surplusPoints([$(10_000_000)], [$(2_000_000), $(2_000_000)], toPoints)).toBe(6);
  });
  it('window adjustment', () => {
    const future = { kind: 'pick' as const, id: 'p', points: 100, season: 2027 };
    const vet = { kind: 'player' as const, id: '1', points: 100, age: 31 };
    expect(adjustForWindow(future, 'contending', 2026)).toBeCloseTo(75);
    expect(adjustForWindow({ ...future, season: 2026 }, 'contending', 2026)).toBe(100);
    expect(adjustForWindow(vet, 'rebuilding', 2026)).toBeCloseTo(75);
    expect(adjustForWindow({ ...vet, age: 24 }, 'rebuilding', 2026)).toBe(100);
    expect(adjustForWindow({ ...vet, points: -20 }, 'rebuilding', 2026)).toBe(-20);
    expect(adjustForWindow(vet, 'neutral', 2026)).toBe(100);
  });
  it('untouchables', () => {
    const roster = Array.from({ length: 10 }, (_, i) => ({ personId: i + 1, surplusPoints: 100 - i }));
    const u = untouchables(roster, [9]);
    expect([...u].sort()).toEqual(['1', '2', '3', '4', '5', '9']);
    const a = valueSide(1, 'neutral', 2026, [{ kind: 'pick', id: 'x', points: 500 }], [{ kind: 'player', id: '1', points: 100 }], u);
    expect(a.accepts).toBe(false);
    expect(a.untouchableAsked).toEqual(['1']);
  });
  it('each side accepts by its own valuation, and the record keeps both', () => {
    const give = [{ kind: 'player' as const, id: '1001', points: 40, age: 31 }];
    const get = [{ kind: 'pick' as const, id: '2027-3', points: 35, season: 2027 }];
    const rebuild = valueSide(1, 'rebuilding', 2026, get, give);
    const contend = valueSide(2, 'contending', 2026, give, get);
    expect(rebuild.accepts).toBe(true);
    expect(contend.accepts).toBe(true);
    const rec = tradeRecord(at('2026-03-20'), swap, rebuild, contend, true);
    expect(rec.valuations.map((v) => v.clubId)).toEqual([1, 2]);
    expect(valueSide(1, 'neutral', 2026, get, give).accepts).toBe(false);
  });
});

describe('deadline and voice', () => {
  it('deadline stance', () => {
    expect(deadlineStance({ playoffOddsPct: 60, gmLeanSteps: 0, coach: null }).stance).toBe('buy');
    expect(deadlineStance({ playoffOddsPct: 30, gmLeanSteps: 0, coach: null }).stance).toBe('hold');
    expect(deadlineStance({ playoffOddsPct: 10, gmLeanSteps: 0, coach: null }).stance).toBe('sell');
    expect(deadlineStance({ playoffOddsPct: 50, gmLeanSteps: 1, coach: null }).stance).toBe('buy');
    expect(deadlineStance({ playoffOddsPct: 20, gmLeanSteps: -1, coach: null }).stance).toBe('sell');
    const moved = deadlineStance({ playoffOddsPct: 10, gmLeanSteps: 0, coach: { wants: 'buy', trust: 0.9, hasTradeSay: false } });
    expect([moved.stance, moved.coachMovedIt, moved.objectionRecorded]).toEqual(['hold', true, false]);
    const ignored = deadlineStance({ playoffOddsPct: 10, gmLeanSteps: 0, coach: { wants: 'buy', trust: 0.3, hasTradeSay: false } });
    expect([ignored.stance, ignored.objectionRecorded]).toEqual(['sell', true]);
    const say = deadlineStance({ playoffOddsPct: 10, gmLeanSteps: 0, coach: { wants: 'buy', trust: 0, hasTradeSay: true } });
    expect([say.stance, say.gmStance]).toEqual(['buy', 'sell']);
  });
  it('voice weights', () => {
    expect([1, 2, 3, 4].map(insistWeight)).toEqual([1, 1, 0.5, 0.25]);
    expect(mustKeepWeight(3)).toBe(1);
    expect(mustKeepWeight(6)).toBe(0.5);
    expect(coreNameWeight(5)).toBe(1);
    expect(coreNameWeight(10)).toBe(0.5);
    expect(requestKind(false)).toBe('mention');
  });
});
