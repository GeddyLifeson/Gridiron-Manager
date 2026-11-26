import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import type { RandomStream } from '@gm/schema';
import { computeStatus } from '@gm/schema';
import {
  BOSSES_FACTS, CLUB_ACTIONS, PARAMS, POWER_ODDS_FACT, answerItem, arrangement, askChance, bossesFactProvisional, contractPromise,
  contractPromiseKept, contractPromiseWarning, declineAllowance, declineObligation, describePower, donorBuyoutShare, drawInterference,
  drawLateRequest, firingCost, firingThresholdRaise, generatePower, generateProfile, gmRequest, hotSeatSigns, learnedLabels,
  mayAct, needsBoardApproval, pickMeetingItems, presidentBacksChance, readStanding, requestTolerance, resolveAsk, route,
  scoreEvaluations, toFinalSayRow, unplayedPickTrust, withField, boosterMoodAfter, roomLostKnownOn, deadMoneyCarried,
  type BossProfile, type Delegation, type LoggedItem,
} from '../../src/bosses/index.ts';

const rng = (seed: number, name = 'bosses'): RandomStream => stream(seedFromNumber(seed), name, []);

function profile(kind: BossProfile['kind'], w: Partial<BossProfile['weights']> = {}, extra: Partial<BossProfile> = {}): BossProfile {
  const base = generateProfile(1, kind, rng(1));
  return { ...base, weights: { ...base.weights, ...w }, ...extra };
}

const rec = (trust: number, respect = 50, familiarity = 60) => ({ trust, respect, familiarity });

describe('power arrangement (L5.2.1, T9.1.1)', () => {
  it('club generation follows 21:5:4:2 with a third split inside GM and owner groups', () => {
    const s = rng(7, 'power');
    const n: Record<string, number> = {};
    const N = 32000;
    for (let i = 0; i < N; i++) {
      const p = generatePower({ ownerPersonId: 1, athleticDirectorPersonId: null }, s);
      const key = p.arrangement === 'split' ? `split:${p.finalSay.draft}` : p.arrangement;
      n[key] = (n[key] ?? 0) + 1;
    }
    const share = (k: string) => (n[k] ?? 0) / N;
    expect(share('head_coach')).toBeCloseTo(5 / 32, 1);
    expect(share('executive')).toBeCloseTo(2 / 32, 1);
    expect(share('general_manager') + share('split:general_manager')).toBeCloseTo(21 / 32, 1);
    expect(share('split:general_manager') / (share('general_manager') + share('split:general_manager'))).toBeCloseTo(1 / 3, 1);
    expect(share('owner') + share('split:owner')).toBeCloseTo(4 / 32, 1);
    expect(n.program).toBeUndefined();
  });

  it('a program gets the T9.1.1 default: coach holds roster, contracts, staff; no draft; reports to the AD', () => {
    const p = arrangement('program');
    expect(p.finalSay).toEqual({ roster: 'head_coach', contracts: 'head_coach', staff: 'head_coach', draft: 'unused' });
    expect(p.headCoachReportsTo).toBe('athletic_director');
    const s = rng(3, 'power');
    let paymentsAbove = 0; let gmToAd = 0;
    for (let i = 0; i < 20000; i++) {
      const g = generatePower({ ownerPersonId: null, athleticDirectorPersonId: 9 }, s);
      expect(g.finalSay.roster).toBe('head_coach');
      if (g.finalSay.contracts !== 'head_coach') paymentsAbove++;
      if (g.gmReportsTo === 'athletic_director') gmToAd++;
    }
    expect(paymentsAbove / 20000).toBeCloseTo(0.1, 1);
    expect(gmToAd / 20000).toBeCloseTo(0.2, 1);
  });

  it('every club action renders as a decision or a request (acceptance)', () => {
    for (const a of ['head_coach', 'general_manager', 'split', 'owner', 'executive', 'program'] as const) {
      const p = arrangement(a);
      for (const act of CLUB_ACTIONS) {
        const r = route(p, act, 'head_coach', 0);
        expect(['decision', 'request', 'not_applicable']).toContain(r.kind);
        if (r.kind === 'not_applicable') expect(a).toBe('program');
      }
    }
  });

  it('with coach final say no pick, signing, trade or cut is made by the GM without a logged delegation', () => {
    const p = arrangement('head_coach');
    for (const act of ['draft_pick', 'sign_free_agent', 'trade', 'release'] as const) {
      expect(route(p, act, 'head_coach', 10).kind).toBe('decision');
      expect(mayAct(p, act, 'general_manager', 10)).toBe(false);
    }
    const d: Delegation = { id: 4, field: 'draft', from: 'head_coach', to: 'general_manager', fromDay: 5, toDay: 12 };
    expect(route(p, 'draft_pick', 'general_manager', 10, [d])).toEqual({ kind: 'delegated', field: 'draft', by: 'general_manager', delegationId: 4 });
    expect(mayAct(p, 'draft_pick', 'general_manager', 13, [d])).toBe(false);
    expect(mayAct(p, 'trade', 'general_manager', 10, [d])).toBe(false);
  });

  it('under a GM or owner the coach requests, and persuades the holder', () => {
    expect(route(arrangement('general_manager'), 'draft_pick', 'head_coach', 0)).toMatchObject({ kind: 'request', to: 'general_manager' });
    expect(route(arrangement('owner'), 'offer_contract', 'head_coach', 0)).toMatchObject({ kind: 'request', to: 'owner' });
    const split = arrangement('split');
    expect(route(split, 'hire_staff', 'head_coach', 0).kind).toBe('decision');
    expect(route(split, 'draft_pick', 'head_coach', 0).kind).toBe('request');
    expect(route(arrangement('general_manager'), 'depth_chart', 'head_coach', 0).kind).toBe('decision');
  });

  it('fields can be won or lost, and the offer screen states the arrangement in words', () => {
    const won = withField(arrangement('general_manager'), 'roster', 'head_coach');
    expect(route(won, 'set_53', 'head_coach', 0).kind).toBe('decision');
    const lines = describePower(arrangement('program'));
    expect(lines.join(' ')).toContain('athletic director');
    expect(lines.join(' ')).not.toContain('draft');
    expect(toFinalSayRow(arrangement('owner'), (s) => (s === 'owner' ? null : 1))).toEqual({ roster: null, contracts: null, draft: null, staffHiring: null });
  });

  it('the odds fact computes 1 of 3 and prints provisional', () => {
    const row = BOSSES_FACTS.find((r) => r.id === POWER_ODDS_FACT)!;
    expect(computeStatus(row)).toBe('1 of 3');
    expect(bossesFactProvisional(POWER_ODDS_FACT)).toBe(true);
    for (const r of BOSSES_FACTS) expect(computeStatus(r)).toBe(r.status);
  });
});

