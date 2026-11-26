// G-78 the boss and evaluations (S4, K6.5). Each acceptance criterion of S4 and K6.5 has a named test.
import { describe, expect, it } from 'vitest';
import { seedFromNumber, stream } from '@gm/engine-core';
import { generateCoachProfile, type Draws } from '../../src/profile/index.ts';
import * as boss from '../../src/boss/index.ts';
import type { Boss, BossFacets, GradeRecord } from '../../src/boss/index.ts';

const SEED = seedFromNumber(20261126);
const draws = (scope: readonly (string | number)[]): Draws => stream(SEED, 'coachAI', scope);

const FACETS: BossFacets = { standards: 50, delegation: 50, ego: 50, loyaltyToStaff: 50, hoursCulture: 50, detailFocus: {} };
function makeBoss(id: number, f: Partial<BossFacets> = {}, beliefs: Record<string, number> = {}): Boss {
  const profile = generateCoachProfile(
    { personId: `p${id}`, level: 'pro', role: 'offensiveCoordinator', age: 45, playedSide: null, seasonsCalling: 3, seasonsAsHeadCoach: 0 },
    stream(SEED, 'worldgen', ['coach', id]),
  );
  return { personId: id, profile, facets: { ...FACETS, ...f }, beliefs, imported: false };
}

const report = { kind: 'rows', answers: [{ formation: 'trips', down: null }, { formation: 'bunch', down: null }, { formation: 'empty', down: '3' }], missed: 0 };

describe('S4.1.1 system, standards and preferences', () => {
  it('two bosses with opposite detail_focus grade the same report in the expected direction', () => {
    const formationMan = makeBoss(1, { detailFocus: { formation: 5, down: 1 } });
    const downMan = makeBoss(2, { detailFocus: { formation: 1, down: 5 } });
    const a = boss.rateProduct(formationMan, report, null).score;
    const b = boss.rateProduct(downMan, report, null).score;
    expect(a).toBeGreaterThan(b);
  });

  it('a higher standards bar marks the same work lower', () => {
    expect(boss.rateProduct(makeBoss(1, { standards: 90 }), report, null).score).toBeLessThan(boss.rateProduct(makeBoss(1, { standards: 20 }), report, null).score);
  });

  it('a finding against his belief is marked down, and evidence wins it back', () => {
    const b = makeBoss(3, {}, { 'run.first_down': 0.4 });
    const agree = boss.rateProduct(b, { kind: 'findings', findings: [{ key: 'run.first_down', share: 0.42, n: 10 }] } as never, null).score;
    const thin = boss.rateProduct(b, { kind: 'findings', findings: [{ key: 'run.first_down', share: 0.7, n: 5 }] } as never, null).score;
    const strong = boss.rateProduct(b, { kind: 'findings', findings: [{ key: 'run.first_down', share: 0.7, n: 200 }] } as never, null).score;
    expect(thin).toBeLessThan(agree);
    expect(strong).toBeGreaterThan(thin);
  });

  it('the brief names his system and two or three priorities; events reveal facets as words', () => {
    const b = makeBoss(4, { detailFocus: { third_down: 4, red_zone: 3, formation: 0.5 }, standards: 90 });
    const brief = boss.briefFor(b);
    expect(brief.priorities.slice(0, 2)).toEqual(['third_down', 'red_zone']);
    expect(brief.systemFamily.length).toBeGreaterThan(0);
    const o = boss.reveal(b, 'late_report', 12);
    expect(o).toMatchObject({ facet: 'standards', band: 'high' });
    expect(typeof o.words).toBe('string');
    const panel = boss.learn(boss.learn({}, o), o);
    expect(panel.standards?.seen).toBe(2);
  });

  it('an imported real coach reads neutral personality facets', () => {
    const f = boss.neutralForImported({ ...FACETS, ego: 95, loyaltyToStaff: 5, hoursCulture: 99, standards: 80 }, true);
    expect([f.ego, f.loyaltyToStaff, f.hoursCulture, f.standards]).toEqual([50, 50, 50, 80]);
  });
});

