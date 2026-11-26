// G-76 K7.5.1 and K7.5.2: the AI college roster builder. Mechanics and limits stay in league.recruiting and league.college.
import { describe, expect, it } from 'vitest';
import { PROB_FLOOR } from '@gm/schema';
import {
  P, agreementTerms, budgetSplit, committable, generateCollegeBuilder, hoursSplit, keepsRecruiting, offersWanted, placeNeeds, placeSplit, recruitBoard,
  retentionPlan, transferTargets, trimToLimit, valuer, type CollegeRosterPhilosophy, type OwnPlayer, type Recruit,
} from '../../src/gm/index.ts';
import { POSITIONS, corr, ctx, player, rng } from './fixtures.ts';

const base = generateCollegeBuilder({ normal: () => 0, uniform: () => 0.5 }, 5, POSITIONS, 0.18);
const builder = (over: Partial<CollegeRosterPhilosophy> = {}): CollegeRosterPhilosophy => ({ ...base, ...over });
const recruit = (position: string, grade: number, projected: number | null, over: Partial<Recruit> = {}): Recruit => ({
  ...player(position, grade, { age: 18, projected: projected === null ? null : { mean: projected, variance: 64 } }),
  region: 'far', signChance: 0.3, committedElsewhere: false, lowerSource: false, ...over,
});
const sum = (xs: Iterable<number>) => [...xs].reduce((s, x) => s + x, 0);

describe('K7.1.2 every field of the college record is read', () => {
  it('changing each field changes a decision', () => {
    const raw = recruit('WR', 50, 80), ready = recruit('WR', 62, 62);
    const board = (b: CollegeRosterPhilosophy) => recruitBoard(b, [raw, ready], [], new Set(['home']), ctx()).map((r) => r.personId);
    expect(board(builder({ developVsBuy: 1 }))[0]).toBe(raw.personId);
    expect(placeSplit(builder({ highSchoolVsTransfer: 0.8 }), 20)).toEqual({ highSchool: 16, transfer: 4 });
    const near = recruit('WR', 55, 70, { region: 'home' }), far = recruit('WR', 56, 71);
    expect(recruitBoard(builder({ regionalFocus: 1 }), [near, far], [], new Set(['home']), ctx())[0]!.personId).toBe(near.personId);
    expect(recruitBoard(builder({ regionalFocus: 0 }), [near, far], [], new Set(['home']), ctx())[0]!.personId).toBe(far.personId);
    expect(agreementTerms(builder({ lockIn: 0 }), 4)).toEqual({ years: 1, buyoutShare: 0 });
    expect(agreementTerms(builder({ lockIn: 1 }), 4).years).toBe(4);
    expect(valuer(builder({ timeHorizon: 0.9 })).philosophy.timeHorizon).toBe(0.9);
    const qb = { ...base.positionValues, QB: 1.4 };
    expect(placeNeeds(builder({ positionValues: qb }), { QB: { open: 1, target: 4 } })[0]!.need).toBeGreaterThan(placeNeeds(base, { QB: { open: 1, target: 4 } })[0]!.need);
  });
});