describe('owner (L5.1)', () => {
  const log: LoggedItem[] = [
    { id: 1, day: 90, interest: 'fourth_downs', football: true, soundOnInformation: true, outcomeGood: false },
    { id: 2, day: 95, interest: null, football: false, soundOnInformation: true, outcomeGood: true },
    { id: 3, day: 40, interest: 'image', football: false, soundOnInformation: false, outcomeGood: false },
  ];

  it('meetings raise only logged items, more of them for an involved owner', () => {
    const low = pickMeetingItems(profile('owner', { involvement: 0 }), log, 100, rng(2));
    const high = pickMeetingItems(profile('owner', { involvement: 1 }), log, 100, rng(2));
    expect(low).toHaveLength(1);
    expect(high).toHaveLength(3);
    for (const it of high) expect(log).toContain(it);
  });

  it('evidence works for a process owner and outcome rules a results owner', () => {
    const ctx = { bossPersonId: 1, day: 100 };
    const proc = answerItem(profile('owner', { involvement: 1 }), log[0]!, 'explain_with_evidence', ctx)[0]!;
    const res = answerItem(profile('owner', { involvement: 0 }), log[0]!, 'explain_with_evidence', ctx)[0]!;
    expect(proc.type === 'memory' && proc.strength).toBeGreaterThan(0);
    expect(res.type === 'memory' && res.strength).toBeLessThan(0);
    const blame = answerItem(profile('owner'), log[0]!, 'point_to_staff', { ...ctx, blamedStaffPersonId: 77 });
    expect(blame.some((e) => e.type === 'memory' && e.holderPersonId === 77)).toBe(true);
  });

  it('interference names its interest and grows with involvement, falls with trust', () => {
    const p = profile('owner', { involvement: 1 }, { interests: ['favoured_player'] });
    let seen = 0;
    const s = rng(5);
    for (let i = 0; i < 500; i++) {
      const r = drawInterference(p, rec(10), 0, i, s);
      if (r) { seen++; expect(r.interest).toBeTruthy(); }
    }
    expect(seen).toBeGreaterThan(50);
    let calm = 0;
    for (let i = 0; i < 500; i++) if (drawInterference(p, rec(95), 1, i, s)) calm++;
    expect(calm).toBeLessThan(seen / 4);
  });

  it('two owners with different weights produce measurably different event streams over 20 seasons', () => {
    const run = (w: Partial<BossProfile['weights']>) => {
      const p = profile('owner', w);
      const s = rng(11);
      let count = 0;
      for (let week = 0; week < 20 * 52; week++) if (drawInterference(p, rec(50), 0, week, s)) count++;
      return count;
    };
    const meddler = run({ involvement: 0.9 });
    const absent = run({ involvement: 0.1 });
    expect(meddler).toBeGreaterThan(absent * 4);
  });

  it('asks: spending, trust and results raise the chance; unreturned grants lower it; every answer has a reason', () => {
    const p = profile('owner', { spending: 0.5 });
    const a = { costUsd: 100_000, resultsVsExpectation: 0, unreturnedGrants: 0 };
    expect(askChance(p, rec(80), a)).toBeGreaterThan(askChance(p, rec(20), a));
    expect(askChance(p, rec(50), { ...a, unreturnedGrants: 2 })).toBeLessThan(askChance(p, rec(50), a));
    const s = rng(9);
    for (let i = 0; i < 50; i++) expect(resolveAsk(p, rec(50), a, s).reason).toBeTruthy();
    const interim = { ...profile('athletic_director', { spending: 1 }), interim: true };
    expect(resolveAsk(interim, rec(90), { ...a, costUsd: 5_000_000 }, s)).toMatchObject({ outcome: 'later', reason: 'interim_defers' });
  });

  it('hot-seat signs never appear above their band; a private owner gives fewer public ones', () => {
    expect(hotSeatSigns(profile('owner'), { confidence: 90, lastContractYear: true, hasGm: true }, rng(1))).toEqual([]);
    const count = (pub: number) => {
      const s = rng(4); let n = 0;
      for (let i = 0; i < 400; i++) n += hotSeatSigns(profile('owner', { publicBehaviour: pub }), { confidence: 10, lastContractYear: false, hasGm: false }, s).length;
      return n;
    };
    expect(count(0.05)).toBeLessThan(count(0.95));
  });

  it('dead money: three years owed in full at spending 0 raises the threshold by 6', () => {
    expect(firingThresholdRaise(firingCost(30_000_000, 0), 10_000_000, 0, 0)).toBeCloseTo(6);
    expect(firingThresholdRaise(30_000_000, 10_000_000, 40_000_000, 0)).toBeCloseTo(10);
    expect(firingThresholdRaise(30_000_000, 10_000_000, 0, 1)).toBe(0);
    expect(deadMoneyCarried([{ season: 2020, costUsd: 5e6 }, { season: 2023, costUsd: 7e6 }], 2025)).toBe(7e6);
  });

  it('room_lost reaches the owner after two weeks, sooner through a favoured player', () => {
    expect(roomLostKnownOn(100, null)).toBe(114);
    expect(roomLostKnownOn(100, 103)).toBe(103);
  });

  it('obligations: allowance 1 + round(3(1 - image)); past it, -2 president and -1 owner', () => {
    const o = profile('owner', { imageInterest: 0 });
    expect(declineAllowance(o)).toBe(4);
    expect(declineObligation(o, 8, 3, true, 1)).toEqual([]);
    const ev = declineObligation(o, 8, 4, true, 1);
    expect(ev.map((e) => e.type === 'memory' && [e.holderPersonId, e.strength])).toEqual([[1, -1], [8, -2]]);
    expect(declineObligation(o, null, 0, false, 1)).toHaveLength(1);
  });

  it('no late-season request before a clinch or elimination flag', () => {
    const s = rng(6);
    for (let i = 0; i < 200; i++) expect(drawLateRequest(false, profile('general_manager'), profile('owner'), i, s)).toBeNull();
    let any = 0;
    for (let i = 0; i < 200; i++) if (drawLateRequest(true, profile('general_manager', { draftInterest: 1 }), profile('owner'), i, s)) any++;
    expect(any).toBeGreaterThan(0);
  });

  it('learned page: labels only, each linked to incidents', () => {
    const labels = learnedLabels([
      { id: 1, kind: 'fired_coach', day: 400, detail: 2 }, { id: 2, kind: 'fired_coach', day: 900, detail: 1 },
      { id: 3, kind: 'asked_about', day: 950, detail: 'fourth downs' }, { id: 4, kind: 'asked_about', day: 960, detail: 'fourth downs' },
    ], 1000);
    expect(labels.map((l) => l.text)).toContain('has fired two coaches inside three seasons');
    expect(labels.map((l) => l.text)).toContain('asks about fourth downs');
    for (const l of labels) { expect(l.incidentIds.length).toBeGreaterThan(0); expect(l.text).not.toMatch(/\d/); }
  });
});

