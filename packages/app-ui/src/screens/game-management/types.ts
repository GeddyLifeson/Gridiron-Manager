// The game management read-model data and commands as the panel uses them (G-61). Same shapes as
// app-services/src/read-models/game-management/types.ts and commands/game-management/index.ts; app-ui
// imports only the app-services entry point, and those folders reach it only through the integrator's
// barrel line (CR-G61-3), so the shapes are written here too. Keep the two in step.

export type SideIndex = 0 | 1;
export type DecisionKind = 'penalty' | 'runoff' | 'challenge' | 'fourth_down' | 'try' | 'kickoff' | 'coin_toss' | 'overtime_toss' | 'kneel';
export type Channel = 'offense' | 'defense' | 'special_teams' | 'game_management';
export const CHANNELS: readonly Channel[] = ['offense', 'defense', 'special_teams', 'game_management'];
export type InjuryWord = 'being_evaluated' | 'questionable' | 'doubtful' | 'out' | 'concussion_protocol' | 'cleared';
export type Seat = 'head_coach' | 'advisor' | 'coordinator' | 'other';
export type MessageKind = 'note' | 'answer' | 'alert' | 'medical' | 'position' | 'player';
export interface OptionResult { readonly down: number | null; readonly distanceYd: number | null; readonly yardsToGoalYd: number | null; readonly clockTenths?: number }

export interface DecisionOptionView {
  readonly id: string;
  readonly labelId: string;
  readonly key: string;
  readonly result: OptionResult | null;
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
  readonly kind: MessageKind;
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

/** Who made a decision (O2.4.2 acceptance: every fourth down, try and kickoff names its decider). */
export type DecidedBy = 'user' | 'standing_rule' | 'default' | 'delegate';

export type GameManagementCommand =
  | { readonly type: 'gm.timeout'; readonly gameId: string }
  | { readonly type: 'gm.timeout_request'; readonly gameId: string } // coordinator asks the head coach (S5.4.1)
  | { readonly type: 'gm.challenge'; readonly gameId: string; readonly aspect: string }
  | {
    readonly type: 'gm.decide'; readonly gameId: string; readonly decisionId: string; readonly kind: DecisionKind; readonly optionId: string;
    readonly decidedBy: DecidedBy;
    /** What was on screen when he chose (N3: the information shown). */
    readonly shown: { readonly chartOption: string | null; readonly advisorOption: string | null };
  }
  | { readonly type: 'gm.recommend'; readonly gameId: string; readonly decisionId: string; readonly optionId: string } // analyst seat (S5.3.3)
  | { readonly type: 'gm.channel'; readonly gameId: string; readonly channel: Channel }
  | { readonly type: 'gm.ask_booth'; readonly gameId: string; readonly questionId: string }
  | { readonly type: 'gm.message_read'; readonly gameId: string; readonly messageId: string; readonly beforeCallConfirmed: boolean };


/** The read model's data: empty when the team has no live game the observer may see. */
export type GameManagementData = { readonly teamId: number; readonly live: false } | { readonly teamId: number; readonly live: true; readonly view: GameManagementView };

export const GM_TABS = ['messages', 'injuries'] as const;
export type GmTab = (typeof GM_TABS)[number];
