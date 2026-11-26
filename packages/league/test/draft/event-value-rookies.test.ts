// G-34 acceptance, part 2: the draft event under a running pick clock (C7.3.1, M4.5.1), trades during the draft
// (C7.2.3 rule 4), the value chart (C7.5.1), rookie contracts and undrafted free agents (C7.4.1, C6.4.2).
import { describe, expect, it } from 'vitest';
import * as draft from '../../src/draft/index.ts';
import {
  createLedger, selectionOrder, openDraft, advance, submitPick, tradeDuringDraft, runDraft, boardDecider, clockLimitSec, dayOfRound, clockRemainingSec,
  isComplete, draftRights, ledgerProblems, fitChart, chartProblems, chartDrift, pickValue, offerTotals, rookieContract, undraftedPoolCents,
  chooseUdfaClub, udfaOfferBlock, type DraftState, type DraftDecider,
} from '../../src/draft/index.ts';
import { minimumSalary, increaseRuleBreach } from '../../src/cap/index.ts';
import type { DraftSlot } from '../../src/postseason/draft-order.ts';
import { draftRules, testDraw } from './fixtures.ts';

const R = draftRules();
const CLUBS = Array.from({ length: 32 }, (_, i) => i + 1);
const SLOTS: DraftSlot[] = CLUBS.map((teamId, i) => ({ pick: i + 1, teamId, tier: 0 }));
const POOL = Array.from({ length: 400 }, (_, i) => 1000 + i);
const MIN = 60;
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }>; };

function fresh(userClubId: number | null = null): DraftState {
  const ledger = createLedger(2027, CLUBS, R);
  const order = selectionOrder(SLOTS, new Map(CLUBS.map((c) => [c, c])), ledger, R);
  return openDraft({ ledger, order, pool: POOL, userClubId, startSec: 0 }, R);
}
const dayStart = (day: number) => (day - 1) * 24 * 3600;

describe('C7.3.1 the clock', () => {
  it('rule 1: 8, 7, 5, 5, 5, 5, 4 minutes from the rule file', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((r) => clockLimitSec(r, R) / MIN)).toEqual([8, 7, 5, 5, 5, 5, 4]);
  });
  it('rule 3: round 1 on day one, rounds 2 and 3 on day two, rounds 4 to 7 on day three', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((r) => dayOfRound(r, R))).toEqual([1, 2, 2, 3, 3, 3, 3]);
  });
  it('rule 5: there is no pause; the module exports no way to stop the clock', () => {
    expect(Object.keys(draft).filter((k) => /pause|stop|freeze/i.test(k))).toEqual([]);
    const s = advance(fresh(), 3 * MIN, R);
    expect(clockRemainingSec(s, R)).toBe(5 * MIN);
  });
  it('rule 2: an expired club may still pick later, but the next club goes on the clock at once and may pick first', () => {
    let s = advance(fresh(), 8 * MIN, R);
    expect(s.expired).toEqual([0]);
    expect(s.onClock).toBe(1);
    expect(s.clockStartSec).toBe(8 * MIN);
    s = ok(submitPick(s, { clubId: 2, personId: 1000, atSec: 9 * MIN }, R)).state;
    expect(submitPick(s, { clubId: 1, personId: 1000, atSec: 9 * MIN }, R).ok).toBe(false);
    s = ok(submitPick(s, { clubId: 1, personId: 1001, atSec: 10 * MIN }, R)).state;
    expect(s.made[0]).toMatchObject({ personId: 1001, late: true });
    expect(s.made[1]).toMatchObject({ personId: 1000, late: false });
    expect(s.onClock).toBe(2);
    expect(s.wire.map((w) => w.kind)).toContain('clock_expired');
  });
  it('a club not on the clock cannot pick; a taken player cannot be picked twice', () => {
    const s = fresh();
    expect(submitPick(s, { clubId: 5, personId: 1000, atSec: 10 }, R).ok).toBe(false);
    const s2 = ok(submitPick(s, { clubId: 1, personId: 1000, atSec: 10 }, R)).state;
    expect(submitPick(s2, { clubId: 2, personId: 1000, atSec: 20 }, R).ok).toBe(false);
  });
  it('the next club\'s clock starts the moment a pick is in', () => {
    const s = ok(submitPick(fresh(), { clubId: 1, personId: 1000, atSec: 100 }, R)).state;
    expect(s.onClock).toBe(1);
    expect(s.clockStartSec).toBe(100);
  });
});

