// S3 leaf acceptance lines for grading and the graduate assistant seat.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import {
  adviceScore, bossTakesRecommendation, chartChecked, chartScore, checkGaHire, creditsCompleted, endTerm, fieldScore, gaRulesFrom,
  lookQuality, meetingGainPerCall, newGaSeat, readinessGain, reelScore, requiredCredits, selfScoutScore, signalScore, snapGradeScore,
  tagCredit, teachingTerm, tendencyReportScore, videoScore, drillGain, param, type GaRules, type GaSeatState,
} from '../../src/ladder/index.ts';

describe('S3.2 entry work', () => {
  it('S3.2.1: a perfect chart scores 100; missed reps cost 5 each; under 80 is not checked', () => {
    expect(chartScore(60, 60, 0)).toBe(100);
    expect(chartScore(60, 60, 2)).toBe(90);
    expect(chartChecked(79)).toBe(false);
    expect(chartScore(0, 60, 30)).toBe(0);
  });
  it('S3.2.1: at tempo, keeping result and bust over personnel scores better than missing reps', () => {
    // 12 reps, 6 fields due each. Keeping 4 fields every rep beats entering all 6 and missing a third of the reps.
    const keepFour = chartScore(12 * 4, 12 * 6, 0);
    const allSixMissFour = chartScore(8 * 6, 12 * 6, 4);
    expect(keepFour).toBeGreaterThan(allSixMissFour);
  });
  it('S3.2.2: a signal past 4 seconds shows up as lost play clock', () => {
    const g = signalScore([{ correct: true, delaySeconds: 2 }, { correct: true, delaySeconds: 7 }]);
    expect(g.playClockLostSeconds).toBe(3);
    expect(g.score).toBe(50);
  });
  it('S3.2.3: 60% labels, 40% coverage; unfilmed periods lower the score', () => {
    expect(videoScore(1, 10, 10)).toBe(100);
    expect(videoScore(1, 5, 10)).toBeCloseTo(80, 9);
  });
});

describe('S3.3 graduate assistant work', () => {
  it('S3.3.1: partial credit follows the tag family tree', () => {
    expect(tagCredit('cover3/buzz', 'cover3/sky')).toBeGreaterThan(tagCredit('cover3/buzz', 'quarters/match'));
    expect(tagCredit('cover3/buzz', 'cover3/buzz')).toBe(1);
    expect(fieldScore([{ coveragePost: 'cover3/buzz', down: '3' }], [{ coveragePost: 'quarters', down: '3' }], { coveragePost: 2, down: 0.5 })).toBeCloseTo(20, 9);
  });
  it('S3.3.2: a card set copied exactly from film grades at least 95 on the truth part', () => {
    const rows = [{ front: 'odd/3-4', coveragePost: 'cover1/robber' }, { front: 'tite', coveragePost: 'cover3/sky' }];
    expect(fieldScore(rows, rows)).toBeGreaterThanOrEqual(95);
  });
  it('S3.3.3: halving look quality halves the readiness gain', () => {
    const q = lookQuality(1, 0.8, 0.9);
    expect(readinessGain(10, q / 2)).toBeCloseTo(readinessGain(10, q) / 2, 12);
  });
});

describe('S3.4 quality control', () => {
  const truth = [{ key: 'a', share: 0.9 }, { key: 'b', share: 0.8 }, { key: 'c', share: 0.75 }, { key: 'd', share: 0.6 }, { key: 'e', share: 0.5 }];
  it('S3.4.1: listing only the three largest true tendencies scores above 85; a wrong small-sample finding is overreach', () => {
    expect(tendencyReportScore(truth, [{ key: 'a', share: 0.88, n: 30 }, { key: 'b', share: 0.8, n: 25 }, { key: 'c', share: 0.7, n: 20 }]).score).toBeGreaterThan(85);
    const g = tendencyReportScore(truth, [{ key: 'd', share: 0.1, n: 6 }]);
    expect(g.overreach).toEqual(['d']);
    expect(g.missed).toEqual(['a', 'b', 'c']);
  });
  it('S3.4.2: each omitted tendency above the alert threshold lowers the grade', () => {
    const all = selfScoutScore(truth, ['a', 'b', 'c']).score;
    expect(selfScoutScore(truth, ['a', 'b']).score).toBeLessThan(all);
  });
  it('S3.4.3: one mislabeled clip in ten grades below a clean reel', () => {
    expect(reelScore([...Array(9).fill(true), false])).toBeLessThan(reelScore(Array(10).fill(true)));
  });
  it('S3.4.4: advice costing over 2 points of win probability is an error; within the margin is correct', () => {
    expect(adviceScore([2.5]).errors).toBe(1);
    expect(adviceScore([0.3]).score).toBe(100);
    expect(adviceScore([1.9]).errors).toBe(0);
  });
});

