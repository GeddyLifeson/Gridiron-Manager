// G-34 acceptance, part 1: the pick ledger (C7.2.1), trades of picks (C7.2.3), the selection order with rotation
// and awarded picks (C7.2.1, C7.2.2), compensatory picks (CBA App. V) and the declared pool (C7.1.1).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ParamFile, RuleKeyManifest } from '@gm/schema';
import {
  RULE_KEYS, PARAMS, createLedger, rollLedger, regularPickId, picksOf, tradePicks, resolveCondition, forfeitPick, addAwardedPicks, ledgerProblems,
  tieGroups, roundClubOrder, selectionOrder, orderProblems, bonusPoints, finalValues, topPercent, bracketRound, compensatoryAwards, supplementalAwards,
  firstEligibleDraft, isDraftEligible, buildPool, type PickLedger, type CfaMove, type PlayerSeason, type PoolCandidate,
} from '../../src/draft/index.ts';
import { draftOrder } from '../../src/postseason/index.ts';
import type { DraftSlot } from '../../src/postseason/draft-order.ts';
import { Ledger } from '../../src/standings/records.ts';
import { Games, PRO_RULES, fixedDraw, proLeague } from '../standings/fixture.ts';
import { readFileSync } from 'node:fs';
import { draftRules, REQUESTED, FILE_VALUES } from './fixtures.ts';

const LEAGUE_VALUES: { key: string; value: unknown; factId: string }[] = JSON.parse(readFileSync(new URL('../../../rules-data/data/league/proleague_2026.json', import.meta.url), 'utf8')).values;

const R = draftRules();
const CLUBS = Array.from({ length: 32 }, (_, i) => i + 1);
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const slots = (ids: readonly number[], tiers?: readonly number[]): DraftSlot[] => ids.map((teamId, i) => ({ pick: i + 1, teamId, tier: tiers?.[i] ?? 0 }));

describe('module files', () => {
  it('RULE_KEYS and PARAMS parse against the contract', () => {
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
  });
  it('every key the module names has a value: from the league rule file, or a requested fixture citing its source', () => {
    for (const k of RULE_KEYS) expect(R.keys(), k.key).toContain(k.key);
    for (const r of REQUESTED) expect(LEAGUE_VALUES.some((v) => v.key === r.key), `${r.key} is now in the rule file; drop the fixture`).toBe(false);
  });
  it('the fixture copy of rule file values matches the file', () => {
    for (const v of FILE_VALUES) expect(LEAGUE_VALUES.find((x) => x.key === v.key), v.key).toMatchObject(v);
  });
  it('the rule file values this module reads carry a fact row', () => {
    for (const k of RULE_KEYS) {
      const v = LEAGUE_VALUES.find((x) => x.key === k.key);
      if (v) expect(v.factId, k.key).toMatch(/^F-/);
    }
  });
});

