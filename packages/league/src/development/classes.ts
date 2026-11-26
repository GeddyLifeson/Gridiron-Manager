// Attribute classes (D7.1.2), the attributes each position works (D3 sections), and position groups
// for the aging curves (D8.2.1), growth (T8.1.1) and exit table (D8.4.1).
// The class map is typed `Record<AttributeId, DevClass>`, so an attribute added to the sim contract
// without a class fails the typecheck: "a missing class fails the build" (D7.1.2 acceptance).
import type { AttributeId } from '@gm/schema';

/** D7.1.2 rate classes. The rate for each lives in params.json as `classRate.<class>`. */
export const DEV_CLASSES = [
  'closedTechnique', 'openTechnique', 'recognition', 'discipline', 'intelligence', 'strengthStamina', 'speedPower', 'untrainable',
] as const;
export type DevClass = (typeof DEV_CLASSES)[number];

const C: DevClass = 'closedTechnique';
const O: DevClass = 'openTechnique';
const R: DevClass = 'recognition';
const D: DevClass = 'discipline';
const I: DevClass = 'intelligence';
const S: DevClass = 'strengthStamina';
const X: DevClass = 'speedPower';
const U: DevClass = 'untrainable';

/**
 * Class of every attribute. Closed skills are drilled alone (pass set, release, footwork, snap, hand
 * moves, kicking mechanics); open skills need live opposition (routes against coverage, run fits,
 * zone coverage, vision). Arm and leg strength follow play strength (D8.3.1). Composure and
 * durability are not trainable in v1 (D7.1.2 last row). Assignments outside the leaf's examples are
 * the author's reading of D3 and D4 (Assumption).
 */
export const DEV_CLASS: Readonly<Record<AttributeId, DevClass>> = {
  play_strength: S, explosiveness: X, stamina: S, durability: U,
  tackling: C, block_shedding: C, ball_security: C, hands: C, ball_tracking: O, open_field_blocking: O,
  pursuit_angle: O, snap_count_get_off: C, pad_level: C,
  arm_strength: S, accuracy_short: C, accuracy_intermediate: C, accuracy_deep: C, accuracy_on_the_move: C,
  accuracy_under_pressure: O, release_time: C, anticipation: R, footwork_and_drop: C, pocket_movement: O,
  play_fake_and_ball_handling: C, scramble_and_run_skill: O, cadence: C, snap_handling: C,
  vision_zone: O, vision_gap: O, patience_and_tempo: O, elusiveness: O, contact_balance: C, power_finish: C,
  route_running_backfield: O, pass_protection_technique: C, lead_blocking: O, cut_blocking: C,
  release_against_press: C, route_running_short: O, route_running_intermediate: O, route_running_deep: O,
  route_pace_and_stems: C, zone_awareness: R, contested_catch: C, sideline_awareness: C, run_after_catch: O,
  stalk_blocking: C,
  inline_run_blocking: C, combination_blocks: O, tight_end_pass_protection: C, move_blocking: O, release_from_the_line: C,
  pass_set: C, anchor: C, mirror: C, hand_use_in_protection: C, stunt_pickup: O, zone_run_blocking: O,
  gap_run_blocking: C, pulling: O, second_level_blocking: O, screen_and_space_blocking: O, finish: C,
  snap_under_center: C, snap_shotgun: C,
  get_off: C, one_gap_penetration: C, two_gap_control: C, double_team_anchor: C, power_rush: C, hand_moves: C,
  stunt_execution: O, batting_passes: C,
  speed_rush_and_bend: C, speed_to_power: C, inside_counter: C, edge_setting: O, zone_drop: O, strip_technique: C,
  run_fit_technique: O, taking_on_blocks: C, man_coverage_backs_and_tight_ends: O, blitz_technique: C, ball_skills: C,
  press_technique: C, backpedal_and_transition: C, man_coverage_off: O, man_coverage_trail: O, zone_coverage: O,
  pattern_matching: R, break_on_the_ball: O, slot_play: O, run_support: O, range: O, man_coverage_tight_ends_and_slots: O,
  leg_strength_place_kick: S, accuracy_place_kick: C, kickoff_placement: C, onside_and_specialty_kicks: C,
  leg_strength_punt: S, hang_time: C, directional_punting: C, punt_get_off_time: C, kicking_consistency: C,
  long_snap: C, holding: C,
  catching_punts: C, catching_kickoffs: C, return_vision: O, coverage_lane_discipline: O, gunner_release: C,
  jammer_technique: C, kick_return_blocking: O, punt_protection: C, kick_blocking: C,
  play_recognition: R, processing_speed: R, assignment_discipline: D, foul_discipline: D, composure: U,
  football_intelligence: I,
  coverage_reading_pre_snap: R, coverage_reading_post_snap: R, blitz_recognition: R, decision_risk: D,
  protection_calls: I, audible_judgment: I, front_and_coverage_checks: I, disguise: I, clock_and_situation_command: I,
};

