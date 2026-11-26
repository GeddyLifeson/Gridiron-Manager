// J9.1.1 pass set-up from the parameter file, and J9.1.2 snaps and exchanges.
import { dSqrt } from '../dmath.ts';
import type { FlightLaunch } from './stage.ts';
import { FLIGHT_DT_S, solvePass, type PassSolution, type TrajectoryType, type Wind } from './flight.ts';
import { DEG, GRAVITY_YPS2, type BallParams } from './params.ts';

/**
 * Solves a pass from a release point at the J9.1.1 release height to an aim point at catch height,
 * with the module's angle limits and blend. `k` is the pass drag already scaled for air density.
 */
export function solvePassFrom(
  fromX: number, fromY: number, toX: number, toY: number, speedYps: number, type: TrajectoryType, k: number, wind: Wind, p: BallParams,
): PassSolution {
  return solvePass({
    fromX, fromY, fromH: p['pass.releaseHeightYd']!, toX, toY, toH: p['pass.catchHeightYd']!, speedYps, type, k, wind,
    minLaunchRad: p['pass.minLaunchDeg']! * DEG, maxLaunchRad: p['pass.maxLaunchDeg']! * DEG,
    firmBlend: p['pass.firmBlend']!, touchMaxRad: p['pass.touchMaxDeg']! * DEG,
  });
}

/** The launch for a solved pass. */
export function passLaunch(fromX: number, fromY: number, s: PassSolution, p: BallParams): FlightLaunch {
  return { x: fromX, y: fromY, h: p['pass.releaseHeightYd']!, vx: s.vx, vy: s.vy, vh: s.vh };
}

/**
 * A shotgun snap travels flat at 15 yd/s to the receiver's hands (J9.1.2): a 5 yd snap takes about
 * 0.35 s. Returns the launch from the ball's spot and the travel time. Under-centre snaps are exchanges.
 */
export function shotgunSnap(fromX: number, fromY: number, toX: number, toY: number, p: BallParams): { launch: FlightLaunch; timeS: number } {
  const dx = toX - fromX, dy = toY - fromY, d = dSqrt(dx * dx + dy * dy);
  const v = p['snap.shotgunSpeedYps']!, h = p['snap.handHeightYd']!;
  const ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 0;
  const timeS = d / v;
  // Leaves and arrives at hand height. The flight integrator (semi-implicit Euler, step dt) after n
  // steps has fallen g dt^2 n (n + 1) / 2, so vh = g dt (n + 1) / 2 with n = t / dt lands it on the hands.
  const vh = (GRAVITY_YPS2 * FLIGHT_DT_S * (timeS / FLIGHT_DT_S + 1)) / 2;
  return { launch: { x: fromX, y: fromY, h, vx: ux * v, vy: uy * v, vh }, timeS };
}

/** A handoff is possible when both players are within `exchange.handoffRangeYd`; it lasts `exchange.handoffTicks` (J9.1.2). */
export function handoffWindow(distYd: number, p: BallParams): { possible: boolean; ticks: number } {
  return { possible: distYd <= p['exchange.handoffRangeYd']!, ticks: p['exchange.handoffTicks']! };
}
