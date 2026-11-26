// J7.3.1 Judging open. Everything about another player comes from the quarterback's `PerceivedView`:
// a defender outside his attention is simply not in the estimate, which is how he is baited (step 4).
// What he assumes about a defender he does see (closing speed, reaction) is a league-typical guess
// from the parameter file, never that defender's true ability.
//
// The estimate is mapped to completion and interception chances with the catch-point model's own
// functions (J6.5), so an estimator with no error and full attention is calibrated (step 5).
import { SLOTS_PER_TEAM, SLOT_COUNT, type DeterministicMath, type PerceivedView, type PlayPoint } from '@gm/schema';
import type { CatchPointContests, DefenderPosition } from '../contest/index.ts';
import { dSqrt } from '../dmath.ts';
import { clip, expectedPlacementError, insideRadiusShare } from './formulas.ts';
import type { QbParams } from './params.ts';
import type { QbTarget, QbValueModel } from './play.ts';

export const TRAJECTORIES = ['drive', 'firm', 'touch'] as const;
export type Trajectory = (typeof TRAJECTORIES)[number];

/** What the quarterback brings to an estimate. Rebuilt when his platform changes; never holds opponent truth. */
export interface JudgeContext {
  readonly p: QbParams;
  readonly catchPoint: CatchPointContests;
  readonly math: DeterministicMath;
  readonly value: QbValueModel;
  /** J7.6.1 values for this quarterback. */
  releaseS: number;
  vBallYps: number;
  /** Pass drag, already scaled for air density (J9.1.1). */
  dragPerYd: number;
  /** Longest throw his arm reaches (J9 solver, once per play). */
  maxRangeYd: number;
  /** His own error for a throw of these air yards from his current platform (J7.6.2). He knows his arm. */
  accuracySdYd(airYd: number): number;
  wet: boolean;
  /** The sidelines in the play frame, when the caller knows them: he does not expect a receiver to run out of bounds. */
  loPy?: number;
  hiPy?: number;
  /** A Hail Mary or free play is thrown even past his range. */
  allowOutOfRange: boolean;
  /**
   * Seconds the ball is in the air to a point `distYd` away on each trajectory, from the J9 solver in
   * still air (J7.6.1: "flight time comes from J9"). He knows his own arm.
   */
  flightS(distYd: number, trajectory: Trajectory): number;
  /** Height of the ball over the ground `alongYd` into a throw of `distYd` on that trajectory (J9). */
  heightYd(distYd: number, alongYd: number, trajectory: Trajectory): number;
  /** J2.1.3 share of top speed a league-typical receiver carries through a planted cut of this angle (0 to pi). */
  cutShare(angleRad: number): number;
}

/** One estimate (J7.3.1 outputs). Reused: the stage keeps one per read and writes into it. */
export interface Estimate {
  /** False when there is nothing to judge: the receiver is unseen with no route to trust, or the throw is out of range. */
  ok: boolean;
  /** True when the only thing wrong is that the throw is past his arm's reach. */
  outOfRange: boolean;
  pHat: number;
  iHat: number;
  /** Estimated gain past the line: air yards plus what he expects after the catch. */
  yards: number;
  v: number;
  sepYd: number;
  laneClearYd: number;
  /** Where he expects the receiver when the ball arrives, play frame. */
  aimPx: number;
  aimPy: number;
  distYd: number;
  airYd: number;
  /** Seconds from now to arrival: release plus flight. */
  arriveS: number;
  trajectory: Trajectory;
  nearestDefender: number;
  defenderPosition: DefenderPosition;
  /** He is watching the receiver now. */
  seen: boolean;
  /** The receiver is past the break he times the throw to (always true with no break). */
  broken: boolean;
  /** Seconds until that break at his present speed. 0 once broken. */
  toBreakS: number;
  /** Direction the receiver is travelling at arrival, unit vector, for the lead (J7.6.2). */
  dirPx: number;
  dirPy: number;
}

export function newEstimate(): Estimate {
  return {
    ok: false, outOfRange: false, pHat: 0, iHat: 0, yards: 0, v: 0, sepYd: 0, laneClearYd: 0, aimPx: 0, aimPy: 0, distYd: 0, airYd: 0, arriveS: 0,
    trajectory: 'firm', nearestDefender: -1, defenderPosition: 'inPhase', seen: false, broken: true, toBreakS: 0, dirPx: 1, dirPy: 0,
  };
}

