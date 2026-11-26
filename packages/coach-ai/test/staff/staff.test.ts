// Tests for bible K6 (G-75). Each describe names the leaf it covers.
import { describe, expect, it } from 'vitest';
import { TuningParam, scanForbiddenJson } from '@gm/schema';
import { stateHash, stream } from '@gm/engine-core';
import { flow } from '@gm/engine-game';
import { compliance } from '@gm/league';
import paramsJson from '../../src/staff/params.json' with { type: 'json' };
import {
  ADVANCE_STOPS, DUTY, FRESH_HISTORY, PARAMS, P, adviceDelayTenths, adviceForPlay, advisorLine, asked, blockTask, chartLook,
  chartProblems, chartWithErrors, completeness, createStaffDecider, decisionOwners, dutyFor, effectiveHours, instructionConflicts,
  lateChance, mislabelChance, motionsQuality, ownPlayerBiasZ, ownerOf, planWeek, produce, proposalChance, quietWeeks, respond,
  speakChance, staffBlockResolver, stopsAdvance, tagErrorChance, unasked, unloggedDecisions, voice, weeklyHours, workOrder, workload,
  type AnyCall, type CandorHistory, type ChartedRow, type Decision, type DecisionView, type Observation, type OverrideAction,
  type StaffChart, type StaffDeciderConfig, type StandingInstruction, type UserSeat,
} from '../../src/staff/index.ts';
import {
  AHC, ANALYST, DC, GAME_READY, GEOMETRY, LAST_DOWN, OC, QB_COACH, SEED, STC, USER, conservative, draws, fakeCaller, fakeManager,
  fullStaff, gameDeps, gameInput, isOvertimeFault, newLog, silent, staffer, view,
} from './fixtures.ts';

function config(over: Partial<StaffDeciderConfig> = {}, log = newLog()): StaffDeciderConfig {
  return {
    side: 0, chart: fullStaff(), geometry: GEOMETRY, lastDown: LAST_DOWN, instructions: [], caller: fakeCaller(log), manager: fakeManager(log),
    user: null, draws, conservative, ...over,
  };
}

function play(i: number, cfg: StaffDeciderConfig) {
  const decider = createStaffDecider(cfg);
  const input = gameInput(i);
  const result = flow.simulateGame(input, gameDeps(input, [decider, silent(1)]));
  return { decider, result };
}

/** The first game from index `from` that finishes: games that hit the known engine overtime fault are passed over. */
function playFinished(from: number, cfg: () => StaffDeciderConfig) {
  for (let i = from; i < from + 20; i++) {
    try { return { index: i, ...play(i, cfg()) }; } catch (e) { if (!isOvertimeFault(e)) throw e; }
  }
  throw new Error('no game finished in 20 tries');
}

/** Whole-game tests need the real rule keys (PR 107). Without them they are skipped and say so. */
const game = it.skipIf(!GAME_READY);

const ourDecisions = (events: readonly { type: string }[]): Decision[] =>
  (events as readonly { type: string; decision?: Decision }[]).filter((e) => e.type === 'decision_made' && e.decision!.side === 0).map((e) => e.decision!);

/** A user who never answers and whose deadlines never pass: prompts stay up. */
const absentUser: UserSeat = { decide: () => null, timedOut: () => false };
/** A user who never answers; every deadline passes. */
const timedOutUser: UserSeat = { decide: () => null, timedOut: () => true };

describe('PARAMS (plans/game-build-plan.md section 2)', () => {
  it('every row is a valid tuning constant inside its own range, with a leaf', () => {
    expect(PARAMS.params.length).toBeGreaterThan(30);
    for (const p of PARAMS.params) {
      expect(TuningParam.safeParse(p).success, p.name).toBe(true);
      expect(p.value >= p.min && p.value <= p.max, p.name).toBe(true);
      expect(p.leaf.length, p.name).toBeGreaterThan(3);
    }
    expect(new Set(PARAMS.params.map((p) => p.name)).size).toBe(PARAMS.params.length);
    expect(() => P('no_such_name')).toThrow();
  });
  it('holds no forbidden key: no points, experience, trees, perks, picked traits or difficulty (Q1.2.1)', () => {
    expect(scanForbiddenJson('params.json', paramsJson)).toEqual([]);
  });
});

