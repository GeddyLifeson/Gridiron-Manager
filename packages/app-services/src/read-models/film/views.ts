// The film room's read-model shapes as plain types (P1.3.2). app-services may not import zod (P1.2.2),
// so the zod schemas with a visibility class on every field live in @gm/schema (CR-G63-0; the draft is
// test/read-models/film/schemas.ts, and the tests check both stay the same shape). Classes:
//  public            film itself, the public play-by-play, the club's own published grades
//  own_team          the club's own calls, assignments, notes and correction list
//  observer_estimate a staff member's chart, grade or attribution (it can be wrong)
import type { CauseType, CoachingField, FieldSource } from './types.ts';

type Side = 0 | 1;
interface Point { x: number; y: number }

/** The event kinds the field view draws (G-03 FILM_EVENT_KINDS). */
export const FILM_EVENT_KINDS = ['snap', 'throw', 'catch', 'drop', 'tackle', 'fumble', 'flag', 'whistle', 'outOfBounds', 'kickLanding'] as const;
export type FilmEventKind = (typeof FILM_EVENT_KINDS)[number];
/**
 * The one order for film events on the same tick, which the live feed's camera cues share (a throw and an
 * out-of-bounds can land on one tick): the ball leaves the hand, then it arrives, then the play's end.
 */
export const FILM_TIE_ORDER: Readonly<Record<FilmEventKind, number>> = {
  snap: 2, throw: 3, kickLanding: 4, catch: 4, drop: 4, tackle: 6, fumble: 6, outOfBounds: 6, flag: 7, whistle: 8,
};

export interface FilmEvent { kind: FilmEventKind; tick: number; x: number; y: number; slots?: number[] }

export interface BaseSet {
  quarter: number;
  odk: 'O' | 'D' | 'K';
  down: number | null;
  distance: number | null;
  yardLine: number;
  hash: 'left' | 'middle' | 'right';
  gainLoss: number;
  playType: string;
  playDirection: 'left' | 'middle' | 'right' | null;
  result: string;
  motionDirection: string | null;
  offFormation: string | null;
  backfield: string | null;
  offStrength: string | null;
  series: number;
  efficiency: boolean | null;
}

export interface CoachingSet { values: Record<CoachingField, string | null>; sources: Record<CoachingField, FieldSource> }

/** 'call' is the club's own call; anything else is a guess and is drawn dashed with its author (N1.1.2). */
export interface OverlayLine { slot: number; words: string; points: Point[]; author: 'call' | 'user' | `staff:${number}` | string }

export interface FilmRecord {
  playId: string;
  gameId: number;
  playNumber: number;
  kind: 'game' | 'practice';
  teams: [number, number];
  viewerSide: Side | null;
  ticksPerSecond: number;
  trajectory: { formatVersion: number; firstTick: number; tickCount: number; buffer: Uint8Array };
  slots: { slot: number; side: Side; personId: number; jersey: number; role: string }[];
  events: FilmEvent[];
  situation: { lineOfScrimmageX: number; lineToGainX: number | null; attackDir: 1 | -1; offenseSide: Side };
  base: BaseSet;
  coaching: CoachingSet;
  assignments: OverlayLine[];
  epa: number | null;
  /** Game clock at the snap and the offense's score margin, for situation reels (two-minute, N1.2.2). */
  clockTenths: number;
  offenseMargin: number;
}

/** A trajectory on the wire: read models are plain data (P1.3.2), so the bytes travel as base64. */
export type FilmRecordWire = Omit<FilmRecord, 'trajectory'> & { trajectory: { formatVersion: number; firstTick: number; tickCount: number; base64: string } };

/** One telestration shape (N1.2.3): line, circle or arrow in field-frame yards. */
export interface Drawing { shape: 'line' | 'circle' | 'arrow'; points: Point[] }

/** The annotation layer of one play. Never part of the play record (N1.2.3). */
export interface Annotation { playId: string; tags: string[]; causeTags: CauseType[]; note: string; noteOverSoftLimit: boolean; drawings: Drawing[] }

/** One per-snap grading mark (N1.4.1). */
export interface SnapMark {
  playId: string;
  assignment: 'right' | 'wrong';
  technique: 'plus' | 'zero' | 'minus';
  lostContest: boolean;
  loaf: boolean;
  /** The engine flagged a candidate loaf on a visible pattern; the grader decides (N1.4.1 rule 4). */
  loafCandidate: boolean;
  note: string;
}

export interface GradeSheet {
  gameId: number;
  personId: number;
  grader: 'user' | `staff:${number}` | string;
  rows: SnapMark[];
  snaps: number;
  /** Mean per-snap score (N1.4.1 rule 3), in the engine's grade units. */
  gameScore: number;
  assignmentShare: number;
  loafs: number;
  zeroToFour: number;
  comments: { coachingPoints: string; workOn: string; summary: string };
}

/** N1.3.2 responsibility line (staff opinion or the user's own call). */
export interface Responsibility { playId: string; personId: number | null; cause: CauseType; by: 'user' | `staff:${number}` | string }

export type VisibleLuck = 'tipped_ball' | 'dropped_pass' | 'missed_tackle' | 'broken_tackle' | 'fumble';

/** N1.3.1 breakdown panel in words. */
export interface Breakdown {
  playId: string;
  /** Null on opponent film: only the outcome and visible events are shown (N1.3.1 rule 4). */
  call: 'good' | 'neutral' | 'poor' | null;
  execution: { personId: number; won: boolean }[];
  outcome: { result: string; yards: number; epa: number | null; visibleLuck: VisibleLuck[] };
  /** A play changed at the line is broken down twice (I2.5.2). */
  changedAtLine: boolean;
}

export type CorrectionFix = 'meeting_cutup' | 'walkthrough' | 'individual_drill' | 'simpler_rule' | 'drop_play' | 'change_call';

export interface Correction {
  id: string;
  unit: 'offense' | 'defense' | 'special_teams';
  concept: string;
  personIds: number[];
  cause: CauseType;
  count: number;
  meanEpLost: number;
  repeats: number;
  priority: number;
  fix: CorrectionFix;
  forCoach: boolean;
  state: 'open' | 'accepted' | 'dismissed';
  playIds: string[];
}

export interface CutUp {
  id: string;
  title: string;
  playIds: string[];
  notes: Record<string, string>;
  audience: { kind: 'room' | 'player' | 'staff' | 'none'; id: string | null };
  unchartedPlays: number;
  overAttention: boolean;
}

export interface PlayRow {
  playId: string;
  gameId: number;
  playNumber: number;
  teams: [number, number];
  base: BaseSet;
  coaching: CoachingSet;
  clockTenths: number;
  tags: string[];
  slotsPersonIds: number[];
}

// Read-model data shapes.
export interface FilmPlayData { record: FilmRecordWire; annotation: Annotation; breakdown: Breakdown | null; responsibility: Responsibility | null }
export interface FilmPlayListData { rows: PlayRow[]; total: number }
export interface FilmGradeSheetData { sheet: GradeSheet | null; display: string; scale: string }
export interface FilmCorrectionsData { shown: Correction[]; more: Correction[] }
export interface FilmCutUpsData { cutups: CutUp[]; templates: { id: string; title: string }[] }
