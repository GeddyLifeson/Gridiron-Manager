// J9.1.1 and J9.7.1: the ball in the air. One integrator serves passes, snaps, kicks and loose balls:
// gravity plus one drag term proportional to the square of the AIR-RELATIVE speed, so headwind loss,
// tailwind gain and crosswind drift come out of the physics with no special case (J9.7.1).
//
// The tick stage and every solver step with the same function and the same sub-step length
// (TICK_S / SUBSTEPS), so the point a solver predicts is the point the stage reaches, to rounding.
// Field frame, yards, seconds (J1.2.1). Height is the only third dimension (J1.1.1).
import { SUBSTEPS, TICK_S, type Environment } from '@gm/schema';
import { dAtan2, dCos, dSin, dSqrt } from '../dmath.ts';
import { DEG, GRAVITY_YPS2, MPH_TO_YPS } from './params.ts';

/** The step every flight uses: one engine move sub-step. */
export const FLIGHT_DT_S = TICK_S / SUBSTEPS;
/** Solvers give up on a flight longer than this. Structural: no football kick hangs 12 s. */
const MAX_FLIGHT_S = 12;
const MAX_STEPS = MAX_FLIGHT_S / FLIGHT_DT_S;

/** Mutable point-mass state of the ball. */
export interface AirState { x: number; y: number; h: number; vx: number; vy: number; vh: number }

/** Horizontal wind at field level, yd/s, the direction the air moves toward. */
export interface Wind { readonly x: number; readonly y: number }
export const NO_WIND: Wind = { x: 0, y: 0 };

export function airState(x: number, y: number, h: number, vx: number, vy: number, vh: number): AirState {
  return { x, y, h, vx, vy, vh };
}

export function copyAir(from: AirState, to: AirState): AirState {
  to.x = from.x; to.y = from.y; to.h = from.h; to.vx = from.vx; to.vy = from.vy; to.vh = from.vh;
  return to;
}

/**
 * Steady wind vector from the environment (J12.1.1). Closed and fixed roofs have none (J9.7.1 edge case).
 * `windDirDeg` is where the wind blows toward, counter-clockwise from +x (contract decision D-12).
 */
export function windFromEnvironment(env: Environment): Wind {
  if (env.roof !== 'open' || env.windMph === 0) return NO_WIND;
  const s = env.windMph * MPH_TO_YPS, a = env.windDirDeg * DEG;
  return { x: s * dCos(a), y: s * dSin(a) };
}

/** Aim-error multiplier from gusts (J9.7.1): `1 + gain * gustMph`, outdoors only. */
export function gustAimMultiplier(env: Environment, gain: number): number {
  return env.roof === 'open' ? 1 + gain * env.gustMph : 1;
}

/** Drag coefficient scaled by the air-density ratio J12 derives from temperature and altitude (J12.4.2, J12.7.1). */
export function airDrag(kPerYd: number, env: Environment): number {
  return kPerYd * env.derived.airDensity;
}

/**
 * One semi-implicit Euler step: acceleration from the current velocity, then position from the new
 * velocity. `k` is in 1/yd (drag acceleration = k * |v_air|^2).
 */
export function stepAir(s: AirState, dt: number, k: number, wind: Wind): void {
  const rx = s.vx - wind.x, ry = s.vy - wind.y, rz = s.vh;
  const kd = k * dSqrt(rx * rx + ry * ry + rz * rz);
  s.vx -= kd * rx * dt;
  s.vy -= kd * ry * dt;
  s.vh -= (kd * rz + GRAVITY_YPS2) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.h += s.vh * dt;
}

/** Where and when a flight reached a target height on the way down. */
export interface Arrival {
  readonly t: number;
  readonly x: number; readonly y: number; readonly h: number;
  readonly vx: number; readonly vy: number; readonly vh: number;
}

const scratchPrev = airState(0, 0, 0, 0, 0, 0);

/**
 * Flies `s` (mutated) until it descends through `targetH`, and returns the interpolated arrival, or null
 * if it never does within the solver limit. A ball already below the target and rising first climbs.
 */
export function flyToHeight(s: AirState, k: number, wind: Wind, targetH: number): Arrival | null {
  for (let i = 0; i < MAX_STEPS; i++) {
    copyAir(s, scratchPrev);
    stepAir(s, FLIGHT_DT_S, k, wind);
    if (s.vh < 0 && scratchPrev.h > targetH && s.h <= targetH) {
      const f = (scratchPrev.h - targetH) / (scratchPrev.h - s.h);
      return interp(scratchPrev, s, f, (i + f) * FLIGHT_DT_S);
    }
  }
  return null;
}