describe('C7.2.3 rule 4: trades on the clock', () => {
  it('a trade of the pick on the clock before it runs out hands the clock to the new owner with the time left', () => {
    let s = fresh();
    s = ok(tradeDuringDraft(s, { id: 't', clubs: [1, 9], firstGives: ['2027-r1-c1'], secondGives: ['2027-r1-c9', '2027-r2-c9'] }, 6 * MIN, R)).state;
    expect(clockRemainingSec(s, R)).toBe(2 * MIN);
    expect(submitPick(s, { clubId: 1, personId: 1000, atSec: 7 * MIN }, R).ok).toBe(false);
    s = ok(submitPick(s, { clubId: 9, personId: 1000, atSec: 7 * MIN }, R)).state;
    expect(s.made[0]!.clubId).toBe(9);
    expect(ledgerProblems(s.ledger)).toEqual([]);
  });
  it('after the clock runs out the trade of that pick is refused', () => {
    const r = tradeDuringDraft(fresh(), { id: 't', clubs: [1, 9], firstGives: ['2027-r1-c1'], secondGives: ['2027-r2-c9'] }, 8 * MIN, R);
    expect(r.ok).toBe(false);
  });
  it('a used pick cannot be traded', () => {
    const s = ok(submitPick(fresh(), { clubId: 1, personId: 1000, atSec: 10 }, R)).state;
    expect(tradeDuringDraft(s, { id: 't', clubs: [1, 9], firstGives: ['2027-r1-c1'], secondGives: [] }, 20, R).ok).toBe(false);
  });
});

describe('C7.3.1 acceptance: a full draft', () => {
  const board = (club: number) => [...POOL].sort((a, b) => ((a * 31 + club * 7) % 97) - ((b * 31 + club * 7) % 97) || a - b);
  it('seven rounds with 32 AI clubs complete with no pick left unassigned, across three days', () => {
    const { state, awaitingUser } = runDraft(fresh(), { deciderFor: () => boardDecider(board, 90), dayStartSec: dayStart }, R);
    expect(awaitingUser).toBe(false);
    expect(isComplete(state)).toBe(true);
    const rights = draftRights(state);
    expect(rights).toHaveLength(224);
    expect(new Set(rights.map((r) => r.personId)).size).toBe(224);
    expect(state.made.every((m) => m !== null)).toBe(true);
    expect(state.ledger.picks.filter((p) => p.year === 2027).every((p) => p.status === 'used')).toBe(true);
    expect(state.wire.filter((w) => w.kind === 'day_closed')).toHaveLength(2);
    expect(state.made.at(-1)!.atSec).toBeGreaterThanOrEqual(dayStart(3));
    expect(ledgerProblems(state.ledger)).toEqual([]);
  });
  it('slow AI clubs that let the clock expire are overtaken and still pick; the draft still completes', () => {
    const slow: DraftDecider = { choose: (v) => boardDecider(board, v.clubId % 5 === 0 ? 10 * MIN : 60).choose(v) };
    const { state } = runDraft(fresh(), { deciderFor: () => slow, dayStartSec: dayStart }, R);
    expect(isComplete(state)).toBe(true);
    expect(state.made.some((m) => m!.late)).toBe(true);
  });
  it('M4.5.1: the run stops when the user\'s club is up; every pick of his club logs his stance, silence included', () => {
    const user = 3;
    const deciderFor = (club: number, late: boolean) => (club === user && !late ? null : boardDecider(board, 60));
    let { state, awaitingUser } = runDraft(fresh(user), { deciderFor, dayStartSec: dayStart }, R);
    expect(awaitingUser).toBe(true);
    expect(state.onClock).toBe(2);
    state = ok(submitPick(state, { clubId: user, personId: state.available[0]!, atSec: state.nowSec + 30, decidedBy: 'user', stance: { kind: 'made' } }, R)).state;
    // Second turn: the user lets the clock run out; his personnel man files after expiry.
    ({ state, awaitingUser } = runDraft(state, { deciderFor, dayStartSec: dayStart }, R));
    expect(awaitingUser).toBe(true);
    state = advance(state, state.clockStartSec + clockLimitSec(state.order[state.onClock!]!.round, R), R);
    for (;;) {
      ({ state, awaitingUser } = runDraft(state, { deciderFor, dayStartSec: dayStart }, R));
      if (!awaitingUser) break;
      state = ok(submitPick(state, { clubId: user, personId: state.available[0]!, atSec: state.nowSec + 1, decidedBy: 'user', stance: { kind: 'insist', personId: state.available[0]!, trade: false } }, R)).state;
    }
    expect(isComplete(state)).toBe(true);
    const mine = state.order.filter((_, i) => state.made[i]!.clubId === user);
    expect(state.log).toHaveLength(mine.length);
    expect(state.log[0]!.stance.kind).toBe('made');
    expect(state.log[1]).toMatchObject({ decidedBy: 'fallback_after_expiry', late: true, stance: { kind: 'silent' } });
  });
});

