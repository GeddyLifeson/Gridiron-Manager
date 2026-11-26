// J2.2: from true drill values to movement parameters. The sprint pair (vMax, tau) is fitted against
// the engine's own discrete update at the engine's sub-step, not against the closed form, so drill
// reproduction carries no integration bias (J2.2.1 step 2). Runs at content build time or at the
// snap, never inside the tick.
import { SUBSTEPS, TICK_S, type MovementParams, type SimPlayer } from '@gm/schema';
import { bodyRadiusYd } from '../field/geometry.ts';
import type { FieldParams } from '../field/params.ts';
import type { KinParams } from './params.ts';

/** Drill distances of J2.2.1: the forty and its ten-yard split. Definitions of the drill, not tuning. */
export const FORTY_YD = 40;
export const SPLIT_YD = 10;
const BISECTIONS = 60;

/**
 * Distance covered from rest after `tS` seconds by the discrete forward update of J2.1.1 with a top
 * speed of 1: `v += (1 - v) / tau * dt; x += v * dt`. Distance scales linearly with top speed. A time
 * between two sub-steps is interpolated linearly, as boundary events are (J1.3.1).
 */
export function unitSprintDistance(tauS: number, dtS: number, tS: number): number {
  let v = 0, x = 0, t = 0;
  while (t + dtS <= tS) { v += ((1 - v) / tauS) * dtS; x += v * dtS; t += dtS; }
  const rest = tS - t;
  if (rest > 0) { v += ((1 - v) / tauS) * dtS; x += v * rest; }
  return x;
}

/** Time at which the discrete update reaches `distanceYd` from rest, interpolated inside the sub-step. */
export function sprintTimeS(vMaxYps: number, tauS: number, dtS: number, distanceYd: number): number {
  let v = 0, x = 0, t = 0;
  for (;;) {
    v += ((vMaxYps - v) / tauS) * dtS;
    const nx = x + v * dtS;
    if (nx >= distanceYd) return t + (dtS * (distanceYd - x)) / (nx - x);
    x = nx; t += dtS;
  }
}

export interface SprintFit { readonly vMaxYps: number; readonly tauS: number; readonly converged: boolean }

/**
 * J2.2.1 step 2: solve for the (vMax, tau) whose simulated forty and split both match, by bisection
 * on tau. The returned vMax is the drill value: no pads factor. `converged` is false when the split
 * ratio is outside what the model can produce; the nearest end of the bracket is returned.
 */
export function fitSprint(fortyS: number, tenSplitS: number, p: KinParams, dtS: number = TICK_S / SUBSTEPS): SprintFit {
  // For a given tau the forty fixes vMax; the split then misses by this much. Falls as tau rises.
  const miss = (tau: number) => (FORTY_YD * unitSprintDistance(tau, dtS, tenSplitS)) / unitSprintDistance(tau, dtS, fortyS) - SPLIT_YD;
  let lo = p.tauMinS!, hi = p.tauMaxS!;
  const mLo = miss(lo), mHi = miss(hi);
  let converged = true;
  if (mLo < 0) { hi = lo; converged = false; } else if (mHi > 0) { lo = hi; converged = false; }
  else for (let i = 0; i < BISECTIONS; i++) { const mid = (lo + hi) / 2; if (miss(mid) > 0) lo = mid; else hi = mid; }
  const tauS = (lo + hi) / 2;
  return { vMaxYps: FORTY_YD / unitSprintDistance(tauS, dtS, fortyS), tauS, converged };
}

export interface MovementFit { readonly movement: MovementParams; readonly sprintConverged: boolean; readonly clamped: boolean }

/** The change-of-direction z that a lateral limit stands for (inverse of the J2.2.2 grade form). */
export function codZOf(m: MovementParams, p: KinParams): number {
  return (m.aLatYps2 - p.aLatBaseYps2!) / p.aLatPerZYps2!;
}

/**
 * J2.2.1 and J2.2.2: a player's movement parameters for game movement (pads factor applied).
 * `codZ` is his change-of-direction z: by default the standard score in his position profile
 * (D2.2.2), or the value `fitChangeOfDirectionZ` found from his shuttle. Out-of-range results are
 * clamped and flagged for the content log (J2.2.1 step 3).
 */
export function movementParams(player: SimPlayer, p: KinParams, fp: FieldParams, codZ: number = player.tests.changeOfDirectionZ, dtS: number = TICK_S / SUBSTEPS): MovementFit {
  const fit = fitSprint(player.tests.fortyS, player.tests.tenSplitS, p, dtS);
  let clamped = false;
  const clamp = (v: number, lo: number, hi: number) => { if (v < lo) { clamped = true; return lo; } if (v > hi) { clamped = true; return hi; } return v; };
  const vMaxYps = clamp(fit.vMaxYps * p.padsFactor!, p.vMaxSanityMinYps!, p.vMaxSanityMaxYps!);
  const aLatYps2 = clamp(p.aLatBaseYps2! + p.aLatPerZYps2! * codZ, p.aLatMinYps2!, p.aLatMaxYps2!);
  const aBrakeYps2 = p.aBrakeBaseYps2! + p.aBrakePerZYps2! * ((aLatYps2 - p.aLatBaseYps2!) / p.aLatPerZYps2!);
  return {
    movement: { vMaxYps, tauS: fit.tauS, aLatYps2, aBrakeYps2, bodyRadiusYd: bodyRadiusYd(player.weightLb, fp) },
    sprintConverged: fit.converged, clamped,
  };
}

/** J2.1.3: planted-cut speed multiplier for a turn of `angleRad` (0 to pi), with the change-of-direction offset. */
export function cutMultiplier(angleRad: number, codZ: number, p: KinParams, pi: number): number {
  const quarter = pi / 4;
  const a = angleRad < 0 ? -angleRad : angleRad;
  const seg = a >= pi ? 3 : Math.floor(a / quarter);
  const knots = [1, p.cut45!, p.cut90!, p.cut135!, p.cut180!];
  const f = a >= pi ? 1 : (a - seg * quarter) / quarter;
  const c = knots[seg]! + (knots[seg + 1]! - knots[seg]!) * f + p.cutPerZ! * codZ;
  return c > 1 ? 1 : c < 0 ? 0 : c;
}