const NO_DEFENDER_YD = 99;
/** Step of the scan for where a throw is within a defender's reach. */
const LANE_STEP_YD = 0.25;
const loc = { seg: 0, f: 0, cx: 0, cy: 0 };

function hyp(x: number, y: number): number { return dSqrt(x * x + y * y); }

/** Closest point of the route to a position: segment index, share along it, and the point. */
function locate(route: readonly PlayPoint[], px: number, py: number): void {
  let best = Infinity;
  loc.seg = 0; loc.f = 0; loc.cx = route[0]!.px; loc.cy = route[0]!.py;
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i]!, b = route[i + 1]!;
    const dx = b.px - a.px, dy = b.py - a.py, len2 = dx * dx + dy * dy;
    const f = len2 > 0 ? clip(((px - a.px) * dx + (py - a.py) * dy) / len2, 0, 1) : 0;
    const cx = a.px + dx * f, cy = a.py + dy * f;
    const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (d < best) { best = d; loc.seg = i; loc.f = f; loc.cx = cx; loc.cy = cy; }
  }
}

/**
 * Walks `travelYd` along the route from the point nearest (px, py) and writes [px, py, dirPx, dirPy] to
 * `out`. The receiver's offset from the drawn route is kept. Past the last point he sits down
 * (`settles`) or keeps his heading.
 */
export function projectAlongRoute(route: readonly PlayPoint[], settles: boolean, px: number, py: number, travelYd: number, out: Float64Array): void {
  if (route.length < 2) { out[0] = px; out[1] = py; out[2] = 1; out[3] = 0; return; }
  locate(route, px, py);
  const offX = px - loc.cx, offY = py - loc.cy;
  let left = travelYd, x = loc.cx, y = loc.cy, ux = 1, uy = 0;
  // Standing on the end of his segment he keeps that leg's heading, not straight upfield.
  { const a = route[loc.seg]!, b = route[loc.seg + 1]!, len = hyp(b.px - a.px, b.py - a.py); if (len > 0) { ux = (b.px - a.px) / len; uy = (b.py - a.py) / len; } }
  for (let i = loc.seg; i + 1 < route.length; i++) {
    const b = route[i + 1]!;
    const dx = b.px - x, dy = b.py - y, len = hyp(dx, dy);
    if (len > 0) { ux = dx / len; uy = dy / len; }
    if (left <= len) { x += ux * left; y += uy * left; left = 0; break; }
    x = b.px; y = b.py; left -= len;
  }
  if (left > 0 && !settles) { x += ux * left; y += uy * left; }
  out[0] = x + offX; out[1] = y + offY; out[2] = ux; out[3] = uy;
}

/** Route distance still to run before the break point. 0 or less once he is past it. */
export function distanceToBreak(route: readonly PlayPoint[], breakIndex: number, px: number, py: number): number {
  if (breakIndex < 0 || route.length < 2) return 0;
  locate(route, px, py);
  if (loc.seg >= breakIndex) return 0;
  let d = hyp(route[loc.seg + 1]!.px - loc.cx, route[loc.seg + 1]!.py - loc.cy);
  for (let i = loc.seg + 1; i < breakIndex; i++) d += hyp(route[i + 1]!.px - route[i]!.px, route[i + 1]!.py - route[i]!.py);
  return d;
}

const proj = new Float64Array(4);

/** Step of the route walk below. Fixed, so the walk is the same on every platform (J13). */
const WALK_DT_S = 0.05;
const WALK_MAX_STEPS = 160;
const walked = { breakS: -1, speed: 0 };

function turnAngle(route: readonly PlayPoint[], i: number, math: DeterministicMath): number {
  const a = route[i - 1]!, b = route[i]!, c = route[i + 1]!;
  const ax = b.px - a.px, ay = b.py - a.py, cx = c.px - b.px, cy = c.py - b.py;
  const ang = math.atan2(ax * cy - ay * cx, ax * cx + ay * cy);
  return ang < 0 ? -ang : ang;
}

/**
 * J7.3.1 step 1 with the receiver's legs (J2.1.3, J2.2): where he is `timeS` from now when he runs the
 * drawn route from (px, py) at `speed`, brakes into each planted cut to the speed he can carry through
 * it, plants, and accelerates out toward his top speed. Writes [px, py, dirPx, dirPy] to `out`, and to
 * `walked` the time he passes the break he is timed to (-1 if not inside `timeS`) and his speed then.
 * The numbers are what the quarterback knows of his own receiver from practice (`QbTarget`), or the
 * league-typical rows when the caller gives none. Nothing here is opponent truth.
 */