describe('S4.1.2 assignments', () => {
  it('total assigned hours scale with hours_culture across seeded trials', () => {
    const needs = [{ productId: 'a', family: 'reports', hours: 10 }, { productId: 'b', family: 'film_tagging', hours: 12 }];
    const staff = [{ personId: 7, families: ['reports', 'film_tagging'], trust: 40, available: true }];
    let prev = -1;
    for (const hc of [0, 25, 50, 75, 100]) {
      let total = 0;
      for (let t = 0; t < 50; t++) total += boss.hoursFor(7, boss.assignWeek(makeBoss(5, { hoursCulture: hc }), needs, staff, draws(['assign', hc, t])));
      expect(total).toBeGreaterThan(prev);
      prev = total;
    }
  });

  it('products go to the trusted junior whose seat covers them; two bosses can over-assign', () => {
    const b = makeBoss(5, { hoursCulture: 100 });
    const staff = [{ personId: 8, families: ['reports'], trust: 30, available: true }, { personId: 9, families: ['reports'], trust: 60, available: true }];
    const a = boss.assignWeek(b, [{ productId: 'r', family: 'reports', hours: 40 }], staff, draws(['assign2']));
    expect(a[0]!.personId).toBe(9);
    expect(boss.overAssigned(9, [a, a])).toBe(true);
    expect(boss.moreTimeCost(makeBoss(1, { standards: 90 }))).toBeGreaterThan(0);
    expect(boss.moreTimeCost(makeBoss(1, { standards: 40 }))).toBe(0);
  });
});

function rec(b: Boss, worker: number, family: string, score: number, day: number, onTime = true, truth: number | null = null): GradeRecord {
  return boss.gradeRecord(b, { workerId: worker, dutyId: `d${day}`, family, day, grader: truth === null ? 'boss' : 'mixed', truthScore: truth, bossScore: score, onTime, hoursSpent: 3, usedAs: 'unchanged' });
}

describe('S4.2.1 trust', () => {
  it('perfect on-time work at grade 80 reaches the 75 threshold within one season under average delegation', () => {
    const b = makeBoss(6);
    let t = boss.initialTrust('stranger', 0);
    expect(t).toBe(20);
    // A season: 17 weeks, four graded products a week (S3 duty lists for rungs 1 to 3).
    for (let i = 0; i < 17 * 4; i++) t = boss.trustAfterRecord(t, rec(b, 1, 'reports', 80, i));
    expect(boss.perks(b, t).nextRungDuty).toBe(true);
  });

  it('late or missing work moves trust down with a large step; proved right moves it up', () => {
    const b = makeBoss(6);
    expect(boss.trustAfterRecord(50, rec(b, 1, 'reports', 50, 1, false))).toBeLessThan(50 - 3);
    const missing = boss.gradeRecord(b, { workerId: 1, dutyId: 'x', family: 'reports', day: 1, grader: 'boss', truthScore: null, bossScore: null, onTime: false, missing: true, hoursSpent: 0, usedAs: 'not_used' });
    expect(boss.trustAfterRecord(50, missing)).toBeLessThan(45);
    expect(boss.trustAfterReview(50, true)).toBeGreaterThan(55);
  });

  it('a high-delegation boss widens ownership sooner; a known hire starts higher', () => {
    expect(boss.perks(makeBoss(1, { delegation: 100 }), 55).recommendAccepted).toBe(true);
    expect(boss.perks(makeBoss(1, { delegation: 0 }), 55).recommendAccepted).toBe(false);
    expect(boss.initialTrust('known', 50)).toBeGreaterThan(boss.initialTrust('stranger', 50));
    expect(boss.trustUnderNewBoss('stranger', 50, 1)).toBeGreaterThan(boss.trustUnderNewBoss('stranger', 50, -1));
  });
});

