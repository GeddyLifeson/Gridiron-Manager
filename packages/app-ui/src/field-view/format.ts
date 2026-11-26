// Trajectory buffers (J1.6.2, P2.2.2). WP-09 owns the layout (contract tick.ts: "the layout belongs to
// WP-09 and is versioned by formatVersion"). Old versions stay readable: each keeps its decoder.
//
// Version 1 is the engine's record (WP-09, packages/engine-core/src/tick/trajectory.ts). app-ui may
// not import engine-core (P1.2.1), so its layout is read here a second time; a test compares the two
// once the engine barrel exports the recorder. Byte 0: number of officials. Then one frame per tick,
// the first a delta from zero, field frame:
//   22 players: dx, dy (zigzag LEB128 varints, 0.01 yd), dHeading, dGaze (zigzag varints, 1/4096
//               turn CCW from +x), moveMode (1 byte), advantage (1 signed byte). The advantage is a
//               hidden field (J1.6.2): it is skipped here and never reaches the view.
//   ball:       state (1 byte), dx, dy, dHeight (zigzag varints, 0.01 yd), carrier slot (1 byte, 255 none)
//   officials:  dx, dy, dGaze (zigzag varints)
//
// Version 0 is the P2.2.2 fixed layout, used by fixtures and practice tools. Per tick, little-endian, every field a delta from the previous tick (tick 0 from zero):
//   22 players x 6 bytes: x int16, y int16 (0.01 yd), facing uint8 (256 steps of a turn), state uint8
//   ball x 8 bytes: x int16, y int16, z int16 (0.01 yd), state uint8, spare uint8
// Player state is the MOVE_MODES code. Ball state: low 3 bits the BALL_STATES code, high 5 bits the
// carrier slot plus one (0 when nobody holds it): P2.2.2 "held by slot N".
// The engagement advantage and every other hidden field are not in the buffer (J1.6.2: career film
// draws positions, headings, gaze and move modes only).
import type { TrajectoryRecordLike } from './types.ts';

/** Same list and order as MOVE_MODES in @gm/schema (J1.4.1). The tests compare them. */
export const FILM_MOVE_MODES = ['stance', 'sprint', 'run', 'backpedal', 'shuffle', 'engaged', 'down'] as const;
export type FilmMoveMode = (typeof FILM_MOVE_MODES)[number];
/** Same list and order as BALL_STATES in @gm/schema (J1.4.2). */
export const FILM_BALL_STATES = ['deadPreSnap', 'snapInFlight', 'held', 'exchange', 'passInFlight', 'kickInFlight', 'loose', 'dead'] as const;
export type FilmBallState = (typeof FILM_BALL_STATES)[number];

export const LAYOUT0_VERSION = 0;
export const LAYOUT1_VERSION = 1;
/** Players per tick in layout 0: the 22 slots of a play (J1.4.1). */
export const LAYOUT0_SLOTS = 22;
const PLAYER_BYTES = 6;
const BALL_BYTES = 8;
export const LAYOUT0_TICK_BYTES = LAYOUT0_SLOTS * PLAYER_BYTES + BALL_BYTES;
/** 0.01 yd per unit (J1.6.2, P2.2.2). */
export const UNITS_PER_YD = 100;
const TURN_STEPS = 256;
const V1_ANGLE_STEPS = 4096;
const V1_NO_CARRIER = 255;
const VARINT_GROUP = 128;
const TWO_PI = 2 * Math.PI;
const BALL_KIND_MASK = 7;
const CARRIER_SHIFT = 3;

