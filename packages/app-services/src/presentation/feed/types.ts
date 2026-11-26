// PV-00 presentation feed: the one shape the field cues, the strip, the crowd, the cadence and every
// other screen or sound of a play reads (plans/presentation-build-plan.md section 8; O6.4.1, O5.3.2,
// I9.3.2). Rules the shape carries:
//  - Everything here is "user-visible" (I9.3.2): what a sideline coach, a camera or a fan in the stands
//    could know. No contest winner, no fault, no true coverage, no truth value of a ruling.
//  - Timing is the engine's: every cue sits on the trajectory's tick (tick 0 is the snap or the kick,
//    negative before it). Nothing is placed by a script's idea of drama (plan rule 3, MB-1).
//  - Sources still owed by the engine or officiating (change requests CR-PV00-1 to CR-PV00-5, CR-PV00-7) are
//    optional on the input; the feed lists each one it lacked in `missing`, so consumers degrade
//    instead of guessing.
// Plain types only: app-services does not import zod (the integrator owns @gm/schema, CR-PV00-6).

export type FeedSide = 0 | 1;

/** Bumped when a field changes meaning. Consumers refuse a version they do not know. */
export const FEED_FORMAT_VERSION = 1 as const;

/** Sources the feed can be missing until the change requests land (CR-PV00-1 to CR-PV00-5). */
export const FEED_SOURCES = ['noise', 'playWind', 'contactTier', 'cadence', 'relay', 'rulingTicks', 'postHit'] as const;
export type FeedSource = (typeof FEED_SOURCES)[number];

/** Camera events, the same list and the same rules as the film filter (G-63 `publicEvents`). */
export const CAMERA_CUE_KINDS = ['snap', 'throw', 'catch', 'drop', 'tackle', 'fumble', 'flag', 'whistle', 'outOfBounds', 'kickLanding'] as const;
export type CameraCueKind = (typeof CAMERA_CUE_KINDS)[number];

/**
 * Rulings on the field (B11 as called, never the truth layer). A crowd reacts to these (plan rule 5,
 * MB-7). `favours` is the side the ruling is good for, so a home or road crowd can react the right way.
 */
export const RULING_KINDS = [
  'touchdown', 'field_goal_good', 'field_goal_missed', 'safety', 'try_good', 'try_failed',
  'interception', 'fumble_lost', 'turnover_on_downs', 'sack', 'incomplete', 'first_down', 'touchback',
  'penalty', 'review_upheld', 'review_reversed',
] as const;
export type RulingKind = (typeof RULING_KINDS)[number];

/**
 * Kicked-ball events (J9, B6): the foot meeting the ball, and the ball striking an upright or the
 * crossbar. Both are what the stands and a camera see and hear. Not in the film filter's list, so the
 * film chart stays as G-63 defined it.
 */
export const KICK_CUE_KINDS = ['kick', 'postHit'] as const;
export type KickCueKind = (typeof KICK_CUE_KINDS)[number];

/** Every cue kind. PV-02's cue table has one row per kind (visual, sound, bus, caption, switch, information). */
export const FEED_CUE_KINDS = [...CAMERA_CUE_KINDS, ...KICK_CUE_KINDS, 'contact', 'cadence', 'relay', 'ruling'] as const;
export type FeedCueKind = (typeof FEED_CUE_KINDS)[number];

interface CueBase {
  /** Position in the play's cue list, from 0. Stable for one input, so a consumer can key on it. */
  readonly seq: number;
  /** Tick on the trajectory clock (tick 0 is the snap or kick; negative is before it). */
  readonly tick: number;
}

/** A camera event. x, y are field-frame yards; for sound pan use x against the view centre (MB-8). */
export interface CameraCue extends CueBase {
  readonly kind: CameraCueKind;
  readonly x: number;
  readonly y: number;
  /** Slots involved, as the film filter gives them (thrower and target, tacklers, catcher). */
  readonly slots: readonly number[];
  /** Flags only: the side the flag is against, when the ruling names one. */
  readonly against?: FeedSide;
}

/**
 * How hard a hit looked, in 4 tiers (1 light to 4 heavy), J6 amendment A-5 and MB-2. This is what a
 * camera shows (bodies meeting at speed), not who won the contest (I9.3.2).
 */
