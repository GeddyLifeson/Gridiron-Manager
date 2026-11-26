// Sampling a decoded play at any playback time (I9.1.2, O2.3.4, O6.4.1). Positions are linear
// between ticks and equal the stored values at tick boundaries. Nothing is extrapolated: before the
// first tick and after the last the view holds the nearest stored tick. Discrete fields (move mode,
// ball state, carrier) take the value of the tick at or before the time.
import { facingToRad, type FilmFrames } from './format.ts';

const TURN_STEPS = 256;
const HALF_TURN_STEPS = 128;

/** Reusable output of `sampleFrames`, so the draw loop allocates nothing per frame. */
export interface FrameSample {
  /** The tick time this sample was taken at, after clamping. */
  tick: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly facingRad: Float64Array;
  readonly state: Uint8Array;
  ballX: number;
  ballY: number;
  ballZ: number;
  ballKind: number;
  ballCarrier: number;
}

export function newSample(slotCount: number): FrameSample {
  return {
    tick: 0, x: new Float64Array(slotCount), y: new Float64Array(slotCount), facingRad: new Float64Array(slotCount),
    state: new Uint8Array(slotCount), ballX: 0, ballY: 0, ballZ: 0, ballKind: 0, ballCarrier: -1,
  };
}

export function lastTick(f: FilmFrames): number {
  return f.firstTick + f.tickCount - 1;
}

/** Samples the play at tick time `t` (fractional ticks allowed) into `out`. */
export function sampleFrames(f: FilmFrames, t: number, out: FrameSample): FrameSample {
  const end = lastTick(f);
  const tc = t <= f.firstTick ? f.firstTick : t >= end ? end : t;
  const rel = tc - f.firstTick;
  const i0 = Math.floor(rel);
  const frac = rel - i0;
  const i1 = frac > 0 ? i0 + 1 : i0;
  const n = f.slotCount;
  const a = i0 * n, b = i1 * n;
  out.tick = tc;
  for (let s = 0; s < n; s++) {
    const xa = f.x[a + s]!, ya = f.y[a + s]!, fa = f.facing[a + s]!;
    if (frac === 0) {
      out.x[s] = xa; out.y[s] = ya; out.facingRad[s] = facingToRad(fa);
    } else {
      out.x[s] = xa + (f.x[b + s]! - xa) * frac;
      out.y[s] = ya + (f.y[b + s]! - ya) * frac;
      // Shortest way round, in facing steps.
      const d = ((f.facing[b + s]! - fa + HALF_TURN_STEPS + TURN_STEPS) % TURN_STEPS) - HALF_TURN_STEPS;
      out.facingRad[s] = facingToRad(fa + d * frac);
    }
    out.state[s] = f.state[a + s]!;
  }
  const bx = f.ballX[i0]!, by = f.ballY[i0]!, bz = f.ballZ[i0]!;
  if (frac === 0) { out.ballX = bx; out.ballY = by; out.ballZ = bz; }
  else {
    out.ballX = bx + (f.ballX[i1]! - bx) * frac;
    out.ballY = by + (f.ballY[i1]! - by) * frac;
    out.ballZ = bz + (f.ballZ[i1]! - bz) * frac;
  }
  out.ballKind = f.ballKind[i0]!;
  out.ballCarrier = f.ballCarrier[i0]!;
  return out;
}

/** Stored position of one slot at an integer tick, for trails and test hooks. */
export function storedAt(f: FilmFrames, tick: number, slot: number): { x: number; y: number } {
  const i = Math.min(Math.max(tick - f.firstTick, 0), f.tickCount - 1) * f.slotCount + slot;
  return { x: f.x[i]!, y: f.y[i]! };
}