/** A decoded play, struct of arrays, index `tickIndex * slotCount + slot`. Yards, field frame. */
export interface FilmFrames {
  readonly firstTick: number;
  readonly tickCount: number;
  readonly slotCount: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Hips, radians counter-clockwise from +x (J1.2.1). */
  readonly headingRad: Float64Array;
  /** Eyes (helmet direction, which film shows), radians. Layout 0 has none and repeats the heading. */
  readonly gazeRad: Float64Array;
  /** Code into FILM_MOVE_MODES. */
  readonly state: Uint8Array;
  readonly ballX: Float64Array;
  readonly ballY: Float64Array;
  readonly ballZ: Float64Array;
  /** Code into FILM_BALL_STATES. */
  readonly ballKind: Uint8Array;
  /** Slot holding the ball, or -1. */
  readonly ballCarrier: Int8Array;
  /** Officials per tick (0 in layout 0); positions at `tickIndex * officialCount + i`. */
  readonly officialCount: number;
  readonly officialX: Float64Array;
  readonly officialY: Float64Array;
}

/** One decoded tick, as an engine or fixture writes it. Used by the encoder and the tests. */
export interface TickSample {
  readonly players: readonly { x: number; y: number; facing: number; state: number }[];
  readonly ball: { x: number; y: number; z: number; kind: number; carrier: number };
}

const toUnits = (yd: number) => Math.round(yd * UNITS_PER_YD);
const wrap16 = (v: number) => (v << 16) >> 16;

export class TrajectoryFormatError extends Error {}

function decodeLayout0(rec: TrajectoryRecordLike): FilmFrames {
  const { tickCount, firstTick, buffer } = rec;
  if (!Number.isInteger(tickCount) || tickCount < 1) throw new TrajectoryFormatError(`tickCount ${tickCount} must be a positive integer`);
  if (buffer.byteLength !== tickCount * LAYOUT0_TICK_BYTES) {
    throw new TrajectoryFormatError(`layout 0 needs ${tickCount * LAYOUT0_TICK_BYTES} bytes for ${tickCount} ticks, got ${buffer.byteLength}`);
  }
  const n = tickCount * LAYOUT0_SLOTS;
  const out = {
    firstTick, tickCount, slotCount: LAYOUT0_SLOTS,
    x: new Float64Array(n), y: new Float64Array(n), headingRad: new Float64Array(n), gazeRad: new Float64Array(n), state: new Uint8Array(n),
    ballX: new Float64Array(tickCount), ballY: new Float64Array(tickCount), ballZ: new Float64Array(tickCount),
    ballKind: new Uint8Array(tickCount), ballCarrier: new Int8Array(tickCount),
    officialCount: 0, officialX: new Float64Array(0), officialY: new Float64Array(0),
  };
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const px = new Int32Array(LAYOUT0_SLOTS), py = new Int32Array(LAYOUT0_SLOTS);
  const pf = new Int32Array(LAYOUT0_SLOTS), ps = new Int32Array(LAYOUT0_SLOTS);
  let bx = 0, by = 0, bz = 0, bs = 0;
  let o = 0;
  for (let t = 0; t < tickCount; t++) {
    for (let s = 0; s < LAYOUT0_SLOTS; s++) {
      px[s] = wrap16(px[s]! + dv.getInt16(o, true));
      py[s] = wrap16(py[s]! + dv.getInt16(o + 2, true));
      pf[s] = (pf[s]! + dv.getUint8(o + 4)) & (TURN_STEPS - 1);
      ps[s] = (ps[s]! + dv.getUint8(o + 5)) & (TURN_STEPS - 1);
      o += PLAYER_BYTES;
      const i = t * LAYOUT0_SLOTS + s;
      out.x[i] = px[s]! / UNITS_PER_YD;
      out.y[i] = py[s]! / UNITS_PER_YD;
      out.headingRad[i] = facingToRad(pf[s]!);
      out.gazeRad[i] = out.headingRad[i]!;
      if (ps[s]! >= FILM_MOVE_MODES.length) throw new TrajectoryFormatError(`tick ${t} slot ${s}: state code ${ps[s]} is not a move mode`);
      out.state[i] = ps[s]!;
    }
    bx = wrap16(bx + dv.getInt16(o, true));
    by = wrap16(by + dv.getInt16(o + 2, true));
    bz = wrap16(bz + dv.getInt16(o + 4, true));
    bs = (bs + dv.getUint8(o + 6)) & (TURN_STEPS - 1);
    o += BALL_BYTES;
    out.ballX[t] = bx / UNITS_PER_YD;
    out.ballY[t] = by / UNITS_PER_YD;
    out.ballZ[t] = bz / UNITS_PER_YD;
    out.ballKind[t] = bs & BALL_KIND_MASK;
    const carrier = (bs >> CARRIER_SHIFT) - 1;
    if (carrier >= LAYOUT0_SLOTS) throw new TrajectoryFormatError(`tick ${t}: carrier slot ${carrier} out of range`);
    out.ballCarrier[t] = carrier;
  }
  return out;
}

