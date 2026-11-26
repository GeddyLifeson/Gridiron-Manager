// G-79 game day below head coach: S5 and O7.4 acceptance criteria.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import catalogue from '../../src/positions/catalogue.json' with { type: 'json' };
import {
  PARAMS, aiBoothAnswer, applyCorrections, boothLine, buildSheet, callerReading, checkSheet, complianceRow, correctionList, defaultRole,
  estimateGame, failureChance, followChance, gradeBooth, gradeFlag, gradeRelay, interventionBudget, narrowMenu, NO_ENTRIES, onHeadsetFailure,
  planInterventions, post, promptTimerS, reportWeight, resolveAdvice, resolveSub, roleReport, runSeatGame, seasonLine, seatLayout, selectChannel,
  startListening, takesCallingAway, trailingBig, userLine,
  type BoothGrade, type GamedayRole, type RoleRecord, type SeatRules, type SnapTruth, type StaffSeat, type SheetJob,
} from '../../src/seats/index.ts';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rulesRoot = join(import.meta.dirname, '..', '..', '..', 'rules-data', 'data');
const c2p = (f: string): boolean => (JSON.parse(readFileSync(join(rulesRoot, f), 'utf8')) as { values: { key: string; value: unknown }[] }).values.find((v) => v.key === 'comm.c2p_allowed')!.value as boolean;
// comm.headsets_max is requested (CR-G79-2); 23 is the S5.1.1 value (college rule 1-4-12-b, Rulebook only).
const COLLEGE: SeatRules = { c2pAllowed: c2p('college_2026.json'), headsetsMax: 23, lateHalfTwelveClockReset: true };
const PRO: SeatRules = { c2pAllowed: c2p('pro_2026.json'), headsetFailureBothOff: true };

const jobs = (catalogue as unknown as { jobs?: SheetJob[] }).jobs ?? (catalogue as unknown as SheetJob[]);
const job = (id: string): SheetJob => { const j = jobs.find((x) => x.id === id); if (!j) throw new Error(id); return j; };

function collegeStaff(): StaffSeat[] {
  const ids = ['job:college.head_coach_top', 'job:college.coordinator.offense', 'job:college.coordinator.defense', 'job:college.coordinator.special_teams',
    'job:college.quality_control.offense', 'job:college.quality_control.defense', 'job:college.analyst', 'job:college.strength_head',
    ...['qb', 'rb', 'wr', 'te', 'ol', 'dl', 'lb', 'db'].map((g) => `job:college.position_coach.${g}`)];
  const s: StaffSeat[] = ids.map((id, i) => ({ seatId: i + 1, personId: 100 + i, job: job(id), callsPlays: id.includes('coordinator'), user: id.endsWith('quality_control.offense') }));
  for (let i = 0; i < 10; i++) s.push({ seatId: 50 + i, personId: 300 + i, job: job('job:college.graduate_assistant'), sideOverride: i % 2 ? 'defense' : 'offense', callsPlays: false, user: false });
  for (let i = 0; i < 6; i++) s.push({ seatId: 70 + i, personId: 400 + i, job: job('job:college.student_assistant'), sideOverride: 'offense', callsPlays: false, user: false });
  return s;
}

