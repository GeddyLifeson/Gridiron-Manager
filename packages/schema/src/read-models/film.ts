// The film room's zod schemas (G-63). Moved here from app-services/test/read-models/film/schemas.ts (CR-G63-0);
// read models registered in READ_MODELS (film*), command payloads in COMMANDS.
// app-services may not import zod (P1.2.2), so its code takes these as parameters. Read-model shapes (P1.3.2, P3.1.2). Every field has a visibility class and none is
// truth, so the read-model registry accepts them and the Q1.4.2 scan can walk them. Classes:
//  public            film itself, the public play-by-play, the club's own published grades
//  own_team          the club's own calls, assignments, notes and correction list
//  observer_estimate a staff member's chart, grade or attribution (it can be wrong)
import { z } from 'zod';
import { pub, own, est } from '../field.ts';
import type { CommandSpec } from '../commands.ts';

// Copies of app-services' film vocabularies (read-models/film/types.ts) and command table
// (commands/film/index.ts): schema may not import app-services. The film test checks they are equal.
export const FILM_CAUSE_TYPES = ['physical', 'technique', 'mental', 'communication', 'alignment', 'effort', 'scheme', 'freelance', 'adjustment'] as const;
export const FILM_COACHING_FIELDS = ['personnel', 'defPersonnel', 'front', 'coverage', 'pressure', 'protection', 'concept', 'runScheme', 'target'] as const;
type CoachingField = (typeof FILM_COACHING_FIELDS)[number];
const CAUSE_TYPES = FILM_CAUSE_TYPES;
const COACHING_FIELDS = FILM_COACHING_FIELDS;
export const FILM_COMMAND_TABLE: readonly Omit<CommandSpec, 'payload'>[] = [
  { type: 'FilmTagPlay', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmUntagPlay', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmSetNote', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmDraw', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmEraseDrawing', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmChartPlay', task: 'film.chart', undoable: true, allowedInCertified: true },
  { type: 'FilmSaveCutUp', task: 'film.review', undoable: true, allowedInCertified: true },
  { type: 'FilmSendCutUp', task: 'film.review', undoable: false, allowedInCertified: true },
  { type: 'FilmGradeSnap', task: 'film.grade', undoable: true, allowedInCertified: true },
  { type: 'FilmAssignBust', task: 'film.grade', undoable: true, allowedInCertified: true },
  { type: 'FilmSetCorrection', task: 'film.corrections', undoable: true, allowedInCertified: true },
  { type: 'FilmSetGradePolicy', task: 'film.policy', undoable: true, allowedInCertified: true },
  { type: 'FilmWatchPlay', task: 'film.review', undoable: false, allowedInCertified: true },
];

const int = () => z.number().int();
const SideS = z.union([z.literal(0), z.literal(1)]);

/** The event kinds the field view draws (G-03 FILM_EVENT_KINDS). */
export const FILM_EVENT_KINDS = ['snap', 'throw', 'catch', 'drop', 'tackle', 'fumble', 'flag', 'whistle', 'outOfBounds', 'kickLanding'] as const;

export const FilmEventS = z.object({
  kind: pub(z.enum(FILM_EVENT_KINDS)),
  tick: pub(int(), 'tick'),
  x: pub(z.number(), 'yd'),
  y: pub(z.number(), 'yd'),
  slots: pub(z.array(int()), 'index').optional(),
}).strict();
export type FilmEvent = z.infer<typeof FilmEventS>;

export const BaseSetS = z.object({
  quarter: pub(int(), 'index'),
  odk: pub(z.enum(['O', 'D', 'K'])),
  down: pub(int(), 'index').nullable(),
  distance: pub(z.number(), 'yd').nullable(),
  yardLine: pub(z.number(), 'yd'),
  hash: pub(z.enum(['left', 'middle', 'right'])),
  gainLoss: pub(z.number(), 'yd'),
  playType: pub(z.string()),
  playDirection: pub(z.enum(['left', 'middle', 'right'])).nullable(),
  result: pub(z.string()),
  motionDirection: pub(z.string()).nullable(),
  offFormation: pub(z.string()).nullable(),
  backfield: pub(z.string()).nullable(),
  offStrength: pub(z.string()).nullable(),
  series: pub(int(), 'index'),
  efficiency: pub(z.boolean()).nullable(),
}).strict();
export type BaseSet = z.infer<typeof BaseSetS>;

const FieldSourceS = z.enum(['call', 'staff', 'user', 'uncharted']);
const coachingShape = <T extends z.ZodType>(mk: () => T) =>
  z.object(Object.fromEntries(COACHING_FIELDS.map((f) => [f, mk()])) as Record<CoachingField, T>).strict();

export const CoachingSetS = z.object({
  values: est(coachingShape(() => est(z.string()).nullable())),
  sources: pub(coachingShape(() => pub(FieldSourceS))),
}).strict();
export type CoachingSet = { values: Record<CoachingField, string | null>; sources: Record<CoachingField, z.infer<typeof FieldSourceS>> };

const PointS = z.object({ x: pub(z.number(), 'yd'), y: pub(z.number(), 'yd') }).strict();

export const OverlayLineS = z.object({
  slot: pub(int(), 'index'),
  words: own(z.string()),
  points: own(z.array(PointS)),
  /** 'call' is the club's own call; anything else is a guess and is drawn dashed with its author (N1.1.2). */
  author: pub(z.union([z.literal('call'), z.literal('user'), z.string().regex(/^staff:\d+$/)])),
}).strict();

export const FilmRecordS = z.object({
  playId: pub(z.string()),
  gameId: pub(int(), 'id'),
  playNumber: pub(int(), 'index'),
  kind: pub(z.enum(['game', 'practice'])),
  teams: pub(z.tuple([pub(int(), 'id'), pub(int(), 'id')])),
  viewerSide: pub(SideS, 'index').nullable(),
  ticksPerSecond: pub(z.number(), 'count'),
  trajectory: pub(z.object({
    formatVersion: pub(int(), 'version'),
    firstTick: pub(int(), 'tick'),
    tickCount: pub(int(), 'count'),
    buffer: pub(z.custom<Uint8Array>((v) => v instanceof Uint8Array)),
  }).strict()),
  slots: pub(z.array(z.object({ slot: pub(int(), 'index'), side: pub(SideS, 'index'), personId: pub(int(), 'id'), jersey: pub(int(), 'index'), role: pub(z.string()) }).strict())),
  events: pub(z.array(FilmEventS)),
  situation: pub(z.object({
    lineOfScrimmageX: pub(z.number(), 'yd'),
    lineToGainX: pub(z.number(), 'yd').nullable(),
    attackDir: pub(z.union([z.literal(1), z.literal(-1)]), 'index'),
    offenseSide: pub(SideS, 'index'),
  }).strict()),
  base: pub(BaseSetS),
  coaching: est(CoachingSetS),
  assignments: own(z.array(OverlayLineS)),
  epa: pub(z.number(), 'points').nullable(),
  /** Game clock at the snap and the offense's score margin, for situation reels (two-minute, N1.2.2). */
  clockTenths: pub(int(), 'tenths_s'),
  offenseMargin: pub(int(), 'points'),
}).strict();
export type FilmRecord = z.infer<typeof FilmRecordS>;
export type OverlayLine = z.infer<typeof OverlayLineS>;

export const CauseTypeS = z.enum(CAUSE_TYPES);

/** One telestration shape (N1.2.3): line, circle or arrow in field-frame yards. */
export const DrawingS = z.object({
  shape: own(z.enum(['line', 'circle', 'arrow'])),
  points: own(z.array(PointS)),
}).strict();
export type Drawing = z.infer<typeof DrawingS>;

/** The annotation layer of one play. Never part of the play record (N1.2.3). */
export const AnnotationS = z.object({
  playId: own(z.string()),
  tags: own(z.array(z.string())),
  causeTags: own(z.array(CauseTypeS)),
  note: own(z.string()),
  noteOverSoftLimit: own(z.boolean()),
  drawings: own(z.array(DrawingS)),
}).strict();
export type Annotation = z.infer<typeof AnnotationS>;

/** One per-snap grading mark (N1.4.1). */
export const SnapMarkS = z.object({
  playId: est(z.string()),
  assignment: est(z.enum(['right', 'wrong'])),
  technique: est(z.enum(['plus', 'zero', 'minus'])),
  lostContest: est(z.boolean()),
  loaf: est(z.boolean()),
  /** The engine flagged a candidate loaf on a visible pattern; the grader decides (N1.4.1 rule 4). */
  loafCandidate: est(z.boolean()),
  note: own(z.string()),
}).strict();
export type SnapMark = z.infer<typeof SnapMarkS>;

export const GradeSheetS = z.object({
  gameId: own(int(), 'id'),
  personId: own(int(), 'id'),
  grader: own(z.union([z.literal('user'), z.string().regex(/^staff:\d+$/)])),
  rows: own(z.array(SnapMarkS)),
  snaps: est(int(), 'count'),
  /** Mean per-snap score (N1.4.1 rule 3), in the engine's grade units. */
  gameScore: est(z.number(), 'ratio'),
  assignmentShare: est(z.number(), 'ratio'),
  loafs: est(int(), 'count'),
  zeroToFour: est(z.number(), 'ratio'),
  comments: own(z.object({ coachingPoints: own(z.string()), workOn: own(z.string()), summary: own(z.string()) }).strict()),
}).strict();
export type GradeSheet = z.infer<typeof GradeSheetS>;

/** N1.3.2 responsibility line (staff opinion or the user's own call). */
export const ResponsibilityS = z.object({
  playId: est(z.string()),
  personId: est(int(), 'id').nullable(),
  cause: est(CauseTypeS),
  by: est(z.union([z.literal('user'), z.string().regex(/^staff:\d+$/)])),
}).strict();
export type Responsibility = z.infer<typeof ResponsibilityS>;

/** N1.3.1 breakdown panel in words. */
export const BreakdownS = z.object({
  playId: est(z.string()),
  /** Null on opponent film: only the outcome and visible events are shown (N1.3.1 rule 4). */
  call: est(z.enum(['good', 'neutral', 'poor'])).nullable(),
  execution: est(z.array(z.object({ personId: est(int(), 'id'), won: est(z.boolean()) }).strict())),
  outcome: pub(z.object({ result: pub(z.string()), yards: pub(z.number(), 'yd'), epa: pub(z.number(), 'points').nullable(), visibleLuck: pub(z.array(z.enum(['tipped_ball', 'dropped_pass', 'missed_tackle', 'broken_tackle', 'fumble']))) }).strict()),
  /** A play changed at the line is broken down twice (I2.5.2). */
  changedAtLine: pub(z.boolean()),
}).strict();
export type Breakdown = z.infer<typeof BreakdownS>;

export const CorrectionS = z.object({
  id: own(z.string()),
  unit: own(z.enum(['offense', 'defense', 'special_teams'])),
  concept: own(z.string()),
  personIds: own(z.array(int()), 'id'),
  cause: own(CauseTypeS),
  count: own(int(), 'count'),
  meanEpLost: own(z.number(), 'points'),
  repeats: own(int(), 'count'),
  priority: own(z.number(), 'points'),
  fix: own(z.enum(['meeting_cutup', 'walkthrough', 'individual_drill', 'simpler_rule', 'drop_play', 'change_call'])),
  forCoach: own(z.boolean()),
  state: own(z.enum(['open', 'accepted', 'dismissed'])),
  playIds: own(z.array(z.string())),
}).strict();
export type Correction = z.infer<typeof CorrectionS>;

export const CutUpS = z.object({
  id: own(z.string()),
  title: own(z.string()),
  playIds: own(z.array(z.string())),
  notes: own(z.record(z.string(), own(z.string()))),
  audience: own(z.object({ kind: own(z.enum(['room', 'player', 'staff', 'none'])), id: own(z.string()).nullable() }).strict()),
  unchartedPlays: own(int(), 'count'),
  overAttention: own(z.boolean()),
}).strict();
export type CutUp = z.infer<typeof CutUpS>;

export const PlayRowS = z.object({
  playId: pub(z.string()),
  gameId: pub(int(), 'id'),
  playNumber: pub(int(), 'index'),
  teams: pub(z.tuple([pub(int(), 'id'), pub(int(), 'id')])),
  base: pub(BaseSetS),
  coaching: est(CoachingSetS),
  clockTenths: pub(int(), 'tenths_s'),
  tags: own(z.array(z.string())),
  slotsPersonIds: pub(z.array(int()), 'id'),
}).strict();
export type FilmPlayRow = z.infer<typeof PlayRowS>;

/** A trajectory on the wire: read models are plain data (P1.3.2), so the bytes travel as base64. */
export const TrajectoryWireS = z.object({
  formatVersion: pub(int(), 'version'),
  firstTick: pub(int(), 'tick'),
  tickCount: pub(int(), 'count'),
  base64: pub(z.string()),
}).strict();
export const FilmRecordWireS = FilmRecordS.extend({ trajectory: pub(TrajectoryWireS) }).strict();
export type FilmRecordWire = z.infer<typeof FilmRecordWireS>;

// Read-model data shapes (filmReadModels takes these as FilmModelSchemas).
const GRADE_SCALE_IDS = ['decimal', 'letter', 'hundred', 'tiers', 'assignment', 'zeroToFour'] as const;
export const FilmPlayDataS = z.object({
  record: pub(FilmRecordWireS),
  annotation: own(AnnotationS),
  breakdown: own(BreakdownS).nullable(),
  responsibility: own(ResponsibilityS).nullable(),
}).strict();
export const FilmPlayListDataS = z.object({ rows: pub(z.array(PlayRowS)), total: pub(z.number().int(), 'count') }).strict();
export const FilmGradeSheetDataS = z.object({ sheet: own(GradeSheetS).nullable(), display: own(z.string()), scale: own(z.enum(GRADE_SCALE_IDS)) }).strict();
export const FilmCorrectionsDataS = z.object({ shown: own(z.array(CorrectionS)), more: own(z.array(CorrectionS)) }).strict();
export const FilmCutUpsDataS = z.object({ cutups: own(z.array(CutUpS)), templates: pub(z.array(z.object({ id: pub(z.string()), title: pub(z.string()) }).strict())) }).strict();
export const FILM_MODEL_SCHEMAS = { play: FilmPlayDataS, playList: FilmPlayListDataS, gradeSheet: FilmGradeSheetDataS, corrections: FilmCorrectionsDataS, cutUps: FilmCutUpsDataS };

// Command payloads (P1.3.1). FILM_COMMAND_SPECS joins COMMANDS in @gm/schema.
const playIdS = () => own(z.string().regex(/^\d+:\d+$/));
const idS = () => own(z.number().int().positive(), 'id');
const PointPayloadS = z.object({ x: own(z.number(), 'yd'), y: own(z.number(), 'yd') }).strict();
export const FilmTagPlay = z.object({ playId: playIdS(), tag: own(z.string().min(1).max(40)) }).strict();
export const FilmSetNote = z.object({ playId: playIdS(), note: own(z.string().max(20000)) }).strict();
export const FilmDraw = z.object({ playId: playIdS(), shape: own(z.enum(['line', 'circle', 'arrow'])), points: own(z.array(PointPayloadS).min(2).max(64)) }).strict();
export const FilmEraseDrawing = z.object({ playId: playIdS(), index: own(z.number().int().min(0), 'index') }).strict();
export const FilmChartPlay = z.object({ playId: playIdS(), field: own(z.enum(COACHING_FIELDS)), value: own(z.string().min(1).max(40)) }).strict();
export const FilmSaveCutUp = z.object({ id: own(z.string().min(1).max(60)), title: own(z.string().min(1).max(80)), playIds: own(z.array(z.string())), notes: own(z.record(z.string(), own(z.string().max(2000)))) }).strict();
export const FilmSendCutUp = z.object({ id: own(z.string()), kind: own(z.enum(['room', 'player', 'staff', 'none'])), to: own(z.string()).nullable() }).strict();
export const FilmGradeSnap = z.object({
  gameId: idS(), personId: idS(), playId: playIdS(),
  assignment: own(z.enum(['right', 'wrong'])), technique: own(z.enum(['plus', 'zero', 'minus'])),
  lostContest: own(z.boolean()), loaf: own(z.boolean()), note: own(z.string().max(500)),
}).strict();
export const FilmAssignBust = z.object({ playId: playIdS(), personId: idS().nullable(), cause: own(z.enum(CAUSE_TYPES)) }).strict();
export const FilmSetCorrection = z.object({ gameId: idS(), correctionId: own(z.string()), state: own(z.enum(['open', 'accepted', 'dismissed'])) }).strict();
export const FilmSetGradePolicy = z.object({
  room: own(z.string()), policy: own(z.enum(['posted', 'one_on_one', 'private'])),
  forms: own(z.array(z.enum(['loaf_board', 'effort_points', 'season_award', 'morning_sheets']))),
}).strict();
export const FilmWatchPlay = z.object({ week: own(z.number().int().min(0), 'index'), playId: playIdS() }).strict();

const PAYLOADS: Record<string, z.ZodType> = {
  FilmTagPlay, FilmUntagPlay: FilmTagPlay, FilmSetNote, FilmDraw, FilmEraseDrawing, FilmChartPlay, FilmSaveCutUp, FilmSendCutUp,
  FilmGradeSnap, FilmAssignBust, FilmSetCorrection, FilmSetGradePolicy, FilmWatchPlay,
};
export const FILM_COMMAND_SPECS: readonly CommandSpec[] = FILM_COMMAND_TABLE.map((c) => ({ ...c, payload: PAYLOADS[c.type]! }));
