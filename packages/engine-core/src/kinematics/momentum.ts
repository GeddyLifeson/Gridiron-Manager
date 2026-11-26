// J2.6.1 momentum at contact: three context numbers for J6.6, J6.7 and J10. Computed once at the
// first tick of contact from field-frame velocities. They do not move bodies.
import { dCos, dSin, dSqrt, PI } from '../dmath.ts';
import type { KinParams } from './params.ts';

export interface ContactNumbers {
  /** Relative speed along the line between the two players, yd/s. Positive when closing. */
  closingSpeedYps: number;
  /** Carrier's weight times his speed toward the defender, over the defender's toward the carrier. */
  momentumRatio: number;
  /** Reduced mass times closing speed squared over the typical tackle's, times `hitEnergyScale`: 1.0 = a league-typical open-field tackle. */
  hitEnergy: number;
  /** The hit player's gaze was more than the blindside angle away from the hitter. */
  blindside: boolean;
}

export function contactNumbers(
  carrierX: number, carrierY: number, carrierVx: number, carrierVy: number, carrierLb: number, carrierGazeRad: number,
  defX: number, defY: number, defVx: number, defVy: number, defLb: number,
  p: KinParams, out: ContactNumbers,
): ContactNumbers {
  let lx = defX - carrierX, ly = defY - carrierY;
  const d = dSqrt(lx * lx + ly * ly);
  if (d > 0) { lx /= d; ly /= d; } else { lx = 1; ly = 0; }
  const carrierToward = carrierVx * lx + carrierVy * ly;
  const defToward = -(defVx * lx + defVy * ly);
  const closing = carrierToward + defToward;
  out.closingSpeedYps = closing;
  const defMomentum = defLb * (defToward > 0 ? defToward : 0), carrierMomentum = carrierLb * (carrierToward > 0 ? carrierToward : 0);
  // A defender with no speed toward the carrier gives a ratio with no upper bound; report it as the carrier's momentum over one unit.
  out.momentumRatio = defMomentum > 0 ? carrierMomentum / defMomentum : carrierMomentum;
  const reduced = (carrierLb * defLb) / (carrierLb + defLb);
  const typical = p.typicalReducedLb! * p.typicalClosingYps! * p.typicalClosingYps!;
  out.hitEnergy = closing > 0 ? ((reduced * closing * closing) / typical) * p.hitEnergyScale! : 0;
  out.blindside = dCos(carrierGazeRad) * lx + dSin(carrierGazeRad) * ly < dCos((p.blindsideDeg! * PI) / 180);
  return out;
}