describe('S3.5 position coach', () => {
  it('S3.5.3: random grades score near 50, truthful above 90', () => {
    const s = stream(seedFromNumber(9), 'career.ladder.test', []);
    const truth = Array.from({ length: 2000 }, () => ({ assignment: s.chance(0.5), technique: ([-1, 0, 1] as const)[s.int(0, 2)]! }));
    const random = truth.map(() => ({ assignment: s.chance(0.5), technique: ([-1, 0, 1] as const)[s.int(0, 2)]! }));
    expect(Math.abs(snapGradeScore(truth, random) - 50)).toBeLessThan(6);
    expect(snapGradeScore(truth, truth)).toBeGreaterThan(90);
  });
  it('S3.5.1: the teaching term spans 0.8 to 1.2, the default plan is 1.0, and the same choices give the same gain in any season', () => {
    expect(teachingTerm({ aimedAtWeakest: 0, pointCorrect: 0, repsToNeediest: 0 })).toBeCloseTo(0.8, 12);
    expect(teachingTerm({ aimedAtWeakest: 1, pointCorrect: 1, repsToNeediest: 1 })).toBeCloseTo(1.2, 12);
    expect(teachingTerm('default_plan')).toBe(1);
    const good = drillGain(15, 0.9, teachingTerm({ aimedAtWeakest: 1, pointCorrect: 1, repsToNeediest: 0.5 }), 0.8);
    const poor = drillGain(15, 0.9, teachingTerm({ aimedAtWeakest: 0, pointCorrect: 0.5, repsToNeediest: 0 }), 0.8);
    expect(good).toBeGreaterThan(poor);
  });
  it('S3.5.2: doubling new calls in a fixed meeting lowers per-call knowledge gain', () => {
    expect(meetingGainPerCall(40, 8, 1, 1, true, true)).toBeLessThan(meetingGainPerCall(40, 4, 1, 1, true, true));
  });
  it('S3.5.4: with boss trust at maximum the depth order is used unchanged', () => {
    expect(bossTakesRecommendation(1, 100)).toBe(true);
    expect(bossTakesRecommendation(0.6, 40)).toBe(false);
  });
});

describe('S3.3.4 graduate assistant seat', () => {
  const college: GaRules = gaRulesFrom({ 'staff.ga_degree_window_years': 7, 'staff.ga_min_load_share': 0.5, 'staff.ga_term_years': 2, 'staff.ga_extension_semester_hours': 24, 'staff.ga_max_years': 3 });
  const pro = gaRulesFrom({});
  const serve = (rules: GaRules, creditsPerTerm: number, hoursPerWeek: number, terms: number) => {
    let st: GaSeatState = newGaSeat(rules);
    const outcomes: string[] = [];
    for (let i = 0; i < terms; i++) { const r = endTerm(st, rules, creditsCompleted(creditsPerTerm, hoursPerWeek, rules)); st = r.state; outcomes.push(r.outcome); }
    return { st, outcomes };
  };
  it('the load is half the school full-time graduate load: 5 credit hours at the starting load', () => {
    expect(requiredCredits(college)).toBe(5);
    expect(requiredCredits(pro)).toBeNull();
  });
  it('zero coursework hours for a term loses the seat at term end', () => {
    expect(serve(college, 5, 0, 1).outcomes).toEqual(['lost_enrolment']);
  });
  it('5 credit hours every term keeps the seat two years and no third; 6 a term earns the third year; three is the most', () => {
    const five = serve(college, 5, param('enrol.courseworkHoursPerWeek'), 6);
    expect(five.outcomes.slice(0, 4)).toEqual(['kept', 'kept', 'kept', 'term_ended']);
    const six = serve(college, 6, 10, 6);
    expect(six.outcomes).toEqual(['kept', 'kept', 'kept', 'extended', 'kept', 'term_ended']);
    expect(six.st.yearsGranted).toBe(3);
  });
  it('a degree eight years old can be hired only as a logged violation', () => {
    expect(checkGaHire(college, 2018, null, 2026).violation).toBe(true);
    expect(checkGaHire(college, 2020, null, 2026).violation).toBe(false);
    expect(checkGaHire(college, 2017, 2019, 2026).violation).toBe(false);
  });
  it('a pro coaching assistant has no classes and no term limit', () => {
    const r = serve(pro, 0, 0, 12);
    expect(r.outcomes.every((o) => o === 'kept')).toBe(true);
    expect(checkGaHire(pro, 1990, null, 2026).violation).toBe(false);
  });
});
