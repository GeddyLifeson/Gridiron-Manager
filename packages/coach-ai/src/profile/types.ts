// The AI coach profile record (bible K2.1.1). Truth data: no interface module may read it (K9.3.1).
// It holds what a coach runs (system), his habits (tendencies), hidden causes of how well he works
// (behavior, z-scores), what he has learned (memory) and whom he worked under (lineage).
// It never holds a label, archetype, template name, point, level or reputation number (K2.7.1):
// people are described from what they have done, by the label engine (N2.8), never by this record.

export type CoachLevel = 'pro' | 'college';

/** K2.6.1: one schema for every coaching role. */
export type CoachRole =
  | 'headCoach'
  | 'offensiveCoordinator'
  | 'defensiveCoordinator'
  | 'specialTeamsCoordinator'
  | 'positionCoach';

export type SideOfBall = 'offense' | 'defense' | 'specialTeams';

/** Offensive personnel groupings (F1): backs then tight ends. `other` holds every rarer grouping. */
export type PersonnelKey = 'p10' | 'p11' | 'p12' | 'p13' | 'p21' | 'p22' | 'other';

/** K2.1.2 offense rates: wanted shares in neutral situations (priors, not outcomes). */
export interface OffenseRates {
  /** Share of neutral-situation plays that are dropbacks. K4.3.7 reads it as "how often he runs". */
  neutralPass: number;
  /** Share of all plays with pre-snap motion. */
  motion: number;
  /** Share of dropbacks with a play-action fake. */
  playAction: number;
  /** Share of plays from shotgun. */
  shotgun: number;
  /** Share of pass attempts that are screens. */
  screen: number;
  /** Share of plays called as run-pass options. */
  rpo: number;
  /** Share of dropbacks with a designed deep shot. */
  deepShot: number;
}

/** K2.1.2 defense rates: wanted shares in neutral situations. */
export interface DefenseRates {
  /** Share of dropbacks met with five or more rushers. */
  blitz: number;
  /** Share of dropbacks with a simulated pressure (four rushers, one from an unexpected spot). */
  simulatedPressure: number;
  /** Share of snaps in man coverage. */
  man: number;
  /** Share of snaps from a two-high shell at the snap. */
  twoHigh: number;
  /** Share of snaps where the pre-snap shell differs from the post-snap coverage. */
  disguise: number;
}

/** K2.1.2 tempo base. */
export interface TempoBase {
  /** Share of snaps from a huddle. Equals 1 minus `noHuddleShare`. */
  huddleShare: number;
  noHuddleShare: number;
  /** Seconds left on the play clock at which he wants to snap in a normal series, unit s. */
  snapAtPlayClockS: number;
}

/** K2.1.2: what football the coach believes in. Family and playbook ids are content ids (F14, G3). */
export interface SystemBlock {
  /** The side he calls or came from. A head coach holds a full system here and a preference elsewhere (K2.1.2 rule 2). */
  primarySide: SideOfBall;
  offenseFamily: string;
  defenseFamily: string;
  specialTeamsFamily: string;
  /** G3 playbook id, or null until G3 content ships a playbook for the family. */
  playbookId: string | null;
  /** Wanted share of offensive snaps per grouping (F1). Sums to 1. */
  personnelWeights: Record<PersonnelKey, number>;
  tempoBase: TempoBase;
  offenseRates: OffenseRates;
  defenseRates: DefenseRates;
  /** How big a plan he carries (G6.6.1), unit count. */
  sheetSize: { offenseCalls: number; defenseCalls: number };
}

/**
 * K2.1.3 tendencies: offsets from a decision model, not quality.
 * `fourthDownOffset` and `twoPointOffset` are win-probability percentage points (positive = more
 * conservative). `analyticsTrust` and `iceKicker` are probabilities. The rest are z-scores read by K4/K5.
 */
export interface TendencyBlock {
  fourthDownOffset: number;
  twoPointOffset: number;
  endOfHalfAggression: number;
  leadProtection: number;
  deficitUrgency: number;
  lateDefenseRisk: number;
  starterRestBias: number;
  analyticsTrust: number;
  challengeEagerness: number;
  iceKicker: number;
}

/** K2.1.4 hidden behaviour parameters, each a z-score. Never displayed, summed or averaged (rule 3). */
export interface BehaviorBlock {
  callFit: number;
  preparation: number;
  adjustment: number;
  selfScout: number;
  clockManagement: number;
  teaching: number;
  evaluation: number;
}

/** One row of observed counts about an opposing caller in one situation bucket (K2.1.5). */
export interface OpponentNoteRow {
  bucket: string;
  /** What a charter can see (N2.3.1 rule 2): an observed tag, never the true call name. */
  observed: string;
  count: number;
  /** Count of times the counter he used worked. */
  worked: number;
  /** Season and week of the last update. */
  lastSeason: number;
  lastWeek: number;
  /** Decayed evidence count: each observation adds 1, then it halves every 2 seasons (K2.1.5 rule 3). */
  weight: number;
}

/** K2.1.5: what he has learned. Keyed by the opposing caller's person id (rule 1). */
export interface MemoryBlock {
  opponentNotes: Record<string, OpponentNoteRow[]>;
  /** Pointer into the shared tendency store (N2.3.1) for his own calls, or null before his first called game. */
  ownTendencyLog: string | null;
}

/** K2.5.2: seasons worked under each mentor. Names come from X7 edges; only ids are stored. */
export interface LineageEntry {
  mentorId: string;
  seasons: number;
  /** Last season year worked under him: the most recent mentor's weight doubles (K2.5.2 rule 1). */
  lastSeason: number;
}

export interface LineageBlock {
  mentors: LineageEntry[];
}

/** K2.1.1 record. */
export interface CoachProfile {
  personId: string;
  /** Competition the profile was generated for. Named `league`, not `level`: K2.7.1 bans level fields. */
  league: CoachLevel;
  role: CoachRole;
  system: SystemBlock;
  tendencies: TendencyBlock;
  behavior: BehaviorBlock;
  memory: MemoryBlock;
  lineage: LineageBlock;
  /** True for a profile built from an imported real coach's public record (K2.2.2). */
  imported: boolean;
  /** Increments at each between-season change (K2.5.1). */
  version: number;
}
