// The charted play: one row of the shared tendency store (N2.3.1 rule 1). For the user's own team it
// holds the true call fields; for an opponent it holds what a charter saw, with charting error (H2.1.2).

export type ChartSide = 'offense' | 'defense';
export type Hash = 'left' | 'middle' | 'right';
export type Shell = 'zero_high' | 'one_high' | 'two_high';
export type ManZone = 'man' | 'zone';
/** G8.1.1 "after events": the play before this one, for the same team. */
export type AfterEvent = 'none' | 'sack' | 'turnover' | 'timeout' | 'penalty_first_down' | 'first_play';

/** Source of the call fields: the team's own record, or a charter's tags of film. */
export type ChartSource = 'own' | 'charted';

export interface ChartedPlay {
  /** Stable reference to the play (gameId and index), so any cell can open its plays (G8.1.1, N1.2.2). */
  readonly ref: string;
  readonly gameId: number;
  /** Order of the game in the charted team's schedule, increasing; windows count games by this. */
  readonly gameOrder: number;
  /** Season number of the game, for last-season weights (H2.1.1 rule 4). */
  readonly season: number;
  readonly index: number;
  /** Team whose tendencies the row describes and the side it was on. */
  readonly teamId: number;
  readonly opponentId: number;
  readonly side: ChartSide;
  /** Person who made the call (coordinator, head coach or delegate); null when unknown. */
  readonly callerId: number | null;
  readonly source: ChartSource;

  // Situation (always observable).
  readonly down: number;
  readonly distanceYd: number;
  readonly yardsToGoalYd: number;
  readonly hash: Hash;
  readonly quarter: number;
  readonly clockTenths: number;
  /** Charted team's score minus the other team's. */
  readonly scoreDiff: number;
  readonly afterEvent: AfterEvent;

  // Offensive look (observable). For a defensive row these are the offense it faced.
  readonly personnel: string;
  readonly formation: string | null;
  readonly strength: string | null;
  readonly motion: string | null;
  readonly shotgun: boolean;
  readonly tempo: 'huddle' | 'no_huddle' | 'hurry_up';

  // Offensive call.
  /** G1.1.1 kind (run, dropback_pass, quick_pass, play_action, movement_pass, screen, rpo, draw, qb_run, trick, kneel, spike). */
  readonly playKind: string | null;
  readonly runDirection: 'left' | 'middle' | 'right' | null;
  /** Inferred tag for opponents (H2.1.2 rule 5); the play's concept for the own team. */
  readonly concept: string | null;
  /** Inferred tag for opponents (H2.1.2 rule 5). */
  readonly protection: string | null;

  // Defensive call.
  readonly front: string | null;
  readonly rushers: number | null;
  readonly boxCount: number | null;
  /** Coverage after the snap: inferred tag for opponents. */
  readonly coverageFamily: string | null;
  /** Pressure design: inferred tag for opponents. */
  readonly pressureDesign: string | null;

  // Result (observable).
  readonly yards: number;
  readonly success: boolean | null;
  /** Kneel-down or spike: excluded from tendencies (H2.1.2 edge case, G8.2.1). */
  readonly forced: boolean;
  /** Cancelled by a pre-snap foul: tagged for formation and personnel only (H2.1.2 edge case). */
  readonly lookOnly: boolean;
  /** Weight a window gave the row; 1 unless a window set it (H2.1.1 rule 4). */
  readonly weight?: number;
}