/**
 * Flies `s` until its x reaches `planeX` (either direction) or it falls to the ground first. Returns the
 * state at the plane, or null when the ball landed short of it.
 */
export function flyToPlaneX(s: AirState, k: number, wind: Wind, planeX: number): Arrival | null {
  const side = s.x < planeX ? 1 : -1;
  for (let i = 0; i < MAX_STEPS; i++) {
    copyAir(s, scratchPrev);
    stepAir(s, FLIGHT_DT_S, k, wind);
    if ((s.x - planeX) * side >= 0) {
      const f = (planeX - scratchPrev.x) / (s.x - scratchPrev.x);
      const a = interp(scratchPrev, s, f, (i + f) * FLIGHT_DT_S);
      return a.h < 0 ? null : a;
    }
    if (s.h <= 0 && s.vh < 0) return null;
  }
  return null;
}

function interp(a: AirState, b: AirState, f: number, t: number): Arrival {
  return {
    t,
    x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: a.h + (b.h - a.h) * f,
    vx: a.vx + (b.vx - a.vx) * f, vy: a.vy + (b.vy - a.vy) * f, vh: a.vh + (b.vh - a.vh) * f,
  };
}

// ---------------------------------------------------------------------------------------------------
// J9.1.1 pass solver

export type TrajectoryType = 'drive' | 'firm' | 'touch';

export interface PassSolveInput {
  readonly fromX: number; readonly fromY: number; readonly fromH: number;
  /** The aim point with J7.6.2's error already applied. */
  readonly toX: number; readonly toY: number; readonly toH: number;
  /** Release speed from J7.6.1, yd/s. */
  readonly speedYps: number;
  readonly type: TrajectoryType;
  /** Drag, already scaled for air density. */
  readonly k: number;
  /** Wind the solver assumes. The quarterback's own allowance; the flight itself always feels the real wind. */
  readonly wind: Wind;
  readonly minLaunchRad: number;
  readonly maxLaunchRad: number;
  readonly firmBlend: number;
  /** Touch throws launch no higher than this; above it they take speed off instead (J9.1.1 sanity times). */
  readonly touchMaxRad: number;
}

export interface PassSolution {
  /** False when the aim point is beyond the arm's range: the ball is underthrown to the limit (J9.1.1). */
  readonly inRange: boolean;
  readonly launchRad: number;
  readonly speedYps: number;
  readonly vx: number; readonly vy: number; readonly vh: number;
  readonly flightTimeS: number;
  readonly arrival: Arrival;
}

const GOLDEN = 0.6180339887498949;
const SEARCH_ITER = 48;

/**
 * Finds the launch that lands the ball at the aim point at catch height (J9.1.1): drive is the low
 * angle solution at full speed, touch the high one, and firm aims at an angle `firmBlend` of the way
 * from drive to touch and takes speed off until it lands on the point. Iteration counts are fixed, so
 * the solver is deterministic on every platform (J13).
 */
export function solvePass(inp: PassSolveInput): PassSolution {
  const dx = inp.toX - inp.fromX, dy = inp.toY - inp.fromY;
  const dist = dSqrt(dx * dx + dy * dy);
  const ux = dist > 0 ? dx / dist : 1, uy = dist > 0 ? dy / dist : 0;
  const range = (theta: number, v: number): number => {
    const a = launchArrival(inp, ux, uy, theta, v);
    return a === null ? -1 : (a.x - inp.fromX) * ux + (a.y - inp.fromY) * uy;
  };

  // Angle of maximum range at full speed (golden-section search; range is single-peaked in angle).
  let lo = inp.minLaunchRad, hi = inp.maxLaunchRad;
  for (let i = 0; i < SEARCH_ITER; i++) {
    const a = hi - (hi - lo) * GOLDEN, b = lo + (hi - lo) * GOLDEN;
    if (range(a, inp.speedYps) < range(b, inp.speedYps)) lo = a; else hi = b;
  }
  const thetaMax = (lo + hi) / 2;
  if (range(thetaMax, inp.speedYps) < dist) return finish(inp, ux, uy, thetaMax, inp.speedYps, false);

  const low = range(inp.minLaunchRad, inp.speedYps) >= dist
    ? null // too close even at the flattest angle: drive then takes speed off at that angle
    : bisect((t) => range(t, inp.speedYps) - dist, inp.minLaunchRad, thetaMax);
  const highSolution = range(inp.maxLaunchRad, inp.speedYps) >= dist
    ? inp.maxLaunchRad
    : bisect((t) => dist - range(t, inp.speedYps), thetaMax, inp.maxLaunchRad);
  const lowAngle = low ?? inp.minLaunchRad;
  // The touch angle: the high solution, capped; never flatter than the drive angle.
  let high = highSolution < inp.touchMaxRad ? highSolution : inp.touchMaxRad;
  if (high < lowAngle) high = lowAngle;

  if (inp.type === 'touch') {
    const h = high;
    if (range(h, inp.speedYps) > dist) return finish(inp, ux, uy, h, bisect((v) => range(h, v) - dist, 0, inp.speedYps), true);
    return finish(inp, ux, uy, h, inp.speedYps, true);
  }
  if (inp.type === 'drive') {
    if (low === null) return finish(inp, ux, uy, lowAngle, bisect((v) => range(lowAngle, v) - dist, 0, inp.speedYps), true);
    return finish(inp, ux, uy, lowAngle, inp.speedYps, true);
  }
  const firm = lowAngle + inp.firmBlend * (high - lowAngle);
  return finish(inp, ux, uy, firm, bisect((v) => range(firm, v) - dist, 0, inp.speedYps), true);
}