describe('general manager (L5.2.2 to L5.2.4)', () => {
  it('tolerance is 0 at trust 20 and one round at trust 80', () => {
    expect(requestTolerance(20)).toBe(0);
    expect(requestTolerance(10)).toBe(0);
    expect(requestTolerance(80)).toBe(1);
    expect(requestTolerance(50)).toBeCloseTo(0.5);
  });

  it('requests are granted inside tolerance, refused with the K7 gap outside it, and are orders under coach final say', () => {
    const gmFinal = arrangement('general_manager');
    expect(gmRequest(gmFinal, 'contracts', 'head_coach', 5, rec(80), 0.5, 1).kind).toBe('granted');
    expect(gmRequest(gmFinal, 'contracts', 'head_coach', 5, rec(30), 0.5, 1)).toMatchObject({ kind: 'refused', reason: 'valuation_gap' });
    const order = gmRequest(arrangement('head_coach'), 'contracts', 'head_coach', 5, rec(30), 0.5, 1);
    expect(order).toMatchObject({ kind: 'order', objects: true });
  });

  it('an outcome promise on a contract needs the warning where the coach lacks the field', () => {
    const p = arrangement('general_manager');
    expect(contractPromiseWarning(p, 'head_coach')).not.toBeNull();
    expect(contractPromiseWarning(arrangement('head_coach'), 'head_coach')).toBeNull();
    expect(() => contractPromise(p, 'head_coach', { playerPersonId: 3, outcome: true, warningShown: false, day: 1 })).toThrow();
    expect(contractPromise(p, 'head_coach', { playerPersonId: 3, outcome: false, warningShown: false, day: 1 }).kind).toBe('contract_ask');
    expect(contractPromiseKept('contract_ask', true, false)).toBe(true);
    expect(contractPromiseKept('contract_outcome', true, false)).toBe(false);
  });

  it('unplayed GM pick costs -2 a month unless the film case is shown; evaluations cap at 5', () => {
    expect(unplayedPickTrust(3, false)).toBe(-6);
    expect(unplayedPickTrust(3, true)).toBe(0);
    const hits = Array.from({ length: 8 }, (_, i) => ({ playerPersonId: i, day: 1, predicted: 'starter' as const, actual: 'starter' as const }));
    expect(scoreEvaluations(hits)).toBe(5);
    expect(scoreEvaluations([{ playerPersonId: 1, day: 1, predicted: 'starter', actual: 'practice_squad' }, { playerPersonId: 2, day: 1, predicted: 'starter', actual: 'rotation' }])).toBe(-1);
  });
});

