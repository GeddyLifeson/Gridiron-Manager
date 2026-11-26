// L2.2, L2.3, L2.5, L2.6, L3.3, L3.4, L3.5: leaders, veterans, trouble, consistency, the foul modifier, college, lower rungs.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  disciplineRules, newConsistency, recordCase, consistencyWeek, comparisonCases, caseDelta, playerView, roomConsistency, calloutsUneven,
  isStar, starOutcome, teamDiscipline, disciplineScore, bounds, DISCIPLINE_HAZARDS, NEUTRAL_DISCIPLINE,
  decider, STARTING_MINIMUMS, mayGenerateMandatoryOffence, minimumGames, undercutsMinimum, aidReductionMemory, hiredGunTie, payGapTie, heavier,
  captainVote, settleCaptains, defaultSeats, surfacingProbability, respond, meetingAgenda, councilSizeOk, policingEffect,
  stepRoomLeader, roomLeaderModifiers, leaderReleaseCohesionDrop, pairMentor, mentorEffects, traditionPolicy, inSlump, slumpChoiceTrust, kickConfidenceTerm,
  playersOnlyMeeting, publicComplaint, stepRoomLost, roomLostModifiers, ROOM_OK, roomVisibility, mayEditRules, assistantChoice, reportConfidence, keptQuietBecameCrisis,
  PARAMS, lp, type CaseRecord, type CaptainCandidate, type RoomLostState,
} from '../../src/locker-room/index.ts';
import { COLLEGE_2026, PRO_2026, ruleSet, seeded, ties } from './fixtures.ts';

const PRO = disciplineRules(ruleSet(PRO_2026));
const COL = disciplineRules(ruleSet(COLLEGE_2026));

describe('params', () => {
  it('every parameter sits inside its own range and says where it came from', () => {
    for (const p of PARAMS.params) {
      expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max);
      expect(['bible', 'assumption']).toContain(p.basis); expect(p.leaf.length).toBeGreaterThan(0);
    }
    expect(() => lp('nope')).toThrow();
  });
});

const c = (o: Partial<CaseRecord>): CaseRecord => ({ violationId: 1, playerId: 1, offenceId: 'late', day: 1, level: 2, influence: 40, witnessShare: 1, room: 'wr', ...o });

describe('consistency (L3.3.1)', () => {
  it('a scripted case list is reproducible and moves in the stated directions', () => {
    const script = [c({ playerId: 1 }), c({ playerId: 2 }), c({ playerId: 3, level: 0, influence: 90 }), c({ playerId: 4, level: 2 })];
    const run = () => script.reduce(recordCase, newConsistency()).value;
    expect(run()).toBe(run());
    let s = recordCase(newConsistency(), c({}));
    expect(s.value).toBe(60); // first case sets the precedent
    s = recordCase(s, c({ playerId: 2 }));
    expect(s.value).toBe(61.5); // equal treatment
    const star = recordCase(s, c({ playerId: 3, level: 0, influence: 90 }));
    expect(star.value).toBeCloseTo(61.5 - 4 * 2 * 1); // lighter for a higher-influence player
    const example = recordCase(s, c({ playerId: 3, level: 4, influence: 90 }));
    expect(example.value).toBe(60.5); // heavier on the star reads as making an example
  });
  it('lighter treatment scales with the witness share', () => {
    const prior = [c({})];
    expect(caseDelta(prior, c({ level: 0, influence: 90, witnessShare: 0.25 }))).toBeCloseTo(-2);
  });
  it('the panel shows the last three comparison cases', () => {
    let s = newConsistency();
    for (let i = 1; i <= 5; i++) s = recordCase(s, c({ violationId: i, playerId: i }));
    expect(comparisonCases(s, 'late').map((x) => x.violationId)).toEqual([3, 4, 5]);
  });
  it('decays toward 60 on quiet weeks; the H4.2.2 hook costs 3', () => {
    const hi = { ...newConsistency(), value: 70 };
    expect(consistencyWeek(hi, false, false).value).toBe(69);
    expect(consistencyWeek({ ...hi, value: 50 }, false, false).value).toBe(51);
    expect(consistencyWeek(hi, true, true).value).toBe(67);
    expect(calloutsUneven(2, 1)).toBe(true); expect(calloutsUneven(2, 0)).toBe(false);
  });
  it('per-player and per-room views weigh only the cases seen', () => {
    let s = newConsistency();
    s = recordCase(s, c({ room: 'wr' })); s = recordCase(s, c({ room: 'ol', playerId: 2 })); s = recordCase(s, c({ room: 'ol', playerId: 3, level: 0, influence: 95 }));
    expect(roomConsistency(s, 'wr')).toBe(60);
    expect(roomConsistency(s, 'ol')).toBeLessThan(60);
    expect(playerView(s, () => false)).toBe(60);
  });
});

