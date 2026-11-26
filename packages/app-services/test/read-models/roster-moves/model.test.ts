// G-70 acceptance: the weekly roster cycle and the active list done on screen within the rules
// (H6.1.1, H6.1.2, H6.2.1, H6.2.3, H6.3.1, M2.1.4).
import { describe, expect, it } from 'vitest';
import { roster } from '@gm/league';
import { buildRosterMovesView, type RosterMovesInput } from '../../../src/read-models/roster-moves/index.ts';
import { fileMove, pressCase, setActive, setEmergencyQb, submitList, tagForWarmup, type MoveContext } from '../../../src/commands/roster-moves/index.ts';
import { at, CLUB, COACH_POWER, COLLEGE, depth, GM_POWER, inSeason, OL, PRACTICE_SQUAD, PRO, QB, ROSTER, SIDE, weekOf } from './fixture.ts';

function input(state: roster.LeagueRosters, over: Partial<RosterMovesInput> = {}): RosterMovesInput {
  return {
    clubId: CLUB, state, rules: PRO, sideSize: SIDE, week: weekOf(state), power: COACH_POWER,
    cards: ROSTER.map((id) => ({ personId: id, name: `Player ${id}`, position: OL.includes(id) ? 'OL' : QB.includes(id) ? 'QB' : 'X' })),
    designations: {}, depth: depth(), working: null, ...over,
  };
}
const ctxOf = (state: roster.LeagueRosters, over: Partial<MoveContext> = {}): MoveContext => ({ clubId: CLUB, state, rules: PRO, power: COACH_POWER, week: weekOf(state), ...over });
const final = (over = {}) => ({ depth: depth(), sideSize: SIDE, designations: {}, confirmedGaps: [] as string[], ...over });

const S = inSeason();

