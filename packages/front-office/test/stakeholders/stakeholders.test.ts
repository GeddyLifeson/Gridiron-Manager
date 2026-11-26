// G-77 acceptance: owner, media, agent and fan models (bible K8, with the E4.2, E4.3, E4.5 and E4.8 tables
// K8 points to). Each describe names the leaf whose acceptance criteria it checks.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FactRow, ParamFile, RuleKeyManifest, computeStatus } from '@gm/schema';
import { compliance } from '@gm/league';
import {
  PARAMS, RULE_KEYS, STAKEHOLDER_FACTS, P, stakeholderProvisional,
  agentPosition, applyBoosterMood, confidenceTerms, baseHazard, blameMultiplier, blameShareHeadCoach, boosterMoodChange, considerTampering,
  deciderModel, deciderObserver, defaultAgent, effectiveAggression, extensionCheck, fanMood, fansAfterGame, fansAfterStarMove,
  fansOffseason, firingHazard, generateDecisionMaker, givingIndex, halfLifeFactor, inSeasonFactor, judgeDecision, leakDetectionLift,
  moneyFactor, needsEmergencyReview, negotiate, newFanBase, noiseMood, pickStories, presidentForcesFiring, publicPressure,
  rankCandidates, react, replayConfidence, review, runSearch, scoreCandidate, seasonExpectation, shownWord, startConfidence,
  statedAndUnstatedGoals, updateConfidence, updateHistoryLevel, updateMediaTone, wordFor,
  type AgentProfile, type CandidateView, type ConfidenceState, type MoneyInputs, type Outlet, type PublicEventView,
  type Result, type ReviewInputs, type SearchPreferences,
} from '../../src/stakeholders/index.ts';
import { dm, game, rng, week, winChance } from './fixtures.ts';
import { mean, simulate, type SimOptions } from './league-sim.ts';

