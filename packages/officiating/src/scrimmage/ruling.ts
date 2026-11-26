// The rules as written for a play from scrimmage or a try with no kick (B3.2, B3.3, B5.1, B5.2, B5.6,
// B7.1 to B7.7), applied to a truth record with perfect sight (B11.2.1 rule 6). The record holds
// physical events only (contract decision D-04): this module decides touchdown, safety, touchback,
// incompletion, turnover and the succeeding spot. It never repairs a play: an illegal act stays in the
// record and is ruled by the foul module. Fouls, enforcement and the next down are not decided here.
import {
  deadBallOf, otherSide, yardsFromOwnGoal,
  type BasicRuling, type DeadBallReason, type PlayOutcome, type PlayResultType, type PlayTruth, type RulingContext,
  type ScoreEvent, type Side, type TruthEventOf,
} from '@gm/schema';
import type { ClockFacts } from '../clock/facts.ts';
import { attackDirOf, attackedGoalX, endZoneOwner, forwardYards, inOwnEndZone, ownGoalX, reachedAttackedGoal, xAtYardsFromOwnGoal } from '../series/field.ts';

/**
 * Contract change request CR-02-1 (plans/engine-build-plan.md, section 6). The momentum exception
 * (B7.5.2) turns on a judgment the truth record has no field for: did the defender's original momentum
 * carry him into his end zone. Until the contract carries it, this local alias reads an optional
 * `momentum` flag on the possession event. A record without the flag gets no exception.
 */
type PossessionWithMomentum = TruthEventOf<'possession'> & { readonly momentum?: boolean };

/** Reasons that mean the down never counted: nothing was live, or the down is replayed by rule (B3.2.3 rule 6). */
const NEVER_LIVE: ReadonlySet<DeadBallReason> = new Set<DeadBallReason>(['pre_snap_foul', 'period_ended_before_snap', 'engine_fault', 'struck_object']);

interface Walk {
  /** Team last in possession. */
  last: Side;
  /** Possession changes during the down. */
  changes: number;
  /** Latest forward pass, and the number of possession changes before it. */
  pass: TruthEventOf<'pass_release'> | null;
  changesBeforePass: number;
  anyForwardPass: boolean;
  /** Latest backward pass in flight since the last possession. */
  backward: TruthEventOf<'pass_release'> | null;
  /** First loose-ball event since the last possession. A later muff keeps the ball's status (B5.1.1 rule 7). */
  loose: TruthEventOf<'fumble'> | null;
  lastPossession: PossessionWithMomentum | null;
  intercepted: boolean;
  caughtByOffense: boolean;
  sacked: boolean;
  /** A teammate of the fumbler recovered where only the fumbler may (B5.6.2 rules 4 and 5): the ball died there. */
  restricted: { side: Side; x: number; y: number } | null;
  /** Field x where the snapping team lost the ball on a fumble the other team recovered, else null. */
  lostX: number | null;
}

function fumbleLimitApplies(fumble: TruthEventOf<'fumble'>, changes: number, ctx: RulingContext): boolean {
  // The limits are written for fumbles. A backward pass or a snap that gets loose is not one (B5.6.1 edge case).
  if (fumble.kind !== 'fumble') return false;
  const sit = ctx.situation;
  if (sit.playKind === 'try') return true;
  const lastDown = sit.down !== null && sit.down === ctx.rules.num('series.downs');
  if (lastDown && changes === 0 && fumble.side === sit.offense) return true;
  return ctx.rules.opt('fumble.advance_restriction') === 'fourth_down_try_and_after_two_minute_warning' && sit.insideTwoMinute;
}

