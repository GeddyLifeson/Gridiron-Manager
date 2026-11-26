// J3 perception as the Perceive stage of the tick (J1.3.1). Every tick the true state is pushed into
// a ring buffer of 16 ticks; each player then reads the entities in his attention set from the buffer
// at his own delay, interpolated between ticks. All noise draws come from the player's `perception`
// stream, players in slot order (J3.1.1, J13.2.1). No object is allocated after `begin` (P6.3.1).
// Square roots use Math.sqrt directly: it is correctly rounded on every platform (J1.2.2).
//
// Peripheral position error (J3.1.2, standard deviation 0.5 yd): the bible does not say how often it
// is redrawn. Here it is drawn once when an entity enters a player's peripheral vision and held while
// it stays there, so a peripheral track is offset, not jittering at the tick rate. This is a reading
// of the leaf, listed in the WP report.
import {
  BALL_STATES, MOVE_MODES, SLOT_COUNT, SLOTS_PER_TEAM, TICK_S, issToZ, roundSimS,
  type PerceivedView, type RandomStream, type TickWorld,
} from '@gm/schema';
import { dCos, dSin, PI, TWO_PI } from '../dmath.ts';
import type { PlayStage } from '../tick/loop.ts';
import { perceptionParams, type PerceptionParams } from './params.ts';
import {
  attentionCapacity, callDeliveryChance, evidenceGain, evidenceNoiseSd, keyWeight, landingErrorSdYd, readThreshold,
} from './formulas.ts';
import { BALL_ENTITY, ENTITY_COUNT, PlayerView, READS, UNKNOWN_BALL } from './view.ts';

const RING = 16;
const DEG = PI / 180;
const Z_BEHIND = 0, Z_CENTRAL = 1, Z_PERIPHERAL = 2;
const HELD = BALL_STATES.indexOf('held'), LOOSE = BALL_STATES.indexOf('loose');
const PASS_FLIGHT = BALL_STATES.indexOf('passInFlight'), KICK_FLIGHT = BALL_STATES.indexOf('kickInFlight');
const M_DOWN = MOVE_MODES.indexOf('down');
const R_UNKNOWN = 0, R_RUN = 1, R_PASS = 2, R_SCREEN = 3, R_DRAW = 4;
const G_HEADING = 0, G_SLOT = 1, G_BALL = 2, G_POINT = 3, G_HOLD = 4;
const MAX_CALLS = 64;
/** Index of the ball in a key list. */
export const KEY_BALL = -1;

/**
 * What a key shows a defender this tick (J3.2.2, J3.3.2), supplied by content and the assignment
 * layer. Writes into `out`: [0] evidence from the assigned key (+ toward run, - toward pass),
 * [1] its side (+1 the offense's left, -1 its right, 0 none), [2] evidence from backfield flow,
 * [3] its side, [4] evidence of a screen, [5] evidence of a draw. `delayTicks` is how far back the
 * defender is seeing, so the source can describe the key as of then.
 */
export type EvidenceSource = (world: TickWorld, viewerSlot: number, keySlot: number, delayTicks: number, out: Float64Array) => void;

export interface PerceptionOptions {
  readonly evidence?: EvidenceSource | null;
  /** Test modes of J3.1.1 acceptance 1 and 2. Never set in a game. */
  readonly test?: { readonly fixedDelayS?: number; readonly fullAttention?: boolean; readonly noNoise?: boolean };
}

/** Per-play settings of one player's perception, written by the assignment layer (J4, J5) before the snap. */
export interface PerceptionConfig {
  /** Entities he should track, in priority order; the first is his primary key (J3.1.2). `KEY_BALL` is the ball. */
  keys?: readonly number[];
  /** D9.6.1 opponent preparation for this look, 0 to 1. */
  prep?: number;
  /** D9 complexity delay and J4.5.1 hesitation delay, seconds. */
  dComplexityS?: number;
  dKnowledgeS?: number;
  /** J3.4.1 where his eyes start the play: with his hips (the default) or on the ball (a zone defender's eyes). */
  gaze?: 'hips' | 'ball';
  /** True for a defender who reads a run-pass key (J3.2.2). */
  readsKeys?: boolean;
  /** Starting evidence from the situation prior (J3.3.1): positive leans run. */
  prior?: number;
  /** The call's aggression tag g (J3.2.2). */
  aggression?: number;
  /** A defensive lineman or second-level defender, subject to the one occlusion rule of J3.1.2. */
  boxDefender?: boolean;
}

