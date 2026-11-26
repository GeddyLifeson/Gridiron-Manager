// Inputs and view shapes of the game management read model (G-61: I5, I6.3, I7, I11, O2.1.2, O2.1.3,
// O2.4, O2.5.3). Inputs are typed structurally (the fields each builder reads) so the engine, the staff
// AI (K6, G-75) and the life module (G-53) can satisfy them without this folder importing their barrels.
// Every input is something the coach's side really has: the engine's legality answers, the staff's
// estimates and the messages people send. No truth-class value is read (K9.1, Q1.4.1).

/** Two-team pair, indexed by side (0 or 1) like the engine's GameState pairs. */
export type Pair<T> = readonly [T, T];
export type SideIndex = 0 | 1;

/** The game state the screen needs, from the engine's dead-ball record (J11) and the rule set. */
export interface LiveGameInput {
  readonly gameId: string;
  /** The user's team side in this game. */
  readonly ownSide: SideIndex;
  readonly period: number;
  readonly overtime: boolean;
  /** Periods that end a half (pro and college: [2, 4]); read from the rule set by the source. */
  readonly halfEndPeriods: readonly number[];
  readonly clockTenths: number;
  readonly playClockTenths: number;
  /** The play clock's full length for a running-clock snap (rule set, I5.4.1). */
  readonly playClockFullS: number;
  readonly clockRunning: boolean;
  /** When a stopped clock starts again, from the rule engine (B1, I5.4.1); null while running. */
  readonly nextStart: 'snap' | 'ready' | null;
  /** The two-minute warning of this half is still to come (automatic stop, Rule 4-4(h)). */
  readonly twoMinuteWarningAhead: boolean;
  /** Seconds of the warning (rule set); null where the level has none. */
  readonly twoMinuteWarningS: number | null;
  readonly downsPerSeries: number;
  readonly timeoutsLeft: Pair<number>;
  readonly score: Pair<number>;
  readonly possession: SideIndex | null;
  readonly down: number | null;
  readonly distanceYd: number | null;
  readonly yardsToGoalYd: number | null;
  /** Field length between goal lines (rule set), for "own territory". */
  readonly fieldLengthYd: number;
  /** Game seconds left in regulation, for the two-point chart row (G-71 cells are keyed by it). */
  readonly gameSecondsLeft: number;
  /** Real seconds since kickoff: the clock every timer and message arrival is measured on (I2.1.2). */
  readonly realTimeS: number;
  /** Plays run so far, to age booth notes in plays (O2.1.2). */
  readonly playIndex: number;
}

/** A legality answer from the rule engine (officiating clock.timeoutAllowed, replay.challengeRefusal). */
export interface Legality {
  readonly allowed: boolean;
  /** Text id of the reason when not allowed (for example `replay.refused.booth_only`). */
  readonly refusedKey: string | null;
}

export interface ControlsInput {
  readonly timeout: Legality & {
    /** A timeout is already asked for in this dead-ball period (B1 bars consecutive team timeouts). */
    readonly pending: boolean;
  };
  readonly challenge: Legality & {
    /** Our challenges left (replay.challengesLeft). */
    readonly left: number;
    /** Reviewable aspects of the last play (replay.challengeable), the short list a challenge opens. */
    readonly aspects: readonly string[];
    /** The staff's estimate of seconds until the next snap or kick closes the window (tempo); null when unknown. */
    readonly windowS: number | null;
    /** The level challenges by taking a timeout (`challenge.requires_timeout`, college Rule 12-5-1-b). */
    readonly byTimeout: boolean;
  };
}

export type DecisionKind = 'penalty' | 'runoff' | 'challenge' | 'fourth_down' | 'try' | 'kickoff' | 'coin_toss' | 'overtime_toss' | 'kneel';

/** One legal option exactly as the engine returns it (O2.4.3: the UI computes nothing). */
export interface DecisionOptionInput {
  readonly id: string;
  /** Text id of the option name. */
  readonly labelId: string;
  /** For penalty and runoff choices: the resulting situation the referee states. */
  readonly result?: { readonly down: number | null; readonly distanceYd: number | null; readonly yardsToGoalYd: number | null; readonly clockTenths?: number };
  /** The option a conservative default takes (engine tag): accept the yardage, kick the extra point, the plain kickoff. */
  readonly conservative?: boolean;
  /** Declining a penalty (guarded, O2.5.3). */
  readonly declines?: boolean;
}

