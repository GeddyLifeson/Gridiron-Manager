// L3.1 to L3.2: rule list, fine schedule, violations, fines and the ladder, playing time, conduct detrimental, grievance.
import { describe, expect, it } from 'vitest';
import {
  disciplineRules, RULE_KEYS, SCHEDULE_GROUPS, OFFENCES, offence, presetRows, strictness, publishWarnings, publish, changeRow,
  veteranBuyInHit, strictStressInflow, weeklyHazard, drawViolationWeek, expectedWeeklyViolations, autoDecision, levelOf,
  fineLimits, fineBreaches, overLimitRefund, offenceStep, overweightAllowed, deductionSchedule, fineMemory, waiverIsViolation, youthFootballLine,
  benchMemory, deactivationRecord, predicateOccasions, conductAvailability, conductBreaches, deactivationAsConduct, conductMemories, suspensionPay,
  filingProbability, fileGrievance, rule, eligibleWhilePending, inTime, REMEDIES, disciplineAct, DISCIPLINE_CLASSES,
  type TeamRuleList, type ViolatorInput,
} from '../../src/locker-room/index.ts';
import { compliance } from '@gm/league';
import { COLLEGE_2026, PRO_2026, ruleSet, seeded } from './fixtures.ts';

const PRO = disciplineRules(ruleSet(PRO_2026));
const COL = disciplineRules(ruleSet(COLLEGE_2026));

describe('rule keys and the fine schedule (L3.1.2)', () => {
  it('declares every key once, in the B13.1.2 naming form', () => {
    const keys = RULE_KEYS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);
  });
  it('reads the 2026 row (acceptance: unit test of the 2026 values)', () => {
    expect(PRO.maxUsd).toEqual({
      overweight_per_lb_day: 847, late: 3182, missed: 16984, ejection: 44962, minicamp_day1: 17986, minicamp_day2: 35973,
      minicamp_day3: 53952, camp_veteran_day: 60000, camp_ufa_day: 60000, camp_rookie_day: 45000, camp_option_day: 45000,
    });
    expect([PRO.dailyCapCampUsd, PRO.dailyCapSeasonUsd]).toEqual([35967, 48556]);
    expect(PRO.ladder).toEqual([0.4, 0.7, 1]);
  });
  it('fails loudly on a missing or malformed cell', () => {
    const missing = { ...PRO_2026 }; delete missing['club_discipline.max_usd.late'];
    expect(() => disciplineRules(ruleSet(missing))).toThrow(/lacks club_discipline.max_usd.late/);
    expect(() => disciplineRules(ruleSet({ ...PRO_2026, 'club_discipline.max_usd.missed': Number.NaN }))).toThrow(/malformed/);
    expect(() => disciplineRules(ruleSet({ ...PRO_2026, 'club_discipline.model': 'other' }))).toThrow(/unknown/);
  });
  it('applies a generated league scale to every amount', () => {
    const d = disciplineRules(ruleSet({ ...PRO_2026, 'club_discipline.schedule_scale': 0.5 }));
    expect(d.maxUsd!.late).toBe(1591);
  });
  it('the school code model has no schedule, ladder or grievance', () => {
    expect(COL.maxUsd).toBeNull(); expect(COL.ladder).toBeNull(); expect(COL.grievance).toBeNull();
  });
  it('every schedule group is covered by the catalogue and every row is well formed', () => {
    for (const o of OFFENCES) {
      if (o.group) expect(SCHEDULE_GROUPS).toContain(o.group);
      expect(o.weeklyBase).toBeGreaterThanOrEqual(0);
      expect(o.models.length).toBeGreaterThan(0);
    }
    expect(offence('overweight').predicate).toBe(false);
    expect(offence('camp_absence').ladder).toBe(false);
  });
});

const list = (model: TeamRuleList['model'], preset: 'strict' | 'player_led' = 'strict'): TeamRuleList => ({ teamId: 1, model, rows: presetRows(preset, model), publishedDay: null, history: [] });