export interface ContactCue extends CueBase {
  readonly kind: 'contact';
  readonly x: number;
  readonly y: number;
  readonly tier: 1 | 2 | 3 | 4;
  readonly slots: readonly number[];
}

/** The foot met the ball at this spot (J9 kick event): kicker's slot, when he is on the field list. */
export interface KickCue extends CueBase {
  readonly kind: 'kick';
  readonly x: number;
  readonly y: number;
  readonly slots: readonly number[];
}

/** The kicked ball struck the goal (J9.4.2): `part` is the upright or the crossbar. Where it hit, in field yards. */
export interface PostHitCue extends CueBase {
  readonly kind: 'postHit';
  readonly x: number;
  readonly y: number;
  readonly part: 'upright' | 'crossbar';
}

/**
 * The quarterback's count (J5.6.1, A-5): `voiced` is a heard count, `hard` a hard count meant to draw
 * the defense, `silent` a silent or visual count, which makes no sound by design.
 */
export interface CadenceCue extends CueBase {
  readonly kind: 'cadence';
  readonly side: FeedSide;
  readonly count: 'voiced' | 'hard' | 'silent';
}

/** The call reached the huddle (J5.1.3, I2.4.1): `clean`, or `garbled` and had to be repeated. */
export interface RelayCue extends CueBase {
  readonly kind: 'relay';
  readonly side: FeedSide;
  readonly outcome: 'clean' | 'garbled';
}

/** A ruling as the officials gave it. Flags are camera cues; their enforcement shows here as `penalty`. */
export interface RulingCue extends CueBase {
  readonly kind: 'ruling';
  readonly ruling: RulingKind;
  /** Side the ruling is good for; null when it favours neither (offsetting fouls). */
  readonly favours: FeedSide | null;
}

export type FeedCue = CameraCue | KickCue | PostHitCue | ContactCue | CadenceCue | RelayCue | RulingCue;

/** Conditions for the play. `noise` is the J12.6.1 value the engine used for this play (MB-6). */
export interface FeedConditions {
  /** 0 to 1, the crowd bed level (the sound is the meter). Null until CR-PV00-1 lands. */
  readonly noise: number | null;
  /** Venue base noise, for a meter that must show something before CR-PV00-1. Never a crowd level. */
  readonly noiseBase: number;
  readonly windMph: number;
  /** Degrees counter-clockwise from +x, the direction the wind blows toward (contract D-12). */
  readonly windDirDeg: number;
  readonly gustMph: number;
  readonly precip: 'none' | 'light_rain' | 'rain' | 'heavy_rain' | 'snow' | 'heavy_snow';
  readonly roof: 'open' | 'closed' | 'fixed_dome';
  readonly daylight: boolean;
}

/** Public situation of the play, for the strip and the field lines (I9.3.2 item 3). */
export interface FeedSituation {
  readonly offenseSide: FeedSide;
  readonly attackDir: 1 | -1;
  readonly lineOfScrimmageX: number;
  readonly lineToGainX: number | null;
}

/** The called result, after enforcement, for the strip and captions. */
export interface FeedResult {
  readonly resultType: string;
  readonly yardsGained: number;
  readonly noPlay: boolean;
  readonly changeOfPossession: boolean;
  readonly scoreAfter: readonly [number, number];
  readonly firstDown: boolean;
}

/** One play as every screen and sound of the game reads it. */
export interface PresentationFeed {
  readonly formatVersion: typeof FEED_FORMAT_VERSION;
  readonly visibility: 'user-visible';
  /** `${gameId}:${playNumber}`, the same id as film (G-63 `playIdOf`). */
  readonly playId: string;
  readonly ticksPerSecond: number;
  /** Whose crowd and whose call: home is side 0 (contract D-01); userSide is null when watching others. */
  readonly perspective: { readonly homeSide: 0; readonly userSide: FeedSide | null };
  readonly conditions: FeedConditions;
  readonly situation: FeedSituation;
  readonly result: FeedResult;
  /** Sorted by tick, then by kind order (pre-snap, camera, contact, ruling), then seq. */
  readonly cues: readonly FeedCue[];
  /** Sources this feed lacked. Empty once every change request has landed. */
  readonly missing: readonly FeedSource[];
}
