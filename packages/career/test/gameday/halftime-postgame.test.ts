// I8.2 halftime with I8.1.2 menu, I8.1.4 uptake and I8.3.1 record; I10 after the game; records.
import { describe, it, expect } from 'vitest';
import {
  halftimeWorkingMinutes, openHalftime, addHalftimeItem, halftimeLeft, halftimeDecider, makeOpeners, suggestedOpener, useCall, keysToCall,
  uptake, uptakeWord, NOT_DELIVERED, gradeAdjustment, visibleResult, adjustmentRow,
  handshake, isRunUp, giveGameBalls, passedOverLoss, ballFromPlayers, suggestedBallCount, injuryUpdate, drawQuestions, runMediaSession, interviewArea, firstNotes,
  dayAfterOptions, dayAfter, submitPlays, officeReply, videoFoulHazardZ, gradingLoad, staffGrade, gradingPlan,
  emptyPostgame, reviseInjury, mediaVisible, findContradictions, pregameCareerView, adjustmentCareerView, kickingLines,
  type Adjustment, type HalftimeSession, type PostgameRecord, type UptakeInput, type GameEvent, type PregameRecord,
} from '../../src/gameday/index.ts';
import { PRO, COLLEGE, stream } from './fixtures.ts';

const adj = (id: string, kind: Adjustment['kind'], unit: Adjustment['unit'] = 'defense'): Adjustment => ({ id, unit, kind, target: 'cover3.flat_rule', citedProblem: 'flat_open_vs_trips', players: ['LB1', 'DB2'], chosenBy: 'user' });

describe('I8.2.1 halftime clock', () => {
  it('13 minutes leave 7 working; a longer rule-set halftime adds the same amount; a delay adds working time', () => {
    expect(halftimeWorkingMinutes(PRO.halftimeMin)).toBe(7);
    expect(halftimeWorkingMinutes(COLLEGE.halftimeMin) - halftimeWorkingMinutes(PRO.halftimeMin)).toBe(COLLEGE.halftimeMin - PRO.halftimeMin);
    expect(halftimeWorkingMinutes(13, 10)).toBe(17);
  });
});

describe('I8.2.2 staff huddle first, players second', () => {
  const open = () => openHalftime(7, 'defense') as HalftimeSession;
  it('starting split 3 staff, 4 players; the total never exceeds a phase', () => {
    let s = open();
    expect([s.staffMin, s.playerMin]).toEqual([3, 4]);
    for (const k of ['coverage', 'protection', 'matchup', 'technique', 'technique'] as const) {
      const n = addHalftimeItem(s, { kind: 'adjustment', adjustment: adj(`a${s.items.length}`, k, k === 'protection' ? 'offense' : 'defense') });
      if (typeof n === 'string') { expect(n).toBe('no_time'); break; }
      s = n;
    }
    expect(s.playerUsed).toBeLessThanOrEqual(s.playerMin);
    expect(halftimeLeft(s).player).toBeGreaterThanOrEqual(0);
  });
  it('three structural changes per unit and one new call', () => {
    let s = openHalftime(30, 'defense', 3) as HalftimeSession;
    for (let i = 0; i < 3; i++) s = addHalftimeItem(s, { kind: 'adjustment', adjustment: adj(`m${i}`, 'matchup') }) as HalftimeSession;
    expect(addHalftimeItem(s, { kind: 'adjustment', adjustment: adj('m4', 'coverage') })).toBe('structural_limit');
    s = addHalftimeItem(s, { kind: 'adjustment', adjustment: adj('n1', 'new_call') }) as HalftimeSession;
    expect(addHalftimeItem(s, { kind: 'adjustment', adjustment: adj('n2', 'new_call') })).toBe('new_call_limit');
  });
  it('acceptance: the user cannot sit in both staff huddles; the other side can be sent back once', () => {
    let s = open();
    expect(addHalftimeItem(s, { kind: 'send_back', unit: 'defense' })).toBe('not_attending');
    s = addHalftimeItem(s, { kind: 'send_back', unit: 'offense' }) as HalftimeSession;
    expect(addHalftimeItem(s, { kind: 'send_back', unit: 'offense' })).toBe('already_sent_back');
    expect(halftimeDecider(s, 'offense', { offense: 'oc', defense: 'dc', special: 'stc' })).toBe('oc');
    expect(halftimeDecider(s, 'defense', { offense: 'oc', defense: 'dc', special: 'stc' })).toBe('user');
  });
  it('team talk costs one player minute; quick items cost 20 to 30 seconds of the staff phase', () => {
    let s = open();
    s = addHalftimeItem(s, { kind: 'team_talk' }) as HalftimeSession;
    expect(s.playerUsed).toBe(1);
    s = addHalftimeItem(s, { kind: 'kicking_lines' }) as HalftimeSession;
    expect(s.staffUsed * 60).toBeGreaterThanOrEqual(20);
    expect(s.staffUsed * 60).toBeLessThanOrEqual(30);
  });
});

