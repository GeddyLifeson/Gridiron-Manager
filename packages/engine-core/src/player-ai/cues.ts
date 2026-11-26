// What a player notices that could pull him off his job (K1.3.1 rule 1, K1.3.2, K1.3.3, K1.7.5).
// Every function reads the `PerceivedView` it is handed and nothing else: there is no import of the
// world or of true state in this file, so a cue cannot fire on something the player has not
// perceived (K1.6.1). Slots 0 to 10 snapped the ball (J1.2.2).
import { SLOTS_PER_TEAM, SLOT_COUNT, type PerceivedEntity, type PerceivedView } from '@gm/schema';
import { dCos, dSin } from '../dmath.ts';
import type { PlayerAiParams } from './params.ts';

/** A cue's result, reused (P6.3.1): the opponent it is about and the point to drive on, play frame. */
export interface Cue { slot: number; px: number; py: number; eyes: boolean; lastLine: boolean; extra: number }
export function newCue(): Cue { return { slot: -1, px: 0, py: 0, eyes: false, lastLine: false, extra: 0 }; }

const abs = (v: number): number => (v < 0 ? -v : v);
export function distTo(view: PerceivedView, px: number, py: number): number {
  const dx = view.self.px - px, dy = view.self.py - py;
  return Math.sqrt(dx * dx + dy * dy);
}
function gap(a: PerceivedEntity, b: PerceivedEntity): number { const dx = a.px - b.px, dy = a.py - b.py; return Math.sqrt(dx * dx + dy * dy); }
function isReceiver(view: PerceivedView, slot: number): boolean { return view.receiverNumber(slot) > 0; }
function lead(e: PerceivedEntity, s: number, cue: Cue): void { cue.slot = e.slot; cue.px = e.px + e.velPx * s; cue.py = e.py + e.velPy * s; }

/** Where a perceived player is looking, when the view can tell (J3.4.2). Optional in the contract's view. */
type Gazing = PerceivedView & { gazeOf?(slot: number): number | null };

/** True when the quarterback is seen looking at the entity, inside the cone whose cosine is `eyesCos`. */
function qbEyesOn(view: PerceivedView, qbSlot: number, e: PerceivedEntity, p: PlayerAiParams): boolean {
  if (qbSlot < 0) return false;
  const qb = view.entity(qbSlot), gaze = (view as Gazing).gazeOf?.(qbSlot) ?? null;
  if (qb === null || gaze === null) return false;
  const dx = e.px - qb.px, dy = e.py - qb.py, d = Math.sqrt(dx * dx + dy * dy);
  return d > 0 && (dx * dCos(gaze) + dy * dSin(gaze)) / d > p.eyesCos;
}

/** No teammate is seen deeper than he is: he is the last line (K1.3.1 edge case, "even gamblers know where they are"). */
export function isLastLine(view: PerceivedView): boolean {
  const own = view.selfSlot < SLOTS_PER_TEAM ? 0 : SLOTS_PER_TEAM;
  for (let s = own; s < own + SLOTS_PER_TEAM; s++) {
    if (s === view.selfSlot) continue;
    const e = view.entity(s);
    if (e !== null && e.px > view.self.px) return false;
  }
  return true;
}

/**
 * A receiver near him has turned across the field (K1.3.1: jump an out-breaking or in-breaking
 * route; with `inFront`, undercut a crosser running shallower than him). The drive point leads the
 * receiver by the jump lead time.
 */
export function receiverBreaking(view: PerceivedView, qbSlot: number, inFront: boolean, p: PlayerAiParams, cue: Cue): boolean {
  let best: PerceivedEntity | null = null, bestD = p.jumpRangeYd;
  for (let s = 0; s < SLOTS_PER_TEAM; s++) {
    if (!isReceiver(view, s)) continue;
    const e = view.entity(s);
    if (e === null) continue;
    const lat = abs(e.velPy);
    if (lat < p.breakLatYps || lat <= abs(e.velPx)) continue;
    if (inFront && (e.px >= view.self.px || view.self.px - e.px > p.undercutDepthYd)) continue;
    const d = distTo(view, e.px, e.py);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best === null) return false;
  lead(best, p.jumpLeadS, cue);
  cue.eyes = qbEyesOn(view, qbSlot, best, p);
  return true;
}

/** The nearest receiver within jump range, breaking or not (the `jump` error primitive and the film tell). */
export function nearestReceiver(view: PerceivedView, rangeYd: number, p: PlayerAiParams, cue: Cue): boolean {
  let best: PerceivedEntity | null = null, bestD = rangeYd;
  for (let s = 0; s < SLOTS_PER_TEAM; s++) {
    if (!isReceiver(view, s)) continue;
    const e = view.entity(s);
    if (e === null) continue;
    const d = distTo(view, e.px, e.py);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best === null) return false;
  lead(best, p.jumpLeadS, cue);
  return true;
}

