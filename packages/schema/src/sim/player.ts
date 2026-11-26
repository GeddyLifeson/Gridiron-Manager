// Simulation contract, part 6: the sim-side view of a player and a team. TRUTH ONLY.
// The engine reads true values (J1.2.1, J6.1.1). Everything here is visibility class `truth` except
// plain identity. Nothing in this file may be put in a read model (P1.1.4, Q1.4.2). What a coach or
// an AI may see is `ObservedPlayer` at the bottom: a different type with no field in common beyond ids,
// so the two cannot be passed for each other.
import { z } from 'zod';
import { pub, truth, est } from '../field.ts';
import { zPlayerId, zTeamId, zSide } from './primitives.ts';

/**
 * Attribute ids. Names follow the bible's attribute tables (D2.3 to D2.4, D3.1.1 universal list,
 * D3.2.1 to D3.9.2, D4). The lists themselves are Assumption in D3.1.1 and D4.5.1; the ids are stable
 * names for them. Every player has every attribute (D3.1.1). An attribute named in two position tables
 * (tackling, ball skills, zone coverage, blitz technique, cut blocking, ball security, hands) is one
 * attribute stored once (contract decision D-08).
 */
export const ATTRIBUTE_IDS = [
  // D2 physical (ISS forms; drill times live in `tests`)
  'play_strength', 'explosiveness', 'stamina', 'durability',
  // D3.1.1 universal
  'tackling', 'block_shedding', 'ball_security', 'hands', 'ball_tracking', 'open_field_blocking',
  'pursuit_angle', 'snap_count_get_off', 'pad_level',
  // D3.2.1 quarterback
  'arm_strength', 'accuracy_short', 'accuracy_intermediate', 'accuracy_deep', 'accuracy_on_the_move',
  'accuracy_under_pressure', 'release_time', 'anticipation', 'footwork_and_drop', 'pocket_movement',
  'play_fake_and_ball_handling', 'scramble_and_run_skill', 'cadence', 'snap_handling',
  // D3.3.1 running back and fullback
  'vision_zone', 'vision_gap', 'patience_and_tempo', 'elusiveness', 'contact_balance', 'power_finish',
  'route_running_backfield', 'pass_protection_technique', 'lead_blocking', 'cut_blocking',
  // D3.4.1 receiver
  'release_against_press', 'route_running_short', 'route_running_intermediate', 'route_running_deep',
  'route_pace_and_stems', 'zone_awareness', 'contested_catch', 'sideline_awareness', 'run_after_catch',
  'stalk_blocking',
  // D3.4.2 tight end additions
  'inline_run_blocking', 'combination_blocks', 'tight_end_pass_protection', 'move_blocking', 'release_from_the_line',
  // D3.5.1 offensive line
  'pass_set', 'anchor', 'mirror', 'hand_use_in_protection', 'stunt_pickup', 'zone_run_blocking',
  'gap_run_blocking', 'pulling', 'second_level_blocking', 'screen_and_space_blocking', 'finish',
  'snap_under_center', 'snap_shotgun',
  // D3.6.1 interior defensive line
  'get_off', 'one_gap_penetration', 'two_gap_control', 'double_team_anchor', 'power_rush', 'hand_moves',
  'stunt_execution', 'batting_passes',
  // D3.6.2 edge
  'speed_rush_and_bend', 'speed_to_power', 'inside_counter', 'edge_setting', 'zone_drop', 'strip_technique',
  // D3.7.1 linebacker
  'run_fit_technique', 'taking_on_blocks', 'man_coverage_backs_and_tight_ends', 'blitz_technique', 'ball_skills',
  // D3.8.1 coverage
  'press_technique', 'backpedal_and_transition', 'man_coverage_off', 'man_coverage_trail', 'zone_coverage',
  'pattern_matching', 'break_on_the_ball', 'slot_play', 'run_support', 'range', 'man_coverage_tight_ends_and_slots',
  // D3.9.1 specialists
  'leg_strength_place_kick', 'accuracy_place_kick', 'kickoff_placement', 'onside_and_specialty_kicks',
  'leg_strength_punt', 'hang_time', 'directional_punting', 'punt_get_off_time', 'kicking_consistency',
  'long_snap', 'holding',
  // D3.9.2 returner and core special teams
  'catching_punts', 'catching_kickoffs', 'return_vision', 'coverage_lane_discipline', 'gunner_release',
  'jammer_technique', 'kick_return_blocking', 'punt_protection', 'kick_blocking',
  // D4 mental
  'play_recognition', 'processing_speed', 'assignment_discipline', 'foul_discipline', 'composure',
  'football_intelligence',
  // D4.5.1 quarterback and signal-caller skills
  'coverage_reading_pre_snap', 'coverage_reading_post_snap', 'blitz_recognition', 'decision_risk',
  'protection_calls', 'audible_judgment', 'front_and_coverage_checks', 'disguise', 'clock_and_situation_command',
] as const;
export type AttributeId = (typeof ATTRIBUTE_IDS)[number];

/**
 * True drill ability on a good day (D2.1.1), in real units. A drill the player has no true value for
 * is null; J2.2.2 then uses `changeOfDirectionZ`, his standard score in his position profile (D2.2.2).
 */
