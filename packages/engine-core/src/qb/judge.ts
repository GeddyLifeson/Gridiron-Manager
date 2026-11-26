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
import { clip, expectedPlacementError, flightTimeEstimateS, insideRadiusShare } from './formulas.ts';
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
  /** A Hail Mary or free play is thrown even past his range. */
  allowOutOfRange: boolean;
}

/** One estimate (J7.3.1 outputs). Reused: the stage keeps one per read and writes into it. */
export interface Estimate {
  /** False when there is nothing to judge: the receiver is unseen with no route to trust, or the throw is out of range. */
  ok: boolean;
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
    ok: false, pHat: 0, iHat: 0, yards: 0, v: 0, sepYd: 0, laneClearYd: 0, aimPx: 0, aimPy: 0, distYd: 0, airYd: 0, arriveS: 0,
    trajectory: 'firm', nearestDefender: -1, defenderPosition: 'inPhase', seen: false, broken: true, toBreakS: 0, dirPx: 1, dirPy: 0,
  };
}

const NO_DEFENDER_YD = 99;
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

/**
 * J7.3.1 steps 1 to 6 for one receiver. `noiseYd` is his separation error for this look (drawn once per
 * look by the stage from stream `qb`); `alert` adds the I2.5.1 bonus when the receiver has won deep.
 */
