import { describe, expect, it, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  historyFacts, factsForOthers, systemsPanel, newToYou, dutiesHeld, coachTerm, userTermConstant, checkShare, TERM_CASES,
  dueForScoring, windowCloses, buildRecord, toCoachingFields, userRecordProblems, labelSourceProblems, selfAssessmentPairs,
  threeViews, RECORD_EVENT, param,
  type Stint, type PendingRecommendation,
} from '../../src/record/index.ts';
import type { Note } from '../../src/coach/notebook.ts';
import { COACH, constantSeat, decision, ev, everyFamily, resetIds, seat, work } from './fixture.ts';

beforeEach(() => resetIds());

const qc = (first: number, last: number | null, teamId = 3, bossId: number | null = 100): Stint =>
  ({ teamId, firstSeason: first, lastSeason: last, rung: 3, roleKey: 'quality_control_offense', side: 'offense', bossId, levelKey: 'college_fbs' });

describe('history facts (E9.1.2 rule 3, E9.4.2, S8.2.1)', () => {
  it('S8.2.1 acceptance 1: three seasons on a staff give worked_in_system 3 and worked_under', () => {
    const f = historyFacts({ personId: COACH, currentSeason: 2032, stints: [qc(2030, 2032)], teamSystems: () => ['core:wide_zone'], games: () => 12 });
    expect(f.find((x) => x.type === 'worked_in_system')).toMatchObject({ seasons: 3, subjectKey: 'core:wide_zone', roleKey: 'quality_control_offense' });
    expect(f.find((x) => x.type === 'worked_under')).toMatchObject({ seasons: 3, refId: 100 });
    expect(f.find((x) => x.type === 'coached_at_level')).toMatchObject({ seasons: 3, games: 36, subjectKey: 'college_fbs' });
  });
  it('a system family is credited only for seasons the team ran it (E9.4.2 rule 3)', () => {
    const f = historyFacts({ personId: COACH, currentSeason: 2033, stints: [qc(2030, 2033)], teamSystems: (_t, y) => (y <= 2031 ? ['core:air_raid'] : ['core:west_coast']) });
    expect(systemsPanel(f)).toEqual([
      { family: 'core:air_raid', seasons: 2, roles: [{ roleKey: 'quality_control_offense', seasons: 2 }] },
      { family: 'core:west_coast', seasons: 2, roles: [{ roleKey: 'quality_control_offense', seasons: 2 }] },
    ]);
  });
  it('an ongoing stint counts to the current season; his own head-coach seasons have no boss', () => {
    const head: Stint = { ...qc(2035, null, 4, null), rung: 8, roleKey: 'head_coach', side: 'whole_team' };
    const f = historyFacts({ personId: COACH, currentSeason: 2036, stints: [head], teamSystems: () => [] });
    expect(f.filter((x) => x.type === 'worked_under')).toEqual([]);
    expect(f.find((x) => x.type === 'coached_at_level')!.seasons).toBe(2);
  });
  it('studied_film_of is written only past the hour threshold in a season (E9.3.4)', () => {
    const film = (day: number, hours: number) => ev(RECORD_EVENT.fact, 2030, day, { factType: 'studied_film_of', refId: 9, systemFamily: 'core:pistol', levelKey: '', hours });
    const below = historyFacts({ personId: COACH, currentSeason: 2030, stints: [], teamSystems: () => [], events: [film(1, 4), film(2, 5)] });
    expect(below.filter((x) => x.type === 'studied_film_of')).toEqual([]);
    const rows = [film(1, 4), film(2, 5), film(3, param('studiedFilmHours') - 9)];
    const above = historyFacts({ personId: COACH, currentSeason: 2030, stints: [], teamSystems: () => [], events: rows });
    expect(above.find((x) => x.type === 'studied_film_of')).toMatchObject({ subjectKey: 'core:pistol', sourceEventIds: rows.map((r) => r.id) });
  });
  it('coaching school units are the user\'s own and are hidden from other readers (E9.3.5 rule 1)', () => {
    const unit = ev(RECORD_EVENT.fact, 2030, 1, { factType: 'completed_school_unit', refId: 1, systemFamily: '', levelKey: '', hours: 2 });
    const clinic = ev(RECORD_EVENT.fact, 2030, 2, { factType: 'attended_clinic', refId: 2, systemFamily: '', levelKey: '', hours: 8 });
    const f = historyFacts({ personId: COACH, currentSeason: 2030, stints: [], teamSystems: () => [], events: [unit, clinic], playing: [{ levelKey: 'college_fcs', positionKey: 'wr', firstSeason: 2020, seasons: 4 }] });
    expect(f.map((x) => x.type)).toEqual(['played', 'attended_clinic', 'completed_school_unit']);
    expect(factsForOthers(f).map((x) => x.type)).toEqual(['played', 'attended_clinic']);
  });
});

