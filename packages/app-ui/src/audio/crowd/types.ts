// Input shape of the crowd driver (PV-08): the part of the PV-00 presentation feed it reads. app-ui may
// import only the public entry of app-services, and the feed is not on it yet (CR-PV00-6), so the
// shape is declared here structurally. `test/audio/crowd/` replays a recorded real game built by the
// app-services feed adapter, which proves the adapter's output fits.
//
// Everything here is user-visible (I9.3.2): the crowd hears what the stadium could know.

export type CrowdSide = 0 | 1;

/** The feed format this driver understands (PV-00 `FEED_FORMAT_VERSION`). */
export const CROWD_FEED_FORMAT = 1 as const;

/** Rulings on the field as the officials gave them (B11), PV-00 `RULING_KINDS`. */
export type CrowdRulingKind =
  | 'touchdown' | 'field_goal_good' | 'field_goal_missed' | 'safety' | 'try_good' | 'try_failed'
  | 'interception' | 'fumble_lost' | 'turnover_on_downs' | 'sack' | 'incomplete' | 'first_down' | 'touchback'
  | 'penalty' | 'review_upheld' | 'review_reversed';

export interface CrowdRulingCue {
  readonly kind: 'ruling';
  readonly seq: number;
  readonly tick: number;
  readonly ruling: CrowdRulingKind;
  /** The side the ruling is good for; null when it favours neither (offsetting fouls). */
  readonly favours: CrowdSide | null;
}

/** Any other cue. Only its tick and, for camera cues, its field x (for the pan) are read. */
export interface CrowdOtherCue {
  readonly kind: string;
  readonly seq: number;
  readonly tick: number;
  readonly x?: number;
}

export type CrowdCue = CrowdRulingCue | CrowdOtherCue;

/** One play as the crowd hears it. */
export interface CrowdFeed {
  readonly formatVersion: number;
  /** `${gameId}:${playNumber}`. One reaction per play is keyed on this. */
  readonly playId: string;
  readonly ticksPerSecond: number;
  /** Home is side 0 (contract D-01). The crowd in the stands backs the home side, whoever the user is. */
  readonly perspective: { readonly homeSide: CrowdSide; readonly userSide: CrowdSide | null };
  /** `noise` is the J12.6.1 value the engine used for this play (MB-6), or null until CR-PV00-1. */
  readonly conditions: { readonly noise: number | null };
  readonly result: { readonly yardsGained: number; readonly noPlay: boolean };
  /** Sorted by tick. */
  readonly cues: readonly CrowdCue[];
  readonly missing: readonly string[];
}

export const isRuling = (c: CrowdCue): c is CrowdRulingCue => c.kind === 'ruling';
