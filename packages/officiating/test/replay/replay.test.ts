// WP-05 replay and challenges: the Q1.1.1 cases of B9 and B13.9, on fixtures (see ../crew/helpers.ts).
// Fixture A is the procedure `challenge_plus_booth`, fixture B is `booth_all_plays`. Real rule values
// come with WP-01; clock and timeout effects of a review (B9.4.2) belong to the clock module and the facade.
import { describe, expect, it } from 'vitest';
import {
  PlayTruth, RuleKeyManifest, playTruthProblems,
  type CalledPlay, type FoulRecord, type PlayOutcome, type ReviewRequest, type Ruling, type RulingContext,
} from '@gm/schema';
import { CREW, crewModel, foulsAfterReview, seenFrom } from '../../src/crew/index.ts';
import {
  PARAMS, REFUSED, REPLAY, RULE_KEYS, boothMayReview, challengeAccounting, challengeRefusal, challengesLeft, evidenceQuality, replayParamNames, replayRules,
} from '../../src/replay/index.ts';
import { candidatesOf, ctx, ev, plays, truthOf, type CtxOptions } from '../crew/helpers.ts';
import { PROB_FLOOR, type TruthEvent } from '@gm/schema';

/** Evidence so clear that every wrong reviewable ruling is changed. */
const CLEAR = { [REPLAY.evidenceSightOpen]: 1, [REPLAY.evidenceScaleYd]: 0.01, [REPLAY.evidenceScaleS]: 0.005, [REPLAY.evidenceNoMargin]: 1 };
const clear = (o: CtxOptions = {}) => ctx({ ...o, params: { ...CLEAR, ...o.params } });

const ruling = (aspect: Ruling['aspect'], eventIndex: number, trueValue: string, calledValue: string, o: Partial<Ruling> = {}): Ruling =>
  ({ aspect, eventIndex, trueValue, calledValue, marginYd: 0.5, marginS: null, visibility: 'open', official: 'back_judge', reviewable: true, ...o });
const outcome = (o: Partial<PlayOutcome> = {}): PlayOutcome => ({
  resultType: 'run', noPlay: false, snappingSide: 0, possessionAfter: 0, changeOfPossession: false, spotX: 44, spotY: 24, previousSpotX: 40,
  score: null, touchback: false, endedOutOfBounds: false, incomplete: false, runnerDownInBounds: true, yardsGained: 4, injuryStoppage: [], enforcement: null, ...o,
});
const calledPlay = (rulings: Ruling[], o: Partial<PlayOutcome> = {}, fouls: FoulRecord[] = []): CalledPlay => {
  const out = outcome(o);
  return { rulings, fouls, trueOutcome: out, calledOutcome: out, options: [{ optionId: 'none', side: 0, labelKey: 'penalty.none', outcome: out }], defaultOptionId: 'none' };
};
const challenge = (aspects: Ruling['aspect'][], side: 0 | 1 = 0): ReviewRequest => ({ source: 'coach_challenge', side, aspects });
const booth: ReviewRequest = { source: 'booth', side: null, aspects: [] };
const assist: ReviewRequest = { source: 'replay_assist', side: null, aspects: [] };
const deadOf = (t: PlayTruth) => { const d = t.events.find((e) => e.type === 'dead_ball')!; if (d.type !== 'dead_ball') throw new Error(); return d; };
const numbered = (t: PlayTruth, playNumber: number): PlayTruth => ({ ...t, playNumber });

/** Runs a review of one hand-made wrong ruling and checks the corrected record is well formed. */
function reviewOf(truth: PlayTruth, rulings: Ruling[], request: ReviewRequest, c: RulingContext) {
  const seen = seenFrom(truth, rulings, new Set(), c, null);
  const r = replayRules.review(seen, truth, rulings, request, c);
  expect(playTruthProblems(r.seen)).toEqual([]);
  expect(PlayTruth.safeParse(r.seen).success).toBe(true);
  return { ...r, before: seen };
}

describe('parameters and rule keys', () => {
  it('every parameter the module asks for is in params.json, and nothing in the file is unused', () => {
    expect([...replayParamNames()].sort()).toEqual(PARAMS.params.map((p) => p.name).sort());
    for (const p of PARAMS.params) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
  });
  it('the rule-key manifest is well formed, names each key once, and the fixture rule sets define every key', () => {
    const keys = RuleKeyManifest.parse(RULE_KEYS).map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const model of ['challenge_plus_booth', 'booth_all_plays'] as const) {
      const have = ctx({ model }).rules.keys();
      for (const k of keys) expect(have, k).toContain(k);
    }
  });
});

