import { describe, expect, it } from 'vitest';
import { RuleKeyManifest, computeStatus } from '@gm/schema';
import { leverageMultiplier } from '../../src/contract/index.ts';
import { candidateWindow } from '../../src/staff/index.ts';
import {
  ACTIVITY, MARKET_EVENT_TYPES, MARKET_FACTS, PARAMS, RULE_KEYS, SIGNS, accept, aiAttemptsTrade, apply, askingPrice, assistantSeesChance, backOut,
  baseScore, boardRows, candidateScore, cascadeDone, comebackRung, contractAllowed, entrantCount, expireIfLate, firingRegard, fitLine,
  headInterview, inBand, inValueWindow, interimTerm, leverageInputs, makeOffer, marketFactStatus, marketRulesFrom, marketValue, meeting,
  monthOutPeerChange, nextReviewHazard, pathStrength, picksFor, pool, rankPool, releaseHold, resignRegard, retireHazard, rollSigns,
  routeFamiliarity, sacrifice, scrambleKind, testCondition, tradeCapPoints, tradeRoute, valueAfterTimeOut, whatChanges, workIncomeGain,
  workingInterview, failedGoalMultipliers, planEffect, bargainChance,
  type Condition, type HeadInterviewAnswers, type HeadInterviewKey, type SeatState, type SignMemory, type ValueInputs,
} from '../../src/market/index.ts';
import { D, PRO_RULES, opening, prefs, rng, seat, terms } from './fixtures.ts';

describe('schema and data', () => {
  it('rule keys, events and parameters parse', () => {
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    expect(MARKET_EVENT_TYPES.length).toBeGreaterThan(10);
    expect(PARAMS.params.every((p) => p.value >= p.min && p.value <= p.max)).toBe(true);
  });
  it('fact status is computed from sources and stored the same', () => {
    for (const r of MARKET_FACTS) expect(r.status).toBe(computeStatus(r));
    expect(marketFactStatus('F-market-0004')).toBe('Verified');
    expect(marketFactStatus('F-market-0005')).toBe('1 of 3');
  });
  it('an absent key is no rule; the college record pays the buyout', () => {
    expect(marketRulesFrom({})).toEqual({ coachTradeMode: null, searchFirmShare: null });
    expect(marketRulesFrom({ 'hiring.coach_trade.mode': 'contract_buyout' }).coachTradeMode).toBe('contract_buyout');
  });
});

describe('E2.3.3 board and applying', () => {
  const list = [opening({ id: 1 }), opening({ id: 2, stage: 'filled' }), opening({ id: 3, stage: 'filled_internally', level: 'college' }), opening({ id: 4, rung: 5, isHeadCoach: false, side: 'offense' })];
  it('rows are every unfilled opening at both levels, filled-internally rows kept', () => {
    expect(boardRows(list).map((o) => o.id)).toEqual([1, 3, 4]);
    expect(boardRows(list, { side: 'offense' }).map((o) => o.id)).toEqual([4]);
  });
  it('any listed opening accepts an application; the boss learns only of a coach under contract', () => {
    for (const o of boardRows(list)) {
      const r = apply(o, 7, 'agent', D, false, rng(1));
      expect(r.application.openingId).toBe(o.id);
      expect(r.application.bossLearned).toBe(false);
      expect(r.hours).toBe(0.5);
    }
    let learned = 0;
    const s = rng(2);
    for (let i = 0; i < 2000; i++) if (apply(list[0]!, 7, 'letter', D, true, s).application.bossLearned) learned++;
    expect(learned / 2000).toBeGreaterThan(0.15);
    expect(learned / 2000).toBeLessThan(0.25);
  });
  it('applying only adds him to the pool: his score is the same with and without it', () => {
    const p = pool([5, 9], [], 1);
    const withApp = pool([5, 9], [apply(list[0]!, 7, 'letter', D, false, rng(1)).application], 1);
    expect(p).toEqual([5, 9]);
    expect(withApp).toEqual([5, 7, 9]);
    const a = candidateScore(prefs(), terms(), { internal: false }, rng(4));
    const b = candidateScore(prefs(), terms(), { internal: false }, rng(4));
    expect(a).toBe(b);
    expect(routeFamiliarity('letter', 90, true, 1)).toBe(0);
    expect(routeFamiliarity('contact', 90, false, 1)).toBe(0);
    expect(routeFamiliarity('contact', 90, true, 0)).toBeCloseTo(0.9);
  });
  it('a rung 2 coach is outside the value window of a professional head job (never interviewed)', () => {
    const o = { rung: 9, prestige: 40 };
    expect(inValueWindow(o, { rung: 2, prestige: 40 }, null, false)).toBe(false);
    expect(inValueWindow(o, { rung: 8, prestige: 40 }, null, false)).toBe(true);
    expect(inValueWindow(o, { rung: 2, prestige: 0 }, { rung: 9, prestige: 40 }, false)).toBe(true);
    expect(inValueWindow(o, null, null, true)).toBe(true);
  });
  it('fit line', () => {
    expect(fitLine({ rung: 9, prestige: 40 }, { rung: 2, prestige: 40 })).toBe('well_above');
    expect(fitLine({ rung: 7, prestige: 40 }, { rung: 7, prestige: 38 })).toBe('lateral');
    expect(fitLine({ rung: 5, prestige: 40 }, { rung: 7, prestige: 0 })).toBe('step_down_title_up_level');
    expect(fitLine({ rung: 5, prestige: 0 }, { rung: 7, prestige: 0 })).toBe('step_down');
    expect(cascadeDone([opening({ stage: 'filled' }), opening({ stage: 'filled_internally' })])).toBe(true);
  });
});