describe('K7.5.1 boards, offers and hours', () => {
  it('the board weighs projection heavily and the transfer market weighs the grade today', () => {
    const raw = recruit('CB', 48, 82), ready = recruit('CB', 60, 60, { costCentsByYear: [] });
    expect(recruitBoard(base, [raw, ready], [], new Set(), ctx())[0]!.personId).toBe(raw.personId);
    expect(transferTargets(base, [raw, ready], [], ctx())[0]!.personId).toBe(ready.personId);
  });
  it('need by opening places moves a position up the board', () => {
    const qb = recruit('WR', 60, 75), cb = recruit('CB', 60, 75);
    const needs = placeNeeds(base, { CB: { open: 4, target: 8 }, WR: { open: 0, target: 8 } });
    expect(recruitBoard(base, [qb, cb], needs, new Set(), ctx())[0]!.personId).toBe(cb.personId);
  });
  it('offers are a multiple of open places inside the 3 to 20 spread, more for programs that lose battles', () => {
    expect(offersWanted(25, 8.5, 0.5)).toBe(Math.round(25 * 8.5));
    expect(offersWanted(25, 8.5, 0.9)).toBeGreaterThan(offersWanted(25, 8.5, 0.5));
    expect(offersWanted(25, 8.5, 0.1)).toBeLessThan(offersWanted(25, 8.5, 0.5));
    for (const loss of [0, 0.25, 0.5, 0.75, 1]) for (const per of [1, 8.5, 30]) {
      const m = offersWanted(10, per, loss) / 10;
      expect(m).toBeGreaterThanOrEqual(P('college.offerMultipleMin'));
      expect(m).toBeLessThanOrEqual(P('college.offerMultipleMax'));
    }
    expect(offersWanted(0, 8.5, 0.5)).toBe(0);
    const rows = recruitBoard(base, Array.from({ length: 30 }, (_, i) => recruit('WR', 50 + i, 70 + i)), [], new Set(), ctx());
    // Many offers are ones the school would not take a commitment on.
    expect(committable(rows, 3).length).toBeLessThan(offersWanted(3, 8.5, 0.5));
    expect(committable(rows, 3)).toEqual(rows.slice(0, committable(rows, 3).length).map((r) => r.personId));
  });
  it('hours follow board score times chance to sign, inside the contact cap, and none are lost', () => {
    const r = rng(3);
    const pool = Array.from({ length: 40 }, () => recruit('WR', 45 + r.int(30), 60 + r.int(30), { signChance: r.uniform() }));
    const rows = recruitBoard(base, pool, [], new Set(), ctx());
    const split = hoursSplit(60, rows, 6);
    expect(sum(split.values())).toBe(60);
    for (const h of split.values()) expect(h).toBeLessThanOrEqual(6);
    const w = rows.map((x) => x.score * x.signChance), got = rows.map((x) => split.get(x.personId) ?? 0);
    expect(corr(w, got)).toBeGreaterThan(0.6);
    // A prospect he has no chance with gets nothing; more hours than the caps allow are not invented.
    expect(hoursSplit(10, [{ personId: 1, score: 5, signChance: 0 }], 6).size).toBe(0);
    expect(sum(hoursSplit(100, rows.slice(0, 3), 6).values())).toBe(18);
    expect(hoursSplit(60, rows, 6)).toEqual(split);
  });
  it('flips: he keeps recruiting above the floor, and below it only with the floor chance (MA-52)', () => {
    expect(keepsRecruiting(P('college.flipFloor') + 0.01, 0.99)).toBe(true);
    expect(keepsRecruiting(0.01, 0.5)).toBe(false);
    expect(keepsRecruiting(0.01, PROB_FLOOR / 2)).toBe(true);
  });
  it('class quality follows what the staff can sign, with year to year variation', () => {
    // Stronger programs have better chances with the same prospects; their expected class by this board is better.
    const quality = (edge: number, seed: number) => {
      const r = rng(seed);
      const pool = Array.from({ length: 200 }, () => { const gr = 40 + r.int(40); return recruit('WR', gr, gr + 10, { signChance: Math.min(1, Math.max(0, edge - (gr - 40) / 80 + 0.3 * r.uniform())) }); });
      const rows = recruitBoard(base, pool, [], new Set(), ctx());
      const hours = hoursSplit(300, rows, 10);
      const byId = new Map(pool.map((p) => [p.personId, p]));
      let num = 0, den = 0;
      for (const [id, h] of hours) { const p = byId.get(id)!; num += h * p.signChance * p.grade.mean; den += h * p.signChance; }
      return num / den;
    };
    const strong = [1, 2, 3, 4].map((s) => quality(0.9, s)), weak = [1, 2, 3, 4].map((s) => quality(0.4, s));
    expect(Math.min(...strong)).toBeGreaterThan(Math.max(...weak));
    expect(new Set(strong.map((x) => x.toFixed(3))).size).toBeGreaterThan(1);
  });
});

