// G-16 acceptance: cap charges, proration, cuts, tags and the rookie scale match hand-worked cases from C6
// and the worked examples printed in the CBA itself. Each test names the bible leaf it covers. Rule values
// come from fixtures.ts, where each cites its fact row (or the CBA line for keys still owed by G-10).
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ParamFile, RuleKeyManifest, ContractRecord } from '@gm/schema';
import {
  fromTerms, plainYear, FULLY_GUARANTEED, NOT_GUARANTEED, prorationSchedule, prorationFor, remainingProration, yearCharge,
  reducedOffseasonCharge, teamCapPosition, fitsUnderCap, minimumSalary, qualifyingContract, releaseCharges, tradeCharges, offsetCreditCents,
  restructure, extend, payCut, capPercentageAverage, nonExclusiveFranchiseTender, exclusiveFranchiseTender, transitionTender,
  thirdFranchiseTender, checkTag, averageOfRanks, article10Salary, TAG_POSITIONS, rookieLength, rookieSalary, maxAnnualIncrease, increaseRuleBreach,
  checkRookieContract, optionTier, optionSalary, escalatorLevel, escalatorRaise, settleYear, cashInYear, cashFloor, totalValueCents,
  RULE_KEYS, PARAMS, type CapContract, type CapYear, type TagYear, type TagPosition, type ReleaseInput,
} from '../../src/cap/index.ts';
import { capRules, FIXTURE_VALUES, $, M } from './fixtures.ts';

const R = capRules();

function contract(id: number, bases: readonly number[], firstYear: number, signingBonus = 0, guaranteeYears: readonly number[] = []): CapContract {
  return {
    id, form: 'veteran', offset: false,
    years: bases.map((b, i) => plainYear(firstYear + i, b, guaranteeYears.includes(firstYear + i) ? FULLY_GUARANTEED : NOT_GUARANTEED)),
    tranches: signingBonus > 0 ? [{ amountCents: signingBonus, firstLeagueYear: firstYear, paidLeagueYear: firstYear, source: 'signing', guarantee: FULLY_GUARANTEED }] : [],
  };
}
const total = (m: ReadonlyMap<number, number>) => [...m.values()].reduce((s, v) => s + v, 0);

/** Hand case "veteran": four years 2026 to 2029, $20M signing bonus, bases $10M, $12M, $14M, $16M. */
const VET = contract(1, [M(10), M(12), M(14), M(16)], 2026, M(20));
const offseason = (over: Partial<ReleaseInput> = {}): ReleaseInput => ({
  leagueYear: 2027, timing: 'on_or_before_june1', basePaidCents: 0, earnedThisYearCents: 0, reason: 'cap', june1Designation: false, designationsUsed: 0, ...over,
});

describe('module files', () => {
  it('RULE_KEYS and PARAMS parse against the contract', () => {
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
  });
  it('every rule key the module names has a fixture value', () => {
    const fixture = new Set(FIXTURE_VALUES.map((v) => v.key));
    for (const k of RULE_KEYS) expect(fixture.has(k.key), k.key).toBe(true);
  });
});

