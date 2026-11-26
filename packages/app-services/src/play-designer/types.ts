// Play designer screen service types (G-90 screen; O3.1, O3.7). app-services may not import the designer
// model until the integrator adds `export * as designer` to the football-lang barrel, so the shapes the
// session reads are written here structurally. The real `designer.PlayDraft`, `designer.PlayEdit` and
// `designer.DesignMessage` satisfy them; the integrator binds the real functions as `DesignerPorts`.

export type Yd2 = readonly [depth: number, lateral: number];
export type PointKind = 'through' | 'cut' | 'settle';
export interface PointLike { readonly at: Yd2; readonly kind: PointKind; readonly landmark: string | null }

export interface SlotLike {
  readonly role: string;
  readonly letter: string;
  readonly at: Yd2;
  readonly onLine: boolean;
  readonly stance: string;
  readonly reportsEligible: boolean;
  readonly extraTackle: boolean;
  readonly assignment: {
    readonly behavior: string;
    readonly path: readonly PointLike[];
    readonly concept: string;
    readonly keys: readonly string[];
    readonly rules: readonly { readonly text: string }[];
  };
}

export type PresnapLike =
  | { readonly kind: 'shift'; readonly moves: readonly { readonly role: string; readonly to: Yd2; readonly onLine: boolean }[]; readonly setAfterS: number }
  | { readonly kind: 'motion'; readonly role: string; readonly path: readonly PointLike[]; readonly onLine: boolean; readonly stops: boolean; readonly setAfterS: number; readonly speed: Yd2 | null };

/** The fields of the G1.1.1 play object the screen reads. */
export interface PlayLike {
  readonly id: string;
  readonly name: { readonly formation: string; readonly strength: string; readonly motion: string; readonly protection: string; readonly concept: string; readonly tags: readonly string[] };
  readonly kind: string;
  readonly personnel: string;
  readonly formation: { readonly id: string | null; readonly strength: string };
  readonly slots: readonly SlotLike[];
  readonly presnap: readonly PresnapLike[];
  readonly qb: { readonly action: string; readonly dropSteps: number; readonly readType: string; readonly progression: readonly { readonly role: string; readonly eyesAtS: number }[]; readonly throwAway: string };
  readonly protection: { readonly id: string } | null;
  readonly runDirection: 'left' | 'middle' | 'right' | null;
  readonly shotgun: boolean;
  readonly intent: { readonly role: string; readonly beats: readonly string[]; readonly checkOutOf: readonly string[] };
  readonly coachingPoints: Readonly<Record<string, string>>;
  readonly status: string;
  readonly ruleFailures: readonly { readonly ruleId: string; readonly role: string | null }[];
  readonly dismissed: readonly { readonly code: string; readonly role: string | null; readonly reason: string }[];
  readonly notes: string;
  readonly version: number;
}

export type MessageLevel = 'refused' | 'illegal' | 'unsound' | 'note';
export interface MessageLike {
  readonly level: MessageLevel;
  readonly code: string;
  readonly roles: readonly string[];
  readonly citation: string;
  readonly leaf: string;
  readonly foul: string | null;
  readonly messageKey: string;
  readonly step: number | null;
  readonly dismissed: boolean;
  readonly detail: string;
}

/** The edits the session builds itself; each has the same shape as the matching `designer.PlayEdit`. */
export type CoreEdit =
  | { readonly type: 'move_slot'; readonly role: string; readonly at: Yd2; readonly onLine: boolean }
  | { readonly type: 'set_path'; readonly role: string; readonly behavior: string; readonly path: readonly PointLike[] }
  | { readonly type: 'insert_presnap'; readonly index: number; readonly step: PresnapLike }
  | { readonly type: 'remove_presnap'; readonly index: number }
  | { readonly type: 'dismiss_warning'; readonly code: string; readonly role: string | null; readonly reason: string }
  | { readonly type: 'restore_warning'; readonly code: string; readonly role: string | null }
  | { readonly type: 'set_notes'; readonly notes: string }
  | { readonly type: 'mirror' };

export type HashSpot = 'left' | 'middle' | 'right';
export type DesignerTab = 'draw' | 'rules' | 'against' | 'bench' | 'notes';
export const DESIGNER_TABS: readonly DesignerTab[] = ['draw', 'rules', 'against', 'bench', 'notes'];

/** Field lines across the canvas for one hash, in drawn lateral yards from the ball (right positive). */
export interface FieldLines { readonly sidelines: readonly [left: number, right: number]; readonly hashes: readonly [left: number, right: number]; readonly numbers: readonly [left: number, right: number] | null }

/** A defensive look for the Against tab: grey markers only, never a prediction (O3.1.1). */
export interface LookOption { readonly id: string; readonly label: string; readonly markers: readonly { readonly label: string; readonly at: Yd2 }[] }