/** K1.7.5 rule 4: a receiver running free deep with no teammate seen near him. */
export function uncoveredDeep(view: PerceivedView, p: PlayerAiParams, cue: Cue): boolean {
  let best: PerceivedEntity | null = null, bestD = p.rescueReachYd;
  for (let s = 0; s < SLOTS_PER_TEAM; s++) {
    if (!isReceiver(view, s)) continue;
    const e = view.entity(s);
    if (e === null || e.px < p.rescueDeepYd) continue;
    const d = distTo(view, e.px, e.py);
    if (d >= bestD || d <= p.rescueOpenYd) continue;
    let covered = false;
    for (let t = SLOTS_PER_TEAM; t < SLOT_COUNT && !covered; t++) {
      if (t === view.selfSlot) continue;
      const mate = view.entity(t);
      if (mate !== null && gap(mate, e) <= p.rescueOpenYd) covered = true;
    }
    if (!covered) { best = e; bestD = d; }
  }
  if (best === null) return false;
  lead(best, p.jumpLeadS, cue);
  return true;
}

function isRusher(e: PerceivedEntity, p: PlayerAiParams): boolean { return e.px < p.backfieldDepthYd && e.velPx < 0; }

/** K1.7.5: his own rusher is handled by a teammate and another rusher is coming free. */
export function freeRusher(view: PerceivedView, p: PlayerAiParams, cue: Cue): boolean {
  let mine: PerceivedEntity | null = null, mineD = Infinity;
  for (let s = SLOTS_PER_TEAM; s < SLOT_COUNT; s++) {
    const e = view.entity(s);
    if (e === null || !isRusher(e, p)) continue;
    const d = distTo(view, e.px, e.py);
    if (d < mineD) { mine = e; mineD = d; }
  }
  if (mine === null || !blockedByMate(view, mine, p)) return false;
  let best: PerceivedEntity | null = null, bestD = p.freeRusherYd;
  for (let s = SLOTS_PER_TEAM; s < SLOT_COUNT; s++) {
    const e = view.entity(s);
    if (e === null || e === mine || !isRusher(e, p) || blockedByMate(view, e, p)) continue;
    const d = distTo(view, e.px, e.py);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best === null) return false;
  lead(best, 0, cue);
  return true;
}
function blockedByMate(view: PerceivedView, rusher: PerceivedEntity, p: PlayerAiParams): boolean {
  for (let s = 0; s < SLOTS_PER_TEAM; s++) {
    if (s === view.selfSlot) continue;
    const mate = view.entity(s);
    if (mate !== null && gap(mate, rusher) <= p.blockedWithinYd) return true;
  }
  return false;
}

/** K1.3.1: shoot a gap out of a run fit. He reads run and sees the ball in the backfield within reach. */
export function ballInBackfield(view: PerceivedView, rangeYd: number, p: PlayerAiParams, cue: Cue): boolean {
  const b = view.ball();
  if (b === null || b.px >= p.backfieldDepthYd || distTo(view, b.px, b.py) > rangeYd) return false;
  cue.slot = view.believedCarrierSlot(); cue.px = b.px + b.velPx * p.jumpLeadS; cue.py = b.py + b.velPy * p.jumpLeadS;
  return true;
}

/** The man he believes has the ball is an opponent within `rangeYd`. */
export function carrierWithin(view: PerceivedView, rangeYd: number, cue: Cue): boolean {
  const c = view.believedCarrierSlot();
  if (c < 0 || c === view.selfSlot || (c < SLOTS_PER_TEAM) === (view.selfSlot < SLOTS_PER_TEAM)) return false;
  const e = view.entity(c);
  if (e === null || distTo(view, e.px, e.py) > rangeYd) return false;
  lead(e, 0, cue);
  return true;
}

/**
 * K1.3.3, defender: the ball is in the air, a receiver within reach has got behind him. `cue.lastLine`
 * says whether he sees nobody of his own deeper than the receiver, so the catch is likely a touchdown.
 */
export function beatenDeep(view: PerceivedView, p: PlayerAiParams, cue: Cue): boolean {
  let best: PerceivedEntity | null = null, bestD = p.foulReachYd;
  for (let s = 0; s < SLOTS_PER_TEAM; s++) {
    if (!isReceiver(view, s)) continue;
    const e = view.entity(s);
    if (e === null || e.px - view.self.px < p.foulBeatenYd) continue;
    const d = distTo(view, e.px, e.py);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best === null) return false;
  lead(best, 0, cue);
  cue.lastLine = true;
  for (let t = SLOTS_PER_TEAM; t < SLOT_COUNT; t++) {
    if (t === view.selfSlot) continue;
    const mate = view.entity(t);
    if (mate !== null && mate.px > best.px) { cue.lastLine = false; break; }
  }
  return true;
}

/** K1.3.3, blocker: a rusher within reach has got past him toward the passer. */
export function beatenBlocker(view: PerceivedView, p: PlayerAiParams, cue: Cue): boolean {
  let best: PerceivedEntity | null = null, bestD = p.foulReachYd;
  for (let s = SLOTS_PER_TEAM; s < SLOT_COUNT; s++) {
    const e = view.entity(s);
    if (e === null || view.self.px - e.px < p.foulBeatenYd) continue;
    const d = distTo(view, e.px, e.py);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best === null) return false;
  lead(best, 0, cue);
  return true;
}