describe('the rule list set in camp (L3.1.1)', () => {
  it('presets load from data and strictness is the mean penalty percent', () => {
    expect(strictness(list('labour_agreement', 'strict'))).toBe(100);
    expect(strictness(list('labour_agreement', 'player_led'))).toBe(50);
    expect(strictness({ model: 'labour_agreement', rows: [] })).toBe(0);
  });
  it('a row above the maximum or off the CBA list needs the warning, then publishes', () => {
    const l = list('labour_agreement');
    const rows = [...l.rows.map((r) => (r.offenceId === 'late' ? { ...r, penaltyShare: 1.5 } : r)), { offenceId: 'locker_music', on: true, penaltyShare: 1, consequence: null, enforcer: 'head_coach' as const, offList: true }];
    const draft = { ...l, rows };
    const w = publishWarnings(draft, PRO);
    expect(w.map((x) => `${x.offenceId}:${x.kind}`).sort()).toEqual(['late:above_maximum', 'locker_music:off_list']);
    expect(() => publish(draft, 10, [], PRO)).toThrow(/warning shown first/);
    expect(publish(draft, 10, w, PRO).publishedDay).toBe(10);
    expect(publishWarnings(draft, COL)).toEqual([]);
  });
  it('raising after a violation reads as aimed at him; loosening after a star costs consistency; history kept', () => {
    const l = { ...list('labour_agreement', 'player_led'), publishedDay: 1 };
    const late = l.rows.find((r) => r.offenceId === 'late')!;
    const up = changeRow(l, { ...late, penaltyShare: 1 }, 20, 7, false);
    expect(up.effects.targetedTrust).toEqual({ playerId: 7, delta: -5 });
    const down = changeRow(l, { ...late, penaltyShare: 0.1 }, 21, 9, true);
    expect(down.effects.consistencyDelta).toBeLessThan(0);
    expect(down.list.history).toHaveLength(1);
  });
  it('a strict list hits veteran buy-in only past the wide margin, softened by respect', () => {
    expect(veteranBuyInHit(60, 50, 0)).toBe(0);
    expect(veteranBuyInHit(100, 0, 0)).toBeCloseTo(-5);
    expect(Math.abs(veteranBuyInHit(100, 0, 80))).toBeLessThan(Math.abs(veteranBuyInHit(100, 0, 20)));
    expect(strictStressInflow(100, 30)).toBe(1);
    expect(strictStressInflow(100, 70)).toBe(0);
  });
});

const roster = (n: number, discipline = 50, stress = 0): ViolatorInput[] => Array.from({ length: n }, (_, i) => ({ playerId: i + 1, origin: 'generated', discipline, stress }));

describe('violations (L3.2.1)', () => {
  it('hazard responds to each input in the stated direction', () => {
    const b = weeklyHazard(0.01, 50, 20, 50);
    expect(weeklyHazard(0.01, 80, 20, 50)).toBeLessThan(b);
    expect(weeklyHazard(0.01, 50, 60, 50)).toBeGreaterThan(b);
    expect(weeklyHazard(0.01, 50, 20, 90)).toBeLessThan(b);
    expect(weeklyHazard(0.01, 50, 0, 50)).toBeCloseTo(0.01 * 1.1 * 1 * 1.05);
  });
  it('base rates give a team of 53 about one minor violation a week at average values', () => {
    const e = expectedWeeklyViolations(roster(53), 50, 'labour_agreement');
    expect(e).toBeGreaterThan(0.85); expect(e).toBeLessThan(1.15);
  });
  it('is deterministic for a seed; rules that are off do not raise; imported people commit workplace kinds only', () => {
    const l = { ...list('labour_agreement'), rows: list('labour_agreement').rows.map((r) => (r.offenceId === 'late' ? { ...r, on: false } : r)) };
    const players: ViolatorInput[] = [...roster(100, 10, 80), ...Array.from({ length: 100 }, (_, i) => ({ playerId: 500 + i, origin: 'imported' as const, discipline: 10, stress: 80 }))];
    const w = { teamId: 1, day: 3, culture: 20, playerPolicing: false, list: l, players, priorCount: () => 0, firstId: 1 };
    const a = drawViolationWeek(w, seeded(42)); const b = drawViolationWeek(w, seeded(42));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    for (const v of a) {
      if (v.offenceId === 'late') expect(v.raised).toBe(false);
      if (v.playerId >= 500) expect(offence(v.offenceId).neutralWorkplace).toBe(true);
    }
  });
  it('player policing with culture above 60 cuts minor violations and hides first offences', () => {
    const players = roster(200, 0, 100);
    const base = { teamId: 1, day: 3, list: list('labour_agreement'), players, priorCount: () => 0, firstId: 1 };
    let off = 0; let on = 0; let hidden = 0;
    for (let s = 1; s <= 40; s++) {
      off += drawViolationWeek({ ...base, culture: 61, playerPolicing: false }, seeded(s)).length;
      const vs = drawViolationWeek({ ...base, culture: 61, playerPolicing: true }, seeded(s));
      on += vs.length; hidden += vs.filter((v) => v.handledByPlayers).length;
    }
    expect(on / off).toBeGreaterThan(0.65); expect(on / off).toBeLessThan(0.85);
    expect(hidden).toBeGreaterThan(0);
  });
  it('auto-follow decides only minor first offences; levels follow the five-step scale', () => {
    const v = { id: 1, teamId: 1, playerId: 2, offenceId: 'late', day: 1, witnesses: 'team' as const, raised: true, handledByPlayers: false };
    expect(autoDecision(v, 0, true)?.level).toBe(2);
    expect(autoDecision(v, 1, true)).toBeNull();
    expect(autoDecision(v, 0, false)).toBeNull();
    expect(autoDecision({ ...v, offenceId: 'ejection' }, 0, true)).toBeNull();
    expect([levelOf('ignore', true), levelOf('warn', true), levelOf('apply_listed', true), levelOf('playing_time', true), levelOf('conduct_detrimental', true, true)]).toEqual([0, 1, 2, 3, 4]);
  });
});