describe('S5.1.1 seat assignment', () => {
  it('gives every seat on the sheet exactly one role, inside the college headset cap', () => {
    const sheet = buildSheet(collegeStaff(), COLLEGE);
    expect(checkSheet(sheet, COLLEGE)).toEqual([]);
    expect(new Set(sheet.map((r) => r.seatId)).size).toBe(sheet.length);
    expect(sheet.filter((r) => r.comm === 'headset').length).toBeLessThanOrEqual(23);
    // Lowest-rank seats work by hand signal and runner, with a delay.
    const noSet = sheet.filter((r) => r.comm === 'hand_signal_runner');
    expect(noSet.length).toBeGreaterThan(0);
    expect(noSet.every((r) => r.reportDelayS > 0 && (r.role === 'signaler' || r.role === 'charter' || r.role === 'sub_getback'))).toBe(true);
    // Strength staff has no S5.1.1 role.
    expect(sheet.some((r) => r.seatId === 8)).toBe(false);
    expect(userLine(sheet)?.role).toBe('booth_coverage');
  });

  it('flags a sheet over the cap and lets the head coach set roles', () => {
    const staff = collegeStaff();
    const sheet = buildSheet(staff, COLLEGE, [{ seatId: 2, role: 'caller_offense', location: 'sideline' }]);
    expect(sheet.find((r) => r.seatId === 2)).toMatchObject({ role: 'caller_offense', location: 'sideline', channel: 'offense' });
    const over = sheet.map((r) => ({ ...r, comm: 'headset' as const }));
    expect(checkSheet(over, COLLEGE)).toContainEqual({ seatId: null, problem: 'over_headset_cap' });
  });

  it('defaults roles by job and calls_plays', () => {
    const s = (id: string, callsPlays = false): StaffSeat => ({ seatId: 1, personId: 1, job: job(id), callsPlays, user: true });
    expect(defaultRole(s('job:pro.coordinator.defense', true))).toBe('caller_defense');
    expect(defaultRole(s('job:pro.coordinator.defense', false))).toBe('caller_assistant');
    expect(defaultRole(s('job:pro.game_management'))).toBe('game_management');
    expect(defaultRole(s('job:pro.coaching_assistant'))).toBeNull();
    expect(defaultRole(s('job:college.graduate_assistant'))).toBe('charter');
  });

  it('moves booth roles to phone or runner on a headset failure', () => {
    const sheet = buildSheet(collegeStaff(), PRO);
    const after = onHeadsetFailure(sheet, false, PRO);
    expect(after.every((r) => r.comm === 'hand_signal_runner' && r.reportDelayS > 0)).toBe(true);
  });
});

describe('O7.4.2 channels', () => {
  const sheet = buildSheet(collegeStaff(), COLLEGE);
  const hc = sheet.find((r) => r.role === 'head_coach')!;
  const qc = sheet.find((r) => r.user)!;
  const dqc = sheet.find((r) => r.role === 'booth_offense')!;
  const msgs = [post(qc, 1, 10, 1, 'report', { look: 'cover3' }), post(dqc, 2, 12, 0, 'report', { personnel: '11' })];
  it('shows only the selected channel and queues the rest with their age', () => {
    let l = startListening(hc);
    l = selectChannel(l, 'defense', 5);
    const line = boothLine(l, msgs, 20);
    expect(line.shown.map((m) => m.id)).toEqual([2]);
    expect(line.queued.map((q) => [q.message.id, q.ageS])).toEqual([[1, 9]]);
    expect(l.log).toEqual([{ atS: 5, channel: 'defense' }]);
  });
  it('gives lower seats one fixed channel and never shows other channels', () => {
    const l = selectChannel(startListening(qc), 'defense', 1);
    expect(l.selected).toBe('offense');
    const line = boothLine(l, msgs, 20);
    expect(line.shown.map((m) => m.id)).toEqual([1]);
    expect(line.queued).toEqual([]);
  });
  it('delivers a message only after its delay', () => {
    expect(boothLine(startListening(qc), msgs, 10.5).shown).toEqual([]);
  });
});

