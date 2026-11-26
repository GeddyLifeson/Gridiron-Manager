// Q1.1.1 rule cases for the coin toss (B1.1.2, B10.1.1, B13.7.1), free kick spots (B6.1.1, B6.1.2,
// B6.2.1), the try spot (B7.3.1, B13.6.3), what follows a score (B7.8.1) and the fair catch kick
// (B6.4.3), on FIXTURE rule sets (test/kick/fixture.ts).
import { describe, expect, it } from 'vitest';
import { ParamFile, RestartSetup, RuleKeyManifest, type ScoreEvent } from '@gm/schema';
import { seedFromNumber, streamSource } from '@gm/engine-core';
import { createRestartRules, RULE_KEYS, PARAMS, TOSS } from '../../src/restart/index.ts';
import { BOTH, CENTRE_Y, COLLEGE, COLLEGE_VALUES, GEOMETRY, PRO, PRO_VALUES, makeCtx, makeState, opp, own } from '../kick/fixture.ts';

const restart = createRestartRules();
const score = (type: ScoreEvent['type'], side: 0 | 1, points = 0): ScoreEvent => ({ type, side, points, scorerId: null });

describe('restart module contract', () => {
  it('exports a valid rule-key manifest and parameter file, and both fixtures define every key', () => {
    const keys = RuleKeyManifest.parse(RULE_KEYS);
    ParamFile.parse(PARAMS);
    expect(new Set(keys.map((k) => k.key)).size).toBe(keys.length);
    for (const k of keys) for (const values of [PRO_VALUES, COLLEGE_VALUES]) {
      expect(values[k.key], k.key).toBeDefined();
      if (k.type === 'option') expect(k.options).toContain(values[k.key]);
    }
  });
});

describe('B1.1.2 coin toss and choices', () => {
  it('acceptance 1: over 10,000 seeded tosses the visiting team wins between 49% and 51%', () => {
    const streams = streamSource(seedFromNumber(20261126));
    let visitor = 0;
    for (let game = 1; game <= 10_000; game++) if (restart.tossWinner(streams, game, 0) === 1) visitor++;
    expect(visitor).toBeGreaterThanOrEqual(4900);
    expect(visitor).toBeLessThanOrEqual(5100);
    // The draw is a pure function of the key (J13.1.1).
    expect(restart.tossWinner(streams, 77, 0)).toBe(restart.tossWinner(streams, 77, 0));
  });

  it('rule 3: the winner may defer, receive, kick or pick a goal; the loser gets the other privilege', () => {
    expect(restart.tossOptions('opening', makeCtx({ rules: PRO }))).toEqual(['defer', 'receive', 'kick', 'defend_west', 'defend_east']);
    expect(restart.remainingTossOptions('opening', TOSS.receive, makeCtx({ rules: PRO }))).toEqual(['defend_west', 'defend_east']);
    expect(restart.remainingTossOptions('opening', TOSS.kick, makeCtx({ rules: PRO }))).toEqual(['defend_west', 'defend_east']);
    expect(restart.remainingTossOptions('opening', TOSS.defendEast, makeCtx({ rules: PRO }))).toEqual(['receive', 'kick']);
    expect(restart.remainingTossOptions('opening', TOSS.defer, makeCtx({ rules: PRO }))).toEqual(['receive', 'kick', 'defend_west', 'defend_east']);
  });

  it('acceptance 2: for each first-half choice, the second-half first choice goes to the right captain', () => {
    // The winner deferred: he chooses first in the second half. Any other choice: the loser does.
    expect(restart.secondHalfFirstChoice(1, TOSS.defer)).toBe(1);
    for (const c of [TOSS.receive, TOSS.kick, TOSS.defendWest, TOSS.defendEast]) expect(restart.secondHalfFirstChoice(1, c)).toBe(0);
  });

  it('acceptance 3: choosing "kick" rather than "defer" leaves the opponent first choice in the second half, so a team can kick off twice', () => {
    const src = makeCtx({ rules: PRO });
    const first = restart.resolveToss('opening', 1, TOSS.kick, TOSS.defendWest, src);
    expect(first.receiving).toBe(0);
    const chooser = restart.secondHalfFirstChoice(1, TOSS.kick);
    expect(chooser).toBe(0);
    const second = restart.resolveToss('opening', chooser, TOSS.receive, TOSS.defendEast, src);
    expect(second.receiving).toBe(0);
  });

  it('choices resolve to who receives and which way each team attacks', () => {
    const src = makeCtx({ rules: PRO });
    expect(restart.resolveToss('opening', 0, TOSS.receive, TOSS.defendEast, src)).toEqual({ receiving: 0, attackDir: [1, -1] });
    expect(restart.resolveToss('opening', 0, TOSS.defendEast, TOSS.receive, src)).toEqual({ receiving: 1, attackDir: [-1, 1] });
    expect(restart.resolveToss('opening', 1, TOSS.defendWest, TOSS.kick, src)).toEqual({ receiving: 1, attackDir: [-1, 1] });
    // A captain who gives no legal answer gets the first legal option; a first choice is final (rule 5).
    expect(restart.resolveToss('opening', 0, TOSS.receive, 'nothing', src)).toEqual({ receiving: 0, attackDir: [-1, 1] });
  });

  it('B10.1.1 and B13.7.1: the overtime menu comes from the rule set', () => {
    // Timed period: the pregame menu (B10.1.1 acceptance: "the winner\'s menu matches the pregame menu").
    expect(restart.tossOptions('overtime', makeCtx({ rules: PRO }))).toEqual(restart.tossOptions('opening', makeCtx({ rules: PRO })));
    // Alternating series: offense, defense or an end; he cannot defer.
    const src = makeCtx({ rules: COLLEGE });
    expect(restart.tossOptions('overtime', src)).toEqual(['offense', 'defense', 'defend_west', 'defend_east']);
    expect(restart.remainingTossOptions('overtime', TOSS.defense, src)).toEqual(['defend_west', 'defend_east']);
    expect(restart.resolveToss('overtime', 1, TOSS.defense, TOSS.defendWest, src)).toEqual({ receiving: 0, attackDir: [1, -1] });
  });
});

