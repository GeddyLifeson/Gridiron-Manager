// Foul ids read by the foul module (B8.1.2, B4, B13.5, B13.8, B13.12).
// An id is a catalogue key: field `f` of foul `id` is the rule key `foul.<id>.<f>`. This list names the
// ids and the bible leaf each comes from, so the RULE_KEYS manifest can be built. It holds no value:
// yardage and side effects are rule data owned by WP-01. Enforcement code never tests an id; it reads
// catalogue fields and the extension fields below.

/** Extra per-foul fields beyond the nine catalogue fields. Sparse: a foul without the key takes the default. */
export const EXT_FIELDS = ['enforcement', 'kick_block_attempt', 'separate'] as const;
export type ExtField = (typeof EXT_FIELDS)[number];

/**
 * `foul.<id>.enforcement` values. Each names a procedure of B8.5, never a foul.
 * - `standard`: the spot comes from the phase table of B8.5.2 and the kick rules of B6.6.1.
 * - `interference_spot`: ball to the spot of the foul with the `enforce.interference.*` limits (B8.1.2, B13.5.1).
 * - `previous_or_spot_worse`: the yardage from the previous spot, or the spot of the foul when that is
 *   worse for the offender; not limited by half the distance (B8.1.2 intentional_grounding row, B8.5.3 rule 2).
 * - `equitable`: the catalogue distance, not limited by half the distance (B8.4.3 rule 4).
 */
export const ENFORCEMENT_PROFILES = ['standard', 'interference_spot', 'previous_or_spot_worse', 'equitable'] as const;
export type EnforcementProfile = (typeof ENFORCEMENT_PROFILES)[number];

export interface FoulIdDef {
  readonly id: string;
  /** Bible leaf that defines the foul. */
  readonly leaf: string;
  /** Extension fields this foul needs a value for. */
  readonly ext?: readonly ExtField[];
}

const row = (id: string, leaf: string, ext?: readonly ExtField[]): FoulIdDef => (ext ? { id, leaf, ext } : { id, leaf });