export interface Perception {
  readonly stage: PlayStage;
  view(slot: number): PerceivedView;
  /** Call before the loop's `begin` for the play (settings persist until changed). */
  configure(slot: number, config: PerceptionConfig): void;
  /** J3.4.1 gaze rules. The eyes turn toward the target at the gaze rate. */
  gazeAtSlot(slot: number, target: number): void;
  gazeAtBall(slot: number): void;
  gazeAtPoint(slot: number, px: number, py: number): void;
  gazeWithHips(slot: number): void;
  /** J3.1.2: `hiddenSlot` cannot be seen by box defenders, unless he is their primary key, until `untilTick`. */
  setOcclusion(hiddenSlot: number, untilTick: number): void;
  /** J3.5.1: a pass or kick left `passerSlot` this tick and will come down at a field-frame point after `flightTicks`. A tip calls it again. */
  notifyBallInAir(world: TickWorld, passerSlot: number, landingX: number, landingY: number, flightTicks: number): void;
  /** J3.5.1: the player's estimate of the landing point, play frame, written to `out` as [px, py]. False until he has seen the ball. */
  landingEstimate(world: TickWorld, slot: number, out: Float64Array): boolean;
  /**
   * J3.6.1: one uniform per listener from the listener's stream, listeners in ascending slot order.
   * A delivered call reaches the listener's view after the call delay. Returns how many got it.
   */
  deliverCall(world: TickWorld, senderSlot: number, listeners: readonly number[], call: string, noise: number, cohesion: number): number;
  /** His current key delay in seconds (J3.2.1). */
  keyDelay(slot: number): number;
  /** How many entities were in his attention set this tick, the ball not counted. */
  attentionCount(slot: number): number;
}