export function judgeTarget(view: PerceivedView, target: QbTarget, ctx: JudgeContext, noiseYd: number, alert: boolean, out: Estimate): Estimate {
  const p = ctx.p, math = ctx.math, route = target.route;
  const qx = view.self.px, qy = view.self.py;
  const rec = view.entity(target.slot);
  out.ok = false; out.seen = rec !== null; out.nearestDefender = -1; out.defenderPosition = 'inPhase'; out.trajectory = 'firm';

  // Step 1: where the receiver is now, as he sees it, or where the design says he should be.
  let rx: number, ry: number, speed: number, vx = 0, vy = 0;
  if (rec) {
    rx = rec.px; ry = rec.py; vx = rec.velPx; vy = rec.velPy; speed = hyp(vx, vy);
  } else if (route.length >= 2) {
    projectAlongRoute(route, target.settles, route[0]!.px, route[0]!.py, p['judge.routeSpeedYps'] * (view.tSinceSnapS > 0 ? view.tSinceSnapS : 0), proj);
    rx = proj[0]!; ry = proj[1]!; speed = p['judge.routeSpeedYps'];
  } else return out;
  const onRoute = route.length >= 2;
  if (onRoute && speed < p['judge.movingYps']) speed = p['judge.routeSpeedYps'];

  const toBreak = onRoute ? distanceToBreak(route, target.breakIndex, rx, ry) : 0;
  out.broken = toBreak <= 0;
  out.toBreakS = toBreak > 0 ? toBreak / speed : 0;

  // Arrival time and point: release plus flight to where he will be then (fixed-point, three passes).
  const firmV = ctx.vBallYps * p['judge.flightSpeedShare'];
  let ax = rx, ay = ry, dirX = 1, dirY = 0, dist = hyp(rx - qx, ry - qy);
  let flight = flightTimeEstimateS(dist, firmV, ctx.dragPerYd, math), arrive = ctx.releaseS + flight;
  for (let k = 0; k < 3; k++) {
    if (onRoute) {
      projectAlongRoute(route, target.settles, rx, ry, speed * arrive, proj);
      ax = proj[0]!; ay = proj[1]!; dirX = proj[2]!; dirY = proj[3]!;
    } else {
      ax = rx + vx * arrive; ay = ry + vy * arrive;
      if (speed > 0) { dirX = vx / speed; dirY = vy / speed; }
    }
    dist = hyp(ax - qx, ay - qy);
    flight = flightTimeEstimateS(dist, firmV, ctx.dragPerYd, math);
    arrive = ctx.releaseS + flight;
  }

  // Steps 2 to 4: every defender he is watching, projected to the catch point and to the throw lane.
  const first = view.selfSlot < SLOTS_PER_TEAM ? SLOTS_PER_TEAM : 0;
  const defSpeed = p['judge.defenderSpeedYps'], lineX = dist > 0 ? (ax - qx) / dist : 1, lineY = dist > 0 ? (ay - qy) / dist : 0;
  let minSep = NO_DEFENDER_YD, minLane = NO_DEFENDER_YD, laneAlong = 0, nearest = -1, nearX = 0, nearY = 0;
  for (let d = first; d < first + SLOTS_PER_TEAM && d < SLOT_COUNT; d++) {
    const e = view.entity(d);
    if (e === null) continue;
    const react = arrive < p['judge.defenderReactS'] ? arrive : p['judge.defenderReactS'];
    const ex = e.px + e.velPx * react, ey = e.py + e.velPy * react;
    const d0 = hyp(ax - e.px, ay - e.py);
    const toward = d0 > 0 ? (e.velPx * (ax - e.px) + e.velPy * (ay - e.py)) / d0 : 0;
    const run = arrive - react - p['judge.accelLagS'] * (1 - clip(toward / defSpeed, 0, 1));
    const sep = hyp(ax - ex, ay - ey) - defSpeed * (run > 0 ? run : 0);
    if (sep < minSep) { minSep = sep; nearest = d; nearX = ex; nearY = ey; }
    // The throw lane: an underneath defender between him and the catch point.
    const along = (ex - qx) * lineX + (ey - qy) * lineY;
    if (along > p['judge.laneNearYd'] && along < dist - p['judge.laneUnderYd']) {
      const perp = (ex - qx) * lineY - (ey - qy) * lineX;
      const tPass = ctx.releaseS + flightTimeEstimateS(along, firmV, ctx.dragPerYd, math);
      const clear = (perp < 0 ? -perp : perp) - p['judge.laneReachYps'] * (tPass > react ? tPass - react : 0);
      if (clear < minLane) { minLane = clear; laneAlong = along; }
    }
  }

  // Step 3: his estimate of the separation, with his error.
  let sepEst = nearest < 0 ? NO_DEFENDER_YD : (minSep > 0 ? minSep : 0) + noiseYd;
  if (sepEst < 0) sepEst = 0;

  // J7.6.1 trajectory by rule: touch over an underneath defender with room behind him, drive when a
  // defender is closing from depth. Each changes how long the defenders get.
  let blocked = minLane < p['judge.laneRadiusYd'] ? clip(1 - minLane / p['judge.laneRadiusYd'], 0, 1) : 0;
  let position: DefenderPosition = 'inPhase';
  if (nearest >= 0) {
    const defAlong = (nearX - qx) * lineX + (nearY - qy) * lineY, defPerp = (nearX - qx) * lineY - (nearY - qy) * lineX;
    const tol = p['judge.positionTolYd'];
    if (defAlong < dist - tol && (defPerp < 0 ? -defPerp : defPerp) < p['judge.undercutLateralYd']) position = 'undercut';
    else if ((nearX - ax) * dirX + (nearY - ay) * dirY < -tol) position = 'trail';
    if (blocked > 0 && dist - laneAlong >= p['throw.touchRoomYd']) {
      out.trajectory = 'touch';
      const extra = flight * (p['judge.touchTimeMult'] - 1);
      blocked = 0; flight += extra; arrive += extra;
      if (nearest >= 0 && sepEst < NO_DEFENDER_YD) { sepEst -= defSpeed * extra; if (sepEst < 0) sepEst = 0; }
    } else if (defAlong > dist + tol && sepEst < p['throw.driveSepYd']) {
      out.trajectory = 'drive';
      const fast = flightTimeEstimateS(dist, ctx.vBallYps * p['judge.driveSpeedShare'], ctx.dragPerYd, math);
      sepEst += defSpeed * (flight - fast); arrive -= flight - fast; flight = fast;
    }
  }

  // Step 5: the catch-point model's shape.
  const air = ax > 0 ? ax : 0;
  const radius = ctx.catchPoint.catchRadiusYd(0, false) + p['judge.reachAdjustYd'], sd = ctx.accuracySdYd(air);
  const catchable = insideRadiusShare(radius, sd, math), placement = expectedPlacementError(radius, sd);
  let pHat: number, iHat: number;
  if (nearest >= 0 && ctx.catchPoint.isContested(sepEst)) {
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
  out.yards = ax + yac;
  out.v = pHat * ctx.value.yards(out.yards) - iHat * ctx.value.turnoverCost;
  if (alert && nearest >= 0 && ax - nearX >= p['judge.alertLeadYd']) out.v += p['judge.alertBonusEp'];

  out.pHat = pHat; out.iHat = iHat; out.sepYd = sepEst; out.laneClearYd = minLane; out.aimPx = ax; out.aimPy = ay; out.distYd = dist; out.airYd = air;
  out.arriveS = arrive; out.nearestDefender = nearest; out.defenderPosition = position; out.dirPx = dirX; out.dirPy = dirY;
  out.ok = ctx.allowOutOfRange || dist <= ctx.maxRangeYd;
  return out;
}

/** The module's stand-in for the N2 value model: yards are worth a flat rate, and reaching the line to gain on a late down earns a bonus. */
export function standInValue(p: QbParams, down: number | null, toGoYd: number | null): QbValueModel {
  const bonus = down !== null && toGoYd !== null && down >= p['value.conversionDownFrom'] ? p['value.conversionBonusEp'] : 0;
  const perYd = p['value.epPerYd'];
  return {
    yards: (gain) => perYd * gain + (toGoYd !== null && gain >= toGoYd ? bonus : 0),
    turnoverCost: p['value.turnoverCostEp'],
  };
}
