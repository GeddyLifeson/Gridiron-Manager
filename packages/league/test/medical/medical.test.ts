// G-33 medical process between games. Acceptance (plans/game-build-plan.md G-33): who decides what (D11.3);
// concussion protocol steps; report designations; return and re-injury rates as rows. Each describe names
// the bible leaf whose acceptance line it checks; params.json `constrainedBy` points at these test names.
import { describe, expect, it } from 'vitest';
import { FactFile, RuleKeyDef, TuningParam, computeStatus } from '@gm/schema';
import { commitAct, emptyCompliance, type PartyRef } from '../../src/compliance/index.ts';
import {
  CHANNELS, DECISIONS, P, PARAMS, RATES, RULE_KEYS, agreeChance, applyPressure, badOutcomeTrust, basePenalties, believedShare, canPlayThrough,
  caseDay, caseMultiplier, choosesSurgery, coachSetsClearance, compareFiled, compareWithGame, dailyReport, decisionOwner, draftPracticeReport,
  drawImagingFactor, drawRecoveryDays, drawSymptomDays, evaluate, followUpFinds, halfWidthShare, hideChance, imagingDay, imagingRange, isStatus,
  labelFromShare, majorRecoveryLevel, medicalDay, medicalRules, mustList, openCase, physicianState, playRateOf, playThroughPenalties,
  protocolDay, protocolDef, quantile, recommendInjuredReserve, recommendedPractice, recoveryQuantiles, refusalChance, reinjuryMultiplier,
  reportDays, reportFor, returnSpeedPenalty, severityClassOf, shadingAct, shownCase, shownRange, shutdownOptions, sidelineCorrectChance,
  sidelineRead, startProtocol, statusForChance, statusWarning, staffPlayChance, stepPractice, surgeryReturnDay, useAgainstClearance, useBreach,
  worsenRisk, type DayContext, type ListingFacts, type MedicalCase, type OpenContext, type PlannedUse, type UseContext,
} from '../../src/medical/index.ts';
import paramsJson from '../../src/medical/params.json' with { type: 'json' };
import playthrough from '../../src/medical/data/playthrough.json' with { type: 'json' };
import medicalJson from '../../src/medical/data/medical.json' with { type: 'json' };
import { CATALOGUE, CATALOGUE_ROWS, COLLEGE, PRO, PRO_RS, COLLEGE_RS, injury, readJson, ruleSet, staff, streams, PRO_VALUES } from './helpers.ts';

const openCtx = (over: Partial<OpenContext> = {}): OpenContext => ({ catalogue: CATALOGUE, staff: staff(), rules: PRO, toughness: 0.5, priorConcussionDays: [], evaluationMissed: false, ...over });
const dayCtx = (over: Partial<DayContext> = {}): DayContext => ({ staff: staff(), rules: PRO, namedInReport: new Set(), consultantAvailable: true, ...over });

function open(typeId: string, seed = 1, over: Partial<OpenContext> = {}, ev: Parameters<typeof injury>[1] = {}): MedicalCase {
  const c = openCase(injury(typeId, ev), openCtx(over), streams(seed));
  if (!c) throw new Error('no case');
  return c;
}

/** Run a case day by day until it recovers (or `max` days). */
function runToRecovery(c0: MedicalCase, seed: number, ctx = dayCtx(), max = 800): { c: MedicalCase; history: MedicalCase[] } {
  let c = c0;
  const history: MedicalCase[] = [];
  for (let d = c.occurredDay + 1; d <= c.occurredDay + max && c.status === 'active'; d++) {
    c = caseDay(c, d, ctx, streams(seed)).case;
    history.push(c);
  }
  return { c, history };
}

const party = (personId: number, role: PartyRef['role'] = 'head_coach'): PartyRef => ({ personId, role, teamId: 1, origin: 'user' });
const useCtx = (over: Partial<UseContext> = {}): UseContext => ({
  actor: party(10), orderedBy: null, staff: staff(), date: { seasonYear: 2026, dayIndex: 200 }, competitionId: 1, tier: 1, source: 'user',
  rules: PRO_RS, gain: 0.6, trust: 0.5, toughness: 0.5, ...over,
});

