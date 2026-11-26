// The decision record (N3.1.1) and the entries of the decision log.
//
// The bible says `model_view` and `outcome` are "filled" later, and also that records are never edited
// (N3.5.1). Both hold here because the log stores them as their own appended entries that point at the
// decision by id (`DecisionView` joins them for reading). A decision entry is complete and frozen the
// moment it is appended.
//
// The world contract has `world:DecisionGrade` (one game decision against the model, P3.3.2). The full
// N3 record is not in the contract yet; these types are the shape asked for in change request CR-G31-1
// (see README.md in this folder). `toDecisionGrade` maps a scored game record onto the existing row.

/** A JSON value stored by value (N3.1.2: never by reference). */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [k: string]: JsonValue };

/** Where the decision happened. A game decision has the game clock; a weekly decision has the week. */
export interface DecisionTime {
  /** World date as the calendar's ISO day string (P3.2.1). */
  readonly worldDate: string;
  readonly gameId: number | null;
  /** Play index within the game, when the decision belongs to a snap. */
  readonly playIndex: number | null;
  readonly period: number | null;
  /** Game clock in tenths of a second, when in a game. */
  readonly gameClockTenths: number | null;
}

/** Who made the decision (N3.1.1 `actor`): the user, an AI person, a delegated staff member, or the default. */
export interface DecisionActor {
  readonly kind: 'user' | 'ai' | 'staff' | 'default';
  readonly personId: number | null;
}

/** Who is credited (N3.1.1 `attribution`, N3.2.1 edge case, N3.4.1 edge case). */
export interface Attribution {
  /** The person credited with the decision. */
  readonly creditedPersonId: number;
  readonly basis:
    | 'own_decision'          // the actor owns the decision type at his rung
    | 'suggestion_taken'      // a coordinator's suggestion the owner accepted
    | 'delegated'             // an assistant acting under delegation; judged as the choice of delegate
    | 'logged_under_boss';    // below head coach, a type the rung does not own (N3.2.1 edge case)
  /** The person whose suggestion was taken or who acted under delegation, if any. */
  readonly viaPersonId: number | null;
}

/** One option the screen offered (N3.1.1 `options`). "Do nothing" is an option like any other. */
export interface DecisionOption {
  readonly optionId: string;
  readonly labelKey: string;
  /** Option detail by value, for example the play called if the fourth-down option is "go". */
  readonly detail: JsonValue;
}

/** One item of the information set (N3.1.2). Copied by value at confirmation. */
export interface InformationItem {
  /** The source declared by the decision prompt, for example `scouting.tendencies` or `medical.advice`. */
  readonly source: string;
  /** Whether the user had it open, or it was available and not viewed (N3.1.2 edge case). */
  readonly viewed: boolean;
  /** The value shown, frozen. Sample sizes travel inside the value where the source has them. */
  readonly value: JsonValue;
  /**
   * Set when this item names something the model does not take into account (an injured kicker, a gassed
   * defense). It is reported on the model's view (N3.3.1 rule 4, audit F5). The text is the label key.
   */
  readonly modelLacks: string | null;
}

/** Time to decide (N3.1.1 `time_taken`). Measured by the shell and passed in; the core reads no clock. */
export interface TimeTaken {
  readonly tenthsFromPrompt: number;
  /** Play clock left when the choice was confirmed, in tenths, when a play clock was running. */
  readonly playClockLeftTenths: number | null;
}

/** The N3.1.1 decision record, as appended. */
export interface DecisionRecord {
  readonly id: string;
  readonly time: DecisionTime;
  readonly actor: DecisionActor;
  /** The user's job at the time (S3): a job key from content, never a level word. */
  readonly rung: string;
  /** Catalogue type (N3.2, `catalogue.ts`). */
  readonly type: string;
  /** Owner system that emitted it: a bible leaf id, for example `I5` or `H6`. */
  readonly owner: string;
  /** The team whose decision this is. */
  readonly teamId: number;
  /** Situation strip for a game decision; week and opponent for a weekly one. By value. */
  readonly situation: JsonValue;
  readonly options: readonly DecisionOption[];
  readonly chosen: string;
  readonly information: readonly InformationItem[];
  readonly timeTaken: TimeTaken;
  readonly attribution: Attribution;
  /** True for a choice not to act at a moment the owner flagged (N3.2.1). */
  readonly notMade: boolean;
  /** An earlier decision this one replaced before it took effect (N3.1.1 edge case). Both records stay. */
  readonly supersedes: string | null;
  /** Large objects (a whole game plan, a call sheet) by snapshot id (N3.2.2 edge case). */
  readonly snapshotId: string | null;
  /** The L8.2.5 `violation_log` row, for a confirmed rule-breaking act (N3.2.2). */
  readonly violationLogId: string | null;
}

// ---------------------------------------------------------------- the model's view (N3.3)

/** A value with its standard error and support, as the N2 models return it. */
export interface Estimate {
  readonly value: number;
  readonly se: number;
  /** The model's support for the state was below its sparse count (N2.7.2). */
  readonly sparse: boolean;
}

