// Positions, technique groups and how much each group matters at each position (D3.1.1, D4, D13.2.2).
// The attribute ids are the sim contract's ATTRIBUTE_IDS (D-08); every player has every attribute.
import { ATTRIBUTE_IDS, type AttributeId } from '@gm/schema';

/** Profile positions with data (D13.2.2), plus the low-sample cells built from the same file. */
export const PROFILE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'DT', 'EDGE', 'LB', 'CB', 'S', 'FB', 'K', 'P', 'LS'] as const;
export type ProfilePosition = (typeof PROFILE_POSITIONS)[number];

/** The eleven positions with at least 60 rows: these carry the norm tolerances (D2.5.1, D13.2.2). */
export const MAIN_POSITIONS: readonly ProfilePosition[] = ['QB', 'RB', 'WR', 'TE', 'OT', 'IOL', 'DT', 'EDGE', 'LB', 'CB', 'S'];

/**
 * Position codes a request may name, mapped to their profile (D13.2.2 mapping; D13.2.1 edge case: a code
 * without its own profile uses the nearest profile named here). Codes follow the nflverse labels the
 * profile script maps.
 */
export const POSITION_TO_PROFILE: Readonly<Record<string, ProfilePosition>> = {
  QB: 'QB', RB: 'RB', HB: 'RB', FB: 'FB', WR: 'WR', TE: 'TE',
  OT: 'OT', T: 'OT', LT: 'OT', RT: 'OT', IOL: 'IOL', G: 'IOL', OG: 'IOL', C: 'IOL',
  DT: 'DT', NT: 'DT', EDGE: 'EDGE', DE: 'EDGE',
  LB: 'LB', ILB: 'LB', MLB: 'LB', OLB: 'LB',
  CB: 'CB', S: 'S', FS: 'S', SS: 'S', SAF: 'S',
  K: 'K', P: 'P', LS: 'LS',
};

export function profileOf(position: string): ProfilePosition {
  const p = POSITION_TO_PROFILE[position];
  if (!p) throw new Error(`no profile for position ${position} (add it to POSITION_TO_PROFILE)`);
  return p;
}

/**
 * Technique and mental groups. D3.1.1 draws one ceiling per group with small per-attribute offsets. The
 * groups follow the D3 and D4 leaves; the universal list of D3.1.1 is split by the kind of player who uses
 * it, so a quarterback's tackling is not drawn with a linebacker's. Grouping is an Assumption (D3.1.1
 * lists are Assumption in the bible). Physical attributes (D2) are derived from the body and tests.
 */
export const GROUPS: Readonly<Record<string, readonly AttributeId[]>> = {
  carrier_universal: ['ball_security', 'hands', 'ball_tracking'],
  defender_universal: ['tackling', 'block_shedding', 'pursuit_angle'],
  open_field_blocking: ['open_field_blocking'],
  line_universal: ['snap_count_get_off', 'pad_level'],
  qb: ['arm_strength', 'accuracy_short', 'accuracy_intermediate', 'accuracy_deep', 'accuracy_on_the_move', 'accuracy_under_pressure',
    'release_time', 'anticipation', 'footwork_and_drop', 'pocket_movement', 'play_fake_and_ball_handling', 'scramble_and_run_skill', 'cadence', 'snap_handling'],
  rb: ['vision_zone', 'vision_gap', 'patience_and_tempo', 'elusiveness', 'contact_balance', 'power_finish', 'route_running_backfield', 'pass_protection_technique'],
  fb: ['lead_blocking', 'cut_blocking'],
  receiver: ['release_against_press', 'route_running_short', 'route_running_intermediate', 'route_running_deep', 'route_pace_and_stems',
    'zone_awareness', 'contested_catch', 'sideline_awareness', 'run_after_catch', 'stalk_blocking'],
  te: ['inline_run_blocking', 'combination_blocks', 'tight_end_pass_protection', 'move_blocking', 'release_from_the_line'],
  ol_pass: ['pass_set', 'anchor', 'mirror', 'hand_use_in_protection', 'stunt_pickup'],
  ol_run: ['zone_run_blocking', 'gap_run_blocking', 'pulling', 'second_level_blocking', 'screen_and_space_blocking', 'finish'],
  snapping: ['snap_under_center', 'snap_shotgun'],
  idl: ['get_off', 'one_gap_penetration', 'two_gap_control', 'double_team_anchor', 'power_rush', 'hand_moves', 'stunt_execution', 'batting_passes'],
  edge: ['speed_rush_and_bend', 'speed_to_power', 'inside_counter', 'edge_setting', 'zone_drop', 'strip_technique'],
  lb: ['run_fit_technique', 'taking_on_blocks', 'man_coverage_backs_and_tight_ends', 'blitz_technique', 'ball_skills'],
  coverage: ['press_technique', 'backpedal_and_transition', 'man_coverage_off', 'man_coverage_trail', 'zone_coverage', 'pattern_matching',
    'break_on_the_ball', 'slot_play', 'run_support', 'range', 'man_coverage_tight_ends_and_slots'],
  place_kicking: ['leg_strength_place_kick', 'accuracy_place_kick', 'kickoff_placement', 'onside_and_specialty_kicks'],
  punting: ['leg_strength_punt', 'hang_time', 'directional_punting', 'punt_get_off_time'],
  kicking_shared: ['kicking_consistency', 'holding'],
  long_snapping: ['long_snap'],
  returner: ['catching_punts', 'catching_kickoffs', 'return_vision'],
  core_special_teams: ['coverage_lane_discipline', 'gunner_release', 'jammer_technique', 'kick_return_blocking', 'punt_protection', 'kick_blocking'],
  mental: ['play_recognition', 'processing_speed', 'assignment_discipline', 'foul_discipline', 'composure', 'football_intelligence'],
  signal_caller: ['coverage_reading_pre_snap', 'coverage_reading_post_snap', 'blitz_recognition', 'decision_risk', 'protection_calls',
    'audible_judgment', 'front_and_coverage_checks', 'disguise', 'clock_and_situation_command'],
};