describe('params and rule keys', () => {
  it('every parameter parses, names its leaf and a constraining test', () => {
    for (const p of paramsJson.params) {
      expect(() => TuningParam.parse(p)).not.toThrow();
      expect(p.constrainedBy, p.name).toMatch(/Test "/);
      expect(p.value, p.name).toBeGreaterThanOrEqual(p.min);
      expect(p.value, p.name).toBeLessThanOrEqual(p.max);
    }
    expect(PARAMS.params.length).toBe(paramsJson.params.length);
    expect(() => P('nope')).toThrow();
  });
  it('rule keys are valid dictionary entries and read for both levels', () => {
    for (const k of RULE_KEYS) expect(() => RuleKeyDef.parse(k)).not.toThrow();
    expect(PRO).toMatchObject({ independentAuthority: true, reportRule: 'weekly_practice_and_status', irMinGames: 4, consultantConfirms: true });
    expect(COLLEGE).toMatchObject({ independentAuthority: true, reportRule: 'none', irMinGames: null, consultantConfirms: false });
    expect(() => medicalRules(ruleSet({ ...PRO_VALUES, 'medical.injury_report_rule': 'probable_list' }))).toThrow();
  });
});

describe('catalogue draw (D11.2.1 rows through the G-21 port)', () => {
  it('every catalogue row draws a recovery; in-game-only rows cost no days', () => {
    for (const r of CATALOGUE_ROWS) {
      const d = drawRecoveryDays(r, null, streams(3)(['cat', r.id]));
      if (r.recovery.unit === 'plays') expect(d, r.id).toBe(0);
      else expect(d, r.id).toBeGreaterThanOrEqual(P('minRecoveryDays'));
    }
    expect(openCase(injury('cramp'), openCtx(), streams(1))).toBeNull();
  });
  it('a games row reproduces its median and quartiles in days', () => {
    const knee = CATALOGUE.get('knee')!;
    const xs = Array.from({ length: 4000 }, (_, i) => drawRecoveryDays(knee, null, streams(i)(['k']))).sort((a, b) => a - b);
    const wk = P('daysPerGameWeek');
    expect(xs[2000]).toBeCloseTo(knee.recovery.median! * wk, -1);
    expect(xs[1000]).toBeCloseTo(knee.recovery.low! * wk, -1);
    expect(xs[3000]).toBeCloseTo(knee.recovery.high! * wk, -1);
  });
  it('grades take ordered bands of the distribution', () => {
    const ankle = CATALOGUE.get('ankle')!;
    const mean = (g: number) => Array.from({ length: 500 }, (_, i) => drawRecoveryDays(ankle, g, streams(i)(['g', g]))).reduce((a, b) => a + b, 0) / 500;
    expect(mean(1)).toBeLessThan(mean(2));
    expect(mean(2)).toBeLessThan(mean(3));
  });
  it('quantile points are monotone for every row', () => {
    for (const r of CATALOGUE_ROWS) {
      if (r.recovery.unit === 'plays') continue;
      const q = recoveryQuantiles(r.recovery);
      for (let i = 1; i < q.length; i++) expect(q[i]![1], r.id).toBeGreaterThanOrEqual(q[i - 1]![1]);
      expect(quantile(q, 0)).toBe(q[0]![1]);
    }
  });
});

describe('authority: who decides what (D11.3.1, H5.1.1)', () => {
  it('the physician owns clearance; the user may never set it', () => {
    expect(decisionOwner('clearance')).toMatchObject({ owner: 'team_physician', userMay: 'never' });
    expect(decisionOwner('concussion_clearance').userMay).toBe('never');
    expect(decisionOwner('use_and_role')).toMatchObject({ owner: 'head_coach', userMay: 'decide' });
    expect(decisionOwner('surgery_and_second_opinion').owner).toBe('player');
    expect(decisionOwner('roster_list_move').owner).toBe('roster_say_holder');
    expect(new Set(DECISIONS.map((d) => d.id)).size).toBe(DECISIONS.length);
    const c = open('hamstring');
    expect(coachSetsClearance(c, 'cleared', PRO).ok).toBe(false);
    expect(coachSetsClearance(c, 'cleared', COLLEGE).ok).toBe(false);
    // A rule set without independent authority (D11.3.1 key) is the only way, and never past a protocol.
    const loose = medicalRules(ruleSet({ ...PRO_VALUES, 'medical.independent_authority': false }));
    expect(coachSetsClearance(c, 'cleared', loose).ok).toBe(true);
    expect(coachSetsClearance(open('concussion'), 'cleared', loose).ok).toBe(false);
  });
  it('clearance states: not cleared, then with limits, then cleared', () => {
    const { history } = runToRecovery(open('hamstring', 5), 5);
    const seq = history.map((c) => c.shown.state).filter((s, i, a) => i === 0 || a[i - 1] !== s);
    expect(seq[0]).toBe('not_cleared');
    expect(seq).toContain('cleared');
    expect(seq.indexOf('cleared')).toBeGreaterThan(0);
  });
  it('limits come with "cleared with limits"', () => {
    const { history } = runToRecovery(open('ankle', 8), 8);
    const lim = history.find((c) => c.shown.state === 'cleared_with_limits');
    expect(lim?.shown.limits).toEqual({ snapCap: P('snapCapShare'), noContactPractice: true, maxPractice: 'limited' });
    expect(recommendedPractice(lim!)).toBe('limited');
  });
  it('cautious physician clears later on the same injury and seed, with no earlier early returns', () => {
    let later = 0;
    let early = { cautious: 0, aggressive: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      const c0 = open('calf', seed);
      const a = runToRecovery(c0, seed, dayCtx({ staff: staff({ caution: 0 }) })).history.find((c) => c.clearedDay !== null);
      const b = runToRecovery(c0, seed, dayCtx({ staff: staff({ caution: 1 }) })).history.find((c) => c.clearedDay !== null);
      if (a && b && b.clearedDay! >= a.clearedDay!) later++;
      if (a?.earlyReturn) early.aggressive++;
      if (b?.earlyReturn) early.cautious++;
    }
    expect(later).toBe(200);
    expect(early.cautious).toBeLessThan(early.aggressive);
  });
  it('use against clearance: warned, never refused by the game, one violation_log row through G-28', () => {
    const c = runToRecovery(open('knee', 9), 9, dayCtx(), 1).c; // day one: not cleared
    expect(c.shown.state).toBe('not_cleared');
    const play: PlannedUse = { dress: true, snapShare: 1, practice: 'full', contact: true };
    const b = useBreach(c, play);
    expect(b).toBe('not_cleared');
    const u = useAgainstClearance(c, b!, useCtx(), streams(9)(['use']));
    expect(u.warning.choices).toEqual(['go_back', 'do_it_anyway']);
    expect(u.act.classId).toBe('medical_clearance');
    expect(u.act.knew).toContain(staff().physicianId);
    const r = commitAct(emptyCompliance(), u.act, PRO_RS, { append: () => 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.log.length).toBe(1);
    // Resting him is inside the clearance.
    expect(useBreach(c, { dress: false, snapShare: 0, practice: 'dnp', contact: false })).toBeNull();
  });
  it('a concussion breach always carries a written objection and names the consultants', () => {
    const c = open('concussion', 2);
    const b = useBreach(c, { dress: true, snapShare: 1, practice: 'full', contact: true });
    expect(b).toBe('concussion_protocol');
    for (let i = 0; i < 50; i++) {
      const u = useAgainstClearance(c, b!, useCtx(), streams(i)(['u']));
      expect(u.objection).toBe(true);
      expect(u.act.certainTrace).toBe(true);
      expect(u.act.classId).toBe('concussion_protocol');
      expect(u.act.knew).toEqual(expect.arrayContaining([...staff().consultantIds]));
    }
  });
  it('past the limits: a snap share over the cap or contact in practice', () => {
    const lim = runToRecovery(open('ankle', 8), 8).history.find((c) => c.shown.state === 'cleared_with_limits')!;
    expect(useBreach(lim, { dress: true, snapShare: P('snapCapShare'), practice: 'limited', contact: false })).toBeNull();
    expect(useBreach(lim, { dress: true, snapShare: 1, practice: 'limited', contact: false })).toBe('past_limits');
    expect(useBreach(lim, { dress: false, snapShare: 0, practice: 'limited', contact: true })).toBe('past_limits');
  });
  it('refusal: a player with low toughness and low trust refuses more', () => {
    expect(refusalChance(0, 0)).toBeGreaterThan(refusalChance(1, 1));
    expect(refusalChance(1, 1)).toBeCloseTo(P('refusalBase'));
  });
});

describe('estimate (D11.3.2, H5.1.2)', () => {
  it('sideline read: correct with 0.6 + 0.3 x accuracy, otherwise an adjacent class', () => {
    expect(sidelineCorrectChance(0)).toBeCloseTo(0.6);
    expect(sidelineCorrectChance(1)).toBeCloseTo(0.9);
    let right = 0;
    for (let i = 0; i < 3000; i++) {
      const r = sidelineRead(20, staff({ diagnosticAccuracy: 1 }), streams(i)(['s']));
      if (r === severityClassOf(20)) right++;
      else expect(['minor', 'major']).toContain(r);
    }
    expect(right / 3000).toBeCloseTo(0.9, 1);
  });
  it('imaging factor: 0.7 to 1.4 at low accuracy, 0.85 to 1.2 at high', () => {
    expect(imagingRange(0)).toEqual([0.7, 1.4]);
    expect(imagingRange(1)).toEqual([0.85, 1.2]);
    for (let i = 0; i < 200; i++) {
      const f = drawImagingFactor(1, streams(i)(['f']));
      expect(f).toBeGreaterThanOrEqual(0.85);
      expect(f).toBeLessThanOrEqual(1.2);
    }
  });
  it('imaging timing: next day, same night for a suspected major injury', () => {
    expect(imagingDay(10, 'minor')).toBe(11);
    expect(imagingDay(10, 'major')).toBe(10);
  });
  it('range narrows: plus or minus 35 percent at first, 10 percent by the last third', () => {
    expect(halfWidthShare(0)).toBeCloseTo(0.35);
    expect(halfWidthShare(P('rangeNarrowedAt'))).toBeCloseTo(0.1);
    expect(halfWidthShare(0.9)).toBeCloseTo(0.1);
    const [a, b] = shownRange(40, 0, 1);
    const [c, d] = shownRange(40, 30, 1);
    expect(b - a).toBeGreaterThan(d - c);
  });
  it('setbacks: about one injury in ten, adding time', () => {
    let n = 0;
    for (let i = 0; i < 2000; i++) if (open('calf', 10_000 + i).truth.setbackAt !== null) n++;
    expect(n / 2000).toBeGreaterThan(P('setbackChance') - 0.02);
    expect(n / 2000).toBeLessThan(P('setbackChance') + 0.02);
  });
  it('coverage 75 to 85 percent: the true return date sits inside the shown range', () => {
    let inside = 0;
    let total = 0;
    const types = ['knee', 'ankle', 'hamstring', 'shoulder', 'foot', 'groin', 'calf', 'back', 'mcl_sprain', 'high_ankle_sprain'];
    for (let i = 0; i < 400; i++) {
      const c0 = open(types[i % types.length]!, 20_000 + i);
      const { c, history } = runToRecovery(c0, 20_000 + i);
      const returnDay = c0.occurredDay + c.truth.totalDays;
      for (let k = 0; k < history.length; k++) {
        const h = history[k]!;
        const day = c0.occurredDay + k + 1;
        if (!h.shown.rangeDays || h.status !== 'active') continue;
        total++;
        if (returnDay >= day + h.shown.rangeDays[0] && returnDay <= day + h.shown.rangeDays[1]) inside++;
      }
    }
    const row = RATES.find((r) => r.id === 'estimate_coverage')!;
    expect(inside / total).toBeGreaterThanOrEqual(row.targetLow);
    expect(inside / total).toBeLessThanOrEqual(row.targetHigh);
  });
  it('ranges narrow with higher staff accuracy (H5.1.2 paired test)', () => {
    let lo = 0, hi = 0;
    for (let i = 0; i < 300; i++) {
      const w = (acc: number) => {
        const c = runToRecovery(open('knee', 30_000 + i, { staff: staff({ diagnosticAccuracy: acc }) }), 30_000 + i, dayCtx({ staff: staff({ diagnosticAccuracy: acc }) }), 3).c;
        const t = c.truth.totalDays - c.truth.progressDays;
        return c.shown.rangeDays ? Math.abs((c.shown.rangeDays[0] + c.shown.rangeDays[1]) / 2 - t) : 0;
      };
      lo += w(0); hi += w(1);
    }
    expect(hi).toBeLessThan(lo);
  });
});

describe('pressure (D11.3.3)', () => {
  it('player agrees: toughness, trust and a contract year raise it', () => {
    expect(agreeChance(1, 1, true)).toBeGreaterThan(agreeChance(0, 0, false));
    expect(agreeChance(0, 0, false)).toBeCloseTo(P('agreeBase'));
  });
  it('doctors: pressure never moves a concussion or a structural injury', () => {
    const s = streams(1)(['p']);
    const who = { toughness: 0.5, trust: 0.5, contractYear: false };
    expect(applyPressure(open('concussion'), 'ask_trainer', 1001, who, s).effective).toBe(false);
    const acl = applyPressure(open('acl_tear'), 'ask_trainer', 1001, who, s);
    expect(acl.effective).toBe(false);
    expect(acl.case.doctorsPressed).toBe(false);
    const ham = applyPressure(open('hamstring'), 'ask_trainer', 1001, who, s);
    expect(ham.effective).toBe(true);
    expect(ham.case.doctorsPressed).toBe(true);
  });
  it('costs: every use costs medical trust; a bad outcome after pressure costs player and room trust', () => {
    const r = applyPressure(open('hamstring'), 'override_snap_cap', 1001, { toughness: 0.5, trust: 0.5, contractYear: false }, streams(1)(['p']));
    expect(r.trust.medicalStaff).toBeCloseTo(-P('medicalTrustCost'));
    expect(r.log.kind).toBe('override_snap_cap');
    expect(badOutcomeTrust(r.case)).toEqual({ medicalStaff: 0, player: -P('playerTrustCostBadOutcome'), room: -P('roomTrustCostBadOutcome') });
    expect(badOutcomeTrust(open('hamstring'))).toEqual({ medicalStaff: 0, player: 0, room: 0 });
  });
  it('a world that pressures every case returns earlier, carries more re-injury risk and less trust than control', () => {
    let riskP = 0, riskC = 0, earlyP = 0, earlyC = 0, trustP = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const c0 = open('hamstring', 40_000 + seed);
      const control = runToRecovery(c0, seed).history.find((c) => c.clearedDay !== null)!;
      const pressed = applyPressure(c0, 'ask_trainer', c0.occurredDay, { toughness: 0.5, trust: 0.5, contractYear: false }, streams(seed)(['p']));
      trustP += pressed.trust.medicalStaff;
      const p = runToRecovery(pressed.case, seed).history.find((c) => c.clearedDay !== null)!;
      if (p.earlyReturn) earlyP++;
      if (control.earlyReturn) earlyC++;
      riskP += caseMultiplier(p, p.clearedDay!);
      riskC += caseMultiplier(control, control.clearedDay!);
    }
    expect(earlyP).toBeGreaterThan(earlyC);
    expect(riskP).toBeGreaterThan(riskC);
    expect(trustP).toBeCloseTo(-200 * P('medicalTrustCost'));
  });
});

describe('concussion (D11.4.1, D11.4.2, H5.4.1)', () => {
  it('evaluation: a no-go sign is out; a true concussion is found about 9 times in 10; a false alarm returns', () => {
    let found = 0;
    for (let i = 0; i < 4000; i++) {
      expect(evaluate(['ataxia'], false, streams(i)(['e'])).result).toBe('out_no_go');
      expect(evaluate([], false, streams(i)(['e'])).result).toBe('cleared_to_return');
      const r = evaluate([], true, streams(i)(['e2']));
      if (r.result === 'out_diagnosed') found++;
      else expect(r.missed).toBe(true);
    }
    expect(found / 4000).toBeCloseTo(P('concussionDetection'), 1);
  });
  it('follow-up exam: every evaluated player gets one, and it can find a missed concussion', () => {
    expect(followUpFinds(false, streams(1)(['f']))).toBe(false);
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const c = open('concussion', 50_000 + i, { evaluationMissed: true });
      expect(c.shown.known).toBe(false);
      expect(c.protocol).toBeNull();
      const next = caseDay(c, c.occurredDay + 1, dayCtx(), streams(50_000 + i));
      if (next.events.some((e) => e.kind === 'follow_up_found')) { n++; expect(next.case.protocol?.step).toBe(1); }
    }
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(200);
  });
  it('five steps in order with the step-4 and step-5 practice labels', () => {
    const def = protocolDef('league_five_step');
    expect(def.steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5]);
    expect(def.steps.map((s) => s.practice)).toEqual(['dnp', 'dnp', 'dnp', 'limited', 'full']);
    expect(def.factId).toBe('F-injury-0001');
  });
  it('at most one step a day: step 5 never fewer than 4 days after step 1 begins; clearance needs the consultant', () => {
    for (let i = 0; i < 500; i++) {
      const s = streams(i)(['p']);
      let st = startProtocol('league_five_step', 0, 0);
      let d = 0;
      let step5: number | null = null;
      while (!st.cleared && d < 200) {
        d++;
        const before = st.step;
        st = protocolDay(st, d, true, d > 6, s);
        expect(Math.abs(st.step - before)).toBeLessThanOrEqual(1);
        expect(protocolDay(st, d, true, true, s)).toBe(st); // a second run on the same day does nothing
        if (st.step === 5 && step5 === null) step5 = d;
      }
      expect(step5!).toBeGreaterThanOrEqual(rateValue('concussion_min_days_to_step5'));
      expect(d).toBeGreaterThan(6); // waited for the consultant
      expect(st.mediaAvailable).toBe(true);
    }
  });
  it('calibration: median near 9 days out and about 38 percent play the following week', () => {
    const days: number[] = [];
    let next = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const s = streams(60_000 + i)(['c']);
      let st = startProtocol('league_five_step', 0, drawSymptomDays([], 0, s));
      let d = 0;
      while (!st.cleared) { d++; st = protocolDay(st, d, true, true, s); }
      days.push(d);
      if (d <= P('daysPerGameWeek')) next++;
    }
    days.sort((a, b) => a - b);
    const med = RATES.find((r) => r.id === 'concussion_median_days_out')!;
    const nw = RATES.find((r) => r.id === 'concussion_play_next_week')!;
    expect(days[N / 2]!).toBeGreaterThanOrEqual(med.targetLow);
    expect(days[N / 2]!).toBeLessThanOrEqual(med.targetHigh);
    expect(next / N).toBeGreaterThanOrEqual(nw.targetLow);
    expect(next / N).toBeLessThanOrEqual(nw.targetHigh);
  });
  it('prior concussions in the last 12 months lengthen symptom time', () => {
    let a = 0, b = 0, old = 0;
    for (let i = 0; i < 2000; i++) {
      a += drawSymptomDays([], 1000, streams(i)(['s']));
      b += drawSymptomDays([900, 950], 1000, streams(i)(['s']));
      old += drawSymptomDays([1000 - P('priorConcussionWindowDays') - 1], 1000, streams(i)(['s']));
    }
    expect(b / a).toBeCloseTo(1 + 2 * P('priorConcussionLengthen'), 1);
    expect(old).toBe(a);
  });
  it('no user action changes a step: the protocol case is not cleared until the protocol clears', () => {
    const c = open('concussion', 70);
    expect(physicianState(c, staff()).state).toBe('not_cleared');
    expect(stepPractice(c.protocol!)).toBe('dnp');
    const { history, c: done } = runToRecovery(c, 70);
    for (const h of history) if (h.protocol && !h.protocol.cleared) expect(h.shown.state).toBe('not_cleared');
    expect(done.protocol?.cleared).toBe(true);
    expect(shownCase(c).mediaAvailable).toBe(false);
  });
  it('college: the same steps as a placeholder, no consultant confirmation', () => {
    const c = open('concussion', 71, { rules: COLLEGE });
    const r = runToRecovery(c, 71, dayCtx({ rules: COLLEGE, consultantAvailable: false }));
    expect(r.c.protocol?.cleared).toBe(true);
  });
});