describe('the active list (H6.2.1)', () => {
  const view = buildRosterMovesView(input(S));
  const a = view.active!;
  it('the staff draft is a legal 48 with eight offensive linemen and five inactives', () => {
    expect(a.count).toBe(48);
    expect(a.limit).toBe(48);
    expect(a.linemenActive).toBeGreaterThanOrEqual(8);
    expect(a.refusal).toBeNull();
    expect(a.inactives).toHaveLength(5);
    expect(a.redGaps).toEqual([]);
  });
  it('every special teams unit can field 11 named actives in the staff draft (acceptance 3)', () => {
    expect(view.units.map((u) => [u.unitId, u.named, u.level])).toEqual(view.units.map((u) => [u.unitId, SIDE, 'ok']));
  });
  it('a 49th active is refused by the league check (acceptance 1)', () => {
    const extra = a.inactives[0]!;
    const list = setActive(ctxOf(S), { clubId: CLUB, actives: a.actives, emergencyQb: null }, extra, true);
    if ('ok' in list) throw new Error('setActive refused');
    const v = buildRosterMovesView(input(S, { working: list })).active!;
    expect(v.count).toBe(49);
    expect(v.refusal?.rule).toBe('C5.2.1');
    expect(submitList(ctxOf(S), list, final())).toMatchObject({ ok: false, rule: 'C5.2.1' });
  });
  it('with seven offensive linemen dressed the limit is 47 and 48 is refused', () => {
    const sitOl = a.actives.filter((id) => OL.includes(id)).slice(7);
    const nonOl = a.inactives.filter((id) => !OL.includes(id));
    const actives = [...a.actives.filter((id) => !sitOl.includes(id)), ...nonOl.slice(0, sitOl.length)].slice(0, 48);
    const v = buildRosterMovesView(input(S, { working: { clubId: CLUB, actives, emergencyQb: null } })).active!;
    expect(v.linemenActive).toBe(7);
    expect(v.limit).toBe(47);
    expect(v.refusal?.message).toMatch(/limit is 47/);
  });
  it('a missing backup is amber; a missing starter is red and blocks submitting until confirmed by name (acceptance 2)', () => {
    const noBackup = a.actives.filter((id) => id !== 14);
    const v1 = buildRosterMovesView(input(S, { working: { clubId: CLUB, actives: noBackup, emergencyQb: null } }));
    expect(v1.coverage.find((c) => c.role === 'rb')).toMatchObject({ starter: 13, backup: null, level: 'amber' });
    expect(v1.active!.amberGaps).toContain('off:base/rb');

    const noBack = noBackup.filter((id) => id !== 13);
    const v2 = buildRosterMovesView(input(S, { working: { clubId: CLUB, actives: noBack, emergencyQb: null } }));
    expect(v2.coverage.find((c) => c.role === 'rb')!.level).toBe('red');
    expect(v2.active!.redGaps).toContain('off:base/rb');
    const list = { clubId: CLUB, actives: noBack, emergencyQb: null };
    expect(submitList(ctxOf(S), list, final())).toMatchObject({ ok: false, rule: 'H6.2.1' });
    const red = v2.active!.redGaps;
    expect(submitList(ctxOf(S), list, final({ confirmedGaps: red }))).toMatchObject({ ok: true });
  });
  it('a special teams unit one short is red', () => {
    const v = buildRosterMovesView(input(S, { working: { clubId: CLUB, actives: a.actives.filter((id) => id !== 45), emergencyQb: null } }));
    expect(v.units.find((u) => u.unitId === 'st:kickoff')).toMatchObject({ named: 10, level: 'red' });
    expect(v.active!.redGaps.some((g) => g.startsWith('st:kickoff '))).toBe(true);
  });
  it('a player listed out is left inactive by the staff, and the next man covers his special teams job', () => {
    const v = buildRosterMovesView(input(S, { designations: { 48: 'out' } }));
    expect(v.active!.staffDraft).not.toContain(48);
    expect(v.active!.staffDraft).toContain(51);
    expect(v.units.find((u) => u.unitId === 'st:kickoff')!.level).toBe('ok');
  });
  it('a player listed out can still be dressed: warned in the view and logged as a breakable act on submit', () => {
    const list = { clubId: CLUB, actives: [...a.actives.filter((id) => id !== 52), 53].slice(0, 48), emergencyQb: null };
    const actives = list.actives.includes(48) ? list.actives : [...list.actives.slice(0, 47), 48];
    const v = buildRosterMovesView(input(S, { designations: { 48: 'out' }, working: { ...list, actives } }));
    expect(v.active!.outDressed).toEqual([48]);
    const r = submitList(ctxOf(S), { ...list, actives }, final({ designations: { 48: 'out' }, confirmedGaps: v.active!.redGaps }));
    expect(r).toMatchObject({ ok: true, breakable: [{ rule: 'L8.2.1', personId: 48 }] });
  });
  it('the inactive count is always the candidates minus the actives (H6.2.3 rule 2)', () => {
    expect(a.inactives.length).toBe(53 - a.count);
  });
  it('the emergency third quarterback is offered with three quarterbacks and checked by C5.2.2', () => {
    expect(a.emergencyQbOffered).toBe(true);
    const base = { clubId: CLUB, actives: a.actives.filter((id) => id !== 12), emergencyQb: null };
    const named = setEmergencyQb(ctxOf(S), base, 12);
    if ('ok' in named) throw new Error('refused');
    expect(named.emergencyQb).toBe(12);
    expect(setEmergencyQb(ctxOf(S), base, 13)).toMatchObject({ ok: false, rule: 'C5.2.2' });
  });
});

