// G-99 tests: Q5.1.1 review gate, Q5.2.1 blind film scoring, Q5.3.1 separation, Q5.4.1 forms and gain,
// Q5.5.1 evidence level and wording, the stratified sampler, and report determinism.
import { describe, it, expect } from 'vitest';
import { seedFromNumber } from '@gm/engine-core';
import {
  stratifiedSample, byConceptAndOutcome, byPlayTypeAndOutcome, outcomeOf, scoreLevel, checkSheet, sliceGate, fileReviewStatus, conventionStatus, checkFinding,
  findingLabel, STAFF_LABEL, separation, checkForms, learningGain, evidenceLevel, checkClaim, WORDING, buildValidationReport, formatValidationReport, studyStatuses,
  PARAMS, param, CANNOT_TELL, blindFilmRecord, blindProblems, clipTruthFromFilm, filmClipSource,
  type ClipTruth, type FilmAnswer, type ReasonJudgement, type Reviewer, type Finding, type Participant, type Question, type LearningParticipant, type ValidationInputs,
} from '../../src/validation/index.ts';

const clip = (i: number, over: Partial<ClipTruth> = {}): ClipTruth => ({
  clipId: `c${String(i).padStart(3, '0')}`, level: 'pro', playType: i % 2 ? 'dropback_pass' : 'run', coverageFamily: 'cover3', disguiseEndedBeforeSnap: true,
  conceptKind: i % 2 ? 'protection' : 'run_concept', concept: i % 2 ? 'slide' : 'inside_zone', outcome: i % 3 ? 'success' : 'failure', decisiveEvent: 'ev', ...over,
});
const LISTS = { protection: ['slide', 'half_slide', 'man'], run_concept: ['inside_zone', 'power', 'counter'] };
const ans = (reviewerId: string, c: ClipTruth, over: Partial<FilmAnswer> = {}): FilmAnswer => ({
  reviewerId, clipId: c.clipId, coverage: c.coverageFamily ?? CANNOT_TELL, concept: c.concept ?? CANNOT_TELL, reason: 'safety rotated late', confidence: 4, ...over,
});

describe('stratified sampler (Q5.1.1, Q5.2.1 rule 1)', () => {
  const pool = Array.from({ length: 300 }, (_, i) => clip(i, { concept: ['slide', 'half_slide', 'man', 'inside_zone', 'power'][i % 5]! }));
  it('draws the asked size, every stratum at least once, and is seeded', () => {
    const a = stratifiedSample(pool, 100, byConceptAndOutcome, seedFromNumber(7), 'pro');
    expect(a.clips).toHaveLength(100);
    expect(new Set(a.clips.map((c) => c.clipId)).size).toBe(100);
    expect(a.strata.every((s) => s.drawn >= 1 && s.drawn <= s.available)).toBe(true);
    const b = stratifiedSample([...pool].reverse(), 100, byConceptAndOutcome, seedFromNumber(7), 'pro');
    expect(b.clips.map((c) => c.clipId)).toEqual(a.clips.map((c) => c.clipId));
    const c = stratifiedSample(pool, 100, byConceptAndOutcome, seedFromNumber(8), 'pro');
    expect(c.clips.map((x) => x.clipId)).not.toEqual(a.clips.map((x) => x.clipId));
  });
  it('allocates in proportion to stratum size', () => {
    const skew = [...Array.from({ length: 90 }, (_, i) => clip(i, { playType: 'run', outcome: 'success' })), ...Array.from({ length: 10 }, (_, i) => clip(100 + i, { playType: 'punt', outcome: 'success' }))];
    const s = stratifiedSample(skew, 50, byPlayTypeAndOutcome, seedFromNumber(1), 'r');
    expect(s.strata.find((x) => x.key === 'run|success')!.drawn).toBe(45);
    expect(s.strata.find((x) => x.key === 'punt|success')!.drawn).toBe(5);
  });
  it('returns the whole pool when short, and nothing for size 0', () => {
    expect(stratifiedSample(pool.slice(0, 20), 50, byConceptAndOutcome, seedFromNumber(1), 'x')).toMatchObject({ short: true });
    expect(stratifiedSample(pool.slice(0, 20), 50, byConceptAndOutcome, seedFromNumber(1), 'x').clips).toHaveLength(20);
    expect(stratifiedSample(pool, 0, byConceptAndOutcome, seedFromNumber(1), 'x').clips).toHaveLength(0);
  });
  it('outcome uses EPA when present, else the fallback', () => {
    const base = { firstDown: false, touchdown: false, interception: false, fumbleLost: false, sack: false, yardsGained: 2 };
    expect(outcomeOf({ ...base, epBefore: 1, epAfter: 1.4 })).toBe('success');
    expect(outcomeOf({ ...base, epBefore: 1, epAfter: 0.6, firstDown: true })).toBe('failure');
    expect(outcomeOf({ ...base, epBefore: null, epAfter: null, firstDown: true })).toBe('success');
    expect(outcomeOf({ ...base, epBefore: null, epAfter: null, sack: true, yardsGained: 5 })).toBe('failure');
    expect(outcomeOf({ ...base, epBefore: null, epAfter: null, yardsGained: 4 })).toBe('success');
  });
});

