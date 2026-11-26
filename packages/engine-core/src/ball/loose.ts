// J9.2.1 deflections and J9.3.1 bounces and rolls. Pure functions over a mutable `AirState` and a
// caller-supplied `ball` stream (J13.2.1, scope [game, play, flightIndex]). Each function documents a
// fixed number of raw draws, so a bounce never shifts a later draw by taking a different path.
import { possible, type Environment, type RandomStream } from '@gm/schema';
import { dAtan2, dCos, dSin, dSqrt, logistic } from '../dmath.ts';
import type { AirState } from './flight.ts';
import { DEG, GRAVITY_YPS2, type BallParams } from './params.ts';

// --- J9.2.1 batted and tipped passes ---------------------------------------------------------------

/** Chance a blocked rusher who sees the release raises his hands: `logistic(b0 + b1 * z_batting)`. */
export function handsUpChance(zBatting: number, p: BallParams): number {
  return logistic(p['bat.handsUpBeta0']! + p['bat.handsUpBeta1']! * zBatting);
}

/**
 * Chance a defender at the line bats the pass: `b0 * handsUp * laneOverlap`, and zero when the ball
 * passes above his reach. `handsUp` is 0 or 1 (the hands-up draw already made); `laneOverlap` is 0 to 1.
 */
export function batChance(handsUp: number, laneOverlap: number, ballHeightYd: number, reachYd: number, p: BallParams): number {
  if (ballHeightYd > reachYd) return 0; // out of reach: physically impossible, so no floor (A3.1 ruling 22)
  const o = laneOverlap < 0 ? 0 : laneOverlap > 1 ? 1 : laneOverlap;
  return possible(p['bat.b0']! * handsUp * o);
}

/**
 * Lane overlap of a defender with the early flight path (J9.2.1): 1 when the path passes straight over
 * him, falling linearly to 0 at `bat.laneRadiusYd`. Only the first `bat.windowYd` of horizontal travel
 * counts. Returns the overlap and the ball's height at the closest point. Pure geometry, no draw.
 */
export function batLane(
  fromX: number, fromY: number, fromH: number, vx: number, vy: number, vh: number,
  defX: number, defY: number, p: BallParams,
): { overlap: number; heightYd: number } {
  const vxy = dSqrt(vx * vx + vy * vy);
  if (vxy === 0) return { overlap: 0, heightYd: fromH };
  const ux = vx / vxy, uy = vy / vxy;
  let along = (defX - fromX) * ux + (defY - fromY) * uy;
  const win = p['bat.windowYd']!;
  if (along < 0 || along > win) return { overlap: 0, heightYd: fromH };
  const px = fromX + ux * along, py = fromY + uy * along;
  const off = dSqrt((defX - px) * (defX - px) + (defY - py) * (defY - py));
  // Height over that short distance: drag is negligible over 4 yd, so the vacuum arc is used here only.
  const t = along / vxy;
  const heightYd = fromH + vh * t - (GRAVITY_YPS2 * t * t) / 2;
  along = 1 - off / p['bat.laneRadiusYd']!;
  return { overlap: along < 0 ? 0 : along, heightYd };
}

/**
 * A deflection: speed times a uniform 0.3 to 0.7, direction turned by up to 60 degrees either way, and
 * an upward kick (J9.2.1). The ball stays a forward pass in flight. Draws: 3 uniforms (6 raw).
 */
export function deflect(s: AirState, rng: RandomStream, p: BallParams): void {
  const uSpeed = rng.uniform(), uAngle = rng.uniform(), uUp = rng.uniform();
  const vxy = dSqrt(s.vx * s.vx + s.vy * s.vy);
  const mult = p['deflect.speedMin']! + uSpeed * (p['deflect.speedMax']! - p['deflect.speedMin']!);
  const turn = (uAngle * 2 - 1) * p['deflect.angleMaxDeg']! * DEG;
  const dir = dAtan2(s.vy, s.vx) + turn;
  const sp = vxy * mult;
  s.vx = sp * dCos(dir);
  s.vy = sp * dSin(dir);
  s.vh = (s.vh > 0 ? s.vh * mult : 0) + p['deflect.upMinYps']! + uUp * (p['deflect.upMaxYps']! - p['deflect.upMinYps']!);
}

// --- J9.3.1 bounces and rolls ----------------------------------------------------------------------