describe('K2.6.1 and K6.1.1 owners', () => {
  it('gives every game decision type exactly one owner', () => {
    const chart = fullStaff();
    expect(chartProblems(chart)).toEqual([]);
    const owners = decisionOwners(chart);
    for (const d of [DUTY.callOffense, DUTY.callDefense, DUTY.callSpecialTeams, DUTY.gameManagement]) expect(owners.get(d)!.personId).not.toBeNull();
    expect(owners.get(DUTY.callOffense)!.personId).toBe(OC);
    // A duty nobody was given stays with the head coach.
    expect(ownerOf(chart, DUTY.practiceScripting)).toMatchObject({ personId: USER, isUser: true, basis: 'head_coach' });
  });
  it('passes an absent caller\'s duty to the next person in the succession order, and says who is missing', () => {
    const chart = fullStaff({}, [staffer(OC, 'offensiveCoordinator', { available: false }), staffer(QB_COACH, 'positionCoach'), staffer(AHC, 'positionCoach')]);
    expect(ownerOf(chart, DUTY.callOffense)).toMatchObject({ personId: QB_COACH, basis: 'succession', absentId: OC });
  });
  it('with the user away, a duty he kept goes to the next person in line (K6.4.1 rule 1)', () => {
    const chart = fullStaff({ assignments: {} });
    expect(ownerOf(chart, DUTY.callDefense).isUser).toBe(true);
    expect(ownerOf(chart, DUTY.callDefense, { standIn: true })).toMatchObject({ personId: AHC, basis: 'stand_in' });
  });
  it('maps requests to duties: the try follows the try choice', () => {
    const s = view().situation;
    expect(dutyFor('snapping_call', s, false)).toBe(DUTY.callOffense);
    expect(dutyFor('snapping_call', { ...s, playKind: 'kickoff' }, false)).toBe(DUTY.callSpecialTeams);
    expect(dutyFor('snapping_call', { ...s, playKind: 'try' }, true)).toBe(DUTY.callOffense);
    expect(dutyFor('opposing_call', { ...s, playKind: 'kickoff' }, false)).toBe(DUTY.callSpecialTeams);
    expect(dutyFor('timeout', s, false)).toBe(DUTY.gameManagement);
  });
});

describe('K6.1.1 delegated decisions use the staff member\'s own profile', () => {
  game('with all duties delegated a game completes with every decision logged to a staff member', () => {
    const { decider, result } = playFinished(0, () => config());
    expect(result.final.phase).toBe('final');
    const ours = ourDecisions(result.events);
    expect(ours.length).toBeGreaterThan(100);
    const staffIds = new Set([OC, DC, STC, AHC]);
    for (const d of ours) {
      expect(d.actor.kind, `${d.type} ${d.requestId}`).toBe('staff');
      expect(staffIds.has(d.actor.personId!)).toBe(true);
    }
    expect(unloggedDecisions(ours, 0, decider.rows())).toEqual([]);
    // Each side's calls came from that side's own caller, and game management from its holder.
    const by = new Map(decider.rows().map((r) => [r.requestId, r]));
    for (const d of ours) expect(by.get(d.requestId)!.decidedBy.personId).toBe(d.actor.personId);
    expect(new Set(decider.rows().filter((r) => r.duty === DUTY.callDefense).map((r) => r.decidedBy.personId))).toEqual(new Set([DC]));
    expect(new Set(decider.rows().filter((r) => r.duty === DUTY.gameManagement).map((r) => r.decidedBy.personId))).toEqual(new Set([AHC]));
  });
  it('the K4 procedure is run with the delegated caller\'s own behaviour values, whoever he is', () => {
    const sharp = fullStaff({}, [staffer(OC, 'offensiveCoordinator', { behavior: { callFit: 2 } }), staffer(DC, 'defensiveCoordinator'), staffer(STC, 'specialTeamsCoordinator'), staffer(AHC, 'positionCoach')]);
    const log = newLog();
    const d = createStaffDecider(config({ chart: sharp }, log));
    expect(d.decide(view())!.actor).toEqual({ kind: 'staff', personId: OC });
    expect(log.callFit).toEqual([2]);
    // A position coach asked to call plays is allowed and uses his own generated calling fields (edge case).
    const odd = fullStaff({ assignments: { ...fullStaff().assignments, [DUTY.callOffense]: { holderId: QB_COACH, autonomy: 'decides' } } });
    expect(createStaffDecider(config({ chart: odd })).decide(view())!.actor.personId).toBe(QB_COACH);
  });
  it('an absent coordinator is replaced by succession and the row names him', () => {
    const chart = fullStaff({}, [staffer(OC, 'offensiveCoordinator', { available: false }), staffer(QB_COACH, 'positionCoach'), staffer(AHC, 'positionCoach')]);
    const d = createStaffDecider(config({ chart }));
    expect(d.decide(view())!.actor.personId).toBe(QB_COACH);
    expect(d.rows()[0]).toMatchObject({ absentId: OC, basis: 'delegated' });
  });
  it('a slow coordinator costs seconds, and a call after the deadline falls to the default (rule 4)', () => {
    const quick = createStaffDecider(config({ caller: fakeCaller(newLog(), { thinkTenths: 60 }) }));
    expect(quick.decide(view({ deadline: 150 }))!.acceptedAtPlayClockTenths).toBe(340);
    const slow = createStaffDecider(config({ caller: fakeCaller(newLog(), { thinkTenths: 300 }) }));
    const d = slow.decide(view({ deadline: 150 }))!;
    expect(d.actor.kind).toBe('default');
    expect(slow.rows()[0]!.basis).toBe('late');
  });
  it('a decision the user kept and did not answer falls to the staff member next in line, then to the default (rule 6)', () => {
    const chart = fullStaff({ assignments: {} });
    const pending = createStaffDecider(config({ chart, user: absentUser }));
    expect(pending.decide(view())).toBeNull();
    const d = createStaffDecider(config({ chart, user: timedOutUser }));
    expect(d.decide(view())!.actor).toEqual({ kind: 'staff', personId: QB_COACH });
    expect(d.rows()[0]!.basis).toBe('user_timed_out');
    const alone = createStaffDecider(config({ chart: { ...chart, members: [], succession: {} }, user: timedOutUser }));
    expect(alone.decide(view())!.actor.kind).toBe('default');
  });
  it('the user answers what he owns, credited to him', () => {
    const chart = fullStaff({ assignments: { [DUTY.callDefense]: { holderId: DC, autonomy: 'decides' } } });
    const user: UserSeat = { decide: (v) => ({ requestId: v.request.requestId, type: v.request.type, side: 0, optionId: null, snappingCall: conservative(v) as Decision['snappingCall'], opposingCall: null, acceptedAtPlayClockTenths: 200, actor: { kind: 'user', personId: USER } }), timedOut: () => false };
    const d = createStaffDecider(config({ chart, user }));
    expect(d.decide(view())!.actor).toEqual({ kind: 'user', personId: USER });
    expect(d.decide(view({ type: 'opposing_call', requestId: 8 }))!.actor).toEqual({ kind: 'staff', personId: DC });
  });
});

