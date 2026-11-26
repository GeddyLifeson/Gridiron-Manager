// The full offensive set (WP-25): the starter plays plus the plays in the three files beside this one.
import { PLAYS as STARTER_PLAYS } from '../starter/index.ts';
import type { PlayDef } from '../starter/types.ts';
import { FULL_PA } from './offense-pa.ts';
import { FULL_PASSES } from './offense-pass.ts';
import { FULL_RUNS } from './offense-run.ts';

/** Plays this work package adds. */
export const ADDED_PLAYS: readonly PlayDef[] = [...FULL_RUNS, ...FULL_PASSES, ...FULL_PA];
/** Every play of the v1 set: the starter twelve first, then the additions. */
export const FULL_PLAYS: readonly PlayDef[] = [...STARTER_PLAYS, ...ADDED_PLAYS];