export function walkRoute(target: QbTarget, ctx: JudgeContext, px: number, py: number, speed: number, timeS: number, out: Float64Array): void {
  const route = target.route, p = ctx.p, last = route.length - 1;
  walked.breakS = -1; walked.speed = speed;
  if (route.length < 2) { out[0] = px; out[1] = py; out[2] = 1; out[3] = 0; return; }
  locate(route, px, py);
  const offX = px - loc.cx, offY = py - loc.cy;
  // With no numbers for this receiver he holds the pace he shows, or the typical route pace if he is not moving yet.
  const vTop = target.topSpeedYps ?? (speed >= p['judge.movingYps'] ? speed : p['judge.routeSpeedYps']);
  if (target.topSpeedYps === undefined) speed = vTop;
  const tau = target.accelTauS ?? p['judge.routeTauS'], brake = target.brakeYps2 ?? p['judge.routeBrakeYps2'];
  let seg = loc.seg, x = loc.cx, y = loc.cy, v = speed, ux = 1, uy = 0, t = 0;
  let toEnd = hyp(route[seg + 1]!.px - x, route[seg + 1]!.py - y);
  // Speed he may carry through the point that ends this segment: a planted cut, a stop, or no limit.
  const capAt = (i: number): number => {
    if (i >= last) return target.settles ? 0 : Infinity;
    const share = target.cutShare !== undefined ? (target.cutShare[i] ?? 1) : i === target.breakIndex ? ctx.cutShare(turnAngle(route, i, ctx.math)) : 1;
    return share >= 1 ? Infinity : vTop * share;
  };
  let cap = capAt(seg + 1);
  // A man already at (or past) the end of his segment has no distance to take a heading from: he keeps the leg's own.
  const segmentHeading = (r: readonly PlayPoint[], i: number): void => {
    const dx = r[i + 1]!.px - r[i]!.px, dy = r[i + 1]!.py - r[i]!.py, len = hyp(dx, dy);
    if (len > 0) { ux = dx / len; uy = dy / len; }
  };
  { const dx = route[seg + 1]!.px - x, dy = route[seg + 1]!.py - y; if (toEnd > 0) { ux = dx / toEnd; uy = dy / toEnd; } else segmentHeading(route, seg); }
  for (let step = 0; step < WALK_MAX_STEPS && t < timeS; step++) {
    let dt = timeS - t; if (dt > WALK_DT_S) dt = WALK_DT_S;
    // The most he can carry here and still be down to the cut speed at the point (J2.1.3).
    const allowed = cap === Infinity ? Infinity : dSqrt(cap * cap + 2 * brake * (toEnd > 0 ? toEnd : 0));
    if (v > allowed) { v -= brake * dt; if (v < allowed) v = allowed; }
    else { v += ((vTop - v) / tau) * dt; if (v > allowed) v = allowed; }
    let left = v * dt;
    t += dt;
    while (left > 0) {
      if (left < toEnd || seg >= last) {
        if (seg >= last && target.settles) { left = 0; v = 0; break; }
        x += ux * left; y += uy * left; toEnd -= left; left = 0;
        break;
      }
      // He reaches the point: plants if it is a cut, and runs the next segment.
      x = route[seg + 1]!.px; y = route[seg + 1]!.py; left -= toEnd;
      if (v > cap) v = cap;
      seg++;
      if (seg === target.breakIndex && walked.breakS < 0) walked.breakS = t - (v > 0 ? left / v : 0);
      if (seg >= last) { toEnd = Infinity; cap = Infinity; if (target.settles) { left = 0; v = 0; } continue; }
      const dx = route[seg + 1]!.px - x, dy = route[seg + 1]!.py - y;
      toEnd = hyp(dx, dy); cap = capAt(seg + 1);
      if (toEnd > 0) { ux = dx / toEnd; uy = dy / toEnd; }
    }
  }
  walked.speed = v;
  out[0] = x + offX; out[1] = y + offY; out[2] = ux; out[3] = uy;
}

