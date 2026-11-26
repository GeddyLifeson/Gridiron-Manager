// Q1.1.1 rule cases for B6 (kicks) and B13.6 (college kicks and the try), on FIXTURE rule sets
// (see fixture.ts). Each acceptance case of a B6 leaf is a named test. The kicking team is side 0 and
// attacks east unless a test says otherwise: its own 35 is x = 45, the receivers' 20 is x = 90.
import { describe, expect, it } from 'vitest';
import { PlayOutcome, PlayTruth, RuleKeyManifest, ParamFile, playTruthProblems, type PlayKind, type RuleSet, type Side, type TruthEvent } from '@gm/schema';
import { createKickRuling, RULE_KEYS, PARAMS } from '../../src/kick/index.ts';
import { BOTH, CENTRE_Y, COLLEGE, COLLEGE_VALUES, GEOMETRY, PRO, PRO_VALUES, ev, makeCtx, opp, own, truthOf } from './fixture.ts';

const kick = createKickRuling();

interface RunOptions { playKind?: PlayKind; ballX?: number; impetus?: Side | null; otPeriod?: number }

/** Mirrors a play end for end, so the same play is kicked west by the same team. */
function mirror(events: TruthEvent[]): TruthEvent[] {
  const flip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(flip);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.x === 'number' && typeof o.y === 'number' && Object.keys(o).length === 2) return { x: GEOMETRY.lengthYd - o.x, y: GEOMETRY.widthYd - o.y };
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, flip(x)]));
    }
    return v;
  };
  return flip(events) as TruthEvent[];
}

function run(rules: RuleSet, events: TruthEvent[], o: RunOptions = {}) {
  const ballX = o.ballX ?? own(35);
  const overtime = o.otPeriod ? { otPeriod: o.otPeriod, possessions: [], tossWinner: 0 as Side, firstPossession: 0 as Side } : null;
  const truth = PlayTruth.parse(truthOf(events, { impetus: o.impetus ?? null }));
  expect(playTruthProblems(truth)).toEqual([]);
  expect(kick.handles(truth)).toBe(true);
  const ctx = makeCtx({ rules, playKind: o.playKind ?? 'kickoff', ballX, overtime });
  const outcome = kick.rule(truth, ctx);
  const choices = kick.choices(truth, ctx);
  const facts = kick.facts(truth, ctx);
  // Every outcome is a valid contract object, and the first choice is the ruling.
  PlayOutcome.parse(outcome);
  expect(choices[0]!.outcome).toEqual(outcome);
  for (const c of choices) { PlayOutcome.parse(c.outcome); expect(c.side).toBe(1); }
  expect(outcome.snappingSide).toBe(0);
  expect(outcome.noPlay).toBe(false);
  // The same play kicked toward the other goal gives the mirrored spot: no rule depends on the direction.
  const mTruth = PlayTruth.parse(truthOf(mirror(events), { impetus: o.impetus ?? null, attackDir: -1, originX: GEOMETRY.lengthYd - ballX }));
  const mCtx = makeCtx({ rules, playKind: o.playKind ?? 'kickoff', ballX: GEOMETRY.lengthYd - ballX, attackDir: -1, overtime });
  const m = kick.rule(mTruth, mCtx);
  expect(m.spotX).toBeCloseTo(GEOMETRY.lengthYd - outcome.spotX, 9);
  expect({ ...m, spotX: 0, spotY: 0, previousSpotX: 0 }).toEqual({ ...outcome, spotX: 0, spotY: 0, previousSpotX: 0 });
  return { outcome, choices, facts };
}

const A35 = own(35);

describe('kick module contract', () => {
  it('exports a valid rule-key manifest and parameter file, and both fixtures define every key', () => {
    const keys = RuleKeyManifest.parse(RULE_KEYS);
    ParamFile.parse(PARAMS);
    expect(new Set(keys.map((k) => k.key)).size).toBe(keys.length);
    for (const k of keys) {
      for (const values of [PRO_VALUES, COLLEGE_VALUES]) {
        expect(values[k.key], k.key).toBeDefined();
        expect(typeof values[k.key]).toBe(k.type === 'number' ? 'number' : k.type === 'boolean' ? 'boolean' : 'string');
        if (k.type === 'option') expect(k.options).toContain(values[k.key]);
      }
      expect(k.ownerLeaf).toMatch(/^B\d+\.\d+\.\d+$/);
    }
  });

  it('handles only plays with a kick event', () => {
    const noKick = PlayTruth.parse(truthOf([ev.snap(), ev.dead(4, 'down_by_contact', own(40), 0)]));
    expect(kick.handles(noKick)).toBe(false);
  });

  it('reads every value by key: changing the fixture changes the ruling', () => {
    const events = [ev.kick('kickoff', A35, 121), ev.dead(4.5, 'ball_out_of_bounds', 121, null)];
    expect(run(PRO, events).outcome.spotX).toBe(opp(35));
    expect(run(COLLEGE, events).outcome.spotX).toBe(opp(25));
  });
});