describe('no-skill validator (E9.1.2 rule 2 and acceptance 1, S8.1.1 acceptance 2)', () => {
  it('the record written into the contract shape passes', () => {
    const log = [...everyFamily(2030), ...everyFamily(2031)];
    const r = buildRecord(log, COACH, constantSeat(seat(8)));
    const facts = historyFacts({ personId: COACH, currentSeason: 2031, stints: [qc(2028, 2031)], teamSystems: () => ['core:wide_zone'], games: () => 12 });
    const fields = toCoachingFields(r, facts);
    expect(userRecordProblems(fields)).toEqual([]);
    expect(userRecordProblems(r)).toEqual([]);
    expect(userRecordProblems(facts)).toEqual([]);
    expect(fields.systemFamilies).toEqual({ 'core:wide_zone': 4 });
  });
  it('rejects ability fields, stored aggregates and a hidden block', () => {
    const bad = { skills: { teaching: 70 }, playCallingRating: 3, level: 4, competency: 'x', experience: 10, points: 2, fluency: 0.7, matchShare: 0.72, hidden: { aggression: 0.5 } };
    const msgs = userRecordProblems(bad).map((p) => p.path);
    for (const k of ['skills', 'playCallingRating', 'level', 'competency', 'experience', 'points', 'fluency', 'matchShare', 'hidden']) {
      expect(msgs.some((m) => m === `$.${k}` || m.startsWith(`$.${k}.`))).toBe(true);
    }
  });
  it('a full season changes nothing on the record but references, counts and dates', () => {
    const before = toCoachingFields(buildRecord([], COACH, constantSeat(seat(8))), []);
    const log = everyFamily(2030);
    const after = toCoachingFields(buildRecord(log, COACH, constantSeat(seat(8))), []);
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(userRecordProblems(after)).toEqual([]);
  });
  it('E9.1.1 acceptance: a coach label reading a type outside the six families fails', () => {
    const ok = { id: 'aggressive_fourth', appliesTo: ['coach'], positive: { types: [RECORD_EVENT.decision] }, negative: { types: [RECORD_EVENT.decision] } };
    const bad = { id: 'charismatic', appliesTo: ['coach'], positive: { types: ['press_conference_held'] }, negative: { types: [] } };
    const player = { id: 'hands', appliesTo: ['player'], positive: { types: ['catch'] }, negative: { types: [] } };
    expect(labelSourceProblems([ok, player])).toEqual([]);
    expect(labelSourceProblems([bad])).toHaveLength(1);
  });
});

describe('S8.3.1 gaps', () => {
  it('acceptance 1: the list is the seat\'s duty families absent from his history, in S3.1.1 order', () => {
    const held = dutiesHeld([{ duties: ['film_tagging', 'charting'] }, { duties: ['tendency_reports', 'game_management_charts'] }]);
    expect(newToYou(['play_calling', 'staff_management', 'film_tagging', 'side_game_plan'], held)).toEqual(['side_game_plan', 'play_calling', 'staff_management']);
  });
  it('a paper history leaves its duties off the list (edge case)', () => {
    expect(newToYou(['play_calling', 'recruiting'], new Set(), ['recruiting'])).toEqual(['play_calling']);
  });
});

