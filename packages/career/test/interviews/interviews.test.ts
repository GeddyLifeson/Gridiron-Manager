// Fit-based interviews: no right answers, hired on fit, same process for every seat and applicant.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import type { RandomStream, TraitBlock } from '@gm/schema';
import {
  QUESTIONS, STANCES, answerAll, beliefsFrom, candidateRead, drawBeliefs, interviewFactStatus, INTERVIEW_FACTS, panelFor, readOf, referralScore,
  roleGroupOf, runSearch, PRACTICAL_TASKS, practicalScore, gradeAi, scoreInterview, slate, wantsAfterFiring, acceptWithFit, PARAMS,
  type Applicant, type Opening, type PanelMember, type PanelSeat,
} from '../../src/interviews/index.ts';

const rng = (seed: number, name = 'test'): RandomStream => stream(seedFromNumber(seed), `interviews.${name}`, []);

const all = (x: number): Record<string, number> => Object.fromEntries(STANCES.map((s) => [s.id, x]));
const HARD = beliefsFrom(all(1));
const SOFT = beliefsFrom(all(-1));

const OC: Opening = { seatId: 10, positionId: 'pos:offensive_coordinator', rung: 7, group: 'coordinator', side: 'offense', level: 'pro' };
const HC: Opening = { seatId: 1, positionId: 'pos:head_coach', rung: 9, group: 'head', side: 'any', level: 'pro' };

const panel = (wants: ReturnType<typeof beliefsFrom>): PanelMember[] => [{ personId: 900, wants, lead: true }];
const applicant = (personId: number, beliefs: ReturnType<typeof beliefsFrom>, extra: Partial<Applicant> = {}): Applicant =>
  ({ personId, beliefs, record: 0.5, tie: 0, referrals: [], ...extra });

describe('no right answers', () => {
  it('every option of every question is the best possible answer for somebody', () => {
    for (const q of QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      for (const o of q.options) {
        const best = Math.max(...q.options.map((x) => readOf(x.at, o.at)));
        expect(readOf(o.at, o.at)).toBe(best);
      }
      // Options span the axis both ways: no question has only "good" or only "bad" ends.
      expect(Math.min(...q.options.map((o) => o.at))).toBeLessThan(0);
      expect(Math.max(...q.options.map((o) => o.at))).toBeGreaterThan(0);
    }
  });

  it('two panels with opposite views hire different people from the same pool (E2.3.2 acceptance)', () => {
    const pool = [applicant(1, HARD), applicant(2, SOFT)];
    const take = (): boolean => true;
    expect(runSearch({ opening: OC, panel: panel(HARD), pool, offer: take, stream: rng(1) }).hired).toBe(1);
    expect(runSearch({ opening: OC, panel: panel(SOFT), pool, offer: take, stream: rng(1) }).hired).toBe(2);
  });

  it('answers that match the panel score higher than answers that do not, whatever the panel believes', () => {
    for (const wants of [HARD, SOFT, beliefsFrom({ discipline: 1, analytics: -1, youth: 0.5 })]) {
      const qs = slate(OC, panel(wants));
      const match = scoreInterview(qs, answerAll(qs, wants), panel(wants)).fit;
      const flip = beliefsFrom(Object.fromEntries(STANCES.map((s) => [s.id, -(wants[s.id] ?? 0)])));
      expect(match).toBeGreaterThan(scoreInterview(qs, answerAll(qs, flip), panel(wants)).fit);
    }
  });
});