describe('B6.1.4 kickoff results under the dynamic format (pro fixture)', () => {
  it('kick from the A35 lands at the B8 and rolls dead in the end zone, downed: B20', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', A35, opp(8)), ev.landed(4, opp(8)), ev.poss(6, 1, 112, 'kick_recovery'), ev.dead(6.5, 'kneel', 112, 1)]);
    expect(outcome).toMatchObject({ resultType: 'kickoff', touchback: true, possessionAfter: 1, changeOfPossession: true, spotX: opp(20), spotY: CENTRE_Y, score: null });
  });

  it('kick flies out the back of the end zone: B35', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', A35, 121), ev.dead(4.5, 'ball_out_of_bounds', 121, null)]);
    expect(outcome).toMatchObject({ touchback: true, possessionAfter: 1, spotX: opp(35) });
  });

  it('kick lands at the B24: dead, receivers ball at the B40', () => {
    const { outcome, choices } = run(PRO, [ev.kick('kickoff', A35, opp(24)), ev.landed(4, opp(24)), ev.dead(4, 'kick_short_of_landing_zone', opp(24), null)]);
    expect(outcome).toMatchObject({ touchback: false, possessionAfter: 1, spotX: opp(40) });
    expect(choices).toHaveLength(1);
  });

  it('kick out of bounds at the B15: receivers choose, the B40 preselected', () => {
    const { outcome, choices } = run(PRO, [ev.kick('kickoff', A35, opp(18)), ev.landed(4, opp(18), 5), ev.dead(5, 'ball_out_of_bounds', opp(15), null, { y: 0 })]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(40), spotY: GEOMETRY.hashSouthY, endedOutOfBounds: true });
    expect(choices.map((c) => [c.labelKey, c.outcome.spotX])).toEqual([['kick.result.spot_from_kick', opp(40)], ['kick.result.out_of_bounds_spot', opp(15)]]);
  });

  it('a kickoff from the 50 that is a touchback comes out to the 20', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', own(50), 121), ev.dead(4, 'ball_out_of_bounds', 121, null)], { ballX: own(50) });
    expect(outcome).toMatchObject({ touchback: true, spotX: opp(20) });
  });

  it('lands in the end zone and is downed there: B35; hits the goal post: B35', () => {
    const downed = run(PRO, [ev.kick('kickoff', A35, 113), ev.poss(4, 1, 113, 'kick_catch'), ev.dead(4.5, 'kneel', 113, 1)]);
    expect(downed.outcome).toMatchObject({ touchback: true, spotX: opp(35) });
    const post = run(PRO, [ev.kick('kickoff', A35, 120), ev.dead(4.2, 'kick_hit_goal', 120, null)]);
    expect(post.outcome).toMatchObject({ touchback: true, spotX: opp(35) });
  });

  it('receivers last to touch before it goes out of bounds: their ball at that spot, no choice', () => {
    const { outcome, choices } = run(PRO, [ev.kick('kickoff', A35, opp(10)), ev.touchR(4, opp(10)), ev.dead(5, 'ball_out_of_bounds', opp(6), null, { y: 0 })]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(6) });
    expect(choices).toHaveLength(1);
  });

  it('a short kick that travels less than 25 yards is spotted where it landed', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', A35, own(55)), ev.landed(2, own(55)), ev.dead(2, 'kick_short_of_landing_zone', own(55), null)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: own(55) });
  });

  it('a kick that touches a setup-zone player before the landing zone is short (B6.1.3 edge case)', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', A35, opp(33)), ev.touchR(2, opp(33)), ev.dead(2, 'kick_short_of_landing_zone', opp(33), null)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(40) });
  });

  it('safety kick from the A20 short of the landing zone: 30 yards from the kick', () => {
    const { outcome } = run(PRO, [ev.kick('safety_kick', own(20), opp(30)), ev.landed(4, opp(30)), ev.dead(4, 'kick_short_of_landing_zone', opp(30), null)], { playKind: 'safety_kick', ballX: own(20) });
    expect(outcome).toMatchObject({ resultType: 'safety_kick', possessionAfter: 1, spotX: own(50) });
  });

  it('a return ends where the runner is down; a return to the other end zone is a touchdown', () => {
    const tackled = run(PRO, [ev.kick('kickoff', A35, opp(5)), ev.poss(4, 1, opp(5), 'kick_catch'), ev.dead(9, 'down_by_contact', opp(30), 1)]);
    expect(tackled.outcome).toMatchObject({ possessionAfter: 1, changeOfPossession: true, spotX: opp(30), runnerDownInBounds: true, touchback: false });
    expect(tackled.facts).toMatchObject({ receiversPossessed: true, kickersRecoveredLegally: false, freeKick: true });
    const scored = run(PRO, [ev.kick('kickoff', A35, opp(5)), ev.poss(4, 1, opp(5), 'kick_catch'), ev.dead(15, 'ball_across_goal_line_in_possession', 9, 1)]);
    expect(scored.outcome.score).toEqual({ type: 'touchdown', side: 1, points: 6, scorerId: 21 });
  });

  it('a returner who fields the kick in the field and is downed in his own end zone gives up a safety (B7.7.1)', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', A35, opp(3)), ev.poss(4, 1, opp(3), 'kick_catch'), ev.dead(6, 'down_by_contact', 111, 1)]);
    expect(outcome.score).toEqual({ type: 'safety', side: 0, points: 2, scorerId: null });
    expect(outcome.touchback).toBe(false);
  });

  it('B6.1.3 item 7: the kicking team may recover once the ball has landed in the landing zone; dead at once', () => {
    const { outcome, facts } = run(PRO, [ev.kick('kickoff', A35, opp(15)), ev.landed(4, opp(15)), ev.poss(5, 0, opp(12), 'kick_recovery'), ev.dead(5, 'kick_recovered_by_kickers', opp(12), 0)]);
    expect(outcome).toMatchObject({ possessionAfter: 0, changeOfPossession: false, spotX: opp(12), yardsGained: 0 });
    expect(facts.kickersRecoveredLegally).toBe(true);
  });

  it('B6.1.3 item 7: a kicking-team catch in the landing zone before the ball lands or a receiver touches it is not legal', () => {
    const { outcome, facts } = run(PRO, [ev.kick('kickoff', A35, opp(15)), ev.poss(4, 0, opp(15), 'kick_catch'), ev.dead(4, 'kick_recovered_by_kickers', opp(15), 0)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(15) });
    expect(facts.kickersRecoveredLegally).toBe(false);
    expect(facts.violationSpots).toHaveLength(1);
  });

  it('B6.1.3 item 9: a ball at rest in the landing zone belongs to the receivers there', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', A35, opp(14)), ev.landed(4, opp(14)), ev.dead(7, 'loose_ball_at_rest', opp(9), null)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(9), touchback: false });
  });

  it('a fumble on the return recovered by the kicking team gives it the ball and a new series', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', A35, opp(5)), ev.poss(4, 1, opp(5), 'kick_catch'), ev.fumble(7, 1, opp(22)),
      ev.poss(8, 0, opp(24), 'fumble_recovery'), ev.dead(8.5, 'down_by_contact', opp(24), 0)]);
    expect(outcome).toMatchObject({ possessionAfter: 0, changeOfPossession: true, spotX: opp(24) });
  });

  it('B5.6.3: a return fumbled forward out of bounds goes back to the spot of the fumble', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', A35, opp(5)), ev.poss(4, 1, opp(5), 'kick_catch'), ev.fumble(7, 1, opp(30)), ev.dead(8, 'ball_out_of_bounds', opp(36), null, { y: 0 })]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(30) });
  });
});

