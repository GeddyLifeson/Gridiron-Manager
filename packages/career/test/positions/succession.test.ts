// G-25 acceptance part 2: succession (X8.1.1, X8.3.1, X8.3.2), delegation (L4.1.1, L4.1.2), and
// vacancies cascading per X8.4.
import { describe, expect, it } from 'vitest';
import {
  applyStandIn, currentCallers, delegableTasks, exitCandidates, fillVacancy, firingCascade, followChance, headCoachTasks, keepChance,
  nameInterim, overdueSeats, param, poolFillDue, resolveSuccession, seat, setCaller, setNamedDeputy, standInCaller, taskOwners, vacateSeat,
  CATALOGUE, EVENT, type IncumbentView, type Staff,
} from '../../src/positions/index.ts';
import { D0, addDays, ctxFor, dayOf, filledStaff, fixedUniform, scripted, seatOf } from './fixtures.ts';
import { PROB_FLOOR } from '@gm/schema';

const META = { date: D0, competitionId: 1, tier: 1 as const, source: 'sim' as const };
const holder = (s: Staff, id: number) => seat(s, id).holderPersonId!;

describe('X8.1.1 succession grammar', () => {
  it('named deputy first, then the assistant head coach, then coordinators by years in chair', () => {
    const { staff, people } = filledStaff();
    const hc = seatOf(staff, 'pos:head_coach');
    const hcId = holder(staff, hc);
    const ahc = holder(staff, seatOf(staff, 'pos:assistant_head_coach'));
    const dc = holder(staff, seatOf(staff, 'pos:defensive_coordinator'));
    const withDeputy = setNamedDeputy(staff, hc, dc);
    expect(resolveSuccession(hc, ctxFor(withDeputy, people, [hcId]))).toMatchObject({ kind: 'inside', personId: dc, stepKind: 'named_deputy' });
    expect(resolveSuccession(hc, ctxFor(staff, people, [hcId]))).toMatchObject({ kind: 'inside', personId: ahc, stepKind: 'role' });
    // No assistant head coach available: the coordinator longest in his chair (seat filled earliest).
    const r = resolveSuccession(hc, ctxFor(staff, people, [hcId, ahc]));
    expect(r.kind === 'inside' && r.stepKind).toBe('role_group');
    const coords = staff.seats.filter((s) => s.positionId.endsWith('_coordinator') && s.rung === 7);
    const senior = coords.sort((a, b) => dayOf(a.holderSince!) - dayOf(b.holderSince!))[0]!;
    expect(r.kind === 'inside' && r.personId).toBe(senior.holderPersonId);
  });

  it('ties break by years on staff, then age (older first), then person id; two runs agree', () => {
    const { staff: s0, people } = filledStaff();
    const hc = seatOf(s0, 'pos:head_coach');
    const coords = s0.seats.filter((s) => s.rung === 7 && s.positionId.endsWith('_coordinator'));
    let staff = s0;
    for (const c of coords) staff = { ...staff, seats: staff.seats.map((x) => (x.seatId === c.seatId ? { ...x, holderSince: D0 } : x)) };
    const ids = coords.map((c) => c.holderPersonId!);
    for (const id of ids) people.set(id, { ...people.get(id)!, joinedStaffDay: dayOf(D0), bornDay: 100 });
    const absent = [holder(staff, hc), holder(staff, seatOf(staff, 'pos:assistant_head_coach'))];
    const a = resolveSuccession(hc, ctxFor(staff, people, absent));
    expect(a).toMatchObject({ kind: 'inside', personId: Math.min(...ids) });
    people.set(Math.max(...ids), { ...people.get(Math.max(...ids))!, bornDay: 50 });
    expect(resolveSuccession(hc, ctxFor(staff, people, absent))).toMatchObject({ personId: Math.max(...ids) });
    expect(resolveSuccession(hc, ctxFor(staff, people, absent))).toEqual(resolveSuccession(hc, ctxFor(staff, people, absent)));
  });

  it('a test staff with every step but the last empty still resolves; a fully ineligible staff reaches outside for a game chair', () => {
    const { staff, people } = filledStaff();
    const hc = seatOf(staff, 'pos:head_coach');
    const out = [holder(staff, hc), holder(staff, seatOf(staff, 'pos:assistant_head_coach')), ...staff.seats.filter((s) => s.rung === 7 && s.positionId.endsWith('_coordinator')).map((s) => s.holderPersonId!)];
    expect(resolveSuccession(hc, ctxFor(staff, people, out))).toMatchObject({ kind: 'inside', stepKind: 'appointer_pick' });
    const all = staff.seats.map((s) => s.holderPersonId!);
    expect(resolveSuccession(hc, ctxFor(staff, people, all))).toMatchObject({ kind: 'outside' });
    const oc = seatOf(staff, 'pos:offensive_coordinator');
    expect(resolveSuccession(oc, ctxFor(staff, people, all)).kind).toBe('outside');
  });

  it('skips suspended people, the absent deputy, and anyone whose own game chair would be left uncovered', () => {
    const { staff: s0, people } = filledStaff();
    const hc = seatOf(s0, 'pos:head_coach');
    const hcId = holder(s0, hc);
    const ahc = holder(s0, seatOf(s0, 'pos:assistant_head_coach'));
    people.set(ahc, { ...people.get(ahc)!, suspended: true });
    let r = resolveSuccession(hc, ctxFor(setNamedDeputy(s0, hc, hcId), people, [hcId]));
    expect(r.kind === 'inside' && r.personId).not.toBe(ahc);
    expect(r.kind === 'inside' && r.personId).not.toBe(hcId);
    // Special teams coordinator with nobody behind him: empty his whole chain so his chair cannot be covered.
    const stc = seatOf(s0, 'pos:special_teams_coordinator');
    const stcId = holder(s0, stc);
    const tiny: Staff = { ...s0, seats: s0.seats.filter((s) => [hc, stc].includes(s.seatId) || s.positionId === 'pos:athletic_director') };
    r = resolveSuccession(hc, ctxFor(tiny, people, [hcId]));
    expect(r.kind).toBe('outside');
    expect(r.kind === 'inside' && r.personId).not.toBe(stcId);
  });
});

