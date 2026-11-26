import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { starter } from '@gm/football-content';
import { decisions } from '@gm/models';
import {
  CURRICULUM, GLOSSARY_SNAPSHOT, PATTERN_LESSONS, DUTY_LESSONS, PARAMS, RULE_KEYS, askWhy, callDeadline, clipTruth, courseState, curriculumMap, drawAttempt,
  dutyMapProblems, dutyOffers, gradingPattern, groupByCourse, improvement, isLate, kneelOut, lessonClip, lessonState, nextMix, packProblems, patternMapProblems,
  placementKnown, scoreAnswer, scoreAttempt, scoreClip, scoreLook, summarizeCallSession, teachingRulesFrom, usableProblems, validateCurriculum, workOnCard,
  SchoolFilmError, type AttemptResult, type LessonRecord, type PatternLike, type ScenarioPack, type SolvedSituation, type TeachingRules, type AiCallRecord,
} from '../../src/teaching/index.ts';
import { HOME, SEED, makeSource } from '../read-models/film/fixtures.ts';

const PRO: TeachingRules = { playClockS: 40, playClockAfterStoppageS: 25, twoMinuteStop: true, twoMinuteMarkS: 120, timeoutsPerHalf: 3, radioAllowed: true, radioCutoffS: 15 };