const req = (o: Partial<Parameters<typeof fineLimits>[0]> = {}) => ({ offenceId: 'missed', history: { fines: 0, warningLetters: 0 }, phase: 'season' as const, weeklySalaryUsd: 100000, sameDayCappedUsd: 0, row: null, ...o });

describe('fines and the ladder (L3.2.2)', () => {
  it('first, second, third: 40, 70, 100 percent of the schedule maximum', () => {
    expect(fineLimits(req(), PRO).stepMaxUsd).toBeCloseTo(16984 * 0.4);
    expect(fineLimits(req({ history: { fines: 1, warningLetters: 0 } }), PRO).stepMaxUsd).toBeCloseTo(16984 * 0.7);
    expect(fineLimits(req({ history: { fines: 5, warningLetters: 0 } }), PRO).stepMaxUsd).toBe(16984);
  });
  it('a warning letter in place of a first fine: the next offence draws the second step', () => {
    expect(offenceStep({ fines: 0, warningLetters: 1 })).toBe(2);
    expect(offenceStep({ fines: 1, warningLetters: 1 })).toBe(3);
  });
  it('the amount filled in never exceeds the step maximum, schedule maximum or daily cap', () => {
    const l = fineLimits(req({ history: { fines: 2, warningLetters: 0 }, sameDayCappedUsd: 40000 }), PRO);
    expect(l.filledUsd).toBe(48556 - 40000);
    const r = fineLimits(req({ row: { offenceId: 'missed', on: true, penaltyShare: 0.5, consequence: null, enforcer: 'head_coach' } }), PRO);
    expect(r.filledUsd).toBe(Math.floor(16984 * 0.4 * 0.5));
  });
  it('camp fines skip the ladder and the cap; UFA camp adds a week of salary per preseason game', () => {
    const vet = fineLimits(req({ offenceId: 'camp_absence', phase: 'camp' }), PRO);
    expect(vet.ladder).toBe(false); expect(vet.stepMaxUsd).toBe(60000); expect(vet.capRemainingUsd).toBe(Infinity);
    const ufa = fineLimits(req({ offenceId: 'camp_absence', campGroup: 'camp_ufa_day', preseasonGamesMissed: 2, phase: 'camp' }), PRO);
    expect(ufa.scheduleMaxUsd).toBe(60000 + 200000);
    expect(fineLimits(req({ offenceId: 'minicamp_absence', campDay: 3, phase: 'camp' }), PRO).scheduleMaxUsd).toBe(53952);
  });
  it('overweight is per pound per day, at most twice a week and three days apart', () => {
    expect(fineLimits(req({ offenceId: 'overweight', pounds: 4 }), PRO).scheduleMaxUsd).toBe(847 * 4);
    expect(overweightAllowed(8, [], PRO)).toBe(true);
    expect(overweightAllowed(9, [7], PRO)).toBe(false);
    expect(overweightAllowed(13, [7, 10], PRO)).toBe(false);
  });
  it('an over-limit fine names each breach; a won grievance refunds the part above the maximum', () => {
    const l = fineLimits(req(), PRO);
    expect(fineBreaches(l.filledUsd, l, false)).toEqual([]);
    expect(fineBreaches(10000, l, false)).toEqual(['above_step']);
    expect(fineBreaches(20000, l, true)).toEqual(['off_list', 'above_step', 'above_schedule']);
    expect(overLimitRefund(10000, l, false)).toBeCloseTo(10000 - 16984 * 0.4);
  });
  it('the over-limit act goes to the L8.2.5 pipeline as one log row with the player as knower', () => {
    const coach = { personId: 900, teamId: 1, origin: 'user' as const, role: 'head_coach' as const };
    const act = disciplineAct(DISCIPLINE_CLASSES.fineOverLimit, coach, 7, 0.3, { date: { seasonYear: 2026, dayIndex: 200 }, competitionId: null, tier: 1, source: 'user' });
    expect(act.knew).toEqual([7]); expect(act.certainTrace).toBe(true);
    // The camp fine waiver class already exists in the pipeline catalogue.
    expect(compliance.hasViolationClass(DISCIPLINE_CLASSES.campFineWaiver)).toBe(true);
  });
  it('deductions are limited per pay period except camp fines; youth share line; waivable flags', () => {
    expect(deductionSchedule(12000, 'missed', PRO)).toEqual([5000, 5000, 2000]);
    expect(deductionSchedule(60000, 'camp_absence', PRO)).toEqual([60000]);
    expect(youthFootballLine(10001, PRO)).toBe(5001);
    expect(waiverIsViolation('camp_veteran_day', PRO)).toBe(true);
    expect(waiverIsViolation('camp_rookie_day', PRO)).toBe(false);
  });
  it('fine memory is -3 to -8 by amount against weekly pay; no fine schedule under the school code', () => {
    expect(fineMemory(1, 1e6)).toBeCloseTo(-3, 1);
    expect(fineMemory(1e6, 1e5)).toBe(-8);
    expect(() => fineLimits(req(), COL)).toThrow(/no fine schedule/);
  });
});