/** A content part (F1 to F7) the parts list offers; choosing it applies `edit` (O3.1.1 rules and logic). */
export interface PartOption<E> { readonly id: string; readonly label: string; readonly edit: E }

/** Parts in the order a call is spoken (O3.1.1). */
export type PartKind = 'personnel' | 'formation' | 'motion' | 'protection' | 'concept' | 'tags' | 'qb';
export const PART_ORDER: readonly PartKind[] = ['personnel', 'formation', 'motion', 'protection', 'concept', 'tags', 'qb'];

/** O3.7.2 header strip, from the E7 ledger and the delegation settings. */
export interface HoursStrip {
  readonly usedThisWeekH: number;
  readonly leftThisWeekH: number;
  readonly owner: { readonly kind: 'coach' } | { readonly kind: 'assistant'; readonly name: string };
  readonly assistants: readonly { readonly id: string; readonly name: string }[];
}

/** The test bench form (O3.1.4). Calls are ids the bench port resolves. */
export interface BenchForm {
  readonly defenseIds: readonly string[];
  readonly down: number;
  readonly distanceYd: number;
  readonly yardsToGoal: number;
  readonly hash: HashSpot;
  readonly runs: number;
  readonly seed: number;
  readonly knowledge: 'fully_installed' | 'current_readiness';
}

export interface RateLike { readonly count: number; readonly of: number; readonly rate: number | null; readonly low: number | null; readonly high: number | null }
export interface BenchBlockLike {
  readonly opponent: string;
  readonly runs: number;
  readonly yards: { readonly n: number; readonly mean: number | null; readonly low: number | null; readonly high: number | null };
  readonly histogram: { readonly minYd: number; readonly counts: readonly number[] };
  readonly completion: RateLike;
  readonly pressure: RateLike;
  readonly turnovers: RateLike;
  readonly targets: Readonly<Record<string, number>>;
  readonly failures: readonly { readonly contest: string; readonly count: number }[];
  readonly samples: readonly number[];
}
/** The parts of `playBench.BenchReport` the screen shows. */
export interface BenchReportLike {
  readonly refusedBecause: string | null;
  readonly runsRequested: number;
  readonly runsDone: number;
  readonly partial: boolean;
  readonly seed: number;
  readonly overall: BenchBlockLike | null;
  readonly byOpponent: readonly BenchBlockLike[];
  readonly hourCharge: { readonly actionClass: string; readonly hours: number };
}

/**
 * What the integrator binds from the designer model (football-lang `designer`), the content library,
 * the depth chart, the E7 ledger and the bench (`playBench.runBench`). Every port is pure.
 */
export interface DesignerPorts<P extends PlayLike, E extends { readonly type: string }> {
  /** `designer.applyEdit`. */
  reduce(play: P, edit: CoreEdit | E): P;
  /** `designer.validateDraft` with the context bound (rules, params, jerseys, looks, callWords). */
  validate(play: P): readonly MessageLike[];
  /** `designer.publishDraft`. */
  publish(play: P, messages: readonly MessageLike[], opts: { readonly confirmIllegal: boolean; readonly previous: P | null }):
    | { readonly kind: 'refused' | 'needs_confirmation'; readonly messages: readonly MessageLike[] }
    | { readonly kind: 'published'; readonly play: P; readonly illegalAsDrawn: boolean; readonly newTeaching: readonly string[] };
  /** `designer.snapAlignment` with params bound; `free` is Alt held (O3.1.2). */
  snap(raw: Yd2, free: boolean): { readonly at: Yd2; readonly onLine: boolean };
  /** `designer.snapPath` with params bound. */
  snapPath(from: Yd2, path: readonly PointLike[]): PointLike[];
  /** `designer.alignmentReadout` with landmarks bound. */
  readout(at: Yd2, onLine: boolean, slots: readonly SlotLike[], hash: HashSpot): string;
  /** `designer.recognizeRoute` with the F6 route tree bound. */
  recognizeRoute(from: Yd2, path: readonly PointLike[]): string | null;
  fieldLines(hash: HashSpot): FieldLines;
  /** Assignment behaviours offered for a slot (keyboard drawing: "choose an assignment from a list"). */
  behaviors(role: string): readonly string[];
  partOptions(kind: PartKind, play: P): readonly PartOption<E>[];
  looks: readonly LookOption[];
  /** Positions the roster cannot fill for this personnel group (O3.1.1 edge case). */
  missingPositions(play: P): readonly string[];
  hours(): HoursStrip;
  /** Game-calendar date label for a published version. */
  calendarLabel(): string;
  /** Defensive calls the bench may run against; absent when the bench is not wired. */
  benchDefenses?: readonly { readonly id: string; readonly label: string }[];
  runBench?(play: P, form: BenchForm, inGame: boolean): BenchReportLike;
  /** True during a game: the bench is unavailable (O3.1.4). */
  inGame(): boolean;
}