function rateValue(id: string): number { return RATES.find((r) => r.id === id)!.value; }

describe('report (D11.5.1, H5.2.1 to H5.2.3)', () => {
  // Day numbers: game day 7 is a Sunday; Thursday game day 4; Monday game day 8.
  it('report days: the three practice days before the game for each week shape', () => {
    expect(reportDays([3, 4, 5], 7, PRO)).toEqual([3, 4, 5]); // Wed to Fri for Sunday
    expect(reportDays([1, 3, 4, 5], 7, PRO)).toEqual([3, 4, 5]); // only the last three
    expect(reportDays([1, 2, 3], 4, PRO)).toEqual([1, 2, 3]); // Mon to Wed for Thursday
    expect(reportDays([4, 5, 6], 8, PRO)).toEqual([4, 5, 6]); // Thu to Sat for Monday
    expect(reportDays([1, 2, 3], 4, COLLEGE)).toEqual([]);
  });
  it('labels follow the recorded rep share; not-injury-related has its own code', () => {
    expect(labelFromShare(1, true, PRO)).toBe('full');
    expect(labelFromShare(0.5, true, PRO)).toBe('limited');
    expect(labelFromShare(0, true, PRO)).toBe('dnp');
    expect(labelFromShare(0, false, PRO)).toBe('nir');
  });
  it('who must be listed: missed or left the last game, missed practice, or limited even with every rep', () => {
    const f = (o: Partial<ListingFacts>): ListingFacts => ({ personId: 1, missedOrLeftLastGame: false, repShare: 1, injuryRelated: true, limitedByStaff: false, bodyPart: 'ankle', ...o });
    expect(mustList(f({}))).toBe(false);
    expect(mustList(f({ missedOrLeftLastGame: true }))).toBe(true);
    expect(mustList(f({ repShare: 0.6 }))).toBe(true);
    expect(mustList(f({ limitedByStaff: true }))).toBe(true);
  });
  it('a truthful report never triggers an inquiry; a shaded one is flagged before submission and is the act', () => {
    const facts: ListingFacts[] = [
      { personId: 1, missedOrLeftLastGame: false, repShare: 0.5, injuryRelated: true, limitedByStaff: false, bodyPart: 'ankle' },
      { personId: 2, missedOrLeftLastGame: true, repShare: 0, injuryRelated: true, limitedByStaff: false, bodyPart: 'knee' },
    ];
    const draft = draftPracticeReport(facts, PRO);
    expect(draft.map((r) => r.label)).toEqual(['limited', 'dnp']);
    const ctx = { actor: party(10), orderedBy: null, knew: [900], date: { seasonYear: 2026, dayIndex: 200 }, competitionId: 1, tier: 1 as const, source: 'user' as const, gain: 0.3 };
    expect(compareFiled(5, draft, draft)).toEqual([]);
    expect(shadingAct([], ctx)).toBeNull();
    const shaded = [{ ...draft[0]!, label: 'full' as const }];
    const flags = compareFiled(5, draft, shaded);
    expect(flags.map((f) => f.kind).sort()).toEqual(['unlisted_injury', 'wrong_participation']);
    expect(shadingAct(flags, ctx)?.classId).toBe('injury_report_shading');
    expect(shadingAct(flags, ctx)?.severity).toBe('major');
    const shadeOnly = compareFiled(5, draft, [{ ...draft[0]!, label: 'full' as const }, draft[1]!]);
    expect(shadeOnly.map((f) => f.kind)).toEqual(['wrong_participation']);
    expect(shadingAct(shadeOnly, ctx)?.severity).toBe('minor');
    expect(draftPracticeReport(facts, COLLEGE)).toEqual([]);
  });
  it('there is no "Probable"; the three statuses map to their measured play rates', () => {
    expect(isStatus('probable', PRO)).toBe(false);
    expect(isStatus('questionable', PRO)).toBe(true);
    expect(isStatus(null, PRO)).toBe(true);
    expect(() => playRateOf('probable', PRO)).toThrow();
    expect(statusForChance(0, PRO)).toBe('out');
    expect(statusForChance(0.04, PRO)).toBe('doubtful');
    expect(statusForChance(0.65, PRO)).toBe('questionable');
    expect(statusForChance(0.95, PRO)).toBeNull();
  });
  it('after the game: no status and inactive for injury, or Out and fit, flag every time', () => {
    expect(compareWithGame(1, 7, null, true, false, PRO)[0]?.kind).toBe('status_inconsistent');
    expect(compareWithGame(1, 7, 'out', false, true, PRO)[0]?.kind).toBe('status_inconsistent');
    expect(compareWithGame(1, 7, 'questionable', true, false, PRO)).toEqual([]);
    expect(compareWithGame(1, 7, 'probable', false, true, PRO)[0]?.kind).toBe('invalid_status');
  });
  it('staff warning when the filed status is far from the medical outlook; the draft reads only the shown state', () => {
    const c = runToRecovery(open('knee', 11), 11, dayCtx(), 2).c;
    const chance = staffPlayChance(c, 6, PRO);
    expect(chance).toBeLessThan(0.5);
    expect(statusWarning(null, chance, PRO)).toBe(true);
    expect(statusWarning(statusForChance(chance, PRO), chance, PRO)).toBe(false);
  });
});

