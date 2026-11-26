import { describe, expect, it } from 'vitest';
import {
  assistantGrade, bandAfter, battleCard, checkBoard, claimRisk, claimWithRelease, drillViolation, edgeReport, exposurePerRep, heldPlayTiming, mayPracticeInPads,
  meetingHours, mixedOpponentWeight, opinionsMissing, ownPlayer, P, planBreaches, practiceSquadAcceptance, preseasonSheet, releaseDayReputation, repCounts,
  repSummary, reportDay, snapPlan, splitReps, staffBoard, submitBoard, talkMinutes, techniqueGain, filmAudience,
  type Board, type CutdownPlayer, type SnapGrade,
} from '../../src/personnel/index.ts';
import { facts, league, ok, PRO, setFacts } from '../roster/helpers.ts';
import { g, rng } from './helpers.ts';

describe('M6.2.1 rep allocation', () => {
  it('a player with only third-team reps has a wider band at cutdown than one with the same count of first-team reps', () => {
    const s = repSummary([{ personId: 1, opponentUnit: 'third', reps: 120 }, { personId: 2, opponentUnit: 'first', reps: 120 }]);
    const third = bandAfter(g(55, 100), 18, s[0]!.weighted), first = bandAfter(g(55, 100), 18, s[1]!.weighted);
    expect(third.variance).toBeGreaterThan(first.variance);
    expect(s[0]!.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it('splits a period by the coach\'s split', () => {
    expect(splitReps(20, [2, 1, 1])).toEqual([10, 5, 5]);
    expect(splitReps(21, [2, 1, 1]).reduce((a, b) => a + b, 0)).toBe(21);
  });
});

describe('M6.2.2 battles', () => {
  it('a competitor under 150 weighted reps shows thin evidence; acclimation adds nothing to tackling or run fits', () => {
    const card = battleCard('QB', 'quarterback', { '7': 149, '8': 160 });
    expect(card.competitors.map((c) => c.thinEvidence)).toEqual([true, false]);
    expect(card.decideAfterGame).toBe(2);
    expect(battleCard('K', 'specialist', {}).decideAfterGame).toBeNull();
    expect(repCounts('acclimation', 'tackling')).toBe(false);
    expect(repCounts('acclimation', 'run_fit')).toBe(false);
    expect(repCounts('acclimation', 'assignment')).toBe(true);
    expect(repCounts('padded_team', 'tackling')).toBe(true);
  });
});

describe('M6.2.3 contact', () => {
  it('exposure multipliers by level; quarterback jersey; technique gains only in thud and live', () => {
    expect(['walkthrough', 'jog', 'thud', 'live'].map((l) => exposurePerRep(l as never, false))).toEqual([0.05, 0.2, 0.6, 1]);
    expect(exposurePerRep('live', true)).toBe(0.05);
    expect(techniqueGain('jog')).toBe(0);
    expect(techniqueGain('thud')).toBeGreaterThan(0);
    expect(techniqueGain('live')).toBeGreaterThan(techniqueGain('thud'));
  });
  it('a prohibited drill at full speed is a breakable act; at jogging pace it is allowed', () => {
    expect(drillViolation('oklahoma', 'live')).toEqual({ classId: 'work_rules_practice', drill: 'oklahoma', leaf: 'C11.2.2' });
    expect(drillViolation('oklahoma', 'jog')).toBeNull();
    expect(drillViolation('seven_on_seven', 'live')).toBeNull();
  });
});

describe('M6.3 preseason', () => {
  const players = [
    { personId: 1, starter: true, bubble: false, thinEvidence: false, softTissueFlag: true },
    { personId: 2, starter: false, bubble: true, thinEvidence: true, softTissueFlag: false },
    { personId: 3, starter: false, bubble: false, thinEvidence: false, softTissueFlag: false, override: { zero: true } },
  ];
  it('the staff draft: soft-tissue starters and protected veterans at zero, bubble minimum 20, snaps left shown', () => {
    const p = snapPlan('traditional', 3, players);
    expect(p.zero).toEqual([1, 3]);
    expect(p.minimums).toEqual({ '2': 20 });
    expect(p.flaggedForMore).toEqual([2]);
    expect(p.snapsLeft).toBe(3 * P.preseasonSnapsPerSide - 20);
    expect(p.starterSeries).toEqual([1, 3, 6]);
    expect(planBreaches(p, { '1': 0, '2': 25, '3': 0 }, [])).toEqual([]);
    expect(planBreaches(p, { '1': 4, '2': 5 }, [])).toEqual([{ personId: 1, issue: 'played_while_zero' }, { personId: 2, issue: 'below_minimum' }]);
    expect(planBreaches(p, { '2': 5 }, [2])).toEqual([]);
  });
  it('held plays stay off the sheet; joint practice film reaches one club only', () => {
    const plays = [{ playId: 'a', family: 'zone', base: true }, { playId: 'b', family: 'rpo', base: false }, { playId: 'c', family: 'zone', base: true }];
    expect(preseasonSheet(plays, [], ['c'])).toEqual({ sheet: ['a'], held: ['b', 'c'] });
    expect(filmAudience('joint_practice', 7, [1, 2, 7], 1)).toEqual([7]);
    expect(filmAudience('preseason_game', null, [1, 2, 7], 1)).toEqual([2, 7]);
    expect(heldPlayTiming(0, true)).toBe(0.95);
    expect(heldPlayTiming(2, true)).toBe(1);
  });
  it('opposition shares sum to 100 percent; relabelling as third-unit lowers the evidence; special teams apart', () => {
    const snaps: SnapGrade[] = [
      { personId: 1, grade: 60, opponent: 'first', specialTeams: false, mentalError: null, playId: 'p1' },
      { personId: 1, grade: 50, opponent: [1, 2, 2, 3, 1, 1, 2, 2, 3, 3, 2], specialTeams: false, mentalError: 'wrong alignment', playId: 'p2' },
      { personId: 1, grade: 70, opponent: 'second', specialTeams: true, mentalError: null, playId: 'p3' },
    ];
    const r = edgeReport(snaps)[0]!;
    expect(r.scrimmage.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(r.specialTeams.snaps).toBe(1);
    expect(r.mentalErrors).toEqual([{ playId: 'p2', error: 'wrong alignment' }]);
    const third = edgeReport(snaps.map((s) => ({ ...s, opponent: 'third' as const })))[0]!;
    expect(third.scrimmage.weightedSnaps).toBeLessThan(r.scrimmage.weightedSnaps);
    expect(bandAfter(g(55, 100), 18, third.scrimmage.weightedSnaps).variance).toBeGreaterThan(bandAfter(g(55, 100), 18, r.scrimmage.weightedSnaps).variance);
    expect(mixedOpponentWeight([1, 1, 1])).toBe(1);
    expect(mixedOpponentWeight([2, 3])).toBeCloseTo(0.45);
  });
});

describe('M6.4.1 cutdown board', () => {
  const template = { OL: 8, DB: 4 };
  const mk = (personId: number, row: string, mean: number, over: Partial<CutdownPlayer> = {}): CutdownPlayer =>
    ({ personId, row, grade: g(mean, 16), starter: false, highGuarantee: false, claimRisk: 'low', injured: false, ...over });

  it('cannot be submitted with 54, or with a seventh any-experience practice squad target', () => {
    let s = league({ clubs: 1, perClub: 60, spare: 0 });
    const vets = Array.from({ length: 7 }, (_, i) => 1054 + i);
    s = setFacts(s, vets.map((id) => facts(id, { accruedSeasons: 6, pensionCreditedSeasons: 6 })));
    const players = Array.from({ length: 60 }, (_, i) => mk(1001 + i, i < 8 ? 'OL' : 'DB', 70 - i * 0.5));
    const board54: Board = Object.fromEntries(players.map((p, i) => [String(p.personId), i < 54 ? 'likely' : 'release']));
    expect(checkBoard(board54, players, template, s.players, PRO).errors[0]).toMatch(/54 kept/);
    const board: Board = Object.fromEntries(players.map((p, i) => [String(p.personId), i < 53 ? 'likely' : 'practice_squad']));
    const c = checkBoard(board, players, template, s.players, PRO);
    expect(c.practiceSquad.ineligible).toEqual([1060]);
  });

  it('a board with 7 offensive linemen shows that only 47 can dress', () => {
    let s = league({ clubs: 1, perClub: 53, spare: 0 });
    s = setFacts(s, Array.from({ length: 7 }, (_, i) => facts(1001 + i, { offensiveLineman: true })));
    const players = Array.from({ length: 53 }, (_, i) => mk(1001 + i, i < 7 ? 'OL' : 'DB', 60));
    const board: Board = Object.fromEntries(players.map((p) => [String(p.personId), 'likely']));
    expect(checkBoard(board, players, template, s.players, PRO).canDress).toBe(47);
  });

  it('the staff draft sorts by band against the cut line and files through the roster engine', () => {
    let s = league({ clubs: 2, perClub: 56, spare: 0 });
    const players = Array.from({ length: 56 }, (_, i) => mk(1001 + i, 'DB', 100 - i * 1.5, { grade: g(100 - i * 1.5, 1), ...(i === 0 ? { starter: true } : {}) }));
    const tmpl = { DB: 53 };
    const board = staffBoard(players, tmpl, s.players, PRO);
    expect(board['1001']).toBe('locks');
    expect(board['1002']).toBe('likely');
    expect(board['1056']).toBe('release');
    expect(Object.values(board)).toContain('practice_squad');
    const userBoard: Board = Object.fromEntries(players.map((p, i) => [String(p.personId), i < 53 ? 'likely' : 'release']));
    const out = submitBoard(s, PRO, 1, userBoard, userBoard, true, players, tmpl);
    expect(out.errors).toEqual([]);
    const st = ok(out.result!);
    expect(st.clubs.find((c) => c.clubId === 1)!.entries.filter((e) => e.list === 'active')).toHaveLength(53);
    const gm: Board = { ...userBoard, '1053': 'release', '1054': 'likely' };
    expect(submitBoard(s, PRO, 1, userBoard, gm, false, players, tmpl).disagreements).toEqual([1053, 1054]);
  });
});

describe('M6.4.2 meetings', () => {
  it('assistants grade their own players higher by the configured bias, never shown as a number', () => {
    const r = rng(9);
    let own = 0, other = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const err = (r() + r() + r() - 1.5) * 4;
      own += assistantGrade(50, true, 10, err) - 50;
      other += assistantGrade(50, false, 10, err) - 50;
    }
    expect(own / n - other / n).toBeCloseTo(P.ownPlayerBiasSd * 10, 5);
    expect(ownPlayer(false, 2)).toBe(true);
    expect(ownPlayer(false, 0)).toBe(false);
    expect(meetingHours('offense')).toBe(3);
    expect(meetingHours('special_teams')).toBe(1.5);
    expect(opinionsMissing([1, 2, 3], [{ personId: 2 }])).toEqual([1, 3]);
  });
});

describe('M6.4.3 releases', () => {
  it('in person with honest odds is accepted more often than by message', () => {
    const r = rng(3);
    let a = 0, b = 0;
    for (let i = 0; i < 2000; i++) {
      if (r() < practiceSquadAcceptance('in_person', true, false)) a++;
      if (r() < practiceSquadAcceptance('message', false, false)) b++;
    }
    expect(a).toBeGreaterThan(b);
    expect(practiceSquadAcceptance('in_person', true, true)).toBe(0);
    expect(talkMinutes('in_person', 6)).toBe(20);
    expect(talkMinutes('staff', 6)).toBe(0);
    expect(releaseDayReputation([{ delivery: 'message', yearsAtClub: 1 }]).lockerRoomTrust).toBeLessThan(0);
  });
});

describe('M6.4.4 the day after', () => {
  it('a claim at the limit without a named release is refused', () => {
    expect(claimWithRelease(1, 99, null, 53, PRO)).toEqual({ refused: expect.stringMatching(/name a player/) });
    expect(claimWithRelease(1, 99, 7, 53, PRO)).toEqual({ type: 'claim', clubId: 1, personId: 99, linked: [{ type: 'release', clubId: 1, personId: 7 }] });
  });
  it('claim risk shown as high is realised more often than low across 1,000 cutdowns', () => {
    const r = rng(11);
    const tally = { high: [0, 0], low: [0, 0] } as Record<string, [number, number]>;
    for (let i = 0; i < 1000; i++) {
      const grade = g(45 + r() * 30);
      const need = Math.floor(r() * 16);
      const film = r();
      const shown = claimRisk(grade, 50, need, 32, film);
      const trueChance = Math.min(1, Math.max(0, shown.score + (r() - 0.5) * 0.2));
      const claimed = r() < trueChance;
      if (shown.level !== 'medium') { tally[shown.level]![0]++; if (claimed) tally[shown.level]![1]++; }
    }
    expect(tally.high![1] / tally.high![0]).toBeGreaterThan(tally.low![1] / Math.max(1, tally.low![0]));
  });
  it('no practice squad signing of another club\'s waived player before the claim deadline (roster engine)', async () => {
    const { applyTransaction } = await import('../../src/roster/index.ts');
    let s = league({ clubs: 2, perClub: 54, spare: 0 });
    s = ok(applyTransaction(s, { type: 'cutdown', clubId: 2, moves: [{ type: 'release', clubId: 2, personId: 2054 }] }, PRO));
    const tx = applyTransaction(s, { type: 'sign_practice_squad', clubId: 1, personId: 2054 }, PRO);
    expect(tx.ok).toBe(false);
  });
});

describe('M6.5 camp life', () => {
  it('report day: below the line held out of pads unless let through with more exposure; weight flag over 5 lb', () => {
    const r = reportDay(1, 0.7, -0.05, 0.7, 318, 312);
    expect(r.conditioning).toBe('fail');
    expect(r.flaggedWeight).toBe(true);
    expect(mayPracticeInPads(r, false).allowed).toBe(false);
    expect(mayPracticeInPads(r, true).extraExposure).toBeGreaterThan(1);
  });
});
