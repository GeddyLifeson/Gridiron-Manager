// The depth chart view (team.depth_chart, O4.2.2, M2): every unit and package with its job lists, who is
// on the field now, the staff's planned shares, special teams load, the emergency card, position battles,
// and the depth map the played game reads (SimTeam.depth). Plain JSON.

export interface ListEntry {
  readonly personId: number;
  readonly name: string;
  readonly position: string;
  readonly out: boolean;
  readonly active: boolean;
}

export interface JobRow {
  readonly job: string;
  readonly group: string;
  /** Package job: the base job it replaces (M2.2.1 rule 2). */
  readonly mapsTo: string | null;
  /** The list comes from the base unit because this package names nobody here (M2.2.1). */
  readonly inherited: boolean;
  readonly list: readonly ListEntry[];
  /** The player on the field for this job now, or null when no listed player is available (a gap). */
  readonly onField: number | null;
}

export interface UnitRow {
  readonly unitId: string;
  readonly side: 'off' | 'def' | 'st';
  readonly base: string | null;
  readonly core: boolean;
  readonly jobs: readonly JobRow[];
  readonly gaps: readonly string[];
  /** Staff default share of the unit's snaps per player (M2.3.1 rule 1), largest first. */
  readonly shares: readonly { readonly personId: number; readonly share: number }[];
}

export interface ProblemRow { readonly leaf: string; readonly unitId: string; readonly message: string }

export interface EmergencyRow { readonly need: string; readonly personId: number | null; readonly name: string | null }

export interface SpecialTeamsRow { readonly personId: number; readonly name: string; readonly firsts: number }

export interface BattleRow {
  readonly unitId: string;
  readonly job: string;
  readonly decideBy: number;
  readonly late: boolean;
  readonly readinessPenalty: boolean;
  readonly competitors: readonly {
    readonly personId: number; readonly name: string; readonly split: number; readonly reps: number;
    readonly raw: number | null; readonly weighted: number | null;
  }[];
}

export interface DepthChartView {
  readonly clubId: number;
  readonly week: number;
  readonly locked: boolean;
  readonly onField: number;
  readonly units: readonly UnitRow[];
  readonly problems: readonly ProblemRow[];
  readonly emergency: readonly EmergencyRow[];
  readonly specialTeams: readonly SpecialTeamsRow[];
  /** Active non-starters on no core special teams unit (M2.4.1 rule 3): candidates to sit. */
  readonly lowValueBackups: readonly number[];
  readonly battles: readonly BattleRow[];
  /** Role label to ordered person ids: what the played game's `depthRoster` reads (league.depth.toSimDepth). */
  readonly simDepth: Readonly<Record<string, readonly number[]>>;
}

/** What the depth chart screen asks for. Each is applied by `applyDepthEdit`. */
export type DepthEdit =
  | { readonly kind: 'move'; readonly unitId: string; readonly job: string; readonly personId: number; readonly toIndex: number }
  | { readonly kind: 'add'; readonly unitId: string; readonly job: string; readonly personId: number }
  | { readonly kind: 'remove'; readonly unitId: string; readonly job: string; readonly personId: number }
  | { readonly kind: 'inherit'; readonly unitId: string; readonly job: string }
  | { readonly kind: 'emergency'; readonly need: string; readonly personId: number | null }
  | { readonly kind: 'decide_battle'; readonly unitId: string; readonly job: string; readonly winner: number };