describe('C7.2.1 the pick ledger', () => {
  const L = createLedger(2027, CLUBS, R);
  it('holds one pick per club per round for the current draft and three more (starting horizon)', () => {
    expect(L.lastYear).toBe(2030);
    expect(L.picks.length).toBe(32 * 7 * 4);
    expect(picksOf(L, 5, 2027).map((p) => p.round)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ledgerProblems(L)).toEqual([]);
  });
  it('rolls forward one draft at a time', () => {
    const r = rollLedger(L, R);
    expect(r.currentYear).toBe(2028);
    expect(r.lastYear).toBe(2031);
    expect(picksOf(r, 1, 2031)).toHaveLength(7);
  });
  it('a pick already traded cannot be traded again by its old owner (C7.2.3 edge case)', () => {
    const t1 = ok(tradePicks(L, { id: 't1', clubs: [1, 2], firstGives: [regularPickId(2027, 1, 1)], secondGives: [regularPickId(2027, 2, 2)] }));
    expect(t1.ledger.picks.find((p) => p.id === '2027-r1-c1')!.ownerClubId).toBe(2);
    const again = tradePicks(t1.ledger, { id: 't2', clubs: [1, 3], firstGives: ['2027-r1-c1'], secondGives: [] });
    expect(again.ok).toBe(false);
    expect(ledgerProblems(t1.ledger)).toEqual([]);
  });
  it('refuses picks outside the horizon and duplicate listings', () => {
    expect(tradePicks(L, { id: 'x', clubs: [1, 2], firstGives: ['2031-r1-c1'], secondGives: [] }).ok).toBe(false);
    expect(tradePicks(L, { id: 'x', clubs: [1, 2], firstGives: ['2027-r1-c1', '2027-r1-c1'], secondGives: [] }).ok).toBe(false);
  });
  it('a conditional pick locks both picks until season end, then exactly one moves', () => {
    const t = ok(tradePicks(L, { id: 'c', clubs: [4, 9], firstGives: [], secondGives: ['2027-r2-c9'], conditionals: [{ id: 'cond1', fromClubId: 4, ifMet: '2028-r2-c4', ifNotMet: '2028-r3-c4', condition: 'snap_share_50' }] }));
    expect(tradePicks(t.ledger, { id: 'y', clubs: [4, 7], firstGives: ['2028-r2-c4'], secondGives: [] }).ok).toBe(false);
    expect(ledgerProblems(t.ledger)).toEqual([]);
    const met = ok(resolveCondition(t.ledger, 'cond1', true));
    expect(met.ledger.picks.find((p) => p.id === '2028-r2-c4')!.ownerClubId).toBe(9);
    expect(met.ledger.picks.find((p) => p.id === '2028-r3-c4')!.ownerClubId).toBe(4);
    expect(met.ledger.picks.every((p) => p.lockedBy === null)).toBe(true);
    expect(resolveCondition(met.ledger, 'cond1', false).ok).toBe(false);
  });
  it('property: after any sequence of random trades every pick has exactly one known owner', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 1, max: 32 }), fc.integer({ min: 1, max: 32 }), fc.integer({ min: 1, max: 7 }), fc.integer({ min: 0, max: 3 })), { maxLength: 60 }), (moves) => {
      let l: PickLedger = createLedger(2027, CLUBS, R);
      moves.forEach(([a, b, round, dy], i) => {
        const mine = picksOf(l, a, 2027 + dy).find((p) => p.round === round);
        if (!mine) return;
        const r = tradePicks(l, { id: `p${i}`, clubs: [a, b], firstGives: [mine.id], secondGives: [] });
        if (r.ok) l = r.ledger;
      });
      expect(ledgerProblems(l)).toEqual([]);
      expect(new Set(l.picks.map((p) => p.id)).size).toBe(l.picks.length);
    }));
  });
});