const noBlitzAhead: StandingInstruction = {
  id: 'no-blitz-third-long-lead', duty: DUTY.callDefense, types: ['opposing_call'],
  when: { downs: [3], distanceMinYd: 7, leadMin: 1 }, effect: { kind: 'forbid_call', match: { rushersMin: 5 } },
};
const askFourthInside40: StandingInstruction = {
  id: 'ask-me-fourth-inside-40', duty: DUTY.gameManagement, types: ['snapping_call'],
  when: { downs: [LAST_DOWN], yardsToGoalMax: 40 }, effect: { kind: 'reserve' },
};

describe('K6.1.2 standing instructions and reserved decisions', () => {
  game('a forbidden call never appears from a delegated caller in 100 simulated games', () => {
    const neverBlitz: StandingInstruction = { id: 'never-blitz', duty: DUTY.callDefense, types: ['opposing_call'], when: {}, effect: { kind: 'forbid_call', match: { rushersMin: 5 } } };
    let defensive = 0, blitzesWithout = 0, finished = 0;
    for (let g = 0; finished < 100 && g < 140; g++) {
      // Every other game the caller ignores the filter he is handed: the K6 check still holds.
      let result;
      try {
        result = play(g, config({ instructions: [neverBlitz, noBlitzAhead], caller: fakeCaller(newLog(), { ignorePermits: g % 2 === 1, blitzShare: 0.9 }) })).result;
      } catch (e) { if (!isOvertimeFault(e)) throw e; continue; }
      finished++;
      for (const d of ourDecisions(result.events)) {
        if (d.opposingCall?.unit !== 'defense') continue;
        defensive++;
        expect(d.opposingCall.rushers).toBeLessThan(5);
      }
    }
    expect(finished).toBe(100);
    expect(defensive).toBeGreaterThan(3000);
    const { result } = playFinished(0, () => config({ caller: fakeCaller(newLog(), { blitzShare: 0.9 }) }));
    for (const d of ourDecisions(result.events)) if (d.opposingCall?.unit === 'defense' && d.opposingCall.rushers >= 5) blitzesWithout++;
    expect(blitzesWithout).toBeGreaterThan(20);
  });
  it('a situational instruction binds only in its situation', () => {
    const cfg = config({ instructions: [noBlitzAhead], caller: fakeCaller(newLog(), { blitzShare: 1 }) });
    const lead = view({ type: 'opposing_call', situation: { score: [7, 0] } });
    const tied = view({ type: 'opposing_call', requestId: 9 });
    const d = createStaffDecider(cfg);
    expect((d.decide(lead)!.opposingCall as { rushers: number }).rushers).toBeLessThan(5);
    expect((d.decide(tied)!.opposingCall as { rushers: number }).rushers).toBeGreaterThanOrEqual(5);
    expect(d.rows()[0]!.instructionIds).toEqual(['no-blitz-third-long-lead']);
  });
  it('a mandated option replaces the holder\'s choice; the more specific instruction wins and the conflict is listed', () => {
    const always2: StandingInstruction = { id: 'go-for-two-late', duty: DUTY.gameManagement, types: ['try_choice'], when: { periods: [4], leadMin: -2, leadMax: -2 }, effect: { kind: 'mandate_option', optionId: 'two_point' } };
    const neverTwo: StandingInstruction = { id: 'never-two', duty: DUTY.gameManagement, types: ['try_choice'], when: {}, effect: { kind: 'forbid_option', optionIds: ['two_point'] } };
    const cfg = config({ instructions: [neverTwo, always2] });
    const tryView = (over: object, requestId: number) => view({ type: 'try_choice', options: ['kick', 'two_point'], defaultOptionId: 'kick', deadline: null, requestId, situation: { playKind: 'try', down: null, distanceYd: null, ...over } });
    const d = createStaffDecider(cfg);
    expect(d.decide(tryView({ period: 4, score: [12, 14] }, 1))!.optionId).toBe('two_point');
    expect(d.rows()[0]).toMatchObject({ basis: 'instruction', instructionIds: ['go-for-two-late'], droppedInstructionIds: ['never-two'] });
    expect(d.decide(tryView({ period: 2 }, 2))!.optionId).toBe('kick');
    expect(instructionConflicts([neverTwo, always2])).toEqual([{ winnerId: 'go-for-two-late', loserId: 'never-two', reason: 'one mandates the option the other forbids' }]);
    expect(instructionConflicts([noBlitzAhead, askFourthInside40])).toEqual([]);
  });
  it('contradicting call instructions: the least specific is dropped, never the specific one', () => {
    const mustBlitz: StandingInstruction = { id: 'blitz-third-long', duty: DUTY.callDefense, types: ['opposing_call'], when: { downs: [3], distanceMinYd: 7 }, effect: { kind: 'require_call', match: { rushersMin: 5 } } };
    const neverBlitz: StandingInstruction = { id: 'never-blitz', duty: DUTY.callDefense, types: ['opposing_call'], when: {}, effect: { kind: 'forbid_call', match: { rushersMin: 5 } } };
    const d = createStaffDecider(config({ instructions: [neverBlitz, mustBlitz], caller: fakeCaller(newLog(), { ignorePermits: true, blitzShare: 1 }) }));
    expect((d.decide(view({ type: 'opposing_call' }))!.opposingCall as { rushers: number }).rushers).toBeGreaterThanOrEqual(5);
    expect(d.rows()[0]).toMatchObject({ instructionIds: ['blitz-third-long'], droppedInstructionIds: ['never-blitz'] });
    expect(instructionConflicts([neverBlitz, mustBlitz]).map((c) => c.winnerId)).toEqual(['blitz-third-long']);
  });
  it('a reserved decision stops for the user, and falls to the staff member, logged, when he does not answer', () => {
    const fourth = view({ situation: { down: LAST_DOWN, distanceYd: 1, ballX: GEOMETRY.goalLineEastX - 35 } });
    const waiting = createStaffDecider(config({ instructions: [askFourthInside40], user: { ...absentUser, lastDown: () => null } }));
    expect(waiting.decide(fourth)).toBeNull();
    const answered = createStaffDecider(config({ instructions: [askFourthInside40], user: { ...absentUser, lastDown: () => 'field_goal' } }));
    const fg = answered.decide(fourth)!;
    expect(fg.snappingCall).toMatchObject({ unit: 'kick', kickKind: 'field_goal' });
    expect(fg.actor.personId).toBe(STC);
    const timed = createStaffDecider(config({ instructions: [askFourthInside40], user: { ...timedOutUser, lastDown: () => null } }));
    expect(timed.decide(fourth)!.snappingCall).toMatchObject({ unit: 'offense' });
    // Outside the 40 the instruction is silent: the staff decide alone.
    const far = view({ requestId: 11, situation: { down: LAST_DOWN, distanceYd: 6, ballX: GEOMETRY.goalLineEastX - 70 } });
    expect(waiting.decide(far)!.snappingCall).toMatchObject({ unit: 'kick', kickKind: 'punt' });
  });
  game('every reserved decision in a game either reaches the user or is logged as timed out', () => {
    const reserveTimeouts: StandingInstruction = { id: 'my-try', duty: DUTY.gameManagement, types: ['try_choice'], when: {}, effect: { kind: 'reserve' } };
    const reached: number[] = [];
    const user: UserSeat = { decide: (v) => { reached.push(v.request.requestId); return null; }, timedOut: () => true };
    const { decider, result } = playFinished(3, () => config({ instructions: [reserveTimeouts], user }));
    const tries = ourDecisions(result.events).filter((d) => d.type === 'try_choice');
    expect(tries.length).toBeGreaterThan(0);
    for (const t of tries) {
      expect(reached).toContain(t.requestId);
      expect(decider.rows().find((r) => r.requestId === t.requestId)!.basis).toBe('reserved_timed_out');
    }
  });
});