function decodeLayout1(rec: TrajectoryRecordLike): FilmFrames {
  const { tickCount, firstTick, buffer: buf } = rec;
  if (!Number.isInteger(tickCount) || tickCount < 1) throw new TrajectoryFormatError(`tickCount ${tickCount} must be a positive integer`);
  let at = 0;
  const byte = (): number => {
    if (at >= buf.length) throw new TrajectoryFormatError(`layout 1 buffer ends early at byte ${at}`);
    return buf[at++]!;
  };
  const varint = (): number => {
    let v = 0, mul = 1, b = 0;
    do { b = byte(); v += (b % VARINT_GROUP) * mul; mul *= VARINT_GROUP; } while (b >= VARINT_GROUP);
    return v % 2 === 1 ? -(v + 1) / 2 : v / 2;
  };
  const S = LAYOUT0_SLOTS;
  const officials = byte();
  const n = tickCount * S;
  const out = {
    firstTick, tickCount, slotCount: S,
    x: new Float64Array(n), y: new Float64Array(n), headingRad: new Float64Array(n), gazeRad: new Float64Array(n), state: new Uint8Array(n),
    ballX: new Float64Array(tickCount), ballY: new Float64Array(tickCount), ballZ: new Float64Array(tickCount),
    ballKind: new Uint8Array(tickCount), ballCarrier: new Int8Array(tickCount),
    officialCount: officials, officialX: new Float64Array(tickCount * officials), officialY: new Float64Array(tickCount * officials),
  };
  const px = new Float64Array(S), py = new Float64Array(S), ph = new Float64Array(S), pg = new Float64Array(S);
  const ox = new Float64Array(officials), oy = new Float64Array(officials);
  let bx = 0, by = 0, bz = 0;
  const angle = (q: number) => (((q % V1_ANGLE_STEPS) + V1_ANGLE_STEPS) % V1_ANGLE_STEPS / V1_ANGLE_STEPS) * TWO_PI;
  for (let t = 0; t < tickCount; t++) {
    for (let s = 0; s < S; s++) {
      px[s] = px[s]! + varint(); py[s] = py[s]! + varint(); ph[s] = ph[s]! + varint(); pg[s] = pg[s]! + varint();
      const mode = byte();
      byte(); // the engagement advantage: hidden (J1.6.2), skipped
      if (mode >= FILM_MOVE_MODES.length) throw new TrajectoryFormatError(`tick ${t} slot ${s}: state code ${mode} is not a move mode`);
      const i = t * S + s;
      out.x[i] = px[s]! / UNITS_PER_YD; out.y[i] = py[s]! / UNITS_PER_YD;
      out.headingRad[i] = angle(ph[s]!); out.gazeRad[i] = angle(pg[s]!);
      out.state[i] = mode;
    }
    const kind = byte();
    if (kind >= FILM_BALL_STATES.length) throw new TrajectoryFormatError(`tick ${t}: ball state ${kind} unknown`);
    bx += varint(); by += varint(); bz += varint();
    const carrier = byte();
    if (carrier !== V1_NO_CARRIER && carrier >= S) throw new TrajectoryFormatError(`tick ${t}: carrier slot ${carrier} out of range`);
    out.ballKind[t] = kind;
    out.ballX[t] = bx / UNITS_PER_YD; out.ballY[t] = by / UNITS_PER_YD; out.ballZ[t] = bz / UNITS_PER_YD;
    out.ballCarrier[t] = carrier === V1_NO_CARRIER ? -1 : carrier;
    for (let k = 0; k < officials; k++) {
      ox[k] = ox[k]! + varint(); oy[k] = oy[k]! + varint(); varint(); // officials' gaze is not drawn
      out.officialX[t * officials + k] = ox[k]! / UNITS_PER_YD;
      out.officialY[t * officials + k] = oy[k]! / UNITS_PER_YD;
    }
  }
  if (at !== buf.length) throw new TrajectoryFormatError(`layout 1 buffer has ${buf.length - at} bytes after ${tickCount} ticks`);
  return out;
}

