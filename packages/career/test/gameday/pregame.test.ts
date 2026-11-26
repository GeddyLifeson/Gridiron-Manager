// I1 before kickoff: timeline and locks (I1.1.1), roster (I1.2), conditions (I1.3), plan edits (I1.4).
import { describe, it, expect } from 'vitest';
import {
  startPregame, doTask, advanceTo, advanceToNextDeadline, runToKickoff, delayKickoff, holdOffField, changeCaptainsAfterLock, weatherClockMin, canAct, delegate,
  workout, checkActiveList, activeLimit, thinSpots, staffActiveList, checkEmergencyQb, emergencyQbMayEnter, emergencyQbMustLeave, playCallableWithEmergencyQb,
  checkRadio, defensiveRadioForSnap, radioPackageWarnings, buildDepthCard, chains, slotsWithoutBackup, nextUp,
  windForecastSe, forecastWind, kickingLines, kickDistance, warmupNotes, rulesNamingInactive,
  carryOver, bottomRankedPenaltyZ, checkSheetEdit, wristbandPlay, replacementUnpractised, bookCell, buildBook, changedCells,
  addInstruction, instructionMissChance, winningInstruction, wrongFlagChance, mayThrowChallenge, checkDesignee,
  PARAMS, RULE_KEYS, type GameDayPlayer, type PositionGroup, type DayDelegation,
} from '../../src/gameday/index.ts';
import { PRO, COLLEGE, stream } from './fixtures.ts';
import { PROB_FLOOR } from '@gm/schema';

describe('I1.1.1 pregame clock and task list', () => {
  const setup = { rules: PRO, emergencyQbPossible: true };
  it('opens at T minus 180 with the attention budget and every pro task', () => {
    const s = startPregame(setup);
    expect(s.now).toBe(180);
    expect(s.budgetLeft).toBe(100);
    expect(Object.keys(s.defs).sort()).toContain('emergency_qb');
    expect(s.defs['inactives']!.deadline).toBe(90);
    expect(s.defs['toss']!.deadline).toBe(3);
  });
  it('acceptance 1: no locked item can change after its deadline', () => {
    let s = startPregame(setup);
    s = advanceTo(s, 89);
    for (const id of ['inactives', 'radio', 'captains', 'emergency_qb'] as const) {
      expect(s.tasks[id]!.locked).toBe(true);
      expect(doTask(s, id)).toEqual({ ok: false, reason: 'locked' });
    }
    expect(doTask(s, 'decision_book').ok).toBe(true);
  });
  it('a task that would end past its deadline is refused; budget is spent and the clock moves', () => {
    let s = advanceTo(startPregame(setup), 95);
    const r = doTask(s, 'inactives', 10);
    expect(r).toEqual({ ok: false, reason: 'past_deadline' });
    const ok = doTask(s, 'inactives');
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    s = ok.state;
    expect(s.now).toBe(93);
    expect(s.budgetLeft).toBe(98);
    expect(s.tasks['inactives']!.state).toBe('done');
  });
  it('a task not yet open is refused, and the budget runs out', () => {
    const s = startPregame(setup);
    expect(doTask(s, 'talk')).toEqual({ ok: false, reason: 'not_open_yet' });
    expect(doTask({ ...s, budgetLeft: 1 }, 'decision_book', 8)).toEqual({ ok: false, reason: 'no_budget' });
  });
  it('acceptance 2: skipping every task gives staff defaults with one log entry per skipped task', () => {
    const s = runToKickoff(startPregame({ ...setup, assigned: { inactives: 'staff-pc' } }));
    const missed = s.log.filter((e) => e.kind === 'missed').map((e) => (e as { task: string }).task).sort();
    const delegated = s.log.filter((e) => e.kind === 'delegated');
    expect(delegated).toHaveLength(1);
    expect(missed).toHaveLength(Object.keys(s.defs).length - 1);
    expect(new Set(missed).size).toBe(missed.length);
    expect(s.now).toBe(0);
  });
  it('acceptance 3: the countdown and the weather clock agree, delays included', () => {
    let s = startPregame(setup);
    expect(weatherClockMin(s)).toBe(0);
    s = advanceTo(s, 120);
    expect(weatherClockMin(s)).toBe(60);
    s = delayKickoff(s, 30);
    expect(s.now).toBe(150);
    expect(weatherClockMin(s)).toBe(60);
  });
  it('a weather delay keeps locked items locked and gives open items the extra time', () => {
    let s = advanceTo(startPregame(setup), 80);
    s = delayKickoff(s, 30);
    expect(s.tasks['inactives']!.locked).toBe(true);
    expect(canAct(s, 'inactives')).toEqual({ ok: false, reason: 'locked' });
    expect(canAct(s, 'decision_book').ok).toBe(true);
  });
  it('acceptance 4: a team off the field at T minus 10 loses its toss option and 15 yards (Rule 4-2-1)', () => {
    let s = holdOffField(advanceTo(startPregame(setup), 30), 'opponent');
    s = advanceTo(s, 9);
    expect(s.tossOptionLost).toEqual(['opponent']);
    expect(s.log.find((e) => e.kind === 'late_to_field')).toMatchObject({ team: 'opponent', penaltyYd: 15 });
    expect(runToKickoff(startPregame(setup)).tossOptionLost).toEqual([]);
  });
  it('advance to next deadline stops at the field-presence mark and each deadline', () => {
    let s = advanceTo(startPregame(setup), 30);
    for (const mark of [25, 20, 10, 3, 0]) {
      s = advanceToNextDeadline(s);
      expect(s.now).toBe(mark);
    }
  });
  it('acceptance 5: a captain change after T minus 90 is a logged event, not blocked', () => {
    const s = changeCaptainsAfterLock(advanceTo(startPregame(setup), 60), 'captain 54 replaces 91 (injured)');
    expect(s.log.at(-1)).toMatchObject({ kind: 'captain_change' });
  });
  it('rung: tasks the user does not own are hidden; delegation names an assistant', () => {
    const s = startPregame({ ...setup, ownTasks: ['sheet_edits', 'opponent_watch'] });
    expect(s.tasks['inactives']!.state).toBe('hidden');
    expect(doTask(s, 'inactives')).toEqual({ ok: false, reason: 'not_owner' });
    const d = delegate(s, 'sheet_edits', 'qc-1');
    expect(d.ok && d.state.tasks['sheet_edits']!.owner).toBe('qc-1');
  });
  it('college: no report deadline, so the roster items lock at kickoff; no emergency quarterback or designee task', () => {
    const s = startPregame({ rules: COLLEGE, emergencyQbPossible: true });
    expect(s.defs['inactives']!.deadline).toBe(0);
    expect(s.defs['emergency_qb']).toBeUndefined();
    expect(s.defs['challenge_designee']).toBeUndefined();
    expect(s.defs['radio']).toBeUndefined();
  });
});

