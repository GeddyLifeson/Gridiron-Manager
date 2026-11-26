// J1.6.2 trajectory record: per tick, each player's position, heading, gaze, move mode and
// engagement advantage, plus the ball and the officials. Delta-encoded at 0.01 yd. The engagement
// advantage is a hidden field (J1.6.2): film draws positions, headings, gaze and move modes only.
//
// Layout, format version 1. Byte 0: number of officials. Then one frame per tick:
//   22 players: dx, dy (zigzag varint of the change in hundredths of a yard), dHeading, dGaze (zigzag
//               varint of the change in 1/4096 turns), moveMode (1 byte), advantage (1 signed byte in
//               hundredths, -128 when the player is in no contest)
//   ball:       state code (1 byte), dx, dy, dHeight (zigzag varints, hundredths of a yard),
//               carrier slot (1 byte, 255 for none)
//   officials:  dx, dy, dGaze each
// The first frame is a delta from zero. Old film plays back from this buffer; it is never re-simulated.
import {
  AFTER_WHISTLE_TICKS, BALL_STATES, MAX_LIVE_TICKS, SLOT_COUNT,
  type TickWorld, type TrajectoryRecord,
} from '@gm/schema';
import { TWO_PI } from '../dmath.ts';
import { hash64Hex } from '../hash.ts';
import type { TickObserver } from './loop.ts';

export const TRAJECTORY_FORMAT_VERSION = 1;
const POS_SCALE = 100;
const ANGLE_STEPS = 4096;
const NO_CONTEST = -128;
const NO_CARRIER = 255;
const PLAYER_BYTES_MAX = 12, BALL_BYTES_MAX = 11, OFFICIAL_BYTES_MAX = 8;
/** Ticks of pre-snap film a buffer leaves room for, beyond the live limit and the after-whistle ticks. Sizing only. */
const PRE_SNAP_TICK_ALLOWANCE = 400;

function quantAngle(rad: number): number {
  const q = Math.round((rad / TWO_PI) * ANGLE_STEPS) % ANGLE_STEPS;
  return q < 0 ? q + ANGLE_STEPS : q;
}

export interface TrajectoryRecorder extends TickObserver {
  /** Copies the frames written so far into a record. Call after the play; it allocates. */
  finish(): TrajectoryRecord;
  /** True when a play outran the buffer and later frames were dropped. */
  readonly truncated: boolean;
}

/** One recorder can serve every play of a game: `begin` rewinds it. Its buffer is allocated here, once. */
export function createTrajectoryRecorder(maxOfficials = 8, maxTicks = MAX_LIVE_TICKS + AFTER_WHISTLE_TICKS + PRE_SNAP_TICK_ALLOWANCE): TrajectoryRecorder {
  const frameMax = SLOT_COUNT * PLAYER_BYTES_MAX + BALL_BYTES_MAX + maxOfficials * OFFICIAL_BYTES_MAX;
  const buf = new Uint8Array(1 + (maxTicks + 1) * frameMax);
  const lastX = new Int32Array(SLOT_COUNT), lastY = new Int32Array(SLOT_COUNT);
  const lastH = new Int32Array(SLOT_COUNT), lastG = new Int32Array(SLOT_COUNT);
  const offX = new Int32Array(maxOfficials), offY = new Int32Array(maxOfficials), offG = new Int32Array(maxOfficials);
  let ballX = 0, ballY = 0, ballH = 0;
  let len = 0, firstTick = 0, tickCount = 0, officials = 0, truncated = false;

  const put = (delta: number): void => {
    let v = delta < 0 ? -2 * delta - 1 : 2 * delta;
    while (v >= 128) { buf[len++] = (v % 128) + 128; v = Math.floor(v / 128); }
    buf[len++] = v;
  };

  const frame = (w: TickWorld): void => {
    if (len + frameMax > buf.length) { truncated = true; return; }
    const p = w.players;
    for (let s = 0; s < SLOT_COUNT; s++) {
      const x = Math.round(p.posX[s]! * POS_SCALE), y = Math.round(p.posY[s]! * POS_SCALE);
      // Written out, not a call to quantAngle: a number passed to a function that is not inlined is boxed (P6.3.1).
      let h = Math.round((p.headingRad[s]! / TWO_PI) * ANGLE_STEPS) % ANGLE_STEPS, g = Math.round((p.gazeRad[s]! / TWO_PI) * ANGLE_STEPS) % ANGLE_STEPS;
      if (h < 0) h += ANGLE_STEPS;
      if (g < 0) g += ANGLE_STEPS;
      put(x - lastX[s]!); put(y - lastY[s]!); put(h - lastH[s]!); put(g - lastG[s]!);
      lastX[s] = x; lastY[s] = y; lastH[s] = h; lastG[s] = g;
      buf[len++] = p.moveMode[s]!;
      const c = p.engagement[s]!;
      let adv = NO_CONTEST;
      if (c >= 0 && c < w.contests.length) adv = Math.round(w.contests[c]!.advantage * POS_SCALE);
      buf[len++] = adv < 0 ? adv + 256 : adv;
    }
    const b = w.ball;
    buf[len++] = BALL_STATES.indexOf(b.kind);
    const bx = Math.round(b.x * POS_SCALE), by = Math.round(b.y * POS_SCALE), bh = Math.round(b.heightYd * POS_SCALE);
    put(bx - ballX); put(by - ballY); put(bh - ballH);
    ballX = bx; ballY = by; ballH = bh;
    buf[len++] = b.carrierSlot < 0 ? NO_CARRIER : b.carrierSlot;
    for (let i = 0; i < officials; i++) {
      const o = w.officials[i]!;
      const x = Math.round(o.x * POS_SCALE), y = Math.round(o.y * POS_SCALE), g = quantAngle(o.gazeRad);
      put(x - offX[i]!); put(y - offY[i]!); put(g - offG[i]!);
      offX[i] = x; offY[i] = y; offG[i] = g;
    }
    tickCount++;
  };

  return {
    get truncated() { return truncated; },
    begin(w: TickWorld): void {
      if (w.officials.length > maxOfficials) throw new Error(`recorder sized for ${maxOfficials} officials, crew has ${w.officials.length}`);
      lastX.fill(0); lastY.fill(0); lastH.fill(0); lastG.fill(0); offX.fill(0); offY.fill(0); offG.fill(0);
      ballX = 0; ballY = 0; ballH = 0;
      officials = w.officials.length; firstTick = w.tick; tickCount = 0; truncated = false;
      len = 0; buf[len++] = officials;
      frame(w);
    },
    afterTick: frame,
    finish(): TrajectoryRecord {
      return { formatVersion: TRAJECTORY_FORMAT_VERSION, firstTick, tickCount, buffer: buf.slice(0, len) };
    },
  };
}