describe('the star-player problem (L3.3.2)', () => {
  it('stars by influence or grade; the +4 fires once; low-trust stars take stress; owner conflict', () => {
    expect(isStar({ influence: 71, gradePercentile: 10 })).toBe(true);
    expect(isStar({ influence: 10, gradePercentile: 80 })).toBe(true);
    expect(isStar({ influence: 70, gradePercentile: 75 })).toBe(false);
    expect(starOutcome(true, true, 60, false, false).cultureEvent).toBe(4);
    expect(starOutcome(true, true, 60, true, false).cultureEvent).toBe(0);
    expect(starOutcome(false, true, 20, false, true)).toEqual({ cultureEvent: 0, stress: 20, ownerSignal: -1 });
    expect(starOutcome(false, false, 20, false, true).ownerSignal).toBe(1);
  });
});

describe('the team discipline modifier (L3.4.1, L2.4.3)', () => {
  const mid = { culture: 50, consistency: 50, strictness: 50, roomLost: false };
  it('off_presnap never leaves 0.95 to 1.05 and every clamp holds', () => {
    const draw = seeded(11);
    for (let i = 0; i < 2000; i++) {
      const t = teamDiscipline({ culture: 300 * draw() - 100, consistency: 300 * draw() - 100, strictness: 300 * draw() - 100, roomLost: draw() < 0.1 }, PRO);
      expect(t.off_presnap).toBeGreaterThanOrEqual(0.95); expect(t.off_presnap).toBeLessThanOrEqual(1.05);
      for (const h of DISCIPLINE_HAZARDS) { const b = bounds(h, PRO); expect(t[h]).toBeGreaterThanOrEqual(b.lo); expect(t[h]).toBeLessThanOrEqual(b.hi); }
    }
  });
  it('better standards lower the multipliers; strict rules unevenly applied give nothing; room lost is worst', () => {
    const good = teamDiscipline({ culture: 90, consistency: 90, strictness: 90, roomLost: false }, PRO);
    const bad = teamDiscipline({ culture: 10, consistency: 10, strictness: 10, roomLost: false }, PRO);
    for (const h of DISCIPLINE_HAZARDS) expect(good[h]).toBeLessThan(bad[h]);
    expect(disciplineScore({ ...mid, consistency: 0, strictness: 100 })).toBe(disciplineScore({ ...mid, consistency: 0, strictness: 0 }));
    expect(teamDiscipline({ ...mid, roomLost: true }, PRO)).toEqual({ off_presnap: 1.05, def_presnap: 1.15, def_coverage: 1.1, post_play: 1.075 });
    expect(disciplineScore({ culture: 100, consistency: 100, strictness: 100, roomLost: false })).toBe(100);
  });
  it('the school code model widens the coach part by 1.25 around 1.0', () => {
    expect(bounds('def_presnap', COL).lo).toBeCloseTo(1 - 0.15 * 1.25);
    expect(bounds('off_presnap', COL).hi).toBeCloseTo(1.0625);
    expect(NEUTRAL_DISCIPLINE.def_coverage).toBe(1);
  });
  it('only foul hazards: no fumble, blocking, catching or tackling key exists, and no fumble code reads the modifier', () => {
    for (const h of DISCIPLINE_HAZARDS) expect(h).not.toMatch(/fumble|block|catch|tackl|holding/);
    const root = join(__dirname, '../../../..');
    const walk = (d: string, out: string[] = []): string[] => {
      if (!existsSync(d)) return out;
      for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p, out); } else if (/\.tsx?$/.test(f)) out.push(p); }
      return out;
    };
    const readers: string[] = [];
    for (const pkg of readdirSync(join(root, 'packages'))) {
      for (const f of walk(join(root, 'packages', pkg, 'src'))) {
        const rel = relative(root, f);
        if (rel.includes('locker-room')) continue;
        const src = readFileSync(f, 'utf8');
        if (/teamDiscipline|team_discipline|locker-room|locker_room/.test(src) && /fumble/i.test(src)) readers.push(rel);
      }
    }
    expect(readers).toEqual([]);
    const self = readFileSync(join(root, 'packages/career/src/locker-room/modifier.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(self).not.toMatch(/fumble/i);
  });
});