/** Physical ISS attributes moved by the body (growth and aging) as well as by training (D7 intro, D8.3.1). */
export const BODY_ATTRIBUTES = ['play_strength', 'explosiveness', 'stamina', 'durability'] as const satisfies readonly AttributeId[];
export type BodyAttribute = (typeof BODY_ATTRIBUTES)[number];

/** Arm and leg strength age with play strength's weights (D8.3.1). */
export const STRENGTH_LIKE = ['arm_strength', 'leg_strength_place_kick', 'leg_strength_punt'] as const satisfies readonly AttributeId[];

/** A quarterback's mobility follows the full speed weights (D8.3.1): it fades first. */
export const MOBILITY = ['scramble_and_run_skill', 'accuracy_on_the_move', 'pocket_movement'] as const satisfies readonly AttributeId[];

/**
 * Technique tied to movement: its effective ceiling falls slowly after 30 (D7.4.1). Technique itself
 * never declines with age (D8.3.1); only reach above the lowered ceiling stops.
 */
export const MOVEMENT_TECHNIQUE: readonly AttributeId[] = [
  'elusiveness', 'route_running_deep', 'route_running_intermediate', 'release_against_press', 'run_after_catch',
  'speed_rush_and_bend', 'backpedal_and_transition', 'man_coverage_off', 'man_coverage_trail', 'range', 'pursuit_angle',
  'pulling', 'second_level_blocking', 'mirror',
];

/** Tendencies a coaching point moves directly (D7.3.2), at most 15 points from natural. */
export const TENDENCIES: readonly AttributeId[] = ['decision_risk'];

// D3 sections, used for the attributes a position works in practice and games.
const UNIVERSAL: readonly AttributeId[] = ['tackling', 'block_shedding', 'ball_security', 'hands', 'ball_tracking', 'open_field_blocking', 'pursuit_angle', 'snap_count_get_off', 'pad_level'];
const PHYSICAL: readonly AttributeId[] = ['play_strength', 'explosiveness', 'stamina'];
const MENTAL: readonly AttributeId[] = ['play_recognition', 'processing_speed', 'assignment_discipline', 'foul_discipline', 'football_intelligence'];
const QB: readonly AttributeId[] = ['arm_strength', 'accuracy_short', 'accuracy_intermediate', 'accuracy_deep', 'accuracy_on_the_move', 'accuracy_under_pressure', 'release_time', 'anticipation', 'footwork_and_drop', 'pocket_movement', 'play_fake_and_ball_handling', 'scramble_and_run_skill', 'cadence', 'snap_handling', 'coverage_reading_pre_snap', 'coverage_reading_post_snap', 'blitz_recognition', 'decision_risk', 'protection_calls', 'audible_judgment', 'clock_and_situation_command'];
const RB: readonly AttributeId[] = ['vision_zone', 'vision_gap', 'patience_and_tempo', 'elusiveness', 'contact_balance', 'power_finish', 'route_running_backfield', 'pass_protection_technique', 'lead_blocking', 'cut_blocking'];
const WR: readonly AttributeId[] = ['release_against_press', 'route_running_short', 'route_running_intermediate', 'route_running_deep', 'route_pace_and_stems', 'zone_awareness', 'contested_catch', 'sideline_awareness', 'run_after_catch', 'stalk_blocking'];
const TE: readonly AttributeId[] = ['inline_run_blocking', 'combination_blocks', 'tight_end_pass_protection', 'move_blocking', 'release_from_the_line', 'route_running_short', 'route_running_intermediate', 'zone_awareness', 'contested_catch', 'run_after_catch'];
const OL: readonly AttributeId[] = ['pass_set', 'anchor', 'mirror', 'hand_use_in_protection', 'stunt_pickup', 'zone_run_blocking', 'gap_run_blocking', 'pulling', 'second_level_blocking', 'screen_and_space_blocking', 'finish', 'snap_under_center', 'snap_shotgun', 'protection_calls'];
const DL: readonly AttributeId[] = ['get_off', 'one_gap_penetration', 'two_gap_control', 'double_team_anchor', 'power_rush', 'hand_moves', 'stunt_execution', 'batting_passes'];
const EDGE: readonly AttributeId[] = ['get_off', 'speed_rush_and_bend', 'speed_to_power', 'inside_counter', 'edge_setting', 'zone_drop', 'strip_technique', 'hand_moves', 'power_rush'];
const LB: readonly AttributeId[] = ['run_fit_technique', 'taking_on_blocks', 'man_coverage_backs_and_tight_ends', 'blitz_technique', 'ball_skills', 'zone_coverage', 'pattern_matching', 'front_and_coverage_checks'];
const DB: readonly AttributeId[] = ['press_technique', 'backpedal_and_transition', 'man_coverage_off', 'man_coverage_trail', 'zone_coverage', 'pattern_matching', 'break_on_the_ball', 'slot_play', 'run_support', 'range', 'man_coverage_tight_ends_and_slots', 'ball_skills', 'disguise', 'front_and_coverage_checks'];
const KICK: readonly AttributeId[] = ['leg_strength_place_kick', 'accuracy_place_kick', 'kickoff_placement', 'onside_and_specialty_kicks', 'kicking_consistency', 'holding'];
const PUNT: readonly AttributeId[] = ['leg_strength_punt', 'hang_time', 'directional_punting', 'punt_get_off_time', 'kicking_consistency', 'holding'];
const SNAP: readonly AttributeId[] = ['long_snap', 'punt_protection'];

