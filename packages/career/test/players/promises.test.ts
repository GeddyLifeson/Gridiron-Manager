// L1.3.1, L1.3.2, L1.4 and L1.5.1 acceptance.
import { describe, expect, it } from 'vitest';
import {
  applyWordEvent, askedPlayReadiness, callerOrSystemChange, closeOnLeaving, deliverRelease, incentiveFlag, incentiveMemory,
  isPublicContradiction, judgePromise, newCoachWord, newRecord, newSharedLanguage, qbWeek, releasePromise, reportPropensity,
  returnDecision, roomWarnings, starterCheckDue, statementMultiplier, transferRiskContribution, warnBeforeChange,
  type LedgerPromise, type PromiseFacts, type PromiseType,
} from '../../src/players/index.ts';

const D = (seasonYear: number, dayIndex: number) => ({ seasonYear, dayIndex });
let nextId = 1;
const promise = (type: PromiseType, over: Partial<LedgerPromise> = {}): LedgerPromise => ({
  id: nextId++, fromPersonId: 1, toPersonId: 54, type, measure: {}, madeOn: D(2030, 10), due: D(2030, 30), status: 'open',
  room: 'LB', onBehalfOf: null, rung: 'head_coach', beyondAuthority: false, fromRecruiting: false, pathBack: false, ...over,
});

describe('L1.3.1 promise ledger', () => {
  const cases: [PromiseType, Partial<LedgerPromise>, PromiseFacts, PromiseFacts][] = [
    ['start', {}, { startedOpeningSnap: true }, { startedOpeningSnap: false }],
    ['snap_share', { measure: { threshold: 0.5, games: 3 } }, { snapShares: [0.2, 0.6, 0.5, 0.7] }, { snapShares: [0.9, 0.4, 0.4, 0.5] }],
    ['touches', { measure: { threshold: 10, games: 2 } }, { touchesPerGame: [12, 9, 11] }, { touchesPerGame: [12, 4, 9] }],
    ['targets', { measure: { threshold: 6, games: 2 } }, { targetsPerGame: [6, 6] }, { targetsPerGame: [2, 3] }],
    ['compete', {}, { firstTeamPracticeReps: 2 }, { firstTeamPracticeReps: 1 }],
    ['position', { measure: { position: 'WILL' } }, { positionSnapShare: 0.5 }, { positionSnapShare: 0.3 }],
    ['speak_to_gm', {}, { raisedInRosterMeeting: true }, { raisedInRosterMeeting: false }],
    ['redshirt', {}, { redshirted: true }, { redshirted: false }],
    ['no_redshirt', {}, { redshirted: false }, { redshirted: true }],
    ['hear_first', {}, { roleChangePostedBeforeTalk: false }, { roleChangePostedBeforeTalk: true }],
  ];
  it.each(cases)('%s has a machine-checkable test', (type, over, keep, brk) => {
    const p = promise(type, over);
    expect(judgePromise(p, keep, D(2030, 30))).toMatchObject({ outcome: 'kept', memoryKind: 'promise_kept', wordChange: 1 });
    expect(judgePromise(p, brk, D(2030, 30))).toMatchObject({ outcome: 'broken', memoryKind: 'promise_broken', wordChange: -3 });
  });

  it('waits for the due date and for the facts', () => {
    expect(judgePromise(promise('start'), { startedOpeningSnap: false }, D(2030, 29)).outcome).toBe('pending');
    expect(judgePromise(promise('snap_share', { measure: { threshold: 0.5, games: 3 } }), { snapShares: [1] }, D(2030, 30)).outcome).toBe('pending');
  });

  it('voids on injury or his own discipline case, with no penalty; a released promise carries none', () => {
    expect(judgePromise(promise('start'), { startedOpeningSnap: false, injured: true }, D(2030, 30))).toMatchObject({ outcome: 'void', memoryKind: null, wordChange: 0 });
    expect(judgePromise(promise('start'), { startedOpeningSnap: false, ownDisciplineCase: true }, D(2030, 30)).outcome).toBe('void');
    const rel = releasePromise(promise('start'));
    expect(judgePromise(rel, { startedOpeningSnap: false }, D(2030, 30)).memoryKind).toBeNull();
  });

  it('a kept path back gives the +20 path-back memory', () => {
    expect(judgePromise(promise('compete', { pathBack: true }), { firstTeamPracticeReps: 3 }, D(2030, 30)).memoryKind).toBe('path_back_honoured');
    expect(judgePromise(promise('compete', { pathBack: true }), { firstTeamPracticeReps: 0 }, D(2030, 30)).memoryKind).toBe('promise_broken');
  });

  it('warns before a depth chart that would break a promise commits', () => {
    const all = [promise('start'), promise('position', { toPersonId: 55, measure: { position: 'MIKE' } }), promise('hear_first', { toPersonId: 56 })];
    const w = warnBeforeChange(all, { starters: new Set([55]), positions: new Map([[55, 'WILL']]), roleDrops: new Map([[56, false]]), nextGame: D(2030, 30) });
    expect(w.map((x) => x.toPersonId)).toEqual([54, 55, 56]);
    expect(warnBeforeChange(all, { starters: new Set([54]), positions: new Map([[55, 'MIKE']]), roleDrops: new Map([[56, true]]), nextGame: D(2030, 30) })).toEqual([]);
  });

  it('more than five open promises in one room raises a staff warning', () => {
    const five = Array.from({ length: 5 }, () => promise('compete'));
    expect(roomWarnings(five)).toEqual([]);
    expect(roomWarnings([...five, promise('compete')])).toEqual([{ room: 'LB', open: 6, textKey: 'players.promise.room_conflict' }]);
  });

  it('closes open promises as left when the coach goes, including ones made on his behalf', () => {
    const all = [promise('start'), promise('start', { fromPersonId: 9, onBehalfOf: 1 }), promise('start', { fromPersonId: 9 })];
    const r = closeOnLeaving(all, 1, [54], true);
    expect(r.promises.map((p) => p.status)).toEqual(['left', 'left', 'open']);
    expect(r.recruitMemories).toEqual([{ playerId: 54, memoryKind: 'coach_left_recruit', scale: 2, transferTrigger: true }]);
  });

  it('a stated starter under 30 percent of snaps in two straight healthy games raises the check', () => {
    expect(starterCheckDue([0.8, 0.2, 0.25])).toBe(true);
    expect(starterCheckDue([0.2, 0.35])).toBe(false);
  });
});