describe('B9.1.1 the coach\'s challenge', () => {
  const play = () => calledPlay([ruling('fumble_before_down', 2, 'fumble', 'down')]);
  it('each team has two challenges, a third only if one of the first two succeeded, never a fourth', () => {
    const left = (used: number, won: number) => challengesLeft(0, ctx({ before: { challengesUsed: [used, 0], challengesWon: [won, 0] } }));
    expect([left(0, 0), left(1, 0), left(1, 1), left(2, 0), left(2, 1), left(2, 2), left(3, 1), left(3, 2)]).toEqual([2, 1, 2, 0, 1, 1, 0, 0]);
  });
  it('acceptance: two failed challenges, a third flag gets no review and costs a timeout', () => {
    const c = clear({ before: { challengesUsed: [2, 0], challengesWon: [0, 0] } });
    expect(replayRules.challengeable(play(), 0, c)).toEqual([]);
    const r = reviewOf(plays.runFumble(), play().rulings, challenge(['fumble_before_down']), c);
    expect(r).toMatchObject({ allowed: false, refusedKey: REFUSED.noChallenges, reversed: [] });
    expect(r.seen).toEqual(r.before);
    expect(challengeAccounting(challenge(['fumble_before_down']), r, c)).toEqual({ timeoutCharged: true, challengeLost: true });
  });
  it('acceptance: one won and one lost, a third is available', () => {
    const c = clear({ before: { challengesUsed: [2, 0], challengesWon: [1, 0] } });
    expect(replayRules.challengeable(play(), 0, c)).toEqual(['fumble_before_down']);
    expect(reviewOf(plays.runFumble(), play().rulings, challenge(['fumble_before_down']), c)).toMatchObject({ allowed: true, reversed: [0] });
  });
  it('acceptance: a challenge with zero timeouts gets no review (the 15 yards are the foul module\'s)', () => {
    const c = clear({ situation: { timeoutsLeft: [0, 3] } });
    expect(challengeRefusal(play(), 0, c)).toBe(REFUSED.noTimeout);
    expect(challengeRefusal(play(), 1, c)).toBeNull();
    expect(reviewOf(plays.runFumble(), play().rulings, challenge(['fumble_before_down']), c)).toMatchObject({ allowed: false, refusedKey: REFUSED.noTimeout });
  });
  it('acceptance: a flag after the two-minute warning with a timeout left gets no coach review and costs a timeout; the booth may still review', () => {
    const c = clear({ situation: { insideTwoMinute: true } });
    expect(replayRules.challengeable(play(), 0, c)).toEqual([]);
    const r = reviewOf(plays.runFumble(), play().rulings, challenge(['fumble_before_down']), c);
    expect(r).toMatchObject({ allowed: false, refusedKey: REFUSED.boothOnly });
    expect(challengeAccounting(challenge(['fumble_before_down']), r, c).timeoutCharged).toBe(true);
    expect(boothMayReview(play(), c)).toBe(true);
    expect(reviewOf(plays.runFumble(), play().rulings, booth, c)).toMatchObject({ allowed: true, reversed: [0] });
  });
  it('no coach challenges in overtime where the rule set says so (rule 10)', () => {
    expect(challengeRefusal(play(), 0, ctx({ situation: { overtime: true } }))).toBe(REFUSED.overtime);
    expect(challengeRefusal(play(), 0, ctx({ model: 'booth_all_plays', situation: { overtime: true } }))).toBeNull();
  });
  it('a failed challenge costs a timeout; a successful one does not (rules 6 and 7)', () => {
    const c = ctx();
    const req = challenge(['catch']);
    expect(challengeAccounting(req, { allowed: true, reversed: [] }, c)).toEqual({ timeoutCharged: true, challengeLost: true });
    expect(challengeAccounting(req, { allowed: true, reversed: [3] }, c)).toEqual({ timeoutCharged: false, challengeLost: false });
    expect(challengeAccounting(req, { allowed: true, reversed: [3] }, ctx({ rules: { 'challenge.overturn_refunds_timeout': false } }))).toEqual({ timeoutCharged: true, challengeLost: false });
    expect(challengeAccounting(booth, { allowed: true, reversed: [] }, c)).toEqual({ timeoutCharged: false, challengeLost: false });
  });
  it('a challenge succeeds if any reviewable aspect is changed, even one the coach did not name (rule 7, B9.2.1 rule 2)', () => {
    const truth = plays.runFumble();
    const rulings = [ruling('fumble_before_down', 2, 'fumble', 'down')];
    // The coach names the spot; the review finds the fumble.
    const withSpot = [...rulings, ruling('spot', 5, '45', '45', { marginYd: 5 })];
    expect(reviewOf(truth, withSpot, challenge(['spot']), clear())).toMatchObject({ allowed: true, reversed: [0] });
  });
  it('the number of challenges and the timeout rule are read from the rule set', () => {
    expect(challengesLeft(0, ctx({ rules: { 'challenge.count': 1 }, before: { challengesUsed: [1, 0], challengesWon: [0, 0] } }))).toBe(0);
    expect(challengesLeft(0, ctx({ rules: { 'challenge.third_if': 'never' }, before: { challengesUsed: [2, 0], challengesWon: [2, 0] } }))).toBe(0);
    expect(challengeRefusal(play(), 0, ctx({ rules: { 'challenge.requires_timeout': false }, situation: { timeoutsLeft: [0, 0] } }))).toBeNull();
  });
});

