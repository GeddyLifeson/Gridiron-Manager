// The user's interview screens (coach.interview, people.hiring): view questions have no right answer and
// show no fit number; graded work is graded by the job's tools and shown as observed words.
import { describe, expect, it } from 'vitest';
import { interviews } from '@gm/career';
import { seedFromNumber, stream } from '@gm/engine-core';
import {
  NEW_HIRE, NEW_SIT, TASK_TOOL, applyHireAction, applySitAction, buildHireView, buildSitView, candidatesFrom, gradeWord, referralWord, sitApplicant, tieWord,
  type CandidateInput, type SitState,
} from '../../../src/read-models/interviews/index.ts';

const opening = { title: 'Linebackers coach', team: 'Bayport', date: 'Mon 12 Feb', group: 'position' as const };
const slate = interviews.QUESTIONS.filter((q) => q.asker === 'hirer' && q.groups.includes('position')).slice(0, 3).map((q) => q.id);
const q0 = interviews.question(slate[0]!);

describe('coach.interview (he is interviewed)', () => {
  it('shows the slate with every option and no stance position, and the graded tasks with their tools', () => {
    const v = buildSitView({ opening, panel: ['Earl Mason', 'Ray Ortiz'], slate, grades: {}, state: NEW_SIT, outcome: null });
    expect(v.panel).toEqual([{ name: 'Earl Mason', lead: true }, { name: 'Ray Ortiz', lead: false }]);
    expect(v.questions).toHaveLength(3);
    expect(v.questions[0]!.options.map((o) => o.key)).toEqual(q0.options.map((o) => o.key));
    expect(JSON.stringify(v)).not.toMatch(/"at"|fit|craft|belief/);
    expect(v.tasks.map((t) => [t.id, t.tool, t.grade])).toEqual([['teach_install', 'football.install', null], ['grade_snaps', 'film.grades', null]]);
    expect(v.stage).toBe('open');
    expect(v.canSubmit).toBe(false);
  });

  it('takes any answer or a decline, submits only when every question is met, and feeds the engine', () => {
    let s: SitState = NEW_SIT;
    const step = (a: Parameters<typeof applySitAction>[2]) => { const r = applySitAction(slate, s, a); if (!r.ok) throw new Error(r.key); s = r.state; };
    expect(applySitAction(slate, s, { kind: 'submit' })).toEqual({ ok: false, key: 'interview.unanswered' });
    expect(applySitAction(slate, s, { kind: 'answer', questionId: slate[0]!, option: 'nope' })).toEqual({ ok: false, key: 'interview.unknown_option' });
    step({ kind: 'answer', questionId: slate[0]!, option: q0.options[0]!.key });
    step({ kind: 'answer', questionId: slate[1]!, option: interviews.question(slate[1]!).options[1]!.key });
    step({ kind: 'decline', questionId: slate[2]! });
    const grades = { teach_install: 0.8, grade_snaps: 0.42 };
    const v = buildSitView({ opening, panel: ['Earl Mason'], slate, grades, state: s, outcome: null });
    expect(v.done).toBe(3);
    expect(v.canSubmit).toBe(true);
    expect(v.questions[2]!.declined).toBe(true);
    expect(v.tasks.map((t) => t.grade)).toEqual(['excellent', 'fair']);
    step({ kind: 'submit' });
    expect(applySitAction(slate, s, { kind: 'decline', questionId: slate[0]! })).toEqual({ ok: false, key: 'interview.already_submitted' });
    const app = sitApplicant(s, grades);
    expect(Object.keys(app.answers)).toEqual([slate[0], slate[1]]);
    // The engine scores his answers; the declined one is skipped, not counted against him.
    const panel = [{ personId: 1, lead: true, wants: interviews.beliefsFrom({ discipline: 0.6, player_relations: -0.2 }) }];
    const res = interviews.scoreInterview(slate.map(interviews.question), app.answers, panel);
    expect(res.notes.map((n) => n.option)).toEqual([q0.options[0]!.key, interviews.question(slate[1]!).options[1]!.key, null]);
    expect(res.fit).toBeGreaterThanOrEqual(0);
    expect(res.fit).toBeLessThanOrEqual(1);
    expect(buildSitView({ opening, panel: [], slate, grades, state: s, outcome: 'offered' }).stage).toBe('offered');
  });
});