describe('L1.3.2 honesty', () => {
  it('changes only through logged events and multiplies statements by 0.5 + word/100', () => {
    let w = newCoachWord(1, 0);
    expect(statementMultiplier(w)).toBeCloseTo(1.1, 10);
    w = applyWordEvent(w, { kind: 'caught_falsehood', sourceEventId: 11 });
    w = applyWordEvent(w, { kind: 'promise_kept', sourceEventId: 12 });
    w = applyWordEvent(w, { kind: 'public_contradicted', sourceEventId: 13 });
    expect(w.value).toBe(51);
    expect(w.history.map((h) => h.sourceEventId)).toEqual([11, 12, 13]);
    expect(w.history.reduce((s, h) => s + h.change, 60)).toBe(w.value);
  });

  it('game-plan misdirection and protective statements are not falsehoods', () => {
    expect(isPublicContradiction({ daysToContradiction: 5, gamePlanMisdirection: false, protectiveOrNeutral: false })).toBe(true);
    expect(isPublicContradiction({ daysToContradiction: 20, gamePlanMisdirection: false, protectiveOrNeutral: false })).toBe(false);
    expect(isPublicContradiction({ daysToContradiction: 5, gamePlanMisdirection: true, protectiveOrNeutral: false })).toBe(false);
    expect(isPublicContradiction({ daysToContradiction: 5, gamePlanMisdirection: false, protectiveOrNeutral: true })).toBe(false);
  });
});

