// The kick-play operation as a tick stage (J9.4.1, J9.4.2, J9.5.1, J9.6.1, J9.6.2). ball/kicks.ts is
// the math; this file decides when the foot meets the ball and hands the flight to the ball stage.
//
//   Place kick (field goal, try): the snap reaches the holder at tick 0. The operation is drawn then
//     (snap-to-foot time and quality), and the kick leaves the hold spot when that time has run, if
//     the holder still has the ball. A bobble yields no kick: the holder is then a runner. A kick that
//     reaches the plane of the goal ends the play there, good or not; one that comes down short of it
//     is a live ball in the field of play.
//   Punt: the punter kicks when the snap-to-foot time has run, if he still has the ball.
//   Free kick (kickoff, safety kick, onside kick, fair-catch kick): there is no snap; the ball is
//     kicked at tick 0 from the spot.
//
// Draws: stream `ball` of the kick's own flight index, operation first, then the kick (J13.2.1).
//
// Not built, and said so in the handoff: the kick block contest (J9.4.3), the kicker's approach as
// movement (the foot is taken to be at the ball on time), the fake, a hurried "mayday" unit, the
// called landing point of a kickoff (a parameter stands in for the call), and the punt type beyond
// distance against directional.
import {
  SLOTS_PER_TEAM, SLOT_COUNT, TICK_S, issToZ, roundSimS, roundYd,
  type Assignment, type KickKind, type PlayInput, type TickWorld,
} from '@gm/schema';
import { dSqrt } from '../dmath.ts';
import {
  ballParams, beginKickFlight, kickoffLaunch, launchKick, puntLaunch, puntOperationTimeS, resolveKickoff, resolveOnside, resolveOperation,
  resolvePlaceKick, resolvePunt, type KickLaunch, type Operation, type PlaceKick,
} from '../ball/index.ts';
import type { Perception } from '../perception/index.ts';
import type { SnapResult } from '../presnap/index.ts';
import type { PlayStage } from '../tick/loop.ts';
import { declareDead } from './finish.ts';
import { tickResolverParams } from './params.ts';

export const FREE_KICKS: readonly KickKind[] = ['kickoff', 'onside_kick', 'safety_kick', 'fair_catch_kick'];
export function isFreeKick(input: PlayInput): boolean {
  const c = input.calls.snapping;
  return c.unit === 'kick' && FREE_KICKS.includes(c.kickKind);
}

export interface KickOp {
  readonly stage: PlayStage;
  /** Call before the loop's `begin`. `assignments` are the kicking team's, team-slot order; `pressure` is D4's pressure of the moment. */
  setPlay(input: PlayInput, assignments: readonly Assignment[], pressure: number, snap: () => SnapResult | null): void;
}

const CLEAN: Operation = { timeS: 0, quality: 'clean', errorMult: 1 };

