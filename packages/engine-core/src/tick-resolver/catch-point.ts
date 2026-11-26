// The catch point as a tick stage (J6.5.1; build plan WP-23). The contest folder holds the chances;
// this file is the stage that finds the moment a thrown ball comes within a player's reach and applies
// the result to the ball.
//
// What it does on each live tick with a pass in the air, after the ball has moved (J1.3.1):
//   1. Reach test. The ball's path over the tick is a segment. A player can play the ball when the
//      segment passes inside his catch radius (J6.5.1 step 1) below his reach height. The intended
//      receiver, and any man who has located the ball (J3.5.1), is granted the same adjustment to the
//      ball in flight that the quarterback's own estimate assumes (`qb.judge.reachAdjustYd`), because
//      the player AI does not yet steer a man to a ball in the air.
//   2. A man of the passing team in reach: uncontested (step 2) when no defender is within the
//      contested distance of him, else the contested softmax (step 3) against the nearest defender.
//   3. Only a defender in reach: he is alone at the ball (step 4).
//   4. A tip (step 5) sends the ball on with a J9 deflection and every man re-enters from the next tick.
//   5. A catch or interception near a boundary takes the feet-in-bounds draw (step 6).
// One ball is resolved at most once per tick, the nearest approach in time first.
//
// Draws: stream `contest`, keyed [game, play, lowerPlayerId, higherPlayerId, 'catch'] (J13.2.1); a man
// alone uses his own id twice. A tip's deflection draws from the flight's `ball` stream (J9.2.1).
//
// Not built, and said so in the handoff: the "survive the ground" draw (nothing says yet when a
// receiver is going to the ground), the simultaneous catch (B5), separation and releases (J6.4), and a
// defender choosing the man over the ball (K1). The hit as the ball arrives is read from bodies only.
import { MOVE_MODES, SLOT_COUNT, TICK_S, issToZ, roundSimS, roundYd, type TickWorld, type TruthEvent } from '@gm/schema';
import { airDrag, airState, ballFlight, ballParams, ballStream, deflect, flyToHeight, setFlightVelocity, windFromEnvironment } from '../ball/index.ts';
import type { Contests, DefenderPosition } from '../contest/index.ts';
import { dSqrt } from '../dmath.ts';
import type { Perception } from '../perception/index.ts';
import { qbParams } from '../qb/params.ts';
import type { PlayStage } from '../tick/loop.ts';
import { COVERING, READING, RECEIVING, opposingZ } from '../tick/opposition.ts';
import { declareDead } from './finish.ts';
import { tickResolverParams } from './params.ts';

const DOWN = MOVE_MODES.indexOf('down');
type CatchOutcome = Extract<TruthEvent, { type: 'catch_point' }>['outcome'];

export interface CatchPointStage {
  readonly stage: PlayStage;
  /** Call before the loop's `begin`. */
  setPlay(contests: Contests): void;
}

