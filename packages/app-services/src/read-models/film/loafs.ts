// Candidate loafs from film (N1.4.1 rule 4). Four visible patterns from one published defensive
// staff's loaf list (Mattison, via the bible), read only from stored positions and move modes:
//  a  changing speed going to the ball
//  b  passed by a teammate in pursuit
//  c  caught lying on the ground (getting knocked down is not a loaf; staying down is)
//  d  stopping at the pile before the whistle
// For the side with the ball, the matching pattern is stopping (a block, a route) before the whistle
// while away from the ball. A candidate is a prompt for the grader, never a mark. Hidden contest
// values in the record are not read.
import { tick } from '@gm/engine-core';
import { MOVE_MODES, SLOT_COUNT, type TrajectoryRecord } from '@gm/schema';
import { param } from './params.ts';
import type { Side } from './types.ts';

export type LoafPattern = 'speedChange' | 'passedInPursuit' | 'lyingDown' | 'stopAtPile' | 'stopBeforeWhistle';

export interface LoafCandidate { readonly slot: number; readonly pattern: LoafPattern; readonly tick: number }

export interface LoafInput {
  readonly trajectory: TrajectoryRecord;
  readonly ticksPerSecond: number;
  /** Side of each slot (index = slot). */
  readonly sides: readonly Side[];
  /** The side that snapped. */
  readonly offenseSide: Side;
  /** Snap and whistle on the trajectory's clock. */
  readonly snapTick: number;
  readonly whistleTick: number;
  /** Slots with an injury on the play: staying down is not a loaf for them. */
  readonly injured: ReadonlySet<number>;
}

const ENGAGED = MOVE_MODES.indexOf('engaged');
const DOWN = MOVE_MODES.indexOf('down');
/** Overtaking margin for pattern b, so two pursuers running side by side do not trade the flag back and forth (Assumption). */
const PASS_MARGIN_YD = 1;

export function loafCandidates(inp: LoafInput): LoafCandidate[] {
  const frames = tick.decodeTrajectory(inp.trajectory);
  const tps = inp.ticksPerSecond;
  const iOf = (t: number) => t - inp.trajectory.firstTick;
  const i0 = Math.max(0, iOf(inp.snapTick)), i1 = Math.min(frames.length - 1, iOf(inp.whistleTick));
  if (i1 <= i0) return [];
  const dist = (i: number, s: number) => Math.hypot(frames[i]!.x[s]! - frames[i]!.ball.x, frames[i]!.y[s]! - frames[i]!.ball.y);
  const speed = (i: number, s: number) => i === 0 ? 0 : Math.hypot(frames[i]!.x[s]! - frames[i - 1]!.x[s]!, frames[i]!.y[s]! - frames[i - 1]!.y[s]!) * tps;
  const mode = (i: number, s: number) => frames[i]!.moveMode[s]!;
  const out: LoafCandidate[] = [];
  const found = new Set<string>();
  const add = (slot: number, pattern: LoafPattern, i: number) => {
    const k = `${slot}:${pattern}`;
    if (found.has(k)) return;
    found.add(k);
    out.push({ slot, pattern, tick: frames[i]!.tick });
  };
  const dropShare = param('film.loaf.speedDropShare'), dropTicks = Math.ceil(param('film.loaf.speedDropS') * tps);
  const near = param('film.loaf.nearBallYd'), downTicks = Math.ceil(param('film.loaf.downS') * tps);
  const pileTicks = Math.ceil(param('film.loaf.pileStopS') * tps), still = param('film.loaf.stillYdPerS'), pileYd = param('film.loaf.pileYd');

  // Pursuit starts when the last ball carrier of the play gets the ball and keeps it.
  const finalCarrier = frames[i1]!.ball.carrierSlot >= 0 ? frames[i1]!.ball.carrierSlot : frames[Math.max(i0, i1 - 1)]!.ball.carrierSlot;
  let pursuitStart = -1;
  if (finalCarrier >= 0) {
    pursuitStart = i1;
    while (pursuitStart > i0 && frames[pursuitStart - 1]!.ball.carrierSlot === finalCarrier) pursuitStart--;
  }

  for (let s = 0; s < SLOT_COUNT && s < inp.sides.length; s++) {
    const defending = inp.sides[s] !== inp.offenseSide;
    if (s === finalCarrier) continue;
    // c: lying on the ground while the ball is live.
    let downRun = 0;
    for (let i = i0; i <= i1; i++) {
      downRun = mode(i, s) === DOWN ? downRun + 1 : 0;
      if (downRun > downTicks && !inp.injured.has(s)) { add(s, 'lyingDown', i); break; }
    }
    if (defending) {
      // a: closing speed toward the ball falls by more than the share for longer than the window, near the ball, with no block.
      let peak = 0, slowRun = 0;
      for (let i = Math.max(i0 + 1, pursuitStart < 0 ? i0 + 1 : pursuitStart + 1); i <= i1; i++) {
        // Own speed toward the ball: velocity projected on the line to the ball (the carrier's own movement is not his).
        const d0 = dist(i - 1, s);
        const ux = d0 > 0 ? (frames[i - 1]!.ball.x - frames[i - 1]!.x[s]!) / d0 : 0, uy = d0 > 0 ? (frames[i - 1]!.ball.y - frames[i - 1]!.y[s]!) / d0 : 0;
        const closing = ((frames[i]!.x[s]! - frames[i - 1]!.x[s]!) * ux + (frames[i]!.y[s]! - frames[i - 1]!.y[s]!) * uy) * tps;
        const free = mode(i, s) !== ENGAGED && mode(i, s) !== DOWN && dist(i, s) > pileYd;
        if (!free) { slowRun = 0; peak = 0; continue; }
        if (closing > peak) peak = closing;
        const slow = peak > still && closing < (1 - dropShare) * peak && dist(i, s) <= near;
        slowRun = slow ? slowRun + 1 : 0;
        if (slowRun > dropTicks) { add(s, 'speedChange', i); break; }
      }
      // b: a teammate who started farther from the ball passes him on the way to it.
      if (pursuitStart >= 0) {
        for (let m = 0; m < SLOT_COUNT && m < inp.sides.length; m++) {
          if (m === s || inp.sides[m] !== inp.sides[s]) continue;
          if (dist(pursuitStart, m) <= dist(pursuitStart, s) + PASS_MARGIN_YD) continue;
          for (let i = pursuitStart + 1; i <= i1; i++) {
            const bothFree = mode(i, s) !== ENGAGED && mode(i, s) !== DOWN && mode(i, m) !== ENGAGED && mode(i, m) !== DOWN;
            if (bothFree && dist(i, m) < dist(i, s) - PASS_MARGIN_YD) { add(s, 'passedInPursuit', i); break; }
          }
        }
      }
    }
    // d: stops moving early. Defenders at the pile; the side with the ball anywhere away from it.
    let stopFrom = -1;
    for (let i = i1; i >= i0; i--) {
      const stopped = speed(i, s) < still && mode(i, s) !== ENGAGED && mode(i, s) !== DOWN;
      const where = defending ? dist(i, s) <= pileYd : dist(i, s) > pileYd;
      if (stopped && where) stopFrom = i; else break;
    }
    if (stopFrom >= 0 && i1 - stopFrom > pileTicks) add(s, defending ? 'stopAtPile' : 'stopBeforeWhistle', stopFrom);
  }
  return out.sort((a, b) => a.slot - b.slot || a.tick - b.tick);
}
