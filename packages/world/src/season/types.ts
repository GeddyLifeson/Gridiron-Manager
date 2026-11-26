// Season runner types (G-87; R1.2.7 gate item 1, C2 to C4, T3). The runner owns the order of a season:
// week by week, every team prepares, the games of the week are played, the standings move, and the
// postseason follows from the league-rules file. It owns no football number: every count comes from the
// rule values, and every game from the game port.
import type { standings } from '@gm/league';

export type TeamId = standings.TeamId;
export type RuleValues = standings.RuleValues;
export type GameResult = standings.GameResult;

/** One team of the competition. `key` is the world-data id the schedule generators use. */
export interface SeasonTeam {
  readonly id: TeamId;
  readonly key: string;
  readonly conferenceId: number;
  readonly divisionId: number;
}

/** One scheduled game. Index 0 of every pair downstream is the home team (first listed at a neutral site). */
export interface Fixture {
  readonly gameId: number;
  /** League week as the schedule numbers it (the college schedule opens with a week 0). Postseason rounds continue the count. */
  readonly week: number;
  readonly phase: 'regular' | 'postseason';
  readonly home: TeamId;
  readonly away: TeamId;
  readonly neutralSite: boolean;
  readonly conferenceGame: boolean;
  /** Absolute world day of kickoff when the schedule carries one. */
  readonly dayIndex: number | null;
  /** Kickoff in minutes after midnight, eastern time, when the schedule sets one (C2.3.1). */
  readonly kickoffMinute: number | null;
  /** Postseason only: the plan's key for the game (bracket slot, title game, bowl). */
  readonly postKey: string | null;
}

/** One counted statistic of one player in one game (D14), as the statistics module credits it. */
export interface StatLine {
  readonly playerId: number;
  readonly teamId: TeamId;
  readonly statId: string;
  readonly value: number;
}

/** What the game port returns. Sides follow the fixture: 0 home, 1 away. */
export interface GameOutcome {
  readonly points: readonly [number, number];
  readonly touchdowns: readonly [number, number];
  readonly overtime: boolean;
  /** Final state hash of the game (J13.5.1); it feeds the season hash. */
  readonly stateHash: string;
  readonly plays: number;
  readonly lines: readonly StatLine[];
}

export interface GameContext {
  readonly season: number;
  readonly ruleSetId: string;
  readonly fixture: Fixture;
  /** 16 hex digits, derived from the season seed and the game id only (J13.2.1): never from play order. */
  readonly seedHex: string;
  /** What each side's preparation produced this week (home, away); null when the port gave nothing. */
  readonly preparation: readonly [unknown, unknown];
  /** Side the head coach seat is on, or null in an all-AI game. */
  readonly seatSide: 0 | 1 | null;
}

export interface PrepContext {
  readonly season: number;
  readonly week: number;
  readonly teamId: TeamId;
  /** The team's game this week, or null in a bye week. */
  readonly fixture: Fixture | null;
  /** Results of every game played before this week. Nothing of the current week is in it (K3.6.1 rule 2). */
  readonly results: readonly GameResult[];
  /** Seed of the season, for streams scoped [season, week, team] (K3.6.1 rule 5). */
  readonly seedHex: string;
}

/** What a week at the head coach seat left behind (H1.1.3). */
export interface SeatWeekRecord {
  readonly teamId: TeamId;
  readonly week: number;
  readonly bye: boolean;
  readonly blocksRun: number;
  readonly blocksDelegated: number;
  /** Every pending item the clock passed: the user's choice or the staff default. */
  readonly decisions: readonly { readonly id: string; readonly value: string; readonly chosen: boolean }[];
  readonly reachedGameDay: boolean;
  /** Handed to the game port as the seat side's preparation. */
  readonly preparation: unknown;
}

export interface SeasonPorts {
  /** Plays one game to its end. Pure in its context: the same context gives the same outcome. */
  playGame(ctx: GameContext): GameOutcome;
  /** AI preparation (K3) for one team's week. Optional: a harness with no coach AI leaves it out. */
  prepare?(ctx: PrepContext): unknown;
  /** The head coach seat (H1). Called for the seat team instead of `prepare`, bye weeks included. */
  seatWeek?(ctx: PrepContext): SeatWeekRecord;
}

/** Uniform draws in [0, 1) from a J13 stream (the committee and poll noise of T3.4.1). */
export interface Uniform { next(): number }

export interface PostContext {
  readonly season: number;
  readonly teams: readonly SeasonTeam[];
  /** Every result so far: the regular season, then postseason games in the order they were recorded. */
  readonly results: readonly GameResult[];
  readonly rules: RuleValues;
  readonly draw: standings.TieDraw;
  uniform(label: string): Uniform;
}

/** A postseason game the plan wants played. */
export interface PostFixture {
  readonly key: string;
  /** Higher seed (or first listed) first. */
  readonly teams: readonly [TeamId, TeamId];
  /** Hosting team, or null at a neutral site. */
  readonly host: TeamId | null;
  readonly stage: string;
}

/**
 * How a competition ends. The runner asks for the pending games, plays them, records each winner and
 * asks again until nothing is pending. A plan's state must be plain data, so a season can be saved
 * between rounds.
 */
export interface PostseasonPlan<S = unknown> {
  readonly id: string;
  /** League-rule keys the plan reads; the runner refuses to start a season that lacks one. */
  readonly ruleKeys: readonly string[];
  open(ctx: PostContext): S;
  pending(state: S): readonly PostFixture[];
  record(state: S, key: string, winner: TeamId, ctx: PostContext): S;
  /** The champion once the last game is recorded, else null. */
  champion(state: S): TeamId | null;
}

export interface SeasonSpec {
  readonly season: number;
  /** 16 hex digits. */
  readonly seedHex: string;
  readonly ruleSetId: string;
  readonly teams: readonly SeasonTeam[];
  /** Regular-season fixtures. */
  readonly fixtures: readonly Fixture[];
  /** Values of the league-rules file (C, T), by key. */
  readonly leagueRules: RuleValues;
  readonly postseason: PostseasonPlan;
  /** Team the user coaches, or null for an all-AI season. */
  readonly seatTeamId: TeamId | null;
}

export interface PlayedGame {
  readonly fixture: Fixture;
  readonly seedHex: string;
  readonly outcome: GameOutcome;
}

export type SeasonStage = 'regular' | 'postseason' | 'final';

/** Plain data: a season can be saved after any step and continued (P5). */
export interface SeasonState {
  readonly stage: SeasonStage;
  /** Next regular week to play. */
  readonly week: number;
  readonly lastRegularWeek: number;
  /** Postseason rounds played. */
  readonly round: number;
  readonly games: readonly PlayedGame[];
  readonly results: readonly GameResult[];
  readonly post: unknown;
  readonly champion: TeamId | null;
  readonly seat: readonly SeatWeekRecord[];
  /** Team-weeks of AI preparation run. */
  readonly preparations: number;
  /** Hash chain over the games in game-id order inside each step (Q1.3.1 season replay). */
  readonly chain: string;
}

export class SeasonInvariantError extends Error {}
