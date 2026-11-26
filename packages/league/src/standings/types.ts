// Shapes the standings and postseason modules read and write (C3.1.1, C3.1.2, T3.3.1). These are derived
// values computed from game records (P3.1.1: standings are a cache, never a source), so they are plain
// TypeScript types, not persisted zod shapes. The adapter from the world contract's GameRecord is
// `resultFromGameRecord` in records.ts.

export type TeamId = number;

/** One finished game as the standings need it (C3.1.1 `GameResult`). Index 0 is the home team (or first listed at a neutral site). */
export interface GameResult {
  readonly gameId: number;
  /** Week index in the season; orders games for streak and last-five columns. */
  readonly week: number;
  readonly phase: 'preseason' | 'regular' | 'postseason';
  readonly teams: readonly [TeamId, TeamId];
  readonly points: readonly [number, number];
  /** Touchdowns of every kind by each team (C3.1.1), for the net-touchdowns step. */
  readonly touchdowns: readonly [number, number];
  readonly overtime: boolean;
  /** Forfeit: recorded 2-0 with the points left out of every points-based step (Rule 11-1-1). */
  readonly forfeit: boolean;
  readonly neutralSite: boolean;
  /**
   * True for an outcome the clinching search made up (C3.3.2). Its points and touchdowns are
   * placeholders, so any points-based step or coin toss that a hypothetical game feeds makes the
   * answer "not yet certain".
   */
  readonly hypothetical?: boolean;
}

/** Where a club sits in the league (C1): its conference and division. */
export interface ClubPlace {
  readonly id: TeamId;
  readonly conferenceId: number;
  readonly divisionId: number;
}

/** Won, lost, tied. */
export interface WLT { readonly w: number; readonly l: number; readonly t: number }

export interface Streak { readonly kind: 'W' | 'L' | 'T' | null; readonly length: number }

/** One standings row (C3.1.2). Recomputed after every game. */
export interface StandingsRow {
  readonly teamId: TeamId;
  readonly record: WLT;
  readonly pct: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly netPoints: number;
  readonly home: WLT;
  readonly road: WLT;
  readonly division: WLT;
  readonly conference: WLT;
  readonly streak: Streak;
  readonly lastFive: WLT;
  /** Combined percentage of beaten opponents, counted once per win; 0 for a club with no wins (C3.1.2 edge case). */
  readonly strengthOfVictory: number;
  /** Combined percentage of opponents, counted once per game. */
  readonly strengthOfSchedule: number;
}

/**
 * The seeded draw that ends every tiebreak list (C3.2.1 step 12, T3.3.1 random draw). The league
 * package may not import engine-core (P1.2.1), so the caller passes a draw backed by a J13 stream.
 * It returns the given ids in a random order; the first is the winner. `label` names the decision for
 * the stream's log.
 */
export interface TieDraw {
  draw(ids: readonly TeamId[], label: string): TeamId[];
}

/** Rule values as read from the league-rules file, by key. */
export type RuleValues = Readonly<Record<string, number | string | boolean>>;
