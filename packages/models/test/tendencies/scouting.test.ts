// H2.1.1, H2.1.2, H2.1.3, H2.2.2, H2.2.3: breakdown scope, tagging accuracy, cut-ups, caller cards and
// unscouted looks.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import {
  breakdownJobs, finishedOnly, relevanceWeights, selfScoutWindow, chartOpponent, correctTag, tagAccuracy, PERFECT_TAGGER,
  INFERRED_TAGS, STANDARD_CUTUPS, cutup, watchSeconds, callerCard, unscoutedLooks, recheckLine, tendencyTable, downDistance,
  type ChartedPlay,
} from '../../src/tendencies/index.ts';
import { play, defense } from './helpers.ts';

describe('H2.1.1 breakdown scope', () => {
  const staff = [{ staffId: 1, speed: 1, hoursAvailable: 30 }, { staffId: 2, speed: 1.3, hoursAvailable: 30 }];
  it('six staff hours per game per side, divided by speed', () => {
    const { jobs } = breakdownJobs([101], ['offense'], staff, 40);
    expect(jobs[0]!.staffId).toBe(2);
    expect(jobs[0]!.hours).toBeCloseTo(6 / 1.3, 12);
  });
  it('acceptance 1: more games than the hours allow shows a late finish', () => {
    const few = breakdownJobs([1, 2, 3, 4], ['offense', 'defense'], staff, 30);
    expect(few.lateHours).toBe(0);
    const many = breakdownJobs(Array.from({ length: 12 }, (_, i) => i + 1), ['offense', 'defense'], staff, 30);
    expect(many.lateHours).toBeGreaterThan(0);
    expect(many.jobs.some((j) => !j.finished)).toBe(true);
  });
  it('acceptance 2: no tendency number is computed from a game that is not in a finished job', () => {
    const plays = [1, 2, 3].flatMap((g) => Array.from({ length: 5 }, () => play({ gameId: g })));
    const jobs = [{ gameId: 1, side: 'offense', staffId: 1, hours: 6, doneAtHours: 6, finished: true }, { gameId: 2, side: 'offense', staffId: 1, hours: 6, doneAtHours: 40, finished: false }] as const;
    const usable = finishedOnly(plays, jobs);
    expect(new Set(usable.map((p) => p.gameId))).toEqual(new Set([1]));
    expect(tendencyTable(usable, { cuts: ['formation'], measure: 'runPass' })[0]!.calls).toBe(5);
  });
  it('rule 4 weights and the caller-change edge case', () => {
    const rows = [
      ...[1, 2, 3, 4, 5, 6].map((g) => play({ gameId: g, gameOrder: g, season: 2 })),
      play({ gameId: 90, gameOrder: 1, season: 1 }),
      play({ gameId: 80, gameOrder: 1, season: 2, teamId: 99 }),
      play({ gameId: 70, gameOrder: 1, season: 0 }),
    ];
    const w = new Map(relevanceWeights(rows, { teamId: 10, season: 2 }).map((p) => [p.gameId, p.weight]));
    expect([w.get(1), w.get(2), w.get(3), w.get(6), w.get(90), w.get(80), w.has(70)]).toEqual([0.7, 0.7, 1, 1, 0.4, 0.5, false]);
    const c = new Map(relevanceWeights(rows, { teamId: 10, season: 2, callerChangeAtOrder: 5 }).map((p) => [p.gameId, p.weight]));
    expect([c.get(4), c.get(5), c.get(90)]).toEqual([0.3, 1, 0.3]);
  });
  it('G8.1.1 default self-scout window is the last three games; season and career one step away', () => {
    const rows = [1, 2, 3, 4, 5].map((g) => play({ gameId: g, gameOrder: g }));
    expect(selfScoutWindow(rows).map((p) => p.gameId)).toEqual([3, 4, 5]);
    expect(selfScoutWindow(rows, { kind: 'career' })).toHaveLength(5);
    expect(selfScoutWindow(rows, { kind: 'season', season: 2 })).toHaveLength(0);
  });
});

