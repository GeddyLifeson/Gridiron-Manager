// The office (home) read model (G-72; O1.2.1 today view, O1.2.2 inbox and decision queue, O1.2.3 advancing
// time). Plain data. A delegated block names the delegate and a note of how his past work of this kind has
// gone, from the record the user has seen; his hidden skill is never shown or forecast (O1.2.1 rule).

export interface DateLike { readonly seasonYear: number; readonly dayIndex: number }
/** A moment in the world: a date and the minute of that day. */
export interface Moment { readonly date: DateLike; readonly minute: number }

export interface BlockRow {
  readonly blockId: string;
  /** Text key of the block's name (H1 atom). */
  readonly labelKey: string;
  readonly startMinute: number;
  readonly minutes: number;
  readonly runBy: 'coach' | 'delegate';
  /** The coach's own hour cost, shown only for blocks he attends. */
  readonly coachMinutes: number | null;
  readonly delegateId: number | null;
  readonly delegateName: string | null;
  /** One line from the delegate's seen record (O4.3.1), or "no book on him yet". */
  readonly delegateNoteKey: string | null;
  /** Required by league rule (a mandatory day off): marked, and moved only in the week planner (H1). */
  readonly requiredByRule: boolean;
  /** Registry id of the screen where the block's work is done. */
  readonly screenId: string | null;
}

export interface TodayView {
  readonly date: DateLike;
  readonly phaseKey: string;
  readonly dayLabelKey: string | null;
  readonly daysToGame: number | null;
  readonly opponent: { readonly teamId: number; readonly name: string } | null;
  /** normal: the day's blocks. game_day: only the pre-game timeline and one button into the Game hub. empty: the next dated event. */
  readonly mode: 'normal' | 'game_day' | 'empty';
  readonly blocks: readonly BlockRow[];
  readonly nextEvent: { readonly date: DateLike; readonly labelKey: string } | null;
  /** E7 budget minus spent, to the minute (O1.2.1 acceptance 2). */
  readonly minutesLeftThisWeek: number;
  readonly energyKey: string | null;
}

export type InboxWeight = 'must' | 'should' | 'note';

export interface InboxRow {
  readonly itemId: number;
  readonly weight: InboxWeight;
  readonly kind: string;
  readonly senderId: number | null;
  readonly senderName: string | null;
  readonly subjectKey: string;
  readonly bodyKey: string;
  readonly params: Readonly<Record<string, string | number | boolean | null>>;
  readonly received: DateLike;
  readonly deadline: DateLike | null;
  /** Command type that answers it; null for a note. */
  readonly answerCommand: string | null;
  /** The default applied if a should item is ignored (shown). */
  readonly defaultCommand: string | null;
  readonly links: readonly string[];
  readonly unread: boolean;
  /** Hours answering costs, shown before the user commits (E7). */
  readonly answerMinutes: number | null;
  /** Items that conflict with this one, each named (O1.2.2 edge case). */
  readonly conflictsWith: readonly number[];
}

export type AdvanceTarget = 'next_block' | 'end_of_day' | 'next_must' | 'game_day';
export const ADVANCE_TARGETS: readonly AdvanceTarget[] = ['next_block', 'end_of_day', 'next_must', 'game_day'];

export interface AdvanceOption {
  readonly target: AdvanceTarget;
  /** Where time would stop; null when the option does not apply (no must item, no game scheduled). */
  readonly to: Moment | null;
  /** Must items whose deadline it would pass: time cannot advance until they are answered (O1.2.2 acceptance 1). */
  readonly blockedBy: readonly number[];
  /** What will run without him and under whose control (O1.2.3). */
  readonly runsWithout: readonly { readonly blockId: string; readonly labelKey: string; readonly date: DateLike; readonly byName: string | null }[];
}

export interface HomeView {
  readonly personId: number;
  readonly today: TodayView;
  readonly inbox: readonly InboxRow[];
  readonly advance: readonly AdvanceOption[];
}
