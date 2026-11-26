// Down, distance, line to gain and hash placement (B3.1.1, B3.3.3, B3.4.1, B3.4.2, J11.3.2).
// Comparisons with the line to gain are exact, with no tolerance (J11.3.2 edge case). The spotting
// error of the officials belongs to the crew model (B11), which hands this module a called spot.
// Penalty enforcement arrives already computed in `outcome.enforcement` and is applied as given.
import { otherSide, type PlayOutcome, type RulingContext, type SeriesRules, type SeriesState, type Side } from '@gm/schema';
import { attackDirOf, attackedGoalX, forwardYards, inboundsY } from './field.ts';

/** What the series rule concluded about a scrimmage down, before it is turned into the next state. */
export interface DownVerdict {
  /** The down is played again with the same number (no play, or an enforcement that replays the down). */
  readonly replayed: boolean;
  /** The ball is at or beyond the line to gain in the snapping team's possession (B3.4.1 a, b). */
  readonly reachedLineToGain: boolean;
  /** New series for the snapping team: line reached, automatic first down, or possession regained (B3.4.1 c). */
  readonly firstDown: boolean;
  /** The series ran out of downs short of the line (B3.4.2 a). */
  readonly turnoverOnDowns: boolean;
  /** Number of the next down when the same series continues, else null. */
  readonly nextDown: number | null;
}

const NO_VERDICT: DownVerdict = { replayed: false, reachedLineToGain: false, firstDown: false, turnoverOnDowns: false, nextDown: null };

/**
 * The series decision for a scrimmage down (B3.4.1, B3.4.2). Shared with the clock module, which
 * needs to know about a first down (B13.3.1) and a failed last down (B1.2.2 i). Returns the neutral
 * verdict for kicks, tries, scores and plays that leave the ball with the other team.
 */
export function downVerdict(outcome: PlayOutcome, ctx: RulingContext): DownVerdict {
  const sit = ctx.situation;
  if (sit.playKind !== 'scrimmage' || outcome.score !== null || outcome.touchback) return NO_VERDICT;
  if (outcome.possessionAfter !== outcome.snappingSide) return NO_VERDICT;
  const enf = outcome.enforcement;
  const replayed = outcome.noPlay || (enf !== null && enf.replayDown);
  if (outcome.changeOfPossession && !replayed) return { ...NO_VERDICT, firstDown: true };
  const dir = attackDirOf(ctx, outcome.snappingSide);
  const reached = sit.lineToGainX !== null && forwardYards(sit.lineToGainX, outcome.spotX, dir) >= 0;
  if (reached || (enf !== null && enf.automaticFirstDown)) return { ...NO_VERDICT, replayed, reachedLineToGain: reached, firstDown: true };
  const down = sit.down ?? 1;
  const counts = !replayed || (enf !== null && enf.lossOfDown);
  const nextDown = counts ? down + 1 : down;
  if (nextDown > ctx.rules.num('series.downs')) return { ...NO_VERDICT, replayed, turnoverOnDowns: true };
  return { ...NO_VERDICT, replayed, nextDown };
}

function fresh(side: Side, ballX: number, ballY: number, ctx: RulingContext, flags: { firstDownAwarded: boolean; turnoverOnDowns: boolean }): SeriesState {
  const g = ctx.geometry;
  const dir = attackDirOf(ctx, side);
  const goalX = attackedGoalX(g, dir);
  const raw = ballX + dir * ctx.rules.num('series.yards_to_gain');
  // B3.1.1 rule 3: the goal line is the line to gain when it is no farther than the yards to gain.
  const goalToGo = forwardYards(goalX, raw, dir) >= 0;
  const lineToGainX = goalToGo ? goalX : raw;
  return {
    playKind: 'scrimmage', possession: side, down: 1, distanceYd: Math.max(0, forwardYards(ballX, lineToGainX, dir)), goalToGo,
    ballX, ballY: inboundsY(g, ballY), lineToGainX, seriesStartX: ballX,
    firstDownAwarded: flags.firstDownAwarded, turnoverOnDowns: flags.turnoverOnDowns,
  };
}

/** A state for a down that is not part of a series: a try or a free kick. RestartRules sets the real spot. */
function restart(playKind: SeriesState['playKind'], side: Side, outcome: PlayOutcome): SeriesState {
  return {
    playKind, possession: side, down: null, distanceYd: null, goalToGo: false, ballX: outcome.spotX, ballY: outcome.spotY,
    lineToGainX: null, seriesStartX: null, firstDownAwarded: false, turnoverOnDowns: false,
  };
}

const NONE = { firstDownAwarded: false, turnoverOnDowns: false };

function next(outcome: PlayOutcome, ctx: RulingContext): SeriesState {
  const sit = ctx.situation;
  const snapping = outcome.snappingSide;
  const enf = outcome.enforcement;
  const replayed = outcome.noPlay || (enf !== null && enf.replayDown);

  // B7.8.1: what follows each score. The kicking team is named here; the receiving team is the other one.
  const score = outcome.score;
  if (score !== null) {
    if (score.type === 'touchdown') return restart('try', score.side, outcome);
    if (score.type === 'safety') return restart('safety_kick', otherSide(score.side), outcome);
    if (score.type === 'field_goal') return restart('kickoff', score.side, outcome);
    return restart('kickoff', snapping, outcome);
  }

  if (sit.playKind === 'try') return replayed ? restart('try', snapping, outcome) : restart('kickoff', snapping, outcome);
  if (sit.playKind !== 'scrimmage') {
    // A free kick or fair catch kick: a re-kick, or a new series for whoever is entitled to the ball (B3.4.1 e, B3.4.2 c).
    if (replayed) return restart(sit.playKind, snapping, outcome);
    return fresh(outcome.possessionAfter, outcome.spotX, outcome.spotY, ctx, NONE);
  }

  // B3.4.2 b: the other team has, or is awarded, the ball at the end of the down.
  if (outcome.possessionAfter !== snapping) return fresh(outcome.possessionAfter, outcome.spotX, outcome.spotY, ctx, NONE);

  const v = downVerdict(outcome, ctx);
  if (v.firstDown) return fresh(snapping, outcome.spotX, outcome.spotY, ctx, { firstDownAwarded: true, turnoverOnDowns: false });
  if (v.turnoverOnDowns) return fresh(otherSide(snapping), outcome.spotX, outcome.spotY, ctx, { firstDownAwarded: false, turnoverOnDowns: true });

  // Same series: the line to gain does not move (B3.1.1 edge case), so the distance can exceed the yards to gain.
  const dir = attackDirOf(ctx, snapping);
  const lineToGainX = sit.lineToGainX ?? attackedGoalX(ctx.geometry, dir);
  return {
    playKind: 'scrimmage', possession: snapping, down: v.nextDown, distanceYd: Math.max(0, forwardYards(outcome.spotX, lineToGainX, dir)),
    goalToGo: lineToGainX === attackedGoalX(ctx.geometry, dir), ballX: outcome.spotX, ballY: inboundsY(ctx.geometry, outcome.spotY),
    lineToGainX, seriesStartX: ctx.before.seriesStartX, firstDownAwarded: false, turnoverOnDowns: false,
  };
}

/** B3.1, B3.3.3, B3.4 and J11.3.2 behind the contract's `SeriesRules`. Pure: no state between calls. */
export const seriesRules: SeriesRules = {
  next,
  newSeries: (side, ballX, ballY, ctx) => fresh(side, ballX, ballY, ctx, NONE),
};