describe('B6.2.1 declared onside kick (pro fixture)', () => {
  const onside = (events: TruthEvent[]) => run(PRO, [ev.kick('onside_kick', A35, own(47)), ...events]);

  it('kicking team recovers at 9 yards untouched: illegal touching, receivers ball at that spot', () => {
    const { outcome, facts } = onside([ev.landed(1, own(40)), ev.poss(2, 0, own(44), 'kick_recovery'), ev.dead(2, 'kick_recovered_by_kickers', own(44), 0)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, changeOfPossession: true, spotX: own(44) });
    expect(facts.kickersRecoveredLegally).toBe(false);
  });

  it('kicking team recovers at 11 yards: its ball, dead at the spot', () => {
    const { outcome, facts } = onside([ev.landed(1, own(40)), ev.poss(2, 0, own(46), 'kick_recovery'), ev.dead(2, 'kick_recovered_by_kickers', own(46), 0)]);
    expect(outcome).toMatchObject({ possessionAfter: 0, changeOfPossession: false, spotX: own(46) });
    expect(facts.kickersRecoveredLegally).toBe(true);
  });

  it('kick sails 30 yards untouched: receivers ball after 15 yards from the A35', () => {
    const { outcome } = onside([ev.landed(3, own(65)), ev.dead(3, 'onside_untouched_beyond_zone', own(65), null)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: own(20) });
    // The same ruling when the truth record only shows a catch beyond the zone.
    const caught = onside([ev.poss(3, 1, own(66), 'kick_catch'), ev.dead(3.2, 'down_by_contact', own(66), 1)]);
    expect(caught.outcome).toMatchObject({ possessionAfter: 1, spotX: own(20) });
  });

  it('a receiver touches it short of 10 yards, then the kicking team recovers: legal', () => {
    const { outcome, facts } = onside([ev.touchR(1, own(43)), ev.poss(2, 0, own(42), 'kick_recovery'), ev.dead(2, 'kick_recovered_by_kickers', own(42), 0)]);
    expect(outcome).toMatchObject({ possessionAfter: 0, spotX: own(42) });
    expect(facts).toMatchObject({ receiversTouched: true, kickersRecoveredLegally: true });
  });

  it('a kicking-team touch short of 10 yards, then a receiver recovers and is downed: receivers may take either spot', () => {
    const { outcome, choices } = onside([ev.touchK(1, own(43)), ev.poss(2, 1, own(41), 'kick_recovery'), ev.dead(2.5, 'down_by_contact', own(41), 1)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: own(41) });
    expect(choices.map((c) => c.outcome.spotX)).toEqual([own(41), own(43)]);
  });

  it('item 8: a ball at rest belongs to the receivers; item 7: a receiver who recovers may advance', () => {
    expect(onside([ev.landed(1, own(41)), ev.dead(4, 'loose_ball_at_rest', own(48), null)]).outcome).toMatchObject({ possessionAfter: 1, spotX: own(48) });
    const scored = onside([ev.poss(2, 1, own(47), 'kick_catch'), ev.dead(8, 'ball_across_goal_line_in_possession', 9.5, 1)]);
    expect(scored.outcome.score).toMatchObject({ type: 'touchdown', side: 1 });
  });

  it('item 12: an undeclared short kick is not an onside kick: dead short of the landing zone, at the spot', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', A35, own(47)), ev.landed(1, own(47)), ev.dead(1, 'kick_short_of_landing_zone', own(47), null)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: own(47) });
  });
});