const DECODERS: Record<number, (rec: TrajectoryRecordLike) => FilmFrames> = { [LAYOUT0_VERSION]: decodeLayout0, [LAYOUT1_VERSION]: decodeLayout1 };

/** Decodes a stored trajectory. Old versions stay readable (P2.2.2): each version keeps its decoder. */
export function decodeTrajectory(rec: TrajectoryRecordLike): FilmFrames {
  const d = DECODERS[rec.formatVersion];
  if (!d) throw new TrajectoryFormatError(`trajectory format ${rec.formatVersion} is not readable by this build`);
  return d(rec);
}

/**
 * Writes layout 0. The view never writes film in a game; this is for fixtures, practice tools and
 * the tests. Positions are rounded to 0.01 yd (P2.2.2 acceptance 1).
 */
export function encodeLayout0(firstTick: number, ticks: readonly TickSample[]): TrajectoryRecordLike {
  const buf = new Uint8Array(ticks.length * LAYOUT0_TICK_BYTES);
  const dv = new DataView(buf.buffer);
  const px = new Int32Array(LAYOUT0_SLOTS), py = new Int32Array(LAYOUT0_SLOTS);
  const pf = new Int32Array(LAYOUT0_SLOTS), ps = new Int32Array(LAYOUT0_SLOTS);
  let bx = 0, by = 0, bz = 0, bs = 0;
  let o = 0;
  ticks.forEach((tk, t) => {
    if (tk.players.length !== LAYOUT0_SLOTS) throw new TrajectoryFormatError(`tick ${t} has ${tk.players.length} players, layout 0 needs ${LAYOUT0_SLOTS}`);
    tk.players.forEach((p, s) => {
      const x = toUnits(p.x), y = toUnits(p.y), f = p.facing & (TURN_STEPS - 1), st = p.state;
      dv.setInt16(o, wrap16(x - px[s]!), true);
      dv.setInt16(o + 2, wrap16(y - py[s]!), true);
      dv.setUint8(o + 4, (f - pf[s]!) & (TURN_STEPS - 1));
      dv.setUint8(o + 5, (st - ps[s]!) & (TURN_STEPS - 1));
      px[s] = x; py[s] = y; pf[s] = f; ps[s] = st;
      o += PLAYER_BYTES;
    });
    const b = tk.ball;
    const x = toUnits(b.x), y = toUnits(b.y), z = toUnits(b.z);
    const st = (b.kind & BALL_KIND_MASK) | ((b.carrier + 1) << CARRIER_SHIFT);
    dv.setInt16(o, wrap16(x - bx), true);
    dv.setInt16(o + 2, wrap16(y - by), true);
    dv.setInt16(o + 4, wrap16(z - bz), true);
    dv.setUint8(o + 6, (st - bs) & (TURN_STEPS - 1));
    bx = x; by = y; bz = z; bs = st;
    o += BALL_BYTES;
  });
  return { formatVersion: LAYOUT0_VERSION, firstTick, tickCount: ticks.length, buffer: buf };
}

/** Facing code to radians, counter-clockwise from +x of the field frame (J1.2.1). */
export function facingToRad(code: number): number {
  return (code * 2 * Math.PI) / TURN_STEPS;
}
/** Radians to the nearest facing code. */
export function radToFacing(rad: number): number {
  return Math.round((rad * TURN_STEPS) / (2 * Math.PI)) & (TURN_STEPS - 1);
}
