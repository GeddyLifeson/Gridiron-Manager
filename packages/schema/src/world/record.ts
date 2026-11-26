// World contract, part 8: the record of what happened outside the play row (P3.3.1, P3.3.2, P3.1.1).
// The play row itself is the sim contract's `PlayRecord` (../sim/game-state.ts), stored in the `plays`
// table as it is (W-18). Derived tables (tendency cells, season summaries) are caches over the record
// and are never a source of truth, except season summaries written at archive time (P5.4.2).
import { z } from 'zod';
import { pub, own, truth } from '../field.ts';
import { Environment } from '../sim/environment.ts';
import { DriveRecord } from '../sim/game-state.ts';
import { WorldTier, zCount, zId, zIdList, zWorldDate, zYear } from './primitives.ts';

/** One game (P3.3.1 `Game`). Teams are indexed by the sim `Side`: 0 home (or first listed at a neutral site), 1 visitor. */
export const GameRecord = z.object({
  id: zId(),
  competitionId: zId(),
  seasonYear: zYear(),
  /** Week index of the C4 or T3 calendar for this competition; postseason rounds continue the count. */
  week: pub(z.number().int().min(0), 'index'),
  kickoff: zWorldDate(),
  teamIds: pub(z.tuple([z.number().int().positive(), z.number().int().positive()]), 'id'),
  venueId: zId(),
  neutralSite: pub(z.boolean()),
  phase: pub(z.enum(['preseason', 'regular', 'postseason'])),
  status: pub(z.enum(['scheduled', 'in_progress', 'final', 'postponed', 'cancelled'])),
  /** Weather at kickoff (J12); null until the game starts. */
  environment: pub(Environment).nullable(),
  /** Game seed (J13). Truth: knowing it would let a reader predict the game (W-12). */
  seedHex: truth(z.string().regex(/^[0-9a-f]{16}$/)),
  crewId: zId().nullable(),
  finalScore: pub(z.tuple([z.number().int().min(0), z.number().int().min(0)]), 'points').nullable(),
  /** State hash after the final play (P1.1.5). */
  stateHash: pub(z.string()).nullable(),
  /** World tier the game was simulated at (X13.1.1). Internal, never shown. */
  tier: truth(WorldTier),
}).strict();
export type GameRecord = z.infer<typeof GameRecord>;

/** A drive row as stored: the sim contract's DriveRecord plus the game it belongs to (W-18). */
export const GameDriveRow = z.object({
  gameId: zId(),
  drive: pub(DriveRecord),
}).strict();
export type GameDriveRow = z.infer<typeof GameDriveRow>;

/** Pointer to a stored trajectory buffer (P3.3.2, P2.2.2). Kept or regenerable per P5.4.1. */
export const TrajectoryRef = z.object({
  gameId: zId(),
  playIndex: pub(z.number().int().positive(), 'index'),
  formatVersion: pub(z.number().int().positive(), 'version'),
  state: pub(z.enum(['stored', 'regenerable', 'dropped'])),
  byteLength: zCount(),
}).strict();
export type TrajectoryRef = z.infer<typeof TrajectoryRef>;

/** Derived tendency cell (P3.3.2). Rebuilt on demand from plays; deleting and rebuilding gives identical cells. */
export const TendencyCell = z.object({
  teamId: zId(),
  seasonYear: zYear(),
  situationBucket: pub(z.string().min(1)),
  /** Call attributes key (formation, personnel, concept family...) built by the tendency model (G-66). */
  callKey: pub(z.string().min(1)),
  count: zCount(),
  results: pub(z.record(z.string(), z.number()), 'ratio'),
}).strict();
export type TendencyCell = z.infer<typeof TendencyCell>;

/** One staff member's grade of one player on one play (P3.3.2, N1). Belongs to the grading organisation. */
export const PlayerPlayGrade = z.object({
  gameId: zId(),
  playIndex: pub(z.number().int().positive(), 'index'),
  personId: zId(),
  graderPersonId: zId('own_team'),
  graderTeamId: zId('own_team'),
  /** N1 per-snap marks: assignment right or wrong, technique plus, zero or minus, effort normal or a loaf. */
  assignmentCorrect: own(z.boolean()),
  technique: own(z.enum(['plus', 'zero', 'minus'])),
  effort: own(z.enum(['normal', 'loaf'])),
  mentalError: own(z.boolean()),
  reasonCodes: own(z.array(z.string())),
  note: own(z.string()).nullable(),
}).strict();
export type PlayerPlayGrade = z.infer<typeof PlayerPlayGrade>;

/** One decision measured against the model (P3.3.2 Decision grade, N3). */
export const DecisionGrade = z.object({
  gameId: zId(),
  playIndex: pub(z.number().int().min(0), 'index'),
  actorPersonId: zId(),
  decisionType: pub(z.string().min(1)),
  optionTaken: pub(z.string().min(1)),
  options: pub(z.array(z.object({
    optionId: pub(z.string().min(1)),
    /** Model value in the model's unit (expected points or win probability) and its uncertainty. */
    value: pub(z.number(), 'ratio'),
    uncertainty: pub(z.number().min(0), 'ratio'),
  }).strict()).min(1)),
  modelId: pub(z.string().min(1)),
}).strict();
export type DecisionGrade = z.infer<typeof DecisionGrade>;

/** A suggestion from a person who does not own the task (P3.3.2, P1.3.1, O7.1.1, S4). */
export const SuggestionRecord = z.object({
  id: zId(),
  actorPersonId: zId(),
  ownerPersonId: zId(),
  /** The wrapped command's id in the command log. */
  wrappedCommandId: zId('own_team'),
  submitted: zWorldDate(),
  response: own(z.enum(['pending', 'accepted', 'edited', 'rejected', 'expired'])),
  /** X2 event ids that later show how it worked out. */
  outcomeEventIds: zIdList('own_team'),
}).strict();
export type SuggestionRecord = z.infer<typeof SuggestionRecord>;

/** Season statistic totals written when a season is archived (P3.1.1, P5.4.2). */
export const SeasonStatSummary = z.object({
  personId: zId().nullable(),
  teamId: zId(),
  competitionId: zId(),
  seasonYear: zYear(),
  /** Stat id (sim STAT_IDS) to total. */
  totals: pub(z.record(z.string(), z.number()), 'count'),
  gamesPlayed: zCount(),
  writtenAt: zWorldDate(),
}).strict();
export type SeasonStatSummary = z.infer<typeof SeasonStatSummary>;