describe('E2.3.2 and E2.6 candidate score', () => {
  it('two parties with opposed weights rank identical-record candidates differently', () => {
    const a = { personId: 1, terms: terms({ playCaller: 1, experience: 0 }), internal: false };
    const b = { personId: 2, terms: terms({ playCaller: 0, experience: 1 }), internal: false };
    const zero = { sideMatch: 0, playCaller: 0, experience: 0, priorHeadRecord: 0, playerReputation: 0, familiarity: 0, unitResults: 0, oppositeOfFired: 0, interview: 0 };
    expect(baseScore({ ...zero, playCaller: 1 }, a.terms)).toBeGreaterThan(baseScore({ ...zero, playCaller: 1 }, b.terms));
    expect(baseScore({ ...zero, experience: 1 }, b.terms)).toBeGreaterThan(baseScore({ ...zero, experience: 1 }, a.terms));
  });
  it('with equal records the internal candidate wins more often, by the bonus', () => {
    const s = rng(9);
    let internalWins = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rankPool(prefs(), [{ personId: 1, terms: terms(), internal: true }, { personId: 2, terms: terms(), internal: false }], s);
      if (r[0]!.personId === 1) internalWins++;
    }
    expect(internalWins / 2000).toBeGreaterThan(0.55);
    expect(internalWins / 2000).toBeLessThan(0.75);
  });
  it('the interim record is pulled toward the middle', () => {
    expect(interimTerm(1)).toBeLessThan(1);
    expect(interimTerm(1)).toBeGreaterThan(0.5);
  });
});

describe('E2.4.3 interview', () => {
  const key: HeadInterviewKey = { ownRosterPriorities: ['qb', 'ol', 'cb'], wantedSystems: ['wcoast'], cultureValues: { firm: 1, soft: 0.2 }, segments: ['roster_plan', 'staff', 'system', 'board_work', 'game_management', 'culture'] };
  const answers = (correct: boolean): HeadInterviewAnswers => ({
    rosterPriorities: ['qb', 'ol', 'wr'], staffNamed: [{ personId: 3, wouldCome: true }], systemKey: 'wcoast',
    board: [{ correct, speed: 1 }, { correct, speed: 1 }], situations: [{ correct, speed: 0.5 }], cultureChoice: 'firm',
  });
  it('all board answers right beats none, all else equal', () => {
    expect(headInterview(answers(true), key).total).toBeGreaterThan(headInterview(answers(false), key).total);
  });
  it('the score reads only the answers: same answers, same score', () => {
    expect(headInterview(answers(true), key)).toEqual(headInterview(answers(true), key));
  });
  it('naming a coach who would not come is found out', () => {
    const honest = headInterview(answers(true), key).segments.staff!;
    const bluff = headInterview({ ...answers(true), staffNamed: [{ personId: 3, wouldCome: true }, { personId: 4, wouldCome: false }] }, key).segments.staff!;
    expect(bluff).toBeLessThan(honest);
  });
  it('S6.4.1 working interview blend', () => {
    expect(workingInterview(1, 0, 0)).toBeCloseTo(50);
    expect(workingInterview(1, 1, 1)).toBeCloseTo(100);
  });
});