describe('injured reserve advice (D11.5.2)', () => {
  it('fires only when the low end of the estimate meets the minimum stay, and never without the list', () => {
    const long = runToRecovery(open('acl_tear', 12), 12, dayCtx(), 2).c;
    const short = runToRecovery(open('hamstring', 12, {}, { grade: 1 }), 12, dayCtx(), 2).c;
    expect(recommendInjuredReserve(long, PRO)).toBe(true);
    expect(recommendInjuredReserve(short, PRO)).toBe(false);
    expect(recommendInjuredReserve(long, COLLEGE)).toBe(false);
    expect(recommendInjuredReserve(open('concussion', 12), PRO)).toBe(false);
  });
});

describe('return (D11.6.1)', () => {
  it('re-injury curve: 3.0 on day one, 1.3 at six weeks, then 1.15 for soft tissue', () => {
    expect(reinjuryMultiplier(0, true, false)).toBeCloseTo(rateValue('reinjury_first_day'));
    expect(reinjuryMultiplier(P('reinjuryDecayDays'), true, false)).toBeCloseTo(rateValue('reinjury_six_weeks'));
    expect(reinjuryMultiplier(1000, true, false)).toBeCloseTo(rateValue('reinjury_permanent_soft_tissue'));
    expect(reinjuryMultiplier(1000, false, false)).toBeCloseTo(P('reinjuryPermanentOther'));
    for (let d = 1; d < 120; d++) expect(reinjuryMultiplier(d, true, false)).toBeLessThanOrEqual(reinjuryMultiplier(d - 1, true, false));
  });
  it('early return: multiplied again by 1.5', () => {
    expect(reinjuryMultiplier(10, true, true) / reinjuryMultiplier(10, true, false)).toBeCloseTo(P('earlyReturnMultiplier'));
  });
  it('physical penalty: soft tissue minus 3 percent, gone after 3 weeks of full practice', () => {
    expect(returnSpeedPenalty(true, 0)).toBeCloseTo(0.03);
    expect(returnSpeedPenalty(true, P('returnPenaltyDays'))).toBe(0);
    expect(returnSpeedPenalty(false, 0)).toBe(0);
  });
  it('major injury curve: 70 percent at return, 100 percent after the row months', () => {
    expect(majorRecoveryLevel(0, 300)).toBeCloseTo(0.7);
    expect(majorRecoveryLevel(300, 300)).toBe(1);
  });
});

