// Shapes shared by the scripted career runner, its scripts and the loop search (G-89).
import type { RandomStream } from '@gm/schema';
import type { Running, WeekMode } from './pace.ts';

export type Level = 'college' | 'pro';

/** The seat a coach holds: E2.1.1 rung (0 to 9), level and the team's standing. */
export interface Seat {
  readonly rung: number;
  readonly level: Level;
  /** E2.2.2 level prestige weight, 0 to 40. */
  readonly prestige: number;
  readonly teamId: number;
  /** Roster quality as the public sees it, 0 poor to 1 talented. */
  readonly roster: number;
  readonly seasonsInJob: number;
  readonly firstHeadJob: boolean;
}

/**
 * X2-style logged history the AI people read (Q4.3.1 "every AI person involved must use memory of the user's
 * logged history"). Counts of demonstrated behaviour, never a trait.
 */
export interface Logged {
  /** Left after one season for a seat that was not a rung up. */
  readonly oneSeasonStays: number;
  readonly tankedSeasons: number;
  readonly raids: number;
  readonly flipSeasons: number;
  readonly firings: number;
}

export interface CareerState {
  readonly season: number;
  readonly age: number;
  readonly seat: Seat | null;
  readonly lastSeat: Seat | null;
  readonly yearsOut: number;
  /** Regard with owners and media, 0 to 1 (career/reputation effective value stands in here). */
  readonly reputation: number;
  /** Strongest network path to hirers, 0 to 100 (E2.4.1). */
  readonly path: number;
  readonly lastResults: number;
  /** Mean results over every season employed: the public record a hirer reads when he is out of work. */
  readonly recordResults: number;
  readonly seasonsEmployed: number;
  readonly lastWork: number;
  readonly running: Readonly<Record<string, Running>>;
  readonly logged: Logged;
  readonly nextTeamId: number;
}

export interface Offer {
  readonly rung: number;
  readonly level: Level;
  readonly prestige: number;
  readonly teamId: number;
  readonly roster: number;
  readonly fit: string;
  readonly value: number;
}

export interface PolicyContext { readonly state: CareerState }

/** What a script decides. Every hook reads only what the user could see (his own record and the offers). */
export interface CareerPolicy {
  readonly id: string;
  readonly families: readonly string[];
  pace(ctx: PolicyContext): WeekMode;
  /** The grade of one hand-played duty (the script's quality of work). */
  grade(family: string, ctx: PolicyContext, stream: RandomStream): number;
  /** S10.1.2: every offer stops the simulation; the script answers. null declines all. */
  choose(offers: readonly Offer[], ctx: PolicyContext): Offer | null;
  /** Q4.3.1 loop acts for this season. */
  tank?(ctx: PolicyContext): boolean;
  raid?(ctx: PolicyContext): boolean;
  flip?(ctx: PolicyContext): boolean;
  heldWeeks?(ctx: PolicyContext): readonly number[];
  /** S7.3.1: a year out spent visiting staffs or in public work keeps standing with coaches; rest loses it. */
  yearOut?(ctx: PolicyContext): 'visit_staffs' | 'rest';
}

export interface CareerScript {
  readonly id: string;
  readonly policy: CareerPolicy;
  readonly start: { readonly rung: number; readonly level: Level; readonly age: number };
  readonly seasons: number;
  /** N4: nothing is simulated inside a certified span; the pace is fixed to full. */
  readonly certified?: boolean;
  /** Stop early once this holds after a season (for example: one season as pro head coach). */
  readonly stopWhen?: (s: CareerState) => boolean;
}

export interface SeasonRow {
  readonly season: number;
  readonly age: number;
  readonly employed: boolean;
  readonly rung: number;
  readonly level: Level | null;
  readonly prestige: number;
  readonly work: number;
  readonly simulatedShare: number;
  readonly results: number;
  readonly fired: boolean;
  readonly released: boolean;
  readonly offers: number;
  readonly moved: string | null;
  readonly loopActs: readonly string[];
}

/** One record event (X2 shape): every simulated one carries the flag (S10.1.1 rule 4). */
export interface RunEvent {
  readonly season: number;
  readonly type: string;
  readonly simulated: boolean;
  readonly data: Readonly<Record<string, number | string | boolean>>;
}

export interface CareerRun {
  readonly scriptId: string;
  readonly seedHex: string;
  readonly rows: readonly SeasonRow[];
  readonly events: readonly RunEvent[];
  readonly final: CareerState;
  /** Q4.3.1 yield: job value (E2.2.2) summed over seasons employed. */
  readonly yield: number;
  /** Hash of rows and events: two runs of one script and seed must match (G-89 acceptance). */
  readonly hash: string;
}
