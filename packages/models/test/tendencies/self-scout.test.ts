// G8.1.2, G8.2.1, G8.3, G8.4, G8.5.1 and the play-record adapter.
import { describe, expect, it } from 'vitest';
import type { FieldGeometry, PlayRecord } from '@gm/schema';
import { DMATH, stream, seedFromNumber } from '@gm/engine-core';
import { buildBaseline, OFFENSE_CATEGORIES } from '../../src/predictability/index.ts';
import {
  tendencyTable, opponentWindow, exposedTendencies, structuralTells, sheetTells, tellId, habitFindChance, falseReportChance,
  weeklyHabitSearch, advanceFix, habitShows, opponentHasEdge, NEW_FIX, fixMinutesPerWeek, planBreakers, breakerDose,
  stressCallIsBreaker, breakerResults, reviewHolds, plantCounter, filmEntries, writeReport, reportsDue, reportCost,
  postseasonStudyGames, chartedPredictability, toCallRecord, accuracyWords, chartGame, hashOf,
  type ChartedPlay, type PlaybookEntry, type Habit,
} from '../../src/tendencies/index.ts';
import { play, split, defense } from './helpers.ts';

describe('G8.1.2 what the opponent probably knows', () => {
  const games = [1, 2, 3, 4, 5, 6].map((g) => ({ gameId: g, season: 2, gameOrder: g, similarScheme: g === 1 || g === 2 }));
  it('default window: three most recent games 1.0, two earlier similar-scheme games 0.7, last meeting 0.5', () => {
    const w = opponentWindow([...games, { gameId: 99, season: 1, gameOrder: 9, lastMeetingSameStaff: true }], 2);
    expect([...w.entries()].sort((a, b) => a[0] - b[0])).toEqual([[1, 0.7], [2, 0.7], [4, 1], [5, 1], [6, 1], [99, 0.5]]);
  });
  it('acceptance: a tendency shown only outside the window ranks below an equal one inside it, and the list changes with the window', () => {
    const rows = [...split(18, 2, { formation: 'inside', gameId: 5 }), ...split(18, 2, { formation: 'outside', gameId: 3 })];
    const cells = tendencyTable(rows, { cuts: ['formation'], measure: 'runPass' });
    const a = exposedTendencies(cells, rows, opponentWindow(games, 2), 0.8);
    expect(a.map((e) => e.cell.cuts.formation)).toEqual(['inside', 'outside']);
    expect(a[1]!.score).toBe(0);
    expect(a[0]!.score).toBeCloseTo(3 * 1 * 0.8, 12);
    const other = new Map([[3, 1]]);
    expect(exposedTendencies(cells, rows, other, 0.8).map((e) => e.cell.cuts.formation)).toEqual(['outside', 'inside']);
  });
  it('the top five are shown first', () => {
    const rows = 'abcdefg'.split('').flatMap((f) => split(18, 2, { formation: f, gameId: 6 }));
    const list = exposedTendencies(tendencyTable(rows, { cuts: ['formation'], measure: 'runPass' }), rows, opponentWindow(games, 2), 1);
    expect(list.filter((e) => e.top)).toHaveLength(5);
  });
});