const cand = (id: number, unit: CaptainCandidate['unit'], influence: number, trustInCoach = 60): CaptainCandidate => ({ id, unit, influence, trustInCoach });

describe('captains (L2.2.1)', () => {
  const players = [cand(1, 'offense', 90, 30), cand(2, 'offense', 70), cand(3, 'offense', 20), cand(4, 'defense', 80), cand(5, 'defense', 60), cand(6, 'defense', 10), cand(7, 'special_teams', 50), cand(8, 'special_teams', 40)];
  const seats = { offense: 1, defense: 1, special_teams: 1 };
  it('the vote is reproducible and follows tie + influence', () => {
    const t = ties([[3, 2, 90]]);
    const a = captainVote(players, t, seats); const b = captainVote(players, t, seats);
    expect(a.winners).toEqual(b.winners);
    expect(a.winners).toEqual([2, 4, 7]); // the tie pulls player 3's vote to 2
    expect(captainVote(players, ties(), seats).winners).toEqual([1, 4, 7]);
    expect(defaultSeats().offense + defaultSeats().defense + defaultSeats().special_teams).toBe(6);
  });
  it('appointment and veto costs apply once; low-trust voted captains resist', () => {
    const voted = captainVote(players, ties(), seats).winners;
    const v = settleCaptains('vote', voted, players);
    expect(v.teamTrust).toBe(0); expect(v.resisters).toEqual([1]);
    const ap = settleCaptains('appoint', voted, players, [2, 4, 7]);
    expect(ap.teamTrust).toBe(-3); expect(ap.passedOver.get(1)).toBe(-8);
    const ve = settleCaptains('vote_with_veto', voted, players, [], { out: 1, in: 2 });
    expect(ve.captains).toEqual([2, 4, 7]); expect(ve.teamTrust).toBe(-6); expect(ve.resisters).toEqual([]);
  });
});

describe('leadership council (L2.2.2)', () => {
  const members = [{ id: 10, trustInCoach: 50 }, { id: 11, trustInCoach: 70 }];
  const issue = { id: 1, involved: [20], kind: 'morale_cluster' as const };
  it('surfacing matches the formula over 10,000 trials within 1 percent', () => {
    const t = ties([[10, 20, 60]]);
    const p = surfacingProbability(members, issue, t);
    expect(p).toBeCloseTo(0.2 + 0.6 * 0.6);
    const draw = seeded(5); let hits = 0;
    for (let i = 0; i < 10000; i++) if (meetingAgenda(members, [issue], t, new Set(), draw).length === 1) hits++;
    expect(Math.abs(hits / 10000 - p)).toBeLessThan(0.01);
  });
  it('a council with no tie into the room is blind to it', () => {
    expect(surfacingProbability(members, issue, ties())).toBe(0);
  });
  it('act, explain and an item deferred twice is closed', () => {
    const item = { issueId: 1, deferrals: 0, closed: false };
    expect(respond(item, 'act', 50)).toMatchObject({ memberTrust: 4, groupTrust: 2 });
    expect(respond(item, 'explain', 50).memberTrust).toBe(0);
    expect(respond(item, 'explain', 100).memberTrust).toBe(1);
    const once = respond(item, 'defer', 50); expect(once.item.closed).toBe(false);
    const twice = respond(once.item, 'defer', 50); expect(twice.item.closed).toBe(true); expect(twice.memberTrust).toBe(-5);
    expect(meetingAgenda(members, [issue], ties([[10, 20, 60]]), new Set([1]), seeded(1))).toEqual([]);
  });
  it('size and player policing by culture', () => {
    expect(councilSizeOk(6)).toBe(true); expect(councilSizeOk(13)).toBe(false);
    expect(policingEffect(true, 61).works).toBe(true);
    expect(policingEffect(true, 39)).toEqual({ works: false, memberStanding: -3 });
    expect(policingEffect(true, 50).works).toBe(false);
  });
});