describe('I2.6.4 and K6.1.1 rule 5 override', () => {
  const replace = (v: DecisionView): OverrideAction => ({ kind: 'replace', call: conservative(v), spokenTenths: 20 });
  it('a replacement costs 4 s plus the call, an instruction 3 s; the call is credited to who made the final choice', () => {
    const caller = fakeCaller(newLog(), { thinkTenths: 60 });
    const r = createStaffDecider(config({ caller, user: { ...absentUser, override: (v) => replace(v) } }));
    const d = r.decide(view({ deadline: 150 }))!;
    expect(d.actor).toEqual({ kind: 'user', personId: USER });
    expect(d.acceptedAtPlayClockTenths).toBe(340 - 60);
    expect(r.overrides()[0]).toMatchObject({ coordinatorId: OC, kind: 'replace', costTenths: 60, count: 1, trustCost: 0, late: false });
    const i = createStaffDecider(config({ caller, user: { ...absentUser, override: () => ({ kind: 'instruction', require: { kinds: ['run'] } }) } }));
    const run = i.decide(view({ deadline: 150 }))!;
    expect(run.snappingCall).toMatchObject({ kind: 'run' });
    expect(run.actor.personId).toBe(OC);
    expect(run.acceptedAtPlayClockTenths).toBe(340 - 30);
  });
  it('an override confirmed with less time left than its cost produces a late call', () => {
    const r = createStaffDecider(config({ caller: fakeCaller(newLog(), { thinkTenths: 230 }), user: { ...absentUser, override: (v) => replace(v) } }));
    expect(r.decide(view({ deadline: 150 }))!.actor.kind).toBe('default');
    expect(r.overrides()[0]!.late).toBe(true);
  });
  it('ten overrides cost the coordinator more trust than one, the first is free, and off the channel nothing is heard', () => {
    const r = createStaffDecider(config({ caller: fakeCaller(newLog(), { thinkTenths: 60 }), user: { ...absentUser, override: (v) => replace(v) } }));
    for (let k = 1; k <= 10; k++) r.decide(view({ deadline: 150, requestId: k }));
    const costs = r.overrides().map((o) => o.trustCost);
    expect(costs[0]).toBe(0);
    for (let k = 1; k < 10; k++) expect(costs[k]!).toBeGreaterThan(costs[k - 1]!);
    // Asking the same request again does not count twice.
    r.decide(view({ deadline: 150, requestId: 10 }));
    expect(r.overrides().length).toBe(10);
    const off = createStaffDecider(config({ user: { ...absentUser, listening: () => false, override: (v) => replace(v) } }));
    expect(off.decide(view())!.actor.personId).toBe(OC);
    expect(off.overrides()).toEqual([]);
  });
});