describe('same for everyone', () => {
  it('the user giving the same answers as an AI candidate scores the same (K7.6.1 rule 4)', () => {
    const qs = slate(HC, panel(HARD));
    const ai = applicant(1, SOFT);
    const user: Applicant = { personId: 2, beliefs: null, answers: answerAll(qs, SOFT), record: 0.5, tie: 0, referrals: [] };
    const out = runSearch({ opening: HC, panel: panel(HARD), pool: [ai, user], offer: () => false, stream: rng(3) });
    const [a, b] = [out.interviewed.find((x) => x.personId === 1)!, out.interviewed.find((x) => x.personId === 2)!];
    expect(a.result.fit).toBeCloseTo(b.result.fit, 12);
  });

  it('every candidate of one opening gets the same slate, and a seed replays exactly', () => {
    const pool = [1, 2, 3, 4].map((id) => applicant(id, drawBeliefs(null, rng(id, `b${id}`))));
    const a = runSearch({ opening: OC, panel: panel(HARD), pool, offer: (id) => id === 3, stream: rng(7) });
    const b = runSearch({ opening: OC, panel: panel(HARD), pool, offer: (id) => id === 3, stream: rng(7) });
    expect(a).toEqual(b);
    for (const i of a.interviewed) expect(i.result.notes.map((n) => n.questionId)).toEqual(a.slate);
  });

  it('there is a slate for every staff role at both levels', () => {
    const seats = ['pos:head_coach', 'pos:offensive_coordinator', 'pos:position_coach.qb', 'pos:assistant_position_coach', 'pos:quality_control.defense',
      'pos:graduate_assistant', 'pos:strength_head', 'pos:general_manager', 'pos:recruiting_assistant', 'pos:special_teams_coordinator'];
    const rungs = [9, 7, 5, 4, 3, 2, 5, 9, 1, 7];
    seats.forEach((p, i) => {
      for (const level of ['pro', 'college'] as const) {
        const op: Opening = { seatId: i, positionId: p, rung: rungs[i]!, group: roleGroupOf(p, rungs[i]!), side: p.includes('special') ? 'special_teams' : 'any', level };
        expect(slate(op, panel(HARD)).length, `${p} ${level}`).toBeGreaterThanOrEqual(3);
      }
    });
  });

  it('school questions are asked only at college', () => {
    const ids = (level: 'pro' | 'college'): string[] => slate({ ...OC, level, group: 'position', rung: 5 }, panel(beliefsFrom({ academics: 1 }))).map((q) => q.id);
    expect(ids('college')).toContain('q.academics.class');
    expect(ids('pro')).not.toContain('q.academics.class');
  });
});

describe('who interviews (delegation)', () => {
  const seats: PanelSeat[] = [
    { seatId: 1, positionId: 'pos:head_coach', rung: 9, reportsToSeatId: null, holderPersonId: 100 },
    { seatId: 2, positionId: 'pos:offensive_coordinator', rung: 7, reportsToSeatId: 1, holderPersonId: 200 },
    { seatId: 3, positionId: 'pos:position_coach.wr', rung: 5, reportsToSeatId: 2, holderPersonId: 300 },
    { seatId: 4, positionId: 'pos:assistant_position_coach', rung: 4, reportsToSeatId: 3, holderPersonId: null },
    { seatId: 5, positionId: 'pos:position_coach.te', rung: 5, reportsToSeatId: 2, holderPersonId: null },
    { seatId: 6, positionId: 'pos:general_manager', rung: null, reportsToSeatId: null, holderPersonId: 600 },
    { seatId: 7, positionId: 'pos:graduate_assistant', rung: 2, reportsToSeatId: 5, holderPersonId: null },
  ];
  it('an assistant is hired by his position coach without the head coach', () => expect(panelFor(seats, 4, 999)).toEqual([300]));
  it('a position coach is hired by the coordinator with the head coach sitting in', () => expect(panelFor(seats, 5, 999)).toEqual([200, 100]));
  it('an empty boss chair passes the interview up the line', () => expect(panelFor(seats, 7, 999)).toEqual([200]));
  it('a head coach is hired by the appointer and the general manager', () => expect(panelFor(seats, 1, 999)).toEqual([999, 600]));
});

describe('referrals, firing and the candidate\'s side', () => {
  it('a word from a coach the hirer trusts counts more than a stranger\'s', () => {
    expect(referralScore([{ refereeId: 1, regard: 1, tieToHirer: 90 }])).toBeGreaterThan(referralScore([{ refereeId: 2, regard: 1, tieToHirer: 0 }]));
    expect(referralScore([])).toBe(0.5);
    expect(referralScore([{ refereeId: 3, regard: -1, tieToHirer: 90 }])).toBeLessThan(0.5);
  });

  it('a referral can put a candidate on the shortlist ahead of a better record', () => {
    const pool = [1, 2, 3, 4, 5].map((id) => applicant(id, HARD, { record: 0.7 }));
    const referred = applicant(9, HARD, { record: 0.4, referrals: [{ refereeId: 50, regard: 1, tieToHirer: 100 }] });
    const out = runSearch({ opening: OC, panel: panel(HARD), pool: [...pool, referred], offer: () => false, stream: rng(4) });
    expect(out.shortlist).toContain(9);
  });

  it('after a firing the appointer wants the other end of what the fired coach believed', () => {
    const w = wantsAfterFiring(beliefsFrom({}), beliefsFrom({ discipline: -1 }));
    expect(w['discipline']).toBeGreaterThan(0);
  });

  it('a candidate is likelier to accept a job whose people think like him', () => {
    const like = candidateRead(OC, panel(HARD), HARD);
    const unlike = candidateRead(OC, panel(HARD), SOFT);
    expect(like).toBeGreaterThan(unlike);
    expect(acceptWithFit(0.5, like)).toBeGreaterThan(acceptWithFit(0.5, unlike));
  });
});