/** A head coach decision the engine has pending (J11 pending events). */
export interface PendingDecision {
  readonly id: string;
  readonly kind: DecisionKind;
  readonly options: readonly DecisionOptionInput[];
  /** Real seconds when the decision arose. */
  readonly openedAtS: number;
  /** Options with no real choice (offsetting fouls, automatic enforcement): shown as a notice only. */
  readonly noticeOnly?: boolean;
}

/** Standing instructions set in the week (I1.4.3): decision kind to option id. */
export type StandingRules = Readonly<Partial<Record<DecisionKind, string>>>;

/** The G-71 chart as its read model delivers it (models strength chartView). */
export interface ChartInput {
  readonly cells: readonly { readonly yardsToGoalYd: number; readonly distanceYd: number; readonly approved: 'go' | 'field_goal' | 'punt'; readonly coachsCall: boolean; readonly mark: 'solid' | 'fair' | 'thin' }[] | null;
  readonly twoPoint: readonly { readonly scoreDiffBeforeTry: number; readonly gameSecondsLeft: number; readonly choice: 'kick' | 'two'; readonly coachsCall: boolean }[] | null;
}

/** The analyst's one line (I5.1.2), already carrying his error; produced by K6. */
export interface AdvisorLineInput {
  readonly decisionId: string;
  readonly optionId: string;
  /** Staff win-probability edge of the option, as a fraction. */
  readonly marginWp: number;
  readonly breakEven: number | null;
  readonly estimate: number | null;
  readonly close: boolean;
  /** Seconds after the decision arose that the analyst speaks (analyst skill, 1 to 4 s starting value). */
  readonly delayS: number;
}

export interface StaffInput {
  /** The farthest line of scrimmage, in yards to goal, the staff would kick a field goal from today (I4). Null with no estimate. */
  readonly fgRangeYardsToGoal: number | null;
  /** The analyst line for the current decision, or null with no analyst on the headset. */
  readonly advisor: AdvisorLineInput | null;
}

export type Channel = 'offense' | 'defense' | 'special_teams' | 'game_management';
export const CHANNELS: readonly Channel[] = ['offense', 'defense', 'special_teams', 'game_management'];

/** A message a person sends the coach (K6 fills the template). `sideline` is face to face on the bench. */
export interface SidelineMessage {
  readonly id: string;
  readonly channel: Channel | 'sideline';
  readonly kind: 'note' | 'answer' | 'alert' | 'medical' | 'position' | 'player';
  readonly speakerRole: string;
  readonly speakerName: string;
  /** Higher replaces lower on the one line (O2.1.3). */
  readonly priority: number;
  readonly text: string;
  /** The play the message is about, for its age in plays; null when not about a play. */
  readonly aboutPlay: number | null;
  /** Real seconds when the speaker started on it. */
  readonly producedAtS: number;
  /** Speaker's recognition or answer time (K6, by skill); the coach's tiredness is added on top. */
  readonly latencyS: number;
}

export type InjuryWord = 'being_evaluated' | 'questionable' | 'doubtful' | 'out' | 'concussion_protocol' | 'cleared';

/** A trainer's report on a player (I7.2.3): real uncertainty, a later revision replaces an earlier one. */
export interface InjuryReportInput {
  readonly playerId: number;
  readonly name: string;
  readonly position: string;
  readonly bodyPart: string;
  readonly word: InjuryWord;
  readonly revision: number;
  readonly producedAtS: number;
  readonly latencyS: number;
  /** Who replaced him by the depth card chain (I6.3.1), as the position coach reports it. */
  readonly replacedBy: string | null;
}

export type Seat = 'head_coach' | 'advisor' | 'coordinator' | 'other';
export type GuardSetting = 'on' | 'minimal' | 'off';