describe('C6.1.1 contract record', () => {
  it('reads stored terms: signing bonus, option bonus, roster bonuses, incentives, voidable year', () => {
    const g = { skill: false, cap: false, injury: false };
    const terms = {
      kind: 'player', form: 'veteran', signingBonusCents: M(8), signingBonusPaidOn: { seasonYear: 2026, dayIndex: 70 }, offset: true, noTrade: false,
      years: [2026, 2027, 2028, 2029].map((leagueYear) => ({
        leagueYear, baseSalary: { amountCents: M(3), guarantee: g },
        optionBonus: leagueYear === 2027 ? { amountCents: M(3), guarantee: g } : null,
        rosterBonuses: [{ basis: 'dated', date: { seasonYear: leagueYear, dayIndex: 75 }, amountCents: M(1), guarantee: g }, { basis: 'per_game', date: null, amountCents: $(510000), guarantee: g }],
        workoutBonusCents: $(100000),
        incentives: [{ id: 'a', triggerKey: 'sacks', threshold: 10, amountCents: $(500000), likelyToBeEarned: true }, { id: 'b', triggerKey: 'pro_bowl', threshold: 1, amountCents: M(1), likelyToBeEarned: false }],
        voidable: leagueYear === 2029, option: 'none',
      })),
    } as const;
    const rec = ContractRecord.parse({ id: 9, personId: 1, teamId: 1, signed: { seasonYear: 2026, dayIndex: 70 }, agentId: null, state: 'active', summaryKey: null, terms });
    if (rec.terms.kind !== 'player') throw new Error('player terms expected');
    const c = fromTerms(rec.id, rec.terms);
    // Signing bonus over 2026-2028 (2029 is the player's to void): $8M / 3. Option bonus over 2027-2028: $1.5M each.
    const sched = prorationSchedule(c, R);
    expect(sched.get(2026)).toBe(266666667);
    expect(sched.get(2027)).toBe(266666667 + M(1.5));
    expect(sched.get(2028)).toBe(266666666 + M(1.5));
    expect(sched.get(2029)).toBeUndefined();
    // 2026 charge: base 3M + proration 2,666,666.67 + dated 1M + per game 510k + workout 100k + likely 500k.
    expect(yearCharge(c, 2026, R).totalCents).toBe(M(3) + 266666667 + M(1) + $(510000) + $(100000) + $(500000));
  });

  it('acceptance: yearly cap charges plus the unlikely incentives equal total money', () => {
    const c = contract(2, [M(1), M(2), M(3)], 2026, M(6));
    const charges = c.years.reduce((s, y) => s + yearCharge(c, y.leagueYear, R).totalCents, 0);
    expect(charges).toBe(totalValueCents(c));
  });
});

describe('C6.2.2 signing bonus proration', () => {
  it('straight line: $10M over five years is $2M a year', () => {
    const c = contract(3, [M(1), M(1), M(1), M(1), M(1)], 2026, M(10));
    expect([...prorationSchedule(c, R).values()]).toEqual([M(2), M(2), M(2), M(2), M(2)]);
  });
  it('at most five years: a seven-year contract spreads $10M over its first five years', () => {
    const c = contract(4, Array(7).fill(M(1)), 2026, M(10));
    const s = prorationSchedule(c, R);
    expect([...s.keys()]).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(total(s)).toBe(M(10));
  });
  it('uneven cents go one each to the earliest years', () => {
    const c = contract(5, [M(1), M(1), M(1)], 2026, 1000);
    expect([...prorationSchedule(c, R).values()]).toEqual([334, 333, 333]);
  });
  it('2026 first overall pick: $38,111,344 signing bonus is $9,527,836 a year over four years (bible C6.4.2)', () => {
    const c = contract(6, [M(1), M(1), M(1), M(1)], 2026, $(38111344));
    expect([...prorationSchedule(c, R).values()]).toEqual(Array(4).fill($(9527836)));
  });
  it('property: proration sums to the bonus and never spans more than five years', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 2_000_000_000 }), (n, bonus) => {
      const c = contract(7, Array(n).fill(M(1)), 2026, bonus);
      const s = prorationSchedule(c, R);
      return total(s) === bonus && s.size <= 5 && s.size === Math.min(n, 5);
    }));
  });
});