export function createCatchPointStage(perception: Perception): CatchPointStage {
  let contests: Contests | null = null;
  let cursor = 0;
  // The flight being watched.
  let passer = -1, intended = -1, forward = true, throwaway = false, watching = false, settled = false, tipped = false;
  // Where the ball was when this stage last ran.
  let prevX = 0, prevY = 0, prevH = 0, prevInAir = false;
  const reachOf = new Float64Array(SLOT_COUNT), distOf = new Float64Array(SLOT_COUNT), fracOf = new Float64Array(SLOT_COUNT);
  const located = new Uint8Array(SLOT_COUNT);
  const est = new Float64Array(2);
  const air = airState(0, 0, 0, 0, 0, 0);

  const slotOfId = (w: TickWorld, id: number | null): number => { if (id === null) return -1; for (let s = 0; s < SLOT_COUNT; s++) if (w.slots[s]!.playerId === id) return s; return -1; };
  const upright = (w: TickWorld, s: number): boolean => w.players.moveMode[s] !== DOWN && w.tick >= w.players.onGroundUntilTick[s]!;
  const z = (w: TickWorld, s: number, id: string): number => issToZ(w.slots[s]!.player.attributes[id]!) - w.players.dFatigueZ[s]! - w.players.dInjuryZ[s]!;

  function emit(w: TickWorld, t: number, outcome: CatchOutcome, x: number, y: number, catcher: number, defenders: readonly number[], feet: number, contested: boolean, marginYd: number | null): void {
    w.emit({
      type: 'catch_point', t: roundSimS(t), marginYd: marginYd === null ? null : roundYd(marginYd), marginS: null, visibility: contested ? 'crowded' : 'open', outcome,
      spot: { x: roundYd(x), y: roundYd(y) }, intendedId: intended >= 0 ? w.slots[intended]!.playerId : null, catcherId: catcher >= 0 ? w.slots[catcher]!.playerId : null,
      defenderIds: defenders.map((d) => w.slots[d]!.playerId), feetInBounds: feet, contested,
    });
  }

  /** Yards of room between a man and the nearest sideline or end line; negative when he is out. */
  function room(w: TickWorld, s: number): number {
    const x = w.players.posX[s]!, y = w.players.posY[s]!, g = w.geometry;
    let r = x; if (g.lengthYd - x < r) r = g.lengthYd - x; if (y < r) r = y; if (g.widthYd - y < r) r = g.widthYd - y;
    return r;
  }

  /** The ball stops being a clean pass: it loses most of its pace and falls (a drop or a breakup). */
  function knockDown(w: TickWorld, keep: number): void {
    const b = w.ball;
    b.velX *= keep; b.velY *= keep; if (b.velHeight > 0) b.velHeight = 0;
  }

  function give(w: TickWorld, s: number, t: number, how: 'catch' | 'interception' | 'backward_pass'): void {
    const b = w.ball, pl = w.players, info = w.slots[s]!;
    b.kind = 'held'; b.carrierSlot = s; b.lastPossessorSlot = s; b.heightYd = 0; b.velHeight = 0; b.velX = 0; b.velY = 0; b.passForward = null; b.kickKind = null;
    b.x = pl.posX[s]!; b.y = pl.posY[s]!;
    pl.hasBall[s] = 1;
    w.emit({ type: 'possession', t: roundSimS(t), side: info.side, playerId: info.playerId, spot: { x: roundYd(b.x), y: roundYd(b.y) }, how });
  }

  function run(w: TickWorld): void {
    const from = cursor;
    cursor = w.events.length;
    const b = w.ball;
    if (w.tick < 0 || w.deadAtTick !== null) { prevInAir = false; return; }
    for (let i = from; i < cursor; i++) {
      const e = w.events[i]!;
      if (e.type !== 'pass_release') continue;
      passer = slotOfId(w, e.passerId); intended = slotOfId(w, e.targetId); forward = e.forward; throwaway = e.throwaway || e.spike;
      watching = true; settled = false; tipped = false; prevInAir = false;
    }
    if (!watching) return;
    const f = ballFlight(w);
    // A forward pass that reached the ground with nobody having played it (B5): the record says why.
    if (f.grounded !== null) {
      if (!settled) emit(w, f.grounded.t, throwaway || intended < 0 ? 'grounded' : 'uncatchable', f.grounded.x, f.grounded.y, -1, [], 0, false, null);
      watching = false; return;
    }
    if (b.kind !== 'passInFlight') { watching = false; return; }
    const x1 = b.x, y1 = b.y, h1 = b.heightYd;
    const x0 = prevInAir ? prevX : x1, y0 = prevInAir ? prevY : y1, h0 = prevInAir ? prevH : h1;
    prevX = x1; prevY = y1; prevH = h1; prevInAir = true;
    if (settled) return;

    const q = tickResolverParams(w.params), cp = contests!.catchPoint, pl = w.players;
    const adjust = qbParams(w.params)['judge.reachAdjustYd'];
    const sx = x1 - x0, sy = y1 - y0, len2 = sx * sx + sy * sy;
    const offenseSide = passer >= 0 ? w.slots[passer]!.side : w.slots[0]!.side;

    // Step 1: who can play the ball on this tick's path.
    let receiver = -1, defender = -1;
    for (let s = 0; s < SLOT_COUNT; s++) {
      reachOf[s] = 0; located[s] = 0;
      if (!upright(w, s) || (s === passer && !tipped)) continue;
      const mine = w.slots[s]!.side === offenseSide;
      const saw = s === intended || perception.landingEstimate(w, s, est);
      located[s] = saw ? 1 : 0;
      // A man locked in a block plays no ball; a man who never saw it cannot go and get it.
      if (pl.engagement[s]! >= 0 || (!saw && mine)) continue;
      let u = len2 > 0 ? ((pl.posX[s]! - x0) * sx + (pl.posY[s]! - y0) * sy) / len2 : 1;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const cx = x0 + sx * u, cy = y0 + sy * u, ch = h0 + (h1 - h0) * u;
      const dx = pl.posX[s]! - cx, dy = pl.posY[s]! - cy, d = dSqrt(dx * dx + dy * dy);
      const zLeap = z(w, s, 'explosiveness'), tall = w.slots[s]!.player.heightIn / 36;
      if (ch < 0 || ch > tall * q['catch.reachPerHeight']! + q['catch.leapPerZYd']! * zLeap) continue;
      const radius = cp.catchRadiusYd(zLeap, ch > tall) + (saw ? adjust : 0);
      if (d > radius) continue;
      reachOf[s] = radius; distOf[s] = d; fracOf[s] = u;
      if (mine) { if (receiver < 0 || (s === intended) || (receiver !== intended && d < distOf[receiver]!)) receiver = s; }
      else if (saw && (defender < 0 || d < distOf[defender]!)) defender = s;
    }
    if (receiver < 0 && defender < 0) return;

    const sit = w.situation, wet = w.environment.precip !== 'none' || w.environment.derived.grip < 1;
    const first = receiver >= 0 ? receiver : defender;
    const u = fracOf[first]!, t = (w.tick + u) * TICK_S, bx = x0 + sx * u, by = y0 + sy * u;
    const idOf = (s: number): number => w.slots[s]!.playerId;
    const stream = (a: number, c: number) => { const ia = idOf(a), ic = idOf(c); return w.streams('contest', [sit.gameId, sit.playNumber, ia < ic ? ia : ic, ia < ic ? ic : ia, 'catch']); };
    const feetRequired = w.rules.num('catch.feet_required');
    /** Step 6. Returns the feet he got down in bounds. */
    const feet = (s: number, rng: ReturnType<typeof stream>): number => {
      const r = room(w, s);
      if (r <= 0) return 0;
      if (r >= q['catch.boundaryRoomYd']!) return feetRequired;
      const ok = cp.resolveFeetInBounds({ zBodyControl: z(w, s, 'sideline_awareness'), feetRequired, tightness: 1 - r / q['catch.boundaryRoomYd']! }, rng);
      return ok ? feetRequired : feetRequired - 1;
    };
    const boundaryMargin = (s: number): number | null => { const r = room(w, s); return r < q['catch.boundaryRoomYd']! ? (r < 0 ? -r : r) : null; };
    /** A ball controlled with too few feet down in bounds is no catch (B5.2.1): the pass is incomplete where he was. */
    const outOfBounds = (s: number, got: number, defs: readonly number[], contested: boolean): void => {
      settled = true;
      emit(w, t, 'grounded', bx, by, -1, defs, got, contested, boundaryMargin(s));
      if (forward) declareDead(w, 'incomplete_pass', t, pl.posX[s]!, pl.posY[s]!, -1);
      else declareDead(w, 'ball_out_of_bounds', t, pl.posX[s]!, pl.posY[s]!, -1);
    };

    if (receiver < 0) {
      // Step 4: a defender alone at the ball.
      const rng = stream(defender, defender);
      // The other side of his hands: the receivers this ball was thrown among (a sharper group leaves him less of it).
      if (cp.resolveDefenderAlone(z(w, defender, 'hands') - q['catch.opposedShare']! * opposingZ(w, defender, RECEIVING, READING), rng) === 'interception') {
        const got = feet(defender, rng);
        if (got < feetRequired) { outOfBounds(defender, got, [defender], false); return; }
        settled = true;
        emit(w, t, 'interception', bx, by, defender, [defender], got > 2 ? 2 : got, false, boundaryMargin(defender));
        give(w, defender, t, forward ? 'interception' : 'backward_pass');
        return;
      }
      // He got a hand on it and could not hold it: charted as a pass defensed, never as the receiver's drop.
      settled = true;
      emit(w, t, 'breakup', bx, by, -1, [defender], 0, false, null);
      knockDown(w, q['catch.knockDownKeep']!);
      return;
    }

    // The nearest upright defender to the receiver decides whether the ball is contested (step 2).
    let near = defender, nearD = Infinity, hit = false;
    const rx = pl.posX[receiver]!, ry = pl.posY[receiver]!;
    for (let d = 0; d < SLOT_COUNT; d++) {
      if (w.slots[d]!.side === offenseSide || !upright(w, d)) continue;
      const dx = pl.posX[d]! - rx, dy = pl.posY[d]! - ry, dist = dSqrt(dx * dx + dy * dy);
      if (dist < nearD && pl.engagement[d]! < 0) { nearD = dist; if (defender < 0) near = d; }
      // Hit as the ball arrives: bodies touching and closing.
      const gap = dist - w.slots[d]!.movement.bodyRadiusYd - w.slots[receiver]!.movement.bodyRadiusYd;
      const closing = dist > 0 ? -((pl.velX[d]! - pl.velX[receiver]!) * dx + (pl.velY[d]! - pl.velY[receiver]!) * dy) / dist : 0;
      if (gap <= q['catch.hitGapYd']! && closing >= q['catch.hitClosingYps']!) hit = true;
    }
    const placementError = distOf[receiver]! / reachOf[receiver]!;
    const how = forward ? 'catch' as const : 'backward_pass' as const;
    const complete = (rng: ReturnType<typeof stream>, defs: readonly number[], contested: boolean): void => {
      const got = feet(receiver, rng);
      if (got < feetRequired) { outOfBounds(receiver, got, defs, contested); return; }
      settled = true;
      emit(w, t, 'catch', bx, by, receiver, defs, got > 2 ? 2 : got, contested, boundaryMargin(receiver));
      give(w, receiver, t, how);
    };

    if (defender < 0 && !(near >= 0 && cp.isContested(nearD))) {
      const rng = stream(receiver, receiver);
      // The other side of an open catch: the coverage closing on it. Equal rosters drop the same share at any level.
      const zHands = z(w, receiver, 'hands') - q['catch.opposedShare']! * opposingZ(w, receiver, COVERING, READING);
      if (cp.resolveUncontested({ zHands, placementError, hitAtCatch: hit, wet }, rng) === 'catch') { complete(rng, [], false); return; }
      settled = true;
      emit(w, t, 'drop', bx, by, -1, [], 0, false, null);
      knockDown(w, q['catch.knockDownKeep']!);
      return;
    }

    // Step 3: contested. Where the defender is relative to the receiver and the ball as it arrives.
    const d = near, dxr = pl.posX[d]! - rx, dyr = pl.posY[d]! - ry;
    const bv = dSqrt(b.velX * b.velX + b.velY * b.velY), rv = dSqrt(pl.velX[receiver]! * pl.velX[receiver]! + pl.velY[receiver]! * pl.velY[receiver]!);
    const ballSide = bv > 0 ? (dxr * b.velX + dyr * b.velY) / bv : 0;
    const behind = rv >= q['catch.movingYps']! && dxr * pl.velX[receiver]! + dyr * pl.velY[receiver]! < 0;
    const sawIt = located[d] === 1 || perception.landingEstimate(w, d, est);
    const position: DefenderPosition = ballSide < 0 && sawIt ? 'undercut' : behind ? 'trail' : 'inPhase';
    const rng = stream(receiver, d);
    const outcome = cp.resolveContested({
      zContestedCatch: z(w, receiver, 'contested_catch'), zBallSkills: z(w, d, 'ball_skills'), position, ballLocated: sawIt, placementError, hitAtCatch: hit, wet,
    }, rng);
    if (outcome === 'catch') { complete(rng, [d], true); return; }
    if (outcome === 'interception') {
      const got = feet(d, rng);
      if (got < feetRequired) { outOfBounds(d, got, [d], true); return; }
      settled = true;
      emit(w, t, 'interception', bx, by, d, [d], got > 2 ? 2 : got, true, boundaryMargin(d));
      give(w, d, t, forward ? 'interception' : 'backward_pass');
      return;
    }
    if (outcome === 'breakup') {
      settled = true;
      emit(w, t, 'breakup', bx, by, -1, [d], 0, true, null);
      knockDown(w, q['catch.knockDownKeep']!);
      return;
    }
    // Step 5: a tip. The ball flies on from the hands; everyone re-enters at step 1 from the next tick.
    emit(w, t, 'tip', bx, by, -1, [d], 0, true, null);
    const bp = ballParams(w.params);
    air.x = bx; air.y = by; air.h = h0 + (h1 - h0) * u; air.vx = b.velX; air.vy = b.velY; air.vh = b.velHeight;
    deflect(air, ballStream(w), bp);
    setFlightVelocity(w, air);
    prevX = air.x; prevY = air.y; prevH = air.h;
    tipped = true;
    const landing = flyToHeight(air, airDrag(f.kPerYd, w.environment), windFromEnvironment(w.environment), 0);
    if (landing !== null) perception.notifyBallInAir(w, passer >= 0 ? passer : receiver, landing.x, landing.y, Math.ceil(landing.t / TICK_S));
  }

  return {
    stage: {
      name: 'interact',
      begin(): void { cursor = 0; watching = false; settled = false; tipped = false; prevInAir = false; passer = -1; intended = -1; },
      run,
    },
    setPlay(c: Contests): void { contests = c; },
  };
}