describe('I8.2.3 openers and I8.2.4 marks', () => {
  it('three to six calls from the sheet; the script advances only on a scripted call', () => {
    const sheet = new Set(['a', 'b', 'c', 'd']);
    expect(makeOpeners('offense', [{ callId: 'a' }, { callId: 'b' }], sheet)).toBe('count');
    expect(makeOpeners('offense', [{ callId: 'a' }, { callId: 'b' }, { callId: 'z' }], sheet)).toBe('not_on_sheet');
    let s = makeOpeners('offense', [{ callId: 'a' }, { callId: 'b' }, { callId: 'c' }], sheet);
    if (typeof s === 'string') throw new Error(s);
    s = useCall(s, 'd');
    expect(suggestedOpener(s)!.callId).toBe('a');
    s = useCall(s, 'a');
    expect(suggestedOpener(s)!.callId).toBe('b');
    expect(keysToCall('cross_off')).toBe(2);
    expect(keysToCall('star')).toBe(1);
  });
});

describe('I8.1.4 uptake', () => {
  const base: UptakeInput = { start: 'contingency', weeklyKnowledge: 0.8, longTermKnowledge: 0.5, teacher: { kind: 'ai', teaching: 0.5 }, sawPictures: false, structuralInMeeting: 1, structuralLimit: 3, cut: 'none', seriesUsed: 0, roadCrowdNoise: false, heardIt: true };
  it('acceptance (ordering): a practised contingency beats an unpractised re-point', () => {
    expect(uptake(base)).toBeGreaterThan(uptake({ ...base, start: 'repoint' }));
    expect(uptake({ ...base, start: 'repoint' })).toBeCloseTo(0);
  });
  it('table terms: teacher, pictures, extra changes, cut short, series, crowd noise, not told', () => {
    expect(uptake({ ...base, teacher: { kind: 'ai', teaching: 1 } }) - uptake(base)).toBeCloseTo(0.3);
    expect(uptake({ ...base, start: 'repoint', teacher: { kind: 'user', methodFits: true, namesTrueCause: true } })).toBeCloseTo(0.3);
    expect(uptake({ ...base, sawPictures: true }) - uptake(base)).toBeCloseTo(0.2);
    expect(uptake({ ...base, structuralInMeeting: 4 }) - uptake(base)).toBeCloseTo(-0.25);
    expect(uptake({ ...base, cut: 'after' }) - uptake(base)).toBeCloseTo(-0.1);
    expect(uptake({ ...base, cut: 'before' })).toBe(NOT_DELIVERED);
    expect(uptake({ ...base, heardIt: false })).toBe(NOT_DELIVERED);
    expect(uptake({ ...base, start: 'repoint', seriesUsed: 2 })).toBeCloseTo(0.2);
    expect(uptake({ ...base, start: 'repoint', seriesUsed: 20 })).toBeCloseTo(0.8);
    expect(uptake({ ...base, roadCrowdNoise: true }) - uptake(base)).toBeCloseTo(-0.1);
  });
  it('words: solid within 0.2, shaky to 0.6, risky below', () => {
    expect(uptakeWord(0.9, 1)).toBe('solid');
    expect(uptakeWord(0.5, 1)).toBe('shaky');
    expect(uptakeWord(0.3, 1)).toBe('risky');
    expect(uptakeWord(NOT_DELIVERED, 1)).toBe('not_told');
  });
});