describe('B6.1.1 free kick spots', () => {
  for (const [name, rules] of BOTH) {
    it(`${name}: a kickoff with no penalty is from the A35; a safety kick is from the A20`, () => {
      const ctx = makeCtx({ rules });
      const kickoff = RestartSetup.parse(restart.kickoffSetup(0, 'kickoff', ctx));
      expect(kickoff).toEqual({ playKind: 'kickoff', side: 0, ballX: own(35), ballY: CENTRE_Y, playClockTenths: 250 });
      expect(restart.kickoffSetup(0, 'safety_kick', ctx)).toMatchObject({ playKind: 'safety_kick', ballX: own(20) });
      // The visitor attacks west: its 35 is 35 yards from the east goal line.
      expect(restart.kickoffSetup(1, 'kickoff', ctx).ballX).toBe(opp(35));
    });

    it(`${name}: a 15-yard penalty carried to the kickoff moves the kick to the 50, or back to the 20 (B8.5.7 edge case)`, () => {
      const forward = makeCtx({ rules, state: { carriedPenalty: { against: 1, yards: 15, to: 'kickoff' } } });
      expect(restart.kickoffSetup(0, 'kickoff', forward).ballX).toBe(own(50));
      const back = makeCtx({ rules, state: { carriedPenalty: { against: 0, yards: 15, to: 'kickoff' } } });
      expect(restart.kickoffSetup(0, 'kickoff', back).ballX).toBe(own(20));
      // A penalty carried to the try does not move the kickoff.
      const other = makeCtx({ rules, state: { carriedPenalty: { against: 1, yards: 15, to: 'try' } } });
      expect(restart.kickoffSetup(0, 'kickoff', other).ballX).toBe(own(35));
    });
  }

  it('B6.1.2 lines and zones for a kickoff under the dynamic format (pro fixture)', () => {
    const ctx = makeCtx({ rules: PRO });
    expect(restart.freeKickLines(0, own(35), false, ctx)).toEqual({ kickLineX: own(35), kickingTeamLineX: opp(40), receivingLineX: opp(35), setupZoneBackX: opp(30), landingZoneFrontX: opp(20) });
    // After a penalty only the kicker's line moves (B6.1.2 edge case).
    expect(restart.freeKickLines(0, own(50), false, ctx)).toMatchObject({ kickLineX: own(50), kickingTeamLineX: opp(40), receivingLineX: opp(35) });
    expect(restart.freeKickLines(1, opp(35), false, ctx)).toMatchObject({ kickingTeamLineX: own(40), receivingLineX: own(35), landingZoneFrontX: own(20) });
  });

  it('B6.2.1 items 2 and 4: a declared onside kick has the receiving line 10 yards off and a 15-yard setup zone (pro fixture)', () => {
    expect(restart.freeKickLines(0, own(35), true, makeCtx({ rules: PRO }))).toEqual({ kickLineX: own(35), kickingTeamLineX: own(35), receivingLineX: own(45), setupZoneBackX: own(60), landingZoneFrontX: null });
  });

  it('B13.6.1: the traditional kickoff has the receiving line 10 yards beyond the kick and no landing zone (college fixture)', () => {
    expect(restart.freeKickLines(0, own(35), false, makeCtx({ rules: COLLEGE }))).toEqual({ kickLineX: own(35), kickingTeamLineX: own(35), receivingLineX: own(45), setupZoneBackX: own(45), landingZoneFrontX: null });
  });
});