const P = (id: string, group: PositionGroup, extra: Partial<GameDayPlayer> = {}): GameDayPlayer => ({ id, group, onRoster: true, medical: 'clear', ...extra });
function roster53(): GameDayPlayer[] {
  const plan: [PositionGroup, number][] = [['QB', 3], ['RB', 4], ['WR', 6], ['TE', 3], ['OL', 9], ['DL', 9], ['LB', 7], ['DB', 9], ['K', 1], ['P', 1], ['LS', 1]];
  const out: GameDayPlayer[] = [];
  for (const [g, n] of plan) for (let i = 1; i <= n; i++) out.push(P(`${g}${i}`, g));
  return out;
}

describe('I1.2.1 workouts', () => {
  it('acceptance: report accuracy rises with staff accuracy over 1,000 workouts', () => {
    const p = P('WR1', 'WR', { medical: 'questionable' });
    const err = (acc: number) => { const d = stream(7); let e = 0; for (let i = 0; i < 1000; i++) e += Math.abs(workout(p, 0.7, acc, d)!.reported - 0.7); return e / 1000; };
    expect(err(0.9)).toBeLessThan(err(0.1));
  });
  it('a player in the concussion protocol is never worked out; limited carries a snap ceiling', () => {
    expect(workout(P('X', 'WR', { medical: 'concussion_protocol' }), 0.9, 1, stream(1))).toBeNull();
    const d = stream(3);
    const r = Array.from({ length: 200 }, () => workout(P('Y', 'RB', { medical: 'questionable' }), 0.65, 1, d)!);
    const limited = r.find((x) => x.verdict === 'limited')!;
    expect(limited.snapCeiling).toBeGreaterThan(0);
    expect(r.filter((x) => x.verdict === 'full').every((x) => x.snapCeiling === null)).toBe(true);
  });
});

