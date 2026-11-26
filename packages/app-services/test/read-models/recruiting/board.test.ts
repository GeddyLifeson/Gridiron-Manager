// Recruiting board (O7.5.1, T4): observed grades only (MA-48), a read model that never changes the state or
// shows truth, acts that warn with the rule named and log exactly one violation (O7.5.1 acceptance, L8.2.5),
// ownership by seat (S3, T4.6.1), the contact calendar, the area and the portal.
import { describe, expect, it } from 'vitest';
import { recruiting } from '@gm/league';
import { buildRecruitingBoardView, gradeView, confidenceOf, PARAMS, type RecruitingBoardInput } from '../../../src/read-models/recruiting/index.ts';
import { act, hostVisit, offer, queue, setUserGrade, watchFilm, withdraw, type RecruitingCommandContext } from '../../../src/commands/recruiting/index.ts';
import { D, HEAD_COACH, NAMES, USER_STAFF, USER_TEAM, world, type World } from './fixture.ts';

const DAY = D('2026-05-06');
const ALL = { evaluate: 'do_it', contact: 'do_it', visit: 'do_it', offer: 'do_it', plan: 'do_it' } as const;

function input(w: World, over: Partial<RecruitingBoardInput> = {}): RecruitingBoardInput {
  return {
    state: w.state, ctx: w.ctx, teamId: USER_TEAM, staffId: USER_STAFF, party: w.hook.party(USER_STAFF, USER_TEAM),
    day: DAY, classYear: 2027, rights: ALL, names: NAMES, ...over,
  };
}
function cmd(w: World, over: Partial<RecruitingCommandContext> = {}): RecruitingCommandContext {
  return {
    state: w.state, ctx: w.ctx, hook: w.hook, teamId: USER_TEAM, staffId: USER_STAFF, day: DAY, rights: ALL,
    evaluationSkill: 0.6, competition: () => 0.8, isPositionCoach: () => true, ...over,
  };
}
const top = (w: World, n = 0) => Object.values(w.state.prospects).filter((p) => p.classYear === 2027).sort((a, b) => (a.publicRank ?? 1e9) - (b.publicRank ?? 1e9))[n]!.personId;

const W = world();

describe('observed grades only (MA-48)', () => {
  it('an unwatched prospect shows no grade, only public facts', () => {
    const w = world();
    const id = top(w, 3);
    delete w.state.boards[USER_TEAM]?.grades[id];
    const v = buildRecruitingBoardView(input(w, { list: 'pool' }));
    const r = v.rows.find((x) => x.personId === id)!;
    expect(r.grade).toBeNull();
    expect(r.publicStars).toBeGreaterThan(0);
  });
  it('after watching film the grade carries grader, date, amount watched and confidence in words', () => {
    const w = world();
    const id = top(w, 2);
    const res = watchFilm(cmd(w), id, 'full_film');
    expect(res.ok && res.kind === 'done' && res.hours).toBe(recruiting.hoursOf('full_film'));
    const r = buildRecruitingBoardView(input(w)).rows.find((x) => x.personId === id)!;
    expect(r.grade).not.toBeNull();
    expect(r.grade!.grader).toBe('position_coach');
    expect(r.grade!.lastLookDay).toBe(DAY);
    expect(r.grade!.looks).toContainEqual({ kind: 'full_film', count: 1 });
    expect(['firm', 'fair', 'thin']).toContain(r.grade!.confidence);
    expect(Number.isInteger(r.grade!.value)).toBe(true);
  });
  it("a high school coach's word alone is not watching", () => {
    const g: recruiting.BoardGrade = { mean: 50, band: { production: 10, athletic: 10, measurables: 10, character: 5 }, looks: { hs_coach_word: 2 }, setBy: 'first_pass', measured: null, userGrade: null };
    expect(gradeView(g)).toBeNull();
    expect(gradeView({ ...g, looks: { live: 1 } })).not.toBeNull();
  });
  it('confidence words narrow with the band', () => {
    const prior = recruiting.P('grade.priorHalfWidth');
    expect(confidenceOf({ a: prior })).toBe('thin');
    expect(confidenceOf({ a: prior * 0.5 })).toBe('fair');
    expect(confidenceOf({ a: prior * 0.2 })).toBe('firm');
  });
  it('the user may store his own grade only for a watched prospect', () => {
    const w = world();
    const id = top(w, 5);
    delete w.state.boards[USER_TEAM]?.grades[id];
    expect(setUserGrade(cmd(w), id, 70)).toMatchObject({ ok: false, rule: 'MA-48' });
    watchFilm(cmd(w), id, 'first_pass_film');
    expect(setUserGrade(cmd(w), id, 70)).toMatchObject({ ok: true, grade: 70 });
  });
});