describe('S5.2.1 substitution', () => {
  const t = { required: [1, 2, 3], onFieldGroup: [1, 2, 4], othersOnField: 8, calledAtS: 0, side: 'defense' as const, tempo: false, lateCall: false, afterTwoMinuteTimeout: true, timeoutsLeft: 0 };
  it('grades a right, on-time substitution', () => {
    expect(resolveSub(t, { sendIn: [3], takeOut: [4], atS: 3 }, COLLEGE, rng(1))).toMatchObject({ correct: true, onTime: true, count: 11, consequence: 'none' });
  });
  it('a late substitution has a visible consequence', () => {
    const late = resolveSub(t, { sendIn: [3], takeOut: [4], atS: 9 }, COLLEGE, rng(1));
    expect(late.onTime).toBe(false);
    expect(late.consequence).toBe('wrong_player');
    const twelve = resolveSub(t, { sendIn: [3], takeOut: [], atS: 2 }, COLLEGE, rng(1));
    expect(twelve).toMatchObject({ count: 12, consequence: 'foul_too_many', clockReset: true });
    const ten = resolveSub(t, { sendIn: [], takeOut: [4], atS: 2 }, COLLEGE, rng(1));
    expect(ten.consequence).toBe('ten_men');
    const pro = resolveSub(t, { sendIn: [3], takeOut: [], atS: 2 }, PRO, rng(1));
    expect(pro.clockReset).toBe(false);
  });
});

describe('S5.2.2 position coach between series', () => {
  const causes = [{ id: 'k1', playerId: 7, kind: 'wide_set_late', playIds: [3, 5] }];
  const cat = [{ playerId: 7, kind: 'wide_set_late' }, { playerId: 7, kind: 'hands_low' }, { playerId: 9, kind: 'false_step' }, { playerId: 9, kind: 'eyes_in_backfield' }];
  const players = [{ playerId: 7, composure: 0.8, learns: 'picture' as const }, { playerId: 9, composure: 0.5, learns: 'words' as const }];
  const win = { opensS: 0, closesS: 180 };
  const list = correctionList(causes, cat, 3, rng(4));
  const right = list.find((o) => o.causeId === 'k1')!;
  const wrong = list.find((o) => o.causeId === null)!;

  it('lists every true cause among decoys', () => {
    expect(list.filter((o) => o.causeId !== null)).toHaveLength(1);
    expect(list).toHaveLength(4);
  });

  it('a correct diagnosis lowers the repeat rate for the rest of the game (controlled test)', () => {
    const base = 0.3;
    const fx = applyCorrections(list, [{ optionId: right.id, way: 'picture', atS: 60 }], players, { kind: 'user' }, win, rng(2));
    const p = failureChance(base, 7, 'wide_set_late', fx);
    expect(p).toBeLessThan(base);
    const draw = rng(9);
    let before = 0, after = 0;
    for (let i = 0; i < 20000; i++) { if (draw() < base) before++; if (draw() < p) after++; }
    expect(after).toBeLessThan(before * 0.85);
    // Same correction, wrong way for this player: smaller effect. Same input, same effect in any season (E9.1.3).
    const words = failureChance(base, 7, 'wide_set_late', applyCorrections(list, [{ optionId: right.id, way: 'words', atS: 60 }], players, { kind: 'user' }, win, rng(2)));
    expect(words).toBeGreaterThan(p);
    expect(failureChance(base, 7, 'wide_set_late', applyCorrections(list, [{ optionId: right.id, way: 'picture', atS: 60 }], players, { kind: 'user' }, win, rng(77)))).toBe(p);
  });

  it('a wrong correction does nothing or makes the player hesitant; crowding lowers each effect', () => {
    const fx = applyCorrections(list, [{ optionId: wrong.id, way: 'words', atS: 10 }], players, { kind: 'user' }, win, rng(3));
    expect(fx[0]!.factor).toBe(1);
    expect(fx[0]!.add === 0 || fx[0]!.add > 0).toBe(true);
    const one = applyCorrections(list, [{ optionId: right.id, way: 'picture', atS: 10 }], players, { kind: 'user' }, win, rng(3))[0]!.factor;
    const two = applyCorrections(list, [{ optionId: right.id, way: 'picture', atS: 10 }, { optionId: wrong.id, way: 'words', atS: 11 }], players, { kind: 'user' }, win, rng(3))[0]!.factor;
    expect(two).toBeGreaterThan(one);
  });

  it('the window closes when the unit must return', () => {
    const fx = applyCorrections(list, [{ optionId: right.id, way: 'picture', atS: 200 }], players, { kind: 'user' }, win, rng(3));
    expect(fx).toEqual([]);
  });
});