describe('beliefs', () => {
  const traits = (facets: Record<string, number>): TraitBlock => ({ facets, values: {}, goals: [], schemaVersion: 1, source: 'generated' });
  it('are bounded, the same for the same person stream, and pulled by traits', () => {
    const a = drawBeliefs(traits({ discipline: 100, rule_respect: 100 }), rng(1, 'p1'));
    expect(drawBeliefs(traits({ discipline: 100, rule_respect: 100 }), rng(1, 'p1'))).toEqual(a);
    for (const s of STANCES) expect(Math.abs(a[s.id]!)).toBeLessThanOrEqual(1);
    let hi = 0; let lo = 0;
    for (let i = 0; i < 200; i++) {
      hi += drawBeliefs(traits({ discipline: 100, rule_respect: 100 }), rng(i, 'pull'))['discipline']!;
      lo += drawBeliefs(traits({ discipline: 0, rule_respect: 0 }), rng(i, 'pull'))['discipline']!;
    }
    expect(hi).toBeGreaterThan(lo);
  });
});

describe('facts and params', () => {
  it('every stance cites a fact row and every row has a computed status', () => {
    const ids = new Set(INTERVIEW_FACTS.map((r) => r.id));
    for (const s of STANCES) expect(ids.has(s.fact)).toBe(true);
    for (const r of INTERVIEW_FACTS) expect(interviewFactStatus(r.id)).toBe(r.status);
  });
  it('params stay inside their bounds', () => {
    for (const p of PARAMS.params) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
  });
});

describe('graded work (Marlon 14:52: real interviews have graded parts, so the game does too)', () => {
  it('every role has graded tasks', () => {
    for (const [g, tasks] of Object.entries(PRACTICAL_TASKS)) expect(tasks.length, g).toBeGreaterThan(0);
  });

  it('more craft grades better on average, and the user\'s own results are used as given', () => {
    let hi = 0; let lo = 0;
    for (let i = 0; i < 300; i++) { hi += gradeAi(1, rng(i, 'g')); lo += gradeAi(-1, rng(i, 'g')); }
    expect(hi).toBeGreaterThan(lo);
    expect(practicalScore('head', { board_work: 1, game_management: 0.5 }, null, rng(1)).score).toBeCloseTo(0.75);
    expect(practicalScore('head', undefined, null, rng(1)).score).toBe(0);
  });

  it('with views equal, the better graded work wins the job', () => {
    const pool = [applicant(1, HARD, { craft: -1.5 }), applicant(2, HARD, { craft: 1.5 })];
    const out = runSearch({ opening: OC, panel: panel(HARD), pool, offer: () => true, stream: rng(9) });
    expect(out.hired).toBe(2);
    expect(out.interviewed.find((x) => x.personId === 2)!.practical).toBeGreaterThan(out.interviewed.find((x) => x.personId === 1)!.practical);
  });

  it('the user with the same answers and the same graded results as an AI candidate scores the same', () => {
    const qs = slate(OC, panel(HARD));
    const grades = { game_plan: 0.8, board_what_if: 0.6 };
    const ai = applicant(1, SOFT, { practical: grades });
    const user: Applicant = { personId: 2, beliefs: null, answers: answerAll(qs, SOFT), practical: grades, record: 0.5, tie: 0, referrals: [] };
    const out = runSearch({ opening: OC, panel: panel(HARD), pool: [ai, user], offer: () => false, stream: rng(5) });
    const [a, b] = [out.interviewed.find((x) => x.personId === 1)!, out.interviewed.find((x) => x.personId === 2)!];
    expect(a.practical).toBe(b.practical);
    expect(a.result.fit).toBeCloseTo(b.result.fit, 12);
  });
});
