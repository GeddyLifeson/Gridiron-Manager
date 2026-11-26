// Where reps come from (D7.2.1, D7.2.2) and the development windows (D7.7.1).
import type { AttributeId } from '@gm/schema';
import { WORKED, type PositionFamily } from './classes.ts';
import { traitMultiplier } from './teaching.ts';
import { num, type DevNumbers } from './params.ts';

/** D7.2.1 activity kinds. Weights are `reps.<kind>` in params.json. */
export const ACTIVITIES = ['gameSnap', 'teamPeriod', 'competitive', 'individual', 'sevenOnSeven', 'scoutTeam', 'walkThrough', 'filmPer15Min', 'extraWork'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export interface ActivityLine {
  readonly kind: Activity;
  /** Reps (or 15-minute blocks of film). */
  readonly count: number;
  /** Attributes the activity works (a game snap only those the snap used). */
  readonly attributes: readonly AttributeId[];
  /** Competitive drills: opponent quality against the player (D7.2.1 note). */
  readonly opponent?: 'weaker' | 'even' | 'better';
  /** Individual periods for an attribute that is a plan priority this window (D7.7.1). */
  readonly planPriority?: boolean;
}

/** Weight per rep of one activity line (D7.2.1, D7.7.1). */
export function repWeight(n: DevNumbers, line: ActivityLine): number {
  let w = num(n, `reps.${line.kind}`);
  if (line.kind === 'competitive' && line.opponent === 'weaker') w = num(n, 'reps.competitiveWeaker');
  if (line.kind === 'competitive' && line.opponent === 'better') w = num(n, 'reps.competitiveBetter');
  if (line.kind === 'individual' && line.planPriority) w *= 1 + num(n, 'reps.planPriorityBonus');
  return w;
}

/** Quality reps credited per attribute for a week (D7.2.1): the same function H3 uses for its projection. */
export function creditReps(n: DevNumbers, lines: readonly ActivityLine[]): Partial<Record<AttributeId, number>> {
  const out: Partial<Record<AttributeId, number>> = {};
  for (const line of lines) {
    const credit = line.count * repWeight(n, line);
    for (const a of line.attributes) out[a] = (out[a] ?? 0) + credit;
  }
  return out;
}

/** D7.7.1 calendar windows. */
export const WINDOWS = ['offseasonProgram', 'camp', 'inSeason', 'away'] as const;
export type Window = (typeof WINDOWS)[number];
export type Role = 'starter' | 'backup';

/**
 * Default weekly reps per worked attribute when no practice plan exists (AI staff fallback, headless
 * runs). Away from the building the rate follows work ethic, so low-effort players fall under the
 * decay threshold and come back rusty (D7.7.1).
 */
export function defaultWeeklyReps(n: DevNumbers, family: PositionFamily, win: Window, role: Role, workEthicFacet?: number): Partial<Record<AttributeId, number>> {
  let reps = num(n, `reps.default.${win}.${role}`);
  if (win === 'away') reps *= traitMultiplier(n, workEthicFacet, num(n, 'reps.default.awayWorkEthicSwing'));
  const out: Partial<Record<AttributeId, number>> = {};
  for (const a of WORKED[family]) out[a] = reps;
  return out;
}