describe('G8.2.1 predictability on charted plays', () => {
  const league = (n: number, seed: number, runFirst: boolean) => {
    const s = stream(seedFromNumber(seed), 'test.calls', []);
    return Array.from({ length: n }, (_, i) => {
      const down = 1 + s.int(0, 2);
      const runChance = runFirst && down === 1 ? 1 : [0, 0.5, 0.42, 0.25][down]!;
      const run = s.chance(runChance);
      return play({ gameId: 1 + Math.floor(i / 60), gameOrder: 1 + Math.floor(i / 60), index: i, down, distanceYd: down === 1 ? 10 : 1 + s.int(0, 11), yardsToGoalYd: 1 + s.int(0, 98), scoreDiff: s.int(-14, 14), quarter: 1 + s.int(0, 3), clockTenths: 1200 + s.int(0, 7800), playKind: run ? 'run' : 'dropback_pass', runDirection: run ? 'middle' : null });
    });
  };
  const opt = { withFormation: false, periodSeconds: 900, periods: 4 };
  const baseline = buildBaseline(league(20000, 1, false).map((p) => toCallRecord(p, 900, 4)!), OFFENSE_CATEGORIES);
  it('a caller who always runs on first down scores worse than one who mixes at league rates', () => {
    const mixed = chartedPredictability(league(1200, 2, false), baseline, opt, DMATH);
    const runFirst = chartedPredictability(league(1200, 2, true), baseline, opt, DMATH);
    expect(runFirst.overall.index).toBeGreaterThan(mixed.overall.index + 0.05);
    expect(mixed.byGame.length).toBe(20);
    const sum = runFirst.byGame.reduce((a, g) => a + g.index * g.calls, 0);
    expect(sum / runFirst.overall.calls).toBeCloseTo(runFirst.overall.index, 9);
    expect(accuracyWords(0.714)).toContain('71%');
  });
  it('time left follows the period length: a first-quarter snap has the second quarter still in its half', () => {
    const r = toCallRecord(play({ quarter: 1, clockTenths: 3000 }), 900, 4)!;
    expect(r.info.halfSecondsLeft).toBe(1200);
    expect(r.info.gameSecondsLeft).toBe(300 + 2700);
    expect(toCallRecord(play({ quarter: 4, clockTenths: 600 }), 900, 4)!.info.halfSecondsLeft).toBe(60);
    expect(toCallRecord(play({ playKind: 'trick' }), 900, 4)).toBeNull();
  });
});

describe('G8.3.1 structural tells', () => {
  it('acceptance: a planted formation used only for runs appears; a 50 to 50 formation does not', () => {
    const rows = [...split(10, 0, { formation: 'heavy' }), ...split(6, 6, { formation: 'spread' })];
    const t = structuralTells(rows, 'offense');
    const formations = t.filter((x) => x.feature === 'formation').map((x) => x.value);
    expect(formations).toEqual(['heavy']);
    expect(t.find((x) => x.feature === 'formation')!.givesAway).toBe('run');
  });
  it('needs 8 snaps with the feature', () => {
    expect(structuralTells(split(7, 0, { formation: 'heavy' }), 'offense').filter((x) => x.feature === 'formation')).toHaveLength(0);
  });
  it('finds defensive alignment tells against pressure', () => {
    const rows = Array.from({ length: 12 }, () => defense({ front: 'bear', rushers: 6 }));
    expect(structuralTells(rows, 'defense').some((x) => x.feature === 'front' && x.value === 'bear' && x.givesAway === 'pressure')).toBe(true);
  });
  it('a kept tell is marked and tracks whether the bait was used', () => {
    const rows = [...split(19, 1, { formation: 'heavy' })];
    const id = 'formation=heavy:runPass';
    const t = structuralTells(rows, 'offense', new Set([id])).find((x) => tellId(x) === id)!;
    expect(t.kept).toBe(true);
    expect(t.baitCalls).toBe(1);
  });
  it('scans the sheet before a game, with no history', () => {
    const sheet = [{ playId: 'a', formation: 'i_right', personnel: '21', kind: 'run' }, { playId: 'b', formation: 'i_right', personnel: '21', kind: 'draw' }, { playId: 'c', formation: 'gun', personnel: '11', kind: 'run' }, { playId: 'd', formation: 'gun', personnel: '11', kind: 'screen' }];
    expect(sheetTells(sheet)).toEqual([{ formation: 'i_right', kind: 'run', calls: 2, playIds: ['a', 'b'] }]);
  });
});