describe('X8.3.1 interim head coach', () => {
  it('names an interim the same day, keeps his old seat, and labels the chair', () => {
    const { staff, people } = filledStaff();
    const hc = seatOf(staff, 'pos:head_coach');
    const vac = vacateSeat(staff, hc, D0);
    const ahc = holder(staff, seatOf(staff, 'pos:assistant_head_coach'));
    const r = nameInterim(hc, D0, ctxFor(vac, people), { appointerIsUser: false, stream: scripted([false]) });
    expect(r.holding).toBe('interim');
    expect(seat(r.staff, hc)).toMatchObject({ holderPersonId: ahc, holding: 'interim' });
    expect(seat(r.staff, seatOf(staff, 'pos:assistant_head_coach')).holderPersonId).toBe(ahc);
  });
  it('an AI appointer goes outside with the starting chance; the user appointer never draws', () => {
    const { staff, people } = filledStaff();
    const hc = seatOf(staff, 'pos:head_coach');
    const vac = vacateSeat(staff, hc, D0);
    expect(nameInterim(hc, D0, ctxFor(vac, people), { appointerIsUser: false, stream: scripted([true]) }).resolution.kind).toBe('outside');
    expect(nameInterim(hc, D0, ctxFor(vac, people), { appointerIsUser: true, stream: scripted([true]) }).resolution.kind).toBe('inside');
    expect(param('interim.outsideChance')).toBe(0.05);
  });
  it('a boss chair gets an acting holder; an owner never gets one', () => {
    const { staff, people } = filledStaff('pro');
    const gm = seatOf(staff, 'pos:general_manager');
    const r = nameInterim(gm, D0, ctxFor(vacateSeat(staff, gm, D0), people), { appointerIsUser: false, stream: scripted([false]) });
    expect(r.holding).toBe('acting');
    const owner = seatOf(staff, 'pos:owner');
    expect(nameInterim(owner, D0, ctxFor(vacateSeat(staff, owner, D0), people), { appointerIsUser: false, stream: scripted([false]) }).holding).toBeNull();
  });
});