describe('C6.2.1 team salary, top 51, room', () => {
  const vets = Array.from({ length: 51 }, (_, i) => ({ contract: contract(100 + i, [M(5)], 2026), player: { creditedSeasons: 5, undraftedRookie: false } }));
  it('offseason: contracts outside the top 51 count only Paragraph 5 salary above twice the minimum', () => {
    const young = { contract: contract(200, [M(2)], 2026), player: { creditedSeasons: 0, undraftedRookie: false } };
    // Twice the 2026 zero-season minimum is $1,770,000; $2,000,000 base counts $230,000.
    expect(reducedOffseasonCharge(young.contract, 2026, young.player, R).totalCents).toBe($(230000));
    const p = teamCapPosition({ leagueYear: 2026, phase: 'offseason', contracts: [...vets, young], other: [], adjustmentCents: 0 }, R);
    expect(p.countedInFull).toBe(51);
    expect(p.teamSalaryCents).toBe(51 * M(5) + $(230000));
    expect(p.roomCents).toBe(M(301.2) - p.teamSalaryCents);
  });
  it('offseason: an undrafted rookie counts only salary above the undrafted rookie minimum', () => {
    const udfa = contract(201, [M(1)], 2026);
    expect(reducedOffseasonCharge(udfa, 2026, { creditedSeasons: 0, undraftedRookie: true }, R).totalCents).toBe($(115000));
  });
  it('offseason: proration of a contract outside the top 51 still counts', () => {
    const c = contract(202, [$(885000), $(885000)], 2026, $(200000));
    expect(reducedOffseasonCharge(c, 2026, { creditedSeasons: 0, undraftedRookie: false }, R).totalCents).toBe($(100000));
  });
  it('season: every contract counts in full; tenders and dead money count', () => {
    const young = { contract: contract(200, [M(2)], 2026), player: { creditedSeasons: 0, undraftedRookie: false } };
    const p = teamCapPosition({
      leagueYear: 2026, phase: 'season', contracts: [...vets, young],
      other: [{ label: 'dead: released 300', amountCents: M(4), kind: 'dead' }, { label: 'tender', amountCents: M(3), kind: 'tender' }],
      adjustmentCents: M(1),
    }, R);
    expect(p.teamSalaryCents).toBe(51 * M(5) + M(2) + M(4) + M(3));
    expect(p.roomCents).toBe(M(301.2) + M(1) - p.teamSalaryCents);
    expect(fitsUnderCap(p, p.roomCents)).toBe(true);
    expect(fitsUnderCap(p, p.roomCents + 1)).toBe(false);
  });
  it('a generated year with no cap key needs the drawn cap', () => {
    expect(() => teamCapPosition({ leagueYear: 2031, phase: 'season', contracts: [], other: [], adjustmentCents: 0 }, R)).toThrow(/generated cap/);
    expect(teamCapPosition({ leagueYear: 2031, phase: 'season', contracts: [], other: [], adjustmentCents: 0, generatedCapCents: M(350) }, R).roomCents).toBe(M(350));
  });
});