export const TrueTests = z.object({
  fortyS: truth(z.number().positive(), 's'),
  tenSplitS: truth(z.number().positive(), 's'),
  threeConeS: truth(z.number().positive(), 's').nullable(),
  shuttleS: truth(z.number().positive(), 's').nullable(),
  verticalIn: truth(z.number().positive(), 'in').nullable(),
  broadIn: truth(z.number().positive(), 'in').nullable(),
  changeOfDirectionZ: truth(z.number(), 'z'),
}).strict();

/** Game-day state the engine reads at the snap (J1.4.1 inputs; D9, D10, D11). */
export const GameDayState = z.object({
  /** Freshness 0 to 1 at the start of the next play (D10.1.1). */
  freshness: truth(z.number().min(0).max(1), 'ratio'),
  /** Long-term part of freshness (D10.1.1). */
  freshnessLongTerm: truth(z.number().min(0).max(1), 'ratio'),
  conditioning: truth(z.number().min(0).max(100), 'iss'),
  /** Current injuries being played through: body region id (D11 catalogue) and the z penalty scale (J6.1.1 dInjury). */
  playingHurt: truth(z.array(z.object({ region: truth(z.string()), dInjury: truth(z.number().min(0), 'z') }))),
  /** Knowledge 0 to 100 by concept id (D9.1.1). A missing concept reads as the role-mismatch default of D9. */
  knowledge: truth(z.record(z.string(), z.number().min(0).max(100)), 'iss'),
  snapsThisGame: pub(z.number().int().min(0), 'count'),
  /** Downs the player must still sit out by rule after an injury stoppage (key `injury.sit_downs`). */
  requiredAbsenceDowns: pub(z.number().int().min(0), 'count'),
  ejected: pub(z.boolean()),
  /** Out for the game (injury or protocol, J10.7). */
  unavailable: pub(z.boolean()),
}).strict();
export type GameDayState = z.infer<typeof GameDayState>;

/** One player as the engine sees him. Hidden values: never shown in a career (P1.1.4). */
export const SimPlayer = z.object({
  playerId: zPlayerId(),
  /** Position code from the F1 position list (content). */
  position: pub(z.string()),
  jersey: pub(z.number().int().min(0).max(99), 'index'),
  heightIn: pub(z.number().positive(), 'in'),
  weightLb: pub(z.number().positive(), 'lb'),
  ageYears: pub(z.number().min(0), 'count'),
  /** True attribute values on the internal skill scale, by AttributeId (J1.2.1). Missing ids fail validation in `simPlayerProblems`. */
  attributes: truth(z.record(z.string(), z.number().min(0).max(100)), 'iss'),
  tests: truth(TrueTests),
  gameDay: truth(GameDayState),
}).strict();
export type SimPlayer = z.infer<typeof SimPlayer>;

/** A player placed in a play: who, in which role label (G1.1.2, G2.1.2). */
export const FieldedPlayer = z.object({
  playerId: zPlayerId(),
  /** Role label for this play, for example X, Y, LT, Mike (J1.4.1). */
  role: pub(z.string()),
}).strict();
export type FieldedPlayer = z.infer<typeof FieldedPlayer>;

/** One team as the engine sees it for one game. */
export const SimTeam = z.object({
  teamId: zTeamId(),
  side: zSide(),
  /** Dressed players, in ascending playerId order (fixed iteration order, P1.1.1). */
  players: truth(z.array(SimPlayer)),
  /** Depth chart: role label to ordered player ids (M2). Phase 1 uses unit roles only. */
  depth: pub(z.record(z.string(), z.array(z.number().int().positive())), 'id'),
  /** L3.4.1 multipliers, read only by the hazards J10.1.1 names. 1 is neutral. */
  teamDiscipline: truth(z.object({
    defCoverage: truth(z.number(), 'ratio'),
    postPlay: truth(z.number(), 'ratio'),
  })),
}).strict();
export type SimTeam = z.infer<typeof SimTeam>;

/** Checks that a SimPlayer carries every attribute exactly once (D3.1.1). Returns problems, empty when valid. */
export function simPlayerProblems(p: SimPlayer): string[] {
  const out: string[] = [];
  for (const id of ATTRIBUTE_IDS) if (typeof p.attributes[id] !== 'number') out.push(`player ${p.playerId}: missing attribute ${id}`);
  const known = new Set<string>(ATTRIBUTE_IDS);
  for (const k of Object.keys(p.attributes)) if (!known.has(k)) out.push(`player ${p.playerId}: unknown attribute ${k}`);
  return out;
}

/**
 * What an observer holds about a player (P3.2.3 PersonView). Estimates with confidence, never truth.
 * Coach deciders and read models use this type. It is deliberately not assignable to or from SimPlayer.
 */
export const ObservedPlayer = z.object({
  observed: pub(z.literal(true)),
  playerId: zPlayerId(),
  observerTeamId: zTeamId(),
  position: pub(z.string()),
  jersey: pub(z.number().int().min(0).max(99), 'index'),
  perAttribute: est(z.record(z.string(), z.object({
    estimate: est(z.number(), 'iss'),
    confidence: est(z.number().min(0).max(1), 'ratio'),
    evidenceCount: est(z.number().int().min(0), 'count'),
  }))),
}).strict();
export type ObservedPlayer = z.infer<typeof ObservedPlayer>;