describe('K7.5.2 retention, the budget and the roster limit', () => {
  const own = (position: string, grade: number, leaveRisk: number, askCents: number): OwnPlayer => ({ view: player(position, grade, { age: 20 }), leaveRisk, askCents });
  it('retention money goes from the top of surplus times leave risk and never passes the budget', () => {
    const players = [own('QB', 75, 0.6, 80_000_000), own('WR', 70, 0.9, 30_000_000), own('CB', 72, 0.0, 30_000_000), own('RB', 41, 0.9, 30_000_000)];
    const plan = retentionPlan(base, players, 100_000_000, ctx());
    expect(plan[0]!.personId).toBe(players[0]!.view.personId);
    expect(plan.map((o) => o.personId)).not.toContain(players[2]!.view.personId);
    expect(sum(plan.map((o) => o.offerCents))).toBeLessThanOrEqual(100_000_000);
    for (const o of plan) expect(o.offerCents).toBeLessThanOrEqual(players.find((p) => p.view.personId === o.personId)!.askCents);
    expect(retentionPlan(base, players, 0, ctx())).toEqual([]);
  });
  it('the budget split follows payShape and position values and never exceeds the budget', () => {
    const roster = POSITIONS.flatMap((pos) => [player(pos, 78), player(pos, 62), player(pos, 50)]);
    const stars = budgetSplit(builder({ payShape: 1 }), roster, 2_000_000_000, ctx());
    const spread = budgetSplit(builder({ payShape: 0 }), roster, 2_000_000_000, ctx());
    const top = (m: Map<number, number>) => Math.max(...m.values()) / sum(m.values());
    expect(top(stars.byPlayer)).toBeGreaterThan(top(spread.byPlayer));
    for (const s of [stars, spread]) { expect(sum(s.byPlayer.values())).toBeLessThanOrEqual(2_000_000_000); expect(sum(Object.values(s.byPosition))).toBe(sum(s.byPlayer.values())); }
    const loved = budgetSplit(builder({ positionValues: { ...base.positionValues, CB: 1.5 } }), roster, 2_000_000_000, ctx());
    const even = budgetSplit(base, roster, 2_000_000_000, ctx());
    expect(loved.byPosition.CB!).toBeGreaterThan(even.byPosition.CB!);
  });
  it('lower-division and two-year players are a source for a builder who lives in the market, by need', () => {
    const juco = recruit('CB', 58, 60, { lowerSource: true }), same = recruit('CB', 58.5, 60);
    const needs = placeNeeds(base, { CB: { open: 6, target: 8 } });
    expect(transferTargets(builder({ highSchoolVsTransfer: 0.1 }), [juco, same], needs, ctx())[0]!.personId).toBe(juco.personId);
    expect(transferTargets(builder({ highSchoolVsTransfer: 1 }), [juco, same], needs, ctx())[0]!.personId).toBe(same.personId);
  });
  it('to reach the limit he cuts from the bottom of his board, exactly as many as needed', () => {
    const roster = Array.from({ length: 110 }, (_, i) => player(POSITIONS[i % POSITIONS.length]!, 40 + (i % 37)));
    const out = trimToLimit(base, roster, 105, ctx());
    expect(out.length).toBe(5);
    expect(trimToLimit(base, roster.slice(0, 100), 105, ctx())).toEqual([]);
    const worst = Math.max(...out.map((id) => roster.find((v) => v.personId === id)!.grade.mean));
    expect(roster.filter((v) => !out.includes(v.personId)).filter((v) => v.position === 'QB').every((v) => v.grade.mean >= 40)).toBe(true);
    expect(worst).toBeLessThan(60);
  });
});
