// Simulation contract, part 7: the game situation and the play calls (J1.6.1 inputs, J11.1.1,
// I2.3.1, G1.1.1, G2.1.1). All of it is public information: it is what both sidelines and the
// scoreboard show. No truth value appears here, so deciders (AI or user) may read it freely (Q1.4.1).
import { z } from 'zod';
import { pub, own } from '../field.ts';
import { zSide, zTenths, AttackDir } from './primitives.ts';
import { FieldedPlayer } from './player.ts';

/** Clock state machine of B1.2.1. */
export const ClockStatus = z.enum(['running', 'stopped_start_on_snap', 'stopped_start_on_ready', 'untimed', 'intermission']);
export type ClockStatus = z.infer<typeof ClockStatus>;

/** What kind of down or kick the next snap is (J11.2.1, J11.7.1, B6.1.1, B6.4.3). */
export const PlayKind = z.enum(['scrimmage', 'try', 'kickoff', 'safety_kick', 'fair_catch_kick']);
export type PlayKind = z.infer<typeof PlayKind>;

/**
 * The situation handed to a resolver and to deciders (J1.6.1 `situation`). Field frame, exact values:
 * the distance to gain is exact, never rounded to a yard (J11.3.2).
 */
export const GameSituation = z.object({
  gameId: pub(z.number().int().positive(), 'id'),
  /** Counter of plays in the game, from 1. Scope field `play` of every J13.2.1 stream. */
  playNumber: pub(z.number().int().positive(), 'index'),
  driveNumber: pub(z.number().int().min(0), 'index'),
  playKind: pub(PlayKind),
  /** Period from 1. Overtime periods continue the count (5, 6, ...). */
  period: pub(z.number().int().min(1), 'index'),
  overtime: pub(z.boolean()),
  clockTenths: zTenths(),
  clockStatus: pub(ClockStatus),
  /** Play clock when the ball is snapped (integer tenths). The play clock always runs (I2.1.2). */
  playClockAtSnapTenths: zTenths(),
  /** Team that snaps or kicks. */
  offense: zSide(),
  /** Direction the snapping or kicking team attacks this period. */
  attackDir: pub(AttackDir, 'index'),
  /** Down 1 to the rule set's `series.downs`; null on kicks and tries. */
  down: pub(z.number().int().min(1), 'index').nullable(),
  /** Exact yards to the line to gain; null on kicks and tries. */
  distanceYd: pub(z.number().min(0), 'yd').nullable(),
  goalToGo: pub(z.boolean()),
  /** Ball spot in the field frame after hash placement (J11.3.2). */
  ballX: pub(z.number(), 'yd'),
  ballY: pub(z.number(), 'yd'),
  /** Field x of the line to gain; null on kicks and tries. */
  lineToGainX: pub(z.number(), 'yd').nullable(),
  score: pub(z.tuple([z.number().int().min(0), z.number().int().min(0)]), 'points'),
  timeoutsLeft: pub(z.tuple([z.number().int().min(0), z.number().int().min(0)]), 'count'),
  /** True after the two-minute warning or the college two-minute timeout of this half (B1.4.4, B13.3.2). */
  insideTwoMinute: pub(z.boolean()),
  /** An untimed down owed by rule (B1.7.2). */
  untimedDown: pub(z.boolean()),
}).strict();
export type GameSituation = z.infer<typeof GameSituation>;

/** G1.1.1 `kind`. The reference resolver classifies offense calls by this family (J1.6.3). */
export const OffensePlayKind = z.enum([
  'run', 'dropback_pass', 'quick_pass', 'play_action', 'movement_pass', 'screen', 'rpo', 'draw',
  'qb_run', 'trick', 'kneel', 'spike',
]);
export type OffensePlayKind = z.infer<typeof OffensePlayKind>;

/** Coverage families with J15.8.1 rows. 'other' covers every shell without a target row. */
export const CoverageFamily = z.enum(['cover0', 'cover1', 'cover2', 'cover3', 'cover4', 'cover6', 'two_man', 'other']);
export type CoverageFamily = z.infer<typeof CoverageFamily>;

export const Tempo = z.enum(['huddle', 'no_huddle', 'hurry_up']);
export const Lateral = z.enum(['left', 'middle', 'right']);