describe('K6.4.1 and J14.4.1 simulated games', () => {
  game('"simulate to end" and "watch with everything delegated" give identical results for the same seed', () => {
    const watching: UserSeat = { decide: () => null, timedOut: () => false, listening: () => true, override: () => null };
    let from = 5;
    for (let n = 0; n < 2; n++) {
      const sim = playFinished(from, () => config({ simulate: true, user: absentUser }));
      const watch = play(sim.index, config({ user: watching }));
      from = sim.index + 1;
      expect(stateHash(sim.result.final)).toBe(stateHash(watch.result.final));
      expect(sim.result.events.length).toBe(watch.result.events.length);
      expect(sim.decider.rows()).toEqual(watch.decider.rows());
    }
  });
  game('simulating a game the user would have called himself hands each kept duty to the next person, logged', () => {
    const chart = fullStaff({ assignments: {} });
    const { decider, result } = playFinished(7, () => config({ chart, simulate: true, user: absentUser }));
    const ours = ourDecisions(result.events);
    // Offense goes to the quarterbacks coach (first in its own succession list), everything else to the assistant head coach.
    expect(ours.every((d) => d.actor.kind === 'staff' && (d.actor.personId === AHC || d.actor.personId === QB_COACH))).toBe(true);
    expect(new Set(decider.rows().filter((r) => r.duty === DUTY.callOffense).map((r) => r.decidedBy.personId))).toEqual(new Set([QB_COACH]));
    expect(unloggedDecisions(ours, 0, decider.rows())).toEqual([]);
  });
  game('the same game replays to the same hash', () => {
    const first = playFinished(8, () => config());
    expect(stateHash(play(first.index, config()).result.final)).toBe(stateHash(first.result.final));
  });
});

const coverage = (look: string, at = 1000): Observation => ({ kind: 'coverage', bucket: '3rd_long', look, classes: ['cover1', 'cover2', 'cover3', 'cover4'], bestSeat: 'booth', observableAtTenths: at });

describe('K6.2.1 suggestions and reports from the staff', () => {
  it('the share of recognition reports that match the true look rises with the reporter\'s evaluation', () => {
    const rate = (z: number) => {
      const m = staffer(50, 'positionCoach', { behavior: { evaluation: z }, seat: 'booth' });
      let right = 0;
      const d = stream(SEED, 'coachAI', ['recognition', z]);
      for (let i = 0; i < 4000; i++) if (chartLook(m, coverage('cover4'), d) === 'cover4') right++;
      return right / 4000;
    };
    const [low, mid, high] = [rate(-2), rate(0), rate(2)];
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    expect(low).toBeGreaterThan(0.75);
    expect(high).toBeLessThan(0.97);
    // The booth sees coverage better: the same coach on the sideline is wrong more often, never always.
    const m = staffer(51, 'positionCoach');
    expect(mislabelChance({ ...m, seat: 'sideline' }, 'booth')).toBeGreaterThan(mislabelChance({ ...m, seat: 'booth' }, 'booth'));
    expect(mislabelChance(staffer(52, 'positionCoach', { behavior: { evaluation: -9 } }), 'booth')).toBeLessThan(1);
  });
  it('lines arrive 2 to 8 s after the play, later with more duties and lower quality, never before their inputs', () => {
    const good = staffer(60, 'positionCoach', { behavior: { evaluation: 3, adjustment: 3 } });
    const poor = staffer(61, 'positionCoach', { behavior: { evaluation: -3, adjustment: -3 } });
    expect(adviceDelayTenths(good, 1)).toBe(20);
    expect(adviceDelayTenths(poor, 1)).toBe(80);
    expect(adviceDelayTenths(good, 4)).toBeGreaterThan(adviceDelayTenths(good, 1));
    const chart = fullStaff();
    const out = adviceForPlay({ chart, view: view({ type: 'opposing_call' }), observations: [coverage('cover3', 1000), { ...coverage('cover3', 1010), kind: 'tired_player', bestSeat: 'sideline', classes: ['68', '72'], look: '68' }], nowTenths: 1005, caller: fakeCaller(newLog()), suggestFor: [DUTY.callDefense], draws });
    // One line per staff member per play.
    expect(new Set(out.lines.map((l) => l.staffId)).size).toBe(out.lines.length);
    for (const l of out.lines) expect(l.atTenths).toBeGreaterThanOrEqual(l.kind === 'report' ? 1000 + 20 : 1005 + 20);
    const dc = out.lines.find((l) => l.staffId === DC)!;
    expect(dc.kind).toBe('suggestion');
    expect(dc.calls.length).toBeLessThanOrEqual(2);
    const booth = out.lines.find((l) => l.staffId === OC)!;
    expect(booth).toMatchObject({ kind: 'report', reportKind: 'coverage' });
    // The line carries no mark of right or wrong; the review row does.
    expect(Object.keys(booth)).not.toContain('was');
    expect(out.reviews.find((r) => r.staffId === OC)!.was).toBe('cover3');
  });
});