/** One trajectory judged (below). Module scratch: the judge allocates nothing. */
interface Shot {
  ax: number; ay: number; dirX: number; dirY: number; dist: number; flight: number; arrive: number;
  sepEst: number; minLane: number; laneAlong: number; blocked: number; nearest: number; nearX: number; nearY: number;
  position: DefenderPosition; pHat: number; iHat: number; yards: number; v: number; defAlong: number;
}
const newShot = (): Shot => ({
  ax: 0, ay: 0, dirX: 1, dirY: 0, dist: 0, flight: 0, arrive: 0, sepEst: 0, minLane: 0, laneAlong: 0, blocked: 0, nearest: -1, nearX: 0, nearY: 0,
  position: 'inPhase', pHat: 0, iHat: 0, yards: 0, v: 0, defAlong: 0,
});
const shotA = newShot(), shotB = newShot();

/**
 * J7.3.1 steps 1 to 6 for one receiver. `noiseYd` is his separation error for this look (drawn once per
 * look by the stage from stream `qb`); `alert` adds the I2.5.1 bonus when the receiver has won deep.
 * `releaseInS` is the time until the ball leaves his hand: his release time when he is deciding, 0 at
 * the release itself.
 *
 * J7.6.1 trajectory. The rule names the candidates (touch when an underneath defender is in the lane
 * with room behind him, drive when a defender closes from depth); each candidate is judged whole, with
 * its own flight time from J9, the receiver walked to its own arrival and the defenders given its own
 * time, and he throws the one he rates higher. A touch throw that hangs long enough for the coverage
 * to arrive is not better than a firm one past a linebacker's hand.
 */