export const FOUL_IDS: readonly FoulIdDef[] = [
  // Pre-snap and procedure (B8.1.2 table one, B4, B1.3.3, B1.4, B2.4)
  row('false_start', 'B8.1.2'),
  row('encroachment', 'B8.1.2'),
  row('neutral_zone_infraction', 'B8.1.2'),
  row('offside', 'B8.1.2'),
  row('illegal_shift', 'B8.1.2'),
  row('illegal_motion', 'B8.1.2'),
  row('illegal_formation', 'B8.1.2'),
  row('illegal_snap', 'B8.1.2'),
  row('snap_to_ineligible', 'B8.1.2'),
  row('delay_of_game', 'B1.3.3'),
  row('delay_of_game_spike', 'B8.5.5'),
  row('excess_timeout', 'B1.4'),
  row('illegal_substitution', 'B2.4'),
  row('too_many_on_field', 'B2.4'),
  row('too_many_in_formation', 'B2.4'),
  // Passing (B8.1.2 table two, B5, B13.5)
  row('illegal_forward_pass', 'B8.1.2'),
  row('second_forward_pass', 'B8.1.2'),
  row('forward_pass_after_change', 'B8.1.2'),
  row('illegal_touching_pass', 'B8.1.2'),
  row('illegal_touching_after_oob', 'B8.1.2'),
  row('intentional_grounding', 'B8.1.2', ['enforcement']),
  row('ineligible_downfield_pass', 'B8.1.2'),
  row('illegal_contact', 'B8.1.2'),
  row('illegal_cut_block', 'B8.1.2'),
  row('def_holding', 'B8.1.2'),
  row('dpi', 'B8.1.2', ['enforcement']),
  row('opi', 'B8.1.2'),
  row('backward_pass_out_of_bounds', 'B8.1.2'),
  row('handing_forward', 'B8.1.2'),
  // Blocking and hands (B8.1.2 table three, B8.2, B13.12)
  row('offensive_holding', 'B8.2.1'),
  row('illegal_use_of_hands_offense', 'B8.2.1'),
  row('illegal_block_in_back', 'B8.2.1'),
  row('assisting_runner', 'B8.2.1'),
  row('illegal_use_of_hands_defense', 'B8.2.2'),
  row('clipping', 'B8.2.3'),
  row('peel_back', 'B8.2.3'),
  row('block_below_waist', 'B8.2.3'),
  row('chop_block', 'B8.2.3'),
  row('crackback', 'B8.2.3'),
  row('blindside_block', 'B8.2.3'),
  // Personal fouls (B8.1.2 table four, B8.3, B13.8)
  row('unnecessary_roughness', 'B8.3.3'),
  row('defenseless_player', 'B8.3.1'),
  row('helmet_use', 'B8.3.3'),
  row('roughing_passer', 'B8.3.2'),
  row('roughing_kicker', 'B8.3.3', ['kick_block_attempt']),
  row('running_into_kicker', 'B8.3.3', ['kick_block_attempt']),
  row('roughing_holder', 'B8.3.3', ['kick_block_attempt']),
  row('striking', 'B8.3.3'),
  row('face_mask', 'B8.3.3'),
  row('horse_collar', 'B8.3.3'),
  row('helmet_weapon', 'B8.3.3'),
  row('hip_drop', 'B8.3.3'),
  row('targeting', 'B13.8.1'),
  // Conduct and special (B8.1.2 table five, B8.4)
  row('unsportsmanlike', 'B8.4.1'),
  row('taunting', 'B8.4.1'),
  row('kick_block_leverage', 'B8.4.1', ['kick_block_attempt']),
  row('kick_block_leaping', 'B8.4.1', ['kick_block_attempt']),
  row('clock_manipulation', 'B8.4.3'),
  row('palpably_unfair', 'B8.4.3', ['enforcement']),
  row('league_dq', 'B8.4.2'),
  row('illegal_bat', 'B8.4.4'),
  row('illegal_kick', 'B8.4.4'),
  row('non_player_unsportsmanlike', 'B8.4.5'),
  row('foul_against_official', 'B8.5.1', ['separate']),
  row('challenge_without_timeout', 'B8.5.1', ['separate']),
  row('excess_injury_timeout', 'B8.5.1', ['separate']),
  // Kicking (B8.1.2 table six, B6)
  row('free_kick_offside', 'B8.1.2'),
  row('free_kick_illegal_formation', 'B8.1.2'),
  row('free_kick_early_movement', 'B8.1.2'),
  row('illegal_free_kick', 'B8.1.2'),
  row('free_kick_illegal_block', 'B8.1.2'),
  row('illegal_wedge', 'B8.1.2'),
  row('illegal_double_team', 'B8.1.2'),
  row('onside_untouched_past_zone', 'B8.1.2'),
  row('free_kick_illegal_touching', 'B8.1.2'),
  row('free_kick_voluntary_oob', 'B8.1.2'),
  row('running_into_free_kicker', 'B8.1.2'),
  row('illegal_scrimmage_kick', 'B8.1.2'),
  row('kick_ineligible_downfield', 'B8.1.2'),
  row('kick_voluntary_oob', 'B8.1.2'),
  row('def_illegal_formation_kick', 'B8.1.2'),
  row('pushing_teammates_formation', 'B8.1.2', ['kick_block_attempt']),
  row('pull_and_shoot_holding', 'B8.2.2', ['kick_block_attempt']),
  row('kick_holding', 'B8.1.2'),
  row('kick_illegal_touching_after_oob', 'B8.1.2'),
  row('kick_catch_interference', 'B8.1.2'),
  row('fair_catch_interference', 'B8.1.2'),
  row('invalid_fair_catch_signal', 'B8.1.2'),
  row('muff_opportunity_interference', 'B8.1.2'),
  row('block_after_fair_catch_signal', 'B8.1.2'),
  row('fair_catcher_contact', 'B8.1.2'),
];