describe('B13.6.1 kickoff under the traditional format (college fixture)', () => {
  it('a kickoff fair caught at the 8 is next snapped at the 25', () => {
    const { outcome, facts } = run(COLLEGE, [ev.kick('kickoff', A35, opp(8)), ev.signal(3, opp(8)), ev.poss(4, 1, opp(8), 'kick_catch'), ev.dead(4, 'fair_catch', opp(8), 1)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(25), touchback: false });
    expect(facts.fairCatchMade).toBe(true);
  });

  it('the same catch under the pro fixture stays at the spot of the catch (B6.4.1 edge case)', () => {
    const { outcome } = run(PRO, [ev.kick('kickoff', A35, opp(8)), ev.signal(3, opp(8)), ev.poss(4, 1, opp(8), 'kick_catch'), ev.dead(4, 'fair_catch', opp(8), 1)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(8) });
  });

  it('a fair catch beyond the 25 stays where it was caught', () => {
    const { outcome } = run(COLLEGE, [ev.kick('kickoff', A35, opp(31)), ev.signal(3, opp(31)), ev.poss(4, 1, opp(31), 'kick_catch'), ev.dead(4, 'fair_catch', opp(31), 1)]);
    expect(outcome.spotX).toBe(opp(31));
  });

  it('touchback at the 25 however the ball reached the end zone', () => {
    const bounced = run(COLLEGE, [ev.kick('kickoff', A35, opp(8)), ev.landed(4, opp(8)), ev.poss(6, 1, 112, 'kick_recovery'), ev.dead(6.5, 'kneel', 112, 1)]);
    const flew = run(COLLEGE, [ev.kick('kickoff', A35, 121), ev.dead(4.5, 'ball_out_of_bounds', 121, null)]);
    expect(bounced.outcome).toMatchObject({ touchback: true, spotX: opp(25) });
    expect(flew.outcome).toMatchObject({ touchback: true, spotX: opp(25) });
  });

  it('there is no landing zone: a kick that lands at the 24 stays live and is returned', () => {
    const { outcome } = run(COLLEGE, [ev.kick('kickoff', A35, opp(24)), ev.landed(4, opp(24)), ev.poss(5, 1, opp(22), 'kick_recovery'), ev.dead(8, 'down_by_contact', opp(33), 1)]);
    expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(33) });
  });

  it('the ball must travel 10 yards or be touched by the receivers before the kicking team may recover', () => {
    const early = run(COLLEGE, [ev.kick('kickoff', A35, own(43)), ev.landed(1, own(40)), ev.poss(2, 0, own(43), 'kick_recovery'), ev.dead(2, 'kick_recovered_by_kickers', own(43), 0)]);
    expect(early.outcome).toMatchObject({ possessionAfter: 1, spotX: own(43) });
    const legal = run(COLLEGE, [ev.kick('kickoff', A35, own(46)), ev.landed(1, own(40)), ev.poss(2, 0, own(46), 'kick_recovery'), ev.dead(2, 'kick_recovered_by_kickers', own(46), 0)]);
    expect(legal.outcome).toMatchObject({ possessionAfter: 0, spotX: own(46) });
    // No untouched-beyond-the-zone rule at this level: a long untouched kick is simply live.
    const long = run(COLLEGE, [ev.kick('onside_kick', A35, own(65)), ev.landed(3, own(65)), ev.poss(4, 0, own(67), 'kick_recovery'), ev.dead(4, 'kick_recovered_by_kickers', own(67), 0)]);
    expect(long.outcome).toMatchObject({ possessionAfter: 0, spotX: own(67) });
  });

  it('out of bounds untouched: 30 yards beyond the kicking line at the hash, or the out-of-bounds spot', () => {
    const { choices } = run(COLLEGE, [ev.kick('kickoff', A35, opp(20)), ev.dead(4, 'ball_out_of_bounds', opp(20), null, { y: GEOMETRY.widthYd })]);
    expect(choices.map((c) => [c.outcome.spotX, c.outcome.spotY])).toEqual([[own(65), GEOMETRY.hashNorthY], [opp(20), GEOMETRY.widthYd]]);
  });
});