describe('C6.3.2 release, trade, dead money, June 1', () => {
  it('release on or before June 1: all remaining proration accelerates', () => {
    const r = releaseCharges(VET, offseason(), R);
    if (!r.ok) throw new Error(r.reason);
    expect(r.chargeBeforeCents).toBe(M(17));
    expect(r.byYear.get(2027)).toBe(M(15));
    expect(r.byYear.get(2028)).toBeUndefined();
    expect(r.savingCents).toBe(M(2));
  });
  it('release after June 1: this year keeps its proration, the rest moves to next year', () => {
    const r = releaseCharges(VET, offseason({ timing: 'after_june1' }), R);
    if (!r.ok) throw new Error(r.reason);
    expect([...r.byYear]).toEqual([[2027, M(5)], [2028, M(10)]]);
    expect(r.savingCents).toBe(M(12));
  });
  it('June 1 designation: full charge until June 2, then as if released after June 1; a third is refused', () => {
    const r = releaseCharges(VET, offseason({ june1Designation: true, designationsUsed: 1 }), R);
    if (!r.ok) throw new Error(r.reason);
    expect(r.chargeUntilJune2Cents).toBe(M(17));
    expect([...r.byYear]).toEqual([[2027, M(5)], [2028, M(10)]]);
    const third = releaseCharges(VET, offseason({ june1Designation: true, designationsUsed: 2 }), R);
    expect(third.ok).toBe(false);
    expect(releaseCharges(VET, offseason({ june1Designation: true, timing: 'after_june1' }), R).ok).toBe(false);
  });
  it('guaranteed salary stays on the cap when the guarantee covers the reason', () => {
    const g = contract(8, [M(10), M(12), M(14), M(16)], 2026, M(20), [2027, 2028]);
    const skill = releaseCharges(g, offseason({ reason: 'skill' }), R);
    if (!skill.ok) throw new Error(skill.reason);
    expect(skill.guaranteedOwedCents).toBe(M(26));
    expect(skill.byYear.get(2027)).toBe(M(15) + M(26));
    expect(skill.savingCents).toBe(M(17) - M(41));
    // Offset language: a new club's pay reduces what the old club owes.
    expect(offsetCreditCents({ ...g, offset: true }, skill.guaranteedOwedCents, M(3))).toBe(M(3));
    expect(offsetCreditCents(g, skill.guaranteedOwedCents, M(3))).toBe(0);
  });
  it('in season: salary already paid stays charged', () => {
    const r = releaseCharges(VET, offseason({ timing: 'after_june1', basePaidCents: M(6), earnedThisYearCents: M(0.5) }), R);
    if (!r.ok) throw new Error(r.reason);
    expect(r.byYear.get(2027)).toBe(M(5) + M(6) + M(0.5));
  });
  it('acceptance: dead money across years equals remaining proration plus remaining guarantees', () => {
    fc.assert(fc.property(
      fc.integer({ min: 2026, max: 2030 }), fc.boolean(), fc.boolean(), fc.subarray([2026, 2027, 2028, 2029, 2030]), fc.integer({ min: 0, max: M(40) }),
      (year, after, designate, guaranteed, bonus) => {
        const c = contract(9, [M(3), M(4), M(5), M(6), M(7)], 2026, bonus, guaranteed);
        const r = releaseCharges(c, offseason({ leagueYear: year, timing: after ? 'after_june1' : 'on_or_before_june1', june1Designation: designate && !after }), R);
        if (!r.ok) return false;
        const owed = c.years.filter((y) => y.leagueYear >= year && guaranteed.includes(y.leagueYear)).reduce((s, y) => s + y.base.amountCents, 0);
        return total(r.byYear) === remainingProration(c, year, R) + owed;
      },
    ));
  });
  it('trade: the old club keeps the proration, the new club takes the salary and none of the old bonus', () => {
    const t = tradeCharges(VET, offseason(), R);
    expect(t.oldClub.byYear.get(2027)).toBe(M(15));
    expect(yearCharge(t.newClubContract, 2027, R).totalCents).toBe(M(12));
    expect(t.newClubContract.years.map((y) => y.leagueYear)).toEqual([2027, 2028, 2029]);
    const late = tradeCharges(VET, offseason({ timing: 'after_june1' }), R);
    expect([...late.oldClub.byYear]).toEqual([[2027, M(5)], [2028, M(10)]]);
  });
});

