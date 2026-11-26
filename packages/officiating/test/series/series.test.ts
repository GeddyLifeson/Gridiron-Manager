// Q1.1.1 rule cases for B3.1, B3.3.3, B3.4 and J11.3.2, and the Q1.2.2 invariants on down and distance.
// Every rule value comes from a fixture rule set (see ../scrimmage/fixtures.ts): fixture values, not facts.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PlayOutcome, RuleKeyManifest, ParamFile, SeriesState, playTruthProblems } from '@gm/schema';
import { seriesRules, downVerdict, mirrorSpot, RULE_KEYS, PARAMS } from '../../src/series/index.ts';
import { scrimmageRuling } from '../../src/scrimmage/index.ts';
import { context, enforcement, ev, fixtureRules, FIXTURE_KEYS, IDS, outcomeAt, truthOf, xOn } from '../scrimmage/fixtures.ts';

const B = fixtureRules('fixture_b');

describe('series module contract', () => {
  it('declares a valid rule-key manifest and parameter file, and reads only declared keys', () => {
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    for (const k of RULE_KEYS) expect(FIXTURE_KEYS).toContain(k.key);
  });
});

describe('B3.1.1 down, series and line to gain', () => {
  it('a series starting at the opponent 7 has the goal line as line to gain', () => {
    const ctx = context({ ballOn: 50 });
    const s = seriesRules.newSeries(0, xOn(93), 26, ctx);
    expect(s).toMatchObject({ down: 1, goalToGo: true, lineToGainX: 110, possession: 0 });
    expect(s.distanceYd).toBeCloseTo(7, 9);
  });
  it('a series starting exactly the yards to gain from the goal line is goal to go', () => {
    expect(seriesRules.newSeries(0, xOn(90), 26, context())).toMatchObject({ goalToGo: true, lineToGainX: 110 });
    expect(seriesRules.newSeries(0, xOn(89.99), 26, context())).toMatchObject({ goalToGo: false });
  });
  it('a 10-yard offensive penalty on first and 10 gives first and 20 with the line to gain unchanged', () => {
    const ctx = context({ ballOn: 30, down: 1 });
    const o = outcomeAt(ctx, 20, { noPlay: true, resultType: 'no_play', enforcement: enforcement({ yardsWalked: -10, replayDown: true }) });
    const s = seriesRules.next(o, ctx);
    expect(s).toMatchObject({ down: 1, lineToGainX: xOn(40), firstDownAwarded: false });
    expect(s.distanceYd).toBeCloseTo(20, 9);
  });
  it('reads the number of downs and the yards to gain from the rule set', () => {
    const ctx = context({ rules: B, ballOn: 30, down: 3 });
    expect(ctx.situation.distanceYd).toBe(12);
    expect(seriesRules.next(outcomeAt(ctx, 35), ctx)).toMatchObject({ possession: 1, turnoverOnDowns: true, down: 1 });
  });
  it('works the same for a team attacking west', () => {
    const ctx = context({ attackDir: -1, ballOn: 30, down: 2, toGo: 4 });
    expect(seriesRules.next(outcomeAt(ctx, 33), ctx)).toMatchObject({ down: 3, lineToGainX: xOn(34, -1) });
    expect(seriesRules.next(outcomeAt(ctx, 34), ctx)).toMatchObject({ down: 1, firstDownAwarded: true, lineToGainX: xOn(44, -1) });
  });
});

describe('B3.3.3 the inbounds spot and the hash', () => {
  it('a run ending 3 yd from the south sideline at the 40 is next snapped on the south hash at the 40', () => {
    const ctx = context({ ballOn: 35, down: 1 });
    const s = seriesRules.next(outcomeAt(ctx, 40, { spotY: 3 }), ctx);
    expect(s.ballY).toBeCloseTo(ctx.geometry.hashSouthY, 9);
    expect(s.ballX).toBe(xOn(40));
  });
  it('a ball dead between the inbounds lines stays at that lateral point', () => {
    const ctx = context();
    expect(seriesRules.next(outcomeAt(ctx, 28, { spotY: 27.5 }), ctx).ballY).toBe(27.5);
  });
  it('an incompletion after a snap from the north hash snaps again from the north hash', () => {
    const base = context();
    const ctx = context({ ballY: base.geometry.hashNorthY, down: 2 });
    const truth = truthOf(ctx, [ev.snap(), ev.pass(2, xOn(18), true), ev.catchPoint(3.5, xOn(40), 'drop'), ev.dead(3.5, 'incomplete_pass', xOn(40), null, null, 5)]);
    expect(playTruthProblems(truth)).toEqual([]);
    const s = seriesRules.next(scrimmageRuling.rule(truth, ctx), ctx);
    expect(s).toMatchObject({ down: 3, ballX: xOn(25), ballY: base.geometry.hashNorthY });
  });
  it('uses the hash of the rule set in force', () => {
    const ctx = context({ rules: B });
    expect(seriesRules.next(outcomeAt(ctx, 28, { spotY: 3 }), ctx).ballY).toBeCloseTo(20, 9);
  });
});