describe('C7.5.1 the value chart', () => {
  const samples = (seed: number) => {
    const d = testDraw(seed);
    const out: { overall: number; value: number }[] = [];
    for (let k = 0; k < 400; k++) for (let o = 1; o <= 224; o++) out.push({ overall: o, value: 1000 / Math.sqrt(o) * (0.5 + d.unit('x')) });
    return out;
  };
  it('the fitted chart is strictly falling, and a refit from a new soak run moves no slot more than 10 percent', () => {
    const a = fitChart(samples(1), 224);
    const b = fitChart(samples(2), 224);
    expect(chartProblems(a)).toEqual([]);
    expect(chartProblems(b)).toEqual([]);
    expect(chartDrift(a, b)).toBeLessThan(0.1);
  });
  it('a plateau in the samples is stepped down so the chart stays strictly falling', () => {
    const c = fitChart([{ overall: 1, value: 10 }, { overall: 2, value: 10 }, { overall: 3, value: 12 }, { overall: 4, value: 1 }], 4);
    expect(chartProblems(c)).toEqual([]);
  });
  it('rule 3 of C7.2.3: a future pick is priced one round later; a current pick takes its slot', () => {
    const chart = { values: Array.from({ length: 224 }, (_, i) => 224 - i) };
    const L = createLedger(2027, CLUBS, R);
    const order = selectionOrder(SLOTS, new Map(), L, R);
    const slotOf = (id: string) => order.find((s) => s.pickId === id)?.overall;
    const now = L.picks.find((p) => p.id === '2027-r1-c5')!;
    const later = L.picks.find((p) => p.id === '2028-r1-c5')!;
    expect(pickValue(chart, now, L, 32, R, slotOf)).toBe(chart.values[4]);
    const mid2 = 32 + Math.round(0.5 * 31) + 1;
    expect(pickValue(chart, later, L, 32, R, slotOf)).toBe(chart.values[mid2 - 1]);
    const t = offerTotals(chart, [now], [later], L, 32, R, slotOf);
    expect(t.give).toBeGreaterThan(t.get);
  });
});

describe('C7.4.1 rookie contracts and undrafted free agents', () => {
  it('a drafted player\'s contract is the required tender: fixed length, the minimum each year, within the 25 percent rule', () => {
    const r = ok(rookieContract({ id: 1, round: 1, overall: 1, firstLeagueYear: 2026 }, R));
    expect(r.contract.years).toHaveLength(4);
    r.contract.years.forEach((y, i) => expect(y.base.amountCents).toBe(minimumSalary(R, 2026 + i, i)));
    expect(increaseRuleBreach(r.contract, R)).toBeNull();
  });
  it('a slot scale adds its bonus and salary; a scale breaking the 25 percent rule is refused', () => {
    const fine = { year: 2026, slot: () => ({ signingBonusCents: 400_000_00, extraBaseCents: [0, 0, 0, 0] }) };
    const r = ok(rookieContract({ id: 1, round: 2, overall: 40, firstLeagueYear: 2026, scale: fine }, R));
    expect(r.contract.tranches[0]!.amountCents).toBe(400_000_00);
    const steep = { year: 2026, slot: () => ({ signingBonusCents: 0, extraBaseCents: [0, 0, 0, 5_000_000_00] }) };
    expect(rookieContract({ id: 2, round: 2, overall: 40, firstLeagueYear: 2026, scale: steep }, R).ok).toBe(false);
  });
  it('undrafted rookies sign three-year contracts', () => {
    expect(ok(rookieContract({ id: 3, round: null, overall: null, firstLeagueYear: 2026, signingBonusCents: 10_000_00 }, R)).contract.years).toHaveLength(3);
  });
  it('the undrafted bonus pool reads the latest published year and says when it is not the draft year', () => {
    expect(undraftedPoolCents(R, 2026)).toEqual({ cents: 172_337_00, basisYear: 2024, exact: false });
    expect(undraftedPoolCents(R, 2021)).toEqual({ cents: 160_000_00, basisYear: 2021, exact: true });
  });
  it('no offer may exceed the club pool or the roster limit', () => {
    const o = { clubId: 1, bonusCents: 20_000_00, depthAhead: 2, coachCalled: false, distanceFromHome: 100 };
    expect(udfaOfferBlock(o, 160_000_00, 172_337_00, 80, 90)).toMatch(/pool/);
    expect(udfaOfferBlock(o, 0, 172_337_00, 90, 90)).toMatch(/limit/);
    expect(udfaOfferBlock(o, 0, 172_337_00, 89, 90)).toBeNull();
  });
  it('the player chooses by bonus, depth ahead, a call and distance; every factor is recorded', () => {
    const offers = [
      { clubId: 1, bonusCents: 5_000_00, depthAhead: 5, coachCalled: false, distanceFromHome: 2000 },
      { clubId: 2, bonusCents: 25_000_00, depthAhead: 1, coachCalled: true, distanceFromHome: 100 },
    ];
    const r = chooseUdfaClub(77, offers, testDraw(3));
    expect(r.clubId).toBe(2);
    expect(r.factors).toHaveLength(2);
    expect(r.factors.every((f) => Number.isFinite(f.total))).toBe(true);
    expect(chooseUdfaClub(77, [], testDraw(3)).clubId).toBeNull();
  });
});
