// The ball as tick stages (J1.3.1, J9). Register `move` AFTER the players' movement stage and BEFORE
// the boundary watcher, so each sub-step moves players, then the ball, then checks lines; register
// `detect` with the other detect stages. Loose-ball out of bounds and goal-line crossings stay the
// boundary watcher's (J1.5.2); possession, catches and recoveries are J6's.
//
// Other modules start flights with the launch functions below (the quarterback, J7; the kick and snap
// operations, J9.4 and J5.6; fumbles, J6.7). They write the contract `BallState` and the module's own
// per-play flight details, kept beside the world, never in it.
import {
  SLOTS_PER_TEAM, SUBSTEPS, TICK_S, roundSimS, roundYd,
  type KickKind, type RandomStream, type Slot, type TickStage, type TickWorld, type TruthEvent,
} from '@gm/schema';
import { dSqrt } from '../dmath.ts';
import type { PlayStage } from '../tick/loop.ts';
import { airDrag, airState, copyAir, flyToHeight, stepAir, windFromEnvironment, type AirState, type Wind } from './flight.ts';
import { bounce, roll, shouldRoll, surfaceOf, type BounceContext } from './loose.ts';
import { ballParams, type BallParams } from './params.ts';

/** Per-play flight details the contract `BallState` does not carry. */
export interface BallFlight {
  /** True once the first airborne or loose period (the snap, index 0) has begun. */
  started: boolean;
  /** Drag of the current flight, 1/yd, before the air-density scaling. */
  kPerYd: number;
  spiral: boolean;
  bias: number;
  highHop: boolean;
  bounces: number;
  rolling: boolean;
  atRest: boolean;
  looseSinceS: number;
  /** Set when a forward pass reached the ground: time and spot. The ball is then dead by rule (B5). */
  grounded: { t: number; x: number; y: number } | null;
  /** The kick's first ground contact has been reported. */
  kickLanded: boolean;
  kickSide: 0 | 1 | null;
  stream: RandomStream | null;
  streamIndex: number;
  readonly pending: TruthEvent[];
  readonly air: AirState;
}

const flights = new WeakMap<TickWorld, BallFlight>();

/** The flight details of a world's ball, created on first use. */
export function ballFlight(w: TickWorld): BallFlight {
  let f = flights.get(w);
  if (!f) {
    f = {
      started: false, kPerYd: 0, spiral: true, bias: 0, highHop: false, bounces: 0, rolling: false, atRest: false,
      looseSinceS: 0, grounded: null, kickLanded: false, kickSide: null, stream: null, streamIndex: -1,
      pending: [], air: airState(0, 0, 0, 0, 0, 0),
    };
    flights.set(w, f);
  }
  return f;
}

/**
 * The `ball` stream of the current flight, keyed [game, play, flightIndex] (J13.2.1). The kick
 * operation's draws, the kick's own draws and every bounce of that flight come from it, in that order.
 */
export function ballStream(w: TickWorld): RandomStream {
  const f = ballFlight(w);
  if (f.stream === null || f.streamIndex !== w.ball.flightIndex) {
    f.stream = w.streams('ball', [w.situation.gameId, w.situation.playNumber, w.ball.flightIndex]);
    f.streamIndex = w.ball.flightIndex;
  }
  return f.stream;
}

/** Starts a new airborne or loose period: index 0 for the first (the snap), then +1 each (J13.2.1). */
function beginPeriod(w: TickWorld, f: BallFlight): void {
  if (f.started) w.ball.flightIndex += 1; else { f.started = true; w.ball.flightIndex = 0; }
  f.bounces = 0; f.rolling = false; f.atRest = false; f.highHop = false; f.bias = 0; f.spiral = true;
  f.grounded = null; f.kickLanded = false; f.kickSide = null;
}

function setBall(w: TickWorld, x: number, y: number, h: number, vx: number, vy: number, vh: number): void {
  const b = w.ball;
  b.x = x; b.y = y; b.heightYd = h; b.velX = vx; b.velY = vy; b.velHeight = vh;
}

function releaseFrom(w: TickWorld, slot: Slot | -1): void {
  const b = w.ball;
  if (slot >= 0) { w.players.hasBall[slot] = 0; b.lastPossessorSlot = slot; }
  if (b.carrierSlot >= 0) w.players.hasBall[b.carrierSlot] = 0;
  b.carrierSlot = -1;
}

export interface FlightLaunch {
  readonly x: number; readonly y: number; readonly h: number;
  readonly vx: number; readonly vy: number; readonly vh: number;
}