describe('S5.3.1 booth eyes', () => {
  const truth = { playId: 1, shown: 'cover2/tampa', played: 'cover3/buzz', snapS: 100 };
  it('grades pre-snap against the shown shell and post-snap against the real coverage, with family credit', () => {
    expect(gradeBooth(truth, { playId: 1, phase: 'pre', look: 'cover2/tampa', atS: 99 }, false).credit).toBe(1);
    const post1 = gradeBooth(truth, { playId: 1, phase: 'post', look: 'cover3/sky', atS: 103 }, false);
    expect(post1).toMatchObject({ credit: 0.5, familyRight: true, seconds: 3, delivered: true });
    expect(gradeBooth(truth, { playId: 1, phase: 'post', look: 'cover3/buzz', atS: 107 }, false).delivered).toBe(false);
    // Against tempo, family only and under three seconds.
    expect(gradeBooth(truth, { playId: 1, phase: 'post', look: 'cover3', atS: 102 }, true)).toMatchObject({ credit: 1, delivered: true });
    expect(gradeBooth(truth, { playId: 1, phase: 'post', look: 'cover3', atS: 104 }, true).delivered).toBe(false);
  });

  it('a caller given 90% accurate booth reports reads the coverage better than one given 50%', () => {
    const pad = ['cover1/robber', 'cover2/tampa', 'cover3/buzz', 'cover3/sky', 'cover4/quarters', 'cover0/zero'];
    const draw = rng(11);
    const trial = (acc: number): number => {
      const grades: BoothGrade[] = [];
      let right = 0;
      for (let i = 0; i < 4000; i++) {
        const played = pad[Math.floor(draw() * pad.length)]!;
        const t = { playId: i, shown: played, played, snapS: 0 };
        const look = draw() < acc ? played : pad.filter((l) => l !== played)[Math.floor(draw() * 5)]!;
        const g = gradeBooth(t, { playId: i, phase: 'post', look, atS: 2 }, false);
        const r = callerReading(t, g, reportWeight(0.9, grades), pad, draw);
        grades.push(g);
        if (r.look === played) right++;
      }
      return right / 4000;
    };
    expect(trial(0.9)).toBeGreaterThan(trial(0.5) + 0.1);
  });

  it('AI booth coaches with better recognition answer more accurately and faster', () => {
    const pad = ['cover1/robber', 'cover2/tampa', 'cover3/buzz', 'cover3/sky', 'cover4/quarters'];
    const run = (r: number) => {
      const d = rng(5); let c = 0, s = 0;
      for (let i = 0; i < 3000; i++) { const t = { playId: i, shown: 'cover3/buzz', played: 'cover3/buzz', snapS: 0 }; const g = gradeBooth(t, aiBoothAnswer(t, r, pad, false, d), false); c += g.credit; s += g.seconds ?? 0; }
      return { acc: c / 3000, sec: s / 3000 };
    };
    const lo = run(0.1), hi = run(0.9);
    expect(hi.acc).toBeGreaterThan(lo.acc);
    expect(hi.sec).toBeLessThan(lo.sec);
  });
});

describe('S5.3.2 charting', () => {
  it('grades flags: too early under 5 snaps, real after 8 snaps of no blitz against a 50% report', () => {
    expect(gradeFlag(3, 0, 0.5)).toBe('too_early');
    expect(gradeFlag(8, 0, 0.5)).toBe('real');
    expect(gradeFlag(8, 4, 0.5)).toBe('not_real');
    expect(gradeFlag(6, 1, 0)).toBe('real');
  });
  it('grades the personnel relay on accuracy and arrival before the call goes in', () => {
    expect(gradeRelay('11', '11', 5, 8).score).toBe(1);
    expect(gradeRelay('11', '11', 9, 8)).toMatchObject({ right: true, inTime: false, score: 0 });
    expect(gradeRelay('11', '12', 5, 8).score).toBe(0);
  });
});