function walk(truth: PlayTruth, ctx: RulingContext): Walk {
  const off = ctx.situation.offense;
  const w: Walk = {
    last: off, changes: 0, pass: null, changesBeforePass: 0, anyForwardPass: false, backward: null, loose: null,
    lastPossession: null, intercepted: false, caughtByOffense: false, sacked: false, restricted: null, lostX: null,
  };
  const deadT = deadBallOf(truth).t;
  for (const e of truth.events) {
    if (e.t > deadT || w.restricted !== null) break;
    if (e.type === 'pass_release') {
      if (e.forward) { w.pass = e; w.changesBeforePass = w.changes; w.anyForwardPass = true; w.backward = null; } else w.backward = e;
    } else if (e.type === 'fumble') {
      if (w.loose === null) w.loose = e;
    } else if (e.type === 'pressure') {
      if (e.kind === 'sack') w.sacked = true;
    } else if (e.type === 'possession') {
      const f = w.loose;
      if (f !== null && e.how === 'fumble_recovery' && e.side === f.side && e.playerId !== f.playerId && fumbleLimitApplies(f, w.changes, ctx)) {
        // Dead at the spot of the fumble, or at the spot of recovery when that is behind it.
        const behind = forwardYards(f.spot.x, e.spot.x, attackDirOf(ctx, f.side)) < 0;
        w.restricted = { side: f.side, x: behind ? e.spot.x : f.spot.x, y: behind ? e.spot.y : f.spot.y };
        w.last = f.side;
        continue;
      }
      if (e.side !== w.last) { if (w.changes === 0 && f !== null) w.lostX = f.spot.x; w.changes += 1; }
      if (e.how === 'interception') w.intercepted = true;
      if (e.how === 'catch' && e.side === off && w.changes === 0) w.caughtByOffense = true;
      w.last = e.side;
      w.lastPossession = e;
      w.loose = null; w.backward = null; w.pass = null;
    }
  }
  return w;
}

/** How the ball ended before any goal-line question: who has it or is awarded it, and where. */
interface Ending {
  side: Side;
  x: number;
  y: number;
  /** True when no player held the ball at the dead-ball instant. */
  looseBall: boolean;
  /** Where the loose ball actually was when it died. The goal-line question uses this point (B5.6.3). */
  ballX: number;
  incomplete: boolean;
  outOfBounds: boolean;
}

function ending(truth: PlayTruth, w: Walk, ctx: RulingContext): Ending {
  const sit = ctx.situation;
  const dead = deadBallOf(truth);
  if (w.restricted !== null) {
    return { side: w.restricted.side, x: w.restricted.x, y: w.restricted.y, looseBall: false, ballX: w.restricted.x, incomplete: false, outOfBounds: false };
  }
  if (dead.reason === 'incomplete_pass') {
    // B5.2.2 rule 1: back to the previous spot, lateral position included (B3.3.3 rule 3). A pass thrown after a
    // change of possession is illegal; if it falls incomplete the ball is dead at the spot of the pass.
    if (w.pass !== null && w.changesBeforePass > 0) {
      return { side: w.last, x: w.pass.releaseSpot.x, y: w.pass.releaseSpot.y, looseBall: false, ballX: w.pass.releaseSpot.x, incomplete: true, outOfBounds: false };
    }
    return { side: sit.offense, x: sit.ballX, y: sit.ballY, looseBall: false, ballX: sit.ballX, incomplete: true, outOfBounds: false };
  }
  if (dead.reason === 'ball_out_of_bounds' || dead.reason === 'loose_ball_at_rest') {
    const out = dead.reason === 'ball_out_of_bounds';
    const f = w.loose;
    // B5.6.3: a fumble out of bounds forward of the spot of the fumble comes back to that spot. A backward
    // pass, a loose snap and every ball at rest belong to the team last in possession where they died.
    if (out && f !== null && f.kind === 'fumble' && forwardYards(f.spot.x, dead.spot.x, attackDirOf(ctx, w.last)) > 0) {
      return { side: w.last, x: f.spot.x, y: f.spot.y, looseBall: true, ballX: dead.spot.x, incomplete: false, outOfBounds: true };
    }
    return { side: w.last, x: dead.spot.x, y: dead.spot.y, looseBall: true, ballX: dead.spot.x, incomplete: false, outOfBounds: out };
  }
  return {
    side: dead.side ?? w.last, x: dead.spot.x, y: dead.spot.y, looseBall: false, ballX: dead.spot.x, incomplete: false,
    outOfBounds: dead.reason === 'runner_out_of_bounds',
  };
}

type GoalLine =
  | { kind: 'none' }
  | { kind: 'touchdown'; side: Side }
  | { kind: 'safety'; against: Side }
  | { kind: 'touchback'; side: Side }
  | { kind: 'spot'; side: Side; x: number; y: number };

