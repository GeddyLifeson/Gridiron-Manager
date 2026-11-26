// Shapes of the film room (G-63, N1). Two kinds live here:
//  - FilmSource: one recorded play as the save holds it, truth record included. Only the film filter
//    (chart.ts, a reviewed bridge, K9.3.1 rule 4) and the staff grader read it.
//  - Everything else: what a viewer may hold. These shapes carry no truth field (schemas.ts gives each
//    field its visibility class and the read-model registry refuses a truth class).
import type { PlayByPlayRow, PlayCalls, PlayTruth, TrajectoryRecord } from '@gm/schema';

export type Side = 0 | 1;

/** One slot of the play: who wore which number in which role. Slots 0 to 10 snap, 11 to 21 oppose (J1.2.2). */
export interface FilmSourceSlot {
  readonly slot: number;
  readonly side: Side;
  readonly personId: number;
  readonly jersey: number;
  /** Position code, for example QB, LT, CB (O6.3.1 marker row). */
  readonly role: string;
}

/** A called assignment drawn as a line (N1.1.2 "the play as drawn"). From the call (G1, J4); own team only. */
export interface AssignmentLine {
  readonly slot: number;
  /** The assignment in words, for example "Inside zone, aiming point outside hip of the guard". */
  readonly words: string;
  /** Field-frame points of the drawn path, yards. */
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

/**
 * One recorded play as the save keeps it (P5). The film filter turns it into a FilmRecord for one
 * viewing team. `truth` and `callValue` never leave this module family.
 */
export interface FilmSource {
  readonly gameId: number;
  readonly playNumber: number;
  /** Game film or practice film (N1.4.1 edge case: practice is graded the same way). */
  readonly kind: 'game' | 'practice';
  /** Team id by side: 0 home, 1 visitor (contract D-01). */
  readonly teams: readonly [number, number];
  readonly ticksPerSecond: number;
  readonly trajectory: TrajectoryRecord;
  readonly slots: readonly FilmSourceSlot[];
  /** Public play-by-play row: situation and called result (J11.9.1). */
  readonly row: PlayByPlayRow;
  /** Both calls as the coaches made them (I2.3.1, G2.1.1). */
  readonly calls: PlayCalls;
  /** Engine truth record (J1.6.2). */
  readonly truth: PlayTruth;
  /** Hash the ball was spotted on (base-set field). */
  readonly hash: 'left' | 'middle' | 'right';
  /** Line of scrimmage and line to gain in the field frame (I9.3.2 item 3). */
  readonly lineOfScrimmageX: number;
  readonly lineToGainX: number | null;
  /** Called assignment lines by slot, from the play content (J4). Empty until the content set exists. */
  readonly assignments: readonly AssignmentLine[];
  /**
   * Engine value of the call against the opponent's actual call, less the caller's average call in
   * that situation (N1.3.1 rule 1), in expected points. Truth: only the staff's word reaches a career.
   */
  readonly callValue: number | null;
}

/** Who is watching. A coach of `teamId`; `school` opens the coaching school's truth mode (N5) only. */
export interface FilmViewer {
  readonly teamId: number;
  readonly mode: 'career' | 'school';
}

/**
 * The staff member who charts opponent film (H2). `accuracy` is the share of coaching-set fields he
 * charts right, 0 to 1; it comes from his demonstrated record (K6), never from a stored skill value.
 */
export interface Charter {
  readonly personId: number;
  readonly accuracy: number;
}

/**
 * A grader or attributing coach (K6, N1.3.2, N1.4.1). `accuracy` is the chance each mark matches what
 * happened; `favourites` are people he leans toward excusing (veterans, his own recruits, by profile).
 * `favouriteLean` is the share of his errors on a favourite that go in the favourite's direction.
 */
export interface Grader {
  readonly personId: number;
  readonly accuracy: number;
  readonly favourites: readonly number[];
  readonly favouriteLean: number;
}

/** N1.3.2 cause types, plus freelance and adjustment from K1.7.6. One fixed vocabulary (N1.2.3). */
export const CAUSE_TYPES = ['physical', 'technique', 'mental', 'communication', 'alignment', 'effort', 'scheme', 'freelance', 'adjustment'] as const;
export type CauseType = (typeof CAUSE_TYPES)[number];

/** Base-set field names of the breakdown row (N1.2.1, the 16 fields an outside tagging service supplies). */
export const BASE_FIELDS = [
  'quarter', 'odk', 'down', 'distance', 'yardLine', 'hash', 'gainLoss', 'playType', 'playDirection', 'result',
  'motionDirection', 'offFormation', 'backfield', 'offStrength', 'series', 'efficiency',
] as const;
export type BaseField = (typeof BASE_FIELDS)[number];

/** Coaching-set field names (N1.2.1, added by the staff or the user). */
export const COACHING_FIELDS = ['personnel', 'defPersonnel', 'front', 'coverage', 'pressure', 'protection', 'concept', 'runScheme', 'target'] as const;
export type CoachingField = (typeof COACHING_FIELDS)[number];

/** Where a coaching-set value came from: the club's own call, the staff chart, the user's chart, or not charted yet. */
export type FieldSource = 'call' | 'staff' | 'user' | 'uncharted';