describe('S5.3.3 game-management advice', () => {
  it('sets the prompt timers from the leaf', () => {
    expect(promptTimerS({ id: 1, kind: 'fourth_down', openedAtS: 0, playClockLeftS: 30 })).toBe(22);
    expect(promptTimerS({ id: 1, kind: 'two_point', openedAtS: 0, playClockLeftS: 10 })).toBe(6);
    expect(promptTimerS({ id: 1, kind: 'timeout', openedAtS: 0 })).toBe(20);
    expect(promptTimerS({ id: 1, kind: 'challenge', openedAtS: 0, untilNextSnapS: 25 })).toBe(20);
  });
  it('advice arrives only if confirmed before the timer ends', () => {
    const m = { id: 1, kind: 'fourth_down' as const, openedAtS: 0, playClockLeftS: 30 };
    expect(resolveAdvice(m, { momentId: 1, choice: 'go', reason: 'ep', confirmedAtS: 21 }, 'go', { analyticsTrust: 1, userTrust: 1 }, rng(1))).toMatchObject({ delivered: true, matchedModel: true, followed: true });
    expect(resolveAdvice(m, { momentId: 1, choice: 'go', reason: 'ep', confirmedAtS: 23 }, 'go', { analyticsTrust: 1, userTrust: 1 }, rng(1)).delivered).toBe(false);
    expect(followChance(0.5, 0.5)).toBeCloseTo(0.65);
  });
});

describe('S5.4.1 coordinator calling for someone else', () => {
  const hc = { handsOn: 1, trustInUser: 0, ego: 0.5 };
  it('sets intervention counts from the head coach and the game state, one per series at most', () => {
    expect(interventionBudget(hc, false)).toBe(6);
    expect(interventionBudget({ ...hc, trustInUser: 1 }, true)).toBe(3);
    expect(trailingBig(-9, true)).toBe(true);
    expect(trailingBig(-8, true)).toBe(false);
    const plan = planInterventions(6, 12, new Set(), rng(3));
    expect(plan).toHaveLength(6);
    expect(new Set(plan.map((p) => p.series)).size).toBe(6);
  });
  it('drops a decision for a series whose question was answered ahead', () => {
    const all = new Set(Array.from({ length: 12 }, (_, i) => i));
    expect(planInterventions(12, 12, all, rng(3)).some((p) => p.kind === 'decision')).toBe(false);
  });
  it('narrows the menu, logs compliance and costs trust for ignoring', () => {
    const menu = [{ id: 'a', tags: ['run'] }, { id: 'b', tags: ['pass', 'shot'] }];
    expect(narrowMenu(menu, { id: 'i', allowTags: ['run'], scope: 'play' }).map((c) => c.id)).toEqual(['a']);
    const ins = { id: 'i', allowTags: ['run'], scope: 'play' as const };
    expect(complianceRow(1, ins, ['run'], true, hc).trustCost).toBe(0);
    expect(complianceRow(1, ins, ['shot'], false, hc).trustCost).toBe(2);
    expect(complianceRow(1, ins, ['shot'], true, hc).trustCost).toBe(5);
    const rows = [1, 2, 3].map((s) => complianceRow(s, ins, ['shot'], false, hc));
    expect(takesCallingAway(rows)).toBe(true);
  });
});

function snaps(n: number): SnapTruth[] {
  return Array.from({ length: n }, (_, i) => ({ playId: i, shown: 'cover2/tampa', played: i % 2 ? 'cover3/buzz' : 'cover1/robber', snapS: i * 40, personnel: '11', situation: '3rd_long', callInS: i * 40 + 20, tempo: false, flagEvent: { key: 'blitz', reportRate: 0.5, happened: false } }));
}