describe('B9.1.2 booth-initiated reviews', () => {
  it('acceptance: a fumble ruled recovered by the defense is the booth\'s play, with no challenge', () => {
    const c = ctx();
    const play = calledPlay([ruling('fumble_before_down', 2, 'fumble', 'fumble')], { resultType: 'fumble_lost', possessionAfter: 1, changeOfPossession: true });
    expect(boothMayReview(play, c)).toBe(true);
    expect(replayRules.challengeable(play, 0, c)).toEqual([]);
    expect(challengeRefusal(play, 0, c)).toBe(REFUSED.boothOnly);
    // The ruling was right, so the look confirms without stopping the game.
    expect(replayRules.boothReview(play, c)).toBeNull();
  });
  it('acceptance: a runner ruled down before fumbling at 9:00 of the third quarter is reviewed only if challenged', () => {
    const c = clear();
    const play = calledPlay([ruling('fumble_before_down', 2, 'fumble', 'down')]);
    expect(boothMayReview(play, c)).toBe(false);
    expect(replayRules.boothReview(play, c)).toBeNull();
    expect(replayRules.challengeable(play, 0, c)).toEqual(['fumble_before_down']);
    expect(replayRules.challengeable(play, 1, c)).toEqual(['fumble_before_down']);
  });
  it('each item of the booth-only list puts a play out of the coach\'s reach, and each is a rule key', () => {
    const cases: [string, Partial<PlayOutcome>, CtxOptions, FoulRecord[]][] = [
      ['scoring_play', { score: { type: 'touchdown', side: 0, points: 6, scorerId: 22 } }, {}, []],
      ['turnover', { resultType: 'interception', possessionAfter: 1, changeOfPossession: true }, {}, []],
      ['kick_possession', { resultType: 'punt', possessionAfter: 0 }, {}, []],
      ['failed_fourth_down', { resultType: 'run', spotX: 49.5 }, { situation: { down: 4 } }, []],
      ['try', {}, { situation: { playKind: 'try', down: null, lineToGainX: null } }, []],
      ['overtime', {}, { situation: { overtime: true }, rules: { 'challenge.allowed_in_overtime': true } }, []],
      ['after_two_minute', {}, { situation: { insideTwoMinute: true } }, []],
      ['disqualification', {}, {}, [{ ...candidatesOf(plays.runWithFoul('fx_head'))[0]!, dq: 'automatic', called: true, correct: true }]],
    ];
    for (const [item, o, opts, fouls] of cases) {
      const play = calledPlay([ruling('spot', 3, '44', '44')], o, fouls);
      expect(challengeRefusal(play, 0, ctx(opts)), item).toBe(REFUSED.boothOnly);
      expect(challengeRefusal(play, 0, ctx({ ...opts, rules: { ...opts.rules, [`replay.booth_only.${item}`]: false } })), item).toBeNull();
    }
  });
  it('a made fourth down, a ruling of no score and a kick the receivers hold are not the booth\'s: the coach must challenge', () => {
    const c = ctx({ situation: { down: 4 } });
    for (const o of [{ spotX: 50.2 }, { spotX: 50 }, { resultType: 'punt' as const, possessionAfter: 1 as const, changeOfPossession: true }]) {
      const play = calledPlay([ruling('spot', 3, '44', '44')], o);
      expect(boothMayReview(play, c)).toBe(false);
      expect(challengeRefusal(play, 0, c)).toBeNull();
    }
  });
  it('the booth stops the game only when the evidence for a change is above the stop threshold', () => {
    const td = { score: { type: 'touchdown' as const, side: 0 as const, points: 6, scorerId: 22 } };
    const wrongScore = (marginYd: number) => calledPlay([ruling('score', 3, 'short', 'score', { marginYd })], td);
    const c = ctx();
    expect(evidenceQuality(wrongScore(1).rulings[0]!, c)).toBeGreaterThan(0.35);
    expect(replayRules.boothReview(wrongScore(1), c)).toEqual({ source: 'booth', side: null, aspects: ['score'] });
    expect(evidenceQuality(wrongScore(0.05).rulings[0]!, c)).toBeLessThan(0.35);
    expect(replayRules.boothReview(wrongScore(0.05), c)).toBeNull();
    expect(replayRules.boothReview(wrongScore(0.05), ctx({ params: { [REPLAY.boothStopThreshold]: 0.1 } }))).not.toBeNull();
    // A wrong ruling replay may not change never stops the game.
    expect(replayRules.boothReview(calledPlay([ruling('down_by_contact', 2, 'live', 'whistle', { reviewable: false })], td), c)).toBeNull();
  });
});