describe('S4.3 grade records and the season evaluation', () => {
  it('every completed duty writes exactly one record, with truth and boss scores side by side', () => {
    const b = makeBoss(10);
    const records = [1, 2, 3].map((d) => rec(b, 1, 'reports', 60, d, true, 90));
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ truthScore: 90, bossScore: 60, score: 75 });
    expect(boss.certifiedScore(records[0]!)).toBe(90);
  });

  it('area ratings reproduce from the grade records and the boss weights', () => {
    const b = makeBoss(11, { detailFocus: { reports: 3, film_tagging: 1 } });
    const records = [rec(b, 1, 'reports', 80, 1), rec(b, 1, 'reports', 60, 2), rec(b, 1, 'film_tagging', 40, 3), rec(b, 2, 'reports', 10, 4)];
    const i = { workerId: 1, season: 2030, records, trust: 50, relationship: 0, losingSeason: false, bossDeparted: false };
    const ev = boss.seasonEvaluation(b, i, null);
    expect(ev.areas).toEqual({ film_tagging: 40, reports: 70 });
    expect(ev.overall).toBeCloseTo((3 * 70 + 40) / 4, 10);
    expect(boss.seasonEvaluation(b, i, null)).toEqual(ev);
    const losing = boss.seasonEvaluation(b, { ...i, losingSeason: true }, null);
    expect(losing.overall).toBeLessThan(ev.overall);
    expect(boss.seasonEvaluation(b, { ...i, losingSeason: true, trust: 90 }, null).overall).toBe(ev.overall);
  });

  it('making his case with truth evidence moves one rating, at most by the cap', () => {
    const b = makeBoss(12);
    const records = [rec(b, 1, 'reports', 40, 1, true, 95), rec(b, 1, 'film_tagging', 50, 2, true, 60)];
    const i = { workerId: 1, season: 2030, records, trust: 50, relationship: 0, losingSeason: false, bossDeparted: false };
    const ev = boss.seasonEvaluation(b, i, null);
    const after = boss.makeCase(b, ev, i);
    expect(after.caseArea).toBe('reports');
    expect(after.areas['reports']! - ev.areas['reports']!).toBeLessThanOrEqual(boss.B('case_max_move'));
    expect(after.areas['film_tagging']).toBe(ev.areas['film_tagging']);
  });
});

describe('S4.4.1 disagreeing with the boss', () => {
  it('each option produces a distinct, logged outcome', () => {
    const b = makeBoss(13, { ego: 90, standards: 90 });
    const base = { workerId: 1, pointId: 'p1', evidence: 0.8, trust: 70, ownership: 'recommend' as const, headCoachTrustInWorker: 80, headCoachTrustInBoss: 40 };
    const ways = ['comply', 'private', 'meeting', 'around', 'quiet'] as const;
    const outs = ways.map((way) => boss.disagree(b, { ...base, way }, draws(['disagree', way])));
    const sig = outs.map((o) => JSON.stringify({ ...o, changed: undefined, ownWayRuns: undefined, insubordination: undefined, trustDelta: undefined }));
    expect(new Set(sig).size).toBe(ways.length);
    for (const o of outs) expect(o.logged.pointId).toBe('p1');
    expect(outs[3]!.permanentDamage).toBe(true);
  });

  it('public challenge is less likely to change his mind than private, more so with ego; no chance is ever zero or one', () => {
    const b = makeBoss(13, { ego: 90 });
    expect(boss.changeChance(b, 0.8, 70, true)).toBeLessThan(boss.changeChance(b, 0.8, 70, false));
    expect(boss.changeChance(b, 0, 0, true)).toBeGreaterThan(0);
    expect(boss.changeChance(b, 1, 100, false)).toBeLessThan(1);
  });

  it('quiet defiance is his right on an Own duty; complying with a rule break logs both coaches', () => {
    const b = makeBoss(14);
    const own = boss.disagree(b, { workerId: 1, pointId: 'q', way: 'quiet', evidence: 0.5, trust: 50, ownership: 'own' }, draws(['quiet']));
    expect(own).toMatchObject({ ownWayRuns: true, insubordination: false });
    expect(boss.safetyIssue(b, 1, 'concussion', 'comply').ruleBreak?.actors).toEqual([14, 1]);
  });
});

describe('S4.4.2 credit and blame', () => {
  it('under a boss with loyalty above 80 the junior gets more outside credit for the same work than under one below 20', () => {
    const loyal = boss.credit(makeBoss(15, { loyaltyToStaff: 90 }), 0.6, 'let_boss');
    const selfish = boss.credit(makeBoss(16, { loyaltyToStaff: 10 }), 0.6, 'let_boss');
    expect(loyal.outsideShare).toBeGreaterThan(selfish.outsideShare);
    expect(loyal.blameShare).toBeLessThan(selfish.blameShare);
    const claim = boss.credit(makeBoss(16, { loyaltyToStaff: 10 }), 0.6, 'claim');
    expect(claim.outsideShare).toBeGreaterThan(selfish.outsideShare);
    expect(claim.relationshipDelta).toBeLessThan(0);
  });
});

