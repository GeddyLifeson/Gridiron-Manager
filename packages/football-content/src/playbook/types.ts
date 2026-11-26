// Playbook objects (G3.1.1) and the call grammar's vocabulary (G4.1.1, G4.5.1). Content is data (P1.1.2):
// nothing here names a level; rule values come by key (keys.ts).

export type Book = 'offense' | 'defense' | 'special_teams';
export type LanguageFamily = 'digit' | 'descriptive' | 'concept';

/** Offensive call slots in the G4.1.1 default order. */
export const OFFENSE_SLOTS = ['personnel', 'shift', 'formation', 'strength', 'formation_tag', 'motion', 'protection', 'run', 'concept', 'tag', 'kill', 'snap_count'] as const;
/** Defensive call slots in the G4.5.1 default order. */
export const DEFENSE_SLOTS = ['personnel', 'front', 'stunt', 'pressure', 'coverage', 'week_tag'] as const;
/** Special teams calls name the unit, the formation or return, and tags. */
export const KICKING_SLOTS = ['unit', 'formation', 'scheme', 'tag'] as const;
/** Part types that never sit in a call slot but live in the parts library (G3.1.1 "parts"). */
export const OTHER_PART_TYPES = ['check', 'declaration', 'show', 'cadence', 'alert', 'indicator', 'dummy', 'audible', 'unit', 'scheme'] as const;

export type OffenseSlot = (typeof OFFENSE_SLOTS)[number];
export type DefenseSlot = (typeof DEFENSE_SLOTS)[number];
export type KickingSlot = (typeof KICKING_SLOTS)[number];
export type CallSlot = OffenseSlot | DefenseSlot | KickingSlot;
export type PartType = CallSlot | (typeof OTHER_PART_TYPES)[number];

/** How a number word is spoken (G4.2.3, G4.3.1): digit by digit ("six-seven") or grouped ("three ninety-four"). */
export type NumberSay = 'digits' | 'grouped';

/**
 * A shared part (G3.1.1): editing it changes every play that uses it. `content` is the football the part
 * carries, independent of its word; import and merge match on it first (G3.4.2). `words` holds the default
 * word per language family; the team's word list (words.ts) overrides it.
 */
export interface Part {
  readonly id: string;
  readonly type: PartType;
  readonly content: string;
  readonly words: Readonly<Partial<Record<LanguageFamily, string>>> & { readonly descriptive: string };
  /** Said only when it differs from the system default (G4.1.1 unspoken parts). */
  readonly isDefault?: boolean;
  /** For formations: route runners the formation has (G4.1.3 digit-string check). */
  readonly runners?: number;
  /** For formations: backs in the backfield (G4.2.3 back-digit runs need one). */
  readonly backs?: number;
  /** Learning units of the part itself (G1.7.1), charged once per position group. */
  readonly units?: number;
}

export type PlayStatus = 'draft' | 'valid' | 'installed' | 'retired';
export type Role = 'base' | 'complement' | 'constraint' | 'situational' | 'shot';

export const OFFENSE_SECTIONS = ['run', 'dropback', 'quick', 'play_action', 'movement', 'screen', 'rpo', 'short_yardage_goal_line', 'two_minute', 'trick'] as const;
export const PARTS_SECTIONS = ['formations', 'motions', 'protections', 'concepts', 'tags', 'checks', 'words'] as const;

/** First-second look of one slot (G3.2.2): alignment and the direction of its first movement. */
export interface LookSlot {
  readonly role: string;
  readonly at: readonly [depth: number, lateral: number];
  /** Movement in the first second after the snap, yards (depth, lateral). Zero vector for a player who does not move. */
  readonly move: readonly [depth: number, lateral: number];
}

/**
 * One play or call in the book. `parts` maps call slots to part ids; `tags` are the play's own tags
 * (calls may add more). Home section is exactly one (G3.1.1); labels are free.
 */
export interface PlayEntry {
  readonly id: string;
  readonly book: Book;
  /** Section path: for offense one of OFFENSE_SECTIONS; for defense [package, front|pressure|coverage]; for kicking [unit]. */
  readonly section: readonly string[];
  readonly labels: readonly string[];
  readonly status: PlayStatus;
  readonly parts: Readonly<Partial<Record<CallSlot, string>>>;
  readonly tags: readonly string[];
  readonly role: Role;
  /** Parent play id for a variant (G3.1.2 `source`). */
  readonly parentId?: string;
  /** Learning units of the play (G1.7.1). */
  readonly units: number;
  /** User's own `intent` labels: coverages or fronts the play is built to beat (G3.5.1). */
  readonly beats: readonly string[];
  readonly situations: readonly string[];
  /** First-second look for series similarity; absent when the play has no drawing yet. */
  readonly look?: readonly LookSlot[];
  /** Content id the play came from (starter or generated), for traceability. */
  readonly origin?: string;
}

/** Season usage, kept apart from the play object so export can drop it (G3.4.2: no results in files). */
export interface PlayUsage {
  readonly called: number;
  readonly lastCalledWeek: number | null;
  /** Staff estimate of readiness 0 to 1 (G5.4.1). Never true knowledge (K9). */
  readonly readinessEstimate: number;
  /** Games the play has been installed (G3.2.1 "never called" check). */
  readonly gamesInstalled: number;
}

export interface Playbook {
  readonly teamId: string;
  readonly parts: ReadonlyMap<string, Part>;
  readonly plays: ReadonlyMap<string, PlayEntry>;
}

/** A call: one play plus added tags, or a packaged two-play call (G1.4.3, G4.1.1 kill word). */
export interface Call {
  readonly playId: string;
  readonly tags: readonly string[];
  readonly second?: { readonly playId: string; readonly tags: readonly string[] };
}

/** Injected play validator (G1.5.1 lives in the play designer; the library only re-runs it). */
export type Validator = (play: PlayEntry, book: Playbook) => { readonly ok: boolean; readonly failures: readonly string[] };