describe('I1.2.2 inactive list and the active 48', () => {
  it('rule 1: 48 with 8 offensive linemen active, else 47; college has none', () => {
    expect(activeLimit(PRO, 8)).toBe(48);
    expect(activeLimit(PRO, 7)).toBe(47);
    expect(activeLimit(COLLEGE, 3)).toBeNull();
  });
  it('acceptance 1: no list over 48, or over 47 with fewer than 8 linemen', () => {
    const pool = roster53();
    const ids = pool.map((p) => p.id);
    expect(checkActiveList(pool, ids.slice(0, 49), PRO).problems).toContainEqual({ kind: 'over_limit', active: 49, limit: 48 });
    const noOl8 = ids.filter((id) => id !== 'OL8' && id !== 'OL9').slice(0, 48);
    expect(checkActiveList(pool, noOl8, PRO).problems).toContainEqual({ kind: 'over_limit', active: 48, limit: 47 });
    const fine = staffActiveList(pool, () => 1, PRO);
    expect(fine).toHaveLength(48);
    expect(checkActiveList(pool, fine, PRO).legal).toBe(true);
  });
  it('rules 2 and 3: inactives are the rest; two elevations make seven; out players dressed are breakable acts', () => {
    const pool = [...roster53(), P('PS1', 'DB', { onRoster: false }), P('PS2', 'WR', { onRoster: false })];
    const act = staffActiveList(pool, (id) => (id.startsWith('PS') ? 5 : 1), PRO);
    expect(checkActiveList(pool, act, PRO).inactive).toHaveLength(7);
    const hurt = pool.map((p) => (p.id === 'WR1' ? { ...p, medical: 'out' as const } : p));
    expect(staffActiveList(hurt, () => 1, PRO)).not.toContain('WR1');
    const c = checkActiveList(hurt, ['WR1', ...act.filter((x) => x !== 'WR2')], PRO);
    expect(c.acts).toEqual([{ classId: 'medical_clearance', playerId: 'WR1', leaf: 'I1.2.1' }]);
    expect(checkActiveList([...pool, P('PS3', 'LB', { onRoster: false })], act, PRO).problems.some((p) => p.kind === 'too_many_elevations')).toBe(true);
  });
  it('acceptance 2: the thin-spot panel lists every group and job below its minimum over 20 rosters', () => {
    for (let k = 0; k < 20; k++) {
      const pool = roster53().map((p) => (p.id === 'K1' ? { ...p, jobs: ['kicker'] } : p.id === 'P1' ? { ...p, jobs: ['holder', 'punter'] } : p));
      const d = stream(100 + k);
      const active = pool.filter(() => d() > 0.25).map((p) => p.id);
      const spots = thinSpots(pool, active);
      const counted = (g: PositionGroup) => pool.filter((p) => p.group === g && active.includes(p.id)).length;
      const need: Record<string, number> = { QB: 2, OL: 7, K: 1, P: 1, LS: 1 };
      for (const g of ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P', 'LS'] as PositionGroup[]) {
        const listed = spots.some((s) => s.what === `group.${g}`);
        expect(listed).toBe(counted(g) < (need[g] ?? 3));
      }
      expect(spots.some((s) => s.what === 'job.holder')).toBe(true);
    }
  });
  it('college: no game-day cut, everyone healthy dresses', () => {
    const pool = roster53();
    expect(staffActiveList(pool, () => 1, COLLEGE)).toHaveLength(53);
    expect(checkActiveList(pool, pool.map((p) => p.id), COLLEGE).legal).toBe(true);
  });
});

describe('I1.2.3 emergency third quarterback', () => {
  const pool = roster53();
  const active = pool.filter((p) => p.id !== 'QB3').map((p) => p.id);
  it('rules 1 and 2', () => {
    expect(checkEmergencyQb(pool.find((p) => p.id === 'QB3')!, pool, active, PRO)).toEqual([]);
    expect(checkEmergencyQb(P('PSQ', 'QB', { onRoster: false }), pool, active, PRO)).toContain('elevated_player');
    expect(checkEmergencyQb(pool.find((p) => p.id === 'WR1')!, pool, active, PRO)).toContain('not_a_quarterback');
    expect(checkEmergencyQb(pool.find((p) => p.id === 'QB3')!, pool, [...active, 'QB3'], PRO)).toContain('wrong_active_qb_count');
    expect(checkEmergencyQb(pool.find((p) => p.id === 'QB3')!, pool, active, COLLEGE)).toEqual(['rule_off']);
  });
  it('rules 3 to 5: enters only when both are injured or disqualified; leaves when one returns; no direct snap to others', () => {
    expect(emergencyQbMayEnter(['injured', 'disqualified'])).toBe(true);
    expect(emergencyQbMayEnter(['injured', 'poor_play'])).toBe(false);
    expect(emergencyQbMustLeave(['available', 'injured'])).toBe(true);
    expect(playCallableWithEmergencyQb({ directSnapTo: 'other' })).toBe(false);
  });
  it('he does not count against the active limit', () => {
    const list = staffActiveList(pool, () => 1, PRO, 'QB3');
    expect(list).toHaveLength(48);
    expect(list).not.toContain('QB3');
    expect(checkActiveList(pool, list, PRO, 'QB3').inactive).not.toContain('QB3');
  });
});