describe('playing time and conduct detrimental (L3.2.3, L3.2.4)', () => {
  it('bench memories halve when listed and double when a teammate went unpunished', () => {
    expect([benchMemory('series', false, false), benchMemory('half', false, false), benchMemory('game', false, false)]).toEqual([-4, -8, -12]);
    expect(benchMemory('game', true, false)).toBe(-6);
    expect(benchMemory('game', false, true)).toBe(-24);
  });
  it('every deactivation carries a reason; ability within two weeks of a violation is flagged; football cost logged', () => {
    const r = deactivationRecord(5, 30, 1, 'ability', 20, { id: 6, grade: 60 }, 75);
    expect(r.mayBeReadAsDiscipline).toBe(true); expect(r.gradeGap).toBe(15);
    expect(deactivationRecord(5, 60, 1, 'ability', 20, null, null).mayBeReadAsDiscipline).toBe(false);
  });
  it('predicate: fourth occasion in listed lesser categories; same day counts once; overweight never counts', () => {
    const e = [{ offenceId: 'late', day: 1 }, { offenceId: 'missed', day: 1 }, { offenceId: 'overweight', day: 2 }, { offenceId: 'late', day: 3 }, { offenceId: 'rehab', day: 5 }];
    expect(predicateOccasions(e)).toBe(3);
    expect(conductAvailability('rehab', e, PRO).route).toBe('none');
    expect(conductAvailability('late', [...e, { offenceId: 'late', day: 9 }], PRO).route).toBe('predicate');
    expect(conductAvailability('curfew_night_before_game', [], PRO).route).toBe('single_act');
  });
  it('without a route, or past four weeks or a week of salary: warned, allowed, logged (breaches listed)', () => {
    const none = conductAvailability('late', [{ offenceId: 'late', day: 1 }], PRO);
    expect(conductBreaches({ fineWeeksSalary: 0, suspensionWeeks: 1, priorDeactivationWeeks: 0 }, none, PRO)).toEqual(['no_route']);
    const ok = conductAvailability('fight_coach', [], PRO);
    expect(conductBreaches({ fineWeeksSalary: 1, suspensionWeeks: 4, priorDeactivationWeeks: 0 }, ok, PRO)).toEqual([]);
    expect(conductBreaches(deactivationAsConduct(2, 3), ok, PRO)).toEqual(['suspension_over_max']);
    expect(conductBreaches({ fineWeeksSalary: 2, suspensionWeeks: 0, priorDeactivationWeeks: 0 }, ok, PRO)).toEqual(['fine_over_max']);
    expect(conductBreaches({ fineWeeksSalary: 0, suspensionWeeks: 9, priorDeactivationWeeks: 0 }, none, COL)).toEqual([]);
  });
  it('memories and pay held pending while the appeal is open', () => {
    expect(conductMemories(true)).toEqual({ player: -25, witness: 5 });
    expect(conductMemories(false).witness).toBe(-10);
    expect(suspensionPay(2, 50000, true)).toEqual({ withheldUsd: 0, pendingUsd: 100000 });
    expect(suspensionPay(2, 50000, false)).toEqual({ withheldUsd: 100000, pendingUsd: 0 });
  });
});