describe('C7.2.1 order and rotation', () => {
  it('round one is the hand-off order; a forfeited pick shortens its round by one (rule 5)', () => {
    const L = ok(forfeitPick(createLedger(2027, CLUBS, R), '2027-r2-c3', 'discipline')).ledger;
    const order = selectionOrder(slots(CLUBS), new Map(CLUBS.map((c) => [c, c / 100])), L, R);
    expect(order.filter((s) => s.round === 1).map((s) => s.originalClubId)).toEqual(CLUBS);
    expect(order.filter((s) => s.round === 2)).toHaveLength(31);
    expect(order).toHaveLength(32 * 7 - 1);
    expect(orderProblems(order, L)).toEqual([]);
  });
  it('rule 4: a two-club tie swaps each round; in a three-club tie the top club drops to the bottom each round', () => {
    const s = slots([1, 2, 3, 4, 5]);
    const pct = new Map([[1, 0.25], [2, 0.25], [3, 0.5], [4, 0.5], [5, 0.5]]);
    const g = tieGroups(s, pct);
    expect(g).toEqual([[1, 2], [3, 4, 5]]);
    expect(roundClubOrder(g, 1)).toEqual([1, 2, 3, 4, 5]);
    expect(roundClubOrder(g, 2)).toEqual([2, 1, 4, 5, 3]);
    expect(roundClubOrder(g, 3)).toEqual([1, 2, 5, 3, 4]);
    expect(roundClubOrder(g, 4)).toEqual([2, 1, 3, 4, 5]);
  });
  it('clubs in different tiers never rotate together even on equal records', () => {
    expect(tieGroups(slots([1, 2], [0, 1]), new Map([[1, 0.5], [2, 0.5]]))).toEqual([[1], [2]]);
  });
  it('a club holding several picks in a round keeps each at its original slot', () => {
    const L = ok(tradePicks(createLedger(2027, CLUBS, R), { id: 't', clubs: [1, 30], firstGives: [], secondGives: ['2027-r1-c30'] })).ledger;
    const r1 = selectionOrder(slots(CLUBS), new Map(), L, R).filter((s) => s.round === 1);
    expect(r1.filter((s) => s.ownerClubId === 1).map((s) => s.overall)).toEqual([1, 30]);
  });
  it('compensatory picks follow their round in value order; equal-count and supplemental picks follow round 7', () => {
    let L = createLedger(2027, CLUBS, R);
    L = addAwardedPicks(L, [
      { id: 'a', round: 3, clubId: 5, kind: 'compensatory', compValue: 900 },
      { id: 'b', round: 3, clubId: 6, kind: 'compensatory', compValue: 1200 },
      { id: 'c', round: 7, clubId: 7, kind: 'compensatory', compValue: 400 },
      { id: 'd', round: 7, clubId: 8, kind: 'equal_count', compValue: 350 },
      { id: 'e', round: 7, clubId: 1, kind: 'supplemental', compValue: 0 },
    ]);
    const order = selectionOrder(slots(CLUBS), new Map(), L, R);
    const r3 = order.filter((s) => s.round === 3);
    expect(r3.slice(-2).map((s) => s.pickId)).toEqual(['b', 'a']);
    expect(order.slice(-3).map((s) => s.pickId)).toEqual(['c', 'd', 'e']);
    expect(r3.at(-1)!.inRound).toBe(34);
    expect(orderProblems(order, L)).toEqual([]);
  });
  it('builds from the G-14 hand-off (C3.5.1): champion last in every round, tied clubs rotate', () => {
    const LEAGUE = proLeague();
    // Clubs 1 to 16 each beat club i + 16: sixteen 1-0 clubs and sixteen 0-1 clubs.
    const g = new Games();
    for (let i = 1; i <= 16; i++) g.add(i, i + 16, 20, 10);
    const order = draftOrder(LEAGUE, g.list, PRO_RULES, fixedDraw(), new Map([[20, 1]]), 2);
    const ledger = new Ledger(LEAGUE, g.list, PRO_RULES);
    const pct = new Map(LEAGUE.map((c) => [c.id, ledger.pct(c.id)]));
    const sel = selectionOrder(order.slots, pct, createLedger(2027, LEAGUE.map((c) => c.id), R), R);
    expect(sel).toHaveLength(32 * 7);
    for (let r = 1; r <= 7; r++) expect(sel.filter((s) => s.round === r).at(-1)!.originalClubId).toBe(2);
    const r1 = sel.filter((s) => s.round === 1).map((s) => s.originalClubId);
    const r2 = sel.filter((s) => s.round === 2).map((s) => s.originalClubId);
    expect(r1).toEqual(order.slots.map((x) => x.teamId));
    // The fifteen 0-1 clubs out of the playoffs open round 1; in round 2 the first of them drops to the bottom.
    const losers = r1.slice(0, 15);
    expect(losers.every((c) => c > 16 && c !== 20)).toBe(true);
    expect(r2.slice(0, 15)).toEqual([...losers.slice(1), losers[0]]);
  });
});