describe('playing hurt (D11.6.2)', () => {
  it('penalties: grade 1 ankle loses 4 percent change of direction and 2 percent top speed; toughness cuts up to a third', () => {
    expect(basePenalties('ankle', 1)).toEqual({ change_of_direction: 0.04, top_speed: 0.02 });
    const tough = playThroughPenalties('ankle', 1, 1, false)!;
    expect(tough.change_of_direction).toBeCloseTo(0.04 * (1 - P('toughnessMaxReduction')));
  });
  it('injection: hides half of the penalty for the game and leaves re-injury alone', () => {
    expect(playThroughPenalties('ankle', 1, 0, true)!.change_of_direction).toBeCloseTo(0.02);
  });
  it('every catalogue row has play-through penalties or is marked cannot play through; channels are known', () => {
    for (const r of CATALOGUE_ROWS) {
      const ok = canPlayThrough(r.id, 1);
      expect(typeof ok).toBe('boolean');
    }
    for (const id of ['concussion', 'acl_tear', 'achilles_rupture', 'patellar_tendon_rupture', 'lisfranc', 'pectoral']) expect(canPlayThrough(id, 1)).toBe(false);
    const ids = new Set(CATALOGUE_ROWS.map((r) => r.id));
    for (const [id, grades] of Object.entries(playthrough.rows)) {
      expect(ids.has(id), id).toBe(true);
      for (const g of grades) if (g) for (const ch of Object.keys(g)) expect(CHANNELS, ch).toContain(ch);
    }
  });
  it('hidden injury: tough players hide more; a report naming him finds it', () => {
    expect(hideChance(1)).toBeGreaterThan(hideChance(0));
    let hidden = 0;
    for (let i = 0; i < 400; i++) {
      const c = open('ankle', 80_000 + i, { toughness: 1 }, { hideable: true, grade: 1 });
      if (!c.shown.known) {
        hidden++;
        const named = caseDay(c, c.occurredDay + 1, dayCtx({ namedInReport: new Set([c.personId]) }), streams(1));
        expect(named.case.shown.known).toBe(true);
      }
    }
    expect(hidden).toBeGreaterThan(0);
  });
  it('hidden injury found within 3 weeks in at least 90 percent of cases', () => {
    let hidden = 0, found = 0;
    for (let i = 0; i < 1000; i++) {
      // A hidden case kept unhealed, so only discovery ends it.
      let c = open('ankle', 90_000 + i, {}, { day: 1000 });
      c = { ...c, truth: { ...c.truth, hidden: true, totalDays: 1000, setbackAt: null }, shown: { ...c.shown, known: false, sidelineClass: null, state: 'cleared' } };
      hidden++;
      for (let d = 1; d <= P('hiddenRevealWindowDays'); d++) {
        c = caseDay(c, 1000 + d, dayCtx(), streams(90_000 + i)).case;
        if (c.shown.known) { found++; break; }
      }
    }
    expect(found / hidden).toBeGreaterThanOrEqual(rateValue('hidden_injury_found_3_weeks'));
  });
});