describe('K6.2.2 the advisor', () => {
  it('with an analyst the line is his, after a delay by his skill; with none it is the generic chart cell', () => {
    const v = view({ type: 'try_choice', options: ['kick', 'two_point'] });
    const m = fakeManager(newLog());
    const withAnalyst = advisorLine(fullStaff(), v, m, draws);
    expect(withAnalyst).toMatchObject({ analystId: ANALYST, line: { optionId: 'kick', close: false } });
    expect(withAnalyst.delayTenths).toBeGreaterThanOrEqual(10);
    expect(withAnalyst.delayTenths).toBeLessThanOrEqual(40);
    const none = advisorLine(fullStaff({ assignments: {} }), v, m, draws);
    expect(none).toMatchObject({ analystId: null, delayTenths: 0, line: { close: true } });
  });
  it('a delegated game manager decides with his own values and the advisor beside him', () => {
    const log = newLog();
    const d = createStaffDecider(config({}, log));
    const out = d.decide(view({ type: 'timeout', options: ['none', 'timeout'], defaultOptionId: 'none', deadline: null }))!;
    expect(out).toMatchObject({ optionId: 'none', actor: { kind: 'staff', personId: AHC } });
    expect(log.managers).toEqual([AHC]);
  });
});

describe('K6.3.1 staff work products and their quality', () => {
  it('hours: 70, 80, 90, a short week caps them, and past 80 each hour returns half', () => {
    expect([weeklyHours('standard'), weeklyHours('long'), weeklyHours('all_in'), weeklyHours('all_in', 60)]).toEqual([70, 80, 90, 60]);
    expect(effectiveHours(80)).toBe(80);
    expect(effectiveHours(90)).toBe(85);
    expect(workload(70, [{ duty: DUTY.scoutingReport, hoursEst: 40 }, { duty: DUTY.playerGrades, hoursEst: 44 }])).toMatchObject({ hoursOver: 14, hoursPastKnee: 0 });
  });
  it('tag accuracy of delivered breakdowns rises with the producing assistant\'s evaluation', () => {
    const rows: ChartedRow[] = Array.from({ length: 3000 }, (_, i) => ({ bucket: '1st_10', observed: i % 2 ? 'cover3' : 'cover1' }));
    const classes = ['cover1', 'cover2', 'cover3', 'cover4'];
    const accuracy = (z: number) => {
      const m = staffer(70, 'positionCoach', { behavior: { evaluation: z } });
      const out = chartWithErrors(rows, classes, tagErrorChance(m, workload(70, [])), stream(SEED, 'coachAI', ['chart', z]));
      // A wrong row has the same shape as a right one (rule 3).
      expect(Object.keys(out[0]!)).toEqual(['bucket', 'observed']);
      return out.filter((r, i) => r.observed === rows[i]!.observed).length / rows.length;
    };
    expect(accuracy(0)).toBeGreaterThan(accuracy(-2));
    expect(accuracy(2)).toBeGreaterThan(accuracy(0));
    // A tired coach charts worse (L4.3.5).
    const m = staffer(71, 'positionCoach');
    expect(tagErrorChance(m, workload(90, []))).toBeGreaterThan(tagErrorChance(m, workload(70, [])));
  });
  it('late or thin deliveries rise with hours over the limit, and a lazy assistant delivers less', () => {
    const m = staffer(72, 'positionCoach');
    const load = (h: number) => workload(70, [{ duty: DUTY.scoutingReport, hoursEst: h }]);
    expect(lateChance(m, load(100))).toBeGreaterThan(lateChance(m, load(80)));
    expect(lateChance(m, load(80))).toBeGreaterThan(lateChance(m, load(60)));
    expect(completeness(m, load(100))).toBeLessThan(completeness(m, load(60)));
    const lazy = staffer(73, 'positionCoach', { facets: { workHabits: 5 } });
    const keen = staffer(74, 'positionCoach', { facets: { workHabits: 95 } });
    expect(completeness(lazy, load(60))).toBeLessThan(completeness(keen, load(60)));
    expect(lateChance(lazy, load(60))).toBeGreaterThan(lateChance(keen, load(60)));
    // Never certain, never impossible.
    expect(lateChance(keen, load(0))).toBeGreaterThan(0);
    expect(lateChance(lazy, load(1000))).toBeLessThan(1);
    let late = 0;
    const d = stream(SEED, 'coachAI', ['late']);
    for (let i = 0; i < 2000; i++) if ((produce('scouting_report', lazy, load(90), { build: () => null }, d) as { late: boolean }).late) late++;
    expect(late / 2000).toBeCloseTo(lateChance(lazy, load(90)), 1);
  });
  it('a better staff yields better preparation outputs, all else fixed (K6.4.1 acceptance)', () => {
    const w = workload(70, [{ duty: DUTY.scoutingReport, hoursEst: 40 }]);
    const weak = workOrder('scouting_report', staffer(75, 'positionCoach', { behavior: { preparation: -2, evaluation: -2 } }), w);
    const strong = workOrder('scouting_report', staffer(76, 'positionCoach', { behavior: { preparation: 2, evaluation: 2 } }), w);
    expect(strong.gamesCharted).toBeGreaterThan(weak.gamesCharted);
    expect(strong.splits).toBeGreaterThan(weak.splits);
    expect(strong.tellChance).toBeGreaterThan(weak.tellChance);
    expect(strong.tagErrorChance).toBeLessThan(weak.tagErrorChance);
    expect(weak.gamesCharted).toBeGreaterThanOrEqual(2);
    expect(strong.gamesCharted).toBeLessThanOrEqual(6);
    expect(weak.splits).toBe(1);
  });
  it('the product is signed, built by the K3 procedure with his order, and missing when nobody holds the duty', () => {
    const m = staffer(77, 'positionCoach');
    const seen: unknown[] = [];
    const p = produce('scouting_report', m, workload(70, []), { build: (kind, order) => { seen.push(order); return { kind }; } }, stream(SEED, 'coachAI', ['produce']));
    expect(p).toMatchObject({ signedById: 77, body: { kind: 'scouting_report' } });
    expect(seen[0]).toMatchObject({ producerId: 77 });
    expect(produce('scouting_report', null, workload(70, []), { build: () => null }, stream(SEED, 'coachAI', ['x']))).toEqual({ kind: 'scouting_report', signedById: null, missing: true });
    expect(ownPlayerBiasZ(1)).toBe(0.2);
    expect(ownPlayerBiasZ(0)).toBe(0);
  });
});