describe('B9.2.1 the standard and the evidence model', () => {
  it('acceptance: of 10,000 wrong calls with evidence quality 0.6 about 60 percent are reversed; correct calls never', () => {
    const c = ctx({ params: { ...CLEAR, [REPLAY.evidenceSightOpen]: 0.6 } });
    const truth = plays.runFumble();
    const wrongCall = [ruling('fumble_before_down', 2, 'fumble', 'down')];
    const rightCall = [ruling('fumble_before_down', 2, 'fumble', 'fumble'), ruling('spot', 5, '45', '45')];
    expect(evidenceQuality(wrongCall[0]!, c)).toBeCloseTo(0.6, 9);
    const seenWrong = seenFrom(truth, wrongCall, new Set(), c, null);
    let reversed = 0;
    for (let i = 1; i <= 10000; i++) {
      const t = numbered(truth, i);
      if (replayRules.review(seenWrong, t, wrongCall, booth, c).reversed.length) reversed++;
      const right = replayRules.review(t, t, rightCall, booth, c);
      expect(right.reversed).toEqual([]);
      expect(right.seen).toBe(t);
    }
    expect(reversed / 10000).toBeGreaterThan(0.58); expect(reversed / 10000).toBeLessThan(0.62);
  });
  it('evidence is clearer the farther the truth was from the boundary, worse in a pile, better with postseason cameras', () => {
    const c = ctx();
    const q = (o: Partial<Ruling>, cx: RulingContext = c) => evidenceQuality(ruling('fumble_before_down', 2, 'fumble', 'down', { marginYd: null, ...o }), cx);
    // A knee down 0.3 s before the fumble is clearer than 0.03 s (B9.2.1 rule 5).
    expect(q({ marginS: 0.3 })).toBeGreaterThan(3 * q({ marginS: 0.03 }));
    expect(q({ marginS: 0.3 })).toBeCloseTo(0.95 * (1 - Math.exp(-3)), 9);
    expect(q({ marginS: 0.3, visibility: 'pile' })).toBeCloseTo(0.4 * (1 - Math.exp(-3)), 9);
    expect(q({ marginS: 0.1 }, ctx({ before: { gameType: 'postseason' } }))).toBeCloseTo(1.1 * q({ marginS: 0.1 }), 9);
    expect(q({ marginS: 5 }, ctx({ before: { gameType: 'postseason' } }))).toBe(1 - PROB_FLOOR);
    expect(q({ marginS: 0 })).toBe(PROB_FLOOR);
    // A spot is as clear as the size of the spotting error.
    expect(evidenceQuality(ruling('spot', 3, '50.4', '49.8'), c)).toBeCloseTo(0.95 * (1 - Math.exp(-2)), 6);
  });
  it('each ruling is reviewed by itself: one may change while another stands (rule 3)', () => {
    const truth = plays.goalLineShort(0.3, 'pile');
    // A wrong score in a pile (poor evidence) with clear evidence switched off for piles.
    const c = ctx({ params: { ...CLEAR, [REPLAY.evidenceSightPile]: 0 } });
    const rulings = [ruling('score', 3, 'short', 'score', { visibility: 'pile' })];
    const r = reviewOf(truth, rulings, booth, c);
    expect(r.reversed).toEqual([]);
    expect(deadOf(r.seen).reason).toBe('ball_across_goal_line_in_possession');
  });
  it('the same review gives the same answer every time, and the inputs are never changed', () => {
    const truth = plays.runFumble();
    const rulings = [ruling('fumble_before_down', 2, 'fumble', 'down')];
    const c = ctx({ params: { ...CLEAR, [REPLAY.evidenceSightOpen]: 0.5 } });
    const frozen = JSON.stringify([truth, rulings]);
    for (let i = 1; i <= 50; i++) {
      const t = numbered(truth, i);
      const seen = seenFrom(t, rulings, new Set(), c, null);
      expect(replayRules.review(seen, t, rulings, booth, c)).toEqual(replayRules.review(seen, t, rulings, booth, c));
    }
    expect(JSON.stringify([truth, rulings])).toBe(frozen);
  });
});