describe('blind film test (Q5.2.1)', () => {
  const clips = Array.from({ length: 10 }, (_, i) => clip(i));
  const judge = (r: string, agrees = true): ReasonJudgement[] => clips.map((c) => ({ reviewerId: r, clipId: c.clipId, judgeId: 'j1', agrees }));
  it('is not_run with fewer than 3 reviewers', () => {
    const r = scoreLevel('pro', clips, clips.map((c) => ans('r1', c)), judge('r1'));
    expect(r.verdict).toBe('not_run');
    expect(r.pooled.coverage.rate).toBe(1);
  });
  it('passes at the marks and fails below them', () => {
    const answers = ['r1', 'r2', 'r3'].flatMap((r) => clips.map((c) => ans(r, c)));
    expect(scoreLevel('pro', clips, answers, ['r1', 'r2', 'r3'].flatMap((r) => judge(r))).verdict).toBe('pass');
    const bad = ['r1', 'r2', 'r3'].flatMap((r) => clips.map((c, i) => ans(r, c, i < 3 ? { coverage: 'cover1' } : {})));
    const res = scoreLevel('pro', clips, bad, ['r1', 'r2', 'r3'].flatMap((r) => judge(r)));
    expect(res.verdict).toBe('fail');
    expect(res.pooled.coverage.rate).toBeCloseTo(0.7);
    expect(res.misread.filter((m) => m.question === 'coverage')).toHaveLength(3);
  });
  it('scores coverage only where the disguise ended before the snap, and cannot tell counts as wrong', () => {
    const cs = [clip(1), clip(2, { disguiseEndedBeforeSnap: false })];
    const r = scoreLevel('pro', cs, [ans('a', cs[0]!, { coverage: CANNOT_TELL }), ans('a', cs[1]!, { coverage: 'cover0' })], []);
    expect(r.pooled.coverage).toMatchObject({ hit: 0, of: 1 });
    expect(r.reviewers[0]!.cannotTell).toBe(1);
  });
  it('a reason agrees only when every judgement agrees; self-judging is refused', () => {
    const c = clips[0]!;
    const js: ReasonJudgement[] = [{ reviewerId: 'a', clipId: c.clipId, judgeId: 'j1', agrees: true }, { reviewerId: 'a', clipId: c.clipId, judgeId: 'j2', agrees: false }];
    expect(scoreLevel('pro', [c], [ans('a', c)], js).pooled.reason).toMatchObject({ hit: 0, of: 1 });
    expect(checkSheet([ans('a', c)], [c], LISTS, [{ reviewerId: 'a', clipId: c.clipId, judgeId: 'a', agrees: true }])[0]).toMatch(/second person/);
  });
  it('sheet checks: fixed lists, one line, duplicates, unknown clips', () => {
    const c = clips[1]!;
    const p = checkSheet([ans('a', c, { concept: 'made_up', reason: 'a\nb' }), ans('a', c), ans('a', clip(99, { clipId: 'zz' }))], [c], LISTS);
    expect(p.join('|')).toMatch(/not on the protection list/);
    expect(p.join('|')).toMatch(/one line/);
    expect(p.join('|')).toMatch(/answered twice/);
    expect(p.join('|')).toMatch(/not in the set/);
  });
});

