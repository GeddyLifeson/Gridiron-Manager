// The live world the loop advances, and the ports its steps are bound through (X12.1.1). The loop owns
// order, dates, streams, the event log and the pass hash. What each step does belongs to the system that
// owns it (league, people, career, coach-ai, front-office) and is bound by the composition root.
import type { WorldSeed } from '@gm/engine-core';
import type { history } from '@gm/league';
import type {
  CompetitionRecord, ConferenceRecord, CultureRecord, JobRecord, PersonRecord, RandomStream, TeamRecord, VenueRecord, WorldDate, WorldEvent, WorldTier,
} from '@gm/schema';
import type { OffLadderSeat } from '../generation/founding.ts';
import type { SetupRecord } from '../generation/setup.ts';
import type { PlaceRecord } from '../generation/structures.ts';
import type { TeamSpan } from './lifecycle.ts';

/** X12.1.1 weekly order, with `compliance` after `moves` (CO-01, bible amendment requested). Fixed: the order is part of state (the pass hash folds each step id in turn). */
export const WEEKLY_ORDER = ['lifecycle', 'games', 'health', 'statistics', 'notability', 'memory', 'edges', 'needs', 'moves', 'compliance', 'labels', 'news'] as const;
export type WeeklyStep = (typeof WEEKLY_ORDER)[number];
/** Season-point passes (X12.1.1). X12.1.3's exits run first, because exits come before cohorts on one date (X11.1.1). */
export const SEASON_POINT_ORDER = ['leaving', 'hall', 'cohorts', 'development', 'culture', 'compaction'] as const;
export type SeasonStep = (typeof SEASON_POINT_ORDER)[number];
export type StepId = WeeklyStep | SeasonStep;

export const STEP_OWNER: Readonly<Record<StepId, string>> = {
  lifecycle: 'Teams founded and folded in the past (Marlon 2026-11-26; loop/lifecycle.ts)',
  games: 'X13.1.2 games by tier (engine-game through the game port)', health: 'D11 injuries and health', statistics: 'X3.4.1 statistics and records',
  notability: 'X4 notability', memory: 'X6 memory', edges: 'X7 edges', needs: 'X5 needs and stress', moves: 'K7 job and roster moves',
  compliance: 'L8.2.5 detection, false accusations and due cases (league.compliance.complianceWeek; world/compliance). After moves so a week\'s acts can be found that week; before labels and news so its public events are labelled and routed',
  labels: 'X2.2.2 labels touched by new events', news: 'X12.2.1 news routing', cohorts: 'X11 cohorts', development: 'D7, D8 development and aging',
  culture: 'X9 culture',
  hall: 'E5.6.3 Hall of Fame ballots (career.reputation runBallot for coaches; player case owed)', leaving: 'X12.1.3 inactive and deceased', compaction: 'X2.4.1 compaction',
};

export type PersonStatus = 'active' | 'inactive' | 'deceased';
export type Scalar = string | number | boolean | null;

/** One finished game as the world keeps it at any tier (X13.1.1: box score and season lines kept). */
export interface GameResult {
  readonly gameId: number;
  readonly competitionId: number;
  readonly seasonYear: number;
  readonly week: number;
  readonly homeTeamId: number;
  readonly awayTeamId: number;
  readonly homePoints: number;
  readonly awayPoints: number;
  /** Play counts, for the J15 league bands the history validator reads. */
  readonly passPlays: number;
  readonly runPlays: number;
  readonly kind: 'regular' | 'postseason';
  /** True for the game that decides a competition's title. */
  readonly title: boolean;
}

/** One team's staff in one season, kept for coaching trees and tenures (X3, X10.3.2). */
export interface StaffSeason { readonly seasonYear: number; readonly teamId: number; readonly headCoachId: number | null; readonly staffIds: readonly number[] }

export interface SeasonSummary {
  readonly seasonYear: number;
  /** Competition id to champion team id. */
  readonly champions: Record<number, number>;
  readonly games: number;
  readonly points: number;
  readonly passPlays: number;
  readonly runPlays: number;
  /** Named population pools and their sizes at the season point (X11.2.3). */
  readonly pools: Record<string, number>;
  readonly people: { readonly active: number; readonly inactive: number; readonly deceased: number };
  /** Regular-season record per team id (C3), read by the next offseason's selection order (C7.2.1). */
  readonly records: Record<number, TeamRecordLine>;
}

/** Wins, losses and ties in one season's regular games. */
export interface TeamRecordLine { readonly wins: number; readonly losses: number; readonly ties: number }

