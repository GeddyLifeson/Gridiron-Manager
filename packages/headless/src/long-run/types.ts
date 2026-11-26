// What the long run reads from a world, and the port it drives the world through (G-88).
// The harness does not import the world package: `WorldView` is the read-only shape of the G-81 live
// world that the checks need, so `LiveWorld` satisfies it as it stands, and any later world does too.
// `LongRunTarget` is how the composition root hands the harness a world to advance (see `loopTarget`).
import type { CompetitionRecord, EventTypeDef, JobRecord, PersonOrigin, PersonRole, WorldDate, WorldEvent } from '@gm/schema';

/** The parts of a person the checks read. `PersonRecord` satisfies it. */
export interface PersonView {
  readonly id: number;
  readonly origin: PersonOrigin;
  readonly name: { readonly first: string; readonly last: string };
  readonly birthDate: WorldDate;
  readonly diedYear: number | null;
  readonly roles: readonly PersonRole[];
  readonly playing?: { readonly position: string; readonly attributes: Readonly<Record<string, number>> };
  readonly life?: { readonly householdId: number | null };
}

export interface GameView {
  readonly gameId: number; readonly competitionId: number; readonly seasonYear: number; readonly week: number;
  readonly homeTeamId: number; readonly awayTeamId: number; readonly homePoints: number; readonly awayPoints: number;
  readonly passPlays: number; readonly runPlays: number; readonly kind: 'regular' | 'postseason'; readonly title: boolean;
}

export interface SeasonView {
  readonly seasonYear: number; readonly games: number; readonly points: number; readonly passPlays: number; readonly runPlays: number;
  readonly pools: Readonly<Record<string, number>>;
  readonly people: { readonly active: number; readonly inactive: number; readonly deceased: number };
}

/** The live world as the checks see it. `LiveWorld` (G-81) satisfies it. */
export interface WorldView {
  readonly date: WorldDate;
  readonly week: number;
  readonly passes: number;
  readonly competitions: readonly Pick<CompetitionRecord, 'id' | 'level' | 'ruleSetId' | 'teamIds'>[];
  readonly teams: readonly { readonly id: number }[];
  readonly people: ReadonlyMap<number, PersonView>;
  readonly status: ReadonlyMap<number, 'active' | 'inactive' | 'deceased'>;
  readonly outOfFootballSince: ReadonlyMap<number, number>;
  readonly jobs: ReadonlyMap<number, Pick<JobRecord, 'id' | 'teamId' | 'positionId' | 'holderPersonId'>>;
  readonly rosters: ReadonlyMap<number, readonly number[]>;
  readonly pools: ReadonlyMap<string, readonly number[]>;
  readonly results: readonly GameView[];
  readonly seasons: readonly SeasonView[];
  readonly userPersonId: number | null;
  readonly log: { rows(): readonly WorldEvent[] };
}

/** Where a step boundary falls: after weekly pass `week` of a season, or after its season point. */
export type Boundary = { readonly kind: 'week'; readonly season: number; readonly week: number } | { readonly kind: 'season_point'; readonly season: number };

/**
 * One world the harness can advance. The composition root builds it from the G-81 loop (`loopTarget`)
 * with the real systems bound; tests build it from a test double.
 */
export interface LongRunTarget {
  /** The live world, read between passes only. */
  view(): WorldView;
  /** Weekly passes in the current season, postseason included. */
  weeksInSeason(): number;
  runWeek(): void;
  runSeasonPoint(): void;
  /** A cheap state hash, named in an invariant failure as "the state hash before" (Q1.2.2). */
  hash(): string;
  /** Event type definitions by id, for the protection scan (A6.3.1). Unknown means protected. */
  eventType(id: string): Pick<EventTypeDef, 'importedAllowed' | 'harmClass'> | undefined;
  /** Steps with no owning system bound yet (G-81 `unboundSteps`). Reported, never hidden. */
  unbound(): readonly { step: string; reason: string }[];
}

/** Bytes the save would hold for this world now (G-83 binds the real save; see `canonicalBytes`). */
export type SizePort = (world: WorldView) => number;

/** Generated text the world produced this season (news, inbox, quotes), for the Q1.6.2 text scan. */
export type TextPort = (world: WorldView) => readonly string[];

/** Optional limits the Q1.2.2 roster check reads (C5, by rule key in the composition root). */
export interface RosterLimits {
  /** Largest roster allowed for a team at this boundary, or undefined when no limit applies now. */
  maxFor(teamId: number, at: Boundary): number | undefined;
}

export interface InvariantFailure {
  readonly invariant: string;
  readonly at: Boundary;
  /** The command that ran into the failing state: the pass that ended at this boundary. */
  readonly command: string;
  readonly hashBefore: string;
  readonly detail: string;
}