/** K1.3.2 rule 2: he is in a hole of a zone: nobody within the hole radius, at least two defenders within twice that. */
export function inZoneHole(view: PerceivedView, p: PlayerAiParams): boolean {
  if (view.self.px < p.adjustMinDepthYd) return false;
  let near = 0;
  for (let s = SLOTS_PER_TEAM; s < SLOT_COUNT; s++) {
    const e = view.entity(s);
    if (e === null) continue;
    const d = distTo(view, e.px, e.py);
    if (d < p.holeRadiusYd) return false;
    if (d < 2 * p.holeRadiusYd) near++;
  }
  return near >= 2;
}

/** J4.5.2 temptation: 2.0 when the ball is within reach in front of him and his job takes him away from it. */
export function temptationSeen(view: PerceivedView, hasTarget: boolean, tx: number, ty: number, p: PlayerAiParams): number {
  const b = view.ball();
  if (b === null || !hasTarget) return 1;
  const bx = b.px - view.self.px, by = b.py - view.self.py;
  if (Math.sqrt(bx * bx + by * by) > p.temptationNearYd) return 1;
  return bx * (tx - view.self.px) + by * (ty - view.self.py) < 0 ? p.temptationNear : 1;
}

/** K1.7.2: bodies he sees within the traffic distance of the straight line to his target. */
export function trafficOnPath(view: PerceivedView, tx: number, ty: number, p: PlayerAiParams): number {
  const ax = view.self.px, ay = view.self.py, dx = tx - ax, dy = ty - ay, len2 = dx * dx + dy * dy;
  let n = 0;
  for (let s = 0; s < SLOT_COUNT; s++) {
    if (s === view.selfSlot) continue;
    const e = view.entity(s);
    if (e === null) continue;
    let t = len2 > 0 ? ((e.px - ax) * dx + (e.py - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = e.px - (ax + t * dx), ey = e.py - (ay + t * dy);
    if (ex * ex + ey * ey <= p.accidentTrafficYd * p.accidentTrafficYd) n++;
  }
  return n;
}

/** The `wrongMan` primitive: the opponent he sees second nearest to the spot his job sends him to. */
export function secondNearestOpponent(view: PerceivedView, tx: number, ty: number, cue: Cue): boolean {
  const start = view.selfSlot < SLOTS_PER_TEAM ? SLOTS_PER_TEAM : 0;
  let first: PerceivedEntity | null = null, second: PerceivedEntity | null = null, d1 = Infinity, d2 = Infinity;
  for (let s = start; s < start + SLOTS_PER_TEAM; s++) {
    const e = view.entity(s);
    if (e === null) continue;
    const dx = e.px - tx, dy = e.py - ty, d = dx * dx + dy * dy;
    if (d < d1) { second = first; d2 = d1; first = e; d1 = d; } else if (d < d2) { second = e; d2 = d; }
  }
  if (second === null) return false;
  lead(second, 0, cue);
  return true;
}

/** The `chaseFake` primitive: the nearest backfield player he sees who is not the man he believes has the ball. */
export function backfieldDecoy(view: PerceivedView, cue: Cue): boolean {
  const carrier = view.believedCarrierSlot();
  let best: PerceivedEntity | null = null, bestD = Infinity;
  for (let s = 0; s < SLOTS_PER_TEAM; s++) {
    if (s === carrier) continue;
    const e = view.entity(s);
    if (e === null || e.px >= 0 || !isReceiver(view, s)) continue;
    const d = distTo(view, e.px, e.py);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best === null) return false;
  lead(best, 0, cue);
  return true;
}

/** The nearest opponent who is not the one nearest to him: the man the `blind` primitive hides. -1 when there is none. */
export function secondNearestToSelf(view: PerceivedView): number {
  const start = view.selfSlot < SLOTS_PER_TEAM ? SLOTS_PER_TEAM : 0;
  let first = -1, second = -1, d1 = Infinity, d2 = Infinity;
  for (let s = start; s < start + SLOTS_PER_TEAM; s++) {
    const e = view.entity(s);
    if (e === null) continue;
    const d = distTo(view, e.px, e.py);
    if (d < d1) { second = first; d2 = d1; first = s; d1 = d; } else if (d < d2) { second = s; d2 = d; }
  }
  return second;
}

/** The side (+1 offense's left, -1 right) of the nearest teammate receiver, for a receiver who drifts into another's area. */
export function sideOfNearestTeammate(view: PerceivedView): 1 | -1 {
  let bestD = Infinity, side: 1 | -1 = 1;
  for (let s = 0; s < SLOTS_PER_TEAM; s++) {
    if (s === view.selfSlot || !isReceiver(view, s)) continue;
    const e = view.entity(s);
    if (e === null) continue;
    const d = distTo(view, e.px, e.py);
    if (d < bestD) { bestD = d; side = e.py >= view.self.py ? 1 : -1; }
  }
  return side;
}