describe('B6.3 punts and scrimmage kicks', () => {
  const LOS = own(30);
  const punt = (rules: RuleSet, events: TruthEvent[], o: RunOptions & { crossed?: boolean; blockedBy?: number } = {}) =>
    run(rules, [ev.snap(), ev.kick('punt', own(16), opp(20), { t: 2, crossed: o.crossed, blockedBy: o.blockedBy }), ...events], { playKind: 'scrimmage', ballX: LOS, ...o });

  for (const [name, rules] of BOTH) {
    describe(name, () => {
      it('B6.3.2: gunner bats the punt at the 8, ball rolls to the 3 and is downed: receivers ball at the 8 by choice', () => {
        const { outcome, choices, facts } = punt(rules, [ev.touchK(6, opp(8)), ev.poss(8, 0, opp(3), 'kick_recovery'), ev.dead(8, 'kick_recovered_by_kickers', opp(3), 0)]);
        expect(outcome).toMatchObject({ resultType: 'punt', possessionAfter: 1, changeOfPossession: true, spotX: opp(8) });
        expect(choices.map((c) => c.outcome.spotX)).toEqual([opp(8), opp(3)]);
        expect(choices.every((c) => c.labelKey === 'kick.result.first_touch_spot')).toBe(true);
        expect(facts.violationSpots).toHaveLength(2);
      });

      it('B6.3.2 on a crew error: a receivers touch nobody made (no player) counts as a touch, so the kickers recovery is their ball', () => {
        const phantom = { ...ev.touchR(7, opp(18)), playerId: null } as TruthEvent;
        const { outcome, facts } = punt(rules, [ev.landed(6, opp(20)), phantom, ev.poss(7, 0, opp(18), 'kick_recovery'), ev.dead(7, 'kick_recovered_by_kickers', opp(18), 0)]);
        expect(outcome).toMatchObject({ possessionAfter: 0, changeOfPossession: true, spotX: opp(18), score: null });
        expect(facts).toMatchObject({ receiversTouched: true, kickersRecoveredLegally: true });
      });

      it('B6.3.2 on a crew error: a downed punt seen as touched by the receivers first is the kickers ball where it was downed', () => {
        const phantom = { ...ev.touchR(6.5, opp(15)), playerId: null } as TruthEvent;
        const { outcome } = punt(rules, [ev.landed(6, opp(20)), phantom, ev.touchK(7, opp(12)), ev.poss(7.2, 0, opp(12), 'kick_recovery'), ev.dead(7.2, 'kick_recovered_by_kickers', opp(12), 0)]);
        expect(outcome).toMatchObject({ possessionAfter: 0, changeOfPossession: true, spotX: opp(12) });
        // Without the touch the same downing is the receivers ball there.
        const plain = punt(rules, [ev.landed(6, opp(20)), ev.touchK(7, opp(12)), ev.dead(7.2, 'kick_recovered_by_kickers', opp(12), 0)]);
        expect(plain.outcome).toMatchObject({ possessionAfter: 1, spotX: opp(12) });
      });

      it('B6.3.2: returner muffs at the 20, kicking team recovers at the 18: its ball, first and 10 at the 18, no advance', () => {
        const { outcome, facts } = punt(rules, [ev.touchR(6, opp(20)), ev.poss(7, 0, opp(18), 'kick_recovery'), ev.dead(7, 'kick_recovered_by_kickers', opp(18), 0)]);
        expect(outcome).toMatchObject({ possessionAfter: 0, changeOfPossession: true, spotX: opp(18), score: null });
        expect(facts).toMatchObject({ receiversTouched: true, kickersRecoveredLegally: true, receiversPossessed: false });
      });

      it('B6.3.2: punt blocked, kicker recovers behind the line and is tackled: same series, so a fourth down short is a turnover on downs', () => {
        const { outcome } = punt(rules, [ev.touchR(2.1, own(18)), ev.poss(3, 0, own(22), 'kick_recovery', 1), ev.dead(4, 'down_by_contact', own(24), 0, { carrierId: 1 })],
          { crossed: false, blockedBy: 22 });
        expect(outcome).toMatchObject({ possessionAfter: 0, changeOfPossession: false, spotX: own(24), yardsGained: -6, runnerDownInBounds: true });
      });

      it('B6.3.2 edge case: first touch, then the returner muffs and the kicking team recovers: receivers may still take the first-touch spot', () => {
        const { outcome, choices } = punt(rules, [ev.touchK(6, opp(22)), ev.touchR(6.5, opp(20)), ev.poss(7, 0, opp(18), 'kick_recovery'), ev.dead(7, 'kick_recovered_by_kickers', opp(18), 0)]);
        expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(22) });
        expect(choices[1]!.outcome).toMatchObject({ possessionAfter: 0, spotX: opp(18) });
      });

      it('B6.3.2 item 3: once the receivers possess the ball first touching is ignored, and a later fumble is a real turnover', () => {
        const { outcome, choices } = punt(rules, [ev.touchK(6, opp(22)), ev.poss(7, 1, opp(20), 'kick_recovery'), ev.fumble(8, 1, opp(24)),
          ev.poss(9, 0, opp(25), 'fumble_recovery'), ev.dead(9.5, 'down_by_contact', opp(25), 0)]);
        expect(outcome).toMatchObject({ possessionAfter: 0, changeOfPossession: true, spotX: opp(25) });
        expect(choices).toHaveLength(1);
      });

      it('B6.3.3: punt bounces at the 3 and into the end zone untouched: receivers ball at the 20', () => {
        const { outcome } = punt(rules, [ev.landed(6, opp(3)), ev.landed(6.8, 111), ev.dead(6.8, 'ball_dead_in_end_zone', 111, null)]);
        expect(outcome).toMatchObject({ touchback: true, possessionAfter: 1, spotX: opp(20), spotY: CENTRE_Y });
      });

      it('B6.3.3: coverage player with a foot on the goal line catches the bouncing ball: touchback', () => {
        const { outcome } = punt(rules, [ev.landed(6, opp(4)), ev.poss(6.6, 0, 110, 'kick_recovery'), ev.dead(6.6, 'ball_dead_in_end_zone', 110, 0)]);
        expect(outcome).toMatchObject({ touchback: true, possessionAfter: 1, spotX: opp(20) });
      });

      it('B6.3.3 item 5: a first-touch spot outside the 20 may be taken instead of the touchback', () => {
        const { outcome, choices } = punt(rules, [ev.touchK(6, opp(30)), ev.landed(7, 112), ev.dead(7, 'ball_dead_in_end_zone', 112, null)]);
        expect(outcome).toMatchObject({ touchback: false, spotX: opp(30) });
        expect(choices[1]!.outcome).toMatchObject({ touchback: true, spotX: opp(20) });
      });

      it('B6.3.3 item 4: a first touch over the goal line is spotted at the 1, and inside the 20 the touchback is better', () => {
        const { outcome, facts } = punt(rules, [ev.touchK(6, 110.5), ev.landed(6.4, 113), ev.dead(6.4, 'ball_dead_in_end_zone', 113, null)]);
        expect(outcome).toMatchObject({ touchback: true, spotX: opp(20) });
        expect(facts.violationSpots[0]!.x).toBe(opp(1));
      });

      it('B6.3.3 item 8: out of bounds between the goal lines, or lying untouched: receivers ball at the dead-ball spot', () => {
        expect(punt(rules, [ev.dead(6, 'ball_out_of_bounds', opp(12), null, { y: 0 })]).outcome).toMatchObject({ possessionAfter: 1, spotX: opp(12), endedOutOfBounds: true });
        expect(punt(rules, [ev.landed(6, opp(15)), ev.dead(9, 'loose_ball_at_rest', opp(9), null)]).outcome).toMatchObject({ possessionAfter: 1, spotX: opp(9) });
      });

      it('B6.3.3 item 7: kicking team recovers in the end zone after the receivers touched the ball: touchdown', () => {
        const { outcome } = punt(rules, [ev.touchR(6, opp(4)), ev.poss(7, 0, 112, 'kick_recovery'), ev.dead(7, 'ball_across_goal_line_in_possession', 112, 0)]);
        expect(outcome.score).toEqual({ type: 'touchdown', side: 0, points: 6, scorerId: 2 });
      });

      it('B6.3.3 item 10: a blocked punt dead behind the kicking team goal line is a safety', () => {
        const { outcome } = punt(rules, [ev.touchR(2.1, own(15)), ev.dead(4, 'ball_out_of_bounds', 8, null)], { crossed: false, blockedBy: 22 });
        expect(outcome.score).toEqual({ type: 'safety', side: 1, points: 2, scorerId: null });
      });

      it('B7.7.1: a moving punt muffed at the 3 that rolls in and is covered is a touchback; a ball at rest muffed in is a safety', () => {
        const events = [ev.touchR(6, opp(3)), ev.poss(7, 1, 111, 'kick_recovery'), ev.dead(7.2, 'touched_on_ground', 111, 1)];
        expect(punt(rules, events).outcome).toMatchObject({ touchback: true, possessionAfter: 1, spotX: opp(20) });
        expect(punt(rules, events, { impetus: 1 }).outcome.score).toMatchObject({ type: 'safety', side: 0 });
      });

      it('B6.4.1: signal, muff, ball caught by the signaler before it hits the ground: fair catch', () => {
        const { outcome, facts } = punt(rules, [ev.signal(5, opp(15)), ev.touchR(6, opp(15)), ev.poss(6.3, 1, opp(15), 'kick_catch'), ev.dead(6.3, 'fair_catch', opp(15), 1)]);
        expect(outcome).toMatchObject({ possessionAfter: 1, changeOfPossession: true, spotX: opp(15) });
        expect(facts.fairCatchMade).toBe(true);
      });

      it('B6.4.1: signal, ball hits the ground, signaler picks it up: dead there, not a fair catch', () => {
        const { outcome, facts } = punt(rules, [ev.signal(5, opp(15)), ev.landed(6, opp(15)), ev.poss(6.5, 1, opp(14), 'kick_recovery'), ev.dead(6.5, 'fair_catch', opp(14), 1)]);
        expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(14) });
        expect(facts.fairCatchMade).toBe(false);
      });

      it('B6.4.1 items 3 and 4: an invalid signal, or a catch by a teammate who did not signal, is dead but not a fair catch', () => {
        const invalid = punt(rules, [ev.signal(5, opp(15), false), ev.poss(6, 1, opp(15), 'kick_catch'), ev.dead(6, 'fair_catch', opp(15), 1)]);
        const mate = punt(rules, [ev.signal(5, opp(15)), ev.poss(6, 1, opp(15), 'kick_catch', 22), ev.dead(6, 'fair_catch', opp(15), 1, { carrierId: 22 })]);
        expect(invalid.facts.fairCatchMade).toBe(false);
        expect(mate.facts.fairCatchMade).toBe(false);
        expect(mate.outcome.spotX).toBe(opp(15));
      });

      it('a punt return ends where the runner is down, or in a touchdown', () => {
        expect(punt(rules, [ev.poss(6, 1, opp(20), 'kick_catch'), ev.dead(9, 'runner_out_of_bounds', opp(31), 1, { y: 0 })]).outcome)
          .toMatchObject({ possessionAfter: 1, spotX: opp(31), endedOutOfBounds: true, yardsGained: 0 });
        expect(punt(rules, [ev.poss(6, 1, opp(20), 'kick_catch'), ev.dead(16, 'ball_across_goal_line_in_possession', 9, 1)]).outcome.score).toMatchObject({ type: 'touchdown', side: 1, points: 6 });
      });
    });
  }
});