describe('X8.3.2 absent play caller', () => {
  it('named deputy, else the head coach of that side, else the senior position coach; never one person on two sides', () => {
    const { staff, people } = filledStaff();
    const oc = seatOf(staff, 'pos:offensive_coordinator');
    const ocId = holder(staff, oc);
    const hcId = holder(staff, seatOf(staff, 'pos:head_coach'));
    const qb = holder(staff, seatOf(staff, 'pos:position_coach.qb'));
    expect(standInCaller('offense', ctxFor(setNamedDeputy(staff, oc, qb), people, [ocId]))).toMatchObject({ personId: qb, reason: 'named_deputy' });
    people.set(hcId, { ...people.get(hcId)!, cameUpOn: 'offense' });
    expect(standInCaller('offense', ctxFor(staff, people, [ocId]))).toMatchObject({ personId: hcId, reason: 'head_coach_side' });
    people.set(hcId, { ...people.get(hcId)!, cameUpOn: 'defense' });
    const s = standInCaller('offense', ctxFor(staff, people, [ocId]));
    expect(s.reason).toBe('senior_position_coach');
    const offenseCoaches = staff.seats.filter((x) => x.positionId.startsWith('pos:position_coach.') && x.side === 'offense');
    const senior = offenseCoaches.sort((a, b) => dayOf(a.holderSince!) - dayOf(b.holderSince!))[0]!;
    expect(s.personId).toBe(senior.holderPersonId);
    // The defensive caller is busy with defense; he is never picked for offense even as named deputy.
    const dcId = holder(staff, seatOf(staff, 'pos:defensive_coordinator'));
    expect(standInCaller('offense', ctxFor(setNamedDeputy(staff, oc, dcId), people, [ocId])).personId).not.toBe(dcId);
  });
  it('a mid-game loss of a coordinator produces a caller before the next snap', () => {
    const { staff, people } = filledStaff();
    const ocId = holder(staff, seatOf(staff, 'pos:offensive_coordinator'));
    const s = standInCaller('offense', ctxFor(staff, people, [ocId]));
    const next = applyStandIn(staff, 'offense', s);
    expect(holder(next, currentCallers(next).offense)).toBe(s.personId);
  });
});

describe('L4.1.1, L4.1.2 delegation: good staff means less work for the head coach', () => {
  it('every delegable task has exactly one owner; a full staff leaves the head coach no side to call', () => {
    const { staff } = filledStaff();
    const owners = taskOwners(staff);
    expect([...owners.keys()].sort()).toEqual([...delegableTasks(staff)]);
    expect(headCoachTasks(staff).filter((t) => t.startsWith('calling.'))).toEqual([]);
  });
  it('empty chairs push their tasks up to the head coach; more holes, more work', () => {
    const { staff } = filledStaff();
    const full = headCoachTasks(staff).length;
    const oc = seatOf(staff, 'pos:offensive_coordinator');
    const noOc = vacateSeat(staff, oc, D0);
    const tasks = headCoachTasks(noOc);
    expect(tasks).toContain('gameplan.offense');
    expect(tasks).toContain('calling.offense');
    expect(tasks.length).toBeGreaterThan(full);
    // A room with no coach goes to its coordinator, not the head coach.
    const qb = seatOf(staff, 'pos:position_coach.qb');
    expect(taskOwners(vacateSeat(staff, qb, D0)).get('room.qb')).toBe(oc);
  });
  it('the head coach may call a side himself or hand it to anyone (Marlon: coordinators call when delegated)', () => {
    const { staff } = filledStaff();
    const hc = seatOf(staff, 'pos:head_coach');
    expect(currentCallers(setCaller(staff, 'defense', hc)).defense).toBe(hc);
    const pgc = seatOf(staff, 'pos:pass_game_coordinator.offense');
    expect(currentCallers(setCaller(staff, 'offense', pgc)).offense).toBe(pgc);
  });
});