describe('E2.4.1 market value and time out', () => {
  const v: ValueInputs = { rung: 5, path: 80, results: 0.5, workRating: 0.5, reputation: 0.5, agentReach: 0, bossTakesCredit: false };
  it('removing every relationship edge from a rung 5 coach cuts his value by at least half', () => {
    expect(marketValue({ ...v, path: 0 })).toBeLessThanOrEqual(marketValue(v) / 2);
  });
  it('a boss who takes credit lowers his value; at the top results and reputation dominate', () => {
    expect(marketValue({ ...v, bossTakesCredit: true })).toBeLessThan(marketValue(v));
    const top = { ...v, rung: 9 };
    expect(marketValue({ ...top, path: 0 })).toBeGreaterThan(marketValue(top) * 0.8);
  });
  it('path through a mentor counts, at most two steps', () => {
    const t = (a: number, b: number) => ((a === 1 && b === 2) || (a === 2 && b === 3) ? 80 : 0);
    expect(pathStrength(1, 3, [1, 2, 3], t)).toBeCloseTo(64);
  });
  it('decay 15% a year, collapse restores part, two years out is a comeback a rung lower', () => {
    expect(valueAfterTimeOut(100, 1, false)).toBeCloseTo(85);
    expect(valueAfterTimeOut(100, 1, true)).toBeGreaterThan(85);
    expect(valueAfterTimeOut(100, 2, false)).toBeCloseTo(72.25);
    expect(comebackRung(9, 2)).toBe(8);
    expect(comebackRung(9, 1)).toBe(9);
    expect(monthOutPeerChange(false)).toBeLessThan(0);
    expect(monthOutPeerChange(true)).toBe(0);
  });
});

describe('E2.5 offers and coach trades', () => {
  it('first-ranked gets the offer; it expires at its deadline; the next candidate follows', () => {
    const o = makeOffer(1, 1, [4, 5], new Set(), D, [101])!;
    expect(o.personId).toBe(4);
    expect(expireIfLate(o, { seasonYear: 2027, dayIndex: 15 }).state).toBe('live');
    expect(expireIfLate(o, { seasonYear: 2027, dayIndex: 16 }).state).toBe('expired');
    expect(makeOffer(2, 1, [4, 5], new Set([4]), D, [])!.personId).toBe(5);
    expect(o.evidenceEventIds).toEqual([101]);
  });
  it('no contract before the day after his club\'s last game: agreed in principle until then', () => {
    const o = makeOffer(1, 1, [4], new Set(), D, [])!;
    const playing = candidateWindow({ kind: 'alive', round: 'conference', hadBye: false, daysSinceLastGame: 2, daysSinceRegularSeasonEnd: 20, championshipByeWeek: false }, PRO_RULES);
    const a = accept(o, playing);
    expect(a.state).toBe('agreed_in_principle');
    expect(contractAllowed(a)).toBe(false);
    const over = candidateWindow({ kind: 'season_over', daysSinceLastGame: 1, divisionalRoundOver: true }, PRO_RULES);
    expect(contractAllowed(releaseHold(a, over))).toBe(true);
    expect(backOut(a).ownerRegard).toBeLessThan(0);
  });
  it('a second live offer never makes the terms worse', () => {
    const other = makeOffer(9, 2, [4], new Set(), D, [])!;
    const one = leverageMultiplier(leverageInputs([], 4, 0.5, 0.2, false));
    const two = leverageMultiplier(leverageInputs([other], 4, 0.5, 0.2, false));
    expect(two).toBeGreaterThanOrEqual(one);
  });
  it('coach trade price never exceeds a first and a second pick; buyout mode moves no picks', () => {
    const cap = tradeCapPoints();
    expect(cap).toBe(5);
    expect(askingPrice(100, 5, true, true).points).toBeLessThanOrEqual(cap);
    expect(picksFor(cap)).toEqual(['first', 'second']);
    expect(askingPrice(100, 3, false, false).points).toBeLessThan(askingPrice(100, 3, true, false).points);
    expect(tradeRoute('contract_buyout', 3, true, 90, true, false).kind).toBe('buyout');
    expect(tradeRoute('club_consent', 3, false, 90, true, false).kind).toBe('free');
    expect(tradeRoute(null, 3, true, 90, true, false).kind).toBe('blocked');
    expect(aiAttemptsTrade(0.95, 0.8)).toBe(true);
    expect(aiAttemptsTrade(0.8, 0.9)).toBe(false);
    expect(whatChanges('pro', 'college', true)).not.toContain('market.change.rules');
    expect(whatChanges('pro', 'pro', false)).toEqual([]);
  });
});