describe('B9.3 what can and cannot be reviewed', () => {
  it('B9.3.1 acceptance: on a play with no reviewable aspect there is nothing to challenge, and a flag thrown anyway is charged a timeout', () => {
    const c = clear();
    const play = calledPlay([ruling('down_by_contact', 2, 'live', 'whistle', { reviewable: false })]);
    expect(replayRules.challengeable(play, 0, c)).toEqual([]);
    const r = reviewOf(plays.brokenTackle(), play.rulings, challenge(['down_by_contact']), c);
    expect(r).toMatchObject({ allowed: false, refusedKey: REFUSED.notReviewable, reversed: [] });
    expect(challengeAccounting(challenge(['down_by_contact']), r, c)).toEqual({ timeoutCharged: true, challengeLost: true });
  });
  it('B9.3.2 acceptance: a flag thrown on a pass interference call gets no review and costs a timeout', () => {
    const truth = truthOf([ev.snap(), ev.release(2.4, true), ev.foul(3.3, 'dpi', 1, { borderline: true, severity: 1 }), ev.catchPoint(3.5, 'drop'), ev.dead(3.5, 'incomplete_pass', 55, null, null, {}, 20)]);
    const c = clear({ rules: { 'foul.dpi.exists': true, 'foul.dpi.yards': 15, 'foul.dpi.afd': true, 'foul.dpi.lod': false, 'foul.dpi.spot_foul': true,
      'foul.dpi.runoff_eligible': false, 'foul.dpi.class': 'other', 'foul.dpi.dq': 'none' }, params: { [CREW.phantomMaxChance]: 0.5 } });
    let i = 1;
    let p = crewModel.perceive(numbered(truth, i), [], c);
    while (!p.fouls[0]!.called) p = crewModel.perceive(numbered(truth, ++i), [], c);
    const flag = p.rulings.find((x) => x.aspect === 'foul')!;
    expect(flag).toMatchObject({ trueValue: 'no_foul', calledValue: 'foul', reviewable: false });
    const r = replayRules.review(p.seen, numbered(truth, i), p.rulings, challenge(['foul']), c);
    expect(r).toMatchObject({ allowed: false, refusedKey: REFUSED.notReviewable });
    expect(challengeAccounting(challenge(['foul']), r, c).timeoutCharged).toBe(true);
    // Even a review started for another reason leaves the flag alone.
    expect(replayRules.review(p.seen, numbered(truth, i), p.rulings, booth, c).reversed).toEqual([]);
  });
  it('WP-05 acceptance: replay reverses only reviewable rulings, and never a correct one', () => {
    const noisy = { ...CLEAR, [CREW.erroneousWhistlePerGame]: 0.05, [CREW.whistleChancesPerGame]: 1, [CREW.phantomMaxChance]: 0.5 };
    const all = [plays.run(49.9), plays.brokenTackle(), plays.catchAndRun({ marginYd: 0 }), plays.drop({ marginS: 0 }, { marginYd: 0 }), plays.interception({ marginYd: 0 }),
      plays.catchFumble({ marginYd: 0 }), plays.runFumble({ marginS: 0 }), plays.backwardLoose({ marginYd: 0 }), plays.goalLineScore({ marginYd: 0 }), plays.goalLineShort(0.05),
      plays.fieldGoal(true, { marginYd: 0 }), plays.muffedPunt({ marginYd: 0 }), plays.runWithFoul('fx_hold'), plays.runWithFoul('fx_mask', { borderline: true, severity: 1 })];
    let reversedCount = 0, stood = 0;
    for (let seed = 1; seed <= 120; seed++) for (const truth of all) for (const model of ['challenge_plus_booth', 'booth_all_plays'] as const) {
      const c = ctx({ seed, model, params: noisy, rules: { 'replay.reviewable.touching': false } });
      const p = crewModel.perceive(truth, candidatesOf(truth), c);
      const r = replayRules.review(p.seen, truth, p.rulings, booth, c);
      expect(playTruthProblems(r.seen)).toEqual([]);
      expect(PlayTruth.safeParse(r.seen).success).toBe(true);
      for (const i of r.reversed) {
        expect(p.rulings[i]!.reviewable).toBe(true);
        expect(p.rulings[i]!.calledValue).not.toBe(p.rulings[i]!.trueValue);
        reversedCount++;
      }
      const unreviewableWrong = p.rulings.some((x) => !x.reviewable && x.aspect !== 'foul' && x.calledValue !== x.trueValue);
      if (unreviewableWrong && r.reversed.length === 0) { stood++; expect(r.seen).toEqual(p.seen); }
      if (p.rulings.every((x) => x.calledValue === x.trueValue)) { expect(r.reversed).toEqual([]); expect(r.seen).toBe(p.seen); }
    }
    expect(reversedCount).toBeGreaterThan(100);
    expect(stood).toBeGreaterThan(20);
  });
  it('the reviewable list is rule data: switching an aspect off closes it to replay', () => {
    const truth = plays.catchAndRun({ marginYd: 0 });
    const c = clear({ rules: { 'replay.reviewable.catch': false } });
    let i = 1;
    let p = crewModel.perceive(numbered(truth, i), [], c);
    while (p.rulings[0]!.calledValue === p.rulings[0]!.trueValue) p = crewModel.perceive(numbered(truth, ++i), [], c);
    expect(p.rulings[0]).toMatchObject({ aspect: 'catch', reviewable: false });
    expect(replayRules.review(p.seen, numbered(truth, i), p.rulings, booth, c).reversed).toEqual([]);
  });
});