describe('C6.3.1 restructure, extension, pay cut', () => {
  it('restructure: $8M of 2026 base becomes a bonus over 2026-2029; this year falls $6M, later years rise $2M', () => {
    const r = restructure(VET, 2026, M(8), 5, R);
    if (!r.ok) throw new Error(r.reason);
    expect(yearCharge(r.contract, 2026, R).totalCents).toBe(M(2) + M(5) + M(2));
    expect(yearCharge(r.contract, 2027, R).totalCents).toBe(M(12) + M(5) + M(2));
    expect(cashInYear(r.contract, 2026)).toBe(cashInYear(VET, 2026));
  });
  it('restructure below the minimum is refused (2026, five credited seasons: $1,215,000)', () => {
    expect(restructure(VET, 2026, M(9), 5, R).ok).toBe(false);
    expect(restructure(VET, 2026, M(10) - $(1215000), 5, R).ok).toBe(true);
  });
  it('acceptance: a restructure never changes total money or total charges', () => {
    fc.assert(fc.property(fc.integer({ min: 2026, max: 2029 }), fc.integer({ min: 1, max: M(8) }), (year, amount) => {
      const r = restructure(VET, year, amount, 5, R);
      if (!r.ok) return true;
      const sum = (c: CapContract) => c.years.reduce((s, y) => s + yearCharge(c, y.leagueYear, R).totalCents, 0);
      return sum(r.contract) === sum(VET) && totalValueCents(r.contract) === totalValueCents(VET);
    }));
  });
  it('extension: a new bonus spreads over the remaining years plus the new ones, up to five', () => {
    const e = extend(VET, 2027, [plainYear(2030, M(18))], M(10));
    if (!e.ok) throw new Error(e.reason);
    const t = e.contract.tranches[1]!;
    expect(prorationFor({ ...e.contract, tranches: [t] }, 2027, R)).toBe(M(2.5));
    expect(prorationFor({ ...e.contract, tranches: [t] }, 2030, R)).toBe(M(2.5));
    const long = extend(VET, 2027, [2030, 2031, 2032].map((y) => plainYear(y, M(18))), M(10));
    if (!long.ok) throw new Error(long.reason);
    const lt = long.contract.tranches[1]!;
    expect(prorationFor({ ...long.contract, tranches: [lt] }, 2031, R)).toBe(M(2));
    expect(prorationFor({ ...long.contract, tranches: [lt] }, 2032, R)).toBe(0);
    expect(extend(VET, 2027, [plainYear(2031, M(18))], 0).ok).toBe(false);
  });
  it('pay cut: lowers base, never below the minimum for the year and band', () => {
    const cut = payCut(VET, 2027, new Map([[2027, M(6)]]), 5, R);
    if (!cut.ok) throw new Error(cut.reason);
    expect(yearCharge(cut.contract, 2027, R).totalCents).toBe(M(11));
    expect(payCut(VET, 2027, new Map([[2027, M(13)]]), 5, R).ok).toBe(false);
    expect(payCut(VET, 2027, new Map([[2027, $(1000000)]]), 5, R).ok).toBe(false);
  });
});

describe('C6.4.1 minimum salaries and the veteran benefit', () => {
  it('table by credited seasons and year (CBA Art. 26 s.1(a))', () => {
    expect(minimumSalary(R, 2026, 0)).toBe($(885000));
    expect(minimumSalary(R, 2026, 5)).toBe($(1215000));
    expect(minimumSalary(R, 2026, 12)).toBe($(1300000));
    expect(minimumSalary(R, 2030, 7)).toBe($(1480000));
  });
  it('years after the table continue the $45,000 step (assumption)', () => {
    expect(minimumSalary(R, 2032, 0)).toBe($(1065000 + 2 * 45000));
  });
  it('qualifying contract: 2026, six credited seasons, $187,500 additional counts as the two-season minimum plus the bonus', () => {
    const q = qualifyingContract(R, 2026, 6, $(187500));
    expect(q).toMatchObject({ eligible: true, salaryCents: $(1215000), salaryCapCountCents: $(1075000), capChargeCents: $(1262500), benefitCents: $(140000) });
    expect(qualifyingContract(R, 2026, 6, $(187501)).eligible).toBe(false);
    expect(qualifyingContract(R, 2026, 3, 0).eligible).toBe(false);
  });
  it('CBA Art. 27 s.6 example: a five-season player paid $910,000 counts $750,000; $160,000 is a player benefit', () => {
    const cba = capRules({ 'cap.min_salary_y2020_cs2': 750000, 'cap.min_salary_y2020_cs4_6': 910000, 'cap.min_salary_y2020_cs0': 610000 });
    const q = qualifyingContract(cba, 2020, 5, 0);
    expect(q.salaryCapCountCents).toBe($(750000));
    expect(q.benefitCents).toBe($(160000));
  });
});