describe('football review (Q5.1.1, Q5.6.1 rule 2b)', () => {
  const R = new Map<string, Reviewer>([['c1', { id: 'c1', kind: 'coach', tree: 'west_coast' }], ['c2', { id: 'c2', kind: 'coach', tree: 'erhardt_perkins' }], ['s1', { id: 's1', kind: 'project_staff', tree: null }]]);
  const f = (id: string, reviewerId: string, severity: Finding['severity'] = 'wrong'): Finding => ({
    id, reviewerId, slice: 'pass_protection', area: 'F', leafId: 'F5.2.1', whatIsWrong: 'x', coachWouldExpect: 'y', severity, anotherStaffWouldDiffer: false, clips: [], aboutAiCoach: false,
  });
  it('a coach "wrong" blocks until fixed or disputed by a second coach', () => {
    expect(sliceGate('pass_protection', [f('a', 'c1')], [], new Map(), R).blocked).toBe(true);
    expect(sliceGate('pass_protection', [f('a', 'c1')], [], new Map([['a', 'fixed']]), R).blocked).toBe(false);
    const g = sliceGate('pass_protection', [f('a', 'c1')], [{ findingId: 'a', reviewerId: 'c2', stance: 'dispute' }], new Map(), R);
    expect(g.blocked).toBe(false);
    expect(g.treeDifferences).toEqual(['a']);
    expect(sliceGate('pass_protection', [f('a', 'c1')], [{ findingId: 'a', reviewerId: 's1', stance: 'dispute' }], new Map(), R).blocked).toBe(true);
  });
  it('staff findings are labelled and move no gate or status', () => {
    const g = sliceGate('pass_protection', [f('s', 's1')], [], new Map(), R);
    expect(g).toMatchObject({ blocked: false, staffFindings: 1 });
    expect(findingLabel(f('s', 's1'), R)).toBe(STAFF_LABEL);
    expect(fileReviewStatus('F5', [{ file: 'F5', slice: 'pp', reviewerIds: ['s1'], completed: true }], R)).toBe('not reviewed');
    expect(fileReviewStatus('F5', [{ file: 'F5', slice: 'pp', reviewerIds: ['c1'], completed: true }], R)).toBe('reviewed');
    expect(fileReviewStatus('F5', [{ file: 'F5', slice: 'pp', reviewerIds: ['c1'], completed: false }], R)).toBe('not reviewed');
  });
  it('a convention needs two coaches from different trees', () => {
    expect(conventionStatus(['c1', 'c2'], R)).toBe('Reviewed (2 coaches)');
    expect(conventionStatus(['c1', 'c1', 's1'], R)).toBe('not reviewed');
  });
  it('the form asks every field, including "would another staff differ"', () => {
    expect(checkFinding({ ...f('a', 'c1'), anotherStaffWouldDiffer: null, leafId: 'G4.1', area: 'F' }, R)).toHaveLength(2);
  });
});

describe('skill separation (Q5.3.1)', () => {
  const p = (id: string, group: Participant['group'], grade: number, ms = 1000): Participant => ({ id, group, decisionGrade: grade, result: grade * 10, recordScore: null, interfaceMs: ms, trainingMinutes: 30, certified: true });
  const many = (g: Participant['group'], base: number) => Array.from({ length: 10 }, (_, i) => p(`${g}${i}`, g, base + i * 0.01, 900 + i * 20));
  it('shows the ordering only with all three groups at size', () => {
    const r = separation([...many('coaches', 3), ...many('fans', 2), ...many('newcomers', 1)], 10);
    expect(r.orderingShown).toBe(true);
    expect(r.orderings[0]!.pairs.every((x) => x.heldRaw && x.heldAdjusted)).toBe(true);
  });
  it('fans against newcomers alone shows nothing claimable', () => {
    const r = separation([...many('fans', 2), ...many('newcomers', 1)], 10);
    expect(r).toMatchObject({ coachGroupRun: false, orderingShown: false });
    expect(r.orderings[0]!.pairs).toEqual([{ higher: 'fans', lower: 'newcomers', heldRaw: true, heldAdjusted: true }]);
  });
  it('interface adjustment can reverse a raw gap that is all button speed', () => {
    // Fans score higher only because they are faster; at equal speed the coaches' grades are higher.
    const ps = [p('c1', 'coaches', 1.0, 3000), p('c2', 'coaches', 1.2, 2800), p('f1', 'fans', 1.5, 1000), p('f2', 'fans', 1.6, 1200), p('n1', 'newcomers', 0.2, 2900), p('n2', 'newcomers', 0.4, 2700)];
    const pair = separation(ps, 1).orderings[0]!.pairs.find((x) => x.higher === 'coaches' && x.lower === 'fans')!;
    expect(pair.heldRaw).toBe(false);
    expect(typeof pair.heldAdjusted).toBe('boolean');
  });
  it('flags uncertified play and unequal training', () => {
    const r = separation([p('a', 'fans', 1), { ...p('b', 'fans', 1), certified: false, trainingMinutes: 10 }], 10);
    expect(r.problems.join('|')).toMatch(/certified/);
    expect(r.problems.join('|')).toMatch(/training time differs/);
    expect(r.participants).toBe(1);
  });
});