describe('B3.4.1 first down for the offense', () => {
  it('(a) ball dead at or beyond the line to gain: the plane is reached by exact comparison (J11.3.2)', () => {
    const ctx = context({ ballOn: 30, down: 3, toGo: 4 });
    expect(seriesRules.next(outcomeAt(ctx, 34), ctx)).toMatchObject({ down: 1, firstDownAwarded: true, seriesStartX: xOn(34) });
    expect(seriesRules.next(outcomeAt(ctx, 33.99), ctx)).toMatchObject({ down: 4, firstDownAwarded: false });
    expect(seriesRules.next(outcomeAt(ctx, 33.99), ctx).distanceYd).toBeCloseTo(0.01, 9);
  });
  it('(b) a penalty that leaves the ball at or beyond the line, or carries an automatic first down', () => {
    const ctx = context({ ballOn: 30, down: 3, toGo: 6 });
    const five = outcomeAt(ctx, 35, { noPlay: true, enforcement: enforcement({ yardsWalked: 5, replayDown: true }) });
    expect(seriesRules.next(five, ctx)).toMatchObject({ down: 3, firstDownAwarded: false });
    expect(seriesRules.next(five, ctx).distanceYd).toBeCloseTo(1, 9);
    const afd = outcomeAt(ctx, 35, { noPlay: true, enforcement: enforcement({ yardsWalked: 5, replayDown: true, automaticFirstDown: true }) });
    expect(seriesRules.next(afd, ctx)).toMatchObject({ down: 1, firstDownAwarded: true, lineToGainX: xOn(45) });
    const six = outcomeAt(ctx, 36, { noPlay: true, enforcement: enforcement({ yardsWalked: 6, replayDown: true }) });
    expect(seriesRules.next(six, ctx)).toMatchObject({ down: 1, firstDownAwarded: true });
  });
  it('(c) possession changed twice and the offense has the ball: first and 10 wherever it ends', () => {
    const ctx = context({ ballOn: 30, down: 3, toGo: 8 });
    const s = seriesRules.next(outcomeAt(ctx, 22, { changeOfPossession: true, resultType: 'interception' }), ctx);
    expect(s).toMatchObject({ possession: 0, down: 1, firstDownAwarded: true, lineToGainX: xOn(32) });
    expect(downVerdict(outcomeAt(ctx, 22, { changeOfPossession: true }), ctx).firstDown).toBe(true);
  });
  it('a loss-of-down foul counts the down even though the down is not replayed', () => {
    const ctx = context({ ballOn: 30, down: 2 });
    expect(seriesRules.next(outcomeAt(ctx, 25, { enforcement: enforcement({ yardsWalked: -5, lossOfDown: true }) }), ctx)).toMatchObject({ down: 3 });
  });
});

describe('B3.4.2 first down for the opponent', () => {
  it('(a) fourth and 2 at the 40, runner down at the 41: the other team, first and 10 at the 41 going the other way', () => {
    const ctx = context({ ballOn: 40, down: 4, toGo: 2 });
    const s = seriesRules.next(outcomeAt(ctx, 41), ctx);
    expect(s).toMatchObject({ possession: 1, down: 1, turnoverOnDowns: true, ballX: xOn(41), lineToGainX: xOn(31) });
    expect(s.distanceYd).toBeCloseTo(10, 9);
  });
  it('(a) a fourth-down incompletion gives the ball to the defense at the previous spot', () => {
    const ctx = context({ ballOn: 40, down: 4 });
    const s = seriesRules.next(outcomeAt(ctx, 40, { incomplete: true, runnerDownInBounds: false, resultType: 'pass_incomplete' }), ctx);
    expect(s).toMatchObject({ possession: 1, ballX: xOn(40), turnoverOnDowns: true });
  });
  it('(b) the other team has the ball at the end of the down', () => {
    const ctx = context({ ballOn: 40, down: 1 });
    const s = seriesRules.next(outcomeAt(ctx, 55, { possessionAfter: 1, changeOfPossession: true, resultType: 'interception' }), ctx);
    expect(s).toMatchObject({ possession: 1, down: 1, turnoverOnDowns: false, firstDownAwarded: false, lineToGainX: xOn(45) });
  });
  it('a loss-of-down foul on the last down that leaves the ball short is a turnover on downs', () => {
    const ctx = context({ ballOn: 40, down: 4 });
    expect(seriesRules.next(outcomeAt(ctx, 35, { enforcement: enforcement({ yardsWalked: -5, lossOfDown: true }) }), ctx)).toMatchObject({ possession: 1, turnoverOnDowns: true });
  });
});