/**
 * Offensive call (I2.3.1 call object). A play holds no outcome numbers (G1.1.1). `playContentId` is
 * null until the content set exists (phase 2); the family fields are always filled, so the reference
 * resolver and the play-by-play can work from the first phase. `players` is whoever the coach sent
 * out: more or fewer than eleven is allowed and draws a flag (J4.6.1), never a refusal.
 */
export const OffenseCall = z.object({
  unit: pub(z.literal('offense')),
  playContentId: own(z.string()).nullable(),
  contentHash: own(z.string()).nullable(),
  kind: pub(OffensePlayKind),
  /** Personnel group code, backs then tight ends, for example "11" (G1.1.1, J15.8.1). */
  personnelCode: pub(z.string().regex(/^\d\d$/)),
  formationId: pub(z.string()).nullable(),
  strength: pub(z.enum(['left', 'right', 'field', 'boundary'])).nullable(),
  motionId: pub(z.string()).nullable(),
  protectionId: own(z.string()).nullable(),
  tags: own(z.array(z.string())),
  /** Called run direction, for run kinds (J15.5.1 direction row). */
  runDirection: pub(Lateral).nullable(),
  shotgun: pub(z.boolean()),
  tempo: pub(Tempo),
  players: pub(z.array(FieldedPlayer)),
}).strict();
export type OffenseCall = z.infer<typeof OffenseCall>;

/** Defensive call (G2.1.1, I3). The family fields are what a scout could chart from film (P3.3.1 features). */
export const DefenseCall = z.object({
  unit: pub(z.literal('defense')),
  callContentId: own(z.string()).nullable(),
  contentHash: own(z.string()).nullable(),
  packageId: pub(z.string()).nullable(),
  frontId: pub(z.string()).nullable(),
  coverageId: own(z.string()).nullable(),
  pressureId: own(z.string()).nullable(),
  coverageFamily: pub(CoverageFamily),
  /** Number of pass rushers the call sends (J15.4.2 rows). */
  rushers: pub(z.number().int().min(0).max(11), 'count'),
  /** Defenders in the box at the snap (J15.5.1 rows). */
  boxCount: pub(z.number().int().min(0).max(11), 'count'),
  players: pub(z.array(FieldedPlayer)),
}).strict();
export type DefenseCall = z.infer<typeof DefenseCall>;

export const KickKind = z.enum(['punt', 'field_goal', 'try_kick', 'kickoff', 'onside_kick', 'safety_kick', 'fair_catch_kick']);
export type KickKind = z.infer<typeof KickKind>;

/** Kicking unit call (I4, F12). The fourth-down decision is expressed by which unit is called (J11.6.1). */
export const KickCall = z.object({
  unit: pub(z.literal('kick')),
  kickKind: pub(KickKind),
  callContentId: own(z.string()).nullable(),
  contentHash: own(z.string()).nullable(),
  /** Aim side of a punt or kickoff; null means straight. */
  direction: own(Lateral).nullable(),
  players: pub(z.array(FieldedPlayer)),
}).strict();
export type KickCall = z.infer<typeof KickCall>;

export const ReturnKind = z.enum(['punt_return', 'punt_block', 'kick_return', 'hands_team', 'field_goal_block', 'try_block']);

/** Receiving or kick-defending unit call (I4, F12). */
export const ReturnCall = z.object({
  unit: pub(z.literal('return')),
  returnKind: pub(ReturnKind),
  callContentId: own(z.string()).nullable(),
  contentHash: own(z.string()).nullable(),
  players: pub(z.array(FieldedPlayer)),
}).strict();
export type ReturnCall = z.infer<typeof ReturnCall>;

/** A call by the team that snaps or kicks, and a call by the other team. */
export const SnappingCall = z.discriminatedUnion('unit', [OffenseCall, KickCall]);
export type SnappingCall = z.infer<typeof SnappingCall>;
export const OpposingCall = z.discriminatedUnion('unit', [DefenseCall, ReturnCall]);
export type OpposingCall = z.infer<typeof OpposingCall>;

/**
 * The play intent passed into a resolver (J1.6.1 `offenseCall`, `defenseCall`). Slots 0 to 10 are
 * `snapping.players` in order, slots 11 to 21 are `opposing.players` in order (J1.2.2).
 */
export const PlayCalls = z.object({
  snapping: pub(SnappingCall),
  opposing: pub(OpposingCall),
}).strict();
export type PlayCalls = z.infer<typeof PlayCalls>;