describe('shutdown and surgery timing (D11.6.3)', () => {
  it('a surgery_optional row offers both paths with dates; earlier surgery returns earlier by exactly the difference', () => {
    const opts = shutdownOptions('turf_toe', 300);
    expect(opts.map((o) => o.path)).toEqual(['non_operative', 'operative']);
    expect(opts[0]!.worsenPerGame).toBeCloseTo(P('nonOpWorsenPerGame'));
    expect(surgeryReturnDay(330, 7.3) - surgeryReturnDay(300, 7.3)).toBe(30);
    expect(shutdownOptions('hamstring', 300)).toEqual([]);
    for (const s of medicalJson.surgeryOptional) expect(CATALOGUE.has(s.id)).toBe(true);
  });
  it('shutdown: contract-year players play through more often than players with guaranteed deals (10 seasons of choices)', () => {
    let cyPlay = 0, gPlay = 0;
    for (let i = 0; i < 2000; i++) {
      if (!choosesSurgery({ contractYear: true, guaranteedShare: 0, toughness: 0.5, trustInCoach: 0.5, gamesLeft: 5 }, null, streams(i)(['a']))) cyPlay++;
      if (!choosesSurgery({ contractYear: false, guaranteedShare: 1, toughness: 0.5, trustInCoach: 0.5, gamesLeft: 5 }, null, streams(i)(['a']))) gPlay++;
    }
    expect(cyPlay).toBeGreaterThan(gPlay);
    expect(worsenRisk(0)).toBe(0);
    expect(worsenRisk(5)).toBeGreaterThan(worsenRisk(1));
  });
  it('shutdown: coach request counts by trust', () => {
    let withAsk = 0, without = 0;
    for (let i = 0; i < 2000; i++) {
      const p = { contractYear: false, guaranteedShare: 0.5, toughness: 0.5, trustInCoach: 1, gamesLeft: 3 };
      if (choosesSurgery(p, 'play', streams(i)(['b']))) withAsk++;
      if (choosesSurgery(p, null, streams(i)(['b']))) without++;
    }
    expect(withAsk).toBeLessThan(without);
  });
});

