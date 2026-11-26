// Shared shapes of the front office AI (K7). Nothing here can carry a true attribute: a club decides from
// its own estimates (D6) only (K7.2.2 rule 6, D6.1.2). `test/gm/gm.test.ts` checks that no source file in
// this folder imports the truth readers of the scouting module.
import type { RandomStream } from '@gm/schema';

export type ClubId = number;
export type PersonId = number;

/** A normal belief in ISS, as the scouting module holds it (people/scouting Estimate, mean and variance only). */
export interface Belief { readonly mean: number; readonly variance: number }

/** What one club believes about one player. Built by the caller from that club's D6 estimates. */
export interface PlayerView {
  readonly personId: PersonId;
  readonly position: string;
  readonly age: number;
  /** Role grade today for the head coach's system (D6.2.2). */
  readonly grade: Belief;
  /** Projected grade at peak (D6.5.1), or null where the scouting module shows none. */
  readonly projected: Belief | null;
  /** Fit to the role requirements of the head coach's system (M1), 1 = neutral. */
  readonly fit: number;
  /** Character flags this club knows about (D6.3.2). */
  readonly flags: number;
  /** Cap charge by year from this season, cents (C6), or the college roster-budget cost (T7.3.1). Empty = unsigned. */
  readonly costCentsByYear: readonly number[];
}

/**
 * Estimated contribution by position, produced from engine batch runs (J14.6.1, K7.2.2 rule 1). Position value
 * and replacement level come from the game itself, never from outside data.
 */
export interface ContributionTable {
  /** Wins per season for one ISS point above replacement at the position. */
  winsPerIss(position: string): number;
  /** Grade of a freely available player at the position. */
  replacementIss(position: string): number;
  /** Share of a position's value each depth rank carries, best first (starter slots at 1, then depth). */
  slotWeights(position: string): readonly number[];
}

/** Development and aging as the league expects them (D7, D8). Each general manager bends the decline by his own belief. */
export interface AgeCurve {
  group(position: string): string;
  peakAge(position: string): number;
  primeEndAge(position: string): number;
  declineIssPerYear(position: string): number;
}

/**
 * A standard normal that is the same every time it is asked for the same key. Errors of judgement must be
 * persistent: a general manager who re-rolled his opinion on each ask could be fished for a yes (Q4.3.1).
 * The world supplies it from J13 streams scoped by the key (K7.8.1 rule 4).
 */
export type PersistentDraw = (kind: 'grade' | 'market', gmId: PersonId, key: number) => number;

export interface ValueContext {
  readonly table: ContributionTable;
  readonly curve: AgeCurve;
  /** The league's going rate, cents of cap per win, computed each offseason from signed contracts (K7.2.2 rule 5). */
  readonly centsPerWin: number;
  readonly draw: PersistentDraw;
  /** Job pressure on this general manager, 0 to 1 (K8.3.1). Shortens his horizon (K7.1.1 rule 4). */
  readonly pressure: number;
  /**
   * Speed only, never a result: true when the table, curve and draw answer the same for the same question for
   * the life of this object, so a player's wins by season may be remembered per context, profile and view
   * object. A copy with a changed member is a different object and keeps its own memory.
   */
  readonly memo?: boolean;
}

/** L5.2.1 `power` fields this module checks. */
export type PowerField = 'final_say_roster' | 'final_say_draft' | 'final_say_contracts';

export type Rng = Pick<RandomStream, 'normal' | 'uniform'>;

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