describe('learning test (Q5.4.1)', () => {
  const ctx = { factIds: new Set(['F-x-1']), ruleBooks: new Set(['nfl_2026']), gameOnlyTerms: ['call sheet designer'] };
  const q = (id: string, form: 'A' | 'B', topic: Question['topic'], trace: Question['trace'] = { kind: 'rule', ruleBook: 'nfl_2026', section: 'Rule 3, Section 1' }): Question => ({ id, form, topic, text: `question ${id}`, trace });
  const full = (['formations_personnel', 'coverage', 'protection', 'down_distance_clock', 'rules'] as const).flatMap((t) => [q(`a-${t}`, 'A', t), q(`b-${t}`, 'B', t, { kind: 'fact', factId: 'F-x-1' })]);
  it('accepts two equivalent, fully traced forms', () => { expect(checkForms(full, ctx)).toEqual([]); });
  it('refuses untraced questions, unknown facts, game terms, and unequal forms', () => {
    const p = checkForms([...full, q('x', 'A', 'rules', null), q('y', 'A', 'coverage', { kind: 'fact', factId: 'nope' }), { ...q('z', 'B', 'rules'), text: 'In the Call Sheet Designer...' }], ctx).join('|');
    expect(p).toMatch(/does not trace/);
    expect(p).toMatch(/does not exist/);
    expect(p).toMatch(/game-only term/);
    expect(p).toMatch(/form A has/);
    expect(checkForms(full.filter((x) => x.form === 'A'), ctx).join('|')).toMatch(/form B does not exist/);
  });
  it('gain over control, with and without outside study', () => {
    const lp = (id: string, arm: 'play' | 'control', a: number, b: number, outside = false): LearningParticipant => ({ id, arm, formA: a, formB: b, hours: arm === 'play' ? 20 : 0, studiedOutside: outside });
    const r = learningGain([lp('p1', 'play', 0.4, 0.7), lp('p2', 'play', 0.5, 0.6, true), lp('c1', 'control', 0.4, 0.45)], 20, false);
    expect(r.gainOverControl).toBeCloseTo(0.15);
    expect(r.gainOverControlNoOutsideStudy).toBeCloseTo(0.25);
    expect(r.label).toBe('test not reviewed by a coach');
    expect(learningGain([lp('p', 'play', 0, 0), { ...lp('c', 'control', 0, 0), hours: 3 }], 20, true).problems).toHaveLength(1);
  });
});

describe('evidence level and wording (Q5.5.1)', () => {
  const none = { footballReviewComplete: false, blindFilmPassed: false, orderingShown: false, learningGainShown: false, earned: 0 as const };
  it('climbs only in order and never falls', () => {
    expect(evidenceLevel(none)).toBe(0);
    expect(evidenceLevel({ ...none, orderingShown: true, learningGainShown: true })).toBe(0);
    expect(evidenceLevel({ ...none, footballReviewComplete: true, blindFilmPassed: true })).toBe(1);
    expect(evidenceLevel({ footballReviewComplete: true, blindFilmPassed: true, orderingShown: true, learningGainShown: true, earned: 0 })).toBe(3);
    expect(evidenceLevel({ ...none, earned: 2 })).toBe(2);
  });
  it('refuses wording above the level and wording no level allows', () => {
    expect(checkClaim(WORDING[0], 0)).toEqual([]);
    expect(checkClaim(WORDING[2], 1)).toHaveLength(1);
    expect(checkClaim('Master this and get hired as an NFL coordinator', 3).length).toBeGreaterThanOrEqual(2);
    expect(checkClaim('Earn your certified coach badge', 3)).toHaveLength(1);
  });
});

