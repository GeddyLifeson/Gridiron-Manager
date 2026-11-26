// J1.5.2 boundaries and planes. Crossings are found inside each move sub-step by linear interpolation
// and buffered; the detect stage then emits them in order of interpolated time, then slot (J1.3.1).
// Whether a crossing is a score, a first down or out of bounds by rule is officiating's call (D-04):
// this module reports only the physical fact.
import {
  BALL_STATES, MOVE_MODES, SLOT_COUNT, SLOTS_PER_TEAM, SUBSTEPS, TICK_S, roundSimS, roundYd,
  type TickStage, type TickWorld, type TruthEvent,
} from '@gm/schema';
import { dCos, dSin } from '../dmath.ts';
import { fieldParams, type FieldParams } from './params.ts';
import type { PlayStage } from '../tick/loop.ts';

const KINDS = ['player_out_of_bounds', 'ball_out_of_bounds', 'ball_crosses_goal_line', 'ball_reaches_line_to_gain'] as const;
const K_PLAYER_OOB = 0, K_BALL_OOB = 1, K_GOAL = 2, K_LTG = 3;
const HELD = BALL_STATES.indexOf('held'), LOOSE = BALL_STATES.indexOf('loose');
const MAX_PENDING = 64;
const NO_SLOT = -1;

