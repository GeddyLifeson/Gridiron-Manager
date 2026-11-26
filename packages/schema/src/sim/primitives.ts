// Simulation contract, part 1: ids, sides, slots, time constants (J1.2, J1.3, J11.1.1, J13.3.2).
// This folder (`schema/src/sim`) is the shared contract of the engine build. It is owned by the
// integrator. A work package that needs a change asks for it (plans/engine-build-plan.md, section 6);
// it never edits these files in its own branch.
import { z } from 'zod';
import { pub } from '../field.ts';

/** World ids are integers issued per save (P3.1.2). Content ids are strings namespaced by pack. */
export type PlayerId = number;
export type TeamId = number;
export type GameId = number;
export type ContentId = string;

export const zPlayerId = () => pub(z.number().int().positive(), 'id');
export const zTeamId = () => pub(z.number().int().positive(), 'id');
export const zContentId = () => pub(z.string().min(1));

/**
 * Side of a game: index into every two-team tuple of the game state. 0 is the home team (or the team
 * listed first at a neutral site), 1 is the visitor. Possession, scores, timeouts all use it.
 */
export const Side = z.union([z.literal(0), z.literal(1)]);
export type Side = z.infer<typeof Side>;
export const zSide = () => pub(Side, 'index');
export function otherSide(s: Side): Side { return s === 0 ? 1 : 0; }

/** Direction of attack along field x (J1.1.1): +1 attacks the east goal line, -1 the west. */
export const AttackDir = z.union([z.literal(1), z.literal(-1)]);
export type AttackDir = z.infer<typeof AttackDir>;

/**
 * Player slot inside one play (J1.2.2, J13.3.2): 0 to 10 are the team that snaps or kicks, 11 to 21 the
 * other team. Slots never change during a play, including after a change of possession.
 */
export type Slot = number;
export const SLOT_COUNT = 22;
export const SLOTS_PER_TEAM = 11;

/** J1.3.1 constants. SUBSTEPS is a starting value and is read by the tick loop from here only. */
export const TICK_S = 0.1;
export const TICKS_PER_SECOND = 10;
export const SUBSTEPS = 2;
/** Hard limit of a live play (J1.3.1): 600 ticks. Beyond it the play is an engine fault. */
export const MAX_LIVE_TICKS = 600;
/** Ticks simulated after the whistle for film and dead-ball foul hazards (J1.3.1). */
export const AFTER_WHISTLE_TICKS = 10;

/**
 * Clock quantities are integers in tenths of a second, never floats (J11.1.1, J13.3.2).
 * One tick of the play simulation is one tenth.
 */
export type Tenths = number;
export const zTenths = () => pub(z.number().int().min(0), 'tenths_s');

/** Sim time inside a play: seconds since the snap, negative before it (J1.3.2), written to 0.01 s. */
export type SimSeconds = number;

/** ISS to z (J1.2.1, J6.1.1): 50 is the average pro starter at the position, 10 is one standard deviation. */
export function issToZ(iss: number): number { return (iss - 50) / 10; }

/** Rounding on write only (J1.2.2): positions to 0.01 yd, sim times to 0.01 s. State is never rounded mid-play. */
export function roundYd(v: number): number { return Math.round(v * 100) / 100; }
export function roundSimS(v: number): number { return Math.round(v * 100) / 100; }