describe('position-room leaders (L2.2.3)', () => {
  it('the leader changes at most once in four weeks without a roster move, with a 10-point hysteresis', () => {
    let s = { room: 'wr', leaderId: null as number | null, lastRecomputeWeek: 0, lastChangeWeek: 0 };
    s = stepRoomLeader(s, 0, new Map([[1, 60], [2, 55]]));
    expect(s.leaderId).toBe(1);
    const changes: number[] = [];
    const draw = seeded(9);
    for (let w = 1; w <= 52; w++) {
      const prev = s.leaderId;
      s = stepRoomLeader(s, w, new Map([[1, 50 + 20 * draw()], [2, 50 + 20 * draw()]]));
      if (s.leaderId !== prev) changes.push(w);
    }
    for (let i = 1; i < changes.length; i++) expect(changes[i]! - changes[i - 1]!).toBeGreaterThanOrEqual(4);
    const gone = stepRoomLeader({ ...s, leaderId: 1, lastRecomputeWeek: 52 }, 53, new Map([[2, 40]]));
    expect(gone.leaderId).toBe(2);
  });
  it('modifiers by work ethic, doubled study where class load applies', () => {
    expect(roomLeaderModifiers(80)).toEqual({ knowledgeGain: 0.03, practiceEffort: 0 });
    expect(roomLeaderModifiers(80, lp('college.studyMultiplier')).knowledgeGain).toBeCloseTo(0.06);
    expect(roomLeaderModifiers(30).practiceEffort).toBe(-0.02);
    expect(leaderReleaseCohesionDrop()).toBe(-10);
  });
});

describe('mentors and specialists (L2.3)', () => {
  it('a willing mentor helps only in the first season; competition is warned', () => {
    const p = pairMentor({ id: 1, leadership: 60, room: 'qb' }, 2, 'qb', false);
    expect(mentorEffects(p, 0)).toEqual({ knowledgeGain: 0.05, tie: 10 });
    expect(mentorEffects(p, 1).knowledgeGain).toBe(0);
    const rival = pairMentor({ id: 1, leadership: 90, room: 'qb' }, 2, 'qb', true);
    expect(rival.willing).toBe(false); expect(rival.directCompetitionWarning).toBe(true);
    expect(() => pairMentor({ id: 1, leadership: 90, room: 'ol' }, 2, 'qb', false)).toThrow();
  });
  it('a tradition ban never removes hazing, only cuts it to a quarter', () => {
    expect(traditionPolicy('banned')).toEqual({ veteranTrust: -1, hazingMultiplier: 0.25 });
    expect(traditionPolicy('allowed').hazingMultiplier).toBeGreaterThan(traditionPolicy('limited').hazingMultiplier);
  });
  it('slumps change relationships, never accuracy (confidence switch at 0)', () => {
    expect(inSlump([{ missesInRange: 1 }, { missesInRange: 1 }])).toBe(true);
    expect(inSlump([{ missesInRange: 2 }])).toBe(false);
    expect(slumpChoiceTrust('back_publicly')).toBe(10); expect(slumpChoiceTrust('bring_in_competition')).toBe(-10);
    // Statistical independence: with the switch at 0 the term is 0 whatever the history.
    const draw = seeded(3);
    for (let i = 0; i < 1000; i++) expect(kickConfidenceTerm(draw() * 10 - 5)).toBe(0);
  });
});

describe('signs of trouble (L2.5)', () => {
  it('players-only meetings mean what the leaders make of them', () => {
    expect(playersOnlyMeeting({ losingStreak: 2, captains: [{ influence: 90, trustInCoach: 90 }] })).toBeNull();
    expect(playersOnlyMeeting({ losingStreak: 3, captains: [{ influence: 60, trustInCoach: 90 }] })).toBeNull();
    expect(playersOnlyMeeting({ losingStreak: 3, captains: [{ influence: 80, trustInCoach: 60 }] })).toMatchObject({ meaning: 'positive', cultureDelta: 3 });
    expect(playersOnlyMeeting({ losingStreak: 4, captains: [{ influence: 80, trustInCoach: 30 }] })).toMatchObject({ meaning: 'warning' });
    expect(publicComplaint({ playerId: 1, ego: 80, roleBelief: 20, leakPropensity: 70 })).not.toBeNull();
    expect(publicComplaint({ playerId: 1, ego: 80, roleBelief: 50, leakPropensity: 70 })).toBeNull();
  });
  it('the flag cannot set without four weeks of visible signs first, and clears after three good weeks', () => {
    let s: RoomLostState = ROOM_OK;
    for (let w = 1; w <= 8; w++) s = stepRoomLost(s, { week: w, weightedTrust: 20, culture: 20, visibleSign: false }).state;
    expect(s.flag).toBe(false);
    let set = 0;
    for (let w = 9; w <= 14; w++) { const r = stepRoomLost(s, { week: w, weightedTrust: 20, culture: 20, visibleSign: true }); s = r.state; if (r.event === 'set') set = w; }
    expect(s.flag).toBe(true); expect(set).toBe(12);
    for (let w = 15; w <= 16; w++) s = stepRoomLost(s, { week: w, weightedTrust: 45, culture: 45, visibleSign: false }).state;
    expect(s.flag).toBe(true);
    const r = stepRoomLost(s, { week: 17, weightedTrust: 45, culture: 45, visibleSign: false });
    expect(r.event).toBe('cleared'); expect(r.state.flag).toBe(false);
  });
  it('modifiers match the list exactly and are removed when the flag clears', () => {
    expect(roomLostModifiers(true)).toMatchObject({ meetingAttention: 0.85, practiceEffort: 0.85, disciplineWorst: true, pursuitLapseChance: 0.03 });
    expect(roomLostModifiers(false)).toMatchObject({ meetingAttention: 1, practiceEffort: 1, disciplineWorst: false, pursuitLapseChance: 0 });
  });
});