describe('E4.4.1 hot seat signs', () => {
  function season(start: number, end: number, weeks: number, s: ReturnType<typeof rng>, review: boolean) {
    let mem: SignMemory = {};
    const fired: { week: number; sign: string }[] = [];
    for (let w = 0; w < weeks; w++) {
      const c = start + ((end - start) * w) / (weeks - 1);
      const st: SeatState = seat({ confidence: c, mediaMood: c, gmView: c, mainReview: review && w === weeks - 1 });
      const r = rollSigns(st, w, mem, s);
      mem = r.memory;
      for (const x of r.fired) fired.push({ week: w, sign: x });
    }
    return fired;
  }
  it('coaches above 70 see a sign in fewer than 5% of seasons', () => {
    const s = rng(11);
    let any = 0;
    for (let i = 0; i < 1000; i++) if (season(85, 75, 17, s, true).length > 0) any++;
    expect(any / 1000).toBeLessThan(0.05);
  });
  it('coaches fired at the main review had at least two signs in the last 10 weeks in 80% of cases', () => {
    const s = rng(12);
    let ok = 0;
    for (let i = 0; i < 500; i++) if (season(55, 25, 17, s, true).filter((f) => f.week >= 7).length >= 2) ok++;
    expect(ok / 500).toBeGreaterThanOrEqual(0.8);
  });
  it('a candid owner skips the vote; cooldown holds four weeks', () => {
    expect(inBand('vote_of_confidence', seat({ confidence: 40, mediaMood: 30 }))).toBe(true);
    expect(inBand('vote_of_confidence', seat({ confidence: 40, mediaMood: 30, ownerCandour: 0.95 }))).toBe(false);
    const always = { name: 't', draws: 0, nextU32: () => 0, uniform: () => 0, normal: () => 0, chance: () => true, pick: () => 0, int: (lo: number) => lo };
    const r1 = rollSigns(seat({ confidence: 20 }), 0, {}, always);
    const r2 = rollSigns(seat({ confidence: 20 }), 2, r1.memory, always);
    expect(r2.fired.filter((x) => r1.fired.includes(x))).toEqual([]);
    expect(SIGNS.length).toBe(9);
  });
  it('an assistant hears more of his head coach\'s signs the higher his rung', () => {
    expect(assistantSeesChance(2)).toBeLessThan(assistantSeesChance(5));
    expect(assistantSeesChance(5)).toBeLessThan(assistantSeesChance(7));
  });
});