describe('the lock (H6.2.3)', () => {
  const week = weekOf(S);
  const late = at(S, { dayIndex: week.kickoff.dayIndex, hour: week.kickoff.hour - 1 });
  const lateCtx = ctxOf(late, { week });
  const v = buildRosterMovesView(input(late, { week }));
  it('locks 90 minutes before kickoff (rule key) and accepts no edit after', () => {
    expect(v.active!.locked).toBe(true);
    expect(v.active!.minutesToLock).toBe(0);
    expect(setActive(lateCtx, { clubId: CLUB, actives: [], emergencyQb: null }, 1, true)).toMatchObject({ ok: false, rule: 'H6.2.3' });
    expect(submitList(lateCtx, { clubId: CLUB, actives: v.active!.actives, emergencyQb: null }, final())).toMatchObject({ ok: false, rule: 'H6.2.3' });
  });
  it('shows the minutes to the lock before it', () => {
    const early = buildRosterMovesView(input(S)).active!;
    expect(early.locked).toBe(false);
    expect(early.minutesToLock).toBe((5 * 24 + 3) * 60 - 90);
  });
  it('at most three players may be decided at warm-up', () => {
    let tags: number[] = [];
    for (const id of [20, 21, 22]) { const r = tagForWarmup(tags, id); if ('ok' in r) throw new Error('refused'); tags = r; }
    expect(tagForWarmup(tags, 23)).toMatchObject({ ok: false, rule: 'H6.2.3' });
  });
});

describe('the weekly roster strip (H6.1.1)', () => {
  const view = buildRosterMovesView(input(S));
  it('a normal week has every marker, ordered by deadline, each opening its screen', () => {
    expect(view.markers.map((m) => m.type).sort()).toEqual(['elevations_revert', 'inactives', 'injury_review', 'last_transactions', 'protections', 'tryouts']);
    const deadlines = view.markers.map((m) => m.deadlineHour);
    expect(deadlines).toEqual([...deadlines].sort((x, y) => x - y));
    expect(view.markers.find((m) => m.type === 'inactives')).toMatchObject({ target: 'active_list', button: 'do_it' });
    expect(view.markers.find((m) => m.type === 'last_transactions')!.target).toBe('elevations');
  });
  it('markers turn amber within 24 game hours and red within 2', () => {
    const week = weekOf(S);
    const last = view.markers.find((m) => m.type === 'last_transactions')!;
    const amber = at(S, roster.fromAbsHour(last.deadlineHour - 10));
    expect(buildRosterMovesView(input(amber, { week })).markers.find((m) => m.type === 'last_transactions')!.status).toBe('amber');
    const red = at(S, roster.fromAbsHour(last.deadlineHour - 1));
    expect(buildRosterMovesView(input(red, { week })).markers.find((m) => m.type === 'last_transactions')!.status).toBe('red');
  });
  it('a short week drops the tryout marker; a bye week has none', () => {
    const short = { ...weekOf(S, 2), previousGameDay: S.now.dayIndex - 1 };
    expect(buildRosterMovesView(input(S, { week: short })).markers.map((m) => m.type)).not.toContain('tryouts');
    expect(buildRosterMovesView(input(S, { week: null })).markers).toEqual([]);
  });
});

describe('who decides (H6.1.2)', () => {
  it('the same move is "Do it" in a final-say job and "Ask" where the general manager holds it (acceptance 4)', () => {
    const coach = buildRosterMovesView(input(S)).buttons;
    const gm = buildRosterMovesView(input(S, { power: GM_POWER })).buttons;
    expect(Object.values(coach).every((b) => b === 'do_it')).toBe(true);
    expect(gm.release).toBe('ask');
    expect(gm.sign_free_agent).toBe('ask');
    expect(gm.game_day_list).toBe('do_it');
    expect(gm.elevate).toBe('do_it');
  });
  it('a contract clause moves a single move type', () => {
    const v = buildRosterMovesView(input(S, { power: { arrangement: 'gm_final_say', clauses: { release: 'coach', game_day_list: 'joint' } } }));
    expect(v.buttons.release).toBe('do_it');
    expect(v.buttons.game_day_list).toBe('ask');
  });
  it('no move is filed without the decider check: a held move files, a move he lacks becomes a request', () => {
    const filed = fileMove(ctxOf(S), { type: 'release', clubId: CLUB, personId: 53 }, 900);
    expect(filed).toMatchObject({ ok: true, kind: 'filed' });
    const asked = fileMove(ctxOf(S, { power: GM_POWER }), { type: 'release', clubId: CLUB, personId: 53 }, 900);
    expect(asked).toMatchObject({ ok: true, kind: 'request', request: { decider: 'gm', answer: 'pending', pressed: false, askedBy: 900 } });
    expect(fileMove(ctxOf(S), { type: 'release', clubId: 2, personId: 53 }, 900)).toMatchObject({ ok: false });
  });
  it('the case may be pressed once', () => {
    const asked = fileMove(ctxOf(S, { power: GM_POWER }), { type: 'release', clubId: CLUB, personId: 53 }, 900);
    if (!asked.ok || asked.kind !== 'request') throw new Error('expected a request');
    const pressed = pressCase({ ...asked.request, answer: 'refused', reason: 'gm.reason.value' });
    if ('ok' in pressed) throw new Error('refused');
    expect(pressed.pressed).toBe(true);
    expect(pressCase(pressed)).toMatchObject({ ok: false, rule: 'H6.1.2' });
  });
  it('the list is not submitted by a coach who does not hold it', () => {
    const a = buildRosterMovesView(input(S)).active!;
    const ctx = ctxOf(S, { power: { arrangement: 'gm_final_say', clauses: { game_day_list: 'gm' } } });
    expect(submitList(ctx, { clubId: CLUB, actives: a.actives, emergencyQb: null }, final())).toMatchObject({ ok: false, rule: 'H6.1.2' });
  });
});