describe('C7.2.2 compensatory picks (CBA App. V)', () => {
  const snaps = (sharePct: number) => ({ kind: 'snaps' as const, sharePct });
  it('para 2(b): honours and play points; kickers and punters by attempts', () => {
    const base = { personId: 1, averageYearlyCents: 0, firstTeamAllLeague: false, allConference: false };
    expect(bonusPoints({ ...base, participation: snaps(67) }, R)).toBe(67);
    expect(bonusPoints({ ...base, participation: snaps(24.99) }, R)).toBe(0);
    expect(bonusPoints({ ...base, firstTeamAllLeague: true, allConference: true, participation: snaps(80) }, R)).toBe(100);
    expect(bonusPoints({ ...base, allConference: true, participation: snaps(0) }, R)).toBe(5);
    expect(bonusPoints({ ...base, participation: { kind: 'kicker', fieldGoalsAttempted: 30, fieldGoalsMade: 25 } }, R)).toBe(85);
    expect(bonusPoints({ ...base, participation: { kind: 'punter', punts: 70, inside20: 30 } }, R)).toBe(100);
  });
  it('para 2(a): lowest pay ranks first with one point', () => {
    const ps: PlayerSeason[] = [3, 1, 2].map((p) => ({ personId: p, averageYearlyCents: p * 1000, firstTeamAllLeague: false, allConference: false, participation: snaps(0) }));
    expect([...finalValues(ps, R).entries()].sort((a, b) => a[0] - b[0])).toEqual([[1, 1], [2, 2], [3, 3]]);
  });
  it('para 3(b) brackets: top 5% round 3 ... top 35% round 7, beyond that nothing', () => {
    expect(bracketRound(5, R)).toBe(3);
    expect(bracketRound(5.01, R)).toBe(4);
    expect(bracketRound(15, R)).toBe(5);
    expect(bracketRound(25, R)).toBe(6);
    expect(bracketRound(35, R)).toBe(7);
    expect(bracketRound(35.1, R)).toBeNull();
    expect(topPercent(100, Array.from({ length: 100 }, (_, i) => i + 1))).toBe(1);
  });

  // 100 players with values 1..100: value v is in the top (101 - v) percent.
  const values = new Map(Array.from({ length: 100 }, (_, i) => [i + 1, i + 1]));
  const move = (personId: number, from: number, to: number, over: Partial<CfaMove> = {}): CfaMove => ({ personId, fromClubId: from, toClubId: to, accruedSeasons: 4, quarterback: false, qualifies: true, ...over });

  it('para 3(a): only a net loss earns picks; each loss is offset by a gain in an equal or higher bracket', () => {
    // Club 1 loses players in the top 3% (r3), top 9% (r4), top 20% (r6); gains one in the top 12% (r5).
    const r = compensatoryAwards(2027, [move(98, 1, 2), move(92, 1, 3), move(81, 1, 4), move(89, 5, 1)], values, R);
    const c1 = r.awards.filter((a) => a.clubId === 1);
    // The r5 gain cannot offset the r3 or r4 loss; it offsets the r6 loss. Net 2: r3 and r4 awarded.
    expect(c1.map((a) => a.round)).toEqual([3, 4]);
    // Club 5 lost one and gained none: one pick in the lost player's bracket.
    expect(r.awards.filter((a) => a.clubId === 5).map((a) => a.round)).toEqual([5]);
  });
  it('a player outside the top 35% or not qualifying is not a CFA', () => {
    const r = compensatoryAwards(2027, [move(60, 1, 2), move(99, 1, 2, { qualifies: false })], values, R);
    expect(r.awards).toEqual([]);
  });
  it('para 4: a non-quarterback with ten or more accrued seasons yields nothing before the end of round 5', () => {
    const r = compensatoryAwards(2027, [move(99, 1, 2, { accruedSeasons: 10 }), move(98, 3, 2, { accruedSeasons: 10, quarterback: true })], values, R);
    expect(r.awards.find((a) => a.clubId === 1)!.round).toBe(5);
    expect(r.awards.find((a) => a.clubId === 3)!.round).toBe(3);
  });
  it('para 3(a): at most four per club, the four highest kept', () => {
    const r = compensatoryAwards(2027, [100, 99, 98, 97, 96].map((p, i) => move(p, 1, 10 + i)), values, R);
    expect(r.awards.filter((a) => a.clubId === 1)).toHaveLength(4);
    expect(r.awards.some((a) => a.lostPersonId === 96)).toBe(false);
  });
  it('para 5: equal losses and gains earn one pick after round 7 only when lost value leads by more than 300', () => {
    const big = new Map([...values, [500, 1000], [501, 1000], [502, 600]]);
    const r = compensatoryAwards(2027, [move(500, 1, 2), move(501, 1, 3), move(502, 4, 1), move(70, 5, 1)], big, R);
    const eq = r.awards.find((a) => a.clubId === 1)!;
    expect(eq.kind).toBe('equal_count');
    expect(eq.value).toBe(2000 - 670);
    const small = compensatoryAwards(2027, [move(99, 1, 2), move(98, 3, 1)], values, R);
    expect(small.awards.filter((a) => a.clubId === 1)).toEqual([]);
  });
  it('the league total is capped at the number of clubs and supplemental selections fill the rest', () => {
    const many = new Map(Array.from({ length: 1000 }, (_, i) => [i + 1, i + 1]));
    const moves: CfaMove[] = [];
    for (let c = 1; c <= 12; c++) for (let k = 0; k < 4; k++) moves.push(move(1000 - c * 4 - k, c, 99));
    const r = compensatoryAwards(2027, moves, many, R);
    expect(r.awards).toHaveLength(32);
    expect(r.supplementalCount).toBe(0);
    const few = compensatoryAwards(2027, [move(1000, 1, 2)], many, R);
    expect(few.supplementalCount).toBe(31);
    expect(supplementalAwards(2027, 3, [9, 4, 7, 1], R).map((s) => [s.clubId, s.round])).toEqual([[9, 7], [4, 7], [7, 7]]);
  });
});

