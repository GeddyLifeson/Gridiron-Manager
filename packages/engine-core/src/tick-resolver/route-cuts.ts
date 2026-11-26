// J2.1.3 planted cuts on drawn paths. The assignment language steers a man at his next waypoint and
// moves on when he is close (J2.5.1); taken alone that rounds a `cut` point at full speed and carries
// him yards past the break. The movement update owns the real break (`planCut`: brake to the cut speed
// at the break point, plant inside the sub-step he reaches it, leave toward the next point). This
// Decide stage joins the two: while a man's decision is "run to a cut point of my own path", it plans
// that cut with the movement update, and holds his aim on the break point for the last step the
// language would otherwise skip.
//
// It reads only the man's own intent, his own drawn path and his own position. It never changes where
// he chose to go: a man whose decision left the path (an error form, a scramble drill, a ball in the
// air) is left alone, and a break point moved by a K1 depth or width error is planted where he aims.
import { SLOT_COUNT, type Assignment, type TickWorld } from '@gm/schema';
import { dAtan2, PI } from '../dmath.ts';
import { codZOf, cutMultiplier, kinParams, type Movement } from '../kinematics/index.ts';
import type { PlayStage } from '../tick/loop.ts';
import { tickResolverParams } from './params.ts';

export interface RouteCuts {
  readonly stage: PlayStage;
  /** Call before the loop's `begin`. `assignmentOf` gives the slot's assignment for this play. */
  setPlay(world: TickWorld, assignmentOf: (slot: number) => Assignment | undefined): void;
  /** Planted cuts made this play by the slot (for tests and the explain record). */
  made(slot: number): number;
}

const MAX_CUTS = 8;
const SAME_YD = 1e-6;

export function createRouteCuts(movement: Movement): RouteCuts {
  const n = SLOT_COUNT * MAX_CUTS;
  // Per cut: the break point, the point after it, and the share of top speed carried through (J2.1.3).
  const bx = new Float64Array(n), by = new Float64Array(n), nx = new Float64Array(n), ny = new Float64Array(n), frac = new Float64Array(n);
  const fromX = new Float64Array(n), fromY = new Float64Array(n);
  const count = new Uint8Array(SLOT_COUNT), next = new Uint8Array(SLOT_COUNT), active = new Int8Array(SLOT_COUNT), madeN = new Uint8Array(SLOT_COUNT);
  const offX = new Float64Array(SLOT_COUNT), offY = new Float64Array(SLOT_COUNT);
  const points: { px: number; py: number }[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) points.push({ px: 0, py: 0 });

  const same = (ax: number, ay: number, cx: number, cy: number): boolean => {
    const dx = ax - cx, dy = ay - cy;
    return dx > -SAME_YD && dx < SAME_YD && dy > -SAME_YD && dy < SAME_YD;
  };

  function run(w: TickWorld): void {
    if (w.tick < 0) return;
    const q = tickResolverParams(w.params), pl = w.players, f = w.frame, tol = q['route.cutMatchYd']!;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (count[s] === 0) continue;
      if (movement.takeCutDone(s)) { madeN[s] = madeN[s]! + 1; next[s] = active[s]! + 1; active[s] = -1; }
      const intent = w.intents[s]!, tgt = intent.target;
      const out = w.deadAtTick !== null || tgt === null || pl.hasBall[s] === 1 || pl.engagement[s]! >= 0 || intent.arrival !== 'through';
      let i = active[s]!;
      if (out) { if (i >= 0) { movement.cancelCut(s); active[s] = -1; } continue; }
      const base = s * MAX_CUTS;
      if (i >= 0) {
        // Still his break: he aims at it, or (inside the language's pass radius) already at the point after it.
        const c = base + i;
        if (!same(tgt.px - offX[s]!, tgt.py - offY[s]!, bx[c]!, by[c]!) && !same(tgt.px - offX[s]!, tgt.py - offY[s]!, nx[c]!, ny[c]!)) {
          movement.cancelCut(s); active[s] = -1; i = -1;
        }
      }
      if (i < 0) {
        // The next cut of his path he has not made, when his aim is it (moved by no more than a K1 error moves it).
        for (let k = next[s]!; k < count[s]!; k++) {
          const dx = tgt.px - bx[base + k]!, dy = tgt.py - by[base + k]!;
          if (dx * dx + dy * dy <= tol * tol) { i = k; offX[s] = dx; offY[s] = dy; break; }
        }
        if (i < 0) continue;
        active[s] = i;
      }
      const c = base + i, breakX = bx[c]! + offX[s]!, breakY = by[c]! + offY[s]!;
      const px = (pl.posX[s]! - f.originX) * f.attackDir, py = (pl.posY[s]! - f.originY) * f.attackDir;
      const vCut = w.slots[s]!.movement.vMaxYps * frac[c]!;
      // Past the break point without planting (pushed off his line): he plants where he is.
      const behind = (breakX - px) * (bx[c]! - fromX[c]!) + (breakY - py) * (by[c]! - fromY[c]!) <= 0;
      if (behind) {
        movement.cancelCut(s); movement.requestCut(s, vCut);
        madeN[s] = madeN[s]! + 1; next[s] = i + 1; active[s] = -1;
        continue;
      }
      const pt = points[s]!;
      pt.px = breakX; pt.py = breakY;
      intent.target = pt; intent.arrival = 'through';
      movement.planCut(s, vCut, nx[c]! + offX[s]!, ny[c]! + offY[s]!);
    }
  }

  return {
    stage: { name: 'decide', begin(): void { /* state is set by setPlay */ }, run },
    setPlay(world: TickWorld, assignmentOf): void {
      const kp = kinParams(world.params);
      for (let s = 0; s < SLOT_COUNT; s++) {
        count[s] = 0; next[s] = 0; active[s] = -1; madeN[s] = 0; offX[s] = 0; offY[s] = 0;
        const a = assignmentOf(s);
        if (a === undefined || a.behavior.path.length < 2) continue;
        const path = a.behavior.path, z = codZOf(world.slots[s]!.movement, kp), base = s * MAX_CUTS;
        let prevX = a.preSnap.align.px, prevY = a.preSnap.align.py, k = 0;
        for (let i = 0; i + 1 < path.length && k < MAX_CUTS; i++) {
          const here = path[i]!, after = path[i + 1]!;
          if (here.kind === 'cut') {
            const ax = here.px - prevX, ay = here.py - prevY, cx = after.px - here.px, cy = after.py - here.py;
            if ((ax !== 0 || ay !== 0) && (cx !== 0 || cy !== 0)) {
              const c = base + k++;
              bx[c] = here.px; by[c] = here.py; nx[c] = after.px; ny[c] = after.py; fromX[c] = prevX; fromY[c] = prevY;
              frac[c] = cutMultiplier(dAtan2(ax * cy - ay * cx, ax * cx + ay * cy), z, kp, PI);
            }
          }
          prevX = here.px; prevY = here.py;
        }
        count[s] = k;
      }
    },
    made: (slot) => madeN[slot]!,
  };
}