export function createKickOp(perception: Perception): KickOp {
  let kind: KickKind | null = null, aim: 'left' | 'middle' | 'right' | null = null;
  let kicker = -1, holder = -1, snapper = -1, pressure = 0;
  let snapOf: () => SnapResult | null = () => null;
  let started = false, kicked = false, op: Operation | null = null, opTimeS = 0;
  let result: { t: number; x: number; y: number; pk: PlaceKick } | null = null;

  const z = (w: TickWorld, slot: number, attr: string): number => issToZ(slot >= 0 ? (w.slots[slot]!.player.attributes[attr] ?? 50) : 50);
  const aimLat = (w: TickWorld): number => {
    const a = tickResolverParams(w.params)['kick.aimLatYd']!;
    return aim === 'left' ? a : aim === 'right' ? -a : 0;
  };
  /** Tells the 22 players a kick is in the air (J3.5.1), from the landing the launch predicted. */
  const announce = (w: TickWorld): void => {
    const e = w.events[w.events.length - 1]!;
    if (e.type === 'kick') perception.notifyBallInAir(w, kicker, e.landingSpot.x, e.landingSpot.y, Math.round(e.hangTimeS / TICK_S));
  };
  const launch = (w: TickWorld, k: KickKind, l: KickLaunch, kPerYd: number, spiral: boolean, bias: number, highHop: boolean, crossed: boolean): void => {
    launchKick(w, { kickKind: k, kickerSlot: kicker, launch: { x: w.ball.x, y: w.ball.y, h: l.startH, vx: l.vx, vy: l.vy, vh: l.vh }, kPerYd, spiral, bias, highHop, crossedLine: crossed });
    kicked = true;
    announce(w);
  };
  const placeKick = (w: TickWorld, k: KickKind, o: Operation): void => {
    const p = ballParams(w.params), rng = beginOrCurrent(w);
    const t0 = w.tick * TICK_S;
    const pk = resolvePlaceKick(rng, {
      geometry: w.geometry, environment: w.environment, holdX: w.ball.x, holdY: w.ball.y, attackDir: w.snappingAttackDir,
      zLeg: z(w, kicker, 'leg_strength_place_kick'), zAccuracy: z(w, kicker, 'accuracy_place_kick'), zComposure: z(w, kicker, 'composure'), pressure,
    }, o, p);
    launch(w, k, { ...pk.launch, startH: 0 }, p['fg.dragPerYd']!, false, 0, false, true);
    if (pk.atPlane !== null) result = { t: t0 + pk.atPlane.t, x: pk.atPlane.x, y: pk.atPlane.y, pk };
  };
  // The operation draws opened the kick's flight at tick 0; the kick's own draws continue the same stream.
  let stream: ReturnType<typeof beginKickFlight> | null = null;
  const beginOrCurrent = (w: TickWorld) => stream ?? (stream = beginKickFlight(w));

  const start = (w: TickWorld): void => {
    started = true;
    const p = ballParams(w.params), q = tickResolverParams(w.params), dir = w.snappingAttackDir;
    if (kind === 'kickoff' || kind === 'safety_kick') {
      const d = resolveKickoff(beginKickFlight(w), {
        zLeg: z(w, kicker, 'leg_strength_place_kick'), zPlacement: z(w, kicker, 'kickoff_placement'), type: 'deep',
        targetAlongYd: q['kick.kickoffTargetAlongYd']!, targetLatYd: aimLat(w),
      }, p);
      launch(w, kind, kickoffLaunch(w.ball.x, w.ball.y, dir, d, p), p['punt.dragPerYd']!, false, 0, false, true);
    } else if (kind === 'onside_kick') {
      const d = resolveOnside(beginKickFlight(w), w.ball.x, w.ball.y, dir, z(w, kicker, 'onside_and_specialty_kicks'), aimLat(w), p);
      launch(w, kind, d.launch, p['punt.dragPerYd']!, false, 0, d.highHop, true);
      w.emit({ type: 'detail', t: roundSimS(w.tick * TICK_S), code: `kickOp.onside.${d.quality}`, playerIds: [w.slots[kicker]!.playerId], spot: null, value: null });
    } else if (kind === 'fair_catch_kick') {
      placeKick(w, kind, CLEAN);
    } else {
      // A snapped kick. A loose snap leaves nothing to operate on: the ball is live on the ground.
      const snap = snapOf();
      if (snap === null || snap.quality === 'loose') { kicked = true; return; }
      if (kind === 'punt') {
        opTimeS = puntOperationTimeS(z(w, snapper, 'long_snap'), z(w, kicker, 'punt_get_off_time'), p) + snap.extraS;
      } else {
        stream = beginKickFlight(w);
        op = resolveOperation(stream, { zSnap: z(w, snapper, 'long_snap'), zHold: z(w, holder, 'holding'), environment: w.environment, hurried: false }, p);
        opTimeS = op.timeS + snap.extraS;
        if (op.quality !== 'clean') w.emit({ type: 'detail', t: 0, code: `kickOp.${op.quality}`, playerIds: holder >= 0 ? [w.slots[holder]!.playerId] : [], spot: null, value: op.errorMult });
        if (op.quality === 'bobble') kicked = true;
      }
    }
  };

  const strike = (w: TickWorld): void => {
    const has = kind === 'punt' ? kicker : holder;
    // The man who should have the ball lost it (a tackle is the carrier module's, a fumble too): no kick.
    if (w.ball.kind !== 'held' || w.ball.carrierSlot !== has) { kicked = true; return; }
    if (kind !== 'punt') { placeKick(w, kind!, op!); return; }
    const p = ballParams(w.params), q = tickResolverParams(w.params), pl = w.players, dir = w.snappingAttackDir;
    // J9.5.1 pressure: how close the nearest free opponent is when the ball is struck.
    let near = Infinity;
    for (let s = SLOTS_PER_TEAM; s < SLOT_COUNT; s++) {
      if (pl.engagement[s]! >= 0) continue;
      const dx = pl.posX[s]! - pl.posX[kicker]!, dy = pl.posY[s]! - pl.posY[kicker]!, d = dSqrt(dx * dx + dy * dy);
      if (d < near) near = d;
    }
    const range = q['kick.pressureRangeYd']!, press = near >= range ? 0 : 1 - near / range;
    const d = resolvePunt(beginKickFlight(w), {
      zLeg: z(w, kicker, 'leg_strength_punt'), zHang: z(w, kicker, 'hang_time'), zDirectional: z(w, kicker, 'directional_punting'),
      type: aim === 'left' || aim === 'right' ? 'directional' : 'distance', pressure: press,
    }, p);
    const behindLine = -(w.ball.x - w.frame.originX) * dir;
    launch(w, 'punt', puntLaunch(w.ball.x, w.ball.y, dir, d, aimLat(w), p), p['punt.dragPerYd']!, d.spiral, d.bias, false, d.distYd > behindLine);
    if (d.shank) w.emit({ type: 'detail', t: roundSimS(w.tick * TICK_S), code: 'kickOp.shank', playerIds: [w.slots[kicker]!.playerId], spot: null, value: null });
  };

  const stage: PlayStage = {
    name: 'interact',
    begin(): void { started = false; kicked = false; op = null; opTimeS = 0; result = null; stream = null; },
    run(w: TickWorld): void {
      if (kind === null || w.tick < 0 || w.deadAtTick !== null) return;
      if (!started) start(w);
      if (!kicked && w.tick * TICK_S + 1e-9 >= opTimeS) strike(w);
      if (result !== null) {
        // Something touched the kick on its way (a block, once that contest exists): the flight is no longer the drawn one.
        if (w.ball.kind !== 'kickInFlight') { result = null; return; }
        if ((w.tick + 1) * TICK_S + 1e-9 >= result.t) {
          const good = result.pk.result === 'good';
          declareDead(w, good ? 'kick_through_uprights' : result.pk.hit !== 'none' ? 'kick_hit_goal' : 'kick_failed', result.t, roundYd(result.x), roundYd(result.y), -1);
        }
      }
    },
  };

  return {
    stage,
    setPlay(input, assignments, pressureOfMoment, snap) {
      const c = input.calls.snapping;
      kind = c.unit === 'kick' ? c.kickKind : null;
      aim = c.unit === 'kick' ? c.direction : null;
      const find = (type: string): number => assignments.findIndex((a) => a.behavior.type === type);
      kicker = find('kicker'); holder = find('holder'); snapper = find('snapper');
      if (kicker < 0) kicker = 0;
      pressure = pressureOfMoment; snapOf = snap;
    },
  };
}