describe('the read model is a pure observer (K9.1.1)', () => {
  it('building the view leaves the state unchanged', () => {
    const before = JSON.stringify(W.state);
    buildRecruitingBoardView(input(W));
    buildRecruitingBoardView(input(W, { list: 'pool' }));
    expect(JSON.stringify(W.state)).toBe(before);
  });
  it('no truth field name appears anywhere in the view', () => {
    const json = JSON.stringify(buildRecruitingBoardView(input(W, { list: 'pool' })));
    for (const f of recruiting.TRUTH_FIELDS) {
      const key = f.split('.').pop()!;
      expect(json.includes(`"${key}"`), f).toBe(false);
    }
    expect(json.includes('"impression"')).toBe(false);
  });
  it('every parameter is a named assumption with a test constraint', () => {
    for (const p of PARAMS.params) { expect(p.basis).toBe('assumption'); expect(p.constrainedBy).toMatch(/test/); }
  });
});

describe('acts warn with the rule named and log exactly one violation (O7.5.1 acceptance)', () => {
  it('an off-campus contact in May for the 2027 class names the rules it breaks and stays offered', () => {
    const r = buildRecruitingBoardView(input(W, { list: 'pool' })).rows[0]!;
    const a = r.actions.find((x) => x.kind === 'contact_off_campus')!;
    expect(a.breaches).toEqual(expect.arrayContaining(['contact_out_of_period', 'contact_before_start_date']));
    expect(a.warning).not.toBeNull();
    expect(a.button).toBe('do_it');
    expect(a.hours).toBe(recruiting.hoursOf('contact_off_campus'));
    expect(r.nextContactDay === null || r.nextContactDay > DAY).toBe(true);
  });
  it('the command warns first, then logs one row when the user goes ahead', () => {
    const w = world();
    const id = top(w, 7);
    const before = w.state.violations.length;
    const first = act(cmd(w), 'contact_off_campus', id);
    expect(first).toMatchObject({ ok: false, kind: 'warning' });
    expect(w.state.violations.length).toBe(before);
    const second = act(cmd(w), 'contact_off_campus', id, { goAhead: true });
    expect(second.ok && second.kind === 'done' && second.logId).not.toBeNull();
    expect(w.state.violations.length).toBe(before + 1);
    const v = buildRecruitingBoardView(input(w));
    expect(v.violations.filter((x) => x.prospect === NAMES.person(id))).toHaveLength(1);
    expect(v.violations[0]!.rules).toContain('contact_out_of_period');
  });
  it('an act inside the rules is taken without a warning', () => {
    const w = world();
    const id = top(w, 8);
    const res = act(cmd(w), 'evaluation', id);
    expect(res).toMatchObject({ ok: true, kind: 'done', logId: null });
    expect(buildRecruitingBoardView(input(w)).rows.find((x) => x.personId === id)!.grade!.looks).toContainEqual({ kind: 'live', count: 1 });
  });
  it('an unofficial visit in the evaluation period is allowed', () => {
    const w = world();
    expect(hostVisit(cmd(w), top(w, 9), { kind: 'unofficial' })).toMatchObject({ ok: true, kind: 'done' });
  });
});