describe('K6.3.2 candor and disagreement', () => {
  const season = (candor: number, history: CandorHistory) => {
    const m = staffer(80, 'positionCoach', { facets: { candor } });
    const d = stream(SEED, 'coachAI', ['candor', candor, history.responses.length]);
    let voiced = 0;
    for (let i = 0; i < 2000; i++) if (voice(m, history, { gap: 0.04, ownSystem: false, headset: false }, d).spoke) voiced++;
    return voiced;
  };
  it('voiced disagreements rise with candor and fall after punishments of candor', () => {
    expect(season(50, FRESH_HISTORY)).toBeGreaterThan(season(15, FRESH_HISTORY));
    expect(season(90, FRESH_HISTORY)).toBeGreaterThan(season(50, FRESH_HISTORY));
    let h = FRESH_HISTORY;
    for (let i = 0; i < 4; i++) h = respond(h, 'punished');
    expect(season(50, h)).toBeLessThan(season(50, FRESH_HISTORY) * 0.6);
    // Being heard brings it back; overruling with a reason costs nothing (L4.3.3).
    expect(respond(h, 'accepted').safety).toBeGreaterThan(h.safety);
    expect(respond(FRESH_HISTORY, 'overruled_with_reason').safety).toBe(1);
  });
  it('the quietest, most punished assistant can still speak, and nobody speaks with no gap', () => {
    const quiet = staffer(81, 'positionCoach', { facets: { candor: 0 } });
    let h = FRESH_HISTORY;
    for (let i = 0; i < 30; i++) h = respond(h, 'punished');
    expect(speakChance(quiet, h, { gap: 0.2, ownSystem: false, headset: false })).toBeGreaterThan(0);
    expect(speakChance(quiet, FRESH_HISTORY, { gap: 0, ownSystem: false, headset: false })).toBe(0);
    const o = voice(quiet, FRESH_HISTORY, { gap: 0.01, ownSystem: false, headset: false }, stream(SEED, 'coachAI', ['quiet']));
    expect(o.memory.kind).toBe(o.spoke ? 'objection_voiced' : 'objection_withheld');
  });
  it('high ego pushes his own system\'s answer; one push per series on the headset', () => {
    const big = staffer(82, 'positionCoach', { facets: { ego: 95 } });
    const o = { gap: 0.03, ownSystem: true, headset: true };
    expect(speakChance(big, FRESH_HISTORY, o)).toBeGreaterThan(speakChance(big, FRESH_HISTORY, { ...o, ownSystem: false }));
    expect(speakChance(big, { ...FRESH_HISTORY, pushesThisSeries: 1 }, o)).toBe(0);
    expect(quietWeeks([2, 0, 1, 0, 0, 0])).toBe(3);
  });
});