/** Fraction of the way from `prev` to `cur` at which a value reaches `line`. Both ends must straddle it. */
export function crossingFraction(prev: number, cur: number, line: number): number {
  const d = cur - prev;
  if (d === 0) return 0;
  const f = (line - prev) / d;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/** J1.5.2: out of bounds when the centre is within one body radius, less the foot allowance, of a boundary line. */
export function isOutOfBounds(x: number, y: number, radiusYd: number, lengthYd: number, widthYd: number, footAllowanceYd: number): boolean {
  const m = radiusYd - footAllowanceYd;
  return y <= m || y >= widthYd - m || x <= m || x >= lengthYd - m;
}

export interface BoundaryWatcher {
  /** Register after the movement stage and after any ball stage, so it sees each sub-step's final positions. */
  readonly moveStage: PlayStage;
  readonly detectStage: TickStage;
}

/**
 * Builds the pair of stages that watch boundaries. The ball in a carrier's possession is located at
 * his centre plus the carry offset along his heading (J1.5.2); a loose ball at its own position. A
 * ball in flight is J9's to report.
 */
export function createBoundaryWatcher(): BoundaryWatcher {
  const prevX = new Float64Array(SLOT_COUNT), prevY = new Float64Array(SLOT_COUNT);
  let prevBallX = 0, prevBallY = 0, prevBallValid = false, prevBallKind = NO_SLOT, prevCarrier = NO_SLOT;
  const pendT = new Float64Array(MAX_PENDING), pendX = new Float64Array(MAX_PENDING), pendY = new Float64Array(MAX_PENDING);
  const pendKind = new Uint8Array(MAX_PENDING), pendSlot = new Int16Array(MAX_PENDING), order = new Uint8Array(MAX_PENDING);
  let pending = 0, substep = 0, lastTick = 0;
  let params: FieldParams | null = null;
  const downCode = MOVE_MODES.indexOf('down');

  const push = (t: number, kind: number, slot: number, x: number, y: number): void => {
    if (pending >= MAX_PENDING) return;
    pendT[pending] = t; pendKind[pending] = kind; pendSlot[pending] = slot; pendX[pending] = x; pendY[pending] = y;
    pending++;
  };

  const ballSpot = (w: TickWorld, p: FieldParams, out: Float64Array): boolean => {
    const b = w.ball, kind = BALL_STATES.indexOf(b.kind);
    if (kind === HELD && b.carrierSlot >= 0) {
      const s = b.carrierSlot, h = w.players.headingRad[s]!;
      out[0] = w.players.posX[s]! + p.ballCarryOffsetYd * dCos(h);
      out[1] = w.players.posY[s]! + p.ballCarryOffsetYd * dSin(h);
      return true;
    }
    if (kind === LOOSE) { out[0] = b.x; out[1] = b.y; return true; }
    return false;
  };
  const spot = new Float64Array(2);

  const begin = (w: TickWorld): void => {
    params = fieldParams(w.params);
    for (let s = 0; s < SLOT_COUNT; s++) { prevX[s] = w.players.posX[s]!; prevY[s] = w.players.posY[s]!; }
    prevBallValid = ballSpot(w, params, spot);
    prevBallX = spot[0]!; prevBallY = spot[1]!;
    prevBallKind = BALL_STATES.indexOf(w.ball.kind); prevCarrier = w.ball.carrierSlot;
    pending = 0; substep = 0; lastTick = w.tick;
  };

  const moveStage: PlayStage = {
    name: 'move',
    begin,
    run(w: TickWorld): void {
      const p = params ?? (params = fieldParams(w.params));
      if (w.tick !== lastTick) { lastTick = w.tick; substep = 0; }
      const g = w.geometry, pl = w.players;
      const t0 = (w.tick + substep / SUBSTEPS) * TICK_S, span = TICK_S / SUBSTEPS;
      const carrier = BALL_STATES.indexOf(w.ball.kind) === HELD ? w.ball.carrierSlot : NO_SLOT;
      for (let s = 0; s < SLOT_COUNT; s++) {
        const x = pl.posX[s]!, y = pl.posY[s]!;
        if (pl.wentOob[s] === 0 && pl.moveMode[s] !== downCode) {
          const r = w.slots[s]!.movement.bodyRadiusYd;
          if (isOutOfBounds(x, y, r, g.lengthYd, g.widthYd, p.footAllowanceYd)) {
            const m = r - p.footAllowanceYd, px = prevX[s]!, py = prevY[s]!;
            // The earliest of the four lines he reached during this sub-step.
            let f = 1;
            if (y <= m && py > m) { const c = crossingFraction(py, y, m); if (c < f) f = c; }
            if (y >= g.widthYd - m && py < g.widthYd - m) { const c = crossingFraction(py, y, g.widthYd - m); if (c < f) f = c; }
            if (x <= m && px > m) { const c = crossingFraction(px, x, m); if (c < f) f = c; }
            if (x >= g.lengthYd - m && px < g.lengthYd - m) { const c = crossingFraction(px, x, g.lengthYd - m); if (c < f) f = c; }
            pl.wentOob[s] = 1;
            const ex = px + (x - px) * f, ey = py + (y - py) * f, t = t0 + span * f;
            push(t, K_PLAYER_OOB, s, ex, ey);
            if (s === carrier) push(t, K_BALL_OOB, s, ex, ey);
          }
        }
        prevX[s] = x; prevY[s] = y;
      }
      const has = ballSpot(w, p, spot);
      const kind = BALL_STATES.indexOf(w.ball.kind);
      // Interpolate only while the same ball state and carrier persist; a catch or recovery is a fresh start.
      if (has && prevBallValid && kind === prevBallKind && w.ball.carrierSlot === prevCarrier) {
        const bx = spot[0]!, by = spot[1]!, slot = kind === HELD ? w.ball.carrierSlot : NO_SLOT;
        const west = g.goalLineWestX, east = g.goalLineEastX;
        let line = Number.NaN;
        if (prevBallX > west && bx <= west) line = west;
        else if (prevBallX < east && bx >= east) line = east;
        if (line === line) {
          const f = crossingFraction(prevBallX, bx, line), y = prevBallY + (by - prevBallY) * f;
          if (y > 0 && y < g.widthYd) push(t0 + span * f, K_GOAL, slot, line, y);
        }
        if (kind === HELD && slot >= 0 && slot < SLOTS_PER_TEAM) {
          const ltg = w.frame.originX + w.frame.lineToGainPx * w.frame.attackDir, dir = w.frame.attackDir;
          if ((prevBallX - ltg) * dir < 0 && (bx - ltg) * dir >= 0) {
            const f = crossingFraction(prevBallX, bx, ltg);
            push(t0 + span * f, K_LTG, slot, ltg, prevBallY + (by - prevBallY) * f);
          }
        }
        if (kind === LOOSE) {
          let f = 2;
          if (by <= 0 && prevBallY > 0) f = crossingFraction(prevBallY, by, 0);
          else if (by >= g.widthYd && prevBallY < g.widthYd) f = crossingFraction(prevBallY, by, g.widthYd);
          else if (bx <= 0 && prevBallX > 0) f = crossingFraction(prevBallX, bx, 0);
          else if (bx >= g.lengthYd && prevBallX < g.lengthYd) f = crossingFraction(prevBallX, bx, g.lengthYd);
          if (f <= 1) push(t0 + span * f, K_BALL_OOB, NO_SLOT, prevBallX + (bx - prevBallX) * f, prevBallY + (by - prevBallY) * f);
        }
      }
      prevBallValid = has; prevBallX = spot[0]!; prevBallY = spot[1]!; prevBallKind = kind; prevCarrier = w.ball.carrierSlot;
      substep++;
    },
  };

  const detectStage: TickStage = {
    name: 'detect',
    run(w: TickWorld): void {
      if (pending === 0) return;
      // Insertion sort by interpolated time, then slot (J1.3.1). The ball with no carrier sorts first.
      for (let i = 0; i < pending; i++) {
        let j = i;
        while (j > 0) {
          const a = order[j - 1]!;
          if (pendT[a]! < pendT[i]! || (pendT[a]! === pendT[i]! && pendSlot[a]! <= pendSlot[i]!)) break;
          order[j] = a; j--;
        }
        order[j] = i;
      }
      for (let n = 0; n < pending; n++) {
        const i = order[n]!, slot = pendSlot[i]!;
        const event: TruthEvent = {
          type: 'boundary', t: roundSimS(pendT[i]!), marginYd: null, marginS: null, visibility: 'open',
          kind: KINDS[pendKind[i]!]!, playerId: slot >= 0 ? w.slots[slot]!.playerId : null,
          spot: { x: roundYd(pendX[i]!), y: roundYd(pendY[i]!) },
        };
        w.emit(event);
      }
      pending = 0;
    },
  };

  return { moveStage, detectStage };
}

/** J1.5.2 `beyondLos`: play-frame px of a player or the ball against the line of scrimmage, with the rule's own allowance (B5). */
export function beyondLos(px: number, allowanceYd: number): boolean { return px > allowanceYd; }

/**
 * Keeps a held ball with its carrier (J1.4.2 `held`, J1.5.2): each sub-step the ball sits at the
 * carrier's centre plus the carry offset along his heading, and moves with his velocity. Register it
 * after the movement stage. A ball in any other state is left to J9.
 */
export function createHeldBallStage(): PlayStage {
  let params: FieldParams | null = null;
  return {
    name: 'move',
    begin(w: TickWorld): void { params = fieldParams(w.params); },
    run(w: TickWorld): void {
      const b = w.ball;
      if (b.kind !== 'held' || b.carrierSlot < 0) return;
      const p = params ?? (params = fieldParams(w.params)), s = b.carrierSlot, h = w.players.headingRad[s]!;
      b.x = w.players.posX[s]! + p.ballCarryOffsetYd * dCos(h);
      b.y = w.players.posY[s]! + p.ballCarryOffsetYd * dSin(h);
      b.velX = w.players.velX[s]!; b.velY = w.players.velY[s]!;
    },
  };
}