describe('ownership by seat (S3, T4.6.1)', () => {
  it('a position coach suggests offers; the head coach makes them', () => {
    const w = world();
    const id = top(w, 1);
    const assistant = cmd(w, { rights: { ...ALL, offer: 'suggest' } });
    const s = offer(assistant, id, false);
    expect(s).toMatchObject({ ok: true, kind: 'request', request: { verb: 'offer', prospectId: id, askedBy: USER_STAFF } });
    expect(recruiting.activeOffer(w.state, id, USER_TEAM)).toBeUndefined();
    const hc = cmd(w, { staffId: HEAD_COACH });
    expect(offer(hc, id, true)).toMatchObject({ ok: true, kind: 'done' });
    const r = buildRecruitingBoardView(input(w, { list: 'offered' })).rows.find((x) => x.personId === id)!;
    expect(r.ourOffer).toMatchObject({ day: DAY, committable: true });
    expect(withdraw(hc, id, 'head_coach_call', 'chosen')).toMatchObject({ ok: true });
  });
  it('a verb outside the job is refused, and its acts are not listed', () => {
    const w = world();
    const none = cmd(w, { rights: { evaluate: 'do_it' } });
    expect(act(none, 'call', top(w))).toMatchObject({ ok: false, kind: 'refused', rule: 'S3' });
    const v = buildRecruitingBoardView(input(w, { rights: { evaluate: 'do_it' }, list: 'pool' }));
    expect(v.rows[0]!.actions.map((a) => a.verb).every((x) => x === 'evaluate')).toBe(true);
    expect(v.rights.offer).toBe('none');
  });
});

describe('board, pool, calendar, numbers, area and portal', () => {
  it('the pool holds no one on our board; the board lists watched prospects by our grade first', () => {
    const w = world();
    queue(cmd(w), top(w, 4));
    watchFilm(cmd(w), top(w, 6), 'full_film');
    const board = buildRecruitingBoardView(input(w));
    const pool = buildRecruitingBoardView(input(w, { list: 'pool' }));
    const boardIds = new Set(board.rows.map((r) => r.personId));
    expect(pool.rows.some((r) => boardIds.has(r.personId))).toBe(false);
    expect(boardIds.has(top(w, 4))).toBe(true);
    const graded = board.rows.filter((r) => r.grade);
    for (let i = 1; i < graded.length; i++) expect(w.state.boards[USER_TEAM]!.grades[graded[i - 1]!.personId]!.mean).toBeGreaterThanOrEqual(w.state.boards[USER_TEAM]!.grades[graded[i]!.personId]!.mean);
    expect(board.rows.findIndex((r) => !r.grade)).toBeGreaterThanOrEqual(graded.length === board.rows.length ? -1 : graded.length);
    expect(board.counts.watched).toBe(graded.length);
  });
  it('filters by position and region; the row limit keeps the total', () => {
    const v = buildRecruitingBoardView(input(W, { list: 'pool', filter: { position: 'OL' } }));
    expect(v.rows.every((r) => r.position === 'OL')).toBe(true);
    const all = buildRecruitingBoardView(input(W, { list: 'pool' }));
    expect(all.rows.length).toBeLessThanOrEqual(PARAMS.params.find((p) => p.name === 'recruitingBoard.rowsMax')!.value);
    expect(all.total).toBeGreaterThanOrEqual(all.rows.length);
  });
  it('the calendar covers the window in contiguous stretches with the signing dates', () => {
    const c = buildRecruitingBoardView(input(W)).calendar;
    expect(c.stretches[0]!.from).toBe(DAY);
    expect(c.stretches[c.stretches.length - 1]!.to).toBe(c.to);
    for (let i = 1; i < c.stretches.length; i++) expect(c.stretches[i]!.from).toBe(c.stretches[i - 1]!.to + 1);
    expect(c.stretches.some((s) => s.period === 'evaluation')).toBe(true);
    expect(c.signing.february).not.toBeNull();
  });
  it('the numbers board counts by position', () => {
    const n = buildRecruitingBoardView(input(W)).numbers;
    expect(n.rows.length).toBe(recruiting.POSITION_GROUPS.length);
    expect(n.limit).toBe(105);
  });
  it('the area lists only the assigned regions', () => {
    const v = buildRecruitingBoardView(input(W, { area: ['TX', 'FL'] }));
    expect(v.area.map((a) => a.region).sort()).toEqual(['FL', 'TX']);
    expect(v.area.every((a) => a.prospects >= a.graded)).toBe(true);
  });
  it('the portal says when it has no data, and shows the window and entries when the world gives them', () => {
    expect(buildRecruitingBoardView(input(W)).portal).toMatchObject({ available: false, rows: [] });
    const p = buildRecruitingBoardView(input(W, { portal: { window: { open: DAY - 3, close: DAY + 10 }, entries: [{ personId: 5, position: 'DB', fromTeamId: 4, enteredDay: DAY - 1 }] } })).portal;
    expect(p).toMatchObject({ available: true, openNow: true, rows: [{ personId: 5, fromTeam: 'Team 4' }] });
  });
});