describe('views (H5.1.2, H5.6.2, H5.4.3)', () => {
  it('the shown case carries no truth; the daily report lists every known active injury', () => {
    const a = open('hamstring', 1, {}, { personId: 1 });
    const b = open('knee', 2, {}, { personId: 2 });
    const hid = open('ankle', 3, {}, { personId: 3 });
    const shown = shownCase(a) as unknown as Record<string, unknown>;
    expect('truth' in shown).toBe(false);
    expect(JSON.stringify(shown)).not.toMatch(/totalDays|progressDays|symptomDays|imagingFactor|mental/i);
    const rep = dailyReport([a, b, { ...hid, shown: { ...hid.shown, known: false } }], 1);
    expect(rep.map((e) => e.personId)).toEqual([1, 2]);
  });
  it('a position coach never sees players outside his group; lower rungs see no ranges', () => {
    const cases = [open('hamstring', 1, {}, { personId: 1 }), open('knee', 2, {}, { personId: 2 })].map((c) => runToRecovery(c, 1, dayCtx(), 3).c);
    const rep = dailyReport(cases, 1);
    expect(reportFor(rep, { role: 'head_coach', playerIds: [] }).length).toBe(2);
    expect(reportFor(rep, { role: 'position_coach', playerIds: [2] }).map((e) => e.personId)).toEqual([2]);
    expect(reportFor(rep, { role: 'graduate_assistant', playerIds: [1, 2] }).every((e) => e.rangeDays === null)).toBe(true);
    expect(reportFor(rep, { role: 'unknown_role', playerIds: [1] })).toEqual([]);
  });
});