describe('B6.5 field goals, B13.6.2 missed field goal spot, B7.3.2 tries by kick', () => {
  const fg = (rules: RuleSet, losYd: number, holdYd: number, events: TruthEvent[], o: RunOptions & { crossed?: boolean; blockedBy?: number; kind?: 'field_goal' | 'try_kick' | 'fair_catch_kick' } = {}) =>
    run(rules, [ev.snap(), ev.kick(o.kind ?? 'field_goal', opp(holdYd), 120, { t: 1.3, crossed: o.crossed, blockedBy: o.blockedBy }), ...events], { playKind: 'scrimmage', ballX: opp(losYd), ...o });
  const wide = [ev.dead(4, 'kick_failed', 120, null)];
  const through = [ev.dead(4, 'kick_through_uprights', 120, null)];

  for (const [name, rules] of BOTH) {
    it(`${name}: a kick through the goal scores the field goal points for the kicking team (B6.5.1)`, () => {
      const { outcome, facts } = fg(rules, 20, 28, through);
      expect(outcome).toMatchObject({ resultType: 'field_goal_good', possessionAfter: 0, changeOfPossession: false });
      expect(outcome.score).toEqual({ type: 'field_goal', side: 0, points: 3, scorerId: 1 });
      expect(facts.good).toBe(true);
    });

    it(`${name}: a kick that touches the ground before it passes through is no good (B6.5.1 item 2)`, () => {
      const { outcome } = fg(rules, 20, 28, [ev.landed(3, opp(2)), ev.dead(4, 'kick_through_uprights', 120, null)]);
      expect(outcome).toMatchObject({ resultType: 'field_goal_missed', score: null, possessionAfter: 1 });
    });

    it(`${name}: a miss from inside the 20 comes out to the 20`, () => {
      expect(fg(rules, 10, 18, wide).outcome).toMatchObject({ resultType: 'field_goal_missed', possessionAfter: 1, changeOfPossession: true, spotX: opp(20), touchback: false });
    });

    it(`${name}: a blocked kick behind the line is a live ball either team may advance (B6.5.2 item 3)`, () => {
      const defense = fg(rules, 30, 38, [ev.touchR(1.5, opp(37)), ev.poss(2.5, 1, opp(40), 'kick_recovery'), ev.dead(9, 'ball_across_goal_line_in_possession', 9, 1)], { crossed: false, blockedBy: 22 });
      expect(defense.outcome.score).toMatchObject({ type: 'touchdown', side: 1 });
      const offense = fg(rules, 30, 38, [ev.touchR(1.5, opp(37)), ev.poss(2.5, 0, opp(41), 'kick_recovery'), ev.dead(4, 'down_by_contact', opp(36), 0)], { crossed: false, blockedBy: 22 });
      expect(offense.outcome).toMatchObject({ resultType: 'field_goal_missed', possessionAfter: 0, changeOfPossession: false, spotX: opp(36) });
    });

    it(`${name}: receivers touch the miss beyond the line and the kicking team recovers: its ball there (B6.5.2 item 4)`, () => {
      const { outcome } = fg(rules, 30, 38, [ev.touchR(3.5, opp(4)), ev.poss(4.5, 0, opp(5), 'kick_recovery'), ev.dead(4.5, 'kick_recovered_by_kickers', opp(5), 0)]);
      expect(outcome).toMatchObject({ possessionAfter: 0, changeOfPossession: true, spotX: opp(5) });
    });

    it(`${name}: receivers may return a missed kick they field in the end zone (B6.5.2 item 6)`, () => {
      const { outcome } = fg(rules, 40, 48, [ev.poss(4, 1, 113, 'kick_catch'), ev.dead(9, 'down_by_contact', opp(30), 1)]);
      expect(outcome).toMatchObject({ possessionAfter: 1, spotX: opp(30), touchback: false });
    });

    it(`${name}: a try kick scores the try points; a miss changes nothing and the ball is next kicked off (B7.3.2)`, () => {
      const made = fg(rules, 15, 23, through, { kind: 'try_kick', playKind: 'try' });
      expect(made.outcome).toMatchObject({ resultType: 'try_good', possessionAfter: 0, changeOfPossession: false });
      expect(made.outcome.score).toEqual({ type: 'try_kick', side: 0, points: 1, scorerId: 1 });
      const miss = fg(rules, 15, 23, wide, { kind: 'try_kick', playKind: 'try' });
      expect(miss.outcome).toMatchObject({ resultType: 'try_failed', score: null, possessionAfter: 0, changeOfPossession: false, touchback: false });
    });

    it(`${name}: a blocked try kick returned to the other end zone scores for the defense (B7.3.2 item 2)`, () => {
      const { outcome } = fg(rules, 15, 23, [ev.touchR(1.5, opp(22)), ev.poss(2.5, 1, opp(25), 'kick_recovery'), ev.dead(12, 'ball_across_goal_line_in_possession', 9, 1)],
        { kind: 'try_kick', playKind: 'try', crossed: false, blockedBy: 22 });
      expect(outcome.resultType).toBe('try_failed');
      expect(outcome.score).toEqual({ type: 'defensive_try', side: 1, points: 2, scorerId: 21 });
      expect(outcome.possessionAfter).toBe(0);
    });

    it(`${name}: a blocked try kick picked up behind the line and run in scores the two-point value (B7.3.2 edge case)`, () => {
      const { outcome } = fg(rules, 15, 23, [ev.touchR(1.5, opp(22)), ev.poss(2.5, 0, opp(24), 'kick_recovery', 1), ev.dead(6, 'ball_across_goal_line_in_possession', 111, 0, { carrierId: 1 })],
        { kind: 'try_kick', playKind: 'try', crossed: false, blockedBy: 22 });
      expect(outcome.resultType).toBe('try_good');
      expect(outcome.score).toEqual({ type: 'try_two', side: 0, points: 2, scorerId: 1 });
    });

    it(`${name}: on a try, a blocked kick recovered by the defense and downed in the field is no score (B7.3.2 acceptance)`, () => {
      const { outcome } = fg(rules, 15, 23, [ev.touchR(1.5, opp(22)), ev.poss(2.5, 1, opp(25), 'kick_recovery'), ev.dead(4, 'down_by_contact', opp(30), 1)],
        { kind: 'try_kick', playKind: 'try', crossed: false, blockedBy: 22 });
      expect(outcome).toMatchObject({ resultType: 'try_failed', score: null, possessionAfter: 0, changeOfPossession: false });
    });

    it(`${name}: a good fair catch kick scores the field goal points; a miss follows the missed field goal rule (B6.4.3)`, () => {
      const made = run(rules, [ev.kick('fair_catch_kick', opp(48), 120), ev.dead(4, 'kick_through_uprights', 120, null)], { playKind: 'fair_catch_kick', ballX: opp(48) });
      expect(made.outcome.resultType).toBe('fair_catch_kick');
      expect(made.outcome.score).toMatchObject({ type: 'field_goal', side: 0, points: 3 });
      const miss = run(rules, [ev.kick('fair_catch_kick', opp(48), 115), ev.dead(4, 'kick_failed', 115, null)], { playKind: 'fair_catch_kick', ballX: opp(48) });
      expect(miss.outcome).toMatchObject({ resultType: 'fair_catch_kick', score: null, possessionAfter: 1, spotX: opp(48) });
    });
  }

  it('B6.5.2 (pro fixture): line at the 10, held at the 18, miss: the 20. Line at the 35, held at the 43, miss: the 43', () => {
    expect(fg(PRO, 10, 18, wide).outcome.spotX).toBe(opp(20));
    expect(fg(PRO, 35, 43, wide).outcome).toMatchObject({ possessionAfter: 1, spotX: opp(43) });
  });

  it('B13.6.2: a 45-yard miss snapped from the 28: the defense takes over at its 28 (college fixture) and at its 35 (pro fixture)', () => {
    expect(fg(COLLEGE, 28, 35, wide).outcome).toMatchObject({ possessionAfter: 1, spotX: opp(28) });
    expect(fg(PRO, 28, 35, wide).outcome).toMatchObject({ possessionAfter: 1, spotX: opp(35) });
  });

  it('B6.5.2 item 2: an untouched miss is dead when it touches the ground in the end zone, and the miss spot applies, not a touchback', () => {
    const { outcome } = fg(PRO, 35, 43, [ev.landed(4, 114), ev.dead(4, 'ball_dead_in_end_zone', 114, null)]);
    expect(outcome).toMatchObject({ touchback: false, spotX: opp(43) });
  });

  it('B13.7.1 item 4: from the second overtime period a good try kick scores nothing (college fixture); it scores in the first', () => {
    const o = { kind: 'try_kick' as const, playKind: 'try' as const };
    expect(fg(COLLEGE, 3, 10, through, { ...o, otPeriod: 1 }).outcome.score).toMatchObject({ type: 'try_kick', points: 1 });
    const second = fg(COLLEGE, 3, 10, through, { ...o, otPeriod: 2 });
    expect(second.outcome.score).toMatchObject({ type: 'try_kick', points: 0 });
    expect(second.facts.good).toBe(true);
    // The pro fixture switches the rule off.
    expect(fg(PRO, 15, 23, through, { ...o, otPeriod: 2 }).outcome.score).toMatchObject({ points: 1 });
  });
});