/** The snap leaves the snapper (J9.1.2). The first period of the play: flight index 0. */
export function launchSnap(w: TickWorld, snapperSlot: Slot, l: FlightLaunch, p: BallParams): void {
  const f = ballFlight(w);
  beginPeriod(w, f);
  releaseFrom(w, snapperSlot);
  f.kPerYd = p['pass.dragPerYd']!;
  w.ball.kind = 'snapInFlight'; w.ball.passForward = null; w.ball.kickKind = null;
  setBall(w, l.x, l.y, l.h, l.vx, l.vy, l.vh);
}

/** A pass, lateral or pitch leaves the passer (J9.1.1, J9.1.2). Forward or backward is decided by the caller from the play frame (B5.1.1). */
export function launchPass(w: TickWorld, passerSlot: Slot, l: FlightLaunch, forward: boolean, p: BallParams): void {
  const f = ballFlight(w);
  beginPeriod(w, f);
  releaseFrom(w, passerSlot);
  f.kPerYd = p['pass.dragPerYd']!;
  w.ball.kind = 'passInFlight'; w.ball.passForward = forward; w.ball.kickKind = null;
  setBall(w, l.x, l.y, l.h, l.vx, l.vy, l.vh);
}

export interface KickStart {
  readonly kickKind: KickKind;
  readonly kickerSlot: Slot;
  readonly launch: FlightLaunch;
  readonly kPerYd: number;
  readonly spiral: boolean;
  readonly bias: number;
  readonly highHop: boolean;
  /** Whether the kick crossed the line of scrimmage (B6.3.2). Free kicks: always true. */
  readonly crossedLine: boolean;
}

/**
 * The kick leaves the foot. Emits the contract `kick` event at once with the landing spot and hang
 * time predicted through the real wind and air (the flight that follows is the same integration, so it
 * lands there unless something touches it). The kick's flight index must already be the current one
 * when its operation draws were taken: call `beginKickFlight` first, draw, then `launchKick`.
 */
export function launchKick(w: TickWorld, k: KickStart): void {
  const f = ballFlight(w);
  releaseFrom(w, k.kickerSlot);
  f.kPerYd = k.kPerYd; f.spiral = k.spiral; f.bias = k.bias; f.highHop = k.highHop;
  f.kickSide = k.kickerSlot < SLOTS_PER_TEAM ? 0 : 1;
  w.ball.kind = 'kickInFlight'; w.ball.kickKind = k.kickKind; w.ball.passForward = null;
  const l = k.launch;
  setBall(w, l.x, l.y, l.h, l.vx, l.vy, l.vh);
  const s = airState(l.x, l.y, l.h, l.vx, l.vy, l.vh);
  const landing = l.h <= 0 && l.vh <= 0 ? { t: 0, x: l.x, y: l.y } : flyToHeight(s, airDrag(k.kPerYd, w.environment), windFromEnvironment(w.environment), 0);
  const t = w.tick * TICK_S;
  w.emit({
    type: 'kick', t: roundSimS(t), kickKind: k.kickKind, kickerId: w.slots[k.kickerSlot]!.playerId,
    kickSpot: { x: roundYd(l.x), y: roundYd(l.y) },
    landingSpot: { x: roundYd(landing ? landing.x : l.x), y: roundYd(landing ? landing.y : l.y) },
    hangTimeS: roundSimS(landing ? landing.t : 0), crossedLine: k.crossedLine, blockedById: null,
  });
}

/** Opens the kick's own airborne period so its operation draws use its flight index (J13.2.1). */
export function beginKickFlight(w: TickWorld): RandomStream {
  beginPeriod(w, ballFlight(w));
  return ballStream(w);
}

/** A held ball comes loose (fumble, muff, bad snap): a new loose period with the given velocity (J6.7). */
export function beginLoose(w: TickWorld, fromSlot: Slot | -1, l: FlightLaunch, p: BallParams): void {
  const f = ballFlight(w);
  beginPeriod(w, f);
  releaseFrom(w, fromSlot);
  f.kPerYd = p['pass.dragPerYd']!; f.spiral = false;
  f.looseSinceS = w.tick * TICK_S;
  w.ball.kind = 'loose'; w.ball.passForward = null;
  setBall(w, l.x, l.y, l.h, l.vx, l.vy, l.vh);
}

/** A deflected pass keeps flying with its new velocity (J9.2.1); the caller has applied `deflect`. */
export function setFlightVelocity(w: TickWorld, s: AirState): void {
  setBall(w, s.x, s.y, s.h, s.vx, s.vy, s.vh);
}

export interface BallStages {
  readonly move: PlayStage;
  readonly detect: TickStage;
}

