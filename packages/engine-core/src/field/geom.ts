// J1.5.1 geometry helpers. Pure, deterministic and allocation-free: results are numbers, or are
// written into an array the caller owns. Queries over all 22 players are brute force (J1.5.1).
import { SLOT_COUNT, type SimArrays } from '@gm/schema';
import { dAtan2, dSqrt, PI, TWO_PI } from '../dmath.ts';

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  return dSqrt(dx * dx + dy * dy);
}

/** Angle of the line from a to b, radians, 0 along +x, counter-clockwise. Coincident points give 0. */
export function bearing(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return 0;
  return dAtan2(dy, dx);
}

/** Wraps an angle into (-pi, pi]. */
export function wrapAngle(a: number): number {
  let r = a;
  while (r > PI) r -= TWO_PI;
  while (r <= -PI) r += TWO_PI;
  return r;
}

/** Signed angle from a heading to the direction of a target, in (-pi, pi]. Positive is counter-clockwise. */
export function relativeAngle(headingRad: number, fromX: number, fromY: number, toX: number, toY: number): number {
  if (fromX === toX && fromY === toY) return 0;
  return wrapAngle(bearing(fromX, fromY, toX, toY) - headingRad);
}

export type Leverage = 'inside' | 'outside' | 'headUp';
export type Cushion = 'over' | 'under';

/** J1.5.1: lateral leverage of a defender on a receiver, by play-frame py relative to the ball (py 0). */
export function leverage(defenderPy: number, receiverPy: number, toleranceYd: number): Leverage {
  const d = defenderPy - receiverPy;
  if (d <= toleranceYd && d >= -toleranceYd) return 'headUp';
  // The ball is at py 0: inside is the side of the receiver nearer the ball.
  if (receiverPy === 0) return 'outside';
  return (d < 0) === (receiverPy > 0) ? 'inside' : 'outside';
}

/** J1.5.1: over (deeper than the receiver, he has a cushion) or under, by play-frame px. */
export function cushion(defenderPx: number, receiverPx: number): Cushion {
  return defenderPx >= receiverPx ? 'over' : 'under';
}

/**
 * J1.5.1: earliest time at which a pursuer moving at `speed` in a straight line can meet a target
 * that keeps its current velocity. Returns -1 when no intercept exists (the target is as fast or
 * faster and has the angle).
 */
export function timeToIntercept(px: number, py: number, speed: number, tx: number, ty: number, tvx: number, tvy: number): number {
  const rx = tx - px, ry = ty - py;
  const c = rx * rx + ry * ry;
  if (c === 0) return 0;
  const a = tvx * tvx + tvy * tvy - speed * speed;
  const b = 2 * (rx * tvx + ry * tvy);
  if (a === 0) return b < 0 ? -c / b : -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const root = dSqrt(disc);
  const t1 = (-b - root) / (2 * a), t2 = (-b + root) / (2 * a);
  const lo = t1 < t2 ? t1 : t2, hi = t1 < t2 ? t2 : t1;
  if (lo > 0) return lo;
  return hi > 0 ? hi : -1;
}

/**
 * J1.5.1 `nearest(k, point, filter)`: writes up to k slots, nearest first, into `out` and returns
 * how many were written. `mask[slot]` is 1 for a candidate (the caller builds the filter: team,
 * eligible, unengaged). Ties go to the lower slot.
 */
export function nearest(players: SimArrays, x: number, y: number, mask: Uint8Array, k: number, out: Int16Array, outDistSq: Float64Array): number {
  let n = 0;
  for (let s = 0; s < SLOT_COUNT; s++) {
    if (mask[s] !== 1) continue;
    const dx = players.posX[s]! - x, dy = players.posY[s]! - y;
    const d2 = dx * dx + dy * dy;
    let i = n;
    if (n < k) n++; else if (d2 >= outDistSq[k - 1]!) continue; else i = k - 1;
    while (i > 0 && outDistSq[i - 1]! > d2) { out[i] = out[i - 1]!; outDistSq[i] = outDistSq[i - 1]!; i--; }
    out[i] = s; outDistSq[i] = d2;
  }
  return n;
}

/** A landmark-bounded rectangle in the play frame (J1.5.1 `inZone`). */
export interface ZoneRect { readonly minPx: number; readonly maxPx: number; readonly minPy: number; readonly maxPy: number }

export function inRect(px: number, py: number, z: ZoneRect): boolean {
  return px >= z.minPx && px <= z.maxPx && py >= z.minPy && py <= z.maxPy;
}

/** Point in polygon by crossing count. `xs` and `ys` are the vertices in order; an edge point counts as inside or outside consistently. */
export function inPolygon(px: number, py: number, xs: ArrayLike<number>, ys: ArrayLike<number>): boolean {
  let inside = false;
  const n = xs.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = xs[i]!, yi = ys[i]!, xj = xs[j]!, yj = ys[j]!;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** J1.5.1 `gapBetween`: writes [width, centreX, centreY] into `out`. Width is between body circles, never negative. */
export function gapBetween(ax: number, ay: number, ra: number, bx: number, by: number, rb: number, out: Float64Array): void {
  const w = dist(ax, ay, bx, by) - ra - rb;
  out[0] = w > 0 ? w : 0;
  out[1] = (ax + bx) * 0.5;
  out[2] = (ay + by) * 0.5;
}

/**
 * J1.5.1 `helpNearby`: unengaged, upright teammates of `defenderSlot` within `radiusYd` of him who
 * are in front of the carrier (further along the direction the carrier attacks). `team[slot]` is the
 * side index per slot; `downCode` is the MOVE_MODES code of 'down'.
 */
export function helpNearby(players: SimArrays, team: ArrayLike<number>, defenderSlot: number, carrierSlot: number, radiusYd: number, downCode: number): number {
  const dx0 = players.posX[defenderSlot]!, dy0 = players.posY[defenderSlot]!;
  const cx = players.posX[carrierSlot]!, dir = players.attackDir[carrierSlot]!;
  const r2 = radiusYd * radiusYd;
  let n = 0;
  for (let s = 0; s < SLOT_COUNT; s++) {
    if (s === defenderSlot || team[s] !== team[defenderSlot]) continue;
    if (players.engagement[s]! >= 0 || players.moveMode[s] === downCode) continue;
    if ((players.posX[s]! - cx) * dir <= 0) continue;
    const dx = players.posX[s]! - dx0, dy = players.posY[s]! - dy0;
    if (dx * dx + dy * dy <= r2) n++;
  }
  return n;
}