describe('elevations (H6.3.1)', () => {
  const elevate = (s: roster.LeagueRosters, id: number) => {
    const r = fileMove(ctxOf(s), { type: 'elevate', clubId: CLUB, personId: id }, 900);
    if (!r.ok || r.kind !== 'filed') throw new Error(`elevation refused: ${JSON.stringify(r)}`);
    return r.result.state;
  };
  it('lists the practice squad with elevations left; a third elevation in one game is refused (acceptance 1)', () => {
    const v0 = buildRosterMovesView(input(S));
    expect(v0.elevations!.rows.map((r) => r.personId)).toEqual(PRACTICE_SQUAD);
    expect(v0.elevations!.rows.every((r) => r.left === 3 && r.blocked === null)).toBe(true);
    const s2 = elevate(elevate(S, 101), 102);
    const v2 = buildRosterMovesView(input(s2));
    expect(v2.elevations!.usedThisGame).toBe(2);
    expect(v2.elevations!.rows.find((r) => r.personId === 103)!.blocked).toMatch(/elevat/);
    expect(fileMove(ctxOf(s2), { type: 'elevate', clubId: CLUB, personId: 103 }, 900)).toMatchObject({ ok: false, rule: 'C5.3.2' });
  });
  it('the roster count for the active list rises by the elevations (acceptance 3): elevated players are candidates', () => {
    const s2 = elevate(elevate(S, 101), 102);
    const v = buildRosterMovesView(input(s2));
    expect(v.players.filter((p) => p.candidate)).toHaveLength(55);
    expect(v.players.find((p) => p.personId === 101)).toMatchObject({ elevated: true, candidate: true });
    expect(v.active!.count + v.active!.inactives.length).toBe(55);
  });
  it('a player at his season limit is greyed with the league message (acceptance 2)', () => {
    const s = structuredClone(S) as roster.LeagueRosters;
    const club = s.clubs.find((c) => c.clubId === CLUB)!;
    (club.entries.find((e) => e.personId === 104) as { elevationsThisSeason: number }).elevationsThisSeason = 3;
    const row = buildRosterMovesView(input(s)).elevations!.rows.find((r) => r.personId === 104)!;
    expect(row.left).toBe(0);
    expect(row.blocked).toMatch(/sign|all 3/);
  });
});

describe('a level without game-day limits or practice squad (H6.6.1)', () => {
  it('shows a dress list only: no active-list limit, no elevations', () => {
    const s = inSeason(COLLEGE);
    const v = buildRosterMovesView(input(s, { rules: COLLEGE }));
    expect(v.hasGameDayLimit).toBe(false);
    expect(v.hasPracticeSquad).toBe(false);
    expect(v.active).toBeNull();
    expect(v.elevations).toBeNull();
    expect(v.markers.map((m) => m.type)).not.toContain('protections');
  });
});