describe('I8.3.1 adjustment record', () => {
  const truth = { taggedCauses: ['flat_open_vs_trips'], symptomsOf: { flat_open_vs_trips: ['third_down_failures'] }, causeObject: { flat_open_vs_trips: 'cover3.flat_rule' }, appliedSnaps: 10, executedSnaps: 10 };
  it('acceptance: aimed at the tagged cause and carried out every snap grades yes, yes, 1.0', () => {
    expect(gradeAdjustment(adj('a', 'coverage'), truth)).toEqual({ problemReal: 'yes', fixAddressed: 'yes', executedShare: 1, executed: true });
  });
  it('a symptom is partly; a false problem always fails the fix; never used is untested', () => {
    expect(gradeAdjustment({ ...adj('a', 'coverage'), citedProblem: 'third_down_failures' }, truth).problemReal).toBe('partly');
    expect(gradeAdjustment({ ...adj('a', 'coverage'), citedProblem: 'imaginary' }, truth)).toMatchObject({ problemReal: 'no', fixAddressed: 'no' });
    expect(gradeAdjustment(adj('a', 'coverage'), { ...truth, appliedSnaps: 0, executedSnaps: 0 })).toMatchObject({ executedShare: null, executed: null });
  });
  it('under five plays after: counts only; the career view drops truth grades', () => {
    expect(visibleResult({ plays: 10, successes: 3, yards: 40 }, { plays: 4, successes: 3, yards: 30 }).after).toEqual({ plays: 4, successRate: null, yardsPerPlay: null });
    expect(visibleResult({ plays: 10, successes: 3, yards: 40 }, { plays: 6, successes: 3, yards: 30 }).after.successRate).toBe(0.5);
    const row = adjustmentRow(adj('a', 'coverage'), 'half', ['p12'], { LB1: 'solid' }, { plays: 1, successes: 0, yards: 0 }, { plays: 1, successes: 1, yards: 5 }, truth);
    expect(adjustmentCareerView([row])[0]).not.toHaveProperty('truth');
  });
});

describe('I10.1.1 handshake', () => {
  it('acceptance: default changes nothing; warm with no tie changes nothing; cold after provocation is noticed 20% of the time', () => {
    const d = stream(4);
    expect(handshake({ own: 'normal', other: 'normal', tieExists: true, provoked: true }, d)).toEqual({ tieDelta: 0, mediaNotice: false, writesEvent: false });
    expect(handshake({ own: 'warm', other: 'normal', tieExists: false, provoked: false }, d)).toMatchObject({ tieDelta: 0, writesEvent: false });
    expect(handshake({ own: 'warm', other: 'normal', tieExists: true, provoked: false }, d).tieDelta).toBe(0.02);
    let n = 0;
    for (let i = 0; i < 10000; i++) if (handshake({ own: 'cold', other: 'normal', tieExists: true, provoked: true }, d).mediaNotice) n++;
    expect(Math.abs(n / 10000 - 0.2)).toBeLessThan(0.01);
    expect(isRunUp(24, 3)).toBe(true);
    expect(isRunUp(14, 3)).toBe(false);
  });
});

describe('I10.2.2 game balls', () => {
  it('acceptance: at most three; one event each; a repeat within four weeks gives 0.6', () => {
    expect(giveGameBalls(true, [1, 2, 3, 4].map((i) => ({ id: `p${i}`, kind: 'player' as const, reason: 'x' })))).toBe('too_many');
    const e = giveGameBalls(true, [{ id: 'ol1', kind: 'player', lowProfile: true, reason: 'pancakes' }, { id: 'qb1', kind: 'player', weeksSinceLast: 2, reason: '3 TD' }, { id: 'dc', kind: 'assistant', reason: 'plan' }]);
    if (typeof e === 'string') throw new Error(e);
    expect(e.map((x) => x.gain)).toEqual([0.06, 0.02 * 0.6, 0.02]);
    expect(giveGameBalls(false, [{ id: 'k', kind: 'player', reason: 'record' }])).toBe('loss_needs_milestone');
    expect(giveGameBalls(false, [{ id: 'k', kind: 'player', reason: 'record' }], true)).toHaveLength(1);
    expect(passedOverLoss(2)).toBe(-0.01);
    expect(passedOverLoss(1)).toBe(0);
    expect(ballFromPlayers(false, true, true, stream(1))).toBe(false);
    expect(suggestedBallCount(true)).toBe(3);
  });
});