describe('C6.4.2 rookie contracts', () => {
  it('lengths: 4 years for every drafted player, 3 for undrafted', () => {
    expect(rookieLength(1, R)).toBe(4);
    expect(rookieLength(6, R)).toBe(4);
    expect(rookieLength(null, R)).toBe(3);
  });
  it('CBA Art. 7 s.3(e) example: $400,000 bonus and $500,000 salary make a $600,000 year-one salary and a $150,000 limit', () => {
    const make = (last: number) => contract(10, [$(500000), $(650000), $(800000), $(last)], 2026, $(400000));
    expect(rookieSalary(make(950000), 2026, R)).toBe($(600000));
    expect(maxAnnualIncrease(make(950000), R)).toBe($(150000));
    expect(increaseRuleBreach(make(950000), R)).toBeNull();
    expect(increaseRuleBreach(make(950001), R)).toBe(2029);
    expect(checkRookieContract(make(950000), 2, R)).toEqual({ ok: true });
    expect(checkRookieContract(make(950000), null, R).ok).toBe(false);
  });
  it('the 25 percent rule does not bind a contract at the minimum every year', () => {
    const c = contract(11, [$(885000), $(1050000), $(1165000), $(1280000)], 2026, $(4000000));
    expect(increaseRuleBreach(c, R)).toBeNull();
  });

  const plays = (...shares: number[]) => shares.map((p) => ({ played: p * 10, teamPlays: 1000 }));
  it('fifth-year option tier from playing time and original-ballot Pro Bowls (CBA Art. 7 s.7(g))', () => {
    expect(optionTier(plays(80, 80, 40), 0, R)).toBe('playing_time');
    expect(optionTier(plays(60, 60, 60), 0, R)).toBe('playing_time');
    expect(optionTier(plays(70, 76, 80), 0, R)).toBe('playing_time');
    expect(optionTier(plays(45, 80, 70), 0, R)).toBe('basic');
    expect(optionTier(plays(10, 10, 10), 1, R)).toBe('one_pro_bowl');
    expect(optionTier(plays(10, 10, 10), 2, R)).toBe('two_pro_bowls');
    const prices = { basicCents: M(12), playingTimeCents: M(13), transitionCents: M(15), franchiseCents: M(18) };
    expect(optionSalary('basic', prices)).toBe(M(12));
    expect(optionSalary('two_pro_bowls', prices)).toBe(M(18));
  });
  it('option basic tier averages the 3rd to 25th largest salaries', () => {
    const salaries = Array.from({ length: 30 }, (_, i) => M(30 - i));
    expect(averageOfRanks(salaries, R.num('rookie.option_basic_rank_from'), R.num('rookie.option_basic_rank_to'))).toBe(M(17));
    expect(averageOfRanks(salaries, R.num('rookie.option_basic_rank_from'), R.num('rookie.option_playtime_rank_to'))).toBe(M(19.5));
  });
  it('escalator levels: the CBA cumulative-average examples (60 percent round 2, 35 percent rounds 3 to 7)', () => {
    expect(escalatorLevel(2, plays(45, 65, 70), 0, R)).toBe('level_one');
    expect(escalatorLevel(3, plays(25, 35, 45), 0, R)).toBe('level_one');
    expect(escalatorLevel(2, plays(25, 35, 45), 0, R)).toBe('none');
    expect(escalatorLevel(4, plays(55, 56, 60), 0, R)).toBe('level_two');
    expect(escalatorLevel(7, plays(0, 0, 0), 1, R)).toBe('level_three');
    expect(escalatorLevel(1, plays(90, 90, 90), 2, R)).toBe('none');
    expect(escalatorLevel(null, plays(90, 90, 90), 2, R)).toBe('none');
  });
  it('escalator raises: the CBA Art. 7 s.4(e) examples ($750,000, $1,000,000, $2,250,000)', () => {
    const cba = capRules({ 'fa.rfa_tender_2021_original_round': 2400000, 'fa.rfa_tender_2021_second_round': 3900000 });
    const yearFour = $(1500000 + 100000 + 50000);
    expect(escalatorRaise('level_one', 2021, yearFour, cba)).toBe($(750000));
    expect(escalatorRaise('level_two', 2021, yearFour, cba)).toBe($(1000000));
    expect(escalatorRaise('level_three', 2021, yearFour, cba)).toBe($(2250000));
    expect(escalatorRaise('none', 2021, yearFour, cba)).toBe(0);
  });
  it('escalator raise with the 2026 tender table: original round $3,674,000', () => {
    expect(escalatorRaise('level_one', 2026, $(1200000), R)).toBe($(2474000));
  });
});