export function judgeTarget(view: PerceivedView, target: QbTarget, ctx: JudgeContext, noiseYd: number, alert: boolean, out: Estimate, releaseInS: number = ctx.releaseS): Estimate {
  const p = ctx.p, route = target.route;
  const qx = view.self.px, qy = view.self.py;
  const rec = view.entity(target.slot);
  out.ok = false; out.outOfRange = false; out.seen = rec !== null; out.nearestDefender = -1; out.defenderPosition = 'inPhase'; out.trajectory = 'firm';

  // Step 1: where the receiver is now, as he sees it, or where the design says he should be.
  let rx: number, ry: number, speed: number, vx = 0, vy = 0;
  const onRoute = route.length >= 2;
  if (rec) {
    rx = rec.px; ry = rec.py; vx = rec.velPx; vy = rec.velPy; speed = hyp(vx, vy);
  } else if (onRoute) {
    walkRoute(target, ctx, route[0]!.px, route[0]!.py, 0, view.tSinceSnapS > 0 ? view.tSinceSnapS : 0, proj);
    rx = proj[0]!; ry = proj[1]!; speed = walked.speed;
  } else return out;

  const toBreak = onRoute ? distanceToBreak(route, target.breakIndex, rx, ry) : 0;
  out.broken = toBreak <= 0;
  out.toBreakS = 0;
  if (toBreak > 0) {
    // Time to the break on his legs, braking into it.
    walkRoute(target, ctx, rx, ry, speed, p['judge.breakHorizonS'], proj);
    out.toBreakS = walked.breakS >= 0 ? walked.breakS : p['judge.breakHorizonS'];
  }

  const first = view.selfSlot < SLOTS_PER_TEAM ? SLOTS_PER_TEAM : 0;
  const defSpeed = p['judge.defenderSpeedYps'];

  /** Steps 1 to 6 for one trajectory, written to `s`. */
  const shoot = (trajectory: Trajectory, s: Shot): void => {
    // Arrival time and point: release plus flight to where he will be then (fixed-point, three passes).
    let ax = rx, ay = ry, dirX = 1, dirY = 0, dist = hyp(rx - qx, ry - qy);
    let flight = ctx.flightS(dist, trajectory), arrive = releaseInS + flight;
    for (let k = 0; k < 3; k++) {
      if (onRoute) {
        walkRoute(target, ctx, rx, ry, speed, arrive, proj);
        ax = proj[0]!; ay = proj[1]!; dirX = proj[2]!; dirY = proj[3]!;
      } else {
        ax = rx + vx * arrive; ay = ry + vy * arrive;
        if (speed > 0) { dirX = vx / speed; dirY = vy / speed; }
      }
      if (ctx.loPy !== undefined && ctx.hiPy !== undefined) {
        const lo = ctx.loPy + p['judge.sidelineRoomYd'], hi = ctx.hiPy - p['judge.sidelineRoomYd'];
        if (lo < hi) ay = ay < lo ? lo : ay > hi ? hi : ay;
      }
      dist = hyp(ax - qx, ay - qy);
      flight = ctx.flightS(dist, trajectory);
      arrive = releaseInS + flight;
    }

    // Steps 2 to 4: every defender he is watching, projected to the catch point and to the throw lane.
    const lineX = dist > 0 ? (ax - qx) / dist : 1, lineY = dist > 0 ? (ay - qy) / dist : 0;
    // Where along the throw the ball is low enough to get a hand to (J7.6.1: a touch throw goes over the
    // underneath defender): from his hand up to `sUp`, and again from `sLow` down to the catch.
    const reachH = p['judge.laneReachHeightYd'], under = dist - p['judge.laneUnderYd'];
    let sUp = p['judge.laneNearYd'];
    while (sUp < dist && ctx.heightYd(dist, sUp, trajectory) <= reachH) sUp += LANE_STEP_YD;
    let sLow = dist;
    while (sLow > sUp && ctx.heightYd(dist, sLow, trajectory) <= reachH) sLow -= LANE_STEP_YD;
    let minSep = NO_DEFENDER_YD, minLane = NO_DEFENDER_YD, laneAlong = 0, nearest = -1, nearX = 0, nearY = 0;
    for (let d = first; d < first + SLOTS_PER_TEAM && d < SLOT_COUNT; d++) {
      const e = view.entity(d);
      if (e === null) continue;
      const react = arrive < p['judge.defenderReactS'] ? arrive : p['judge.defenderReactS'];
      const ex = e.px + e.velPx * react, ey = e.py + e.velPy * react;
      const d0 = hyp(ax - e.px, ay - e.py);
      const toward = d0 > 0 ? (e.velPx * (ax - e.px) + e.velPy * (ay - e.py)) / d0 : 0;
      const lag = p['judge.accelLagS'] * (1 - clip(toward / defSpeed, 0, 1));
      const run = arrive - react - lag;
      const sep = hyp(ax - ex, ay - ey) - defSpeed * (run > 0 ? run : 0);
      if (sep < minSep) { minSep = sep; nearest = d; nearX = ex; nearY = ey; }
      // The throw lane: an underneath defender between him and the catch point.
      const along = (ex - qx) * lineX + (ey - qy) * lineY;
      if (along > p['judge.laneNearYd'] && along < under) {
        let clear = NO_DEFENDER_YD;
        if (along <= sUp || along >= sLow) {
          // The ball passes him low: he needs only a step and a hand.
          const perp = (ex - qx) * lineY - (ey - qy) * lineX;
          const tPass = releaseInS + flight * (along / dist);
          clear = (perp < 0 ? -perp : perp) - p['judge.laneReachYps'] * (tPass > react ? tPass - react : 0);
        } else if (sLow < under) {
          // It goes over him, and comes down inside his reach short of the catch: he can break on it and meet it there.
          const mx = qx + lineX * sLow, my = qy + lineY * sLow, tMeet = releaseInS + flight * (sLow / dist) - react - lag;
          clear = hyp(mx - ex, my - ey) - defSpeed * (tMeet > 0 ? tMeet : 0);
        }
        if (clear < minLane) { minLane = clear; laneAlong = along; }
      }
    }

    // Step 3: his estimate of the separation, with his error.
    let sepEst = nearest < 0 ? NO_DEFENDER_YD : (minSep > 0 ? minSep : 0) + noiseYd;
    if (sepEst < 0) sepEst = 0;

    const blocked = minLane < p['judge.laneRadiusYd'] ? clip(1 - minLane / p['judge.laneRadiusYd'], 0, 1) : 0;
    let position: DefenderPosition = 'inPhase', defAlong = 0;
    if (nearest >= 0) {
      defAlong = (nearX - qx) * lineX + (nearY - qy) * lineY;
      const defPerp = (nearX - qx) * lineY - (nearY - qy) * lineX, tol = p['judge.positionTolYd'];
      if (defAlong < dist - tol && (defPerp < 0 ? -defPerp : defPerp) < p['judge.undercutLateralYd']) position = 'undercut';
      else if ((nearX - ax) * dirX + (nearY - ay) * dirY < -tol) position = 'trail';
    }

    // Step 5: the catch-point model's shape.
    const air = ax > 0 ? ax : 0;
    const radius = ctx.catchPoint.catchRadiusYd(0, false) + p['judge.reachAdjustYd'], sd = ctx.accuracySdYd(air);
    const catchable = insideRadiusShare(radius, sd, ctx.math), placement = expectedPlacementError(radius, sd);
    let pHat: number, iHat: number;
    // A defender can play any ball that comes down inside his reach (the catch-point stage gives him the same radius),
    // so that is the separation at which the throw stops being open. Judging it open down to one yard had him throw
    // deep balls he read as uncovered into two defenders in five.
    if (nearest >= 0 && sepEst <= radius) {
      const probs = ctx.catchPoint.contestedProbabilities({
        zContestedCatch: target.zContestedCatch ?? 0, zBallSkills: 0, position, ballLocated: position !== 'trail', placementError: placement, hitAtCatch: false, wet: ctx.wet,
      });
      pHat = catchable * probs[0]!;
      iHat = catchable * probs[2]! + (1 - catchable) * p['judge.missPickContested'];
    } else {
      pHat = catchable * ctx.catchPoint.uncontestedCatchProbability({ zHands: target.zHands ?? 0, placementError: placement, hitAtCatch: false, wet: ctx.wet });
      iHat = (1 - catchable) * p['judge.missPickOpen'];
    }
    pHat *= 1 - blocked;
    iHat = iHat * (1 - blocked) + blocked * p['judge.lanePickShare'];

    // Step 6: value.
    const openYd = sepEst < NO_DEFENDER_YD ? sepEst : p['judge.yacMaxYd'];
    let yac = p['judge.yacBaseYd'] + p['judge.yacPerSepYd'] * openYd;
    if (yac > p['judge.yacMaxYd']) yac = p['judge.yacMaxYd'];
    s.yards = ax + yac;
    // A ball that is neither caught nor intercepted costs the down. Without that cost a covered deep throw (one
    // chance in four for 25 yards) rated above the threshold, and he threw it.
    const pInc = 1 - pHat - iHat;
    s.v = pHat * ctx.value.yards(s.yards) - iHat * ctx.value.turnoverCost - (pInc > 0 ? pInc : 0) * (ctx.value.incompleteCost ?? 0);
    if (alert && nearest >= 0 && ax - nearX >= p['judge.alertLeadYd']) s.v += p['judge.alertBonusEp'];
    s.ax = ax; s.ay = ay; s.dirX = dirX; s.dirY = dirY; s.dist = dist; s.flight = flight; s.arrive = arrive; s.sepEst = sepEst;
    s.minLane = minLane; s.laneAlong = laneAlong; s.blocked = blocked; s.nearest = nearest; s.nearX = nearX; s.nearY = nearY;
    s.position = position; s.pHat = pHat; s.iHat = iHat; s.defAlong = defAlong;
  };

  let best = shotA;
  shoot('firm', best);
  let trajectory: Trajectory = 'firm';
  // J7.6.1 candidates by rule, each judged whole against the firm throw.
  if (best.blocked > 0 && best.dist - best.laneAlong >= p['throw.touchRoomYd']) {
    shoot('touch', shotB);
    if (shotB.v > best.v) { best = shotB; trajectory = 'touch'; }
  } else if (best.nearest >= 0 && best.defAlong > best.dist + p['judge.positionTolYd'] && best.sepEst < p['throw.driveSepYd']) {
    shoot('drive', shotB);
    if (shotB.v > best.v) { best = shotB; trajectory = 'drive'; }
  }

  out.trajectory = trajectory; out.yards = best.yards; out.v = best.v;
  out.pHat = best.pHat; out.iHat = best.iHat; out.sepYd = best.sepEst; out.laneClearYd = best.minLane; out.aimPx = best.ax; out.aimPy = best.ay;
  out.distYd = best.dist; out.airYd = best.ax > 0 ? best.ax : 0;
  out.arriveS = best.arrive; out.nearestDefender = best.nearest; out.defenderPosition = best.position; out.dirPx = best.dirX; out.dirPy = best.dirY;
  out.ok = ctx.allowOutOfRange || best.dist <= ctx.maxRangeYd;
  out.outOfRange = !out.ok;
  return out;
}

/** The module's stand-in for the N2 value model: yards are worth a flat rate, and reaching the line to gain on a late down earns a bonus. */
export function standInValue(p: QbParams, down: number | null, toGoYd: number | null): QbValueModel {
  const bonus = down !== null && toGoYd !== null && down >= p['value.conversionDownFrom'] ? p['value.conversionBonusEp'] : 0;
  const perYd = p['value.epPerYd'];
  return {
    yards: (gain) => perYd * gain + (toGoYd !== null && gain >= toGoYd ? bonus : 0),
    turnoverCost: p['value.turnoverCostEp'],
    incompleteCost: p['value.incompleteCostEp'],
  };
}