/** B7.2.1, B7.5.1, B7.5.2, B7.6.1, B7.7.1, B5.6.3: what a ball dead on or behind a goal line means. */
function goalLine(truth: PlayTruth, w: Walk, end: Ending, ctx: RulingContext): GoalLine {
  const g = ctx.geometry;
  const rules = ctx.rules;
  if (end.incomplete) return { kind: 'none' };
  const dead = deadBallOf(truth);
  if (end.looseBall) {
    const owner = endZoneOwner(g, end.ballX, ctx);
    if (owner === null) return { kind: 'none' };
    if (dead.reason === 'loose_ball_at_rest') {
      // B3.2.1 i: a ball at rest that would be awarded behind a goal line is placed on the yard line the rule names.
      const x = xAtYardsFromOwnGoal(g, rules.num('deadball.loose_at_rest_yardline'), attackDirOf(ctx, owner));
      return { kind: 'spot', side: end.side, x, y: end.y };
    }
    // Out of bounds behind a goal line: a safety when the defending team gave the impetus, else a touchback.
    const impetus = truth.endZoneImpetus ?? w.last;
    return impetus === owner ? { kind: 'safety', against: owner } : { kind: 'touchback', side: owner };
  }
  const dir = attackDirOf(ctx, end.side);
  if (reachedAttackedGoal(g, end.x, dir)) return { kind: 'touchdown', side: end.side };
  if (!inOwnEndZone(g, end.x, dir, rules.num('field.ball_length_yd'))) return { kind: 'none' };
  // The ball is dead in the end zone its holder defends. A team that carried it there gave the impetus itself.
  const impetus = truth.endZoneImpetus ?? end.side;
  if (impetus !== end.side) return { kind: 'touchback', side: end.side };
  const p = w.lastPossession;
  if (p !== null && p.momentum === true && p.side === end.side && w.restricted === null) {
    // B7.5.2: his team's ball where he established possession; a touchback if that was in the end zone;
    // never nearer his goal line than the yard line the rule names.
    const from = yardsFromOwnGoal(g, p.spot.x, dir);
    if (from <= 0) return { kind: 'touchback', side: end.side };
    const min = rules.num('touchback.momentum_min_yardline');
    return { kind: 'spot', side: end.side, x: from < min ? xAtYardsFromOwnGoal(g, min, dir) : p.spot.x, y: p.spot.y };
  }
  return { kind: 'safety', against: end.side };
}

function resultType(truth: PlayTruth, w: Walk, end: Ending, possessionAfter: Side, score: ScoreEvent | null, ctx: RulingContext): PlayResultType {
  const off = ctx.situation.offense;
  if (ctx.situation.playKind === 'try') return score !== null && score.side === off ? 'try_good' : 'try_failed';
  if (w.intercepted) return 'interception';
  const lost = possessionAfter !== off && (score === null || score.type !== 'safety');
  const defenseScored = score !== null && score.type === 'touchdown' && score.side !== off;
  if (lost || defenseScored) return 'fumble_lost';
  if (end.incomplete) return w.pass !== null && w.pass.spike ? 'spike' : 'pass_incomplete';
  if (w.caughtByOffense) return 'pass_complete';
  if (deadBallOf(truth).reason === 'kneel') return 'kneel';
  if (w.sacked && !w.anyForwardPass) return 'sack';
  return 'run';
}