describe('B9.4.1 ball placement after a reversal', () => {
  const c = clear();
  it('acceptance: pass ruled incomplete, review shows a catch and fumble, a defender picked it up at once: defense\'s ball at the recovery spot', () => {
    const r = reviewOf(plays.catchFumble(), [ruling('catch', 2, 'complete', 'incomplete')], booth, c);
    expect(r.reversed).toEqual([0]);
    expect(deadOf(r.before).reason).toBe('incomplete_pass');
    // He ran it back to x = 30 in truth; there is no advance after the recovery.
    expect(deadOf(r.seen)).toMatchObject({ side: 1, carrierId: 31, spot: { x: 57, y: 26 }, t: 4.5, reason: 'down_by_contact' });
    expect(r.seen.liveDurationTenths).toBe(45);
  });
  it('acceptance: the same play with nobody picking it up: offense\'s ball at the spot of the fumble', () => {
    const atRest = truthOf([
      ev.snap(), ev.release(2.4, true), ev.catchPoint(3.5, 'catch'), ev.possession(3.5, 0, 80, 55, 'catch', 20),
      ev.fumble(3.9, 'fumble', 80, 0, 56), ev.dead(6.0, 'loose_ball_at_rest', 59, 0, null),
    ]);
    for (const truth of [atRest, plays.catchFumble({}, 4)]) {
      const r = reviewOf(truth, [ruling('catch', 2, 'complete', 'incomplete')], booth, c);
      expect(deadOf(r.seen)).toMatchObject({ side: 0, carrierId: null, spot: { x: 56, y: 24 }, reason: 'loose_ball_at_rest' });
    }
  });
  it('rule 1: incomplete changed to a catch puts the ball at the spot of the catch, with no advance', () => {
    const r = reviewOf(plays.catchAndRun(), [ruling('catch', 2, 'complete', 'incomplete')], challenge(['catch']), c);
    expect(r.reversed).toEqual([0]);
    expect(deadOf(r.seen)).toMatchObject({ side: 0, carrierId: 80, spot: { x: 55, y: 20 }, t: 3.5, reason: 'down_by_contact' });
    expect(r.seen.events.filter((e) => e.type === 'possession')).toHaveLength(1);
  });
  it('rule 4: incomplete changed to an interception puts the ball at the spot of the interception, with no advance', () => {
    const r = reviewOf(plays.interception(), [ruling('catch', 2, 'intercepted', 'incomplete')], booth, c);
    expect(deadOf(r.seen)).toMatchObject({ side: 1, carrierId: 24, spot: { x: 55, y: 20 } });
  });
  it('rule 2: down by contact changed to a fumble gives the ball to the clear recoverer at the recovery spot', () => {
    const r = reviewOf(plays.runFumble(), [ruling('fumble_before_down', 2, 'fumble', 'down')], challenge(['fumble_before_down'], 1), c);
    expect(deadOf(r.before)).toMatchObject({ side: 0, carrierId: 22, spot: { x: 46, y: 24 } });
    expect(deadOf(r.seen)).toMatchObject({ side: 1, carrierId: 55, spot: { x: 47, y: 26 } });
  });
  it('rule 2: with no clear recovery the ball stays with the fumbling team where it lost it; in its own end zone, at the yard line of the rule set', () => {
    const late = reviewOf(plays.runFumble({}, 4), [ruling('fumble_before_down', 2, 'fumble', 'down')], booth, c);
    expect(deadOf(late.seen)).toMatchObject({ side: 0, carrierId: null, spot: { x: 46, y: 24 }, reason: 'loose_ball_at_rest' });
    const inEndZone = truthOf([
      ev.snap(), ev.possession(0.6, 0, 22, 9, 'exchange'), ev.fumble(1.5, 'fumble', 22, 0, 8), ev.possession(6, 1, 55, 7, 'fumble_recovery'),
      ev.dead(6, 'ball_across_goal_line_in_possession', 7, 1, 55),
    ], { originX: 12, endZoneImpetus: 0 });
    const r = reviewOf(inEndZone, [ruling('fumble_before_down', 2, 'fumble', 'down')], booth, clear({ situation: { ballX: 12, lineToGainX: 22 } }));
    expect(deadOf(r.seen)).toMatchObject({ side: 0, spot: { x: 11, y: 24 }, reason: 'loose_ball_at_rest' });
    const two = reviewOf(inEndZone, [ruling('fumble_before_down', 2, 'fumble', 'down')], booth, clear({ rules: { 'replay.no_recovery_end_zone_yardline': 2 } }));
    expect(deadOf(two.seen).spot.x).toBe(12);
  });
  it('rule 2: a loose ball that went out of bounds stays as the truth has it', () => {
    const out = truthOf([ev.snap(), ev.possession(0.6, 0, 22, 38, 'exchange'), ev.fumble(3.0, 'fumble', 22, 0, 46), ev.boundary(3.8, 'ball_out_of_bounds', null, 48, {}, 0), ev.dead(3.8, 'ball_out_of_bounds', 48, null, null, {}, 0)]);
    const r = reviewOf(out, [ruling('fumble_before_down', 2, 'fumble', 'down')], booth, c);
    expect(r.reversed).toEqual([0]);
    expect(r.seen).toEqual(out);
  });
  it('rule 2: an incomplete ruling changed to a backward pass: the edge case of the defender who scooped and ran gets the ball at the recovery spot, not the touchdown', () => {
    const r = reviewOf(plays.backwardLoose(), [ruling('forward_or_backward_pass', 1, 'backward', 'forward')], booth, c);
    expect(deadOf(r.before).reason).toBe('incomplete_pass');
    expect(deadOf(r.seen)).toMatchObject({ side: 1, carrierId: 91, spot: { x: 32, y: 26 }, reason: 'down_by_contact' });
    expect(r.seen.endZoneImpetus).toBeNull();
  });
  it('rule 6 and the goal line: a touchdown ruled short is restored, and a wrongly ruled score comes off the board', () => {
    const score = plays.goalLineScore({ marginYd: 0.4 });
    expect(reviewOf(score, [ruling('score', 2, 'score', 'short', { marginYd: 0.4 })], challenge(['score']), c).seen).toEqual(score);
    const short = plays.goalLineShort(0.4);
    expect(reviewOf(short, [ruling('score', 3, 'short', 'score', { marginYd: 0.4 })], booth, c).seen).toEqual(short);
  });
  it('rule 5 and B9.3.1: the ball goes to the correct spot in every case, but the review succeeds only if the first-down ruling changes', () => {
    const made = plays.run(50.3);
    const flip = reviewOf(made, [ruling('spot', 3, '50.3', '49.7')], challenge(['spot']), c);
    expect(flip.reversed).toEqual([0]);
    expect(deadOf(flip.seen).spot.x).toBe(50.3);
    const same = reviewOf(plays.run(44), [ruling('spot', 3, '44', '44.5'), ruling('fumble_before_down', 1, 'x', 'x')], challenge(['spot']), c);
    expect(same.reversed).toEqual([]);
    expect(deadOf(same.before).spot.x).toBe(44.5);
    expect(deadOf(same.seen).spot.x).toBe(44);
    expect(challengeAccounting(challenge(['spot']), same, c)).toEqual({ timeoutCharged: true, challengeLost: true });
    // Attacking the other way the line to gain is tested from the other side.
    const west = truthOf([ev.snap(), ev.possession(0.6, 0, 22, 62, 'exchange'), ev.dead(3, 'down_by_contact', 50.3, 0, 22)], { originX: 60, attackDir: -1 });
    const cw = clear({ situation: { attackDir: -1, ballX: 60, lineToGainX: 50 } });
    expect(reviewOf(west, [ruling('spot', 2, '50.3', '49.7')], challenge(['spot']), cw).reversed).toEqual([0]);
  });
  it('field goals and kick touching are put back as the truth has them', () => {
    const fg = plays.fieldGoal(true, { marginYd: 0.4 });
    expect(reviewOf(fg, [ruling('kick_good', 2, 'good', 'no_good')], booth, c).seen).toEqual(fg);
    const punt = plays.muffedPunt({ marginYd: 0.4 });
    expect(reviewOf(punt, [ruling('touching', 2, 'touched', 'untouched')], booth, c).seen).toEqual(punt);
    // A touch that did not happen: replay takes it out and the kickers recovery stands as it was.
    const untouched = truthOf([
      ev.snap(), ev.kick(2.0, 'punt', 80), { ...ev.kickTouch(5.8, 'landed', 1, 1, 80), playerId: null, side: null } as TruthEvent,
      ev.possession(7.0, 0, 47, 84, 'kick_recovery'), ev.dead(7.0, 'kick_recovered_by_kickers', 84, 0, 47),
    ]);
    const phantom = reviewOf(untouched, [ruling('touching', 3, 'untouched', 'touched', { marginYd: null })], booth, c);
    expect(phantom.before.events.some((e) => e.type === 'kick_touch' && e.kind === 'touched_by_receivers')).toBe(true);
    expect(phantom.reversed).toEqual([0]);
    expect(phantom.seen).toEqual(untouched);
  });
});

