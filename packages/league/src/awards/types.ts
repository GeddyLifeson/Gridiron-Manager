// Inputs and outputs of the awards module (G-43). Inputs are public facts only: box-score lines as the
// public sees them (D14), results, logged events (X2). No true rating of a person is ever read (C9.3.1
// rule 5, X4.1.1 rule 5).
import type { PersonOrigin, WorldEvent } from '@gm/schema';

export type PersonId = number;
export type TeamId = number;

/** Uniform draws in [0, 1). The caller binds it to a keyed J13 stream (contract request CR-G43-1). */
export interface Uniform { next(): number }

/** One player's public line for one game (D14). `totals` are keyed by the D14 statistic id. */
export interface GameLine {
  readonly gameId: number;
  readonly season: number;
  /** Week or game index inside the season, for weekly honours. */
  readonly week: number;
  readonly competitionId: number;
  /** Conference or other honour group the player's team sits in. */
  readonly groupId: number;
  readonly teamId: TeamId;
  readonly personId: PersonId;
  readonly position: string;
  readonly postseason: boolean;
  readonly won: boolean;
  /** X4 notability of the game event, if scored. */
  readonly gameNotability: number | null;
  readonly totals: Readonly<Record<string, number>>;
}

/** How one statistic combines across games (the D14 catalogue's `aggregate`). */
export type Aggregate = 'sum' | 'max';

/** A person's origin as the X14 protection rule sees it. `imported` is protected (X4.4.1). */
export type Origin = PersonOrigin;

export type Band = 'routine' | 'noted' | 'notable' | 'historic';

/** Rows read from the log. Kept as WorldEvent so every result can be traced to row ids (X2.3). */
export type LogRows = readonly WorldEvent[];