describe('H2.1.2 play tagging and its accuracy', () => {
  const vocab = { coverageFamily: ['cover0', 'cover1', 'cover2', 'cover3', 'cover4', 'cover6'], protection: ['slide', 'half_slide', 'man'], concept: ['zone', 'power', 'counter'], pressureDesign: ['fire_zone', 'zero'] } as const;
  const rows = (n: number): ChartedPlay[] => Array.from({ length: n }, (_, i) => defense({ ref: `x${i}`, coverageFamily: 'cover3', protection: 'slide', concept: 'zone', rushers: 5, pressureDesign: 'fire_zone' }));

  it('acceptance 1: observable tags equal the true record in every case', () => {
    const own = rows(500);
    const charted = chartOpponent(own, { tagger: { skill: 0 }, disguise: () => 1, vocabulary: (t) => vocab[t] }, stream(seedFromNumber(3), 'test.chart', []));
    const observable = (p: ChartedPlay) => { const o: Record<string, unknown> = { ...p }; for (const t of INFERRED_TAGS) delete o[t]; delete o.source; return o; };
    charted.forEach((c, i) => expect(observable(c)).toEqual(observable(own[i]!)));
    expect(charted.every((c) => c.source === 'charted')).toBe(true);
  });
  it('acceptance 2: over 10,000 plays the inferred-tag accuracy matches the configured probability within 1 point', () => {
    for (const [skill, disguise] of [[0.5, 0.2], [0, 1], [1, 0.5]] as const) {
      const charted = chartOpponent(rows(10000), { tagger: { skill }, disguise: () => disguise, vocabulary: (t) => vocab[t] }, stream(seedFromNumber(40 + Math.round(skill * 10)), 'test.chart', []));
      const p = tagAccuracy(skill, disguise);
      expect(p).toBeCloseTo(0.8 + 0.15 * skill - 0.15 * disguise, 12);
      for (const tag of INFERRED_TAGS) {
        const right = charted.filter((c) => c[tag] === rows(1)[0]![tag]).length / charted.length;
        expect(Math.abs(right - p)).toBeLessThan(0.01);
      }
    }
  });
  it('acceptance 3: a perfect-skill tagger with zero disguise produces fully correct tags', () => {
    const own = rows(2000);
    const charted = chartOpponent(own, { tagger: PERFECT_TAGGER, disguise: () => 0, vocabulary: (t) => vocab[t] }, stream(seedFromNumber(5), 'test.chart', []));
    expect(charted.map((c) => c.coverageFamily)).toEqual(own.map((c) => c.coverageFamily));
  });
  it('a wrong tag comes from the confusable set (quarters mistaken for Cover 2)', () => {
    const own = Array.from({ length: 400 }, () => defense({ coverageFamily: 'cover4' }));
    const charted = chartOpponent(own, { tagger: { skill: 0 }, disguise: () => 1, confusable: (t, v) => (t === 'coverageFamily' && v === 'cover4' ? ['cover2'] : []) }, stream(seedFromNumber(6), 'test.chart', []));
    expect(new Set(charted.map((c) => c.coverageFamily))).toEqual(new Set(['cover4', 'cover2']));
  });
  it('the true call name is never exposed: concepts are charted as the charter would write them', () => {
    const own = [play({ concept: 'play_8812_inside_zone_weak' })];
    const charted = chartOpponent(own, { tagger: PERFECT_TAGGER, disguise: () => 0, chartValue: (t, v) => (t === 'concept' ? 'inside_zone' : v) }, stream(seedFromNumber(7), 'test.chart', []));
    expect(charted[0]!.concept).toBe('inside_zone');
  });
  it('a cancelled play is tagged for formation and personnel only', () => {
    const charted = chartOpponent([defense({ lookOnly: true })], { tagger: PERFECT_TAGGER, disguise: () => 0 }, stream(seedFromNumber(8), 'test.chart', []));
    expect(charted[0]!.coverageFamily).toBeNull();
    expect(charted[0]!.formation).toBe('trips_right');
  });
  it('rule 6: a user correction takes his value, right or wrong, with no re-roll', () => {
    const p = defense({ coverageFamily: 'cover2' });
    expect(correctTag(p, 'coverageFamily', 'cover6').coverageFamily).toBe('cover6');
    expect(recheckLine(6, 40, 'coverage')).toBe('his coverage calls were changed on 6 of 40 rechecked plays');
  });
  it('replays: the same stream gives the same tags', () => {
    const run = () => chartOpponent(rows(300), { tagger: { skill: 0.3 }, disguise: () => 0.4, vocabulary: (t) => vocab[t] }, stream(seedFromNumber(9), 'test.chart', [])).map((c) => c.coverageFamily);
    expect(run()).toEqual(run());
  });
});