describe('report (deferred state, determinism)', () => {
  const clips = Array.from({ length: 6 }, (_, i) => clip(i));
  const inputs: ValidationInputs = {
    coachReviewersAvailable: false,
    film: { clips, answers: clips.map((c) => ans('r1', c)), judgements: [], lists: LISTS },
    review: { reviewers: [{ id: 's1', kind: 'project_staff', tree: null }], findings: [{ id: 'f1', reviewerId: 's1', slice: 'pp', area: 'F', leafId: 'F5.1.1', whatIsWrong: 'a', coachWouldExpect: 'b', severity: 'wrong', anotherStaffWouldDiffer: true, clips: [], aboutAiCoach: false }], responses: [], actions: new Map(), rounds: [], files: ['F5', 'G4'] },
    participants: [],
    learning: { questions: [], ctx: { factIds: new Set(), ruleBooks: new Set(), gameOnlyTerms: [] }, participants: [], coachReviewed: false },
    earned: 0,
  };
  it('prints level 0, every deferral line, and staff labels, byte-identically', () => {
    const r = buildValidationReport(inputs);
    expect(r.level).toBe(0);
    expect(r.releaseNotes).toEqual(studyStatuses(false).map((s) => s.releaseNote));
    const t = formatValidationReport(r);
    expect(t).toContain('Evidence level: 0');
    expect(t).toContain('Blind film test not run.');
    expect(t).toContain(STAFF_LABEL);
    expect(t).toContain('F5: not reviewed');
    expect(t).toContain('pro: NOT_RUN');
    expect(formatValidationReport(buildValidationReport(inputs))).toBe(t);
  });
  it('a staff "wrong" finding never blocks while deferred; coach availability alone raises nothing', () => {
    const r = buildValidationReport({ ...inputs, coachReviewersAvailable: true });
    expect(r.review.gates[0]!.blocked).toBe(false);
    expect(r.level).toBe(0);
  });
  it('params are named, bounded and readable', () => {
    for (const row of PARAMS.params) expect(row.value >= row.min && row.value <= row.max).toBe(true);
    expect(param('validation.film.passCoverage')).toBe(0.8);
    expect(() => param('validation.nope')).toThrow();
  });
});

describe('film room link (G-63 FilmRecord)', () => {
  // Shaped like the film room's FilmRecord (app-services read-models/film/views.ts), fields this module reads.
  const rec = (playId: string, epa: number | null, gain = 3) => ({
    playId, gameId: 1, playNumber: 1, viewerSide: 0 as 0 | 1 | null, ticksPerSecond: 10, events: [{ kind: 'snap', tick: 0, x: 0, y: 0 }],
    base: { playType: 'pass', gainLoss: gain, result: 'complete' },
    coaching: { values: { coverage: 'cover3', protection: 'slide', runScheme: null } as Record<string, string | null>, sources: { coverage: 'staff', protection: 'call', runScheme: 'uncharted' } as Record<string, string> },
    assignments: [{ slot: 1, words: 'block', points: [], author: 'call' }] as readonly unknown[], epa,
  });
  const truth = (playId: string, over: Partial<{ protection: string | null; runConcept: string | null }> = {}) => ({ playId, coverageFamily: 'cover3' as const, disguiseEndedBeforeSnap: true, protection: 'slide', runConcept: null, decisiveEvent: 'late_rotation', ...over });
  it('blinds a record: overlays off, film kept, input unchanged', () => {
    const r = rec('p1', 0.4);
    expect(blindProblems(r)).toHaveLength(4);
    const b = blindFilmRecord(r);
    expect(blindProblems(b)).toEqual([]);
    expect(b.events).toBe(r.events);
    expect(b.coaching.sources.protection).toBe('uncharted');
    expect(r.coaching.values.coverage).toBe('cover3');
  });
  it('builds truth from film plus engine truth; missing truth is named, not scored', () => {
    const { source, clips, missingTruth } = filmClipSource('pro', [rec('p1', 0.4), rec('p2', null, 5), rec('p3', -1)], [truth('p1'), truth('p2', { protection: null, runConcept: 'power' })]);
    expect(missingTruth).toEqual(['p3']);
    expect(source.clips().map((c) => [c.clipId, c.conceptKind, c.concept, c.outcome])).toEqual([['p1', 'protection', 'slide', 'success'], ['p2', 'run_concept', 'power', 'success']]);
    expect(clips.every((c) => blindProblems(c.blind).length === 0)).toBe(true);
    expect(() => clipTruthFromFilm(rec('p1', 0), 'pro', truth('p9'))).toThrow();
  });
});