describe('E9.1.3 coach term', () => {
  const scale = { min: 0, max: 100 };
  it('case 3 is one constant at the middle of the AI scale, for every user and career', () => {
    expect(userTermConstant(scale)).toBe(50);
    expect(coachTerm({ by: 'user', case: 3 }, { min: 20, max: 80 })).toBe(50);
  });
  it('case 2 maps the share of checks satisfied onto the AI scale; no checks falls to case 3', () => {
    expect(coachTerm({ by: 'user', case: 2, checks: [true, true, false, true] }, scale)).toBe(75);
    expect(checkShare([])).toBeNull();
    expect(coachTerm({ by: 'user', case: 2, checks: [] }, scale)).toBe(50);
  });
  it('case 1 passes his own product through; AI and delegates read the parameter', () => {
    expect(coachTerm({ by: 'user', case: 1, produced: 0.83 }, scale)).toBe(0.83);
    expect(coachTerm({ by: 'ai', parameter: 140 }, scale)).toBe(100);
    expect(coachTerm({ by: 'delegate', parameter: 61 }, scale)).toBe(61);
  });
  it('acceptance 2: the same task in a first-year and a twentieth-year career gives the same term', () => {
    const task = { by: 'user', case: 2, checks: [true, false, true] } as const;
    const firstYear = coachTerm(task, scale);
    // The twentieth-year coach has a deep record; the term cannot read it (no such input exists).
    buildRecord([...everyFamily(2030), ...everyFamily(2049)], COACH, constantSeat(seat(9)));
    expect(coachTerm(task, scale)).toBe(firstYear);
  });
  it('every listed calling leaf names exactly one case (acceptance 3)', () => {
    for (const r of TERM_CASES) expect([1, 2, 3]).toContain(r.userCase);
    expect(new Set(TERM_CASES.map((r) => r.leaf)).size).toBe(TERM_CASES.length);
  });
  it('acceptance 1: no source file reads a stored ability of the coach', () => {
    const root = join(__dirname, '../../..');
    const hits: string[] = [];
    const walk = (d: string): void => {
      for (const n of readdirSync(d)) {
        if (n === 'node_modules' || n === 'test') continue;
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && /coaching\??\.(skills|teachingRatings|competenc\w*|fluency)\b/.test(readFileSync(p, 'utf8'))) hits.push(p);
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});

describe('E9.4.5 scoring windows', () => {
  const rec = (eventId: number, kind: PendingRecommendation['kind'], day: number, firstSeason: number | null = null): PendingRecommendation =>
    ({ eventId, kind, madeOn: { seasonYear: 2030, dayIndex: day }, seasonEnd: { seasonYear: 2030, dayIndex: 150 }, firstSeason });
  it('closes 4 weeks after or at season end, whichever first, and scores each once', () => {
    const pending = [rec(1, 'recommendation', 10), rec(2, 'grade', 140)];
    expect(windowCloses(pending[0]!)).toEqual({ seasonYear: 2030, dayIndex: 38 });
    expect(windowCloses(pending[1]!)).toEqual({ seasonYear: 2030, dayIndex: 150 });
    expect(dueForScoring(pending, { seasonYear: 2030, dayIndex: 37 }, new Set())).toEqual([]);
    expect(dueForScoring(pending, { seasonYear: 2030, dayIndex: 38 }, new Set())).toEqual([1]);
    expect(dueForScoring(pending, { seasonYear: 2030, dayIndex: 200 }, new Set([1]))).toEqual([2]);
  });
  it('draft and recruit grades close after the player\'s second season, never if he never joined', () => {
    expect(dueForScoring([rec(3, 'prospect', 100, 2031)], { seasonYear: 2032, dayIndex: 300 }, new Set())).toEqual([]);
    expect(dueForScoring([rec(3, 'prospect', 100, 2031)], { seasonYear: 2033, dayIndex: 0 }, new Set())).toEqual([3]);
    expect(dueForScoring([rec(4, 'recruit', 100, null)], { seasonYear: 2040, dayIndex: 0 }, new Set())).toEqual([]);
  });
});

describe('E9.2.2 self view', () => {
  const note = (id: number, season: number, measure: string | null, kind: Note['kind'] = 'self'): Note => ({
    id, text: `note ${id}`, created: { world: { seasonYear: season, dayIndex: 300 } as never, real: null }, edited: null, subjects: [], tags: [], kind, pinned: false,
    season, authorJob: { jobCatalogueId: 'hc', teamId: 3 }, subjectMeasure: measure, attachment: null, inheritedFrom: null,
  });
  it('puts last season\'s self-assessment beside the record for the same subject, no verdict', () => {
    const log = [decision(2030, 1, 'fourth_down', true), decision(2030, 2, 'fourth_down', false), work(2030, 3, 10, 7)];
    const r = buildRecord(log, COACH, constantSeat(seat(8)));
    const pairs = selfAssessmentPairs([note(1, 2030, 'decisions:fourth_down'), note(2, 2030, 'work_products'), note(3, 2029, 'decisions'), note(4, 2030, 'charisma'), note(5, 2030, 'decisions', 'idea')], r, log, 2031);
    expect(pairs.map((p) => p.noteId)).toEqual([1, 2]);
    expect(pairs[0]!.record).toMatchObject({ key: 'fourth_down', events: 2, matched: 1 });
    expect(pairs[1]!.record).toMatchObject({ family: 'work_products', checked: 10, matched: 7 });
    expect(Object.keys(pairs[0]!)).not.toContain('verdict');
  });
  it('three views can differ and each traces to its observer\'s rows', () => {
    const log = [decision(2030, 1, 'fourth_down', true), { ...decision(2030, 2, 'timeout', true), witnesses: { kind: 'public' as const } }];
    const r = buildRecord(log, COACH, constantSeat(seat(8)));
    const v = threeViews(r, log, { fromSeason: 2030, toSeason: 2030 }, { colleaguesSaw: (e) => e.id === 1 });
    expect(v.full[0]!.eventIds).toEqual([1, 2]);
    expect(v.colleagues[0]!.eventIds).toEqual([1]);
    expect(v.public[0]!.eventIds).toEqual([2]);
  });
});