/** Position families used across this module. Codes outside the map must be mapped by the caller. */
export const POSITION_FAMILIES = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'EDGE', 'LB', 'CB', 'S', 'K', 'P', 'LS'] as const;
export type PositionFamily = (typeof POSITION_FAMILIES)[number];

/** F1 position codes to families. The F1 list is content; the codes below are the common ones. */
export const POSITION_FAMILY: Readonly<Record<string, PositionFamily>> = {
  QB: 'QB', RB: 'RB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE',
  OL: 'OL', T: 'OL', LT: 'OL', RT: 'OL', OT: 'OL', G: 'OL', LG: 'OL', RG: 'OL', OG: 'OL', C: 'OL', IOL: 'OL',
  DL: 'DL', DT: 'DL', NT: 'DL', IDL: 'DL', DE: 'EDGE', EDGE: 'EDGE', OLB: 'EDGE',
  LB: 'LB', ILB: 'LB', MLB: 'LB', WLB: 'LB', SLB: 'LB',
  CB: 'CB', DB: 'CB', NB: 'CB', S: 'S', FS: 'S', SS: 'S', K: 'K', PK: 'K', P: 'P', LS: 'LS',
};

export function familyOf(position: string): PositionFamily {
  const f = POSITION_FAMILY[position];
  if (!f) throw new Error(`position ${position} has no development family; map it in POSITION_FAMILY`);
  return f;
}

/** Attributes a position works in practice and games (D7.2.1). Others get no reps and decay (D7.5.1). */
export const WORKED: Readonly<Record<PositionFamily, readonly AttributeId[]>> = {
  QB: [...PHYSICAL, ...MENTAL, ...QB, 'ball_security'],
  RB: [...PHYSICAL, ...MENTAL, ...UNIVERSAL, ...RB],
  WR: [...PHYSICAL, ...MENTAL, ...UNIVERSAL, ...WR],
  TE: [...PHYSICAL, ...MENTAL, ...UNIVERSAL, ...TE],
  OL: [...PHYSICAL, ...MENTAL, 'pad_level', 'snap_count_get_off', ...OL],
  DL: [...PHYSICAL, ...MENTAL, ...UNIVERSAL, ...DL],
  EDGE: [...PHYSICAL, ...MENTAL, ...UNIVERSAL, ...EDGE],
  LB: [...PHYSICAL, ...MENTAL, ...UNIVERSAL, ...LB],
  CB: [...PHYSICAL, ...MENTAL, ...UNIVERSAL, ...DB],
  S: [...PHYSICAL, ...MENTAL, ...UNIVERSAL, ...DB],
  K: ['play_strength', 'stamina', 'composure', ...KICK],
  P: ['play_strength', 'stamina', 'composure', ...PUNT],
  LS: [...PHYSICAL, 'assignment_discipline', ...SNAP, 'tackling', 'coverage_lane_discipline'],
};

/** D8.2.1 curve group of a family (tables.json `curves.groups`). */
export const CURVE_GROUP: Readonly<Record<PositionFamily, string>> = {
  QB: 'QB', RB: 'RB', WR: 'WR_CB', CB: 'WR_CB', TE: 'TE_LB_S', LB: 'TE_LB_S', S: 'TE_LB_S',
  OL: 'OL', DL: 'DL_EDGE', EDGE: 'DL_EDGE', K: 'K_P', P: 'K_P', LS: 'K_P',
};

/** D8.4.1 exit table column of a family. EDGE players count with DL; long snappers with punters (Assumption). */
export const EXIT_GROUP: Readonly<Record<PositionFamily, string>> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', DL: 'DL', EDGE: 'DL', LB: 'LB', CB: 'CB', S: 'S', K: 'K', P: 'P', LS: 'P',
};

/** T8.1.1 strength-gain group: linemen 18 percent, receivers and defensive backs 34, others between. */
export const GROWTH_GROUP: Readonly<Record<PositionFamily, 'line' | 'skill' | 'other'>> = {
  QB: 'other', RB: 'other', WR: 'skill', TE: 'other', OL: 'line', DL: 'line', EDGE: 'other', LB: 'other',
  CB: 'skill', S: 'skill', K: 'other', P: 'other', LS: 'other',
};
