// J2.5 steering: turns a path or a pursuit into the target point the movement update needs.
// Path following is purely geometric; whether the player runs the right path is J4's business.
import {
  SLOT_COUNT, type FieldGeometry, type Intent, type MoveMode, type PlayFrame, type TickWorld,
} from '@gm/schema';
import { dAtan2, PI } from '../dmath.ts';
import { timeToIntercept } from '../field/geom.ts';
import { kinParams, type KinParams } from './params.ts';
import { codZOf, cutMultiplier } from './movement-params.ts';
import type { Movement } from './update.ts';

export const MAX_WAYPOINTS = 16;
const K_THROUGH = 0, K_CUT = 1, K_SETTLE = 2;
const KIND_CODE = { through: K_THROUGH, cut: K_CUT, settle: K_SETTLE } as const;

export interface Waypoint { readonly px: number; readonly py: number; readonly kind: 'through' | 'cut' | 'settle' }
interface MutablePoint { px: number; py: number }

export interface PathFollower {
  /**
   * Gives a slot a path in the play frame. A waypoint outside the field is clipped inside by the
   * clip margin (J2.5.1 edge case). Call between ticks; it does the trigonometry of each cut once.
   */
  setPath(world: TickWorld, slot: number, path: readonly Waypoint[], moveMode?: MoveMode): void;
  clearPath(slot: number): void;
  /** Index of the waypoint the slot is running to; equal to the path length when the path is finished. */
  waypointIndex(slot: number): number;
  /** Writes the slot's intent for this tick. Returns false when the slot has no path or has finished it. */
  steer(world: TickWorld, slot: number): boolean;
}