describe('C6.4.3 franchise and transition tags', () => {
  // CBA Appendix E (hypothetical figures printed in the agreement): linebackers, 2020 league year, $200M cap.
  const caps: Record<number, number> = { 2015: 143.28, 2016: 155.27, 2017: 167.0, 2018: 177.2, 2019: 188.2 };
  const fr: Record<number, number> = { 2015: 10.968, 2016: 10.635, 2017: 13.026, 2018: 16.17, 2019: 15.561 };
  const tr: Record<number, number> = { 2015: 9.798, 2016: 9.399, 2017: 11.286, 2018: 13.43, 2019: 13.679 };
  const hist = (tags: Record<number, number>): TagYear[] => Object.keys(caps).map((y) => ({ leagueYear: +y, tagCents: M(tags[+y]!), capCents: M(caps[+y]!) }));
  const input = (prior: number) => ({ upcomingLeagueYear: 2020, upcomingCapCents: M(200), franchiseHistory: hist(fr), transitionHistory: hist(tr), priorYearSalaryCents: prior });

  it('Appendix E example 1: non-exclusive franchise tender $15.972 million', () => {
    const v = capPercentageAverage(hist(fr), 2020, M(200), R);
    expect(Math.round(v / M(0.001))).toBe(15972);
    expect(nonExclusiveFranchiseTender(input(M(10)), R)).toBe(v);
  });
  it('Appendix E example 2: transition tender $13.862 million', () => {
    expect(Math.round(transitionTender(input(M(10)), R) / M(0.001))).toBe(13862);
  });
  it('the prior-salary floor: 120 percent of a $14M salary is $16.8M, above the average', () => {
    expect(nonExclusiveFranchiseTender(input(M(14)), R)).toBe(M(16.8));
    expect(transitionTender(input(M(14)), R)).toBe(M(16.8));
  });
  it('exclusive tender: the current top-five average when higher', () => {
    expect(exclusiveFranchiseTender(input(M(10)), [M(20), M(18), M(17), M(16), M(15), M(10)], R)).toBe(M(17.2));
    expect(exclusiveFranchiseTender(input(M(10)), [M(5)], R)).toBe(capPercentageAverage(hist(fr), 2020, M(200), R));
  });
  it('the average needs exactly five prior years', () => {
    expect(() => capPercentageAverage(hist(fr).slice(1), 2020, M(200), R)).toThrow(/5 prior years/);
  });
  it('third designation: greatest of the top position average, 120 percent of his position, 144 percent of his salary', () => {
    const by = Object.fromEntries(TAG_POSITIONS.map((p) => [p, [M(5)]])) as Record<TagPosition, number[]>;
    by.QB = [M(50), M(45), M(40), M(35), M(30)];
    by['K/P'] = [M(6), M(5), M(5), M(4), M(5)];
    expect(thirdFranchiseTender(by, 'K/P', M(6), R)).toBe(M(40));
    by.QB = [M(5)];
    expect(thirdFranchiseTender(by, 'K/P', M(6), R)).toBe(M(8.64));
    expect(thirdFranchiseTender(by, 'K/P', M(1), R)).toBe(M(6));
  });
  it('Article 10 salary counts base, roster bonuses and proration, not likely incentives', () => {
    const c: CapContract = { ...contract(12, [M(10)], 2026, M(5)), years: [{ ...plainYear(2026, M(10)), likelyIncentivesCents: M(1), datedRosterBonuses: [{ amountCents: M(2), guarantee: NOT_GUARANTEED }] }] };
    expect(article10Salary(c, 2026, R)).toBe(M(17));
  });
  it('window and one tag per club: open 22 days before the league year to 8 days before', () => {
    const start = 100;
    expect(checkTag({ kind: 'transition', day: 78, leagueYearStartDay: start, tagsUsed: 0 }, R).ok).toBe(true);
    expect(checkTag({ kind: 'transition', day: 92, leagueYearStartDay: start, tagsUsed: 0 }, R).ok).toBe(true);
    expect(checkTag({ kind: 'transition', day: 77, leagueYearStartDay: start, tagsUsed: 0 }, R).ok).toBe(false);
    expect(checkTag({ kind: 'transition', day: 93, leagueYearStartDay: start, tagsUsed: 0 }, R).ok).toBe(false);
    expect(checkTag({ kind: 'franchise_exclusive', day: 80, leagueYearStartDay: start, tagsUsed: 1 }, R).ok).toBe(false);
  });
});