export type DecisionClass = 'clearly_right' | 'toss_up' | 'clearly_wrong';

/** One option's value in the game-management view (N3.3.1). Values are win probability, 0 to 1. */
export interface OptionScore {
  readonly optionId: string;
  readonly value: number;
  readonly low: number;
  readonly high: number;
  readonly sparse: boolean;
}

/** N3.3.1: fourth downs, tries, timeouts, challenges, penalties, kicks. */
export interface GameManagementView {
  readonly kind: 'game_management';
  readonly modelId: string;
  /** Staff version (N3.3.1 rule 2): outcome chances from the staff's grades and the scouting view. */
  readonly options: readonly OptionScore[];
  readonly chosen: string;
  readonly best: string;
  /** Best value minus chosen value, in win probability (0 when the best was chosen). */
  readonly cost: number;
  /** Combined range of the chosen and best options (half-width sum). */
  readonly margin: number;
  readonly class: DecisionClass;
  /** N3.3.1 rule 4: things in the information set the model lacks. */
  readonly lacks: readonly string[];
}

/** N3.3.2: one play call. No single call is classed. */
export interface PlayCallView {
  readonly kind: 'play_call';
  readonly modelId: string;
  /** Expected points added averaged over the scouted mix, from the analytics staff's table. */
  readonly foresight: number;
  /** Sum of the scouted mix's sample sizes behind the foresight value. */
  readonly foresightSample: number;
  /** Probability the caller's own tendency table gave this call's family before the snap (0 to 1). */
  readonly predictability: number;
}

/** N3.3.3: people and roster decisions. No score; follow-up checks instead. */
export interface NoModelView {
  readonly kind: 'none';
  /** World dates of the follow-up checks (N3.3.3: 4 weeks, end of season). */
  readonly followUps: readonly string[];
}

export type ModelView = GameManagementView | PlayCallView | NoModelView;

/**
 * Hidden-truth companion of a model view (N3.1.2, N3.3.1 rule 2, N3.3.2). Stored apart, read by N4 and
 * shown only in the coaching school (N5). Never shown in a career review.
 */
export type TruthView =
  | { readonly kind: 'game_management'; readonly options: readonly OptionScore[]; readonly best: string; readonly cost: number }
  | { readonly kind: 'play_call'; readonly hindsight: number; readonly engineForesight: number };

// ---------------------------------------------------------------- outcomes (N3.1.1, N3.3.3)

export interface DecisionOutcome {
  /** What happened, by value: the play result, the try result, the later state. */
  readonly result: JsonValue;
  /** N1.3.1 luck split where it applies: the part of the result the decision explains, and the rest. */
  readonly luck: { readonly expected: number; readonly actual: number } | null;
}

/** A follow-up check result for a no-model decision (N3.3.3). No class is ever assigned. */
export interface FollowUp {
  readonly dueDate: string;
  /** Later grades as the user's own staff grade them (D6), with the bands at the time. */
  readonly people: readonly {
    readonly personId: number;
    readonly bandAtTime: { readonly low: number; readonly high: number };
    readonly laterGrade: number | null;
    /** Team the person graded for since, if not the decider's team. */
    readonly elsewhereTeamId: number | null;
  }[];
  /** Whether the bands of the people involved overlapped at the time. */
  readonly bandsOverlapped: boolean;
}

// ---------------------------------------------------------------- log entries (N3.5.1)

export type LogPayload =
  | { readonly kind: 'decision'; readonly record: DecisionRecord }
  | { readonly kind: 'model_view'; readonly decisionId: string; readonly view: ModelView }
  | { readonly kind: 'truth_view'; readonly decisionId: string; readonly view: TruthView }
  | { readonly kind: 'outcome'; readonly decisionId: string; readonly outcome: DecisionOutcome }
  | { readonly kind: 'follow_up'; readonly decisionId: string; readonly followUp: FollowUp }
  /** Certified mode: a reload from an earlier save (N3.5.1). */
  | { readonly kind: 'reload'; readonly fromSeq: number; readonly saveId: string }
  /** First entry of a chain segment: game version, seed and settings (N3.5.1, version updates). */
  | { readonly kind: 'segment'; readonly gameVersion: string; readonly seed: string; readonly settings: JsonValue; readonly previousSegmentHash: string | null };

export interface LogEntry {
  /** Position in the career's chain, from 0. */
  readonly seq: number;
  readonly prevHash: string;
  readonly payload: LogPayload;
  /** SHA-256 of the canonical text of seq, prevHash and payload. */
  readonly hash: string;
}

/** A decision with everything appended about it, for reading (review screens, N4, N5). */
export interface DecisionView {
  readonly record: DecisionRecord;
  readonly modelView: ModelView | null;
  readonly outcome: DecisionOutcome | null;
  readonly followUps: readonly FollowUp[];
  /** Decisions that replaced this one before it took effect. */
  readonly supersededBy: readonly string[];
}