export interface LiveWorld {
  readonly setup: SetupRecord;
  /** The seed the world was built from: the setup seed, or the derived seed of a redo (X10.3.2). */
  readonly seed: WorldSeed;
  /** Seed plus this many (0, or 1 after one failed validation); recorded beside the world code. */
  readonly seedStep: number;
  date: WorldDate;
  /** Weekly passes run in the current season. */
  week: number;
  /** Days gone by since the last pass day (X12.3.1: the user may move a day at a time; passes stay weekly). */
  dayInWeek: number;
  readonly competitions: CompetitionRecord[];
  readonly conferences: ConferenceRecord[];
  readonly places: PlaceRecord[];
  readonly venues: VenueRecord[];
  readonly teams: TeamRecord[];
  /** When each team was founded and, if gone, folded. A team with no span exists in every season. */
  readonly teamSpans: Map<number, TeamSpan>;
  readonly placeOfTeam: Map<number, number>;
  readonly people: Map<number, PersonRecord>;
  readonly status: Map<number, PersonStatus>;
  /** Person id to the season he retired or left football (X12.1.2 outputs, read by X12.1.3). */
  readonly outOfFootballSince: Map<number, number>;
  readonly jobs: Map<number, JobRecord>;
  /** Seat id to a seat with no ladder rung (general manager, owner seat, strength staff), whose holders act but have no job row (CR-G25-1). */
  readonly offLadder: Map<number, OffLadderSeat>;
  /** Team id to player ids. */
  readonly rosters: Map<number, number[]>;
  readonly cultures: Map<number, CultureRecord>;
  readonly staffContractEndYear: Map<number, number>;
  /** Fidelity tier of each team (X13.1.1, set by G-82). Absent means tier 3. */
  readonly tiers: Map<number, WorldTier>;
  /** Tier changes waiting for the next pass (X12.1.1 edge case: never inside a pass). */
  readonly pendingTiers: Map<number, WorldTier>;
  /** Named pools of unattached people (free agents, the coach pool, recruits, prospects). */
  readonly pools: Map<string, number[]>;
  /**
   * State a bound system keeps between passes, by system key (for example `compliance`, the L8.2.5 log,
   * cases and league record). Plain data only: it is folded into `worldHash`, so a replay that differs here differs.
   */
  readonly systemState: Map<string, unknown>;
  /** Replaced only by compaction (X2.4.1), which rebuilds it with `logOptions`. */
  log: history.EventLog;
  readonly logOptions: history.EventLogOptions;
  readonly nextIds: Record<string, number>;
  /** Games of the current season, in the order played. Folded into `seasons` at the season point. */
  results: GameResult[];
  readonly seasons: SeasonSummary[];
  readonly staffSeasons: StaffSeason[];
  /** `season:teamId` to the players on that roster at the season point, for teammates of the past (X10.4.2). */
  readonly rosterSeasons: Map<string, readonly number[]>;
  /** Chained hash over every step of every pass (X12.1.1 acceptance). */
  passHash: string;
  passes: number;
  userPersonId: number | null;
}

export interface StepContext {
  readonly world: LiveWorld;
  readonly step: StepId;
  readonly source: 'sim' | 'history_run';
  /** Tier of a team as it stood when this pass began. */
  tierOfTeam(teamId: number): WorldTier;
  /** A keyed stream from the world seed. The loop adds the step, season and week to the scope. */
  open(name: string, scope?: readonly (string | number)[]): RandomStream;
  /** Append to the history log. A refusal throws: a step that emits a bad row is a bug, never a skipped event. */
  emit(input: Omit<history.EmitInput, 'source'>): WorldEvent;
  /** X12.1.2: record that a person retired or left football this season. */
  markOutOfFootball(personId: number): void;
}

/** What a step reports into the pass hash: small, scalar, and enough to tell two runs apart. */
export type StepDigest = Readonly<Record<string, Scalar>>;
export type StepHandler = (ctx: StepContext) => StepDigest | void;

/** Every step has exactly one handler. `unbound` marks a step whose owning system is not wired yet. */
export type WorldSystems = Readonly<Record<StepId, StepHandler>>;

/** The schedule as the games step reads it (G-13 binds it). */
export interface SchedulePort {
  /** Weekly passes in a season, postseason weeks included. */
  weeksInSeason(world: LiveWorld): number;
  gamesOn(world: LiveWorld, week: number): readonly ScheduledGame[];
}
export interface ScheduledGame {
  readonly gameId: number; readonly competitionId: number; readonly homeTeamId: number; readonly awayTeamId: number;
  readonly kind: 'regular' | 'postseason'; readonly title: boolean;
}

/**
 * One game, played by the real engine (A3.1.1 row 20, X13.3.2: the full engine at every tier, only faster).
 * The request has no method field on purpose: there is no lighter way to produce a result. `tier` chooses
 * what is kept (X13.1.1), never how the game is played.
 */
export interface GameRequest {
  readonly game: ScheduledGame;
  readonly seasonYear: number;
  readonly week: number;
  /** Game seed derived from the world seed, season and game id (J13.4.1). */
  readonly seedHex: string;
  readonly ruleSetId: string;
  readonly tier: WorldTier;
  readonly world: LiveWorld;
}
export interface GamePlayed { readonly homePoints: number; readonly awayPoints: number; readonly passPlays: number; readonly runPlays: number }
export type GamePort = (req: GameRequest) => GamePlayed;
/**
 * A week's games at once (G-97). One result per request, in request order. The port may play them in any
 * order and on any number of threads; a result may depend on its own request and on nothing else. A port
 * must not change the world: the games step stores the rows.
 */
export type GameBatchPort = (reqs: readonly GameRequest[]) => readonly GamePlayed[];