describe('I10.3.1 injury update', () => {
  it('acceptance: every injury appears; first reads disagree with the truth at the configured rate', () => {
    const inj = Array.from({ length: 5000 }, (_, i) => ({ playerId: `p${i}`, bodyPart: 'knee', trueCategory: 'imaging' as const, concussionEvaluation: i % 10 === 0, finishedGame: true }));
    const lines = injuryUpdate(inj, 'typical', stream(8));
    expect(lines).toHaveLength(5000);
    const right = lines.filter((l) => l.firstRead === 'imaging').length / 5000;
    expect(Math.abs(right - 0.7)).toBeLessThan(0.02);
    expect(lines.filter((l) => l.followUpNextDay)).toHaveLength(500);
    expect(injuryUpdate([{ ...inj[0]!, hospital: true }], 'strong', stream(1))[0]!.firstRead).toBe('hospital');
  });
});

describe('I10.4.1 news conference', () => {
  const events: GameEvent[] = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, topic: i === 0 ? 'decision' : 'opponent', unusual: i === 0 ? 0.3 : 0.2, cost: 0.5, analyticsDisagreed: i === 0 }));
  it('acceptance: 4 to 8 questions, each citing a real event; a disagreed decision is likelier after a loss', () => {
    const d = stream(2);
    let asked = 0, askedWin = 0;
    for (let k = 0; k < 400; k++) {
      const q = drawQuestions(events, true, d);
      expect(q.length).toBeGreaterThanOrEqual(4);
      expect(q.length).toBeLessThanOrEqual(8);
      for (const x of q) expect(events.some((e) => e.id === x.eventId)).toBe(true);
      if (q.some((x) => x.eventId === 'e0')) asked++;
      if (drawQuestions(events, false, d).some((x) => x.eventId === 'e0')) askedWin++;
    }
    expect(asked).toBeGreaterThan(askedWin);
  });
  it('skipping writes a policy violation; answers move relationships only; misstating an injury is a breakable act', () => {
    expect(runMediaSession([], 'skip').acts).toEqual([{ classId: 'media_policy', leaf: 'I10.4.1' }]);
    const qs = [{ n: 1, eventId: 'e1', topic: 'injury' as const, playerId: 'wr1' }, { n: 2, eventId: 'e2', topic: 'official_call' as const }];
    const s = runMediaSession(qs, [{ question: 1, style: 'accountable', injuryDisclosure: 'misstated' }, { question: 2, style: 'criticise_officials' }]);
    expect(s.acts.map((a) => a.classId).sort()).toEqual(['injury_report_shading', 'media_policy']);
    expect(s.effects).toContainEqual({ kind: 'player_trust', playerId: 'wr1', sign: 1 });
    expect(s.effects).toContainEqual({ kind: 'fine_risk', reason: 'officials' });
    expect(interviewArea('qb1', ['qb1', 'wr1', 'lb1'], ['wr1'])).toEqual(['head_coach', 'qb1', 'lb1']);
  });
});