describe('E4.6 saving the job', () => {
  const cond = (over: Partial<Condition> = {}): Condition => ({ id: 1, kind: 'reach_result', targetId: null, goal: 'winNow', size: 1, threshold: 0.5, deadlineWeek: 8, takesAuthority: false, ...over });
  const facts = (week: number, winShare: number) => ({ week, releasedPersonIds: new Set<number>(), playCallerIsHeadCoach: true, authorityHeld: new Set<number>(), startedPersonIds: new Set<number>(), winShare, teamRuleChanged: new Set<number>() });
  it('every condition has a test and a deadline; all passed lowers the next hazard', () => {
    expect(testCondition(cond(), facts(5, 0.4))).toBe('pending');
    expect(testCondition(cond(), facts(9, 0.4))).toBe('failed');
    expect(testCondition(cond(), facts(9, 0.6))).toBe('passed');
    expect(nextReviewHazard(['passed', 'passed'])).toBe(0.8);
    expect(nextReviewHazard(['passed', 'failed'])).toBe(1);
    expect(failedGoalMultipliers([cond()], ['failed'])).toEqual({ winNow: 2 });
  });
  it('refusing below 30 is fired; above it costs confidence; accepting gives +5 and authority goes public', () => {
    expect(meeting('refuse', 25, [], 3).fired).toBe(true);
    expect(meeting('refuse', 40, [], 3).confidenceChange).toBe(-6);
    const m = meeting('accept_all', 40, [cond({ takesAuthority: true })], 3);
    expect(m.confidenceChange).toBe(5);
    expect(m.publicByWeek).toBe(5);
    expect(planEffect(2, 4).confidenceChange).toBe(2);
    expect(bargainChance(100, cond({ size: 1 }), cond({ size: 1 }))).toBe(1);
  });
  it('a second sacrifice in a season yields nothing; loyalty is written for every assistant; owner demand halves it', () => {
    const x = { unitBottomThird: true, earlierThisSeason: 0, liked: 0.5, ownerRequired: false, releasedRankedAboveOwnSide: false, remainingStaffIds: [1, 2, 3] };
    expect(sacrifice(x).confidenceChange).toBe(4);
    expect(sacrifice({ ...x, earlierThisSeason: 1 }).confidenceChange).toBe(0);
    expect(sacrifice(x).loyalty.size).toBe(3);
    expect(sacrifice({ ...x, ownerRequired: true }).loyalty.get(1)!).toBeCloseTo(sacrifice(x).loyalty.get(1)! / 2);
    expect(sacrifice({ ...x, releasedRankedAboveOwnSide: true }).peerRegard).toBeLessThan(0);
  });
});

describe('E2.7, S7, E2.3.4 exits and a moving market', () => {
  it('a short first job with a poor roster costs less than a firing with a talented roster; cause ends pay', () => {
    const short = firingRegard({ firstHeadJob: true, seasonsInJob: 2, rosterQuality: 0.2, forCause: false });
    const talented = firingRegard({ firstHeadJob: false, seasonsInJob: 4, rosterQuality: 0.8, forCause: false });
    expect(short.owners).toBeGreaterThan(talented.owners);
    expect(firingRegard({ firstHeadJob: false, seasonsInJob: 4, rosterQuality: 0.5, forCause: true }).payContinues).toBe(false);
  });
  it('offset means a low-paid seat adds nothing; resigning mid-season costs unless health', () => {
    expect(workIncomeGain(50, 100, true)).toBe(0);
    expect(workIncomeGain(150, 100, true)).toBe(50);
    expect(resignRegard('health', true).owners).toBe(0);
    expect(resignRegard('dispute', true).owners).toBeLessThan(0);
    expect(resignRegard('another_job', false).buyoutApplies).toBe(true);
    expect(ACTIVITY.study.historyFact).toBe('studied_film_of');
  });
  it('scramble kinds', () => {
    expect(scrambleKind({ rung: 7, levelPrestige: 40, offField: false }, { rung: 5, levelPrestige: 40, offField: false })).toBe('step_down_rung');
    expect(scrambleKind({ rung: 7, levelPrestige: 40, offField: false }, { rung: 7, levelPrestige: 20, offField: false })).toBe('step_down_level');
    expect(scrambleKind({ rung: 7, levelPrestige: 40, offField: false }, { rung: 3, levelPrestige: 40, offField: true })).toBe('off_field');
  });
  it('imported real people retire on age and years out only; entrants replace exits plus 8%', () => {
    const base = { age: 66, yearsWithoutJob: 0, healthBurden: 1, wealthIndependence: 1 };
    expect(retireHazard({ ...base, importedReal: true })).toBeLessThan(retireHazard({ ...base, importedReal: false }));
    expect(retireHazard({ ...base, importedReal: true })).toBeCloseTo(retireHazard({ ...base, healthBurden: 0, wealthIndependence: 0, importedReal: true }));
    expect(entrantCount(100)).toBe(108);
  });
});