describe('determinism', () => {
  it('the same seed gives the same cases, whatever the input order', () => {
    const cs = [open('knee', 1, {}, { personId: 1 }), open('ankle', 2, {}, { personId: 2 }), open('concussion', 3, {}, { personId: 3 })];
    const run = (xs: MedicalCase[]) => { let c = xs; for (let d = 1001; d < 1040; d++) c = medicalDay(c, d, dayCtx(), streams(5)).cases; return c; };
    expect(run(cs)).toEqual(run([...cs].reverse()));
  });
});

describe('return, re-injury and play rates as rows (G-33 acceptance)', () => {
  const facts = new Map<string, ReturnType<typeof FactFile.parse>['rows'][number]>();
  for (const f of ['facts/measured-rate.json', 'facts/injury.json', 'facts/league.json', 'packages/football-content/data/injuries/facts.json']) {
    for (const r of FactFile.parse(readJson(f)).rows) facts.set(r.id, r);
  }
  it('every row cites a register row whose status is computed, or is a named request or assumption', () => {
    expect(new Set(RATES.map((r) => r.id)).size).toBe(RATES.length);
    for (const r of RATES) {
      expect(r.targetLow, r.id).toBeLessThanOrEqual(r.value);
      expect(r.targetHigh, r.id).toBeGreaterThanOrEqual(r.value);
      if (r.factId) {
        const f = facts.get(r.factId);
        expect(f, `${r.id} cites ${r.factId}`).toBeDefined();
        expect(f!.status).toBe(computeStatus(f!));
      } else {
        expect(r.requested ?? r.basis, r.id).toBeTruthy();
      }
    }
  });
  it('rows short of Verified print their status (Q6.3.1)', () => {
    const lines = RATES.map((r) => `${r.id}: ${r.factId ? facts.get(r.factId)!.status : r.requested ? 'Unverified (requested)' : 'Assumption'}`);
    expect(lines.length).toBe(RATES.length);
    // eslint-disable-next-line no-console
    console.log(['G-33 rate rows:', ...lines.filter((l) => !l.endsWith('Verified') || l.includes('Unverified'))].join('\n  '));
  });
});

describe('ir key through the shared rule set', () => {
  it('reads roster.ir_min_games from the same rule set the roster module reads', () => {
    expect(medicalRules(PRO_RS).irMinGames).toBe(PRO_VALUES['roster.ir_min_games']);
    expect(medicalRules(COLLEGE_RS).irMinGames).toBeNull();
    expect(believedShare(open('knee'))).toBe(0);
    expect(severityClassOf(1000)).toBe('season_ending');
    expect(recoveryQuantiles).toBeTypeOf('function');
  });
});