describe('grievance and appeal (L3.2.5)', () => {
  const clean = { aboveOthers: false, offList: false, overLimit: false, trust: 60, singleActConduct: false, abilityFlag: false };
  it('filing probability follows the formula', () => {
    expect(filingProbability({ ...clean, trust: 50 })).toBeCloseTo(0.05);
    expect(filingProbability({ ...clean, trust: 0, aboveOthers: true, offList: true })).toBeCloseTo(0.75);
    expect(filingProbability({ ...clean, trust: 50, singleActConduct: true, abilityFlag: true })).toBeCloseTo(0.4);
  });
  it('a penalty that passes both tests draws a grievance in under 10 percent of cases', () => {
    const draw = seeded(7); let n = 0; const N = 10000;
    for (let i = 0; i < N; i++) { const trust = 30 + 70 * draw(); if (draw() < filingProbability({ ...clean, trust })) n++; }
    expect(n / N).toBeLessThan(0.1);
  });
  it('clocks: 50 days to file, suspension hearing in 7 and decision in 5 more; stays let him play', () => {
    expect(inTime(0, 50, PRO)).toBe(true); expect(inTime(0, 51, PRO)).toBe(false);
    expect(() => fileGrievance(1, 'player', 5, 0, 60, false, PRO, seeded(1))).toThrow(/time limit/);
    let stayed = 0;
    for (let s = 1; s <= 200; s++) {
      const g = fileGrievance(s, 'player', 5, 10, 12, true, PRO, seeded(s));
      expect(g.hearingDay).toBe(19); expect(g.decisionDueDay).toBe(24); expect(g.answerDueDay).toBe(22);
      if (g.stayed) { stayed++; expect(eligibleWhilePending(g)).toBe(true); }
    }
    expect(stayed / 200).toBeGreaterThan(0.2); expect(stayed / 200).toBeLessThan(0.4);
  });
  it('rulings post inside the clock and draw remedies only from the closed list', () => {
    const g = fileGrievance(1, 'player', 5, 10, 12, true, PRO, seeded(3));
    expect(() => rule(g, { uniformityFails: true, publicationFails: false, overLimit: false }, 99, seeded(1))).toThrow(/clock/);
    for (let s = 1; s <= 50; s++) {
      const r = rule(g, { uniformityFails: s % 2 === 0, publicationFails: false, overLimit: s % 3 === 0 }, 20, seeded(s));
      expect(r.status).toBe('decided');
      for (const m of r.remedies) expect(REMEDIES).toContain(m);
    }
    expect(() => fileGrievance(1, 'player', 5, 0, 1, false, COL, seeded(1))).toThrow(/no grievance/);
  });
});