/** D2 physical attributes: derived from the body and true tests (D2.3, D2.4), not drawn as a group. */
export const PHYSICAL: readonly AttributeId[] = ['play_strength', 'explosiveness', 'stamina', 'durability'];

/**
 * How much a group matters at a position. Relevance shifts the group's ceiling mean below the anchor
 * position's starter level (D3.1.1: one absolute scale; "a cornerback has a pass-set value (low)").
 * p = primary (anchor level), s = secondary, o = off-position. Assumption: no source defines these levels;
 * the U3 estimates from real data (G-42) are the planned replacement.
 */
export const RELEVANCE_OFFSET_ISS = { p: 0, s: -15, o: -35 } as const;
type Rel = keyof typeof RELEVANCE_OFFSET_ISS;

const ALL_O: Record<string, Rel> = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, 'o' as Rel]));
const rel = (overrides: Record<string, Rel>): Record<string, Rel> => ({ ...ALL_O, mental: 'p', ...overrides });

export const POSITION_RELEVANCE: Readonly<Record<ProfilePosition, Readonly<Record<string, Rel>>>> = {
  QB: rel({ qb: 'p', signal_caller: 'p', carrier_universal: 's', snapping: 'o' }),
  RB: rel({ rb: 'p', carrier_universal: 'p', returner: 's', core_special_teams: 's', fb: 's', receiver: 's', open_field_blocking: 's' }),
  FB: rel({ fb: 'p', rb: 's', carrier_universal: 's', open_field_blocking: 'p', core_special_teams: 'p', te: 's' }),
  WR: rel({ receiver: 'p', carrier_universal: 'p', open_field_blocking: 's', returner: 's', core_special_teams: 's' }),
  TE: rel({ te: 'p', receiver: 's', carrier_universal: 'p', open_field_blocking: 's', line_universal: 's', ol_run: 's', core_special_teams: 's' }),
  OT: rel({ ol_pass: 'p', ol_run: 'p', line_universal: 'p', snapping: 'o', signal_caller: 'o' }),
  IOL: rel({ ol_pass: 'p', ol_run: 'p', line_universal: 'p', snapping: 's' }),
  DT: rel({ idl: 'p', defender_universal: 'p', line_universal: 'p', edge: 's' }),
  EDGE: rel({ edge: 'p', defender_universal: 'p', line_universal: 'p', idl: 's', lb: 's' }),
  LB: rel({ lb: 'p', defender_universal: 'p', coverage: 's', edge: 's', core_special_teams: 's', line_universal: 's', signal_caller: 's' }),
  CB: rel({ coverage: 'p', defender_universal: 's', carrier_universal: 's', returner: 's', core_special_teams: 's' }),
  S: rel({ coverage: 'p', defender_universal: 'p', lb: 's', carrier_universal: 's', core_special_teams: 's', returner: 's', signal_caller: 's' }),
  K: rel({ place_kicking: 'p', kicking_shared: 'p', punting: 's', mental: 's' }),
  P: rel({ punting: 'p', kicking_shared: 'p', place_kicking: 's', mental: 's' }),
  LS: rel({ long_snapping: 'p', snapping: 's', core_special_teams: 's', mental: 's' }),
};

/** Every attribute belongs to exactly one group or to PHYSICAL (checked by the catalogue test). */
export function groupOf(attr: AttributeId): string {
  for (const [g, list] of Object.entries(GROUPS)) if (list.includes(attr)) return g;
  if (PHYSICAL.includes(attr)) return 'physical';
  throw new Error(`attribute ${attr} has no group`);
}

export { ATTRIBUTE_IDS };