describe('B7.3.1 and B13.6.3 try spot', () => {
  it('pro fixture: kick try from the 15, two-point try from the 2', () => {
    const ctx = makeCtx({ rules: PRO });
    expect(RestartSetup.parse(restart.trySetup(0, 'kick', ctx))).toEqual({ playKind: 'try', side: 0, ballX: opp(15), ballY: CENTRE_Y, playClockTenths: 400 });
    expect(restart.trySetup(0, 'two_point', ctx).ballX).toBe(opp(2));
    expect(restart.trySetup(1, 'two_point', ctx).ballX).toBe(own(2));
  });

  it('college fixture: tries snap at the 3 for both kinds', () => {
    const ctx = makeCtx({ rules: COLLEGE });
    expect(restart.trySetup(0, 'kick', ctx).ballX).toBe(opp(3));
    expect(restart.trySetup(0, 'two_point', ctx).ballX).toBe(opp(3));
  });

  it('B8.5.7 acceptance: 15 yards carried to the try puts a two-point try at the 1 (half the distance), a kick try at the 7.5', () => {
    const ctx = makeCtx({ rules: PRO, state: { carriedPenalty: { against: 1, yards: 15, to: 'try' } } });
    expect(restart.trySetup(0, 'two_point', ctx).ballX).toBe(opp(1));
    expect(restart.trySetup(0, 'kick', ctx).ballX).toBe(opp(7.5));
    // Against the scoring team the try moves back.
    const back = makeCtx({ rules: PRO, state: { carriedPenalty: { against: 0, yards: 15, to: 'try' } } });
    expect(restart.trySetup(0, 'two_point', back).ballX).toBe(opp(17));
  });
});

describe('B7.8.1 what follows each score', () => {
  for (const [name, rules] of BOTH) {
    it(`${name}: touchdown, then a try by the scoring team`, () => {
      const ctx = makeCtx({ rules, playKind: 'scrimmage' });
      expect(restart.afterScore(score('touchdown', 1, 6), ctx.before, ctx)).toMatchObject({ playKind: 'try', side: 1, ballX: restart.trySetup(1, 'kick', ctx).ballX });
    });

    it(`${name}: field goal, then a kickoff by the scoring team (the team scored upon receives)`, () => {
      const ctx = makeCtx({ rules, playKind: 'scrimmage' });
      expect(restart.afterScore(score('field_goal', 0, 3), ctx.before, ctx)).toMatchObject({ playKind: 'kickoff', side: 0, ballX: own(35) });
    });

    it(`${name}: safety, then a safety kick from the 20 by the team scored upon`, () => {
      const ctx = makeCtx({ rules, playKind: 'scrimmage' });
      expect(restart.afterScore(score('safety', 1, 2), ctx.before, ctx)).toMatchObject({ playKind: 'safety_kick', side: 0, ballX: own(20) });
    });

    it(`${name}: acceptance: after a defensive two-point return on a try, the team that was on defense during the try still receives`, () => {
      const ctx = makeCtx({ rules, playKind: 'try', offense: 0, ballX: opp(2) });
      for (const s of [score('try_kick', 0, 1), score('try_two', 0, 2), score('defensive_try', 1, 2), score('try_safety', 1, 1), score('try_safety', 0, 1)]) {
        expect(restart.afterScore(s, ctx.before, ctx)).toMatchObject({ playKind: 'kickoff', side: 0, ballX: own(35) });
      }
    });

    it(`${name}: a penalty carried to the kickoff is applied from the state after the score (J11.7.1 acceptance)`, () => {
      const ctx = makeCtx({ rules, playKind: 'scrimmage' });
      const after = makeState({ ...ctx.before, carriedPenalty: { against: 1, yards: 15, to: 'kickoff' } });
      expect(restart.afterScore(score('field_goal', 0, 3), after, ctx).ballX).toBe(own(50));
    });
  }
});

describe('B6.4.3 fair catch kick', () => {
  for (const [name, rules] of BOTH) {
    it(`${name}: the kick is from the spot of the catch, moved to the nearest inbounds line from a side zone`, () => {
      const ctx = makeCtx({ rules });
      expect(RestartSetup.parse(restart.fairCatchKickSetup(1, own(48), CENTRE_Y, ctx))).toEqual({ playKind: 'fair_catch_kick', side: 1, ballX: own(48), ballY: CENTRE_Y, playClockTenths: 250 });
      expect(restart.fairCatchKickSetup(1, own(48), 3, ctx)!.ballY).toBe(GEOMETRY.hashSouthY);
      expect(restart.fairCatchKickSetup(1, own(48), 50, ctx)!.ballY).toBe(GEOMETRY.hashNorthY);
    });
  }
});
