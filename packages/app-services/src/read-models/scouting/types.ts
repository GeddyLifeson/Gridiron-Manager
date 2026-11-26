// The scouting read models (item 3b): the tendency table for self-scout and the opponent report
// (O3.6.1, G8, H2.2, N2.3.1) and the personnel report (H2.3.1, D6). Plain data only. The tendency view has
// the shape of app-ui's `ScoutingView` (screens/scouting/model.ts) plus cut-up refs, so the route source
// passes it straight through. Grades are the club's estimates in the display scale; true attributes never
// appear (D6.1.1, MA-48).

export type BandLabel = 'strong' | 'watch' | 'lean';
export type ScoutingSubject = 'self' | 'opponent';

export interface OutcomeView {
  readonly outcome: string;
  readonly count: number;
  readonly rate: number | null;
  readonly low: number | null;
  readonly high: number | null;
  readonly leagueRate: number | null;
}

export interface CellView {
  readonly key: string;
  readonly cuts: Readonly<Record<string, string>>;
  readonly calls: number;
  readonly nEff: number;
  readonly thin: boolean;
  readonly countsOnly: boolean;
  readonly outcomes: readonly OutcomeView[];
  readonly band: BandLabel | null;
  readonly bandOutcome: string | null;
  /** The plays behind the cell, so a click opens them as a cut-up (O3.6.1, N1). */
  readonly refs: readonly string[];
}

export interface ExposureView { readonly key: string; readonly label: string; readonly band: BandLabel; readonly calls: number; readonly shareInWindow: number; readonly top: boolean }
export interface TellView { readonly feature: string; readonly value: string; readonly givesAway: string; readonly count: number; readonly snaps: number; readonly kept: boolean }

export interface ScoutingView {
  readonly subject: ScoutingSubject;
  /** The team whose tendencies these are. */
  readonly teamId: number;
  readonly teamName: string;
  readonly windowLabel: string;
  readonly windowGames: number;
  readonly measure: string;
  readonly cuts: readonly string[];
  readonly cells: readonly CellView[];
  /** Self-scout only: what the next opponent probably knows (G8.1.2). */
  readonly exposure: readonly ExposureView[];
  readonly tells: readonly TellView[];
  /** G8.2.1 index in nats per call (lower is better) with the plain-words line. */
  readonly predictability: { readonly index: number; readonly calls: number; readonly words: string | null } | null;
  /** H2.1.2: who charted the film and how the tags held up, in words. Null for self-scout. */
  readonly taggerLine: string | null;
  /** H2.5.1 edge case: breakdown jobs are late, so the tables rest on part of the film. */
  readonly partial: boolean;
}

/** A grade as the club's staff assigned it (G-19 `gradeCells`): display text and band, never a true value. */
export type PersonnelGrade =
  | {
    readonly state: 'graded'; readonly attribute: string; readonly label: string; readonly confidence: string;
    readonly bandText: string; readonly n: number;
  }
  | { readonly state: 'unwatched'; readonly attribute: string };

/** A group grade (D6.2.2 reading aid): equal-weight mean of the graded attributes of one group. */
export interface GroupGrade { readonly group: string; readonly label: string; readonly bandText: string; readonly confidence: string; readonly attributes: number }

export interface PersonnelUsage { readonly snaps: number; readonly alignments: Readonly<Record<string, number>> }

export interface PersonnelCard {
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  readonly side: 'offense' | 'defense' | 'special_teams';
  /** Listed first at some role of an offense or defense unit (expected starter, H2.3.2). */
  readonly starter: boolean;
  /** Roles the depth chart lists him at, as `unit/role`. */
  readonly roles: readonly string[];
  /** Grade over his position's primary groups; null when nothing is graded. */
  readonly overall: GroupGrade | null;
  readonly groups: readonly GroupGrade[];
  readonly grades: readonly PersonnelGrade[];
  /** Highest and lowest graded attributes of his primary groups, by the staff's estimate (H2.3.1 words). */
  readonly strengths: readonly string[];
  readonly weaknesses: readonly string[];
  readonly usage: PersonnelUsage | null;
  /** No grade from the club's own looks yet: only league-wide or public information (H2.3.1 edge case). */
  readonly unscouted: boolean;
}

export interface DepthUnitView {
  readonly unitId: string;
  readonly side: 'offense' | 'defense' | 'special_teams';
  readonly roles: readonly { readonly role: string; readonly personIds: readonly number[] }[];
}

export interface PersonnelSummary {
  /** Highest overall estimate among expected starters on each side. */
  readonly bestOffense: number | null;
  readonly bestDefense: number | null;
  /** H2.3.1 weak links: lowest group estimate among expected starters in the contest. It can be wrong. */
  readonly weakestPassProtector: number | null;
  readonly weakestCoverageDefender: number | null;
}

export interface PersonnelReportView {
  readonly subject: ScoutingSubject;
  readonly teamId: number;
  readonly teamName: string;
  readonly scaleId: string;
  readonly depth: readonly DepthUnitView[];
  readonly cards: readonly PersonnelCard[];
  readonly summary: PersonnelSummary;
}