describe('C6.2.4 year-end settlement and carryover; C6.2.3 cash floor', () => {
  it('CBA Art. 13 s.6(b)(v)(3) examples: carryover is capped at room', () => {
    expect(settleYear({ roomCents: M(4), carryoverRequest: M(5), likelyNotEarnedCents: 0, unlikelyEarnedCents: 0 }).carryoverCents).toBe(M(4));
    const five = settleYear({ roomCents: M(7), carryoverRequest: M(5), likelyNotEarnedCents: 0, unlikelyEarnedCents: 0 });
    expect(five.carryoverCents).toBe(M(5));
    expect(five.roomAfterCarryoverCents).toBe(M(2));
    expect(settleYear({ roomCents: M(7), carryoverRequest: 'all', likelyNotEarnedCents: 0, unlikelyEarnedCents: 0 }).carryoverCents).toBe(M(7));
  });
  it('incentive netting against room after carryover (CBA Art. 13 s.6(c)(ii), (iii))', () => {
    expect(settleYear({ roomCents: M(7), carryoverRequest: 'all', likelyNotEarnedCents: M(1), unlikelyEarnedCents: 0 }).nextYearAdjustmentCents).toBe(M(8));
    expect(settleYear({ roomCents: M(7), carryoverRequest: M(5), likelyNotEarnedCents: M(1), unlikelyEarnedCents: 0 }).incentiveAdjustmentCents).toBe(0);
    expect(settleYear({ roomCents: M(7), carryoverRequest: M(5), likelyNotEarnedCents: 0, unlikelyEarnedCents: M(3) }).incentiveAdjustmentCents).toBe(-M(1));
  });
  it('cash floor: 90 percent of the summed caps over the period', () => {
    const f = cashFloor([M(301.2), M(301.2), M(301.2)], [M(250), M(270), M(280)], R);
    expect(f.requiredCents).toBe(M(813.24));
    expect(f.shortfallCents).toBe(M(13.24));
  });
  it('cash in a year: signing bonus is paid in its year, salary in its year', () => {
    expect(cashInYear(VET, 2026)).toBe(M(30));
    expect(cashInYear(VET, 2027)).toBe(M(12));
  });
});

describe('rule changes without code changes', () => {
  it('a different proration limit changes the schedule', () => {
    const r3 = capRules({ 'cap.proration_max_years': 3 });
    const c = contract(13, Array(5).fill(M(1)), 2026, M(9));
    expect([...prorationSchedule(c, r3).values()]).toEqual([M(3), M(3), M(3)]);
  });
  it('per-year charges are pure functions of the terms (no stored figures)', () => {
    const years: CapYear[] = VET.years.map((y) => ({ ...y }));
    expect(yearCharge({ ...VET, years }, 2028, R)).toEqual(yearCharge(VET, 2028, R));
  });
});