describe('G8.3.2 player tells', () => {
  it('find and false-report chances follow the leaf', () => {
    expect(habitFindChance(1, 1)).toBeCloseTo(0.1, 12);
    expect(habitFindChance(1.5, 10)).toBe(0.5);
    expect(falseReportChance(0.5)).toBeCloseTo(0.1, 12);
  });
  it('acceptance: a coach with skill factor 1.5 finds a planted habit sooner on average over 1,000 test seasons than one with 0.5', () => {
    const habits: Habit[] = [{ habitId: 'h1', playerId: 1, present: true }];
    const weeksToFind = (skill: number, seed: number) => {
      let total = 0;
      for (let season = 0; season < 1000; season++) {
        const rng = stream(seedFromNumber(seed), 'test.habits', [season]);
        let w = 1;
        while (w < 60 && !weeklyHabitSearch(habits, new Set(), skill, () => 1, rng).some((r) => r.habitId === 'h1')) w++;
        total += w;
      }
      return total / 1000;
    };
    expect(weeksToFind(1.5, 1)).toBeLessThan(weeksToFind(0.5, 1));
  });
  it('acceptance: a habit fixed for 3 weeks and kept off heavy fatigue does not return', () => {
    let s = NEW_FIX;
    for (let i = 0; i < 3; i++) s = advanceFix(s, fixMinutesPerWeek());
    expect(s.cleared).toBe(true);
    const rng = stream(seedFromNumber(2), 'test.relapse', []);
    for (let i = 0; i < 5000; i++) expect(habitShows(s, 0.5, rng)).toBe(false);
    // Under heavy fatigue inside the six weeks it can come back.
    let back = 0;
    for (let i = 0; i < 5000; i++) if (habitShows(s, 0.9, rng)) back++;
    expect(back / 5000).toBeGreaterThan(0.17);
    expect(back / 5000).toBeLessThan(0.23);
    let late = s;
    for (let i = 0; i < 6; i++) late = advanceFix(late, 0);
    expect(habitShows(late, 0.95, rng)).toBe(false);
  });
  it('a week short of the dose does not count; the edge needs 10 snaps of film', () => {
    expect(advanceFix(NEW_FIX, fixMinutesPerWeek() - 1).weeksFixed).toBe(0);
    expect(opponentHasEdge(9)).toBe(false);
    expect(opponentHasEdge(10)).toBe(true);
  });
});

describe('G8.4 breakers, results, holds and plants', () => {
  const book: PlaybookEntry[] = [
    { playId: 'iz', kind: 'run', runDirection: 'right', formation: 'trips_right', personnel: '11', motion: null, readiness: 0.9 },
    { playId: 'pa_boot', kind: 'play_action', runDirection: null, formation: 'trips_right', personnel: '11', motion: null, readiness: 0.6, links: ['iz'] },
    { playId: 'stick', kind: 'quick_pass', runDirection: null, formation: 'trips_right', personnel: '11', motion: 'jet', readiness: 0.95 },
    { playId: 'mesh', kind: 'dropback_pass', runDirection: null, formation: 'trips_right', personnel: '11', motion: null, readiness: 0.8 },
    { playId: 'iz_left', kind: 'run', runDirection: 'left', formation: 'trips_right', personnel: '11', motion: null, readiness: 0.7 },
    { playId: 'other', kind: 'dropback_pass', runDirection: null, formation: 'bunch', personnel: '11', motion: null, readiness: 1 },
    { playId: 'heavy_pa', kind: 'play_action', runDirection: null, formation: 'trips_right', personnel: '12', motion: null, readiness: 1 },
  ];
  it('acceptance: every suggested breaker shares the formation and personnel and differs in kind or direction', () => {
    const t = { formation: 'trips_right', personnel: '11', motion: null, leansTo: 'run', direction: 'right' as const, tendencyPlayIds: ['iz'] };
    const plan = planBreakers(t, book);
    expect(plan.breakers.map((b) => b.playId)).toEqual(['pa_boot', 'mesh', 'iz_left', 'stick']);
    for (const b of plan.breakers) {
      expect(b.formation).toBe('trips_right');
      expect(b.personnel).toBe('11');
      expect(b.kind !== 'run' || b.runDirection !== 'right').toBe(true);
    }
    expect(planBreakers(t, book, new Set(['pa_boot'])).breakers.map((b) => b.playId)).not.toContain('pa_boot');
  });
  it('edge case: with nothing in the book the planner offers the designer with the look loaded', () => {
    expect(planBreakers({ formation: 'empty', personnel: '10', leansTo: 'pass' }, book)).toEqual({ breakers: [], openDesigner: { formation: 'empty', personnel: '10' } });
  });
  it('dose: one breaker per 4 to 6 expected tendency calls; the defensive mirror', () => {
    expect(breakerDose(24)).toEqual({ low: 4, high: 6 });
    expect(breakerDose(3)).toEqual({ low: 0, high: 0 });
    expect(stressCallIsBreaker(0.62, 10, 0.6, 6)).toBe(true);
    expect(stressCallIsBreaker(0.62, 4, 0.6, 6)).toBe(false);
  });
  it('G8.4.2 acceptance: counts match the call log', () => {
    const rows = [...split(8, 0), ...split(0, 3)];
    const tRefs = new Set(rows.filter((p) => p.playKind === 'run').map((p) => p.ref));
    const bRefs = new Set(rows.filter((p) => p.playKind !== 'run').map((p) => p.ref));
    const r = breakerResults(rows, tRefs, bRefs, (ref) => (ref === [...bRefs][0] ? 'safety_rolled_down' : null));
    expect(r.tendency.calls).toBe(8);
    expect(r.breakers.calls).toBe(3);
    expect(r.breakers.yards).toBe(12);
    expect(r.lines.filter((l) => l.filmReaction !== null)).toHaveLength(1);
  });
  it('G8.4.3: holds warn above five per side, show on a sheet for another game, and cost a rep a week each', () => {
    const holds = Array.from({ length: 6 }, (_, i) => ({ playId: `h${i}`, side: 'offense' as const, target: i === 0 ? 'rival' : 'playoffs' }));
    const r = reviewHolds(holds, new Set(['h0', 'h1']), 'rival');
    expect(r.overLimit).toEqual(['offense']);
    expect(r.onSheet).toEqual(['h1']);
    expect(r.repsPerWeek).toBe(6);
  });
  it('G8.4.3 acceptance: a held call has zero charted entries until it is first called in a game', () => {
    const before = split(10, 0);
    expect(filmEntries(before, 'secret_reverse')).toBe(0);
    expect(filmEntries([...before, play({ concept: 'secret_reverse' })], 'secret_reverse')).toBe(1);
  });
  it('plant counter: support and band as an opponent with good charting would rate it', () => {
    expect(plantCounter({ formation: 'trips_right', personnel: '11', leansTo: 'run' }, split(18, 2))).toEqual({ support: 18, calls: 20, band: 'strong' });
    expect(plantCounter({ formation: 'trips_right', personnel: '11', leansTo: 'run' }, split(3, 0)).band).toBeNull();
  });
});