/** Builds the ball's move and detect stages. Parameters are resolved once per play in `begin`. */
export function createBallStages(): BallStages {
  let p: BallParams | null = null;
  let wind: Wind = { x: 0, y: 0 };
  let kAir = 1;
  let surface = { artificial: false, wet: false };
  let substep = 0, lastTick = 0;
  const prev = airState(0, 0, 0, 0, 0, 0);

  const contact = (w: TickWorld, f: BallFlight, s: AirState, t: number, params: BallParams): void => {
    // `s` is at the ground (h = 0) moving down.
    const b = w.ball;
    if (b.kind === 'passInFlight' && b.passForward === true) {
      f.grounded = { t, x: s.x, y: s.y };
      s.vx = 0; s.vy = 0; s.vh = 0; s.h = 0;
      b.kind = 'dead';
      return;
    }
    if (b.kind === 'kickInFlight' && !f.kickLanded) {
      f.kickLanded = true;
      f.pending.push({
        type: 'kick_touch', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open',
        kind: 'landed', playerId: null, side: null, spot: { x: roundYd(s.x), y: roundYd(s.y) },
      });
    }
    if (b.kind !== 'loose') { b.kind = 'loose'; f.looseSinceS = t; }
    f.bounces += 1;
    const ctx: BounceContext = { artificial: surface.artificial, wet: surface.wet, spiral: f.spiral, bias: f.bias, highHop: f.highHop && f.bounces === 1 };
    bounce(s, ctx, ballStream(w), params);
    f.spiral = false; // after the first contact the ball tumbles
    if (shouldRoll(f.bounces, s, params)) { f.rolling = true; s.vh = 0; s.h = 0; }
  };

  const move: PlayStage = {
    name: 'move',
    begin(w: TickWorld): void {
      p = ballParams(w.params);
      wind = windFromEnvironment(w.environment);
      kAir = w.environment.derived.airDensity;
      surface = surfaceOf(w.environment);
      substep = 0; lastTick = w.tick;
      const f = ballFlight(w);
      f.pending.length = 0;
    },
    run(w: TickWorld, dt: number): void {
      const params = p ?? (p = ballParams(w.params));
      if (w.tick !== lastTick) { lastTick = w.tick; substep = 0; }
      const t0 = (w.tick + substep / SUBSTEPS) * TICK_S;
      substep += 1;
      const b = w.ball, kind = b.kind;
      if (kind !== 'snapInFlight' && kind !== 'passInFlight' && kind !== 'kickInFlight' && kind !== 'loose') return;
      const f = ballFlight(w);
      const s = f.air;
      s.x = b.x; s.y = b.y; s.h = b.heightYd; s.vx = b.velX; s.vy = b.velY; s.vh = b.velHeight;

      if (kind === 'loose') {
        if (f.atRest) return;
        if (t0 - f.looseSinceS >= params['bounce.maxLooseS']!) {
          s.vx = 0; s.vy = 0; s.vh = 0; s.h = 0; f.atRest = true;
        } else if (f.rolling) {
          f.atRest = roll(s, dt, params);
        } else if (s.h <= 0 && s.vh <= 0) {
          // Launched into the ground (an onside hop) or resting on it: contact now.
          s.h = 0;
          contact(w, f, s, t0, params);
        } else {
          copyAir(s, prev);
          stepAir(s, dt, f.kPerYd * kAir, wind);
          if (s.h <= 0 && s.vh < 0) toGround(prev, s, w, f, t0, dt, params);
        }
      } else if (s.h <= 0 && s.vh <= 0) {
        s.h = 0;
        contact(w, f, s, t0, params);
      } else {
        copyAir(s, prev);
        stepAir(s, dt, f.kPerYd * kAir, wind);
        if (s.h <= 0 && s.vh < 0) toGround(prev, s, w, f, t0, dt, params);
      }
      setBall(w, s.x, s.y, s.h, s.vx, s.vy, s.vh);
    },
  };

  /** Interpolates the ground contact inside the sub-step, then applies it. The rest of the sub-step is not re-flown. */
  const toGround = (a: AirState, s: AirState, w: TickWorld, f: BallFlight, t0: number, dt: number, params: BallParams): void => {
    const fr = a.h / (a.h - s.h);
    s.x = a.x + (s.x - a.x) * fr; s.y = a.y + (s.y - a.y) * fr; s.h = 0;
    s.vx = a.vx + (s.vx - a.vx) * fr; s.vy = a.vy + (s.vy - a.vy) * fr; s.vh = a.vh + (s.vh - a.vh) * fr;
    contact(w, f, s, t0 + dt * fr, params);
  };

  const detect: TickStage = {
    name: 'detect',
    run(w: TickWorld): void {
      const f = ballFlight(w);
      if (f.pending.length === 0) return;
      // Already in time order: one ball, appended as it happens.
      for (const e of f.pending) w.emit(e);
      f.pending.length = 0;
    },
  };

  return { move, detect };
}

/** Horizontal speed of the ball. */
export function ballGroundSpeed(w: TickWorld): number {
  return dSqrt(w.ball.velX * w.ball.velX + w.ball.velY * w.ball.velY);
}