describe('college and standing (L5.4, L5.3.3)', () => {
  it('president backing 0.5 + 0.4(fp - as), clamped to 0.1..0.9; board approval at $1M', () => {
    expect(presidentBacksChance(profile('university_president', { footballPriority: 1, academicStrictness: 0 }))).toBeCloseTo(0.9);
    expect(presidentBacksChance(profile('university_president', { footballPriority: 0.5, academicStrictness: 0.5 }))).toBeCloseTo(0.5);
    expect(needsBoardApproval(999_999)).toBe(false);
    expect(needsBoardApproval(1_000_000)).toBe(true);
  });

  it('booster mood: rivalry weighs double, access has diminishing returns, unhappy rich donors pay more of a buyout', () => {
    expect(boosterMoodAfter(50, { kind: 'game', resultVsExpectation: 1, rivalry: true }) - 50).toBe(2 * (boosterMoodAfter(50, { kind: 'game', resultVsExpectation: 1, rivalry: false }) - 50));
    expect(boosterMoodAfter(50, { kind: 'access', eventsGivenThisSeason: 0 })).toBeGreaterThan(boosterMoodAfter(50, { kind: 'access', eventsGivenThisSeason: 10 }));
    expect(donorBuyoutShare(0, 1)).toBeCloseTo(0.5);
    expect(donorBuyoutShare(100, 1)).toBe(0);
  });

  it('standing is a reproducible read in words, vague when unfamiliar, never a number', () => {
    const recent = { unreturnedGrants: 0, lastAnswers: [] as ('yes' | 'no')[], coachRefusals: 0, resultsVsExpectation: 0 };
    expect(readStanding(rec(90, 70, 10), recent)).toBe('Hard to read him yet.');
    expect(readStanding(rec(90, 70, 60), recent)).toBe('He is likely to back you on this.');
    expect(readStanding(rec(20, 30, 60), recent)).toBe('This will cost you with him.');
    expect(readStanding(rec(90, 70, 60), { ...recent, lastAnswers: ['no', 'no'] })).toBe('He has said no to the last two.');
    expect(readStanding(rec(55, 50, 60), recent)).toBe(readStanding(rec(55, 50, 60), recent));
  });

  it('params are well formed', () => {
    for (const p of PARAMS.params) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
  });
});