/** Root of an increasing function on [a, b] by bisection, fixed iteration count. */
function bisect(f: (x: number) => number, a: number, b: number): number {
  let lo = a, hi = b;
  for (let i = 0; i < SEARCH_ITER; i++) {
    const m = (lo + hi) / 2;
    if (f(m) < 0) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

const scratchFlight = airState(0, 0, 0, 0, 0, 0);

function launchArrival(inp: PassSolveInput, ux: number, uy: number, theta: number, v: number): Arrival | null {
  const c = dCos(theta), s = dSin(theta);
  scratchFlight.x = inp.fromX; scratchFlight.y = inp.fromY; scratchFlight.h = inp.fromH;
  scratchFlight.vx = v * c * ux; scratchFlight.vy = v * c * uy; scratchFlight.vh = v * s;
  return flyToHeight(scratchFlight, inp.k, inp.wind, inp.toH);
}

function finish(inp: PassSolveInput, ux: number, uy: number, theta: number, v: number, inRange: boolean): PassSolution {
  const c = dCos(theta), s = dSin(theta);
  const arrival = launchArrival(inp, ux, uy, theta, v);
  if (arrival === null) throw new Error('solvePass: the chosen launch never reaches catch height');
  return { inRange, launchRad: theta, speedYps: v, vx: v * c * ux, vy: v * c * uy, vh: v * s, flightTimeS: arrival.t, arrival };
}

// ---------------------------------------------------------------------------------------------------
// Kick launch solvers (J9.4.2, J9.5.1, J9.6.1)

/**
 * Launch speed at a fixed angle so that, in still air at neutral density, the ball comes down through
 * `atH` at horizontal distance `carryYd` from the start. This turns J9.4.2's drawn carry into a real
 * flight, so wind and air density then act on it through the drag term.
 */
export function speedForCarry(carryYd: number, launchRad: number, startH: number, atH: number, k: number): number {
  const c = dCos(launchRad), s = dSin(launchRad);
  const carry = (v: number): number => {
    scratchFlight.x = 0; scratchFlight.y = 0; scratchFlight.h = startH;
    scratchFlight.vx = v * c; scratchFlight.vy = 0; scratchFlight.vh = v * s;
    const a = flyToHeight(scratchFlight, k, NO_WIND, atH);
    return a === null ? 0 : a.x;
  };
  return bisect((v) => carry(v) - carryYd, 0, MAX_KICK_SPEED_YPS);
}
/** Upper bound for the speed search. Structural: far above any kick (about 30 yd/s off a pro foot). */
const MAX_KICK_SPEED_YPS = 80;

/**
 * Horizontal and vertical launch speed so the ball lands (height 0) `distYd` away after `hangS` in still
 * air at neutral density (J9.5.1 punts, J9.6.1 kickoffs). Fixed-point iteration from the vacuum answer.
 */
export function launchForDistanceAndHang(distYd: number, hangS: number, startH: number, k: number): { horizontal: number; vertical: number } {
  let vxy = distYd / hangS;
  let vh = (GRAVITY_YPS2 * hangS) / 2 - startH / hangS;
  for (let i = 0; i < SEARCH_ITER; i++) {
    scratchFlight.x = 0; scratchFlight.y = 0; scratchFlight.h = startH;
    scratchFlight.vx = vxy; scratchFlight.vy = 0; scratchFlight.vh = vh;
    const a = flyToHeight(scratchFlight, k, NO_WIND, 0);
    if (a === null || a.x <= 0) break;
    vxy *= distYd / a.x;
    vh += (GRAVITY_YPS2 * (hangS - a.t)) / 2;
  }
  return { horizontal: vxy, vertical: vh };
}

/** Bearing of a horizontal velocity, radians, field frame. */
export function headingOf(vx: number, vy: number): number {
  return dAtan2(vy, vx);
}