const SRC = join(import.meta.dirname, '../../src/stakeholders');
const srcFiles = () => readdirSync(SRC).filter((f) => f.endsWith('.ts'));
const code = (f: string) => readFileSync(join(SRC, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const PRO = deciderModel('pro');
const COLLEGE = deciderModel('college');

function corr(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; syy += (ys[i]! - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}

const MONEY: MoneyInputs = { remainingGuaranteeCents: 300, assistantsGuaranteeCents: 0, expectedToWorkAgain: true, deadMoneyOwedCents: 0, revenueShareCents: 2000, boosterFundingCents: 0, forCause: false };
function reviewIn(over: Partial<ReviewInputs> = {}): ReviewInputs {
  return {
    kind: 'main', confidence: 35, yearOnJob: 3, lowStreak: false, gmHiredCoach: true,
    situation: { situation: 'steady', yearOnJob: 3, expectationRising: true, qbEstimateFalling: false },
    money: MONEY, announcedRetirement: false, underConductInvestigation: false, presidentForces: false, presidentVetoes: false, inSeason: null, ...over,
  };
}

describe('data files', () => {
  it('PARAMS, RULE_KEYS and fact rows validate; names unique', () => {
    ParamFile.parse(PARAMS);
    RuleKeyManifest.parse(RULE_KEYS);
    for (const r of STAKEHOLDER_FACTS) FactRow.parse(r);
    const names = PARAMS.params.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('fact status is computed from sources; nothing here is Verified, so every row prints PROVISIONAL', () => {
    for (const r of STAKEHOLDER_FACTS) {
      expect(r.status).toBe(computeStatus(r));
      expect(stakeholderProvisional(r.id)).toBe('PROVISIONAL');
    }
    expect(STAKEHOLDER_FACTS.find((r) => r.id === 'F-stakeholders-0003')!.status).toBe('2 of 3');
    expect(STAKEHOLDER_FACTS.find((r) => r.id === 'F-stakeholders-0001')!.status).toBe('1 of 3');
  });

  it('gm factor is the 25/18 ratio of the cited model (rounded as E4.3.1 states it)', () => {
    expect(PRO.gmFactorNotHired).toBeCloseTo(25 / 18, 2);
  });
});

describe('K8.1.1 decision-maker record', () => {
  const facets = (patience: number, ego: number) => ({ patience, ego, candor: 50, risk_tolerance: 50 });

  it('a seed always gives the same person; fields in range', () => {
    const a = generateDecisionMaker(1, 1, 'pro', facets(50, 50), rng(5, 'gen'));
    const b = generateDecisionMaker(1, 1, 'pro', facets(50, 50), rng(5, 'gen'));
    expect(a).toEqual(b);
    expect(a.volatility).toBeGreaterThanOrEqual(0.7);
    expect(a.volatility).toBeLessThanOrEqual(1.4);
    expect(a.outcomeBias).toBeGreaterThanOrEqual(0.2);
    expect(a.outcomeBias).toBeLessThanOrEqual(1);
  });

  it('patience correlates with buildLong and ego with interference (rule 2)', () => {
    const r = rng(9, 'corr');
    const pat: number[] = [], build: number[] = [], ego: number[] = [], inter: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const p = r.int(0, 100), e = r.int(0, 100);
      const d = generateDecisionMaker(i, 1, 'pro', facets(p, e), r);
      pat.push(p); build.push(d.goals.buildLong); ego.push(e); inter.push(d.interference.roster);
    }
    expect(corr(pat, build)).toBeGreaterThan(0.2);
    expect(corr(ego, inter)).toBeGreaterThan(0.2);
  });

  it('stated goals are the top two weights; unstated ones are the rest above the threshold (rule 3)', () => {
    const d = dm({ goals: { winNow: 0.9, buildLong: 0.1, profit: 0.8, prestige: 0.6, cleanProgram: 0.2, rivalry: 0.3, playoffOrBowl: 0.5 } });
    const g = statedAndUnstatedGoals(d);
    expect(g.stated).toEqual(['winNow', 'profit']);
    expect(g.unstated).toEqual(['prestige', 'playoffOrBowl']);
  });

  it('the decider model is data: no general manager factor and a booster vote at a college (E4.7.2 acceptance 1)', () => {
    expect(COLLEGE.hasGeneralManager).toBe(false);
    expect(COLLEGE.gmFactorNotHired).toBe(1);
    expect(COLLEGE.boosterPerPoint).toBeCloseTo(0.1, 10);
    expect(PRO.boosterPerPoint).toBe(0);
    const d = dm();
    expect(firingHazard(d, COLLEGE, reviewIn({ gmHiredCoach: false })).gm).toBe(1);
    expect(firingHazard(d, PRO, reviewIn({ gmHiredCoach: false })).gm).toBeCloseTo(1.39, 10);
  });

  it('two deciders with opposite patience and identical histories differ in mean tenure over 60 seasons', () => {
    const run = (patience: number) => simulate({ ...PRO_SIM, seed: 21, seasons: 60, decider: (i) => dm({ personId: i + 1, teamId: i + 1, patience, volatility: 0.7 + 0.7 * (1 - patience) }) });
    const patient = run(0.95), impatient = run(0.05);
    expect(mean(patient.tenures)).toBeGreaterThan(mean(impatient.tenures));
    expect(mean(patient.firingsPerSeason)).toBeLessThan(mean(impatient.firingsPerSeason));
  });
});

describe('K8.1.2 expectations that rise with success', () => {
  it('five straight 10-win seasons push expectation past 9 by year six; then 9 wins costs confidence, and 9 wins at a 4-win program earns it', () => {
    let level = 6;
    for (let y = 0; y < 5; y++) level = updateHistoryLevel(level, 10);
    const d = dm();
    const e6 = seasonExpectation(d, { publicBaseWins: 10, historyLevelWins: level, spendSd: 0, firstSeasonOfCoach: false, gamesInSeason: 17 });
    expect(e6.expectedWins).toBeGreaterThan(9);
    const seasonEnd = (expectedWins: number) => updateConfidence(startConfidence(1, 'head_coach', 'hired'), d, PRO, week({ quarterPoint: { winShareSoFar: 9 / 17, expectedWinShare: expectedWins / 17 } })).state.value;
    expect(seasonEnd(e6.expectedWins)).toBeLessThan(P('conf.start.hired'));
    let low = 4;
    for (let y = 0; y < 5; y++) low = updateHistoryLevel(low, 4);
    const e4 = seasonExpectation(d, { publicBaseWins: 4, historyLevelWins: low, spendSd: 0, firstSeasonOfCoach: false, gamesInSeason: 17 });
    expect(seasonEnd(e4.expectedWins)).toBeGreaterThan(P('conf.start.hired'));
  });

  it('rises at half the gap and falls at a fifth (rule 2); spending raises the bar (rule 3); grace widens the band', () => {
    expect(updateHistoryLevel(8, 10)).toBeCloseTo(9, 10);
    expect(updateHistoryLevel(8, 3)).toBeCloseTo(7, 10);
    const base = { publicBaseWins: 8, historyLevelWins: 8, spendSd: 0, firstSeasonOfCoach: false, gamesInSeason: 17 };
    expect(seasonExpectation(dm(), { ...base, spendSd: 2 }).expectedWins).toBeCloseTo(9, 10);
    const first = seasonExpectation(dm(), { ...base, firstSeasonOfCoach: true });
    const later = seasonExpectation(dm(), base);
    expect(first.expectedWins).toBe(later.expectedWins);
    expect(first.bandHigh - first.bandLow).toBeGreaterThan(later.bandHigh - later.bandLow);
  });
});

describe('K8.2.1 reactions to results, including noise', () => {
  const fourth = (succeeded: boolean) => game({ result: 'L', pPublic: 0.5, margin: -3, decisions: [{ id: '4th', unconventional: true, succeeded }] });
  const observers = [
    { id: 'owner', outcomeBias: 1, rivalryWeight: 1 },
    { id: 'analytics-beat', outcomeBias: 0.2, rivalryWeight: 1 },
    { id: 'fans', outcomeBias: 1, rivalryWeight: 1.5 },
  ];

  it('paired games identical but for one fourth-down try: the failed version is judged lower by every observer, less so by process-minded ones', () => {
    const gaps = observers.map((o) => {
      const won = react(o, fourth(true), []).total, lost = react(o, fourth(false), []).total;
      expect(lost).toBeLessThan(won);
      return won - lost;
    });
    expect(gaps[1]!).toBeLessThan(gaps[0]!);
  });

  it('outcome bias: unconventional failure full weight, success half, conventional failure barely noticed (rule 2)', () => {
    const fail = judgeDecision({ id: 'a', unconventional: true, succeeded: false }, 1);
    const win = judgeDecision({ id: 'b', unconventional: true, succeeded: true }, 1);
    const conv = judgeDecision({ id: 'c', unconventional: false, succeeded: false }, 1);
    expect(win).toBeCloseTo(-fail / 2, 10);
    expect(Math.abs(conv)).toBeLessThan(Math.abs(win));
    expect(judgeDecision({ id: 'd', unconventional: false, succeeded: true }, 1)).toBe(0);
  });

  it('streaks are over-read by 1.3 and a public early quarterback injury discounts a loss by 30%', () => {
    const o = observers[0]!;
    const plain = react(o, game({ result: 'L', pPublic: 0.6 }), ['W', 'L']).total;
    const streak = react(o, game({ result: 'L', pPublic: 0.6 }), ['L', 'L']).total;
    expect(streak).toBeCloseTo(plain * 1.3, 10);
    const qb = react(o, game({ result: 'L', pPublic: 0.6, starterQbOutPublicEarly: true }), ['W', 'L']).total;
    expect(qb).toBeCloseTo(plain * 0.7, 10);
  });

  it('a win as a heavy underdog is worth more than as a favourite; ties count half and half', () => {
    const o = observers[0]!;
    expect(react(o, game({ pPublic: 0.2 }), []).total).toBeGreaterThan(react(o, game({ pPublic: 0.8 }), []).total);
    expect(react(o, game({ result: 'T', pPublic: 0.5, margin: 0 }), []).total).toBeCloseTo(0, 10);
  });

  it('no K8 module imports the truth decision log, the engine or any truth source (rule 4)', () => {
    for (const f of srcFiles()) {
      const imports = [...readFileSync(join(SRC, f), 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      for (const i of imports) expect(i.startsWith('./') || i === '@gm/schema' || i === '@gm/league').toBe(true);
      expect(code(f)).not.toMatch(/@gm\/models|@gm\/engine|decisionLog|trueRating|trueWinProb|luck/);
    }
  });
});

describe('K8.3.1 and E4.2 one confidence procedure', () => {
  it('starts at 70 hired, 62 promoted from interim, neutral as interim', () => {
    expect(startConfidence(1, 'head_coach', 'hired').value).toBe(70);
    expect(startConfidence(1, 'head_coach', 'interim_promoted').value).toBe(62);
    expect(startConfidence(1, 'head_coach', 'interim').value).toBe(P('conf.start.interim'));
  });

  it('identical histories under the same decider give identical paths for any two subjects (the user has no flag)', () => {
    const d = dm({ volatility: 1.2 });
    const r = rng(4, 'pair');
    let a: ConfidenceState = startConfidence(1, 'head_coach', 'hired');
    let b: ConfidenceState = startConfidence(999, 'head_coach', 'hired');
    const recent: Result[] = [];
    for (let g = 0; g < 17; g++) {
      const res: Result = r.chance(0.45) ? 'W' : 'L';
      const w = week({ games: [{ reading: game({ gameId: g, result: res, pPublic: r.uniform(), margin: res === 'W' ? 7 : -24 }), recent: [...recent] }], mediaTone: 40, fanMood: 30 });
      a = updateConfidence(a, d, PRO, w).state;
      b = updateConfidence(b, d, PRO, w).state;
      expect(a.value).toBe(b.value);
      recent.push(res);
    }
  });

  it('a code search finds exactly one confidence update function, and it takes no user flag', () => {
    let count = 0;
    for (const f of srcFiles()) count += (code(f).match(/export function updateConfidence\b/g) ?? []).length;
    expect(count).toBe(1);
    for (const f of srcFiles()) expect(code(f)).not.toMatch(/isUser|userControlled|\buser\b\s*[:?]/);
  });

  it('every term moves confidence in its stated direction on its own (E4.2.2 acceptance 1)', () => {
    const d = dm({ footballLiteracy: 1 });
    const s0 = startConfidence(1, 'head_coach', 'hired');
    const moved = (w: Parameters<typeof updateConfidence>[3]) => updateConfidence(s0, d, PRO, w).state.value - s0.value;
    expect(moved(week({ games: [{ reading: game({ result: 'W' }), recent: [] }] }))).toBeGreaterThan(0);
    expect(moved(week({ games: [{ reading: game({ result: 'L', margin: -28 }), recent: [] }] }))).toBeLessThan(moved(week({ games: [{ reading: game({ result: 'L', margin: -3 }), recent: [] }] })));
    expect(moved(week({ quarterPoint: { winShareSoFar: 0.3, expectedWinShare: 0.5 } }))).toBeLessThan(0);
    const end = { winShare: 0.5, lastWinShare: 0.5, qualified: false, postseasonWins: 0, title: false, firstGameLossAsHigherSeed: false, yearsSincePostseason: 0, legacy: false, decisionRatingVsLeague: 0 };
    const sum = (e: typeof end) => confidenceTerms(d, PRO, week({ seasonEnd: e })).reduce((t, x) => t + x.value, 0);
    expect(sum({ ...end, lastWinShare: 0.6 })).toBeLessThan(0);
    expect(sum({ ...end, qualified: true, postseasonWins: 2, title: true })).toBe(6 + 10 + 20);
    expect(sum({ ...end, firstGameLossAsHigherSeed: true })).toBe(-4);
    expect(sum({ ...end, yearsSincePostseason: 5 })).toBe(-6);
    expect(sum({ ...end, decisionRatingVsLeague: 1 })).toBe(3);
    expect(moved(week({ goals: [{ goal: 'rivalry', passed: false }] }))).toBeLessThan(0);
    expect(moved(week({ playerNoise: [-2, 1] }))).toBeLessThan(0);
    expect(moved(week({ mediaTone: 20, fanMood: 20 }))).toBeLessThan(0);
    expect(moved(week({ conduct: [-8] }))).toBeLessThan(0);
    expect(moved(week({ violations: [{ ref: 'v1', major: true }] }))).toBeLessThan(0);
    expect(moved(week({ relationship: 90 }))).toBeGreaterThan(0);
  });

  it('a decline counts 1.5 times an equal rise, except for a legacy coach', () => {
    const s0 = startConfidence(1, 'head_coach', 'hired');
    const end = { winShare: 0.5, lastWinShare: 0.6, qualified: false, postseasonWins: 0, title: false, firstGameLossAsHigherSeed: false, yearsSincePostseason: 0, legacy: false, decisionRatingVsLeague: 0 };
    void s0;
    const v = (e: typeof end) => confidenceTerms(dm(), PRO, week({ seasonEnd: e })).reduce((t, x) => t + x.value, 0);
    expect(v(end)).toBeCloseTo(-7.5, 10);
    expect(v({ ...end, legacy: true })).toBeCloseTo(-5, 10);
    expect(v({ ...end, lastWinShare: 0.4 })).toBeCloseTo(5, 10);
  });

  it('volatility scales every term; no-game weeks drift one point toward 55; the first 8 games hold a floor of 15 except through conduct', () => {
    const s0 = startConfidence(1, 'head_coach', 'hired');
    const loss = week({ games: [{ reading: game({ result: 'L', pPublic: 0.9 }), recent: [] }] });
    const calm = updateConfidence(s0, dm({ volatility: 0.7 }), PRO, loss).state.value - 70;
    const hot = updateConfidence(s0, dm({ volatility: 1.4 }), PRO, loss).state.value - 70;
    expect(hot).toBeCloseTo(calm * 2, 10);
    expect(updateConfidence(s0, dm(), PRO, week()).state.value).toBe(69);
    const low: ConfidenceState = { ...s0, value: 20, previousValue: 20, gamesOnJob: 3 };
    const crash = week({ games: [{ reading: game({ result: 'L', pPublic: 0.95, margin: -30 }), recent: ['L', 'L'] }], quarterPoint: { winShareSoFar: 0, expectedWinShare: 0.9 } });
    expect(updateConfidence(low, dm({ volatility: 1.4 }), PRO, crash).state.value).toBe(15);
    expect(updateConfidence(low, dm({ volatility: 1 }), PRO, { ...crash, conduct: [-10] }).state.value).toBe(5);
    expect(updateConfidence({ ...low, gamesOnJob: 8 }, dm({ volatility: 1.4 }), PRO, crash).state.value).toBeLessThan(15);
  });

  it('replaying a season from its logged terms reproduces every weekly value; the word shown never reflects this week (E4.2.1)', () => {
    const d = dm({ volatility: 1.3 });
    const r = rng(11, 'replay');
    const start = startConfidence(1, 'head_coach', 'hired');
    let s = start;
    const logs = [], values: number[] = [];
    const recent: Result[] = [];
    for (let g = 0; g < 17; g++) {
      const res: Result = r.chance(0.35) ? 'W' : 'L';
      const u = updateConfidence(s, d, PRO, week({ weekId: `g${g}`, games: [{ reading: game({ gameId: g, result: res, pPublic: 0.6, margin: res === 'W' ? 3 : -21 }), recent: [...recent] }], conduct: g === 5 ? [-6] : [] }));
      expect(shownWord(u.state)).toBe(wordFor(s.value));
      s = u.state; logs.push(u.log); values.push(s.value); recent.push(res);
    }
    for (let k = 0; k < 4; k++) { const u = updateConfidence(s, d, PRO, week({ weekId: `off${k}` })); s = u.state; logs.push(u.log); values.push(s.value); }
    expect(replayConfidence(start, logs)).toEqual(values);
  });

  it('season-end change correlates at least 0.7 with win share against expectation over 500 seasons (E4.2.2 acceptance 2)', () => {
    const r = rng(13, 'corr500');
    const xs: number[] = [], ys: number[] = [];
    for (let s = 0; s < 500; s++) {
      const d = dm({ volatility: 0.7 + 0.7 * r.uniform() });
      let c = startConfidence(1, 'head_coach', 'hired');
      const strength = 5 * r.normal();
      let wins = 0, ew = 0;
      const recent: Result[] = [];
      for (let g = 0; g < 17; g++) {
        const opp = 5 * r.normal();
        const margin = Math.round(strength - opp + 13 * r.normal());
        const res: Result = margin > 0 ? 'W' : 'L';
        const p = winChance(strength - opp + 2 * r.normal());
        ew += p; if (res === 'W') wins++;
        const qp = (g + 1) % 4 === 0 || g === 16 ? { winShareSoFar: wins / (g + 1), expectedWinShare: ew / (g + 1) } : null;
        c = updateConfidence(c, d, PRO, week({ games: [{ reading: game({ gameId: g, result: res, pPublic: p, margin }), recent: [...recent] }], quarterPoint: qp })).state;
        recent.push(res);
      }
      xs.push(wins / 17 - ew / 17); ys.push(c.value - 70);
    }
    expect(corr(xs, ys)).toBeGreaterThanOrEqual(0.7);
  });

  it('blame split: the hire he made, the one he trusts and the one the press spares carry less (rule 3); nothing to split at a college', () => {
    const d = dm({ loyaltyToOwnHires: 1 });
    const even = { hiredHeadCoach: true, hiredGeneralManager: true, trustHeadCoach: 50, trustGeneralManager: 50, narrativeOnHeadCoach: 0.5 };
    expect(blameShareHeadCoach(d, even)).toBeCloseTo(0.5, 10);
    expect(blameShareHeadCoach(d, { ...even, hiredHeadCoach: false })).toBeGreaterThan(0.5);
    expect(blameShareHeadCoach(d, { ...even, trustHeadCoach: 90 })).toBeLessThan(0.5);
    expect(blameShareHeadCoach(d, { ...even, narrativeOnHeadCoach: 1 })).toBeGreaterThan(0.5);
    expect(blameMultiplier('head_coach', PRO, 0.5)).toBe(1);
    expect(blameMultiplier('general_manager', PRO, 0.7)).toBeCloseTo(0.6, 10);
    expect(blameMultiplier('head_coach', COLLEGE, 0.7)).toBe(1);
  });

  it('booster mood feeds a college decider at 0.1 a point from neutral and never a pro one (E4.7.2 rule 1)', () => {
    const s0 = startConfidence(1, 'head_coach', 'hired');
    expect(updateConfidence(s0, dm(), COLLEGE, week({ games: [{ reading: game({ result: 'T', margin: 0 }), recent: [] }], boosterMood: 20 })).state.value).toBeCloseTo(67, 10);
    expect(updateConfidence(s0, dm(), PRO, week({ games: [{ reading: game({ result: 'T', margin: 0 }), recent: [] }], boosterMood: 20 })).state.value).toBe(70);
  });
});

describe('K8.4.1 and E4.3 the firing decision, with no built-in bounce', () => {
  it('base curve: 0 at 55, 0.25 at 40, 0.60 at 30, 0.90 at 15 and below; capped at 0.95', () => {
    expect(baseHazard(55)).toBe(0);
    expect(baseHazard(40)).toBeCloseTo(0.25, 10);
    expect(baseHazard(30)).toBeCloseTo(0.6, 10);
    expect(baseHazard(15)).toBeCloseTo(0.9, 10);
    expect(baseHazard(0)).toBeCloseTo(0.9, 10);
    const h = firingHazard(dm({ patience: 0, moneySensitivity: 0 }), PRO, reviewIn({ confidence: 5, gmHiredCoach: false, yearOnJob: 7, lowStreak: true, situation: { situation: 'win_now', yearOnJob: 7, expectationRising: true, qbEstimateFalling: false } }));
    expect(h.pFire).toBeLessThanOrEqual(0.95);
  });

  it('dead money brakes monotonically, floored at 0.4 below confidence 20; a firing adds the remaining guarantees (E4.3.2)', () => {
    const d = dm({ moneySensitivity: 0.5 });
    let last = Infinity;
    for (const dead of [0, 200, 500, 1000, 4000]) {
      const p = firingHazard(d, PRO, reviewIn({ money: { ...MONEY, deadMoneyOwedCents: dead } })).pFire;
      expect(p).toBeLessThanOrEqual(last);
      last = p;
    }
    expect(moneyFactor(d, { ...MONEY, deadMoneyOwedCents: 1e9 }, 10)).toBe(0.4);
    expect(moneyFactor(dm({ moneySensitivity: 0.5 }), { ...MONEY, remainingGuaranteeCents: 500, expectedToWorkAgain: false, revenueShareCents: 2000 }, 50)).toBeCloseTo(1 / (1 + 0.5 * 0.25 * 4), 10);
    const out = review(d, PRO, reviewIn({ confidence: 5, money: { ...MONEY, assistantsGuaranteeCents: 120 } }), { ...rng(1), uniform: () => 0 } as never);
    expect(out.outcome).toBe('fire');
    expect(out.deadMoneyAddedCents).toBe(420);
  });

  it('first-year coaches in a rebuild are fired less than a third as often as in a win-now job at equal confidence (E4.5.1)', () => {
    const d = dm();
    const rebuild = firingHazard(d, PRO, reviewIn({ yearOnJob: 1, situation: { situation: 'rebuild', yearOnJob: 1, expectationRising: true, qbEstimateFalling: false } })).pFire;
    const winNow = firingHazard(d, PRO, reviewIn({ yearOnJob: 1, situation: { situation: 'win_now', yearOnJob: 1, expectationRising: true, qbEstimateFalling: false } })).pFire;
    expect(rebuild).toBeLessThan(winNow / 3);
  });

  it('a reloaded save gives the same decision; announced retirements are not reviewed; conduct goes to its own process', () => {
    const d = dm();
    expect(review(d, PRO, reviewIn(), rng(77, 'r'))).toEqual(review(d, PRO, reviewIn(), rng(77, 'r')));
    expect(review(d, PRO, reviewIn({ announcedRetirement: true }), rng(1)).outcome).toBe('not_reviewed');
    expect(review(d, PRO, reviewIn({ underConductInvestigation: true }), rng(1)).outcome).toBe('conduct_process');
  });

  it('emergency reviews: below 30, once a season, scaled 0.25 / 0.4 / 0.15, never in the first 8 games or while alive (E4.3.3)', () => {
    expect(needsEmergencyReview(29, false)).toBe(true);
    expect(needsEmergencyReview(29, true)).toBe(false);
    expect(needsEmergencyReview(30, false)).toBe(false);
    const c = { gamesPlayed: 5, gamesInSeason: 17, gamesOnJob: 20, interimWithHeadCoachExperience: false, aliveForPostseason: false };
    expect(inSeasonFactor(c)).toBe(0.25);
    expect(inSeasonFactor({ ...c, gamesPlayed: 10 })).toBe(0.4);
    expect(inSeasonFactor({ ...c, gamesPlayed: 16 })).toBe(0.15);
    expect(inSeasonFactor({ ...c, interimWithHeadCoachExperience: true })).toBeCloseTo(0.35, 10);
    expect(inSeasonFactor({ ...c, gamesOnJob: 7 })).toBe(0);
    expect(inSeasonFactor({ ...c, aliveForPostseason: true })).toBe(0);
  });

  it('no modifier keyed to a coaching change exists anywhere in the module (E4.3.5)', () => {
    for (const f of srcFiles()) expect(code(f)).not.toMatch(/bounce|newCoachBonus|coachChange|changedCoach/i);
  });

  it('extension: never below 65, always after a title, lame duck in the last year between 55 and 74 (E4.8.1)', () => {
    for (let c = 0; c < 65; c++) expect(extensionCheck({ confidence: c, contractYearsLeft: 1, courtedByAnotherClub: true, wonTitle: false, keptWithConditionsThisOffseason: false })).not.toBe('offer');
    expect(extensionCheck({ confidence: 10, contractYearsLeft: 4, courtedByAnotherClub: false, wonTitle: true, keptWithConditionsThisOffseason: true })).toBe('offer');
    expect(extensionCheck({ confidence: 66, contractYearsLeft: 3, courtedByAnotherClub: true, wonTitle: false, keptWithConditionsThisOffseason: false })).toBe('offer');
    expect(extensionCheck({ confidence: 80, contractYearsLeft: 4, courtedByAnotherClub: false, wonTitle: false, keptWithConditionsThisOffseason: false })).toBe('none');
    expect(extensionCheck({ confidence: 60, contractYearsLeft: 1, courtedByAnotherClub: false, wonTitle: false, keptWithConditionsThisOffseason: false })).toBe('lame_duck');
  });
});

const PRO_SIM: SimOptions = { seed: 1, teams: 32, games: 17, seasons: 200, model: 'pro', postseasonShare: 14 / 32, postseasonWinShare: 0.59, contractYears: 5, salaryOverRevenue: 0.05, offseasonWeeks: 34 };
const COLLEGE_SIM: SimOptions = { seed: 1, teams: 130, games: 12, seasons: 200, model: 'college', postseasonShare: 0.3, postseasonWinShare: 0.5, contractYears: 6, salaryOverRevenue: 0.08, offseasonWeeks: 38 };

describe('calibration on the synthetic test league (E4.3.1 acceptance 1, E4.7.2 acceptance 2, K8.4.1)', () => {
  it('professional: 5 to 9 firings a season on average, no more than 5% of seasons outside 3 to 11 (800 seasons, four seeds)', () => {
    const all = [1, 2, 3, 4].flatMap((seed) => simulate({ ...PRO_SIM, seed }).firingsPerSeason);
    expect(mean(all)).toBeGreaterThanOrEqual(5);
    expect(mean(all)).toBeLessThanOrEqual(9);
    expect(all.filter((x) => x < 3 || x > 11).length / all.length).toBeLessThanOrEqual(0.05);
  });

  it('college: 6% to 12% of programs fire their head coach each season', () => {
    const r = simulate(COLLEGE_SIM);
    const share = mean(r.firingsPerSeason) / COLLEGE_SIM.teams;
    expect(share).toBeGreaterThanOrEqual(0.06);
    expect(share).toBeLessThanOrEqual(0.12);
  });

  it('teams that fired a coach improve no more than record-matched teams that did not, within sampling error (no bounce)', () => {
    // Matched on the season's record AND the public preseason estimate: firing selects on record against
    // expectation, so record alone leaves a regression gap even in a world with no coach effect at all.
    const rows = simulate({ ...PRO_SIM, seed: 5 }).rows.filter((x) => x.winShare === Math.round(x.winShare * 17) / 17);
    const byKey = new Map(rows.map((x) => [`${x.team}:${x.season}`, x]));
    const diffs = new Map<string, { fired: number[]; kept: number[] }>();
    for (const x of rows) {
      const next = byKey.get(`${x.team}:${x.season + 1}`);
      if (!next) continue;
      const key = `${Math.round(x.winShare * 17)}:${Math.round(x.publicEstimate / 2)}`;
      if (!diffs.has(key)) diffs.set(key, { fired: [], kept: [] });
      (x.fired ? diffs.get(key)!.fired : diffs.get(key)!.kept).push(next.winShare - x.winShare);
    }
    let num = 0, den = 0, varSum = 0;
    for (const b of diffs.values()) {
      if (b.fired.length < 3 || b.kept.length < 3) continue;
      const d = mean(b.fired) - mean(b.kept);
      const v = b.fired.reduce((s, x) => s + (x - mean(b.fired)) ** 2, 0) / (b.fired.length - 1) / b.fired.length;
      num += d * b.fired.length; den += b.fired.length; varSum += v * b.fired.length ** 2;
    }
    const effect = num / den;
    const se = Math.sqrt(varSum) / den;
    expect(Math.abs(effect)).toBeLessThan(3 * se + 0.01);
  });
});

describe('K8.4.2 the search', () => {
  const pool: CandidateView[] = [
    { personId: 1, rung: 7, side: 'offense', labels: ['aggressive', 'player_developer'], publicRecord: 0.4, firstHand: null, references: [], interview: null, fromTopStaff: false, underContractElsewhere: false },
    { personId: 2, rung: 7, side: 'defense', labels: ['disciplinarian'], publicRecord: 0.3, firstHand: 0.5, references: [70], interview: null, fromTopStaff: false, underContractElsewhere: false },
    { personId: 3, rung: 8, side: 'head_coach', labels: ['conservative'], publicRecord: 0.5, firstHand: null, references: [], interview: null, fromTopStaff: true, underContractElsewhere: true },
  ];
  const prefs = (labelWeights: Record<string, number>): SearchPreferences => ({ labelWeights, minRung: 6, sides: ['offense', 'defense', 'head_coach'], minPublicRecord: -1, firedCoachFaults: [], opposites: {} });

  it('two deciders with different culture records rank the same three candidates differently, each traceable to labels', () => {
    const a = rankCandidates(prefs({ aggressive: 1, player_developer: 0.5 }), pool).map((s) => s.personId);
    const b = rankCandidates(prefs({ disciplinarian: 1.2, conservative: 0.2 }), pool).map((s) => s.personId);
    expect(a).not.toEqual(b);
    expect(scoreCandidate(prefs({ aggressive: 1 }), pool[0]!).parts.labels).toBe(1);
  });

  it('reaction hiring rewards the opposite of the fired coach\'s perceived fault; fashion rewards top staffs', () => {
    const p = { ...prefs({}), firedCoachFaults: ['too_soft'], opposites: { too_soft: 'disciplinarian' } };
    expect(scoreCandidate(p, pool[1]!).parts.reaction).toBe(P('search.reactionBonus'));
    expect(scoreCandidate(p, pool[2]!).parts.fashion).toBe(P('search.fashionBonus'));
  });

  it('hidden quality and hiring score correlate positively and well below 1 (score reads only the public record)', () => {
    const r = rng(31, 'pool');
    const q: number[] = [], s: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const quality = r.normal();
      const c: CandidateView = { personId: i, rung: 7, side: 'offense', labels: r.chance(0.3) ? ['aggressive'] : [], publicRecord: Math.max(-1, Math.min(1, 0.3 * quality + 0.4 * r.normal())), firstHand: null, references: [], interview: Math.max(0, Math.min(1, 0.5 + 0.1 * quality + 0.2 * r.normal())), fromTopStaff: r.chance(0.2), underContractElsewhere: false };
      q.push(quality); s.push(scoreCandidate(prefs({ aggressive: 0.5 }), c).score);
    }
    const c = corr(q, s);
    expect(c).toBeGreaterThan(0.1);
    expect(c).toBeLessThan(0.9);
  });

  it('nobody accepts: the interim is kept', () => {
    const out = runSearch(prefs({}), pool, () => false);
    expect(out.hired).toBeNull();
    expect(out.offers.length).toBe(3);
    expect(runSearch(prefs({}), pool, (id) => id === 2).hired).toBe(2);
  });

  it('tampering goes through the one K2.8.2 procedure: an imported decider never commits', () => {
    const state = compliance.emptyCompliance();
    const scores = rankCandidates(prefs({ conservative: 3 }), pool);
    const disp = (origin: 'generated' | 'imported') => ({ personId: 1, origin, ruleRespectZ: -3, riskTolerance: 100, candor: 50, pressure: 1 });
    const date = { seasonYear: 2026, dayIndex: 40 } as never;
    const conduct = (scope: readonly (string | number)[]) => rng(scope.length + 1, 'conduct');
    expect(considerTampering(state, dm(), disp('imported'), scores[0]!, scores[1]!, 0.05, 0.2, date, conduct).reason).toBe('protected_person');
    const g = considerTampering(state, dm(), disp('generated'), scores[0]!, scores[1]!, 0.05, 0.2, date, conduct);
    expect(g.opportunity.classId).toBe('tampering_coaches');
    expect(['commit', 'rate_limit']).toContain(g.reason);
  });
});

describe('K8.5.1 the college chain of pressure', () => {
  it('sustained losing lowers booster mood and the giving index for next year\'s budget', () => {
    let mood = 50;
    const recent: Result[] = [];
    for (let g = 0; g < 12; g++) {
      mood = applyBoosterMood(mood, boosterMoodChange(1, { games: [{ reading: game({ gameId: g, result: 'L', pPublic: 0.6, rivalry: g === 11, stage: g === 11 ? 'marquee' : 'regular' }), recent: [...recent] }], petRecruits: [], obligations: [] }));
      recent.push('L');
    }
    expect(mood).toBeLessThan(50);
    expect(givingIndex(mood)).toBeLessThan(givingIndex(50));
    expect(boosterMoodChange(1, { games: [], petRecruits: [1], obligations: [true] })).toBeGreaterThan(0);
  });

  it('a funded buyout raises firing probability at the same confidence', () => {
    const d = dm({ moneySensitivity: 0.8 });
    const big = { ...MONEY, remainingGuaranteeCents: 2000 };
    const unfunded = firingHazard(d, COLLEGE, reviewIn({ money: big })).pFire;
    const funded = firingHazard(d, COLLEGE, reviewIn({ money: { ...big, boosterFundingCents: 1000 } })).pFire;
    expect(funded).toBeGreaterThan(unfunded);
  });

  it('the president can force a firing regardless of record, or veto one; neither exists above an owner', () => {
    expect(presidentForcesFiring({ cleanProgramWeight: 0.8, academicsWeight: 0.2 }, true, false)).toBe(true);
    expect(presidentForcesFiring({ cleanProgramWeight: 0.2, academicsWeight: 0.2 }, true, false)).toBe(false);
    const d = dm();
    expect(review(d, COLLEGE, reviewIn({ confidence: 90, presidentForces: true }), rng(1)).outcome).toBe('fire_for_cause');
    expect(review(d, PRO, reviewIn({ confidence: 90, presidentForces: true }), rng(1)).outcome).toBe('keep');
    const zero = { ...rng(1), uniform: () => 0 } as never;
    expect(review(d, COLLEGE, reviewIn({ confidence: 10, presidentVetoes: true }), zero).outcome).toBe('keep_with_conditions');
  });
});

describe('K8.6.1 agents', () => {
  const agent = (aggression: number, id = 1): AgentProfile => ({ personId: id, negotiation: 0.5, aggression, candor: 50, clientIds: [] });

  it('more aggressive agents produce higher signed values and more failed talks over 30 simulated offseasons', () => {
    const r = rng(41, 'agents');
    const tally = { soft: { value: 0, n: 0, failed: 0 }, hard: { value: 0, n: 0, failed: 0 } };
    for (let season = 0; season < 30; season++) {
      for (let p = 0; p < 40; p++) {
        const value = 100 + 20 * r.normal();
        const alternative = value * (0.9 + 0.2 * r.uniform());
        const teamMax = value * (0.95 + 0.25 * r.uniform());
        const team = { offer: value * 0.85, max: teamMax };
        for (const [k, ag] of [['soft', 0.1], ['hard', 0.9]] as const) {
          const a = agent(ag);
          const res = negotiate(a, agentPosition(a, value, alternative, 1), team);
          if (res.signed) { tally[k].value += res.value! / value; tally[k].n++; } else tally[k].failed++;
        }
      }
    }
    expect(tally.hard.value / tally.hard.n).toBeGreaterThan(tally.soft.value / tally.soft.n);
    expect(tally.hard.failed).toBeGreaterThan(tally.soft.failed);
  });

  it('public pressure only after 3 stalled weeks with a stressed client; many clients on a team soften the agent; no agent means defaults', () => {
    const a = agent(0.9);
    expect(publicPressure(a, 3, 90, true, 1)).toBeNull();
    expect(publicPressure(a, 4, 30, true, 1)).toBeNull();
    expect(publicPressure(a, 4, 90, true, 1)).toBe('trade_request');
    expect(publicPressure(agent(0.2), 4, 90, true, 1)).toBe('holdout_threat');
    expect(publicPressure(a, 4, 90, false, 1)).toBe('leak');
    expect(effectiveAggression(a, 4)).toBeLessThan(effectiveAggression(a, 1));
    expect(defaultAgent().aggression).toBe(P('agent.default.aggression'));
  });
});

describe('K8.7.1 media stories', () => {
  const outlet: Outlet = { id: 1, interests: { game_result: 1, firing: 1.5, arrest: 1 }, controversy: 0.8, outcomeBias: 1, edges: { 50: 80 } };
  const ev = (over: Partial<PublicEventView>): PublicEventView => ({ eventId: 1, type: 'game_result', notability: 50, teamIds: [7], personIds: [50], harm: 'none', fromLeak: false, ...over });

  it('every story links to at least one public event, and the angle follows a public label when one fits', () => {
    const stories = pickStories(outlet, [ev({ eventId: 1 }), ev({ eventId: 2, type: 'firing', notability: 80 }), ev({ eventId: 3, notability: 10 }), ev({ eventId: 4, type: 'weather', notability: 90 })],
      [{ subjectId: 50, label: 'conservative', evidenceEventIds: [11, 12] }], { 7: -4 }, {});
    expect(stories.length).toBe(3);
    for (const s of stories) expect(s.evidence.length).toBeGreaterThan(0);
    expect(stories[0]!.angle).toBe('conservative');
    expect(stories[0]!.evidence).toEqual([2, 11, 12]);
    expect(stories.map((s) => s.evidence[0])).not.toContain(4);
  });

  it('no personal or harmful story about an imported person, ever; professional stories still run', () => {
    const origins = { 50: 'imported' as const };
    const out = pickStories(outlet, [ev({ eventId: 9, type: 'arrest', harm: 'harmful', notability: 99 }), ev({ eventId: 10, type: 'firing', harm: 'professional_negative' })], [], {}, origins);
    expect(out.map((s) => s.evidence[0])).toEqual([10]);
    const r = rng(51, 'media30');
    for (let i = 0; i < 30 * 52; i++) {
      const harm = (['none', 'professional_negative', 'personal', 'harmful'] as const)[r.int(0, 3)]!;
      for (const s of pickStories(outlet, [ev({ eventId: i, type: 'arrest', harm, notability: r.int(1, 100) })], [], {}, origins)) {
        expect(['personal', 'harmful']).not.toContain(harm);
        expect(s.subjectPersonIds).toContain(50);
      }
    }
  });

  it('a good relationship softens a negative tone by 20%; tone carries over with a 3-week half-life; a leak story lifts detection', () => {
    const plain: Outlet = { ...outlet, controversy: 0, edges: {} };
    const friendly: Outlet = { ...plain, edges: { 50: 90 } };
    const a = pickStories(plain, [ev({})], [], { 7: -3 }, {})[0]!.tone;
    const b = pickStories(friendly, [ev({})], [], { 7: -3 }, {})[0]!.tone;
    expect(b).toBeCloseTo(a * 0.8, 10);
    let tone = 80;
    for (let w = 0; w < 3; w++) tone = updateMediaTone(tone, []);
    expect(tone).toBeCloseTo(65, 6);
    expect(halfLifeFactor(3) ** 3).toBeCloseTo(0.5, 10);
    expect(leakDetectionLift(pickStories(outlet, [ev({ fromLeak: true })], [], {}, {}))).toBe(P('media.leakDetectionLift'));
  });
});

describe('K8.8.1 fan mood', () => {
  it('mood falls through a losing streak and recovers on a winning one', () => {
    let s = newFanBase(7, true);
    const recent: Result[] = [];
    for (let g = 0; g < 6; g++) { s = fansAfterGame(s, game({ gameId: g, result: 'L', pPublic: 0.55, margin: -10 }), recent); recent.push('L'); }
    const low = fanMood(s);
    expect(low).toBeLessThan(50);
    for (let g = 6; g < 14; g++) { s = fansAfterGame(s, game({ gameId: g, result: 'W', pPublic: 0.45, margin: 10 }), recent); recent.push('W'); }
    expect(fanMood(s)).toBeGreaterThan(low);
  });

  it('the hire term lifts fanMood but never the mood J12 reads for crowd noise (E4.3.5)', () => {
    const s = fansOffseason({ ...newFanBase(7, true), running: -3 }, true);
    expect(fanMood(s)).toBeGreaterThan(noiseMood(s));
    expect(noiseMood(s)).toBe(noiseMood(fansOffseason({ ...newFanBase(7, true), running: -3 }, false)));
  });

  it('the offseason pulls mood 25% of the way to neutral; stars move it; a new team starts neutral with a small base', () => {
    const s = { ...newFanBase(7, true), running: -6 };
    const before = noiseMood(s) - 50;
    expect(noiseMood(fansOffseason(s, false)) - 50).toBeCloseTo(before * 0.75, 10);
    expect(noiseMood(fansAfterStarMove(s, 1))).toBeGreaterThan(noiseMood(s));
    const fresh = newFanBase(99, false);
    expect(fanMood(fresh)).toBe(50);
    expect(fresh.base).toBeLessThan(newFanBase(98, true).base);
  });
});

describe('observers', () => {
  it('the decider observes with his own outcome bias', () => {
    expect(deciderObserver(dm({ outcomeBias: 0.3 })).outcomeBias).toBe(0.3);
  });
});