function clipToField(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

export function createPathFollower(movement: Movement): PathFollower {
  const n = SLOT_COUNT * MAX_WAYPOINTS;
  const wx = new Float64Array(n), wy = new Float64Array(n), cutSpeedFrac = new Float64Array(n);
  const startX = new Float64Array(SLOT_COUNT), startY = new Float64Array(SLOT_COUNT);
  const kind = new Uint8Array(n), len = new Uint8Array(SLOT_COUNT), at = new Uint8Array(SLOT_COUNT);
  const modes: MoveMode[] = new Array<MoveMode>(SLOT_COUNT).fill('sprint');
  const targets: MutablePoint[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) targets.push({ px: 0, py: 0 });
  let P: KinParams | null = null;

  const toPlayX = (f: PlayFrame, x: number) => (x - f.originX) * f.attackDir;
  const toPlayY = (f: PlayFrame, y: number) => (y - f.originY) * f.attackDir;

  return {
    setPath(w: TickWorld, slot: number, path: readonly Waypoint[], moveMode: MoveMode = 'sprint'): void {
      if (path.length > MAX_WAYPOINTS) throw new Error(`a path holds at most ${MAX_WAYPOINTS} waypoints`);
      const p = P ?? (P = kinParams(w.params)), f = w.frame, g: FieldGeometry = w.geometry, base = slot * MAX_WAYPOINTS;
      const m = p.waypointClipYd!, z = codZOf(w.slots[slot]!.movement, p);
      let prevX = toPlayX(f, w.players.posX[slot]!), prevY = toPlayY(f, w.players.posY[slot]!);
      startX[slot] = prevX; startY[slot] = prevY;
      for (let i = 0; i < path.length; i++) {
        const fx = clipToField(f.originX + path[i]!.px * f.attackDir, m, g.lengthYd - m);
        const fy = clipToField(f.originY + path[i]!.py * f.attackDir, m, g.widthYd - m);
        wx[base + i] = toPlayX(f, fx); wy[base + i] = toPlayY(f, fy);
        kind[base + i] = KIND_CODE[path[i]!.kind];
      }
      for (let i = 0; i < path.length; i++) {
        cutSpeedFrac[base + i] = 1;
        if (kind[base + i] === K_CUT && i + 1 < path.length) {
          const ax = wx[base + i]! - prevX, ay = wy[base + i]! - prevY;
          const bx = wx[base + i + 1]! - wx[base + i]!, by = wy[base + i + 1]! - wy[base + i]!;
          const angle = dAtan2(ax * by - ay * bx, ax * bx + ay * by);
          cutSpeedFrac[base + i] = cutMultiplier(angle, z, p, PI);
        }
        prevX = wx[base + i]!; prevY = wy[base + i]!;
      }
      len[slot] = path.length; at[slot] = 0; modes[slot] = moveMode;
      movement.cancelCut(slot);
    },
    clearPath(slot: number): void { len[slot] = 0; at[slot] = 0; movement.cancelCut(slot); },
    waypointIndex: (slot) => at[slot]!,
    steer(w: TickWorld, slot: number): boolean {
      const p = P ?? (P = kinParams(w.params));
      const f = w.frame, base = slot * MAX_WAYPOINTS, m = w.slots[slot]!.movement;
      const px = toPlayX(f, w.players.posX[slot]!), py = toPlayY(f, w.players.posY[slot]!);
      const intent: Intent = w.intents[slot]!;
      // A planned cut made by the movement update since the last decision: the break point is behind him.
      if (movement.takeCutDone(slot) && at[slot]! < len[slot]!) at[slot] = at[slot]! + 1;
      while (at[slot]! < len[slot]!) {
        const i = base + at[slot]!, k = kind[i]!;
        const dx = wx[i]! - px, dy = wy[i]! - py, d = Math.sqrt(dx * dx + dy * dy);
        // Passed when inside the radius, or when the waypoint is no longer ahead along the leg into it.
        const fromX = at[slot]! > 0 ? wx[i - 1]! : startX[slot]!, fromY = at[slot]! > 0 ? wy[i - 1]! : startY[slot]!;
        const behind = dx * (wx[i]! - fromX) + dy * (wy[i]! - fromY) <= 0 && (wx[i] !== fromX || wy[i] !== fromY);
        const last = at[slot]! + 1 >= len[slot]!;
        if (k === K_SETTLE || (k !== K_CUT && last && !behind && d >= p.throughRadiusYd!)) {
          // A settle waypoint is an arrival; so is running to the last waypoint of a path.
          if (k === K_SETTLE && d < p.reachedRadiusYd!) { at[slot] = at[slot]! + 1; continue; }
          targets[slot]!.px = wx[i]!; targets[slot]!.py = wy[i]!;
          intent.target = targets[slot]!; intent.arrival = k === K_SETTLE ? 'arrive' : 'through';
          intent.effort = 1; intent.moveMode = modes[slot]!;
          return true;
        }
        // The movement update makes a planned cut itself, inside the sub-step he reaches the point.
        // Reaching it here means he missed that (he was pushed off his line): he plants where he is.
        const reached = k === K_CUT ? d < p.reachedRadiusYd! || behind : d < p.throughRadiusYd! || behind;
        if (reached) {
          if (k === K_CUT) { movement.cancelCut(slot); movement.requestCut(slot, m.vMaxYps * cutSpeedFrac[i]!); }
          at[slot] = at[slot]! + 1;
          continue;
        }
        targets[slot]!.px = wx[i]!; targets[slot]!.py = wy[i]!;
        intent.target = targets[slot]!; intent.arrival = 'through'; intent.moveMode = modes[slot]!;
        intent.effort = 1;
        // J2.1.3: brake to the cut speed at the break point, plant, and leave toward the next waypoint.
        if (k === K_CUT && !last) movement.planCut(slot, m.vMaxYps * cutSpeedFrac[i]!, wx[i + 1]!, wy[i + 1]!);
        return true;
      }
      return false;
    },
  };
}

const MODE_CODES: Readonly<Record<MoveMode, number>> = { stance: 0, sprint: 1, run: 2, backpedal: 3, shuffle: 4, engaged: 5, down: 6 };

/**
 * J2.5.2: aim point of a pursuer. `aim = lerp(target now, ideal intercept point, q)` with
 * `q = 0.6 + 0.12 * zPursuit`, clipped to 0.2 to 1.0. Inputs are the target as the pursuer perceives
 * it (J3), in any one frame; the aim is written to `out` as [x, y]. Returns false when no intercept
 * exists: the aim is then the target's present position, and J4's leverage rule decides where to push him.
 */
export function pursuitAim(px: number, py: number, speedYps: number, tx: number, ty: number, tvx: number, tvy: number, zPursuit: number, p: KinParams, out: Float64Array): boolean {
  const t = timeToIntercept(px, py, speedYps, tx, ty, tvx, tvy);
  if (t < 0) { out[0] = tx; out[1] = ty; return false; }
  let q = p.pursuitQBase! + p.pursuitQPerZ! * zPursuit;
  q = q < p.pursuitQMin! ? p.pursuitQMin! : q > p.pursuitQMax! ? p.pursuitQMax! : q;
  out[0] = tx + tvx * t * q; out[1] = ty + tvy * t * q;
  return true;
}

/** J2.5.3 pick delay: `clip(0.25 - 0.05 * z + 0.08 * u, 0.1, 0.4)` s. `u` is one standard normal from the `contest` stream, type `pick`. */
export function pickDelayS(z: number, u: number, p: KinParams): number {
  const d = p.pickDelayBaseS! - p.pickDelayPerZS! * z + p.pickDelayNoiseS! * u;
  return d < p.pickDelayMinS! ? p.pickDelayMinS! : d > p.pickDelayMaxS! ? p.pickDelayMaxS! : d;
}