function rule(truth: PlayTruth, ctx: RulingContext): PlayOutcome {
  const sit = ctx.situation;
  const g = ctx.geometry;
  const rules = ctx.rules;
  const off = sit.offense;
  const isTry = sit.playKind === 'try';
  const dead = deadBallOf(truth);
  const injuryStoppage = [...new Set(truth.events.filter((e): e is TruthEventOf<'injury'> => e.type === 'injury' && !e.finishesPlay).map((e) => e.playerId))];
  const blank: PlayOutcome = {
    resultType: 'no_play', noPlay: true, snappingSide: off, possessionAfter: off, changeOfPossession: false,
    spotX: sit.ballX, spotY: sit.ballY, previousSpotX: sit.ballX, score: null, touchback: false,
    endedOutOfBounds: false, incomplete: false, runnerDownInBounds: false, yardsGained: 0, injuryStoppage, enforcement: null,
  };
  if (NEVER_LIVE.has(dead.reason)) return blank;

  const w = walk(truth, ctx);
  const end = ending(truth, w, ctx);
  const gl = goalLine(truth, w, end, ctx);

  let possessionAfter: Side = end.side;
  let spotX = end.x;
  let spotY = end.y;
  let score: ScoreEvent | null = null;
  let touchback = false;

  if (gl.kind === 'touchdown') {
    spotX = attackedGoalX(g, attackDirOf(ctx, gl.side));
    if (!isTry) score = { type: 'touchdown', side: gl.side, points: rules.num('score.touchdown'), scorerId: dead.carrierId };
    else if (gl.side === off) score = { type: 'try_two', side: off, points: rules.num('try.two_point_points'), scorerId: dead.carrierId };
    else if (rules.bool('try.defense_can_score')) score = { type: 'defensive_try', side: gl.side, points: rules.num('try.two_point_points'), scorerId: dead.carrierId };
  } else if (gl.kind === 'safety') {
    // The team scored upon puts the ball in play next (B7.8.1), so it is the team entitled to the ball.
    possessionAfter = gl.against;
    spotX = ownGoalX(g, attackDirOf(ctx, gl.against));
    score = isTry
      ? { type: 'try_safety', side: otherSide(gl.against), points: rules.num('try.safety_points'), scorerId: null }
      : { type: 'safety', side: otherSide(gl.against), points: rules.num('score.safety'), scorerId: null };
  } else if (gl.kind === 'touchback') {
    // B7.6.1 rule 3: the team awarded the touchback snaps at its touchback yard line, between the inbounds lines.
    // B7.3.2 rule 4: on a try a touchback only means the try failed.
    possessionAfter = gl.side;
    touchback = !isTry;
    spotX = xAtYardsFromOwnGoal(g, rules.num('touchback.yardline'), attackDirOf(ctx, gl.side));
    spotY = g.centreY;
  } else if (gl.kind === 'spot') {
    possessionAfter = gl.side; spotX = gl.x; spotY = gl.y;
  }
  // A try is one down: whatever happened, the team that scored the touchdown kicks off next (B7.8.1).
  if (isTry) possessionAfter = off;

  const offDir = attackDirOf(ctx, off);
  let yardsGained = 0;
  if (!end.incomplete && w.changes === 0 && w.restricted === null && possessionAfter === off && gl.kind !== 'safety') yardsGained = forwardYards(sit.ballX, spotX, offDir);
  else if (!end.incomplete && !w.intercepted) {
    // The offense lost the ball, or it died by rule: its yards run to where it last had the ball.
    const lostAt = w.restricted !== null ? w.restricted.x : w.lostX !== null ? w.lostX : w.loose !== null && w.loose.side === off && w.changes === 0 ? w.loose.spot.x : gl.kind === 'safety' ? spotX : end.x;
    yardsGained = forwardYards(sit.ballX, lostAt, offDir);
  }

  const scored = score !== null;
  return {
    resultType: resultType(truth, w, end, possessionAfter, score, ctx),
    noPlay: false, snappingSide: off, possessionAfter,
    changeOfPossession: !isTry && (w.changes > 0 || (possessionAfter !== off && gl.kind !== 'safety')),
    spotX, spotY, previousSpotX: sit.ballX, score, touchback,
    endedOutOfBounds: end.outOfBounds, incomplete: end.incomplete,
    runnerDownInBounds: !end.looseBall && !end.incomplete && !end.outOfBounds && !scored && !touchback,
    yardsGained, injuryStoppage, enforcement: null,
  };
}

/** The facts of CR-02-2, read from the same truth record the ruling used. */
export function clockFacts(truth: PlayTruth, ctx: RulingContext): ClockFacts {
  const dead = deadBallOf(truth);
  if (NEVER_LIVE.has(dead.reason)) return { looseBallOutOfBounds: false };
  const w = walk(truth, ctx);
  return { looseBallOutOfBounds: w.restricted === null && dead.reason === 'ball_out_of_bounds' };
}

/** The scrimmage `BasicRuling` of the contract: every play whose truth record holds no `kick` event. */
export const scrimmageRuling: BasicRuling = {
  handles: (truth) => !truth.events.some((e) => e.type === 'kick'),
  rule,
};