export function createPerception(options: PerceptionOptions = {}): Perception {
  const evidenceSource = options.evidence ?? null;
  const fixedDelay = options.test?.fixedDelayS, fullAttention = options.test?.fullAttention === true, noNoise = options.test?.noNoise === true;
  const views: PlayerView[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) views.push(new PlayerView(s));

  // Ring buffer of true state (field frame).
  const rx = new Float64Array(RING * SLOT_COUNT), ry = new Float64Array(RING * SLOT_COUNT);
  const rvx = new Float64Array(RING * SLOT_COUNT), rvy = new Float64Array(RING * SLOT_COUNT);
  const rbx = new Float64Array(RING), rby = new Float64Array(RING), rbvx = new Float64Array(RING), rbvy = new Float64Array(RING);
  const rbKind = new Uint8Array(RING), rbCarrier = new Int8Array(RING);
  let head = 0;

  // Per-play configuration and state, by slot.
  const keys: number[][] = [];
  for (let s = 0; s < SLOT_COUNT; s++) keys.push([]);
  const f = () => new Float64Array(SLOT_COUNT);
  const prep = f(), dComplexity = f(), dKnowledge = f(), prior = f(), aggression = f();
  const readsKeys = new Uint8Array(SLOT_COUNT), boxDefender = new Uint8Array(SLOT_COUNT);
  const gazeKind = new Uint8Array(SLOT_COUNT), gazeSlot = new Int8Array(SLOT_COUNT), gazePx = f(), gazePy = f();
  const recIss = f(), zRec = f(), zDisc = f(), zTrack = f(), zTalk = f(), capacity = new Uint8Array(SLOT_COUNT), cosPeripheral = f();
  const delayNow = f(), gazeWas = f().fill(Number.NaN), attended = new Uint8Array(SLOT_COUNT);
  const evidence = f(), sideEvidence = f(), screenEvidence = f(), drawEvidence = f();
  const readCode = new Uint8Array(SLOT_COUNT), pendingRead = new Uint8Array(SLOT_COUNT), pendingAt = new Int32Array(SLOT_COUNT);
  const lastSeen = new Int32Array(SLOT_COUNT * ENTITY_COUNT);
  const zone = new Uint8Array(ENTITY_COUNT), picked = new Uint8Array(ENTITY_COUNT), dist2 = new Float64Array(ENTITY_COUNT);
  const periOn = new Uint8Array(SLOT_COUNT * SLOT_COUNT), periX = new Float64Array(SLOT_COUNT * SLOT_COUNT), periY = new Float64Array(SLOT_COUNT * SLOT_COUNT);
  const cosPeripheralSq = f(), gazeCos = f(), gazeSin = f(), threshold = f(), keyW = f(), gain = f(), noiseSd = f();
  /** Arguments of `sample`: [delay s, error px, error py]. Passed in an array so no number is boxed at the call (P6.3.1). */
  const sa = new Float64Array(3);
  const ev = new Float64Array(6);
  const streams: (RandomStream | null)[] = new Array<RandomStream | null>(SLOT_COUNT).fill(null);
  let occludedSlot = -1, occludedUntil = -2147483648;
  // Ball in the air (J3.5.1).
  let airActive = false, airLandPx = 0, airLandPy = 0, airRelease = 0, airFlight = 1;
  const airSeenAt = new Int32Array(SLOT_COUNT), airErrX = f(), airErrY = f(), airDrawn = new Uint8Array(SLOT_COUNT);
  // Calls on their way (J3.6.1).
  const callSlot = new Int8Array(MAX_CALLS), callTick = new Int32Array(MAX_CALLS), callName: string[] = new Array<string>(MAX_CALLS).fill('');
  let calls = 0;
  let P: PerceptionParams | null = null, cosCentralSq = 0;

  const push = (w: TickWorld): void => {
    head = (head + 1) % RING;
    const base = head * SLOT_COUNT, pl = w.players;
    for (let s = 0; s < SLOT_COUNT; s++) { rx[base + s] = pl.posX[s]!; ry[base + s] = pl.posY[s]!; rvx[base + s] = pl.velX[s]!; rvy[base + s] = pl.velY[s]!; }
    // A held ball moves with the man who holds it (the ball record keeps no velocity of its own while held), so a
    // player who sees the ball but is not watching the carrier himself still sees which way it is going.
    const held = w.ball.kind === 'held' && w.ball.carrierSlot >= 0 ? w.ball.carrierSlot : -1;
    rbx[head] = w.ball.x; rby[head] = w.ball.y;
    rbvx[head] = held >= 0 ? pl.velX[held]! : w.ball.velX; rbvy[head] = held >= 0 ? pl.velY[held]! : w.ball.velY;
    rbKind[head] = BALL_STATES.indexOf(w.ball.kind); rbCarrier[head] = w.ball.carrierSlot;
  };
  const back = (ticks: number): number => (head - ticks + RING * 2) % RING;

  /**
   * Zone of an entity (a slot, or BALL_ENTITY) in a viewer's vision, from the cosine of the angle off
   * his gaze, compared in squares: no arctangent, no root. Takes indexes only, so nothing is boxed.
   */
  const zoneOf = (w: TickWorld, s: number, e: number): number => {
    const x = e === BALL_ENTITY ? w.ball.x : w.players.posX[e]!, y = e === BALL_ENTITY ? w.ball.y : w.players.posY[e]!;
    const dx = x - w.players.posX[s]!, dy = y - w.players.posY[s]!;
    const d2 = dx * dx + dy * dy;
    if (d2 === 0) return Z_CENTRAL;
    const dot = dx * gazeCos[s]! + dy * gazeSin[s]!, dot2 = dot * dot;
    if (dot > 0 && dot2 >= cosCentralSq * d2) return Z_CENTRAL;
    if (w.players.moveMode[s] === M_DOWN) return Z_BEHIND; // knocked down: only what is in front of him (J3.1.1)
    const inside = cosPeripheral[s]! >= 0 ? dot >= 0 && dot2 >= cosPeripheralSq[s]! * d2 : dot >= 0 || dot2 <= cosPeripheralSq[s]! * d2;
    return inside ? Z_PERIPHERAL : Z_BEHIND;
  };

  /** J3.2.1 key delay into `delayNow[s]`. The same arithmetic as `keyDelayS` in formulas.ts, written out so no number crosses a call (a test holds the two equal). */
  const setKeyDelay = (w: TickWorld, s: number, p: PerceptionParams): void => {
    if (fixedDelay !== undefined) { delayNow[s] = fixedDelay; return; }
    let fat = w.players.fatigueNow[s]!;
    fat = fat < 0 ? 0 : fat > 1 ? 1 : fat;
    const d = p.keyDelayBaseS! * (p.keyDelayRecIntercept! - recIss[s]! / p.keyDelayRecDivisor!) * (1 - p.keyDelayPrepCut! * prep[s]!)
      + p.keyDelayFatigueS! * fat * fat + dComplexity[s]! + dKnowledge[s]!;
    delayNow[s] = d < p.keyDelayFloorS! ? p.keyDelayFloorS! : d > p.delayCapS! ? p.delayCapS! : d;
  };

  /** Receiver numbers (J4.1.2): eligible players of a team, counted from the sideline in on each side of the ball. */
  const numberReceivers = (w: TickWorld): void => {
    const pl = w.players, frame = w.frame, dir = frame.attackDir;
    for (let s = 0; s < SLOT_COUNT; s++) {
      let n = 0;
      const team = s < SLOTS_PER_TEAM ? 0 : 1;
      const py = (pl.posY[s]! - frame.originY) * dir;
      if (pl.eligible[s] === 1 && py !== 0) {
        n = 1;
        for (let o = 0; o < SLOT_COUNT; o++) {
          if (o === s || pl.eligible[o] !== 1 || (o < SLOTS_PER_TEAM ? 0 : 1) !== team) continue;
          const opy = (pl.posY[o]! - frame.originY) * dir;
          if ((opy > 0) === (py > 0) && opy !== 0 && (py > 0 ? opy > py : opy < py)) n++;
        }
      }
      for (let v = 0; v < SLOT_COUNT; v++) views[v]!.receiverNumbers[s] = n;
    }
  };

  const begin = (w: TickWorld): void => {
    const p = P = perceptionParams(w.params);
    const cosCentral = dCos(p.centralHalfAngleDeg! * DEG);
    cosCentralSq = cosCentral * cosCentral;
    periOn.fill(0);
    const frame = w.frame, dir = frame.attackDir, pl = w.players;
    head = 0;
    // J3.1.1 edge case: at the snap the buffer is filled with the pre-snap picture.
    for (let i = 0; i < RING; i++) push(w);
    const carrier = BALL_STATES.indexOf(w.ball.kind) === HELD ? w.ball.carrierSlot : -1;
    for (let s = 0; s < SLOT_COUNT; s++) {
      const info = w.slots[s]!, a = info.player.attributes, v = views[s]!;
      recIss[s] = a['play_recognition']!; zRec[s] = issToZ(recIss[s]!); zDisc[s] = issToZ(a['assignment_discipline']!);
      zTrack[s] = issToZ(a['ball_tracking']!); zTalk[s] = issToZ(a['football_intelligence']!);
      capacity[s] = attentionCapacity(issToZ(a['processing_speed']!), p);
      const half = p.peripheralHalfAngleDeg! + p.peripheralPerZDeg! * zRec[s]!;
      cosPeripheral[s] = dCos((half > 180 ? 180 : half) * DEG);
      cosPeripheralSq[s] = cosPeripheral[s]! * cosPeripheral[s]!;
      streams[s] = w.streams('perception', [w.situation.gameId, w.situation.playNumber, info.playerId]);
      evidence[s] = prior[s]!; sideEvidence[s] = 0; screenEvidence[s] = 0; drawEvidence[s] = 0;
      readCode[s] = R_UNKNOWN; pendingRead[s] = R_UNKNOWN; pendingAt[s] = 0;
      v.read.read = 'unknown'; v.read.side = 'none'; v.read.confidence = 0;
      v.carrier = carrier; v.heardCalls.length = 0; v.ballKindCode = BALL_STATES.indexOf(w.ball.kind);
      v.tSinceSnapS = roundSimS(w.tick * TICK_S);
      v.landOn = false; v.lockedSlot = -1;
      { const south = (0 - w.frame.originY) * w.frame.attackDir, north = (w.geometry.widthYd - w.frame.originY) * w.frame.attackDir;
        v.bounds.lo = south < north ? south : north; v.bounds.hi = south < north ? north : south; }
      for (let e = 0; e < SLOT_COUNT; e++) {
        const ent = v.entities[e]!;
        ent.px = (pl.posX[e]! - frame.originX) * dir + 0; ent.py = (pl.posY[e]! - frame.originY) * dir + 0;
        ent.velPx = pl.velX[e]! * dir + 0; ent.velPy = pl.velY[e]! * dir + 0; ent.staleTicks = 0;
        v.valid[e] = e === s ? 0 : 1; lastSeen[s * ENTITY_COUNT + e] = w.tick;
      }
      const b = v.entities[BALL_ENTITY]!;
      b.px = (w.ball.x - frame.originX) * dir + 0; b.py = (w.ball.y - frame.originY) * dir + 0; b.velPx = 0; b.velPy = 0; b.staleTicks = 0;
      v.valid[BALL_ENTITY] = 1; lastSeen[s * ENTITY_COUNT + BALL_ENTITY] = w.tick;
      v.self.px = (pl.posX[s]! - frame.originX) * dir + 0; v.self.py = (pl.posY[s]! - frame.originY) * dir + 0;
      v.self.velPx = pl.velX[s]! * dir + 0; v.self.velPy = pl.velY[s]! * dir + 0; v.self.headingRad = pl.headingRad[s]!;
      airDrawn[s] = 0; attended[s] = 0; gazeWas[s] = pl.gazeRad[s]!;
      setKeyDelay(w, s, p);
      gazeCos[s] = dCos(pl.gazeRad[s]!); gazeSin[s] = dSin(pl.gazeRad[s]!);
      threshold[s] = readThreshold(zDisc[s]!, aggression[s]!, p); keyW[s] = keyWeight(zDisc[s]!, p);
      gain[s] = evidenceGain(zRec[s]!, p); noiseSd[s] = evidenceNoiseSd(zRec[s]!, p);
    }
    numberReceivers(w);
    airActive = false; calls = 0; occludedSlot = -1; occludedUntil = -2147483648;
  };

  /** Reads one entity from the ring at a delay and writes it to the view in the play frame. */
  const sample = (w: TickWorld, v: PlayerView, e: number): void => {
    const age = sa[0]! / TICK_S;
    let i0 = Math.floor(age + 1e-9), frac = age - i0;
    if (frac < 1e-9) frac = 0;
    if (i0 >= RING - 1) { i0 = RING - 1; frac = 0; }
    const a = back(i0), b = frac > 0 ? back(i0 + 1) : a;
    let x: number, y: number, vx: number, vy: number;
    if (e === BALL_ENTITY) {
      x = rbx[a]! + (rbx[b]! - rbx[a]!) * frac; y = rby[a]! + (rby[b]! - rby[a]!) * frac;
      vx = rbvx[a]! + (rbvx[b]! - rbvx[a]!) * frac; vy = rbvy[a]! + (rbvy[b]! - rbvy[a]!) * frac;
    } else {
      const ia = a * SLOT_COUNT + e, ib = b * SLOT_COUNT + e;
      x = rx[ia]! + (rx[ib]! - rx[ia]!) * frac; y = ry[ia]! + (ry[ib]! - ry[ia]!) * frac;
      vx = rvx[ia]! + (rvx[ib]! - rvx[ia]!) * frac; vy = rvy[ia]! + (rvy[ib]! - rvy[ia]!) * frac;
    }
    const frame = w.frame, dir = frame.attackDir, ent = v.entities[e]!;
    ent.px = (x - frame.originX) * dir + sa[1]!; ent.py = (y - frame.originY) * dir + sa[2]!;
    ent.velPx = vx * dir + 0; ent.velPy = vy * dir + 0; ent.staleTicks = 0;
    v.valid[e] = 1;
  };

  const run = (w: TickWorld): void => {
    const p = P ?? (P = perceptionParams(w.params));
    const pl = w.players, frame = w.frame, dir = frame.attackDir, tick = w.tick;
    // The count is of where the receivers line up, so it is taken again at the snap: at the start of the play clock
    // the units are still in their huddles (J5.1) and a count made there numbers nobody rightly.
    if (tick === 0) numberReceivers(w);
    push(w);
    for (let c = 0; c < calls;) {
      if (callTick[c]! <= tick) {
        views[callSlot[c]!]!.heardCalls.push(callName[c]!);
        calls--; callSlot[c] = callSlot[calls]!; callTick[c] = callTick[calls]!; callName[c] = callName[calls]!;
      } else c++;
    }
    const staleDrop = Math.floor(p.staleDropS! / TICK_S + 1e-9);
    const cap = p.delayCapS!;
    const ballKindNow = BALL_STATES.indexOf(w.ball.kind);
    const occluding = tick < occludedUntil ? occludedSlot : -1;

    for (let s = 0; s < SLOT_COUNT; s++) {
      const v = views[s]!, rng = streams[s]!, sx = pl.posX[s]!, sy = pl.posY[s]!;
      v.tSinceSnapS = roundSimS(tick * TICK_S);
      v.self.px = (sx - frame.originX) * dir + 0; v.self.py = (sy - frame.originY) * dir + 0;
      v.self.velPx = pl.velX[s]! * dir + 0; v.self.velPy = pl.velY[s]! * dir + 0; v.self.headingRad = pl.headingRad[s]!;

      // J3.4.1 gaze: turn the eyes toward the target, as last perceived, at the gaze rate.
      const gk = gazeKind[s]!;
      if (gk !== G_HOLD) {
        let want = pl.headingRad[s]!, has = gk === G_HEADING;
        let tx = 0, ty = 0;
        if (gk === G_SLOT && v.valid[gazeSlot[s]!] === 1) { tx = v.entities[gazeSlot[s]!]!.px; ty = v.entities[gazeSlot[s]!]!.py; has = true; }
        else if (gk === G_BALL && v.valid[BALL_ENTITY] === 1) { tx = v.entities[BALL_ENTITY]!.px; ty = v.entities[BALL_ENTITY]!.py; has = true; }
        // A man told to find the ball who has lost it looks back to where the play started: the ball comes from there.
        // Without this a receiver with his back to the passer could never turn his eyes to a ball he did not already see.
        else if (gk === G_BALL) { tx = 0; ty = 0; has = true; }
        else if (gk === G_POINT) { tx = gazePx[s]!; ty = gazePy[s]!; has = true; }
        if (has) {
          if (gk !== G_HEADING) {
            const dx = (tx - v.self.px) * dir, dy = (ty - v.self.py) * dir;
            want = dx === 0 && dy === 0 ? pl.gazeRad[s]! : w.math.atan2(dy, dx);
          }
          let turn = want - pl.gazeRad[s]!;
          while (turn > PI) turn -= TWO_PI;
          while (turn <= -PI) turn += TWO_PI;
          const maxTurn = p.gazeRateRadPs! * TICK_S;
          if (turn > maxTurn) turn = maxTurn; else if (turn < -maxTurn) turn = -maxTurn;
          if (turn !== 0) {
            let g = pl.gazeRad[s]! + turn;
            while (g > PI) g -= TWO_PI;
            while (g <= -PI) g += TWO_PI;
            pl.gazeRad[s] = g;
          }
        }
      }
      if (pl.gazeRad[s] !== gazeWas[s]) { gazeWas[s] = pl.gazeRad[s]!; gazeCos[s] = dCos(pl.gazeRad[s]!); gazeSin[s] = dSin(pl.gazeRad[s]!); }

      // J3.2.1 key delay.
      setKeyDelay(w, s, p);
      const kd = delayNow[s]!;
      const myKeys = keys[s]!, primary = myKeys.length > 0 ? myKeys[0]! : -2;
      const boxHidden = boxDefender[s] === 1 ? occluding : -1;

      // J3.1.2 field of view, then the attention set: keys first, in priority order, then the nearest others.
      for (let e = 0; e < SLOT_COUNT; e++) {
        picked[e] = 0;
        if (e === s) { zone[e] = Z_BEHIND; continue; }
        const felt = pl.engagement[s]! >= 0 && pl.engagement[e] === pl.engagement[s];
        let z = fullAttention || felt ? Z_CENTRAL : zoneOf(w, s, e);
        if (e === boxHidden && e !== primary && !fullAttention) z = Z_BEHIND;
        zone[e] = z;
        const dx = pl.posX[e]! - sx, dy = pl.posY[e]! - sy;
        dist2[e] = dx * dx + dy * dy;
      }
      let n = 0;
      const room = fullAttention ? SLOT_COUNT : capacity[s]!;
      for (let k = 0; k < myKeys.length && n < room; k++) {
        const e = myKeys[k]!;
        if (e >= 0 && e < SLOT_COUNT && zone[e] !== Z_BEHIND && picked[e] === 0) { picked[e] = 1; n++; }
      }
      while (n < room) {
        let best = -1;
        for (let e = 0; e < SLOT_COUNT; e++) if (zone[e] !== Z_BEHIND && picked[e] === 0 && (best < 0 || dist2[e]! < dist2[best]!)) best = e;
        if (best < 0) break;
        picked[best] = 1; n++;
      }
      attended[s] = n;
      const base = s * ENTITY_COUNT;
      for (let e = 0; e < SLOT_COUNT; e++) {
        if (e === s) continue;
        if (picked[e] === 1) {
          const peripheral = zone[e] === Z_PERIPHERAL;
          let d = kd;
          if (fixedDelay === undefined) {
            if (e !== primary) d += p.otherEntityDelayS!;
            if (peripheral) d += p.peripheralDelayS!;
            if (d > cap) d = cap;
          }
          const pi = s * SLOT_COUNT + e;
          sa[0] = d; sa[1] = 0; sa[2] = 0;
          if (!peripheral || noNoise || fixedDelay !== undefined) { periOn[pi] = 0; sample(w, v, e); }
          else {
            if (periOn[pi] === 0) { periOn[pi] = 1; periX[pi] = p.peripheralErrorYd! * rng.normal(); periY[pi] = p.peripheralErrorYd! * rng.normal(); }
            sa[1] = periX[pi]!; sa[2] = periY[pi]!;
            sample(w, v, e);
          }
          lastSeen[base + e] = tick;
        } else if (v.valid[e] === 1) {
          periOn[s * SLOT_COUNT + e] = 0;
          const stale = tick - lastSeen[base + e]!;
          if (stale > staleDrop) v.valid[e] = 0; else v.entities[e]!.staleTicks = stale;
        }
      }

      // J3.5 the ball. Held: seen with its carrier. In the air: after the key delay, later without eyes
      // on it. Loose: at once when near and facing it, later otherwise (J3.5.2).
      let bz = fullAttention ? Z_CENTRAL : zoneOf(w, s, BALL_ENTITY);
      if (ballKindNow === HELD && w.ball.carrierSlot === s) bz = Z_CENTRAL;
      if (ballKindNow === HELD && w.ball.carrierSlot === boxHidden && boxHidden !== primary && !fullAttention) bz = Z_BEHIND;
      let bd = -1;
      if (fixedDelay !== undefined) bd = bz !== Z_BEHIND ? fixedDelay : -1;
      else if (ballKindNow === LOOSE) {
        const dx = w.ball.x - sx, dy = w.ball.y - sy, near = p.looseBallNearYd!;
        if (bz !== Z_BEHIND && dx * dx + dy * dy <= near * near) bd = 0;
        else bd = kd + p.looseBallSeenDelayS! + (bz === Z_BEHIND ? p.looseBallUnseenDelayS! : 0);
      } else if (ballKindNow === PASS_FLIGHT || ballKindNow === KICK_FLIGHT) {
        if (bz !== Z_BEHIND) bd = kd + (bz === Z_CENTRAL ? 0 : p.ballCueDelayS!);
      } else if (bz !== Z_BEHIND) {
        bd = kd + (primary === KEY_BALL ? 0 : p.otherEntityDelayS!) + (bz === Z_PERIPHERAL ? p.peripheralDelayS! : 0);
      }
      if (bd >= 0) {
        if (bd > cap) bd = cap;
        sa[0] = bd; sa[1] = 0; sa[2] = 0;
        sample(w, v, BALL_ENTITY);
        lastSeen[base + BALL_ENTITY] = tick;
        const then = back(Math.floor(bd / TICK_S + 1e-9));
        v.ballKindCode = rbKind[then]!;
        // J3.5.2: the believed carrier updates when the true carrier of that moment is in his vision.
        const c = rbCarrier[then]!;
        if (rbKind[then] === HELD && c >= 0 && (c === s || zone[c] !== Z_BEHIND)) v.carrier = c;
        else if (rbKind[then] !== HELD) v.carrier = -1;
      } else if (v.valid[BALL_ENTITY] === 1) {
        const stale = tick - lastSeen[base + BALL_ENTITY]!;
        if (stale > staleDrop) { v.valid[BALL_ENTITY] = 0; v.ballKindCode = UNKNOWN_BALL; } else v.entities[BALL_ENTITY]!.staleTicks = stale;
      }

      // The man he is locked up with in a block is known to him by touch. A helper on a double team is not locked up.
      { const ci = w.players.engagement[s]!, k = ci >= 0 && ci < w.contests.length ? w.contests[ci]! : null;
        v.lockedSlot = k === null ? -1 : k.defenseSlot === s ? k.offenseSlot : k.offenseSlot === s ? k.defenseSlot : -1; }

      // J3.5.1 landing-point error: drawn once, when he first sees the ball in the air.
      if (airActive && airDrawn[s] === 0 && tick >= airSeenAt[s]!) {
        airErrX[s] = noNoise ? 0 : rng.normal(); airErrY[s] = noNoise ? 0 : rng.normal(); airDrawn[s] = 1;
      }
      // What he acts on: where he thinks it comes down, sharper as the flight goes on, while the ball is in the air.
      if (airActive && airDrawn[s] === 1 && (ballKindNow === PASS_FLIGHT || ballKindNow === KICK_FLIGHT)) {
        const sd = landingErrorSdYd((tick - airRelease) / airFlight, zTrack[s]!, p);
        v.landOn = true; v.land.px = airLandPx + airErrX[s]! * sd; v.land.py = airLandPy + airErrY[s]! * sd;
      } else v.landOn = false;

      // J3.2.2 run-pass key reading.
      if (readsKeys[s] === 1 && evidenceSource !== null && tick >= 0 && tick * TICK_S + 1e-9 >= kd && primary >= 0) {
        ev.fill(0);
        evidenceSource(w, s, primary, Math.floor(kd / TICK_S + 1e-9), ev);
        const wKey = keyW[s]!, gn = gain[s]!;
        const noise = noNoise ? 0 : noiseSd[s]! * rng.normal();
        evidence[s] = evidence[s]! + gn * (wKey * ev[0]! + (1 - wKey) * ev[2]!) + noise;
        sideEvidence[s] = sideEvidence[s]! + wKey * ev[0]! * ev[1]! + (1 - wKey) * ev[2]! * ev[3]!;
        screenEvidence[s] = screenEvidence[s]! + gn * ev[4]!; drawEvidence[s] = drawEvidence[s]! + gn * ev[5]!;
        const T = threshold[s]!;
        let now = R_UNKNOWN;
        if (screenEvidence[s]! >= T) now = R_SCREEN; else if (drawEvidence[s]! >= T) now = R_DRAW;
        else if (evidence[s]! >= T) now = R_RUN; else if (evidence[s]! <= -T) now = R_PASS;
        if (now !== R_UNKNOWN && now !== readCode[s] && now !== pendingRead[s]) {
          // A first read takes effect at once: he has already waited his key delay. Revising costs a fresh one.
          pendingRead[s] = now;
          pendingAt[s] = readCode[s] === R_UNKNOWN ? tick : tick + Math.ceil(kd / TICK_S - 1e-9);
        }
        if (pendingRead[s] !== R_UNKNOWN && tick >= pendingAt[s]!) {
          readCode[s] = pendingRead[s]!; pendingRead[s] = R_UNKNOWN;
          v.read.read = READS[readCode[s]!]!;
          w.emit({ type: 'detail', t: roundSimS(tick * TICK_S), code: `read_${READS[readCode[s]!]!}`, playerIds: [w.slots[s]!.playerId], spot: null, value: null });
        }
        const mag = evidence[s]! < 0 ? -evidence[s]! : evidence[s]!;
        v.read.confidence = mag >= T ? 1 : mag / T;
        v.setSide(readCode[s] === R_RUN ? sideEvidence[s]! : 0);
      }
    }
  };

  const setGaze = (slot: number, kind: number, target: number, px: number, py: number): void => {
    gazeKind[slot] = kind; gazeSlot[slot] = target; gazePx[slot] = px; gazePy[slot] = py;
  };

  return {
    stage: { name: 'perceive', begin, run },
    view: (slot) => views[slot]!,
    configure(slot: number, c: PerceptionConfig): void {
      if (c.keys !== undefined) { keys[slot]!.length = 0; for (const k of c.keys) keys[slot]!.push(k); }
      if (c.prep !== undefined) prep[slot] = c.prep;
      if (c.dComplexityS !== undefined) dComplexity[slot] = c.dComplexityS;
      if (c.dKnowledgeS !== undefined) dKnowledge[slot] = c.dKnowledgeS;
      if (c.readsKeys !== undefined) readsKeys[slot] = c.readsKeys ? 1 : 0;
      if (c.prior !== undefined) prior[slot] = c.prior;
      if (c.aggression !== undefined) aggression[slot] = c.aggression;
      if (c.boxDefender !== undefined) boxDefender[slot] = c.boxDefender ? 1 : 0;
      if (c.gaze !== undefined) setGaze(slot, c.gaze === 'ball' ? G_BALL : G_HEADING, 0, 0, 0);
    },
    gazeAtSlot: (slot, target) => setGaze(slot, G_SLOT, target, 0, 0),
    gazeAtBall: (slot) => setGaze(slot, G_BALL, 0, 0, 0),
    gazeAtPoint: (slot, px, py) => setGaze(slot, G_POINT, 0, px, py),
    gazeWithHips: (slot) => setGaze(slot, G_HEADING, 0, 0, 0),
    setOcclusion(hiddenSlot: number, untilTick: number): void { occludedSlot = hiddenSlot; occludedUntil = untilTick; },
    notifyBallInAir(w: TickWorld, passerSlot: number, landingX: number, landingY: number, flightTicks: number): void {
      const p = P ?? (P = perceptionParams(w.params)), dir = w.frame.attackDir;
      airActive = true; airRelease = w.tick; airFlight = flightTicks > 0 ? flightTicks : 1;
      airLandPx = (landingX - w.frame.originX) * dir; airLandPy = (landingY - w.frame.originY) * dir;
      for (let s = 0; s < SLOT_COUNT; s++) {
        const central = s === passerSlot || zoneOf(w, s, passerSlot) === Z_CENTRAL;
        const d = (fixedDelay !== undefined ? fixedDelay : delayNow[s]!) + (central || fullAttention ? 0 : p.ballCueDelayS!);
        airSeenAt[s] = w.tick + Math.ceil(d / TICK_S - 1e-9); airDrawn[s] = 0;
      }
    },
    landingEstimate(w: TickWorld, slot: number, out: Float64Array): boolean {
      if (!airActive || airDrawn[slot] !== 1) return false;
      const p = P ?? (P = perceptionParams(w.params));
      const sd = landingErrorSdYd((w.tick - airRelease) / airFlight, zTrack[slot]!, p);
      out[0] = airLandPx + airErrX[slot]! * sd; out[1] = airLandPy + airErrY[slot]! * sd;
      return true;
    },
    deliverCall(w: TickWorld, senderSlot: number, listeners: readonly number[], call: string, noise: number, cohesion: number): number {
      const p = P ?? (P = perceptionParams(w.params));
      let delivered = 0;
      const at = w.tick + Math.ceil(p.callDelayS! / TICK_S - 1e-9);
      for (let i = 0; i < listeners.length; i++) {
        const l = listeners[i]!;
        if (i > 0 && l <= listeners[i - 1]!) throw new Error('call listeners must be in ascending slot order (J3.6.1)');
        const rng = streams[l] ?? (streams[l] = w.streams('perception', [w.situation.gameId, w.situation.playNumber, w.slots[l]!.playerId]));
        const dx = w.players.posX[l]! - w.players.posX[senderSlot]!, dy = w.players.posY[l]! - w.players.posY[senderSlot]!;
        const chance = callDeliveryChance(noise, Math.sqrt(dx * dx + dy * dy), zTalk[senderSlot]!, zTalk[l]!, cohesion, p);
        if (rng.uniform() < chance && calls < MAX_CALLS) { callSlot[calls] = l; callTick[calls] = at; callName[calls] = call; calls++; delivered++; }
      }
      return delivered;
    },
    keyDelay: (slot) => delayNow[slot]!,
    attentionCount: (slot) => attended[slot]!,
  };
}