describe('people.hiring (he hires)', () => {
  const cands: CandidateInput[] = [
    { personId: 7, name: 'Dale Kirk', record: '6 seasons, 2 as coordinator', referrals: [{ name: 'Earl Mason', regard: 0.7, tieToYou: 80 }], answers: { [slate[0]!]: q0.options[3]!.key }, grades: { teach_install: 0.6, grade_snaps: 0.3 } },
    { personId: 9, name: 'Sam Holt', record: '3 seasons', referrals: [], answers: {}, grades: {} },
  ];
  const base = { opening, slate, candidates: cands, delegateTo: 'Ray Ortiz' };

  it('shows what each said, referee words and observed grades, with no score of ours', () => {
    const v = buildHireView({ ...base, state: NEW_HIRE, answer: null });
    const c = v.candidates[0]!;
    expect(c.answers[0]!.said).toBe(q0.options[3]!.text);
    expect(c.answers[1]!.said).toBeNull();
    expect(c.referrals).toEqual([{ name: 'Earl Mason', says: 'strong_backing', toYou: 'close' }]);
    expect(c.tasks.map((t) => t.grade)).toEqual(['good', 'poor']);
    expect(JSON.stringify(v)).not.toMatch(/regard|tieToYou|fit|craft|score|belief/);
    expect(v.stage).toBe('reviewing');
  });

  it('marks are his own read; pass, offer and delegate close the search properly', () => {
    let s = NEW_HIRE;
    const step = (a: Parameters<typeof applyHireAction>[2]) => { const r = applyHireAction(base, s, a); if (!r.ok) throw new Error(r.key); s = r.state; };
    step({ kind: 'mark', personId: 7, questionId: slate[0]!, mark: 'with' });
    step({ kind: 'mark', personId: 7, questionId: slate[1]!, mark: 'against' });
    step({ kind: 'mark', personId: 7, questionId: slate[1]!, mark: null });
    step({ kind: 'pass', personId: 9 });
    expect(applyHireAction(base, s, { kind: 'offer', personId: 9 })).toEqual({ ok: false, key: 'hiring.passed' });
    let v = buildHireView({ ...base, state: s, answer: null });
    expect([v.candidates[0]!.withYou, v.candidates[0]!.against, v.candidates[1]!.passed]).toEqual([1, 0, true]);
    step({ kind: 'offer', personId: 7 });
    expect(applyHireAction(base, s, { kind: 'pass', personId: 7 })).toEqual({ ok: false, key: 'hiring.closed' });
    v = buildHireView({ ...base, state: s, answer: null });
    expect(v.stage).toBe('offer_out');
    expect(buildHireView({ ...base, state: s, answer: 'accepted' }).stage).toBe('accepted');
    expect(applyHireAction({ ...base, delegateTo: null }, NEW_HIRE, { kind: 'delegate' })).toEqual({ ok: false, key: 'hiring.cannot_delegate' });
    const d = applyHireAction(base, NEW_HIRE, { kind: 'delegate' });
    expect(d.ok && buildHireView({ ...base, state: d.state, answer: null }).stage).toBe('delegated');
  });

  it('reads the engine search results: answers from the room and grades from the work', () => {
    const op: interviews.Opening = { seatId: 1, positionId: 'pos:position_coach.lb', rung: 4, group: 'position', side: 'defense', level: 'pro' };
    const panel = [{ personId: 1, lead: true, wants: interviews.beliefsFrom({ discipline: 0.5 }) }];
    const pool = [7, 9].map((id) => ({ personId: id, beliefs: interviews.beliefsFrom({ discipline: id === 7 ? 0.9 : -0.9 }), record: 0.5, tie: 10, referrals: [], craft: 0 }));
    const out = interviews.runSearch({ opening: op, panel, pool, offer: () => false, stream: stream(seedFromNumber(5), 'test.interviews', []) });
    const got = candidatesFrom(out, (id) => ({ name: `P${id}`, record: '-', referrals: [] }));
    expect(got.map((c) => c.personId).sort()).toEqual([7, 9]);
    for (const c of got) {
      const i = out.interviewed.find((x) => x.personId === c.personId)!;
      expect(c.grades).toEqual(i.grades);
      expect(Object.keys(c.answers)).toEqual(out.slate);
    }
  });
});

describe('words', () => {
  it('buckets grades, referee words and ties', () => {
    expect([0.9, 0.6, 0.45, 0.1].map(gradeWord)).toEqual(['excellent', 'good', 'fair', 'poor']);
    expect([0.6, 0.2, 0, -0.5].map(referralWord)).toEqual(['strong_backing', 'speaks_well', 'lukewarm', 'warns_against']);
    expect([70, 30, 5].map(tieWord)).toEqual(['close', 'known', 'stranger']);
    for (const ts of Object.values(interviews.PRACTICAL_TASKS)) for (const t of ts) expect(TASK_TOOL[t.id]).toBeDefined();
  });
});