describe('X8.4.1 firing cascade', () => {
  const neutral: IncumbentView = { strongPositiveEdge: false, negativeEdge: false, unitTopQuarter: false, sameSchemeFamily: false, requiredByAppointer: false };
  it('keep chances are the X8.4.1 base values with adjustments, clamped to 95 percent', () => {
    expect(keepChance('coordinator', neutral)).toBeCloseTo(0.15);
    expect(keepChance('graduate_assistant', neutral)).toBeCloseTo(0.5);
    expect(keepChance('coordinator', { ...neutral, strongPositiveEdge: true, unitTopQuarter: true, sameSchemeFamily: true })).toBeCloseTo(0.75);
    expect(keepChance('graduate_assistant', { ...neutral, strongPositiveEdge: true, unitTopQuarter: true })).toBeCloseTo(0.95);
    expect(keepChance('position_coach', { ...neutral, negativeEdge: true })).toBe(PROB_FLOOR);
    expect(keepChance('position_coach', { ...neutral, requiredByAppointer: true })).toBe(1 - PROB_FLOOR);
  });
  it('after a change every staff member gets exactly one outcome within 30 days; brought people take their chairs', () => {
    const { staff: s0 } = filledStaff();
    const hc = seatOf(s0, 'pos:head_coach');
    const staff = vacateSeat(s0, hc, D0);
    const newHc = 9999;
    const oc = seatOf(staff, 'pos:offensive_coordinator');
    const dc = seatOf(staff, 'pos:defensive_coordinator');
    const keepMe = holder(staff, seatOf(staff, 'pos:position_coach.ol'));
    const res = firingCascade({
      staff, newHeadCoachId: newHc, reviewStart: D0, addDays, meta: META,
      bring: [{ seatId: oc, personId: 8001, accepted: true }, { seatId: dc, personId: 8002, accepted: false }],
      view: (p) => ({ ...neutral, requiredByAppointer: p === keepMe }),
      stream: (scope) => fixedUniform(scope[1] === dc ? 0.01 : 0.99),
    });
    const before = new Set(staff.seats.filter((s) => s.holderPersonId !== null && !['none', 'head_coach'].includes(CATALOGUE.position(s.positionId).cascadeKind)).map((s) => s.holderPersonId));
    const outcomes = new Map<number, string[]>();
    for (const e of res.events) for (const a of e.actors) outcomes.set(a.personId, [...(outcomes.get(a.personId) ?? []), e.type]);
    for (const p of before) expect(outcomes.get(p!), `person ${p}`).toHaveLength(1);
    expect(holder(res.staff, oc)).toBe(8001);
    expect(outcomes.get(keepMe)).toEqual([EVENT.retained]);
    expect(holder(res.staff, dc)).toBe(holder(staff, dc)); // drew 0.01 against 15 percent: kept
    for (const d of res.decisions) expect(dayOf(d.decideBy) - dayOf(D0)).toBeLessThanOrEqual(30);
    expect(res.decisions.find((d) => d.seatId === dc)!.decideBy).toEqual(addDays(D0, 14));
    // Everything not kept or brought is open and goes to vacancy filling.
    expect(res.openSeatIds.every((id) => seat(res.staff, id).holderPersonId === null)).toBe(true);
    expect(res.openSeatIds.length).toBeGreaterThan(0);
  });
  it('a move keeps an incumbent in a new chair with one retained line; two runs of one seed agree', () => {
    const { staff } = filledStaff();
    const qbSeat = seatOf(staff, 'pos:position_coach.qb');
    const qb = holder(staff, qbSeat);
    const oc = seatOf(staff, 'pos:offensive_coordinator');
    const run = () => firingCascade({ staff, newHeadCoachId: 9999, reviewStart: D0, addDays, meta: META, bring: [], moves: [{ personId: qb, toSeatId: oc }], view: () => neutral, stream: (sc) => fixedUniform(((Number(sc[1]) * 37) % 100) / 100) });
    const a = run();
    expect(holder(a.staff, oc)).toBe(qb);
    expect(a.events.filter((e) => e.actors[0]?.personId === qb).map((e) => e.type)).toEqual([EVENT.retained]);
    expect(run()).toEqual(a);
  });
  it('follow offers and exit candidates use the starting values', () => {
    expect(followChance(5, 7)).toBe(0.6);
    expect(followChance(7, 5)).toBe(0.3);
    expect(exitCandidates([{ personId: 1, releasedDay: 0 }, { personId: 2, releasedDay: 300 }], 365, () => false)).toEqual([1]);
  });
});