describe('S4.5.1 the offseason decision', () => {
  const base = { workerId: 1, overall: 70, lastOverall: 70, trust: 80, openSeatUp: 'seat:qb', bestOutsideScore: null, outsideOffer: false, seriousBreach: false, atTermLimit: false, raiseBudget: true, bossLeavingSeat: undefined };
  const b = makeBoss(17);
  it('promotes into an open seat at trust 75 and keeps, raises, reduces or releases by the rules', () => {
    expect(boss.offseasonDecision(b, base, draws(['d1']))).toEqual({ kind: 'promoted', seatId: 'seat:qb' });
    expect(boss.offseasonDecision(b, { ...base, trust: 60 }, draws(['d2'])).kind).toBe('kept');
    expect(boss.offseasonDecision(b, { ...base, openSeatUp: null, outsideOffer: true }, draws(['d3'])).kind).toBe('kept_with_raise');
    expect(boss.offseasonDecision(b, { ...base, openSeatUp: null, overall: 20, lastOverall: 70 }, draws(['d4'])).kind).toBe('role_reduced');
    expect(boss.offseasonDecision(b, { ...base, openSeatUp: null, overall: 20, lastOverall: 20 }, draws(['d5']))).toEqual({ kind: 'not_renewed', reason: 'standards' });
    expect(boss.offseasonDecision(b, { ...base, seriousBreach: true }, draws(['d6']))).toEqual({ kind: 'not_renewed', reason: 'breach' });
    expect(boss.offseasonDecision(b, { ...base, openSeatUp: null, atTermLimit: true }, draws(['d7']))).toEqual({ kind: 'not_renewed', reason: 'term_limit' });
    expect(boss.offseasonDecision(b, { ...base, bestOutsideScore: 95 }, draws(['d8'])).kind).toBe('kept');
  });

  it('a leaving boss takes trusted staff along more often when he is loyal', () => {
    let loyal = 0, selfish = 0;
    for (let t = 0; t < 400; t++) {
      if (boss.offseasonDecision(makeBoss(18, { loyaltyToStaff: 90 }), { ...base, bossLeavingSeat: 'seat:oc' }, draws(['cwm', 'a', t])).kind === 'come_with_me') loyal++;
      if (boss.offseasonDecision(makeBoss(19, { loyaltyToStaff: 10 }), { ...base, bossLeavingSeat: 'seat:oc' }, draws(['cwm', 'b', t])).kind === 'come_with_me') selfish++;
    }
    expect(loyal).toBeGreaterThan(selfish);
  });
});

describe('K6.5 the boss above the user', () => {
  it('paired runs: an AI assistant with identical outputs gets the identical trust path (no favour or handicap)', () => {
    const b = makeBoss(20);
    const scores = [55, 80, 62, 90, 30, 75, 88, 70];
    let user = boss.initialTrust('stranger', 40), ai = user;
    const pathU: number[] = [], pathA: number[] = [];
    scores.forEach((s, d) => {
      user = boss.trustAfterRecord(user, rec(b, 1, 'reports', s, d, d !== 4));
      ai = boss.trustAfterRecord(ai, rec(b, 2, 'reports', s, d, d !== 4));
      pathU.push(user); pathA.push(ai);
    });
    expect(pathA).toEqual(pathU);
  });

  it('a missed deadline puts the fallback in; suggestions are accepted more often with more trust', () => {
    expect(boss.productForBoss({ submitted: null, fallback: () => 'other' })).toEqual({ product: 'other', fallbackUsed: true });
    expect(boss.productForBoss({ submitted: 'mine', fallback: () => 'other' }).fallbackUsed).toBe(false);
    const b = makeBoss(21);
    expect(boss.acceptChance(b, 80, 0.5)).toBeGreaterThan(boss.acceptChance(b, 20, 0.5));
    expect(boss.weighSuggestion(b, 50, 0.5, draws(['s'])).chance).toBe(boss.acceptChance(b, 50, 0.5));
  });

  it('the judge fits the ladder port and its noise shrinks with the boss evaluation behaviour', () => {
    const b = makeBoss(22);
    const j = boss.judgeFor(b, draws(['judge']));
    const v = j.rate({ id: 'duty:S3.3.1', family: 'film_tagging', kind: 'tagging', grader: 'mixed' }, report);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
    const good = { ...b, profile: { ...b.profile, behavior: { ...b.profile.behavior, evaluation: 3 } } };
    const poor = { ...b, profile: { ...b.profile, behavior: { ...b.profile.behavior, evaluation: -3 } } };
    expect(boss.noiseSd(good)).toBeLessThan(boss.noiseSd(poor));
  });
});

describe('params', () => {
  it('every constant sits inside its range and names a leaf', () => {
    for (const p of boss.PARAMS.params) {
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
      expect(p.leaf.length).toBeGreaterThan(0);
    }
  });
});