describe('college discipline and the college room (L3.5.1, L2.6.1)', () => {
  it('every case shows its deciding authority', () => {
    expect(decider('student_code', 'coach_led')).toBe('university_conduct_office');
    expect(decider('team_rule', 'coach_led')).toBe('head_coach');
    expect(decider('serious', 'committee')).toBe('conduct_committee');
    expect(decider('serious', 'director_led')).toBe('athletic_director');
  });
  it('mandatory minimums: never generated for real-imported people; less than the minimum is the breakable act', () => {
    expect(mayGenerateMandatoryOffence('imported')).toBe(false);
    expect(mayGenerateMandatoryOffence('generated')).toBe(true);
    const dui = STARTING_MINIMUMS.find((m) => m.offenceKey === 'dui_charge')!;
    expect(minimumGames(dui, 12, 8)).toBe(2);
    expect(undercutsMinimum(dui, 1, 12, 8, true)).toBe(true);
    expect(undercutsMinimum(dui, 2, 12, 8, true)).toBe(false);
    expect(undercutsMinimum(dui, 3, 12, 8, false)).toBe(true);
  });
  it('aid reduction memory, hired-gun fade, pay-gap friction, menu order', () => {
    expect(aidReductionMemory()).toMatchObject({ strength: -30, halfLifeWeeks: 104 });
    expect(hiredGunTie(0)).toBe(-10); expect(hiredGunTie(5)).toBe(-5); expect(hiredGunTie(10)).toBe(0);
    expect(payGapTie(true, true, false)).toBe(-10); expect(payGapTie(true, true, true)).toBe(-5); expect(payGapTie(false, true, false)).toBe(0);
    expect(heavier('warning', 'dismissal')).toBe('dismissal');
  });
});

describe('lower rungs (L2.6.2, L3.5.2)', () => {
  it('visibility matches the rule for each rung', () => {
    const pc = { rung: 'position_coach' as const, rooms: ['wr'], side: 'offense' as const };
    expect(roomVisibility(pc, 'wr', 'offense')).toBe('full');
    expect(roomVisibility(pc, 'ol', 'offense')).toBe('banded');
    expect(roomVisibility(pc, 'dl', 'defense')).toBe('news_only');
    expect(roomVisibility({ rung: 'coordinator', rooms: [], side: 'defense' }, 'dl', 'defense')).toBe('full');
    expect(roomVisibility({ rung: 'graduate_assistant', rooms: ['scout'], side: null }, 'scout', 'offense')).toBe('full');
    expect(roomVisibility({ rung: 'head_coach', rooms: [], side: null }, 'dl', 'defense')).toBe('full');
  });
  it('rule editing is locked below head coach; assistant choices have their costs', () => {
    expect(mayEditRules('head_coach')).toBe(true); expect(mayEditRules('coordinator')).toBe(false);
    expect(assistantChoice('position_coach', 'handle_in_room', true, true)).toEqual({ playerTrust: 2, standingWithBoss: -6, roomCoachBond: 0 });
    expect(assistantChoice('position_coach', 'report_up', true, false)).toEqual({ playerTrust: 0, standingWithBoss: 1, roomCoachBond: -1 });
    expect(() => assistantChoice('graduate_assistant', 'handle_in_room', false, false)).toThrow();
    expect(reportConfidence(true)).toEqual({ playerTrust: -15, standingWithBoss: 3 });
    expect(keptQuietBecameCrisis(true)).toBe(-8);
  });
});