describe('G8.5.1 weekly and bye-week study', () => {
  it('cadence and costs follow the leaf defaults', () => {
    const at = (o: Partial<Parameters<typeof reportsDue>[0]>) => reportsDue({ gamesPlayed: 1, byeWeek: false, beforePostseason: false, offseason: false, midSeason: false, ...o });
    expect(at({})).toEqual(['quick']);
    expect(at({ gamesPlayed: 3 })).toEqual(['quick', 'study']);
    expect(at({ byeWeek: true })).toEqual(['quick', 'study']);
    expect(at({ offseason: true })).toEqual(['deep']);
    expect(reportCost('quick')).toEqual({ kind: 'quick', staffHours: 1, meetingMinutes: 20, games: 3 });
    expect(reportCost('study').staffHours).toBe(6);
    expect(reportCost('deep').staffHours).toBe(20);
    expect(postseasonStudyGames()).toBe(5);
  });
  it('acceptance: a high-skill author lists the planted strongest tendency first in at least 90% of test seasons; a low-skill author in under half', () => {
    const rows = [
      ...split(19, 1, { formation: 'planted', gameId: 3 }),
      ...['w1', 'w2', 'w3'].flatMap((f) => split(7, 3, { formation: f, gameId: 3 })),
      ...['l1', 'l2', 'l3', 'l4'].flatMap((f) => split(13, 7, { formation: f, gameId: 3 })),
    ];
    const cells = tendencyTable(rows, { cuts: ['formation'], measure: 'runPass' });
    const exposed = exposedTendencies(cells, rows, new Map([[1, 1], [2, 1], [3, 1]]), 1);
    const firstRate = (skill: number) => {
      let hits = 0;
      for (let season = 0; season < 1000; season++) {
        const r = writeReport(exposed, { skill }, 1, 'quick', stream(seedFromNumber(5), 'test.report', [season]));
        if (r[0]!.tendency.cell.cuts.formation === 'planted') hits++;
      }
      return hits / 1000;
    };
    expect(firstRate(1)).toBeGreaterThanOrEqual(0.9);
    expect(firstRate(0)).toBeLessThan(0.5);
  });
  it('a report written in less than its hours is noisier', () => {
    const rows = [...split(19, 1, { formation: 'a', gameId: 3 }), ...split(7, 3, { formation: 'b', gameId: 3 })];
    const exposed = exposedTendencies(tendencyTable(rows, { cuts: ['formation'], measure: 'runPass' }), rows, new Map([[1, 1], [2, 1], [3, 1]]), 1);
    const spread = (hours: number) => {
      let s = 0;
      for (let i = 0; i < 400; i++) {
        const r = writeReport(exposed, { skill: 0.7 }, hours, 'study', stream(seedFromNumber(6), 'test.report', [i]));
        for (const x of r) s += (x.perceived - x.tendency.score) ** 2;
      }
      return s;
    };
    expect(spread(1)).toBeGreaterThan(spread(6));
  });
});