describe('I1.2.4 radio helmets', () => {
  const d = { offense: ['QB1', 'QB2'], defensePrimary: 'LB1', defenseBackup: 'DB1' };
  it('designations checked against the report limits', () => {
    expect(checkRadio(d, ['QB1', 'QB2', 'LB1', 'DB1'], PRO)).toEqual([]);
    expect(checkRadio({ ...d, offense: ['QB1', 'QB2', 'QB3', 'WR1'] }, ['QB1', 'QB2', 'QB3', 'WR1', 'LB1', 'DB1'], PRO)).toContainEqual({ kind: 'too_many_offense', count: 4, max: 3 });
    expect(checkRadio({ ...d, defensePrimary: null }, ['QB1', 'QB2', 'DB1'], PRO)).toContainEqual({ kind: 'backup_without_primary' });
  });
  it('acceptance: never two live radios per side; with both users out the call goes by signal', () => {
    expect(defensiveRadioForSnap(['LB1', 'DB1'], d, PRO)).toBe('LB1');
    expect(defensiveRadioForSnap(['DB1'], d, PRO)).toBe('DB1');
    expect(defensiveRadioForSnap(['LB2', 'DB2'], d, PRO)).toBeNull();
    expect(defensiveRadioForSnap(['LB2'], d, COLLEGE, 'LB2')).toBe('LB2');
    expect(radioPackageWarnings(d, { dime: ['DB1', 'DB2'], goal_line: ['LB2', 'DL1'] })).toEqual(['goal_line']);
  });
});

describe('I1.2.5 depth card', () => {
  const chart = { QB: ['QB1', 'QB2'], holder: ['P1'], LT: ['OL1', 'OL6'], 'kr.1': ['WR3', 'RB2'], 'pr.1': ['WR3'] };
  it('filters to the active list, finds chains and red marks, and answers next man up', () => {
    const card = buildDepthCard(chart, ['QB1', 'QB2', 'P1', 'OL1', 'WR3', 'RB2']);
    expect(card['LT']).toEqual(['OL1']);
    expect(chains(card)['WR3']).toEqual(['kr.1', 'pr.1']);
    expect(slotsWithoutBackup(card)).toEqual(['LT', 'holder', 'pr.1']);
    expect(nextUp(card, 'QB', ['QB1'])).toBe('QB2');
  });
});

describe('I1.3 conditions', () => {
  it('I1.3.1: forecast error grows with lead time and has zero mean', () => {
    expect(windForecastSe(1)).toBe(3);
    expect(windForecastSe(3)).toBe(6);
    const d = stream(11);
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += forecastWind(20, 3, d) - 20;
    expect(Math.abs(sum / 1000)).toBeLessThan(0.5);
  });
  const curve = (shift: number) => (dist: number) => Math.min(0.99, Math.max(0, 1.6 - (dist + shift) / 40));
  it('I1.3.2: a perfect coordinator reports the 75% line within a yard; lines differ by direction in wind', () => {
    const k = kickingLines({ north: curve(0), south: curve(8) }, 1, PRO, stream(5));
    expect(Math.abs(k.reported.north.comfortable! - k.true.north.comfortable!)).toBeLessThanOrEqual(1);
    expect(k.true.north.comfortable).not.toBe(k.true.south.comfortable);
    expect(k.true.north.maximum!).toBeGreaterThan(k.true.north.comfortable!);
    expect(kickDistance(20, PRO)).toBe(37);
  });
  it('I1.3.3: limited players are noticed more often by better staff; false notes are rare', () => {
    const opp = Array.from({ length: 1000 }, (_, i) => ({ id: `o${i}`, limited: i < 500, inactive: false }));
    const good = warmupNotes(opp, 1, stream(9)), poor = warmupNotes(opp, 0, stream(9));
    const hits = (n: typeof good) => n.filter((x) => Number(x.playerId.slice(1)) < 500).length;
    expect(hits(good)).toBeGreaterThan(hits(poor));
    const falseRate = good.filter((x) => Number(x.playerId.slice(1)) >= 500).length / 500;
    expect(falseRate).toBeLessThan(0.1);
    expect(rulesNamingInactive([{ id: 'double_11', names: ['o11'] }, { id: 'spy', names: ['o2'] }], ['o11'])).toEqual(['double_11']);
  });
});

