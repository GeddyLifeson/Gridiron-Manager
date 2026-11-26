import { describe, expect, it } from 'vitest';
import { buildCorrections, topPerUnit, setState, wentRight, workOnLine, divergenceNote, foldStreaks, filmHours, stopBeforeSnap, stopAfterPlay, defaultStopRules, driveSummary, SPEEDS_BY_CONTEXT, provisionalParams, PARAMS, type ErrorSnap } from '../../../src/read-models/film/index.ts';
import { ParamFile } from '@gm/schema';

const err = (play: number, person: number, cause: ErrorSnap['line']['cause'], concept: string, epa: number, unit: ErrorSnap['unit'] = 'offense'): ErrorSnap => ({ line: { playId: `7:${play}`, personId: person, cause, by: 'staff:1' }, unit, concept, epa });

describe('correction list (N1.5.1)', () => {
  it('ranks by count x mean expected points lost plus the repeat weight', () => {
    const items = buildCorrections([err(1, 10, 'mental', 'smash', -1), err(2, 11, 'mental', 'smash', -2), err(3, 12, 'technique', 'inside_zone', -2.5)], [[err(9, 10, 'technique', 'inside_zone', -1)], [err(8, 10, 'technique', 'inside_zone', -1)]]);
    expect(items[0]).toMatchObject({ concept: 'inside_zone', count: 1, repeats: 2, priority: 2.5 + 1, fix: 'individual_drill' });
    expect(items[1]).toMatchObject({ concept: 'smash', count: 2, meanEpLost: 1.5, priority: 3, fix: 'meeting_cutup', personIds: [10, 11] });
  });

  it('a scheme cause is an item for the coach; three mental errors suggest a simpler rule', () => {
    const items = buildCorrections([err(1, 10, 'scheme', 'cover3', -1, 'defense'), err(2, 10, 'mental', 'smash', -1), err(3, 11, 'mental', 'smash', -1), err(4, 12, 'mental', 'smash', -1)]);
    expect(items.find((i) => i.cause === 'scheme')).toMatchObject({ forCoach: true, fix: 'change_call' });
    expect(items.find((i) => i.cause === 'mental')!.fix).toBe('simpler_rule');
  });

  it('shows the top items per unit and feeds accepted items to the work-on line', () => {
    const many = Array.from({ length: 12 }, (_, i) => err(i, 20 + i, 'technique', `c${i}`, -1 - i));
    const items = buildCorrections(many);
    const { shown, more } = topPerUnit(items);
    expect(shown.length).toBe(8); expect(more.length).toBe(4);
    const accepted = setState(items, items[0]!.id, 'accepted');
    expect(workOnLine(accepted, items[0]!.personIds[0]!)).toContain('c11');
    expect(() => setState(items, 'nope', 'accepted')).toThrow();
    expect(wentRight([{ playId: 'a', epa: 2.5 }, { playId: 'b', epa: 1 }, { playId: 'c', epa: null }])).toEqual(['a']);
  });
});

describe('production against grade (N1.4.3)', () => {
  it('notes a divergence past the threshold and folds a four-game run', () => {
    const base = { personId: 5, statLine: '0 catches', statPercentile: 10, gradePercentile: 80, gradeText: '7.4', reasons: ['open on 6 of 9 routes, not targeted'], garbageSnaps: 0 };
    expect(divergenceNote({ ...base, gameId: 1, gradePercentile: 30 })).toBeNull();
    const notes = [1, 2, 3, 4].map((g) => divergenceNote({ ...base, gameId: g })!);
    expect(notes[0]!.text).toBe('0 catches, grade 7.4: open on 6 of 9 routes, not targeted');
    const folded = foldStreaks(notes, [1, 2, 3, 4]);
    expect(folded).toHaveLength(1);
    expect(folded[0]!.gameIds).toEqual([1, 2, 3, 4]);
    expect(foldStreaks(notes.slice(0, 3), [1, 2, 3, 4])).toHaveLength(3);
  });
});

describe('film time (N1.6.1)', () => {
  it('free allowance, then a cost per play; grading and charting draw hours', () => {
    expect(filmHours({ playsWatched: 60, sheetsGradedByUser: 0, gamesChartedByUser: 0, gamesChartedByStaff: 0 }).userHours).toBe(0);
    expect(filmHours({ playsWatched: 180, sheetsGradedByUser: 0, gamesChartedByUser: 0, gamesChartedByStaff: 0 }).userHours).toBe(1);
    // A full film week done alone: one room of 10 players graded, 4 opponent games charted, 300 plays watched.
    const alone = filmHours({ playsWatched: 300, sheetsGradedByUser: 10, gamesChartedByUser: 4, gamesChartedByStaff: 0 });
    expect(alone.userHours).toBe(2 + 10 + 16);
    expect(filmHours({ playsWatched: 300, sheetsGradedByUser: 0, gamesChartedByUser: 0, gamesChartedByStaff: 4 })).toEqual({ userHours: 2, staffHours: 16 });
  });
});

describe('watching without calling (I9.4.1) and speeds (I9.2)', () => {
  const sit = { down: 1, distanceYd: 10, yardLine: 45, userHasBall: false, scoreMargin: 14, period: 2, clockTenths: 5000, personnel: '11', formationFamily: 'trips', afterTwoMinute: false };
  it('default rules stop on third down, inside either 20, after the warning in a one-score game, and after turnovers and scores', () => {
    const rules = defaultStopRules();
    expect(stopBeforeSnap(rules, sit)).toBe(false);
    expect(stopBeforeSnap(rules, { ...sit, down: 3 })).toBe(true);
    expect(stopBeforeSnap(rules, { ...sit, yardLine: 85 })).toBe(true);
    expect(stopBeforeSnap(rules, { ...sit, yardLine: 15 })).toBe(true);
    expect(stopBeforeSnap(rules, { ...sit, afterTwoMinute: true })).toBe(true);
    expect(stopAfterPlay(rules, { turnover: true, score: false, starterInjured: false })).toBe(true);
    expect(stopAfterPlay(rules, { turnover: false, score: false, starterInjured: false })).toBe(false);
    expect(() => stopBeforeSnap(Array.from({ length: 11 }, () => ({ kind: 'turnover' as const })), sit)).toThrow();
  });
  it('drive summary lines and speeds by context', () => {
    expect(driveSummary([{ down: 3, distanceYd: 7, publicResult: 'pass complete for 19', flag: true }])).toEqual(['3rd and 7: pass complete for 19 (flag)']);
    expect(SPEEDS_BY_CONTEXT.film).toEqual([0.25, 0.5, 1, 2]);
    expect(SPEEDS_BY_CONTEXT.game).toEqual([1, 2]);
  });
});

describe('parameters', () => {
  it('parse as a ParamFile and the sourced tiers print PROVISIONAL', () => {
    expect(ParamFile.safeParse(PARAMS).success).toBe(true);
    expect(provisionalParams()).toEqual(['film.tier.bestShare', 'film.tier.averageShare']);
  });
});