describe('B9.5.1 replay assist', () => {
  const mask = plays.runWithFoul('fx_mask', { borderline: true, severity: 1 });
  const flagged = (truth: PlayTruth, c: RulingContext, from = 1) => {
    let i = from;
    let p = crewModel.perceive(numbered(truth, i), [], c);
    while (!p.fouls[0]!.called) p = crewModel.perceive(numbered(truth, ++i), [], c);
    return { p, i, truth: numbered(truth, i) };
  };
  it('acceptance: a face mask flag thrown when there was no hand on the mask is picked up at the modelled rate', () => {
    const c = ctx({ params: { [CREW.phantomMaxChance]: 0.5 } });
    const expected = 0.95 * 0.8 * 0.8;
    let flags = 0, picked = 0, next = 1;
    while (flags < 3000) {
      const f = flagged(mask, c, next);
      next = f.i + 1; flags++;
      const r = replayRules.review(f.p.seen, f.truth, f.p.rulings, assist, c);
      if (r.reversed.length) {
        picked++;
        expect(foulsAfterReview(f.p.fouls, f.p.rulings, r.reversed)[0]).toMatchObject({ called: false, correct: true });
      }
      expect(r.seen).toEqual(f.p.seen);
    }
    expect(Math.abs(picked / flags - expected)).toBeLessThan(0.03);
  });
  it('acceptance: no uncalled foul is ever added by assist, and a flag for a foul not on the list stays', () => {
    const c = clear({ params: { [CREW.phantomMaxChance]: 0.5 } });
    const missed = [ruling('foul', 2, 'foul', 'no_foul', { marginYd: null, reviewable: false })];
    expect(replayRules.review(plays.runWithFoul('fx_mask'), plays.runWithFoul('fx_mask'), missed, assist, c).reversed).toEqual([]);
    const hold = flagged(plays.runWithFoul('fx_hold', { borderline: true, severity: 1 }), c);
    expect(replayRules.review(hold.p.seen, hold.truth, hold.p.rulings, assist, c).reversed).toEqual([]);
    const face = flagged(mask, c);
    expect(replayRules.review(face.p.seen, face.truth, face.p.rulings, assist, c).reversed.length).toBe(1);
  });
  it('assist corrects only the aspects the rule set lists, and never down by contact when the runner was ruled down', () => {
    const c = clear({ params: { [REPLAY.assistFactor]: 1 } });
    const backward = plays.backwardLoose();
    expect(reviewOf(backward, [ruling('forward_or_backward_pass', 1, 'backward', 'forward')], assist, c).reversed).toEqual([0]);
    expect(reviewOf(plays.catchAndRun(), [ruling('catch', 2, 'complete', 'incomplete')], assist, c).reversed).toEqual([]);
    expect(reviewOf(plays.runFumble(), [ruling('fumble_before_down', 2, 'fumble', 'down')], assist, c).reversed).toEqual([]);
    expect(reviewOf(plays.brokenTackle(), [ruling('down_by_contact', 2, 'live', 'whistle', { reviewable: false })], assist, c).reversed).toEqual([]);
    // The all-plays fixture lists nothing for assist: its booth reviews instead.
    expect(reviewOf(backward, [ruling('forward_or_backward_pass', 1, 'backward', 'forward')], assist, clear({ model: 'booth_all_plays', params: { [REPLAY.assistFactor]: 1 } })).reversed).toEqual([]);
  });
  it('assist does not limit a later review (rule 4): it draws on its own', () => {
    const truth = plays.backwardLoose();
    const rulings = [ruling('forward_or_backward_pass', 1, 'backward', 'forward')];
    const c = ctx({ params: { ...CLEAR, [REPLAY.evidenceSightOpen]: 0.5, [REPLAY.assistFactor]: 1 } });
    let differ = 0;
    for (let i = 1; i <= 400; i++) {
      const t = numbered(truth, i);
      const seen = seenFrom(t, rulings, new Set(), c, null);
      if (replayRules.review(seen, t, rulings, assist, c).reversed.length !== replayRules.review(seen, t, rulings, booth, c).reversed.length) differ++;
    }
    expect(differ).toBeGreaterThan(120); expect(differ).toBeLessThan(280);
  });
});

