// Hand-built play records, at least one per `PlayResultType` and one per statistic id. FIXTURE DATA:
// made-up players, spots and plays on the fixture field of fixtures.ts. Not football facts.
import { Contract } from '@gm/engine-core';
import { play, touchdown, foulRecord, enforcement, resetIndexes } from './fixtures.ts';

type PlayRecord = Contract.PlayRecord;

const fg = (side: Contract.Side, scorerId: number): Contract.ScoreEvent => ({ type: 'field_goal', side, points: 3, scorerId });

/** Builds the named fixture plays. Indexes restart at 1 on every call, so two calls give equal records. */
export function buildPlays(): Record<string, PlayRecord> {
  resetIndexes();
  const p: Record<string, PlayRecord> = {};

  // Runs
  p.run = play({
    at: 25, result: 'run', gain: 5,
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, 21, 'exchange', 0.9), h.tackle(2, [101], 30), h.dead('down_by_contact', 30, 0, 2)],
  });
  p.runFirstDownAssisted = play({
    at: 40, result: 'run', gain: 12, offenseCall: { runDirection: 'left' },
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, 36, 'exchange', 0.9), h.tackle(2, [102, 103], 52), h.dead('down_by_contact', 52, 0, 2)],
  });
  p.runForLoss = play({
    at: 30, down: 2, dist: 4, result: 'run', gain: -2,
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, 26, 'exchange', 0.9), h.tackle(2, [104], 28), h.dead('down_by_contact', 28, 0, 2)],
  });
  p.runTouchdown = play({
    at: 95, dist: 5, goalToGo: true, result: 'run', gain: 5, final: { score: touchdown(0, 2) }, scoreAfter: [6, 0],
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, 91, 'exchange', 0.9), h.dead('ball_across_goal_line_in_possession', 100, 0, 2)],
  });
  p.scramble = play({
    at: 50, result: 'run', gain: 8, offenseKind: 'dropback_pass', offenseCall: { shotgun: true },
    events: (h) => [h.snap(), h.possession(0, 1, 45, 'snap', 0), h.detail('scramble', [1]), h.tackle(1, [105], 58), h.dead('down_by_contact', 58, 0, 1)],
  });
  p.kneel = play({
    at: 60, result: 'kneel', gain: -1, offenseKind: 'kneel',
    events: (h) => [h.snap(), h.possession(0, 1, 59, 'snap', 0), h.dead('kneel', 59, 0, 1, 1)],
  });
  p.safety = play({
    at: 2, result: 'run', gain: -3, final: { score: { type: 'safety', side: 1, points: 2, scorerId: null } }, scoreAfter: [0, 2],
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, -1, 'exchange', 0.9), h.tackle(2, [101], -1), h.dead('down_by_contact', -1, 0, 2)],
  });

  // Passes
  p.passComplete = play({
    at: 30, result: 'pass_complete', gain: 15, offenseKind: 'dropback_pass', offenseCall: { shotgun: true, tempo: 'no_huddle', motionId: 'm1' },
    defenseCall: { rushers: 5, coverageFamily: 'cover1' },
    events: (h) => [h.snap(), h.release({ target: 3, air: 8, from: 30, lateral: 10 }), h.catchPoint('catch', 38, { intended: 3, catcher: 3 }), h.possession(0, 3, 38, 'catch', 3.2), h.tackle(3, [105], 45), h.dead('down_by_contact', 45, 0, 3)],
  });
  p.passTouchdown = play({
    at: 80, result: 'pass_complete', gain: 20, offenseKind: 'play_action', final: { score: touchdown(0, 4) }, scoreAfter: [6, 0],
    events: (h) => [h.snap(), h.release({ target: 4, air: 18, from: 80 }), h.catchPoint('catch', 98, { intended: 4, catcher: 4 }), h.possession(0, 4, 98, 'catch', 3.2), h.dead('ball_across_goal_line_in_possession', 100, 0, 4)],
  });
  p.incompleteBrokenUp = play({
    at: 35, down: 3, dist: 6, result: 'pass_incomplete', offenseKind: 'quick_pass', final: { incomplete: true },
    events: (h) => [h.snap(), h.release({ target: 4, air: 12, from: 35, lateral: -10, underPressure: true }), h.catchPoint('breakup', 47, { intended: 4, defenders: [106] }), h.dead('incomplete_pass', 47, null, null, 3.5)],
  });
  p.throwaway = play({
    at: 35, result: 'pass_incomplete', offenseKind: 'dropback_pass', final: { incomplete: true },
    events: (h) => [h.snap(), h.release({ target: null, air: 25, from: 35, lateral: 25, throwaway: true }), h.dead('ball_out_of_bounds', 60, null, null, 4)],
  });
  p.spike = play({
    at: 45, result: 'spike', offenseKind: 'spike', final: { incomplete: true },
    events: (h) => [h.snap(), h.release({ target: null, air: 0, from: 51, spike: true, t: 0.6 }), h.dead('incomplete_pass', 45, null, null, 1)],
  });
  p.sackShared = play({
    at: 40, result: 'sack', gain: -7, offenseKind: 'dropback_pass',
    events: (h) => [h.snap(), h.pressure('sack', 107, 1, 33), h.pressure('sack', 108, 1, 33), h.tackle(1, [107, 108], 33), h.dead('down_by_contact', 33, 0, 1)],
  });
  p.sackFumbleKept = play({
    at: 40, result: 'sack', gain: -6, offenseKind: 'dropback_pass',
    events: (h) => [h.snap(), h.pressure('sack', 101, 1, 34), h.fumble(0, 1, 34, { forcedBy: 101 }), h.possession(0, 6, 34, 'fumble_recovery', 3.6), h.dead('down_by_contact', 34, 0, 6)],
  });
  p.sackFumbleLost = play({
    at: 25, result: 'fumble_lost', gain: -8, offenseKind: 'dropback_pass', final: { possessionAfter: 1, changeOfPossession: true },
    events: (h) => [h.snap(), h.pressure('sack', 102, 1, 17), h.fumble(0, 1, 17, { forcedBy: 102 }), h.possession(1, 103, 16, 'fumble_recovery', 3.6), h.dead('down_by_contact', 16, 1, 103)],
  });
  p.interception = play({
    at: 30, result: 'interception', offenseKind: 'dropback_pass', final: { possessionAfter: 1, changeOfPossession: true },
    events: (h) => [h.snap(), h.release({ target: 3, air: 20, from: 30 }), h.catchPoint('interception', 50, { intended: 3, catcher: 109 }), h.possession(1, 109, 50, 'interception', 3.2), h.tackle(109, [3], 40), h.dead('down_by_contact', 40, 1, 109)],
  });

  // Fumbles lost
  p.fumbleLostRun = play({
    at: 50, result: 'fumble_lost', gain: 3, final: { possessionAfter: 1, changeOfPossession: true },
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, 46, 'exchange', 0.9), h.fumble(0, 2, 53, { forcedBy: 110 }), h.possession(1, 111, 53, 'fumble_recovery', 3.6), h.dead('down_by_contact', 53, 1, 111)],
  });
  p.fumbleReturnTouchdown = play({
    at: 20, result: 'fumble_lost', gain: 2, final: { possessionAfter: 1, changeOfPossession: true, score: touchdown(1, 111) }, scoreAfter: [0, 6],
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, 16, 'exchange', 0.9), h.fumble(0, 2, 22, { forcedBy: 110 }), h.possession(1, 111, 22, 'fumble_recovery', 3.6), h.dead('ball_across_goal_line_in_possession', 0, 1, 111)],
  });
  p.receiverFumbleLost = play({
    at: 30, result: 'fumble_lost', gain: 14, offenseKind: 'dropback_pass', final: { possessionAfter: 1, changeOfPossession: true },
    events: (h) => [h.snap(), h.release({ target: 3, air: 10, from: 30 }), h.catchPoint('catch', 40, { intended: 3, catcher: 3 }), h.possession(0, 3, 40, 'catch', 3.2), h.fumble(0, 3, 44, { forcedBy: 106, t: 3.8 }), h.possession(1, 106, 44, 'fumble_recovery', 3.9), h.dead('down_by_contact', 44, 1, 106)],
  });
  // The officials ruled the runner down before the ball came out: no fumble is credited.
  p.fumbleOverruled = play({
    at: 50, result: 'run', gain: 4,
    rulings: [{ aspect: 'fumble_before_down', eventIndex: 3, trueValue: 'fumble', calledValue: 'down', marginYd: null, marginS: 0.1, visibility: 'pile', official: 'umpire', reviewable: true }],
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, 46, 'exchange', 0.9), h.fumble(0, 2, 54, { forcedBy: 110 }), h.possession(1, 111, 54, 'fumble_recovery', 3.6), h.dead('down_by_contact', 54, 1, 111)],
  });

  // Punts
  p.puntReturned = play({
    at: 30, down: 4, dist: 8, kickKind: 'punt', result: 'punt', final: { possessionAfter: 1, changeOfPossession: true },
    events: (h) => [h.snap(13), h.kick('punt', 13, 16, 75, { hang: 4.4 }), h.possession(1, 120, 75, 'kick_catch', 4.5), h.tackle(120, [2], 68, 'made', 5), h.dead('down_by_contact', 68, 1, 120, 5.5)],
  });
  p.puntFairCatchInside = play({
    at: 50, down: 4, dist: 3, kickKind: 'punt', result: 'punt', final: { possessionAfter: 1, changeOfPossession: true },
    events: (h) => [h.snap(13), h.kick('punt', 13, 36, 90), h.possession(1, 120, 90, 'kick_catch', 4.5), h.dead('fair_catch', 90, 1, 120)],
  });
  p.puntTouchback = play({
    at: 55, down: 4, dist: 6, kickKind: 'punt', result: 'punt', calledSpotAt: 80, final: { possessionAfter: 1, changeOfPossession: true, touchback: true },
    events: (h) => [h.snap(13), h.kick('punt', 13, 41, 105), h.dead('ball_dead_in_end_zone', 105, null, null)],
  });
  p.puntBlocked = play({
    at: 20, down: 4, dist: 9, kickKind: 'punt', result: 'punt', final: { possessionAfter: 1, changeOfPossession: true },
    events: (h) => [h.snap(13), h.kick('punt', 13, 6, 6, { blockedBy: 105, crossed: false }), h.possession(1, 105, 8, 'kick_recovery', 1.5), h.dead('down_by_contact', 8, 1, 105, 2)],
  });
  p.puntReturnTouchdown = play({
    at: 40, down: 4, dist: 5, kickKind: 'punt', result: 'punt', final: { possessionAfter: 1, changeOfPossession: true, score: touchdown(1, 120) }, scoreAfter: [0, 6],
    events: (h) => [h.snap(13), h.kick('punt', 13, 26, 85), h.possession(1, 120, 85, 'kick_catch', 4.5), h.dead('ball_across_goal_line_in_possession', 0, 1, 120, 9)],
  });
  p.puntMuffed = play({
    at: 35, down: 4, dist: 7, kickKind: 'punt', result: 'punt',
    events: (h) => [h.snap(13), h.kick('punt', 13, 21, 80), h.fumble(1, 120, 80, { kind: 'muff', t: 4.5 }), h.possession(0, 4, 79, 'fumble_recovery', 4.8), h.dead('down_by_contact', 79, 0, 4)],
  });

  // Place kicks
  p.fieldGoalGood = play({
    at: 70, down: 4, dist: 7, kickKind: 'field_goal', result: 'field_goal_good', final: { score: fg(0, 12) }, scoreAfter: [3, 0],
    events: (h) => [h.snap(), h.kick('field_goal', 12, 63, 110, { hang: 2 }), h.dead('kick_through_uprights', 110, null, null, 2.5)],
  });
  p.fieldGoalBlocked = play({
    at: 60, down: 4, dist: 10, kickKind: 'field_goal', result: 'field_goal_missed', final: { possessionAfter: 1, changeOfPossession: true },
    events: (h) => [h.snap(), h.kick('field_goal', 12, 53, 55, { blockedBy: 103, crossed: true }), h.dead('loose_ball_at_rest', 56, null, null, 2.5)],
  });
  p.tryKickGood = play({
    playKind: 'try', at: 85, kickKind: 'try_kick', result: 'try_good', final: { score: { type: 'try_kick', side: 0, points: 1, scorerId: 12 } }, scoreAfter: [7, 0],
    events: (h) => [h.snap(), h.kick('try_kick', 12, 78, 110, { hang: 2 }), h.dead('kick_through_uprights', 110, null, null, 2.5)],
  });
  p.tryKickFailed = play({
    playKind: 'try', at: 85, kickKind: 'try_kick', result: 'try_failed', score: [6, 0],
    events: (h) => [h.snap(), h.kick('try_kick', 12, 78, 110, { hang: 2 }), h.dead('kick_failed', 110, null, null, 2.5)],
  });
  p.fairCatchKick = play({
    playKind: 'fair_catch_kick', at: 55, down: null, dist: null, kickKind: 'fair_catch_kick', result: 'fair_catch_kick', final: { score: fg(0, 12) }, scoreAfter: [3, 0],
    events: (h) => [h.kick('fair_catch_kick', 12, 55, 110, { hang: 2.4 }), h.dead('kick_through_uprights', 110, null, null, 3)],
  });

  // Two-point tries
  p.twoPointRunGood = play({
    playKind: 'try', at: 98, result: 'try_good', gain: 2, final: { score: { type: 'try_two', side: 0, points: 2, scorerId: 2 } }, scoreAfter: [8, 0], score: [6, 0],
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, 94, 'exchange', 0.9), h.dead('ball_across_goal_line_in_possession', 100, 0, 2)],
  });
  p.twoPointPassGood = play({
    playKind: 'try', at: 98, result: 'try_good', gain: 2, offenseKind: 'quick_pass', final: { score: { type: 'try_two', side: 0, points: 2, scorerId: 3 } }, scoreAfter: [8, 0], score: [6, 0],
    events: (h) => [h.snap(), h.release({ target: 3, air: 4, from: 98 }), h.catchPoint('catch', 100, { intended: 3, catcher: 3 }), h.possession(0, 3, 100, 'catch', 3.2), h.dead('ball_across_goal_line_in_possession', 100, 0, 3)],
  });
  p.twoPointFailed = play({
    playKind: 'try', at: 98, result: 'try_failed', offenseKind: 'quick_pass', score: [6, 0], final: { incomplete: true },
    events: (h) => [h.snap(), h.release({ target: 4, air: 5, from: 98 }), h.catchPoint('uncatchable', 103, { intended: 4 }), h.dead('incomplete_pass', 103, null, null, 3.5)],
  });

  // Free kicks (side 1 kicks to side 0 on the kickoff to show the other direction)
  p.kickoffReturned = play({
    off: 1, playKind: 'kickoff', at: 35, down: null, dist: null, kickKind: 'kickoff', result: 'kickoff', final: { possessionAfter: 0, changeOfPossession: true },
    events: (h) => [h.kick('kickoff', 212, 35, 97, { hang: 4 }), h.possession(0, 320, 97, 'kick_catch', 4.2), h.tackle(320, [203], 75, 'made', 7), h.dead('down_by_contact', 75, 0, 320, 7.5)],
  });
  p.kickoffTouchback = play({
    playKind: 'kickoff', at: 35, down: null, dist: null, kickKind: 'kickoff', result: 'kickoff', calledSpotAt: 65, final: { possessionAfter: 1, changeOfPossession: true, touchback: true },
    events: (h) => [h.kick('kickoff', 12, 35, 105, { hang: 4 }), h.dead('ball_dead_in_end_zone', 105, null, null)],
  });
  p.kickoffReturnTouchdown = play({
    playKind: 'kickoff', at: 35, down: null, dist: null, kickKind: 'kickoff', result: 'kickoff', final: { possessionAfter: 1, changeOfPossession: true, score: touchdown(1, 120) }, scoreAfter: [0, 6],
    events: (h) => [h.kick('kickoff', 12, 35, 98, { hang: 4 }), h.possession(1, 120, 98, 'kick_catch', 4.2), h.dead('ball_across_goal_line_in_possession', 0, 1, 120, 12)],
  });
  p.safetyKick = play({
    playKind: 'safety_kick', at: 20, down: null, dist: null, kickKind: 'safety_kick', result: 'safety_kick', final: { possessionAfter: 1, changeOfPossession: true },
    events: (h) => [h.kick('safety_kick', 13, 20, 65, { hang: 4.2 }), h.possession(1, 120, 65, 'kick_catch', 4.3), h.tackle(120, [3], 55, 'made', 6), h.dead('down_by_contact', 55, 1, 120, 6.5)],
  });

  // Penalties
  p.falseStart = play({
    at: 30, result: 'no_play', liveTenths: 0, final: { noPlay: true, enforcement: enforcement([0], 5) }, fouls: [foulRecord('false_start', 0, 7, 5, 'before_snap')],
    events: (h) => [h.foul('false_start', 0, 7, 'before_snap'), h.dead('pre_snap_foul', 30, null, null, 0)],
  });
  // A live run wiped out by offensive holding: the snap counts, the penalty stands, nothing else does.
  p.holdingNoPlay = play({
    at: 40, result: 'run', gain: 9, final: { noPlay: true, enforcement: enforcement([0], 10) }, fouls: [foulRecord('offensive_holding', 0, 8, 10)],
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, 36, 'exchange', 0.9), h.foul('offensive_holding', 0, 8, 'live'), h.tackle(2, [101], 49), h.dead('down_by_contact', 49, 0, 2)],
  });
  // A run that stands with a personal foul by the defense added on: the yards count, so does the penalty.
  p.runWithFacemask = play({
    at: 20, result: 'run', gain: 6, final: { enforcement: enforcement([0], 15) }, fouls: [foulRecord('face_mask', 1, 104, 15)],
    events: (h) => [h.snap(), h.handoff(1, 2), h.possession(0, 2, 16, 'exchange', 0.9), h.foul('face_mask', 1, 104, 'live'), h.tackle(2, [104], 26), h.dead('down_by_contact', 26, 0, 2)],
  });
  // Two fouls enforced on one play: each keeps its catalogue distance (open point in the PR).
  p.twoFoulsEnforced = play({
    at: 50, result: 'pass_incomplete', offenseKind: 'dropback_pass', final: { incomplete: true, enforcement: enforcement([0, 1], 20) },
    fouls: [foulRecord('defensive_holding', 1, 106, 5), foulRecord('unnecessary_roughness', 1, 107, 15)],
    events: (h) => [h.snap(), h.foul('defensive_holding', 1, 106, 'live'), h.release({ target: 4, air: 15, from: 50 }), h.catchPoint('uncatchable', 65, { intended: 4 }), h.dead('incomplete_pass', 65, null, null, 3.5)],
  });

  return p;
}