describe('H2.1.3 cut-ups', () => {
  it('acceptance: every standard cut-up count equals the records matching its filter; empty cut-ups show zero', () => {
    const s = stream(seedFromNumber(11), 'test.cutups', []);
    const rows: ChartedPlay[] = Array.from({ length: 300 }, () => {
      const down = 1 + s.int(0, 3);
      return s.chance(0.5)
        ? play({ down, distanceYd: down === 1 ? 10 : 1 + s.int(0, 12), yardsToGoalYd: 1 + s.int(0, 98) })
        : defense({ down, distanceYd: 1 + s.int(0, 12), rushers: 3 + s.int(0, 4) });
    });
    for (const f of STANDARD_CUTUPS) {
      const c = cutup(rows, f);
      const direct = rows.filter((p) => p.side === f.side && Object.entries(f.where).every(([k, v]) => {
        const val = k === 'downDistance' ? downDistance(p) : k === 'down' ? String(p.down) : k === 'fieldZone' ? (p.yardsToGoalYd <= 5 ? 'goal_line' : p.yardsToGoalYd <= 20 ? 'red_zone' : p.yardsToGoalYd >= 90 ? 'backed_up' : 'open_field') : k === 'timeState' ? 'normal' : '';
        return v.includes(val);
      }) && (f.test !== 'pressure' || (p.rushers ?? 0) >= 5));
      expect(c.count, f.id).toBe(direct.length);
    }
    expect(cutup([], STANDARD_CUTUPS[0]!).count).toBe(0);
  });
  it('a custom cut-up is a saved query that reopens later, and watching costs 20 s a play', () => {
    const saved = JSON.parse(JSON.stringify({ id: 'mine', side: 'offense', where: { personnel: ['12'], hash: ['left'] } }));
    const rows = [play({ personnel: '12', hash: 'left' }), play({ personnel: '12', hash: 'right' }), play({ personnel: '11', hash: 'left' })];
    expect(cutup(rows, saved).count).toBe(1);
    expect(watchSeconds(30)).toBe(600);
  });
});

describe('H2.2.2 the play caller\'s history', () => {
  it('acceptance: a coach with prior-team games shows those games in his sample', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => play({ callerId: 5, teamId: 10, gameId: 1 + (i % 2), season: 3, playKind: i < 3 ? 'play_action' : 'dropback_pass', runDirection: null })),
      ...Array.from({ length: 10 }, (_, i) => play({ callerId: 5, teamId: 44, gameId: 50 + (i % 3), season: 2, playKind: i < 8 ? 'play_action' : 'dropback_pass', runDirection: null })),
    ];
    const card = callerCard(rows, 5, 10, 3);
    expect(card.games).toBe(5);
    expect(card.priorTeamGames).toBe(3);
    const pa = card.career.find((l) => l.measure === 'play_action')!;
    expect(pa.of).toBe(20);
    expect(pa.rate).toBeCloseTo((3 + 0.5 * 8) / (10 + 0.5 * 10), 12);
    expect(card.season.find((l) => l.measure === 'play_action')!.rate).toBeCloseTo(0.3, 12);
  });
  it('a first-time play caller has no history', () => {
    expect(callerCard([], 9, 10, 1).noHistory).toBe(true);
  });
});

describe('H2.2.3 unscouted looks', () => {
  it('acceptance: a concept not run this season but run last season appears on the list', () => {
    const last = [play({ concept: 'mesh' }), play({ concept: 'mesh' }), play({ concept: 'smash' }), play({ concept: 'flood' })];
    const now = [play({ concept: 'smash' })];
    const list = unscoutedLooks(now, last, ['y_cross']);
    expect(list.map((l) => l.concept)).toEqual(['mesh', 'flood', 'y_cross']);
    expect(list[0]!.priorRate).toBeCloseTo(0.5, 12);
    expect(list[2]!.from).toBe('system_family');
  });
});
