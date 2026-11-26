// The week screens' read models (item 9): meetings (H4), travel (H8), game-week documents (H9) and the
// press conference (H7.2, O4.5.2). Plain data. Hidden values (attention, document quality and seeded
// errors, reporter goodwill and edge, stance effect sizes) never appear: the screens show words, times,
// minutes and counts only (K9, audit Part 17).

/** One row of a meeting agenda as the editor holds it (H4.1.2, H4.2.1, H4.2.3). */
export interface AgendaInput {
  readonly kind: string;
  /** The user's own words for the item, or a content id the screen names. */
  readonly label: string;
  readonly minutes: number;
  /** Install items only: plays covered and whether they are new this week. */
  readonly plays?: number;
  readonly newItem?: boolean;
  readonly unit?: string;
}

export type AgendaWarning = 'long_stretch' | 'mentioned_only' | 'over_install_limit';

export interface AgendaRowView {
  readonly n: number;
  readonly kind: string;
  readonly label: string;
  readonly minutes: number;
  /** Minutes of meeting time since the last break or walkthrough when this row ends. */
  readonly runMinutes: number;
  readonly warnings: readonly AgendaWarning[];
}

export interface MeetingView {
  readonly blockId: string;
  /** H4.1.1 meeting type id (staff, game_plan, team, unit, position, night_before, ...). */
  readonly type: string;
  readonly start: string;
  readonly minutes: number;
  readonly leader: string;
  readonly attendees: readonly string[];
  /** The user leads it: he edits the agenda. Otherwise he reviews the leader's planned agenda (H4.1.1). */
  readonly editable: boolean;
  readonly done: boolean;
  /** No agenda saved: the leader runs his default (H1.1.1 rule 6). */
  readonly defaultAgenda: boolean;
  readonly agenda: readonly AgendaRowView[];
  readonly planned: number;
  /** Block minutes minus planned minutes; negative when the agenda overruns the block. */
  readonly left: number;
  /** Item kinds the editor offers for this meeting type. */
  readonly itemKinds: readonly string[];
  /** Night-before only: the tone the user picked (calm, urgent, confident, challenging) and the choices. */
  readonly tone: string | null;
  readonly tones: readonly string[];
  /** After the meeting: the leader's report in words, as he saw the room (H4.1.2). Never an attention number. */
  readonly report: string | null;
}

export interface MeetingDayView {
  readonly date: string;
  readonly label: string;
  readonly meetings: readonly MeetingView[];
  readonly totalMinutes: number;
  readonly capMinutes: number;
  readonly overCap: boolean;
}

export interface MeetingsView {
  readonly weekId: string;
  readonly days: readonly MeetingDayView[];
  /** Minutes of continuous meeting time after which the timeline marks a stretch without a break. */
  readonly longStretchMinutes: number;
}

export interface TravelOptionView {
  readonly plan: string;
  readonly isDefault: boolean;
  readonly chosen: boolean;
  readonly mode: string;
  readonly departs: string;
  readonly arrives: string;
  readonly returns: string;
  readonly nightsAway: number;
  readonly practicesLost: number;
  readonly practiceMinutesLost: number;
  readonly meetingMinutesLost: number;
  readonly blocksMoved: number;
  /** "10:00" when kickoff is at least the note threshold away from body time, else null (H8.2.1). */
  readonly bodyKickoff: string | null;
  readonly earlyBodyTime: boolean;
}

export interface TravelBlockView { readonly id: string; readonly type: string; readonly start: string; readonly minutes: number; readonly location: string }

export interface TravelView {
  readonly weekId: string;
  readonly home: boolean;
  readonly gameId: string | null;
  readonly thursdayOnlyStandard: boolean;
  readonly altitude: boolean;
  readonly options: readonly TravelOptionView[];
  /** The travel-day plan of the chosen (or default) option: the day of departure, block by block (H8.1.2). */
  readonly travelDay: { readonly date: string; readonly blocks: readonly TravelBlockView[] } | null;
}

export type DocAction = 'assign' | 'review' | 'approve' | 'send_back' | 'write' | 'open';

export interface DocumentRowView {
  readonly id: string;
  readonly type: string;
  /** Owning leaf (H9.1.1 table), for the help link. */
  readonly leaf: string;
  readonly state: string;
  readonly author: string;
  readonly reviewer: string | null;
  readonly due: string;
  readonly recipients: readonly string[];
  readonly playersSee: boolean;
  readonly late: boolean;
  readonly sentBack: boolean;
  readonly version: number;
  readonly hours: number;
  readonly actions: readonly DocAction[];
}

export interface WorkloadView { readonly author: string; readonly assigned: number; readonly available: number | null; readonly over: boolean }

export interface DocumentsView {
  readonly weekId: string;
  readonly detail: 'all' | 'exceptions';
  readonly rows: readonly DocumentRowView[];
  readonly hidden: number;
  readonly workload: readonly WorkloadView[];
}

export interface PressChoiceView {
  readonly id: string;
  /** Choosing it breaks an association rule (a college answer naming an unsigned recruit, H7.4.1 rule 4). */
  readonly violation: boolean;
}

export interface PressQuestionView {
  readonly n: number;
  readonly text: string;
  readonly outlet: string;
  readonly followUp: boolean;
}

export interface PressAnsweredView { readonly n: number; readonly text: string; readonly outlet: string; readonly choice: string; readonly timedOut: boolean }

export interface PressSessionRow {
  readonly blockId: string;
  readonly session: string;
  readonly date: string;
  readonly start: string;
  readonly minutes: number;
  readonly done: boolean;
}

export interface PressView {
  /** This week's sessions with times (O4.5.2). */
  readonly sessions: readonly PressSessionRow[];
  /** The session in the room, or null between sessions. */
  readonly live: {
    readonly kind: string;
    readonly speaker: string;
    readonly asked: number;
    readonly target: number;
    readonly current: PressQuestionView | null;
    readonly choices: readonly PressChoiceView[];
    readonly timeLimitSeconds: number;
    readonly history: readonly PressAnsweredView[];
    readonly done: boolean;
    /** After the session: the line the press runs with, as a stance and topic (the screen words it). */
    readonly headline: { readonly choice: string; readonly topicId: string } | null;
  } | null;
}
