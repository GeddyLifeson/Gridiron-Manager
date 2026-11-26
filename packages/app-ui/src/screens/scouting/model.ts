// What the scouting screens show (O3.6.1, G8, H2). Plain data shaped like the models.tendencies output,
// already filtered for the viewer: own-team rows carry true calls, opponent rows charted tags only.
// The read model that fills it is owed once `models.tendencies` is in the @gm/models barrel (CR-G66-1).

export type BandLabel = 'strong' | 'watch' | 'lean';

export interface OutcomeView { outcome: string; count: number; rate: number | null; low: number | null; high: number | null; leagueRate: number | null }

export interface CellView {
  key: string;
  cuts: Record<string, string>;
  calls: number;
  nEff: number;
  thin: boolean;
  countsOnly: boolean;
  outcomes: OutcomeView[];
  band: BandLabel | null;
  bandOutcome: string | null;
}

export interface ExposureView { key: string; label: string; band: BandLabel; calls: number; shareInWindow: number; top: boolean }
export interface TellView { feature: string; value: string; givesAway: string; count: number; snaps: number; kept: boolean }

export interface ScoutingView {
  /** Whose tendencies: the user's own team (self-scout) or the next opponent (scouting report). */
  subject: 'self' | 'opponent';
  teamName: string;
  /** Window in words with its game count, so every highlighted cell names its window (G8.1.1). */
  windowLabel: string;
  windowGames: number;
  measure: string;
  cuts: string[];
  cells: CellView[];
  /** Self-scout only (G8.1.2). */
  exposure: ExposureView[];
  tells: TellView[];
  /** G8.2.1: index in nats per call, lower is better, with the plain-words accuracy line. */
  predictability: { index: number; calls: number; words: string | null } | null;
  /** H2.2.1 rule 6: who tagged the film and how his tags held up, in words. */
  taggerLine: string | null;
}