describe('K6.4.1 rule 2 and J14.4.2 simulating the week', () => {
  const chart = fullStaff({ assignments: { ...fullStaff().assignments, [DUTY.practiceScripting]: { holderId: OC, autonomy: 'decides' } } });
  it('each weekly task goes to the duty holder, else the next in line; a head-coach-only task is skipped', () => {
    const plan = planWeek(chart, [
      { id: 'wed-practice', duty: DUTY.practiceScripting, headCoachOnly: false },
      { id: 'game-plan', duty: DUTY.gamePlan, headCoachOnly: false },
      { id: 'one-on-one', duty: null, headCoachOnly: true },
    ]);
    expect(plan).toEqual([
      { taskId: 'wed-practice', duty: DUTY.practiceScripting, doneById: OC, basis: 'duty_holder' },
      { taskId: 'game-plan', duty: DUTY.gamePlan, doneById: AHC, basis: 'next_in_line' },
      { taskId: 'one-on-one', duty: null, doneById: null, basis: 'skipped_head_coach_only' },
    ]);
    expect(planWeek({ ...chart, members: [], succession: {} }, [{ id: 't', duty: DUTY.gamePlan, headCoachOnly: false }])[0]!.basis).toBe('skipped_nobody');
  });
  it('the block resolver runs delegated blocks with the staff and passes the rest straight through', () => {
    const seen: (number | null)[] = [];
    const resolve = staffBlockResolver(chart, (b, info) => { seen.push(info.doneById); return b.id; }, ['one_on_one']);
    const practice = { id: 'b1', type: 'practice', contentRef: null };
    expect(resolve(practice, { delegated: false, teamId: 1 })).toBe('b1');
    expect(resolve(practice, { delegated: true, teamId: 1 })).toMatchObject({ blockId: 'b1', plan: { doneById: OC }, report: 'b1' });
    expect(resolve({ id: 'b2', type: 'team_meeting', contentRef: 'one_on_one' }, { delegated: true, teamId: 1 })).toMatchObject({ plan: { basis: 'skipped_head_coach_only' }, report: null });
    expect(seen).toEqual([USER, OC]);
    expect(blockTask({ id: 'b3', type: 'game_planning', contentRef: null }).duty).toBe(DUTY.gamePlan);
  });
  it('going through the motions is never above his recent work grades; job offers, firings and crises stop an advance', () => {
    expect(motionsQuality([])).toBeNull();
    const grades = [80, 70, 60, 50, 40];
    const q = motionsQuality(grades)!;
    expect(q).toBeLessThanOrEqual((70 + 60 + 50 + 40) / 4);
    for (const e of ADVANCE_STOPS) expect(stopsAdvance(e)).toBe(true);
    expect(stopsAdvance('injury_named_player')).toBe(false);
    expect(stopsAdvance('injury_named_player', ['injury_named_player'])).toBe(true);
  });
});

describe('K6.6.1 staff who break rules', () => {
  const date = { seasonYear: 2026, dayIndex: 100 } as Parameters<typeof asked>[5];
  const conduct = (scope: readonly (string | number)[]) => stream(SEED, 'conduct', scope);
  const opp = { classId: 'signal_recording', gain: 0.9, pDetectPerceived: 0.05, penaltyPerceived: 0.5 };
  it('low rule-respect assistants under job pressure produce violations with no request from the user', () => {
    const state = compliance.emptyCompliance();
    let committed = 0, proposed = 0;
    for (let i = 0; i < 200; i++) {
      const m = staffer(1000 + i, 'positionCoach', { facets: { ruleRespectZ: -2 } });
      const out = unasked(state, opp, m, 'generated', 0.9, date, conduct);
      if (out.kind === 'committed') committed++;
      if (out.kind === 'proposed') proposed++;
    }
    expect(committed).toBeGreaterThan(10);
    expect(proposed).toBeGreaterThan(10);
    const open = staffer(1, 'positionCoach', { facets: { candor: 95, loyalty: 95 } });
    const closed = staffer(2, 'positionCoach', { facets: { candor: 5, loyalty: 5 } });
    expect(proposalChance(open)).toBeGreaterThan(proposalChance(closed));
    expect(proposalChance(closed)).toBeGreaterThan(0);
    expect(proposalChance(open)).toBeLessThan(1);
  });
  it('a request to a high rule-respect assistant is refused more than 90% of the time, remembered for good, sometimes reported', () => {
    const state = compliance.emptyCompliance();
    let refused = 0, reported = 0;
    for (let i = 0; i < 300; i++) {
      const m = staffer(2000 + i, 'positionCoach', { facets: { ruleRespectZ: 2, candor: 90 } });
      const out = asked(state, { ...opp, gain: 0.5 }, m, 'generated', 0.2, date, conduct);
      if (out.outcome !== 'complied') { refused++; expect(out.memory).toMatchObject({ kind: 'refused_illegal_request', permanent: true }); }
      if (out.reported) reported++;
    }
    expect(refused / 300).toBeGreaterThan(0.9);
    expect(reported).toBeGreaterThan(0);
    const willing = asked(state, opp, staffer(3, 'positionCoach', { facets: { ruleRespectZ: -2 } }), 'generated', 0.9, date, conduct);
    expect(willing).toMatchObject({ outcome: 'complied', memory: null });
  });
  it('imported real people never commit or propose, asked or not', () => {
    const state = compliance.emptyCompliance();
    for (let i = 0; i < 100; i++) {
      const m = staffer(3000 + i, 'positionCoach', { facets: { ruleRespectZ: -3 }, imported: true });
      expect(unasked(state, opp, m, 'generated', 1, date, conduct).kind).toBe('none');
      expect(asked(state, opp, m, 'generated', 1, date, conduct).outcome).toBe('refused');
    }
  });
});

describe('no user on the staff: an AI team runs the same code', () => {
  it('decisions are credited to AI people', () => {
    const chart: StaffChart = { ...fullStaff(), userId: null, headCoachId: AHC };
    const d = createStaffDecider(config({ chart }));
    expect(d.decide(view())!.actor).toEqual({ kind: 'ai', personId: OC });
    const call = d.decide(view({ type: 'opposing_call', requestId: 8 }))!.opposingCall as AnyCall;
    expect(call.unit).toBe('defense');
  });
});