describe('O7.4.1 a full game from each seat, and S5.5.1 the role log', () => {
  const sheet = buildSheet(collegeStaff(), COLLEGE);
  const seat = (role: GamedayRole['role']): GamedayRole => ({ ...sheet.find((r) => r.role === role)!, user: true });
  const pad = ['cover1/robber', 'cover2/tampa', 'cover3/buzz', 'cover4/quarters'];
  const hc = { analyticsTrust: 0.5, userTrust: 0.5 };

  it('the game pace is unchanged by a user who does nothing in a non-calling seat', () => {
    for (const r of ['booth_coverage', 'booth_offense', 'charter', 'game_management'] as const) {
      const res = runSeatGame({ gameId: 1, role: seat(r), snaps: snaps(60), moments: [{ id: 1, kind: 'timeout', openedAtS: 0, modelChoice: 'save' }], entries: NO_ENTRIES, standingRules: null, pad, headCoach: hc }, rng(1));
      expect(res.snapsPlayed).toBe(60);
      expect(res.runsConsole).toBe(false);
      expect(res.records.length).toBeGreaterThan(0);
      expect(res.records.every((x) => x.grade === 0)).toBe(true);
      expect(res.messages).toEqual([]);
      expect(seatLayout(seat(r)).gameWaits).toBe(false);
    }
    expect(seatLayout(seat('caller_offense')).gameWaits).toBe(true);
  });

  it('each seat produces a graded record; standing rules mark it simulated', () => {
    const looks = new Map(snaps(20).map((s) => [s.playId, { playId: s.playId, phase: 'post' as const, look: s.played, atS: s.snapS + 2 }]));
    const res = runSeatGame({ gameId: 1, role: seat('booth_coverage'), snaps: snaps(20), moments: [], entries: { ...NO_ENTRIES, looks, flags: [{ key: 'blitz', afterPlay: 9 }] }, standingRules: null, pad, headCoach: hc }, rng(1));
    const booth = res.records.filter((r) => r.kind === 'booth');
    expect(booth).toHaveLength(20);
    expect(booth.every((r) => r.grade === 1 && r.truth !== null)).toBe(true);
    expect(res.records.find((r) => r.kind === 'flag')).toMatchObject({ truth: 'real', grade: 1 });
    expect(res.messages.length).toBe(21);
    const sim = runSeatGame({ gameId: 2, role: seat('booth_coverage'), snaps: snaps(20), moments: [], entries: NO_ENTRIES, standingRules: { recognition: 0.6 }, pad, headCoach: hc }, rng(1));
    expect(sim.records.every((r) => r.simulated)).toBe(true);
  });

  it('the role report shows "not enough yet" under 10 events per family, and season lines need 3 games', () => {
    const mk = (g: number, i: number, fam: string, grade: number): RoleRecord => ({ kind: 'booth', role: 'booth_coverage', seatId: 5, gameId: g, playId: i, view: 'booth', timeAvailableS: 5, entry: fam, truth: fam, grade, seconds: 2 + (i % 3), family: fam, workedOut: null, error: null, simulated: false });
    const recs = [...Array.from({ length: 12 }, (_, i) => mk(1, i, 'cover3', i < 9 ? 1 : 0)), ...Array.from({ length: 4 }, (_, i) => mk(1, 20 + i, 'cover1', 1))];
    const rep = roleReport(recs);
    expect(rep.byFamily['cover3']).toEqual({ value: 0.75, n: 12 });
    expect(rep.byFamily['cover1']).toBe('not_enough_yet');
    expect(rep.medianSeconds).toBe(3);
    expect(seasonLine(recs, 'booth_coverage')).toBeNull();
    const three = [...recs, mk(2, 1, 'cover3', 1), mk(3, 1, 'cover3', 1)];
    expect(seasonLine(three, 'booth_coverage')?.games).toBe(3);
    const est = estimateGame(recs, 9, 'booth_coverage', 5, 30);
    expect(est.every((r) => r.simulated)).toBe(true);
    expect(roleReport([...recs, ...est], true).estimated).toBe(false);
    expect(roleReport([...recs, ...est]).estimated).toBe(true);
  });
});

describe('params', () => {
  it('every parameter names its leaf and stays within its range', () => {
    for (const p of PARAMS.params) {
      expect(p.leaf.length).toBeGreaterThan(0);
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
    }
  });
});
