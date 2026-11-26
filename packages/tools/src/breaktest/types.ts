// Shapes of the adversarial playtest ("break test"). The playtest in ../playtest plays a career the way a
// coach would; the break test tries to break the game at every step: random and hostile command sequences,
// illegal and boundary inputs, actions out of order, save and reload at odd moments, rapid time skips, cap
// and roster edge cases. After every step it checks invariants (state consistency, money and roster
// conservation, records against box scores, observer-filter leaks), and it replays every run to check that
// the same seed and the same inputs give the same states.
//
// A target is one part of the game the rig can drive through its public entry points. Targets never reach
// into private state: what a target can see is what the game exposes.

/** How an action was chosen. `legal` is what a careful user would do; the rest try to break things. */
export const MODES = ['legal', 'hostile', 'boundary', 'out_of_order'] as const;
export type Mode = (typeof MODES)[number];

/** One input to a target. `kind` names the operation; `args` is plain JSON so a run can be written down and replayed. */
export interface Action {
  readonly kind: string;
  readonly mode: Mode;
  readonly args: Readonly<Record<string, unknown>>;
}

/** What the target says happened. `refused` is a clean refusal with a reason; a throw is caught by the engine. */
export type Outcome = { readonly accepted: true; readonly note?: string } | { readonly accepted: false; readonly reason: string };

/** Severity order for the report. */
export const KINDS = ['crash', 'nondeterministic', 'invariant', 'accepted_illegal', 'refused_legal', 'save', 'unreachable', 'note'] as const;
export type FindingKind = (typeof KINDS)[number];

export interface Violation {
  /** Stable id, no numbers inside, so one breach that repeats is one finding. */
  readonly code: string;
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface Finding {
  readonly kind: FindingKind;
  readonly target: string;
  readonly code: string;
  readonly message: string;
  readonly owner: string;
  readonly seedHex: string;
  /** Times seen in this run. */
  readonly count: number;
  /** Step index where it was first seen. */
  readonly step: number;
  /** Smallest action list from reset that still shows it (shrunk), when the engine could shrink it. */
  readonly repro?: readonly Action[];
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * One part of the game the rig drives. Every method may throw; the engine turns a throw into a crash finding.
 * `propose` must be a pure function of the stream and the target's visible state, so a run replays.
 */
export interface BreakTarget {
  readonly name: string;
  readonly owner: string;
  /** Fresh state for a seed. Called before every run and before every replay. */
  reset(seedHex: string): Promise<void>;
  /** The next action for a mode. */
  propose(mode: Mode, rnd: Rnd): Action;
  apply(a: Action): Promise<Outcome>;
  /**
   * The oracle: for an action the game must refuse, the reason; null when it must accept; undefined when the
   * rig cannot tell (then any outcome passes). Evaluated on the state before the action.
   */
  expect(a: Action): string | null | undefined;
  /** Checks run after every step on the visible state. */
  invariants(): Violation[];
  /** A hash of the visible state, for determinism and reload checks. */
  hash(): string;
  /** Saves and reopens (or round-trips) the state. Undefined when the target has no save. Returns save problems. */
  reload?(): Promise<Violation[]>;
  /** Checks run once at the end of a run (for example, play the game out and check its whole event log). */
  finish?(): Promise<Violation[]>;
  /** Steps of the game this target cannot reach yet, with why (reported once per run, never hidden). */
  unreachable(): readonly { readonly code: string; readonly message: string }[];
  close(): Promise<void>;
}

/** The random source the rig hands to targets (an engine-core stream underneath, so runs replay). */
export interface Rnd {
  uniform(): number;
  int(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
}

export interface RunOptions {
  readonly steps: number;
  /** Chance per step of a save and reload before the action (when the target has one). */
  readonly reloadChance: number;
  /** Mode weights, in MODES order. */
  readonly modeWeights: readonly [number, number, number, number];
  /** Replay the whole run and compare hashes step by step. */
  readonly replay: boolean;
  /** Shrink each new finding to a short repro (costs replays). */
  readonly shrink: boolean;
  /** Most replays one shrink may spend. */
  readonly shrinkBudget: number;
}

export const DEFAULT_RUN: RunOptions = {
  steps: 300, reloadChance: 0.04, modeWeights: [0.45, 0.25, 0.2, 0.1], replay: true, shrink: true, shrinkBudget: 60,
};

export interface TargetReport {
  readonly target: string;
  readonly seedHex: string;
  readonly steps: number;
  readonly accepted: number;
  readonly refused: number;
  readonly reloads: number;
  readonly findings: readonly Finding[];
  readonly ms: number;
}