describe('B13.9.1 the all-plays booth model, and fouls a rule set sends to replay', () => {
  it('the booth may review any play, and the coach may still challenge it, in the last two minutes too', () => {
    const c = clear({ model: 'booth_all_plays', situation: { insideTwoMinute: true } });
    const play = calledPlay([ruling('fumble_before_down', 2, 'fumble', 'down')]);
    expect(boothMayReview(play, c)).toBe(true);
    expect(replayRules.boothReview(play, c)).toEqual({ source: 'booth', side: null, aspects: ['fumble_before_down'] });
    expect(replayRules.challengeable(play, 0, c)).toEqual(['fumble_before_down']);
    expect(replayRules.boothReview(calledPlay([ruling('fumble_before_down', 2, 'fumble', 'fumble')]), c)).toBeNull();
  });
  it('a challenge needs a timeout; an upheld one spends it and an overturned one gives it back', () => {
    const c = clear({ model: 'booth_all_plays', situation: { timeoutsLeft: [0, 1] } });
    const play = calledPlay([ruling('fumble_before_down', 2, 'fumble', 'down')]);
    expect(replayRules.challengeable(play, 0, c)).toEqual([]);
    expect(replayRules.challengeable(play, 1, c)).toEqual(['fumble_before_down']);
    expect(challengeAccounting(challenge(['catch'], 1), { allowed: true, reversed: [0] }, c).timeoutCharged).toBe(false);
    expect(challengeAccounting(challenge(['catch'], 1), { allowed: true, reversed: [] }, c).timeoutCharged).toBe(true);
  });
  it('a foul the rule set sends to replay is reviewed every time it is called; an unfounded one is taken off', () => {
    for (const model of ['challenge_plus_booth', 'booth_all_plays'] as const) {
      const c = clear({ model, params: { [CREW.phantomMaxChance]: 0.5 } });
      const real = plays.runWithFoul('fx_head', { severity: 1 });
      let i = 1;
      let p = crewModel.perceive(numbered(real, i), candidatesOf(real), c);
      while (!p.fouls[0]!.called) p = crewModel.perceive(numbered(real, ++i), candidatesOf(real), c);
      expect(p.rulings.find((x) => x.aspect === 'foul')!.reviewable).toBe(true);
      expect(replayRules.boothReview(calledPlay(p.rulings, {}, p.fouls), c)).toEqual({ source: 'booth', side: null, aspects: ['foul'] });
      // The foul was real: the review confirms it.
      expect(replayRules.review(p.seen, numbered(real, i), p.rulings, booth, c).reversed).toEqual([]);

      const none = plays.runWithFoul('fx_head', { borderline: true, severity: 1 });
      i = 1;
      p = crewModel.perceive(numbered(none, i), [], c);
      while (!p.fouls[0]!.called) p = crewModel.perceive(numbered(none, ++i), [], c);
      const r = replayRules.review(p.seen, numbered(none, i), p.rulings, booth, c);
      expect(r.reversed.length).toBe(1);
      expect(foulsAfterReview(p.fouls, p.rulings, r.reversed)[0]!.called).toBe(false);
      // An uncalled foul is not created by replay.
      const quiet = crewModel.perceive(numbered(none, 1), [], ctx({ model, params: { [CREW.phantomMaxChance]: 0 } }));
      expect(replayRules.boothReview(calledPlay(quiet.rulings, {}, quiet.fouls), c)).toBeNull();
    }
  });
});