describe('I1.1.2 and I1.4 final plan edits', () => {
  it('I1.1.2: overnight events and the quarterback bottom group', () => {
    const c = carryOver([{ playerId: 'WR2', kind: 'illness' }, { playerId: 'LB3', kind: 'curfew' }], ['p12']);
    expect(c.nowQuestionable).toEqual(['WR2']);
    expect(c.disciplineOwed).toEqual(['LB3']);
    expect(bottomRankedPenaltyZ('p12', c)).toBe(-0.1);
    expect(carryOver([], null).meetingHeld).toBe(false);
  });
  it('I1.4.1: only installed plays; wristbands keep the old play until reprinted', () => {
    const ctx = { installed: new Set(['a', 'b', 'c']), practisedThisWeek: new Set(['a', 'b']), boxes: { third_short: ['a', 'b'] }, variants: ['wet'] };
    expect(checkSheetEdit({ kind: 'replace', playId: 'a', withPlayId: 'z' }, ctx)).toEqual(['not_installed']);
    expect(checkSheetEdit({ kind: 'reorder', box: 'third_short', order: ['b', 'a'] }, ctx)).toEqual([]);
    expect(checkSheetEdit({ kind: 'reorder', box: 'third_short', order: ['b', 'c'] }, ctx)).toEqual(['reorder_changes_contents']);
    expect(replacementUnpractised({ kind: 'replace', playId: 'a', withPlayId: 'c' }, ctx)).toBe(true);
    expect(wristbandPlay('a', [{ kind: 'replace', playId: 'a', withPlayId: 'c' }])).toBe('a');
    expect(wristbandPlay('a', [{ kind: 'replace', playId: 'a', withPlayId: 'c' }, { kind: 'reprint_wristband' }])).toBe('c');
  });
  it('I1.4.2: close cells under one point; the slider moves close cells to go; a line move changes cells', () => {
    expect(bookCell({ go: 0.52, kick: 0.6 })).toMatchObject({ choice: 'kick', close: false });
    expect(bookCell({ go: 0.595, kick: 0.6 })).toMatchObject({ choice: 'kick', close: true });
    expect(bookCell({ go: 0.595, kick: 0.6 }, 1).choice).toBe('go');
    const a = buildBook({ '35:4': { go: 0.5, kick: 0.55 }, '40:4': { go: 0.5, punt: 0.52 } });
    const b = buildBook({ '35:4': { go: 0.5, kick: 0.45 }, '40:4': { go: 0.5, punt: 0.52 } });
    expect(changedCells(a, b)).toEqual(['35:4']);
  });
  it('I1.4.3: cap of 12, miss chance beyond 8, first in the list wins a conflict', () => {
    let d: DayDelegation = { offense: 'user', defense: 'dc', special: 'stc', qbFreedom: 'limited', instructions: [] };
    const r = addInstruction(d, { id: 'i1', rule: 'go_4th_1_past_40', conflictKey: '4th1', action: 'go' });
    d = r.delegation;
    const r2 = addInstruction(d, { id: 'i2', rule: 'kick_4th_1', conflictKey: '4th1', action: 'kick' });
    expect(r2.conflictsWith).toEqual(['i1']);
    expect(winningInstruction(r2.delegation, (i) => i.conflictKey === '4th1')!.id).toBe('i1');
    for (let k = 3; k <= 13; k++) d = addInstruction(d, { id: `i${k}`, rule: 'x', action: 'a' }).delegation;
    expect(addInstruction(d, { id: 'i14', rule: 'x', action: 'a' }).ok).toBe(false);
    expect(instructionMissChance(8)).toBe(PROB_FLOOR);
    expect(instructionMissChance(10)).toBeCloseTo(0.04);
  });
  it('I1.4.4 and I1.4.5', () => {
    expect(wrongFlagChance(0.02, true, true)).toBe(0.01);
    expect(wrongFlagChance(0.02, false, true)).toBe(0.02);
    expect(mayThrowChallenge('ahc', 'hc', { staffId: 'ahc' }, PRO, ['ahc'])).toBe(true);
    expect(mayThrowChallenge('oc', 'hc', { staffId: 'ahc' }, PRO, ['ahc', 'oc'])).toBe(false);
    expect(mayThrowChallenge('ahc', 'hc', { staffId: 'ahc' }, PRO, [])).toBe(false);
    expect(checkDesignee({ staffId: 'ahc' }, COLLEGE, ['ahc'])).toBe('rule_off');
  });
});

describe('module surface', () => {
  it('every parameter is in range with a leaf; rule keys are named per B13.1.2', () => {
    for (const p of PARAMS.params) {
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
      expect(p.leaf).toMatch(/^I\d/);
    }
    for (const k of RULE_KEYS) expect(k.key).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/);
  });
});