/** The coach himself: seat, attention and tiredness (G-53 gameDayEffects.infoDelayS). */
export interface CoachInput {
  readonly seat: Seat;
  readonly channel: Channel;
  /** Seconds added to everything that reaches him through people (E7.4.2). The play clock is untouched. */
  readonly infoDelayS: number;
  readonly guards: GuardSetting;
  readonly certified: boolean;
  /** Message ids he has read (message-read events, N3). */
  readonly read: readonly string[];
}

export interface GameManagementInputs {
  readonly live: LiveGameInput;
  readonly controls: ControlsInput;
  readonly pending: readonly PendingDecision[];
  readonly standing: StandingRules;
  readonly chart: ChartInput | null;
  readonly staff: StaffInput;
  readonly messages: readonly SidelineMessage[];
  readonly injuries: readonly InjuryReportInput[];
  readonly coach: CoachInput;
}

// ------------------------------------------------------------------ view

export interface DecisionOptionView {
  readonly id: string;
  readonly labelId: string;
  readonly key: string;
  readonly result: DecisionOptionInput['result'] | null;
  readonly guarded: boolean;
}

export interface DecisionBarView {
  readonly id: string;
  readonly kind: DecisionKind;
  /** head coach decides; advisor recommends; coordinator sees the boss's decision only. */
  readonly mode: 'decide' | 'recommend';
  readonly options: readonly DecisionOptionView[];
  readonly secondsLeft: number;
  /** What happens at zero, and why (standing rule or the conservative default). */
  readonly onExpiry: { readonly optionId: string; readonly by: 'standing_rule' | 'default' };
  readonly chart: { readonly option: string; readonly coachsCall: boolean; readonly mark: 'solid' | 'fair' | 'thin' | null } | null;
  readonly advisor: { readonly optionId: string; readonly marginWp: number; readonly breakEven: number | null; readonly estimate: number | null; readonly close: boolean } | null;
  readonly advisorDueInS: number | null;
  readonly fgRangeYardsToGoal: number | null;
  readonly noticeOnly: boolean;
  /** Decisions queued behind this one, in rule order. */
  readonly queued: number;
  readonly holdS: number;
}

export interface ControlView {
  readonly enabled: boolean;
  readonly reasonKey: string | null;
  readonly count: number;
  readonly guarded: boolean;
}

export interface ClockView {
  readonly clockTenths: number;
  readonly playClockTenths: number;
  readonly status: 'running' | 'stopped';
  readonly startsOn: 'snap' | 'ready' | null;
  readonly timeoutsOwn: number;
  readonly timeoutsOpp: number;
  /** The arithmetic panel, last five minutes of a half only. */
  readonly panel: {
    readonly leader: 'own' | 'opp';
    readonly kneels: number;
    readonly burnS: number;
    readonly trailingTimeouts: number;
    readonly burnAgainstTimeoutsS: number;
    readonly kneelEndsGame: boolean;
  } | null;
}

export interface MessageView {
  readonly id: string;
  readonly channel: Channel | 'sideline';
  readonly kind: SidelineMessage['kind'];
  readonly speakerRole: string;
  readonly speakerName: string;
  readonly text: string;
  readonly ageInPlays: number | null;
  readonly read: boolean;
}

export interface SidelineView {
  readonly channel: Channel;
  readonly line: (MessageView & { readonly clipped: string }) | null;
  readonly list: readonly MessageView[];
  readonly headlines: readonly { readonly channel: Channel; readonly count: number }[];
  /** Seconds his tiredness adds to everything people tell him; shown so the cost is visible. */
  readonly infoDelayS: number;
}

export interface InjuryRowView {
  readonly playerId: number;
  readonly name: string;
  readonly position: string;
  readonly bodyPart: string;
  readonly word: InjuryWord;
  readonly revised: boolean;
  readonly replacedBy: string | null;
}

export interface GameManagementView {
  readonly gameId: string;
  readonly seat: Seat;
  readonly bar: DecisionBarView | null;
  readonly timeout: ControlView | null;
  readonly challenge: (ControlView & { readonly aspects: readonly string[]; readonly windowS: number | null; readonly byTimeout: boolean }) | null;
  readonly clock: ClockView;
  readonly sideline: SidelineView;
  readonly injuries: readonly InjuryRowView[];
}
