// Cap sheet read model (team.cap, C6.2 to C6.4): charges, room, year columns and move previews come
// from the G-16 cap module and the G-10 rule values, cross-checked here by hand arithmetic.
import { describe, expect, it } from 'vitest';
import { cap } from '@gm/league';
import { buildProCapView, PARAMS, type ProCapInput } from '../../../src/read-models/cap-sheet/index.ts';
import { lookup, M, minimum, PRO, PRO_FILE, veteran } from './fixture.ts';

const CAP_2026 = 301200000 * 100; // F-cap-0042 in proleague_2026.json, in cents

function input(over: Partial<ProCapInput> = {}): ProCapInput {
  return {
    clubId: 3, leagueYear: 2026, phase: 'season', timing: 'on_or_before_june1', rules: PRO,
    contracts: [veteran(1, 10)], other: [], adjustmentCents: 0, june1Used: 0,
    cards: [{ personId: 10, name: 'Sam Field', position: 'QB' }], provenance: lookup(PRO_FILE), ...over,
  };
}

describe('cap sheet: pro club (C6.2.1, C6.2.2, C6.3.2)', () => {
  it('reads the cap from the rule set with its fact row, and computes room', () => {
    const v = buildProCapView(input());
    expect(v.capCents).toBe(CAP_2026);
    expect(v.capSource).toEqual({ key: 'cap.amount_2026', factId: 'F-cap-0042', status: 'Rulebook only' });
    expect(v.teamSalaryCents).toBe(7 * M); // 5M base + 2M proration
    expect(v.roomCents).toBe(CAP_2026 - 7 * M);
    expect(v.june1).toEqual({ allowed: 2, used: 0, source: { key: 'cap.june1_designations', factId: 'F-cap-0004', status: 'Rulebook only' } });
    expect(v.topN).toBe(51);
  });

  it('breaks the charge into parts and spreads the bonus over the contract years', () => {
    const row = buildProCapView(input()).rows[0]!;
    expect(row.name).toBe('Sam Field');
    expect(row.thisYear).toMatchObject({ baseCents: 5 * M, prorationCents: 2 * M, totalCents: 7 * M });
    expect(row.byYear.map((b) => b.chargeCents)).toEqual([7 * M, 7 * M, 7 * M, 7 * M, 7 * M]);
    expect(row.tranches[0]!.byYear.map((b) => b.cents)).toEqual([2 * M, 2 * M, 2 * M, 2 * M, 2 * M]);
    expect(row.remainingProrationCents).toBe(10 * M);
    expect(row.lastLeagueYear).toBe(2030);
  });

  it('shows years with no published cap as unknown, never estimated', () => {
    const v = buildProCapView(input());
    expect(v.years).toHaveLength(PARAMS.params[0]!.value);
    expect(v.years[0]!.capCents).toBe(CAP_2026);
    expect(v.years[1]).toMatchObject({ leagueYear: 2027, capCents: null, roomCents: null, committedCents: 7 * M, capSource: { factId: null } });
  });

  it('previews a release, a June 1 release and a trade before June 1', () => {
    const [release, june1, trade] = buildProCapView(input()).rows[0]!.moves;
    // Release: all 10M of proration accelerates; the charge rises from 7M to 10M.
    expect(release).toMatchObject({ kind: 'release', refused: null, deadThisYearCents: 10 * M, deadNextYearCents: 0, savingCents: -3 * M, roomAfterCents: CAP_2026 - 10 * M });
    // June 1 designation: this year's 2M stays, 8M moves to next year, full charge until June 2.
    expect(june1).toMatchObject({ kind: 'release_june1', deadThisYearCents: 2 * M, deadNextYearCents: 8 * M, savingCents: 5 * M, chargeUntilJune2Cents: 7 * M });
    expect(trade).toMatchObject({ kind: 'trade', deadThisYearCents: 10 * M, guaranteedOwedCents: 0 });
  });

  it('refuses a June 1 designation once the club has used its designations (cap.june1_designations)', () => {
    const june1 = buildProCapView(input({ june1Used: 2 })).rows[0]!.moves[1]!;
    expect(june1.refused).toMatch(/June 1 designations/);
  });

  it('after June 1 offers only a release and a trade, and splits the proration', () => {
    const v = buildProCapView(input({ timing: 'after_june1' }));
    expect(v.rows[0]!.moves.map((m) => m.kind)).toEqual(['release', 'trade']);
    expect(v.rows[0]!.moves[0]).toMatchObject({ deadThisYearCents: 2 * M, deadNextYearCents: 8 * M });
  });

  it('counts guaranteed salary still owed as dead money', () => {
    const g = veteran(1, 10);
    const years = g.contract.years.map((y) => (y.leagueYear <= 2027 ? cap.plainYear(y.leagueYear, 5 * M, cap.FULLY_GUARANTEED) : y));
    const row = buildProCapView(input({ contracts: [{ ...g, contract: { ...g.contract, years } }] })).rows[0]!;
    expect(row.moves[0]!.guaranteedOwedCents).toBe(10 * M);
    expect(row.moves[0]!.deadThisYearCents).toBe(20 * M);
  });

  it('in the offseason counts only the top N in full and recounts after a move', () => {
    const filler = Array.from({ length: 52 }, (_, i) => minimum(100 + i, 100 + i));
    const v = buildProCapView(input({ phase: 'offseason', contracts: [veteran(1, 10), ...filler] }));
    expect(v.countedInFull).toBe(51);
    expect(v.rows.filter((r) => !r.countedInFull)).toHaveLength(2);
    expect(v.rows[0]!.contractId).toBe(1); // largest charge first
    const reduced = v.rows.find((r) => !r.countedInFull)!;
    // A minimum deal outside the top N counts only base above twice the player's minimum: nothing (CBA Art. 13 s.6(a)(i)).
    expect(reduced.thisYear.totalCents).toBe(cap.minimumSalary(PRO, 2026, 0));
    expect(reduced.countsCents).toBe(0);
  });

  it('marks rookie contracts with their length from the rule set', () => {
    const r = veteran(2, 11, { rookieRound: 1 });
    const row = buildProCapView(input({ contracts: [r] })).rows[0]!;
    expect(row.rookie).toMatchObject({ round: 1, length: 4, lengthSource: { key: 'rookie.length_round_1', factId: 'F-cap-0006' } });
    expect(buildProCapView(input({ contracts: [veteran(3, 12, { rookieRound: null })] })).rows[0]!.rookie!.length).toBe(3);
  });

  it('lists dead money and adds booked future dead money to later years', () => {
    const v = buildProCapView(input({ other: [{ label: 'Released: J. Doe', amountCents: 3 * M, kind: 'dead' }], futureDead: { 2027: 4 * M } }));
    expect(v.other).toEqual([{ label: 'Released: J. Doe', amountCents: 3 * M, kind: 'dead' }]);
    expect(v.years[0]!.deadCents).toBe(3 * M);
    expect(v.teamSalaryCents).toBe(10 * M);
    expect(v.years[1]).toMatchObject({ deadCents: 4 * M, committedCents: 11 * M });
  });

  it('is pure: the same input gives the same view', () => {
    expect(JSON.stringify(buildProCapView(input()))).toBe(JSON.stringify(buildProCapView(input())));
  });
});