export interface TrajectoryFrame {
  readonly tick: number;
  /** Yards and radians, rounded as stored. Indexed by slot. */
  readonly x: number[]; readonly y: number[]; readonly headingRad: number[]; readonly gazeRad: number[];
  readonly moveMode: number[];
  /** Hidden field (J1.6.2). Null when the player is in no contest. */
  readonly advantage: (number | null)[];
  readonly ball: { readonly kind: string; readonly x: number; readonly y: number; readonly heightYd: number; readonly carrierSlot: number };
  readonly officials: { readonly x: number; readonly y: number; readonly gazeRad: number }[];
}

/** Reads a record back into frames, for film and tests. Not used inside the tick. */
export function decodeTrajectory(record: TrajectoryRecord): TrajectoryFrame[] {
  if (record.formatVersion !== TRAJECTORY_FORMAT_VERSION) throw new Error(`unknown trajectory format ${record.formatVersion}`);
  const buf = record.buffer;
  let at = 0;
  const get = (): number => {
    let v = 0, mul = 1, byte = 0;
    do { byte = buf[at++]!; v += (byte % 128) * mul; mul *= 128; } while (byte >= 128);
    return v % 2 === 1 ? -(v + 1) / 2 : v / 2;
  };
  const officials = buf[at++]!;
  const x = new Array<number>(SLOT_COUNT).fill(0), y = new Array<number>(SLOT_COUNT).fill(0);
  const h = new Array<number>(SLOT_COUNT).fill(0), g = new Array<number>(SLOT_COUNT).fill(0);
  const ox = new Array<number>(officials).fill(0), oy = new Array<number>(officials).fill(0), og = new Array<number>(officials).fill(0);
  let bx = 0, by = 0, bh = 0;
  const angle = (q: number) => (q / ANGLE_STEPS) * TWO_PI;
  const frames: TrajectoryFrame[] = [];
  for (let t = 0; t < record.tickCount; t++) {
    const moveMode: number[] = [], advantage: (number | null)[] = [];
    for (let s = 0; s < SLOT_COUNT; s++) {
      x[s]! += get(); y[s]! += get(); h[s]! += get(); g[s]! += get();
      moveMode.push(buf[at++]!);
      const raw = buf[at++]!, adv = raw >= 128 ? raw - 256 : raw;
      advantage.push(adv === NO_CONTEST ? null : adv / POS_SCALE);
    }
    const kind = BALL_STATES[buf[at++]!]!;
    bx += get(); by += get(); bh += get();
    const carrier = buf[at++]!;
    const offs: { x: number; y: number; gazeRad: number }[] = [];
    for (let i = 0; i < officials; i++) {
      ox[i]! += get(); oy[i]! += get(); og[i]! += get();
      offs.push({ x: ox[i]! / POS_SCALE, y: oy[i]! / POS_SCALE, gazeRad: angle(og[i]!) });
    }
    frames.push({
      tick: record.firstTick + t,
      x: x.map((v) => v / POS_SCALE), y: y.map((v) => v / POS_SCALE), headingRad: h.map(angle), gazeRad: g.map(angle),
      moveMode, advantage,
      ball: { kind, x: bx / POS_SCALE, y: by / POS_SCALE, heightYd: bh / POS_SCALE, carrierSlot: carrier === NO_CARRIER ? -1 : carrier },
      officials: offs,
    });
  }
  return frames;
}

/** Hash of a trajectory, for determinism checks (Q1.3.1): same inputs, same hash, on every platform. */
export function trajectoryHash(record: TrajectoryRecord): string {
  return hash64Hex(record.buffer);
}