describe('C7.1.1 the declared pool', () => {
  it('CBA Art. 6 s.2(b) example: a December 2020 graduate is first eligible for the 2024 draft', () => {
    expect(firstEligibleDraft({ seasonYear: 2020, beforeSeasonStart: false }, R)).toBe(2024);
    expect(firstEligibleDraft({ seasonYear: 2021, beforeSeasonStart: true }, R)).toBe(2024);
    expect(isDraftEligible({ seasonYear: 2021, beforeSeasonStart: true }, 2023, R)).toBe(false);
  });
  const H = 24;
  const cand = (personId: number, over: Partial<PoolCandidate> = {}): PoolCandidate => ({
    personId, graduation: { seasonYear: 2022, beforeSeasonStart: true }, collegeEligibilityExhausted: false, seniorOptOut: false, declaration: null, priorEntryRevoked: false, ...over,
  });
  it('seniors enter automatically unless they opted out; underclassmen only by declaring; nobody fails the three-season test', () => {
    const deadline = 1000;
    const r = buildPool([
      cand(1, { collegeEligibilityExhausted: true }),
      cand(2, { collegeEligibilityExhausted: true, seniorOptOut: true }),
      cand(3),
      cand(4, { declaration: { atHour: 900, deadlineHour: deadline, revokedAtHour: null } }),
      cand(5, { declaration: { atHour: 900, deadlineHour: deadline, revokedAtHour: deadline + 72 } }),
      cand(6, { declaration: { atHour: 900, deadlineHour: deadline, revokedAtHour: deadline + 73 } }),
      cand(7, { graduation: { seasonYear: 2024, beforeSeasonStart: true }, collegeEligibilityExhausted: true }),
      cand(8, { declaration: { atHour: 900, deadlineHour: deadline, revokedAtHour: deadline + H }, priorEntryRevoked: true }),
    ], 2025, R);
    expect(r.pool.map((p) => [p.personId, p.reason])).toEqual([[1, 'exhausted'], [4, 'declared'], [6, 'late_revocation'], [8, 'second_revocation']]);
    expect(r.lostCollegeEligibility).toEqual([4, 6, 8]);
    expect(r.excluded.map((e) => e.personId)).toEqual([2, 3, 5, 7]);
  });
});