/** What shapes one ground contact. */
export interface BounceContext {
  /** Artificial turf keeps more forward speed than grass (J9.3.1). */
  readonly artificial: boolean;
  /** Wet surface: lower rebound. */
  readonly wet: boolean;
  /** The ball arrived in a spiral (a pass, or a spiral punt). Tumbling balls scatter more. */
  readonly spiral: boolean;
  /** Punt bounce bias from the punter's technique, -1 (back or sideways) to +1 (forward) (J9.3.1, J9.5.2). */
  readonly bias: number;
  /** Onside "high hop": the first contact rebounds high (J9.6.2). */
  readonly highHop: boolean;
}

/** Surface facts the bounce needs, read from the environment (J12). */
export function surfaceOf(env: Environment): { artificial: boolean; wet: boolean } {
  const c = env.surfaceCondition;
  return {
    // Contract gap: the environment carries a surface content id, not a kind. Ids naming a synthetic
    // surface are treated as artificial until J12 supplies a derived flag (contract request CR-16-1).
    artificial: /turf|artificial|synthetic/i.test(env.surfaceType),
    wet: c === 'wet' || c === 'damp' || c === 'soft' || c === 'snow_covered' || env.precip !== 'none',
  };
}

/**
 * One ground contact (J9.3.1), applied to a ball at height 0 moving down. Forward speed is multiplied
 * by a uniform 0.2 to 0.8 (shifted up on turf and by the punt bias, and negative means it kicks back),
 * direction is turned by a normal draw (sd 25 degrees tumbling, 12 for a spiral landing at a shallow
 * angle), and the ball rebounds with 0.1 to 0.6 of its incoming vertical speed (lower when wet).
 * Draws: uniform, normal, uniform (8 raw).
 */
export function bounce(s: AirState, ctx: BounceContext, rng: RandomStream, p: BallParams): void {
  const uRetain = rng.uniform(), nDir = rng.normal(), uRebound = rng.uniform();
  const vxy = dSqrt(s.vx * s.vx + s.vy * s.vy);
  const landing = dAtan2(-s.vh, vxy);
  const sd = (ctx.spiral && landing < p['bounce.shallowDeg']! * DEG ? p['bounce.sdSpiralDeg']! : p['bounce.sdTumbleDeg']!) * DEG;
  let retain = p['bounce.retainMin']! + uRetain * (p['bounce.retainMax']! - p['bounce.retainMin']!);
  if (ctx.artificial) retain += p['bounce.artificialRetainShift']!;
  retain += ctx.bias * p['bounce.biasGain']!;
  const cap = p['bounce.retainMax']!;
  if (retain > cap) retain = cap;
  if (retain < -cap) retain = -cap;
  const dir = dAtan2(s.vy, s.vx) + nDir * sd;
  const sp = vxy * retain;
  s.vx = sp * dCos(dir);
  s.vy = sp * dSin(dir);
  let reb = ctx.highHop
    ? p['bounce.onsideHopRebound']!
    : p['bounce.reboundMin']! + uRebound * (p['bounce.reboundMax']! - p['bounce.reboundMin']!);
  if (ctx.wet) reb *= p['bounce.wetReboundMult']!;
  s.vh = -s.vh * reb;
  s.h = 0;
}

/** True when the loose ball should stop bouncing and roll (J9.3.1): after the bounce limit or when slow. */
export function shouldRoll(bounces: number, s: AirState, p: BallParams): boolean {
  return bounces >= p['bounce.maxBounces']! || dSqrt(s.vx * s.vx + s.vy * s.vy) < p['bounce.rollBelowYps']!;
}

/** One rolling step: on the ground, decelerating at `bounce.rollDecelYps2` until it stops. Returns true at rest. */
export function roll(s: AirState, dt: number, p: BallParams): boolean {
  s.h = 0; s.vh = 0;
  const sp = dSqrt(s.vx * s.vx + s.vy * s.vy);
  if (sp === 0) return true;
  const next = sp - p['bounce.rollDecelYps2']! * dt;
  if (next <= 0) {
    // Stops inside the step: travel the remaining stopping distance.
    const d = (sp * sp) / (2 * p['bounce.rollDecelYps2']!);
    s.x += (s.vx / sp) * d; s.y += (s.vy / sp) * d;
    s.vx = 0; s.vy = 0;
    return true;
  }
  const f = next / sp;
  s.vx *= f; s.vy *= f;
  s.x += s.vx * dt; s.y += s.vy * dt;
  return false;
}