describe('L1.4 special cases', () => {
  it('shared language grows with meetings and games, survives, and falls 10 on a caller change', () => {
    let s = newSharedLanguage(1, 12);
    let memories = 0;
    for (let w = 0; w < 6; w++) { const r = qbWeek(s, { meetingHeld: true, gamesTogether: 1, inputTaken: false }); s = r.state; if (r.ignoredMemory) memories++; }
    expect(s.value).toBe(18);
    expect(memories).toBe(2);
    expect(callerOrSystemChange(s).value).toBe(8);
    expect(askedPlayReadiness(true)).toBe(3);
  });

  it('report propensity responds to each input in the stated direction', () => {
    const base = { base: 50, trust: 50, teammatePressuredDates: [], today: D(2030, 100), contractYear: false };
    expect(reportPropensity(base)).toBe(50);
    expect(reportPropensity({ ...base, trust: 80 })).toBe(59);
    expect(reportPropensity({ ...base, teammatePressuredDates: [D(2030, 80)] })).toBe(35);
    expect(reportPropensity({ ...base, teammatePressuredDates: [D(2030, 20)] })).toBe(50);
    expect(reportPropensity({ ...base, contractYear: true })).toBe(40);
  });

  it('returning an uncleared concussion is offered with a warning and logged once; pressing writes memories', () => {
    const v = returnDecision('full', false, false, true);
    expect([v.protocolViolation, v.warningKey]).toEqual([true, 'players.injury.concussion_protocol_warning']);
    const p = returnDecision('play_through', true, true, false);
    expect([p.playerMemory, p.witnessMemory, p.flagToLeague]).toEqual(['pressured_play_hurt', 'teammate_pressured_hurt', true]);
    expect(returnDecision('hold_out', true, true, true).protocolViolation).toBe(false);
  });

  it('every release has one delivery record; a leak forces media first unless he was told the same day', () => {
    expect(deliverRelease(54, D(2030, 200), 'head_coach_in_person', 6, false, false)).toMatchObject({ memoryKind: 'cut_head_coach_in_person', scale: 1.5 });
    expect(deliverRelease(54, D(2030, 200), 'head_coach_in_person', 2, true, false).memoryKind).toBe('cut_media_first');
    expect(deliverRelease(54, D(2030, 200), 'staffer_no_word', 2, true, true).memoryKind).toBe('cut_staffer_no_word');
  });

  it('flags incentives only when reachable at 1.5 times his rate in the final three weeks, and never without contracts', () => {
    const s = { playerId: 1, gap: 38, seasonRatePerGame: 10, gamesLeft: 3, weeksLeft: 3 };
    expect(incentiveFlag(s, true)).toBe(true);
    expect(incentiveFlag({ ...s, gap: 46 }, true)).toBe(false);
    expect(incentiveFlag({ ...s, weeksLeft: 4 }, true)).toBe(false);
    expect(incentiveFlag(s, false)).toBe(false);
    expect(incentiveMemory(true, [30, 32], 28, true)).toBe('incentive_reached_helped');
    expect(incentiveMemory(false, [10, 0], 28, true)).toBe('incentive_missed_benched');
  });
});

describe('L1.5.1 transfer risk contribution', () => {
  it('is 0.4 (60 - role belief) + 0.3 (50 - trust) + 20 per promise broken in the last year, floored at 0', () => {
    const r = { ...newRecord({ holderId: 54, aboutId: 1, coachPlayerRegard: 0, season: 2030 }), trust: 30, roleBelief: 40 };
    const broken = promise('start', { status: 'broken' });
    const old = promise('start', { status: 'broken' });
    const v = transferRiskContribution(r, [broken, old], new Map([[broken.id, D(2030, 100)], [old.id, D(2028, 100)]]), D(2030, 150));
    expect(v).toBeCloseTo(8 + 6 + 20, 10);
    expect(transferRiskContribution({ ...r, trust: 100, roleBelief: 100 }, [], new Map(), D(2030, 150))).toBe(0);
  });
});
