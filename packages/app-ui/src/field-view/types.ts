// Input shapes of the field view (G-03). app-ui may import only the public entry of app-services
// (P1.2.1), which does not yet re-export the simulation contract, so the shapes the view reads are
// declared here structurally. The tests prove that the contract types in @gm/schema fit them
// (FieldGeometry, TrajectoryRecord, MOVE_MODES, BALL_STATES). Contract request CR-G03-1 asks for
// the re-export so these copies can go.

/** Same fields as `FieldGeometry` in @gm/schema (J1.1.1). Built from rule keys, never from code. */
export interface FieldGeometryLike {
  readonly lengthYd: number;
  readonly widthYd: number;
  readonly goalLineWestX: number;
  readonly goalLineEastX: number;
  readonly hashSouthY: number;
  readonly hashNorthY: number;
  readonly centreY: number;
  readonly uprightSouthY: number;
  readonly uprightNorthY: number;
  readonly crossbarHeightYd: number;
}

/** Same fields as `TrajectoryRecord` in @gm/schema (J1.6.2, P2.2.2). */
export interface TrajectoryRecordLike {
  readonly formatVersion: number;
  readonly firstTick: number;
  readonly tickCount: number;
  readonly buffer: Uint8Array;
}

/** Contract D-01: 0 home, 1 visitor. */
export type FilmSide = 0 | 1;

/** One of the 22 slots of the play: who wears which number. Public roster facts only (D1). */
export interface FilmSlot {
  readonly slot: number;
  readonly side: FilmSide;
  readonly jersey: number;
  /** Position code from the depth chart, for example `QB`, `LT`, `CB`. Picks the marker row (O6.3.1). */
  readonly role: string;
}

/**
 * Event cues the view may draw (I9.1.2, O2.3.4, O6.4.1). These are events as the viewer may see them,
 * after the observer filter (G-27): a flag is the official's flag, never a foul the crew missed, and
 * nothing here names a call, a coverage, a fault or a contest result (I9.3.2).
 */
export const FILM_EVENT_KINDS = ['snap', 'throw', 'catch', 'drop', 'tackle', 'fumble', 'flag', 'whistle', 'outOfBounds', 'kickLanding'] as const;
export type FilmEventKind = (typeof FILM_EVENT_KINDS)[number];

export interface FilmEvent {
  readonly kind: FilmEventKind;
  /** Tick of the event on the trajectory's clock (tick 0 is the snap or the kick). */
  readonly tick: number;
  /** Field-frame spot in yards. For `throw` the passer's spot; for `kickLanding` the landing spot. */
  readonly x: number;
  readonly y: number;
  /** For `throw`: [passer, intended receiver]. For `tackle`: the tacklers. Otherwise optional. */
  readonly slots?: readonly number[];
}

/** Public game state the view draws as lines (I9.3.2 item 3). Field-frame x values. */
export interface FilmSituation {
  readonly lineOfScrimmageX: number;
  /** Null on kicks and tries, where no line to gain is drawn. */
  readonly lineToGainX: number | null;
  /** Direction the offense attacks at the snap: +1 east, -1 west (J1.1.2). */
  readonly attackDir: 1 | -1;
  /** The side that snapped or kicked. */
  readonly offenseSide: FilmSide;
}

/**
 * One play as the field view receives it. Positions, facings, movement states, the ball, public
 * roster facts and visible events: nothing else (O2.3.3, J1.6.2). Every source drawn in a game must
 * carry the `user-visible` tag (I9.3.2); the view refuses anything else until the final whistle.
 */
export interface FilmPlay {
  readonly playId: string;
  readonly visibility: 'user-visible';
  readonly ticksPerSecond: number;
  readonly trajectory: TrajectoryRecordLike;
  readonly slots: readonly FilmSlot[];
  readonly events: readonly FilmEvent[];
  readonly situation: FilmSituation;
}

/** Where the play is being shown. Half speed, stepping and scrubbing exist only in film and practice (O2.3.4). */
export type PlaybackMode = 'live' | 'replay' | 'film' | 'practice';

/** O2.3.1 and O5.3.2: offense always up, my team always up, or broadcast (true direction, left to right). */
export type Orientation = 'offenseUp' | 'teamUp' | 'broadcast';

/** I9.1.1 and O2.3.1: wide copy (default), tight copy (tackle box), full field (zoom key). */
export type Zoom = 'wide' | 'tight' | 'full';

export interface TeamColours {
  readonly primary: string;
  readonly alternate: string;
}
