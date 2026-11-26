// J2.7.1 drill reproduction: scripted drills run through the same movement update as live play.
// The forty and its split are defined by distance alone. The 20-yard shuttle layout (5 yd one way,
// 10 yd the other, 5 yd back) is J2.2.2's, status 1 of 3. The three-cone drill is NOT here: J2.2.2
// gives only "three cones five yards apart in an L" and no running path, and the layout must be
// sourced into the fact register before it is coded.
import {
  NEUTRAL_ENVIRONMENT, SLOT_COUNT, SUBSTEPS, TICK_S,
  type DeterministicMath, type MovementParams, type ParamTable, type RuleSet, type SimPlayer, type SlotInfo, type TickWorld,
} from '@gm/schema';
import { fieldParams } from '../field/params.ts';
import { createTickWorld } from '../tick/world.ts';
import { kinParams } from './params.ts';
import { movementParams } from './movement-params.ts';
import { createMovement } from './update.ts';
import { createPathFollower, type Waypoint } from './steering.ts';

/** Drill definitions (J2.2.2), yards. */
export const SHUTTLE_FIRST_LEG_YD = 5;
export const SHUTTLE_SECOND_LEG_YD = 10;
/** Players the drill does not use stand this far apart so traffic rules never fire. Not a football number. */
const PARK_SPACING_YD = 1000;
const DRILL_LIMIT_S = 30;

const NO_RULES: RuleSet = {
  id: 'drill', level: 'pro', seasonYear: 0,
  num: (k) => { throw new Error(`a drill reads no rule key (${k})`); },
  bool: (k) => { throw new Error(`a drill reads no rule key (${k})`); },
  opt: (k) => { throw new Error(`a drill reads no rule key (${k})`); },
  keys: () => [],
};

/** A world with one real player (slot 0) at the play-frame origin, on dry neutral footing, with the field edges far out of reach. */
export function createDrillWorld(player: SimPlayer, movement: MovementParams, params: ParamTable, math: DeterministicMath): TickWorld {
  const slots: SlotInfo[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) slots.push({ slot: s, playerId: s + 1, side: s < SLOT_COUNT / 2 ? 0 : 1, role: 'drill', player, movement });
  const far = PARK_SPACING_YD * SLOT_COUNT, mid = far / 2;
  const w = createTickWorld({
    situation: {
      gameId: 1, playNumber: 1, driveNumber: 0, playKind: 'scrimmage', period: 1, overtime: false, clockTenths: 0, clockStatus: 'untimed',
      playClockAtSnapTenths: 0, offense: 0, attackDir: 1, down: null, distanceYd: null, goalToGo: false, ballX: mid, ballY: mid,
      lineToGainX: null, score: [0, 0], timeoutsLeft: [0, 0], insideTwoMinute: false, untimedDown: false,
    },
    geometry: { lengthYd: far, widthYd: far, goalLineWestX: 0, goalLineEastX: far, hashSouthY: 0, hashNorthY: far, centreY: 0, uprightSouthY: 0, uprightNorthY: 0, crossbarHeightYd: 0 },
    frame: { originX: mid, originY: mid, attackDir: 1, fieldSide: 'middle', lineToGainPx: 0, goalLinePx: far },
    environment: NEUTRAL_ENVIRONMENT,
    streams: () => { throw new Error('a drill draws no random number'); },
    math, rules: NO_RULES, params, slots,
  });
  w.players.posX[0] = mid; w.players.posY[0] = mid;
  for (let s = 1; s < SLOT_COUNT; s++) { w.players.posX[s] = PARK_SPACING_YD * s; w.players.posY[s] = PARK_SPACING_YD; }
  for (let s = 0; s < SLOT_COUNT; s++) w.players.fatigueNow[s] = 0;
  return w;
}

export interface SprintTimes { readonly splitS: number; readonly fortyS: number; readonly maxSpeedYps: number }

/** Straight sprint from rest through the real movement update. Times are interpolated inside the sub-step. */
export function simulateSprint(player: SimPlayer, movement: MovementParams, params: ParamTable, math: DeterministicMath, splitYd: number, fullYd: number): SprintTimes {
  const w = createDrillWorld(player, movement, params, math), move = createMovement(), dt = TICK_S / SUBSTEPS;
  const intent = w.intents[0]!;
  intent.target = { px: PARK_SPACING_YD, py: 0 }; intent.moveMode = 'sprint'; intent.arrival = 'through'; intent.effort = 1;
  move.stage.begin!(w);
  let t = 0, split = -1, max = 0;
  while (t < DRILL_LIMIT_S) {
    const before = w.players.posX[0]! - w.frame.originX;
    move.stage.run(w, dt);
    const after = w.players.posX[0]! - w.frame.originX, v = w.players.velX[0]!;
    if (v > max) max = v;
    if (split < 0 && after >= splitYd) split = t + (dt * (splitYd - before)) / (after - before);
    if (after >= fullYd) return { splitS: split, fortyS: t + (dt * (fullYd - before)) / (after - before), maxSpeedYps: max };
    t += dt;
    if (t - w.tick * TICK_S >= TICK_S - dt / 2) w.tick++;
  }
  throw new Error('sprint drill did not finish');
}

/** 20-yard shuttle through the real movement update and the path follower: two planted cuts of 180 degrees. */
export function simulateShuttle(player: SimPlayer, movement: MovementParams, params: ParamTable, math: DeterministicMath): number {
  const w = createDrillWorld(player, movement, params, math), move = createMovement(), follow = createPathFollower(move), dt = TICK_S / SUBSTEPS;
  const path: Waypoint[] = [
    { px: 0, py: SHUTTLE_FIRST_LEG_YD, kind: 'cut' },
    { px: 0, py: SHUTTLE_FIRST_LEG_YD - SHUTTLE_SECOND_LEG_YD, kind: 'cut' },
    { px: 0, py: PARK_SPACING_YD, kind: 'through' },
  ];
  follow.setPath(w, 0, path, 'sprint');
  move.stage.begin!(w);
  let t = 0, sub = 0;
  while (t < DRILL_LIMIT_S) {
    if (sub === 0) follow.steer(w, 0);
    const before = w.players.posY[0]! - w.frame.originY;
    move.stage.run(w, dt);
    const after = w.players.posY[0]! - w.frame.originY;
    if (follow.waypointIndex(0) === path.length - 1 && before < 0 && after >= 0) return t + (dt * (0 - before)) / (after - before);
    t += dt;
    if (++sub === SUBSTEPS) { sub = 0; w.tick++; }
  }
  throw new Error('shuttle drill did not finish');
}

/**
 * J2.2.2: the change-of-direction z whose simulated shuttle matches the player's listed time, by
 * bisection. Returns his position-profile z unchanged when he has no shuttle time. Content build
 * time only.
 */
export function fitChangeOfDirectionZ(player: SimPlayer, params: ParamTable, math: DeterministicMath, zRange = 4, steps = 24): number {
  const listed = player.tests.shuttleS;
  if (listed === null) return player.tests.changeOfDirectionZ;
  const kp = kinParams(params), fp = fieldParams(params);
  const time = (z: number) => simulateShuttle(player, movementParams(player, kp, fp, z).movement, params, math);
  let lo = -zRange, hi = zRange;
  if (time(lo) <= listed) return lo;
  if (time(hi) >= listed) return hi;
  for (let i = 0; i < steps; i++) { const mid = (lo + hi) / 2; if (time(mid) > listed) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