describe('X8.4.2 vacancies cascade down the chart', () => {
  it('a promotion empties the promoted person\'s chair, which is decided next, until a chair is posted', () => {
    const { staff: s0 } = filledStaff();
    const oc = seatOf(s0, 'pos:offensive_coordinator');
    const qbSeat = seatOf(s0, 'pos:position_coach.qb');
    const qb = holder(s0, qbSeat);
    const ga = s0.seats.find((s) => s.positionId === 'pos:graduate_assistant' && s.positionGroup === 'QB')!;
    const staff = vacateSeat(s0, oc, D0);
    const res = fillVacancy(staff, oc, D0, (_s, id) => (id === oc ? { kind: 'promote', personId: qb } : id === qbSeat ? { kind: 'promote', personId: ga.holderPersonId! } : { kind: 'post' }), META);
    expect(holder(res.staff, oc)).toBe(qb);
    expect(holder(res.staff, qbSeat)).toBe(ga.holderPersonId);
    expect(res.posted).toEqual([ga.seatId]);
    expect(res.events.map((e) => e.type)).toEqual([EVENT.promoted, EVENT.promoted, EVENT.opened]);
  });
  it('a title on top (rung 6) does not empty the holder\'s room', () => {
    const { staff: s0 } = filledStaff();
    const pgc = seatOf(s0, 'pos:pass_game_coordinator.offense');
    const wrSeat = seatOf(s0, 'pos:position_coach.wr');
    const wr = holder(s0, wrSeat);
    const res = fillVacancy(vacateSeat(s0, pgc, D0), pgc, D0, () => ({ kind: 'promote', personId: wr }), META);
    expect(holder(res.staff, pgc)).toBe(wr);
    expect(holder(res.staff, wrSeat)).toBe(wr);
    expect(res.posted).toEqual([]);
  });
  it('low chairs fill from the pool after the starting weeks; chairs open past the bound are flagged', () => {
    const { staff: s0 } = filledStaff();
    const ga = seatOf(s0, 'pos:graduate_assistant');
    const oc = seatOf(s0, 'pos:offensive_coordinator');
    let staff = vacateSeat(s0, ga, D0);
    staff = vacateSeat(staff, oc, D0);
    expect(poolFillDue(staff, ga, dayOf(addDays(D0, 20)), dayOf)).toBe(false);
    expect(poolFillDue(staff, ga, dayOf(addDays(D0, 21)), dayOf)).toBe(true);
    expect(poolFillDue(staff, oc, dayOf(addDays(D0, 100)), dayOf)).toBe(false);
    expect(overdueSeats(staff, dayOf(addDays(D0, 61)), dayOf)).toEqual([ga, oc].sort((a, b) => a - b));
    expect(overdueSeats(staff, dayOf(addDays(D0, 60)), dayOf)).toEqual([]);
  });
});