describe('I10.5 notes, the day after, league office, grading', () => {
  it('I10.5.1: at most five must-see tags', () => {
    expect(firstNotes('x', ['1', '2', '3', '4', '5', '6'], {}, ['crew-7', 'crew-7']).mustSee).toHaveLength(5);
  });
  it('I10.5.2 acceptance: options by week and result; the third Victory Monday in four weeks gives 0.36', () => {
    expect(dayAfterOptions('short', true)).toEqual([]);
    expect(dayAfterOptions('normal', false)).toEqual(['normal', 'short']);
    expect(dayAfterOptions('normal', true)).toContain('off');
    const first = dayAfter({ choice: 'off', won: true, sloppy: false, offsInLastFourWeeks: 0, arrivalHourAfterMidnight: null });
    const third = dayAfter({ choice: 'off', won: true, sloppy: false, offsInLastFourWeeks: 2, arrivalHourAfterMidnight: null });
    expect(third.moraleZ / first.moraleZ).toBeCloseTo(0.36);
    expect(first).toMatchObject({ correctionsEfficiency: 0.5, recoveryDays: 1, wednesdaySessionMin: 45, credibilityDelta: 0 });
    expect(dayAfter({ choice: 'off', won: false, sloppy: false, offsInLastFourWeeks: 0, arrivalHourAfterMidnight: null }).credibilityDelta).toBeLessThan(0);
    expect(dayAfter({ choice: 'normal', won: true, sloppy: false, offsInLastFourWeeks: 0, arrivalHourAfterMidnight: 3 })).toMatchObject({ reportShiftH: 2, liftDropped: true });
  });
  it('I10.5.3 acceptance: a tenth play is refused; replies match the truth within the office error', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ playId: `p${i}`, question: 'holding?' }));
    const r = submitPlays([], [...nine, { playId: 'p9', question: 'x' }], PRO.officiatingReviewMaxPlays);
    expect(r.accepted).toHaveLength(9);
    expect(r.refused).toHaveLength(1);
    expect(submitPlays([], nine, COLLEGE.officiatingReviewMaxPlays).accepted).toHaveLength(0);
    const d = stream(6);
    let wrong = 0;
    for (let i = 0; i < 1000; i++) if (officeReply({ callWasRight: i % 2 === 0 }, d) !== (i % 2 === 0 ? 'correct' : 'incorrect')) wrong++;
    expect(wrong / 1000).toBeLessThan(0.08);
    expect(officeReply({ callWasRight: true, unjudgeable: true }, d)).toBe('no_comment');
    expect(videoFoulHazardZ(true)).toBe(-0.02);
  });
  it('I10.5.4: workload, staff agreement rises with observation, and short-week grading', () => {
    expect(gradingLoad('olc', { OL1: 65, OL2: 65, OL3: 65, OL4: 65, OL5: 65, OL6: 5, OL7: 5 })).toMatchObject({ playerSnaps: 335, minutesLow: 167.5, minutesHigh: 335 });
    const agree = (o: number) => { const d = stream(3); let n = 0; for (let i = 0; i < 10000; i++) if (staffGrade(true, o, false, d)) n++; return n; };
    expect(agree(0.9)).toBeGreaterThan(agree(0.2));
    expect(gradingPlan('short', false)).toEqual({ graded: 'none', planningHoursLost: 0 });
    expect(gradingPlan('short', true)).toEqual({ graded: 'starters', planningHoursLost: 3 });
  });
});

describe('records (I1.7.1, I10.6.1)', () => {
  it('the career view of the pregame record shows reported values, never the truth', () => {
    const k = kickingLines({ north: () => 0.8, south: () => 0.5 }, 0.5, PRO, stream(1));
    const rec: PregameRecord = {
      gameId: 'g1', rulesetId: 'pro_2026', userRole: 'head_coach', timeline: [], workouts: [{ report: { playerId: 'wr1', verdict: 'full', snapCeiling: null, reported: 0.9, aggravated: false }, trueReadiness: 0.6, decision: 'active' }],
      active: [], inactive: [], staffProposedActive: [], emergencyQb: null, radio: { offense: [], defensePrimary: null, defenseBackup: null }, kickingLines: k,
      sheetEdits: [], decisionBookAccepted: true, instructions: [], captains: null, toss: null, talk: null, challengeDesignee: null,
    };
    const v = pregameCareerView(rec);
    expect(JSON.stringify(v)).not.toContain('trueReadiness');
    expect(v.kickingLines).toEqual(k.reported);
  });
  it('a revised injury is a new linked row; internal items need a leak; contradictions are found', () => {
    let r: PostgameRecord = { ...emptyPostgame('g1'), injuries: [{ playerId: 'rb1', bodyPart: 'ankle', firstRead: 'day_to_day' as const, inProtocol: false, finishedGame: true, followUpNextDay: false }], talk: { tone: 'level', points: [], effect: {} as never, captainSpoke: false } };
    r = reviseInjury(r, 'rb1', 'likely_miss_time', 'mon');
    expect(r.injuries[0]!.firstRead).toBe('day_to_day');
    expect(r.revisions).toEqual([{ playerId: 'rb1', revises: 0, category: 'likely_miss_time', when: 'mon' }]);
    expect(mediaVisible(r)).not.toHaveProperty('talk');
    expect(mediaVisible(r, ['talk'])).toHaveProperty('talk');
    expect(findContradictions(r, { rb1: 4 }, true, 1).map((c) => c.kind)).toEqual(['day_to_day_missed', 'quarterback_change']);
    expect(findContradictions(r, { rb1: 2 }, true, 5)).toEqual([]);
  });
});