describe('play records to charted plays', () => {
  const geometry: FieldGeometry = { lengthYd: 120, widthYd: 160 / 3, goalLineWestX: 10, goalLineEastX: 110, hashSouthY: 23.58, hashNorthY: 29.75, centreY: 80 / 3, uprightSouthY: 0, uprightNorthY: 0, crossbarHeightYd: 0 };
  it('hash is read in the offense\'s frame', () => {
    expect(hashOf(29.75, 1, geometry)).toBe('left');
    expect(hashOf(29.75, -1, geometry)).toBe('right');
    expect(hashOf(23.58, 1, geometry)).toBe('right');
    expect(hashOf(26.5, 1, geometry)).toBe('middle');
  });
  it('charts one team\'s scrimmage plays with situation, look, call, result and after events', () => {
    const offenseCall = (kind: string, extra: Record<string, unknown> = {}) => ({ unit: 'offense', playContentId: 'p1', contentHash: null, kind, personnelCode: '11', formationId: 'gun_trips', strength: 'right', motionId: null, protectionId: 'slide', tags: [], runDirection: kind === 'run' ? 'left' : null, shotgun: true, tempo: 'huddle', players: [], ...extra });
    const defenseCall = { unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: 'over', coverageId: null, pressureId: null, coverageFamily: 'cover3', rushers: 4, boxCount: 7, players: [] };
    const rec = (index: number, offense: 0 | 1, kind: string, result: string, yards: number, extra: Record<string, unknown> = {}) => ({
      gameId: 7, index,
      situation: { gameId: 7, playNumber: index, driveNumber: 1, playKind: 'scrimmage', period: 1, overtime: false, clockTenths: 8000, clockStatus: 'running', playClockAtSnapTenths: 100, offense, attackDir: offense === 0 ? 1 : -1, down: 1, distanceYd: 10, goalToGo: false, ballX: 35, ballY: 29.75, lineToGainX: 45, score: [7, 3], timeoutsLeft: [3, 3], insideTwoMinute: false, untimedDown: false },
      calls: { snapping: offenseCall(kind), opposing: defenseCall },
      final: { resultType: result, noPlay: false, snappingSide: offense, possessionAfter: offense, changeOfPossession: false, yardsGained: yards, enforcement: null },
      seriesAfter: { firstDownAwarded: false },
      decisions: [],
      ...extra,
    }) as unknown as PlayRecord;
    const records = [rec(1, 0, 'run', 'run', 3), rec(2, 0, 'dropback_pass', 'sack', -7), rec(3, 0, 'kneel', 'kneel', -1), rec(4, 1, 'run', 'run', 5)];
    const rows = chartGame(records, 0, { teamIds: [10, 20], gameOrder: 4, season: 2, geometry, success: { firstDownShare: 0.4, secondDownShare: 0.6, lateDownShare: 1 } });
    expect(rows.map((r) => r.side)).toEqual(['offense', 'offense', 'offense', 'defense']);
    expect(rows[0]).toMatchObject({ ref: '7:1', teamId: 10, opponentId: 20, yardsToGoalYd: 75, hash: 'left', scoreDiff: 4, afterEvent: 'first_play', personnel: '11', formation: 'gun_trips', playKind: 'run', runDirection: 'left', success: false, source: 'own' });
    expect(rows[1]!.afterEvent).toBe('none');
    expect(rows[2]).toMatchObject({ afterEvent: 'sack', forced: true, success: null });
    expect(rows[3]).toMatchObject({ side: 'defense', yardsToGoalYd: 25, scoreDiff: 4, front: 'over', coverageFamily: 'cover3', success: true });
    expect(tendencyTable(rows, { cuts: ['formation'], measure: 'runPass' })[0]!.calls).toBe(2);
  });
});
