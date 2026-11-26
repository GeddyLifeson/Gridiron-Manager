// The rule values this module reads, as one object the caller fills from the rule set by key (RULE_KEYS in
// params.ts). Nothing here branches on a level name (P1.1.2): a rule that does not exist at a level arrives
// as null, 0 or false and the leaf that reads it does not fire.

export interface GameDayRules {
  /** `roster.active_limit`; null when the level has no game-day active limit (college: travel list instead). */
  readonly activeLimit: number | null;
  /** `roster.active_limit_short_line`. */
  readonly activeLimitShortLine: number | null;
  /** `roster.active_min_linemen`. */
  readonly activeMinLinemen: number | null;
  /** `roster.elevations_max_per_game`; 0 when there is no practice squad. */
  readonly elevationsMaxPerGame: number;
  /** `roster.inactives_due_minutes_before_kickoff`; null when no report deadline exists (the locks then fall at kickoff). */
  readonly reportDeadlineMin: number | null;
  /** `roster.emergency_qb_active_qbs`; 0 when the emergency quarterback rule does not exist. */
  readonly emergencyQbActiveQbs: number;
  /** `roster.emergency_qb_from_practice_squad`. */
  readonly emergencyQbFromPracticeSquad: boolean;
  /** `comm.c2p_allowed`. */
  readonly radioAllowed: boolean;
  /** `comm.c2p_receivers_offense` and `comm.c2p_receivers_defense`: radio players on the field per side. */
  readonly radioOnFieldOffense: number;
  readonly radioOnFieldDefense: number;
  /** `comm.c2p_designated_offense` and `comm.c2p_designated_defense` (requested keys); 0 means no designation rule. */
  readonly radioDesignatedOffense: number;
  readonly radioDesignatedDefense: number;
  /** `toss.captains_max`. */
  readonly captainsMax: number;
  /** `toss.defer_allowed`. */
  readonly deferAllowed: boolean;
  /** `toss.minutes_before_kickoff` (requested key). */
  readonly tossMinutesBefore: number;
  /** `toss.field_presence_minutes` (requested key); 0 when no such rule. */
  readonly fieldPresenceMin: number;
  /** `toss.late_field_penalty_yd` (requested key). */
  readonly lateFieldPenaltyYd: number;
  /** `replay.challenge_designee_allowed` (requested key). */
  readonly challengeDesigneeAllowed: boolean;
  /** `clock.halftime_min`. */
  readonly halftimeMin: number;
  /** `field.end_zone_depth_ft` (dictionary key, read by engine-core/field; feet). */
  readonly endZoneDepthFt: number;
  /** `league.officiating_review.max_plays` (requested key); 0 when the level has no such channel. */
  readonly officiatingReviewMaxPlays: number;
}
