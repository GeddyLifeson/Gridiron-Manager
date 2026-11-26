// Test support shared by the field, kinematics, tick and perception tests. Everything here is a
// FIXTURE: the rule values below are test inputs, not the game's rule data (WP-01 owns that).
import {
  ATTRIBUTE_IDS, NEUTRAL_ENVIRONMENT, SLOT_COUNT, SLOTS_PER_TEAM,
  type AttackDir, type GameSituation, type ParamTable, type RuleSet, type SimPlayer, type SlotInfo, type TickWorld,
} from '@gm/schema';
import { DMATH, streamSource, seedFromNumber } from '../../src/index.ts';
import { fieldGeometry, playFrame, fieldParams, PARAMS as FIELD_PARAMS } from '../../src/field/index.ts';
import { movementParams, kinParams, PARAMS as KIN_PARAMS } from '../../src/kinematics/index.ts';
import { PARAMS as PERCEPTION_PARAMS } from '../../src/perception/index.ts';
import { createTickWorld, paramTableFromFiles } from '../../src/tick/index.ts';

/** FIXTURE rule values. Pro-shaped and college-shaped hash distances so J1.1.1 acceptance 4 can be tested. */
export function fixtureRules(hashFt = 70.75, extra: Record<string, number> = {}): RuleSet {
  const values: Record<string, number> = {
    'field.goal_to_goal_yd': 100, 'field.end_zone_depth_ft': 30, 'field.width_ft': 160,
    'field.hash_from_sideline_ft': hashFt, 'field.goal_post_width_ft': 18.5, 'field.crossbar_height_ft': 10, ...extra,
  };
  return {
    id: 'fixture_0000', level: 'pro', seasonYear: 0,
    num: (k) => { const v = values[k]; if (v === undefined) throw new Error(`fixture has no rule key ${k}`); return v; },
    bool: (k) => { throw new Error(`fixture has no rule key ${k}`); },
    opt: (k) => { throw new Error(`fixture has no rule key ${k}`); },
    keys: () => Object.keys(values),
  };
}

export const PARAM_TABLE: ParamTable = paramTableFromFiles([FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS]);
export const KP = kinParams(PARAM_TABLE);
export const FP = fieldParams(PARAM_TABLE);

export interface PlayerSpec { fortyS?: number; tenSplitS?: number; weightLb?: number; codZ?: number; shuttleS?: number | null; attributes?: Record<string, number>; freshness?: number }

export function fixturePlayer(id: number, spec: PlayerSpec = {}): SimPlayer {
  const attributes: Record<string, number> = {};
  for (const a of ATTRIBUTE_IDS) attributes[a] = 50;
  Object.assign(attributes, spec.attributes ?? {});
  return {
    playerId: id, position: 'FIX', jersey: id % 100, heightIn: 73, weightLb: spec.weightLb ?? 200, ageYears: 25, attributes,
    tests: { fortyS: spec.fortyS ?? 4.52, tenSplitS: spec.tenSplitS ?? 1.55, threeConeS: null, shuttleS: spec.shuttleS ?? null, verticalIn: null, broadIn: null, changeOfDirectionZ: spec.codZ ?? 0 },
    gameDay: { freshness: spec.freshness ?? 1, freshnessLongTerm: 1, conditioning: 50, playingHurt: [], knowledge: {}, snapsThisGame: 0, requiredAbsenceDowns: 0, ejected: false, unavailable: false },
  };
}

export interface WorldSpec {
  ballX?: number; ballY?: number; attackDir?: AttackDir; distanceYd?: number; seed?: number; rules?: RuleSet;
  players?: (slot: number) => PlayerSpec; padsFactorOne?: boolean; params?: ParamTable;
}

/** A 22-slot world on the fixture field. Players start spread out and in 'stance'; tests place the ones they use. */
export function fixtureWorld(spec: WorldSpec = {}): TickWorld {
  const rules = spec.rules ?? fixtureRules(), params = spec.params ?? PARAM_TABLE;
  const geometry = fieldGeometry(rules), fp = fieldParams(params), kp = kinParams(params);
  const attackDir = spec.attackDir ?? 1, ballX = spec.ballX ?? 35, ballY = spec.ballY ?? geometry.centreY;
  const distanceYd = spec.distanceYd ?? 10, lineToGainX = ballX + distanceYd * attackDir;
  const situation: GameSituation = {
    gameId: 1, playNumber: 1, driveNumber: 1, playKind: 'scrimmage', period: 1, overtime: false, clockTenths: 9000,
    clockStatus: 'running', playClockAtSnapTenths: 50, offense: 0, attackDir, down: 1, distanceYd, goalToGo: false,
    ballX, ballY, lineToGainX, score: [0, 0], timeoutsLeft: [3, 3], insideTwoMinute: false, untimedDown: false,
  };
  const slots: SlotInfo[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) {
    const player = fixturePlayer(100 + s, spec.players?.(s));
    let movement = movementParams(player, kp, fp).movement;
    if (spec.padsFactorOne) movement = { ...movement, vMaxYps: movement.vMaxYps / kp.padsFactor! };
    slots.push({ slot: s, playerId: player.playerId, side: s < SLOTS_PER_TEAM ? 0 : 1, role: `R${s}`, player, movement });
  }
  const w = createTickWorld({
    situation, geometry, frame: playFrame(geometry, fp, ballX, ballY, attackDir, lineToGainX), environment: NEUTRAL_ENVIRONMENT,
    streams: streamSource(seedFromNumber(spec.seed ?? 7)), math: DMATH, rules, params, slots,
  });
  // Spread: offense behind the ball, defense beyond it, 4 yd apart across the field.
  for (let s = 0; s < SLOT_COUNT; s++) {
    const team = s < SLOTS_PER_TEAM ? 0 : 1, i = s % SLOTS_PER_TEAM;
    w.players.posX[s] = ballX + (team === 0 ? -5 : 5) * attackDir;
    w.players.posY[s] = 6 + i * 4;
    w.players.headingRad[s] = (team === 0) === (attackDir === 1) ? 0 : Math.PI;
    w.players.gazeRad[s] = w.players.headingRad[s]!;
  }
  return w;
}

/** Places a slot at a play-frame point. */
export function place(w: TickWorld, slot: number, px: number, py: number): void {
  w.players.posX[slot] = w.frame.originX + px * w.frame.attackDir;
  w.players.posY[slot] = w.frame.originY + py * w.frame.attackDir;
}

export function playX(w: TickWorld, slot: number): number { return (w.players.posX[slot]! - w.frame.originX) * w.frame.attackDir; }
export function playY(w: TickWorld, slot: number): number { return (w.players.posY[slot]! - w.frame.originY) * w.frame.attackDir; }