const CONTENT = new Set<string>([...starter.FORMATIONS.map((f) => f.id), ...starter.PLAYS.map((p) => p.id), ...starter.DEFENSE.map((d) => d.id)]);
const TERMS = new Set(GLOSSARY_SNAPSHOT.map((g) => g.id));
const BIBLE_DIR = '/mnt/project-files/bible';
const GLOSSARY_SOURCE = '/mnt/project-files/research/glossary/final/glossary-terms.jsonl';
const leafPattern = /^[A-T]\d{1,2}(\.\d+){0,2}$/;
// Leaf and area ids written in the bible (headings "## F4" / "### F4.1.1" and file names), when the project folder is reachable.
const bibleIds: Set<string> | null = existsSync(BIBLE_DIR) ? (() => {
  const ids = new Set<string>();
  for (const d of readdirSync(BIBLE_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of readdirSync(join(BIBLE_DIR, d.name))) {
      const area = /^([A-T]\d{1,2})-/.exec(f);
      if (area) ids.add(area[1]!);
      for (const m of readFileSync(join(BIBLE_DIR, d.name, f), 'utf8').matchAll(/^#{2,3} ([A-T]\d{1,2}(?:\.\d+){1,2})\b/gm)) ids.add(m[1]!);
    }
  }
  return ids;
})() : null;
const bibleOk = (id: string) => leafPattern.test(id) && (bibleIds === null || bibleIds.has(id));

describe('curriculum (N5.1.1)', () => {
  it('validates: terms in the glossary, content and bible ids resolve, fifteen courses in order', () => {
    expect(validateCurriculum(CURRICULUM, { term: (t) => TERMS.has(t), content: (c) => CONTENT.has(c), bible: bibleOk })).toEqual([]);
    expect(CURRICULUM.courses.map((c) => c.order)).toEqual([...Array(15).keys()].map((i) => i + 1));
  });
  it('reports a missing term, content id and bible leaf', () => {
    const bad = { ...CURRICULUM, lessons: [{ ...CURRICULUM.lessons[0]!, terms: ['term.nope'], content: ['nope'], bible: ['Z9'] }, ...CURRICULUM.lessons.slice(1)] };
    const p = validateCurriculum(bad, { term: (t) => TERMS.has(t), content: (c) => CONTENT.has(c), bible: bibleOk });
    expect(p.some((x) => x.includes('term.nope'))).toBe(true);
    expect(p.some((x) => x.includes('content nope'))).toBe(true);
    expect(p.some((x) => x.includes('bible Z9'))).toBe(true);
  });
  it('glossary snapshot matches the sourced A4.5 rows when the research file is reachable', () => {
    if (!existsSync(GLOSSARY_SOURCE)) return;
    const rows = new Map(readFileSync(GLOSSARY_SOURCE, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { id: string; status: string; sources: unknown[] }).map((r) => [r.id, r]));
    for (const g of GLOSSARY_SNAPSHOT) {
      expect(rows.get(g.id)?.status, g.id).toBe(g.status);
      expect(rows.get(g.id)?.sources.length, g.id).toBe(g.sources);
    }
  });
  it('every lesson content id carries sources in the starter content', () => {
    const withSources = (id: string) => {
      const d = [...starter.FORMATIONS, ...starter.PLAYS, ...starter.DEFENSE].find((x) => x.id === id);
      const sourced = d?.basis.filter((b) => b.status !== 'Assumption') ?? [];
      // Assumption rows are design values (splits, depths) and carry no source; every football claim does.
      return sourced.length > 0 && sourced.every((b) => b.sources.length > 0 && b.sources.every((s) => starter.SOURCE_BY_ID.has(s)));
    };
    for (const l of CURRICULUM.lessons) for (const c of l.content) expect(withSources(c), c).toBe(true);
  });
  it('params and rule keys are well formed', () => {
    expect(PARAMS.params.every((p) => p.value >= p.min && p.value <= p.max)).toBe(true);
    expect(RULE_KEYS.map((k) => k.key)).toContain('comm.c2p_cutoff_seconds');
  });
});

function sit(id: string, tag = 'fourth_down', values: [string, number][] = [['go', 0.6], ['punt', 0.58], ['kick', 0.5]], band = ['go'], timeLimitS: number | null = null): SolvedSituation {
  return { id, tag, unit: 'wp', options: values.map(([o, v]) => ({ id: o, value: v })), best: values[0]![0], band, seeds: 200, timeLimitS };
}
const PACK: ScenarioPack = { id: 'p1', lessonId: 'situations.fourth_down', perAttempt: 4, situations: [...Array(20).keys()].map((i) => sit(`s${i}`)) };

describe('graded scenarios (N5.1.2)', () => {
  it('scores band, partial and zero credit, and a late timed answer as delay of game', () => {
    expect(scoreAnswer(sit('a'), { situationId: 'a', option: 'go', seconds: 1 }).credit).toBe(1);
    expect(scoreAnswer(sit('a'), { situationId: 'a', option: 'punt', seconds: 1 }).credit).toBeCloseTo(1 - 0.02 / 0.03, 9);
    expect(scoreAnswer(sit('a'), { situationId: 'a', option: 'kick', seconds: 1 }).credit).toBe(0);
    const both = sit('b', 'try', [['two', 0.5], ['one', 0.495]], ['two', 'one']);
    expect(scoreAnswer(both, { situationId: 'b', option: 'one', seconds: 0 })).toMatchObject({ credit: 1, bothAccepted: true });
    const timed = sit('c', 'timeout', undefined, undefined, 25);
    expect(scoreAnswer(timed, { situationId: 'c', option: 'go', seconds: 26 })).toMatchObject({ credit: 0, error: 'delay_of_game' });
  });
  it('checks packs: best in band, enough seeds, five times one attempt', () => {
    expect(packProblems(PACK)).toEqual([]);
    expect(packProblems({ ...PACK, situations: PACK.situations.slice(0, 10) })[0]).toContain('needs 20');
    expect(packProblems({ ...PACK, situations: [{ ...sit('x'), seeds: 10 }, ...PACK.situations] }).some((p) => p.includes('10 seeds'))).toBe(true);
  });
  it('two attempts draw different situations at least 80 percent of the time', () => {
    let differ = 0;
    for (let i = 0; i < 200; i++) {
      const a = drawAttempt(PACK, 2 * i).map((s) => s.id).sort().join();
      const b = drawAttempt(PACK, 2 * i + 1).map((s) => s.id).sort().join();
      if (a !== b) differ++;
    }
    expect(differ / 200).toBeGreaterThanOrEqual(0.8);
    expect(drawAttempt(PACK, 7)).toEqual(drawAttempt(PACK, 7));
  });
  it('pass at 70, mastered at 90 on two different draws; course passed when every lesson passed', () => {
    const attempt = (seed: number, right: number): AttemptResult => {
      const d = drawAttempt(PACK, seed);
      return scoreAttempt(PACK, d, d.map((s, i) => ({ situationId: s.id, option: i < right ? 'go' : 'kick', seconds: 3 })));
    };
    const r = (as: AttemptResult[], placed = false): LessonRecord => ({ lessonId: PACK.lessonId, attempts: as, placed });
    expect(lessonState(undefined)).toBe('not_started');
    expect(lessonState(r([attempt(1, 2)]))).toBe('attempted');
    expect(lessonState(r([attempt(1, 3)]))).toBe('passed');
    expect(lessonState(r([attempt(1, 4), attempt(1, 4)]))).toBe('passed');
    expect(lessonState(r([attempt(1, 4), attempt(2, 4)]))).toBe('mastered');
    expect(lessonState(r([], true))).toBe('passed');
    const course = CURRICULUM.lessons.filter((l) => l.course === 'motion');
    const all = new Map(course.map((l) => [l.id, { lessonId: l.id, attempts: [], placed: true }]));
    expect(courseState(CURRICULUM, 'motion', all)).toBe('passed');
    all.delete(course[0]!.id);
    expect(courseState(CURRICULUM, 'motion', all)).toBe('in_progress');
  });
  it('placement marks a lesson known only when every item for it is right', () => {
    expect(placementKnown([{ lessonId: 'a', correct: true }, { lessonId: 'a', correct: true }, { lessonId: 'b', correct: true }, { lessonId: 'b', correct: false }])).toEqual(['a']);
  });
  it('school progress changes no career input: the map is a pure view of records', () => {
    const none = curriculumMap(new Map(), 'pro');
    const allPlaced = curriculumMap(new Map(CURRICULUM.lessons.map((l) => [l.id, { lessonId: l.id, attempts: [], placed: true }])), 'pro');
    expect(none.passed).toBe(0);
    expect(allPlaced.passed).toBe(CURRICULUM.lessons.length);
    expect(none.courses[0]!.lessons[0]!.flaggedTerms).toEqual([]);
    expect(curriculumMap(new Map(), 'pro').courses.flatMap((c) => c.lessons).some((l) => l.flaggedTerms.length > 0)).toBe(true);
  });
});

describe('drills (N5.3)', () => {
  it('call deadline follows the radio cut-off; a call after it is late', () => {
    expect(callDeadline(PRO, false, 3)).toBe(22);
    expect(callDeadline(PRO, true, 3)).toBe(7);
    expect(callDeadline({ ...PRO, radioAllowed: false }, false, 6)).toBe(34);
    const s = summarizeCallSession({ reps: [{ seconds: 10, deadline: 22, correctSection: true }, { seconds: 23, deadline: 22, correctSection: false }, { seconds: 12, deadline: 22, correctSection: true }] });
    expect(s).toMatchObject({ reps: 3, medianSeconds: 12, worstSeconds: 23, late: 1 });
    expect(isLate({ seconds: 22, deadline: 22, correctSection: true })).toBe(false);
  });
  it('reads rule values from the real rule set keys', () => {
    const pro = JSON.parse(readFileSync(new URL('../../../rules-data/data/pro_2026.json', import.meta.url), 'utf8')) as { values?: { key: string; value: unknown }[] } | { key: string; value: unknown }[];
    const rows = Array.isArray(pro) ? pro : (Object.values(pro).find(Array.isArray) as { key: string; value: unknown }[]);
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    expect(teachingRulesFrom(get)).toMatchObject({ playClockS: 40, playClockAfterStoppageS: 25, radioCutoffS: 15, timeoutsPerHalf: 3, twoMinuteStop: true });
  });
  it('recognition: ambiguous pre-snap scored on post-snap only; next mix leans to the missed family', () => {
    const t = { clipId: 'c', shell: 'one_high' as const, coverage: 'cover3', pressure: null, disguise: 1, ambiguousPreSnap: true };
    expect(scoreClip(t, { clipId: 'c', shell: 'two_high', coverage: 'cover3', pressure: null }).correct).toBe(true);
    expect(scoreClip({ ...t, ambiguousPreSnap: false }, { clipId: 'c', shell: 'two_high', coverage: 'cover3', pressure: null }).correct).toBe(false);
    const hist = [...Array(10).keys()].map((i) => ({ clipId: `h${i}`, family: i < 5 ? 'cover4' : 'cover1', disguise: 0, correct: i >= 5, parts: { shell: true, coverage: i >= 5, pressure: true } }));
    const fams = ['cover1', 'cover2', 'cover3', 'cover4'];
    const mix = nextMix(hist, fams, 400, 9);
    const share = mix.filter((f) => f === 'cover4').length / 400;
    expect(share).toBeGreaterThan(0.5);
    expect(nextMix([], fams, 400, 9).filter((f) => f === 'cover4').length / 400).toBeLessThan(0.35);
  });
  it('protection: every sound answer scores full credit', () => {
    const look = { lookId: 'l', pressure: 'nickel_fire', sound: [{ point: 'MLB', hot: null, action: 'slide' as const }, { point: 'WLB', hot: null, action: 'keep_back_in' as const }] };
    expect(scoreLook(look, { point: 'WLB', hot: null, action: 'keep_back_in' }).correct).toBe(true);
    expect(scoreLook(look, { point: 'WLB', hot: null, action: 'slide' }).correct).toBe(false);
  });
  it('kneel-down arithmetic', () => {
    expect(kneelOut({ clockS: 110, down: 1, opponentTimeouts: 0, pastTwoMinute: true }, PRO, 2, 1)).toMatchObject({ canKneelOut: true, kneels: 3, clockLeftS: 0 });
    expect(kneelOut({ clockS: 110, down: 1, opponentTimeouts: 3, pastTwoMinute: true }, PRO, 2, 1)).toMatchObject({ canKneelOut: false, kneels: 4, clockLeftS: 102 });
    const warn = kneelOut({ clockS: 130, down: 1, opponentTimeouts: 0, pastTwoMinute: false }, PRO, 2, 1);
    expect(warn.steps[0]).toMatchObject({ clockAfterPlay: 128, stop: 'two_minute', clockAtNextSnap: 120 });
    expect(warn.canKneelOut).toBe(false);
    expect(kneelOut({ clockS: 1, down: 4, opponentTimeouts: 3, pastTwoMinute: true }, PRO, 2, 1)).toMatchObject({ canKneelOut: true, kneels: 1 });
  });
  it('clock problems: level, band and rule season filters', () => {
    const ps = [
      { id: 'a', level: 'pro' as const, type: 'kneel', inBand: false, ruleSeason: '2026' },
      { id: 'b', level: 'college' as const, type: 'kneel', inBand: false, ruleSeason: '2026' },
      { id: 'c', level: 'both' as const, type: 'timeout', inBand: true, ruleSeason: '2026' },
      { id: 'd', level: 'both' as const, type: 'timeout', inBand: false, ruleSeason: '2025' },
    ];
    expect(usableProblems(ps, 'college', '2026').map((p) => p.id)).toEqual(['b']);
  });
});

describe('film room integration (G-63)', () => {
  it('clip truth comes from the defensive call', () => {
    const src = makeSource({ coverageId: 'cover3', pressureId: 'fire_zone' });
    expect(clipTruth(src, { disguise: 2, ambiguousPreSnap: false })).toMatchObject({ shell: 'one_high', coverage: 'cover3', pressure: 'fire_zone', disguise: 2 });
  });
  it('lesson clips need a school viewer and show both sides in the review', () => {
    const src = makeSource();
    const chart = { seed: SEED, charter: null, charted: true };
    expect(() => lessonClip(src, { teamId: HOME, mode: 'career' }, chart)).toThrow(SchoolFilmError);
    const clip = lessonClip(src, { teamId: HOME, mode: 'school' }, chart);
    expect(clip.record.playNumber).toBe(src.playNumber);
    expect(clip.reviewAssignments.length).toBe(src.assignments.length);
  });
  it('grading patterns state only the aggregate', () => {
    expect(gradingPattern([{ personId: 1, gameId: 1, marks: 40, agreements: 30 }, { personId: 1, gameId: 2, marks: 40, agreements: 34 }])).toEqual({ games: 2, marks: 80, agreementShare: 0.8 });
    expect(gradingPattern([])).toBeNull();
  });
});

const P = (bucket: string, cost: number, range = 0.01): PatternLike => ({ bucket, decisions: 8, chosen: { punt: 6, go: 2 }, modelFavoured: { go: 8 }, totalCost: cost, combinedRange: range });

describe('lesson picker, offers, why (N5.4 to N5.6)', () => {
  it('shows the top pattern by value lost per game with its lesson, once per game', () => {
    const card = workOnCard([P('try:late', 0.03), P('fourth_down:short', 0.12)], 6, 77, null);
    expect(card).toMatchObject({ bucket: 'fourth_down:short', lesson: 'situations.fourth_down', costPerGame: 0.02 });
    expect(workOnCard([P('fourth_down:short', 0.12)], 6, 77, 77)).toBeNull();
    expect(workOnCard([], 6, 78, 77)).toBeNull();
    expect(workOnCard([P('challenge:x', 0.2)], 6, 78, null)).toMatchObject({ lesson: null, drill: null });
  });
  it('improved after the window when the bucket no longer qualifies', () => {
    expect(improvement('fourth_down:short', 3, [])).toBe('pending');
    expect(improvement('fourth_down:short', 6, [])).toBe('improved');
    expect(improvement('fourth_down:short', 6, [P('fourth_down:short', 0.1)])).toBe('not_yet');
  });
  it('pattern and duty maps name real lessons, logged decision types and ladder duties', () => {
    expect(patternMapProblems(CURRICULUM, PATTERN_LESSONS, decisions.DECISION_TYPES.map((d) => d.type))).toEqual([]);
    const dutyFile = new URL('../../../career/src/ladder/duties.json', import.meta.url);
    const duties = existsSync(dutyFile) ? (JSON.parse(readFileSync(dutyFile, 'utf8')) as { duties: { id: string }[] }).duties.map((d) => d.id) : null;
    expect(dutyMapProblems(CURRICULUM, duties, DUTY_LESSONS)).toEqual([]);
  });
  it('a gained duty offers its lessons exactly once; many at once group by course', () => {
    const first = dutyOffers(['duty:S3.3.1'], new Set());
    expect(first.map((o) => o.duty)).toEqual(['duty:S3.3.1']);
    expect(dutyOffers(['duty:S3.3.1'], new Set(['duty:S3.3.1']))).toEqual([]);
    const many = dutyOffers(['duty:S3.6.2#play_calling', 'duty:S3.4.4'], new Set());
    expect(groupByCourse(CURRICULUM, many).map((g) => g.course)).toEqual(['plan', 'calling', 'situations', 'analytics']);
  });
  it('why: own staff only, limited per review, stored reasons only', () => {
    const call: AiCallRecord = { callId: 'c1', teamId: HOME, coachId: 9, reasons: [{ code: 'shell_tendency', slots: { shown: 9, of: 11 } }, { code: 'b', slots: {} }, { code: 'c', slots: {} }, { code: 'd', slots: {} }] };
    const ctx = { userTeamId: HOME, askedThisReview: 0, lowOpenness: false, declines: false };
    const a = askWhy(call, ctx);
    expect(a.kind === 'answer' && a.reasons.map((r) => r.code)).toEqual(['shell_tendency', 'b', 'c']);
    const short = askWhy(call, { ...ctx, lowOpenness: true });
    expect(short.kind === 'answer' && short.reasons.length).toBe(1);
    expect(askWhy({ ...call, teamId: 99 }, ctx).kind).toBe('not_own_staff');
    expect(askWhy(call, { ...ctx, askedThisReview: 3 }).kind).toBe('limit');
    expect(askWhy(call, { ...ctx, declines: true }).kind).toBe('declined');
  });
});