describe('B7.8.1 what follows each score, as the next kind of down', () => {
  const ctx = context({ ballOn: 90 });
  it('touchdown: a try by the scoring team', () => {
    const o = outcomeAt(ctx, 100, { score: { type: 'touchdown', side: 1, points: 6, scorerId: IDS.CB }, possessionAfter: 1, changeOfPossession: true });
    expect(seriesRules.next(o, ctx)).toMatchObject({ playKind: 'try', possession: 1, down: null, lineToGainX: null });
  });
  it('safety: a safety kick by the team scored upon', () => {
    const o = outcomeAt(ctx, 0, { score: { type: 'safety', side: 1, points: 2, scorerId: null } });
    expect(seriesRules.next(o, ctx)).toMatchObject({ playKind: 'safety_kick', possession: 0 });
  });
  it('try, any result: a kickoff by the team that scored the touchdown, also after a defensive score', () => {
    const t = context({ playKind: 'try', ballOn: 98 });
    expect(seriesRules.next(outcomeAt(t, 98, { resultType: 'try_failed' }), t)).toMatchObject({ playKind: 'kickoff', possession: 0 });
    const def = outcomeAt(t, 0, { resultType: 'try_failed', score: { type: 'defensive_try', side: 1, points: 2, scorerId: IDS.CB } });
    expect(seriesRules.next(def, t)).toMatchObject({ playKind: 'kickoff', possession: 0 });
    expect(seriesRules.next(outcomeAt(t, 93, { noPlay: true, enforcement: enforcement({ replayDown: true }) }), t)).toMatchObject({ playKind: 'try', possession: 0 });
  });
});

describe('Q1.2.2 invariants on down and distance', () => {
  const arb = fc.record({
    set: fc.constantFrom('fixture_a' as const, 'fixture_b' as const), dir: fc.constantFrom(1 as const, -1 as const), offense: fc.constantFrom(0 as const, 1 as const),
    ballOn: fc.double({ min: 1, max: 99, noNaN: true }), gain: fc.double({ min: -15, max: 40, noNaN: true }), downIndex: fc.nat(3),
    y: fc.double({ min: 0, max: 53.3, noNaN: true }), lost: fc.boolean(), replay: fc.boolean(), afd: fc.boolean(), lod: fc.boolean(),
  });
  it('the next state is always a legal series state, for both fixture rule sets and both directions', () => {
    fc.assert(fc.property(arb, (a) => {
      const rules = fixtureRules(a.set);
      const down = 1 + (a.downIndex % rules.num('series.downs'));
      const ctx = context({ rules, attackDir: a.dir, offense: a.offense, ballOn: a.ballOn, down });
      const on = Math.min(99.5, Math.max(0.5, a.ballOn + a.gain));
      const enf = a.replay || a.afd || a.lod ? enforcement({ replayDown: a.replay, automaticFirstDown: a.afd, lossOfDown: a.lod }) : null;
      const other = a.offense === 0 ? 1 : 0;
      const o = outcomeAt(ctx, on, { spotY: a.y, enforcement: enf, noPlay: a.replay, possessionAfter: a.lost ? other : a.offense, changeOfPossession: a.lost });
      expect(() => PlayOutcome.parse(o)).not.toThrow();
      const s = seriesRules.next(o, ctx);
      expect(() => SeriesState.parse(s)).not.toThrow();
      expect(s.down).toBeGreaterThanOrEqual(1);
      expect(s.down).toBeLessThanOrEqual(rules.num('series.downs'));
      expect(s.distanceYd).toBeGreaterThanOrEqual(0);
      expect(s.ballY).toBeGreaterThanOrEqual(ctx.geometry.hashSouthY);
      expect(s.ballY).toBeLessThanOrEqual(ctx.geometry.hashNorthY);
      // The line to gain is never beyond the goal line the team attacks, and never behind the ball by more than rounding.
      const d = s.possession === a.offense ? a.dir : -a.dir;
      expect((s.lineToGainX! - (d === 1 ? 110 : 10)) * d).toBeLessThanOrEqual(0);
      expect(s.turnoverOnDowns && s.firstDownAwarded).toBe(false);
      if (s.turnoverOnDowns) expect(s.possession).toBe(other);
      // A fresh series always measures from its own start.
      if (s.down === 1 && (s.firstDownAwarded || s.possession !== a.offense)) expect(s.seriesStartX).toBe(s.ballX);
    }), { numRuns: 2000 });
  });
  it('B1.1.3: yards to the goal line and to the line to gain are unchanged across a change of goals in 1,000 random states', () => {
    fc.assert(fc.property(arb, (a) => {
      const ctx = context({ rules: fixtureRules(a.set), attackDir: a.dir, ballOn: a.ballOn, ballY: a.y });
      const g = ctx.geometry;
      const sit = ctx.situation;
      const m = mirrorSpot(g, sit.ballX, sit.ballY);
      const line = mirrorSpot(g, sit.lineToGainX!, sit.ballY);
      const goalBefore = a.dir === 1 ? g.goalLineEastX : g.goalLineWestX;
      const goalAfter = a.dir === 1 ? g.goalLineWestX : g.goalLineEastX;
      expect((goalAfter - m.x) * -a.dir).toBeCloseTo((goalBefore - sit.ballX) * a.dir, 9);
      expect((line.x - m.x) * -a.dir).toBeCloseTo((sit.lineToGainX! - sit.ballX) * a.dir, 9);
      expect(m.y).toBeCloseTo(g.widthYd - sit.ballY, 9);
      expect(mirrorSpot(g, m.x, m.y).x).toBeCloseTo(sit.ballX, 9);
    }), { numRuns: 1000 });
  });
});
