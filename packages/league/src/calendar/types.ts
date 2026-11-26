// Calendar file shapes (C4.1.1, T3.2.1). A level has one pattern file (rules that place every anchor
// by weekday and offset, used for any year) and dated files that override anchors with real published
// dates. C4.7.1 rule 2: a year with no dated file runs on the pattern alone.
import type { FactStatus } from '@gm/schema';

export type CalendarLevel = 'pro' | 'college';

/** Where a value comes from. Status is copied from the bible leaf or the fact row, never promoted here. */
export interface Provenance {
  readonly status: FactStatus;
  readonly leaf: string;
  readonly source: string;
  /** Fact register row when the value is a league-rules key (G-10). */
  readonly factId?: string;
  readonly note?: string;
}

/**
 * A rule that places one date. Exactly one base form:
 *   date            "YYYY-MM-DD" (dated files only)
 *   md              "MM-DD" in the file year plus yearOffset
 *   month + dayKey  day of month read from a rule key
 *   nth + weekday + month   (nth = -1 is the last), or nthKey in place of nth
 *   from            another anchor id; "next:<id>" is the anchor in the next season's file
 * Then, in order: days (+ daysKey * keySign), weeks (+ weeksKey * keySign) * 7, onOrAfter weekday,
 * nextBusinessDay (Saturday or Sunday moves to Monday).
 */
export interface DateRule {
  readonly date?: string;
  readonly md?: string;
  readonly month?: number;
  readonly dayKey?: string;
  readonly nth?: number;
  readonly nthKey?: string;
  readonly weekday?: string;
  readonly from?: string;
  readonly yearOffset?: number;
  readonly days?: number;
  readonly daysKey?: string;
  readonly weeks?: number;
  readonly weeksKey?: string;
  readonly keySign?: number;
  readonly onOrAfter?: string;
  readonly nextBusinessDay?: boolean;
  /** "HH:MM" Eastern. No time means the whole day (opens at its start, closes at its end). */
  readonly time?: string;
}

export interface Anchor extends Provenance {
  readonly id: string;
  readonly rule: DateRule;
}

export type WindowKind = 'phase' | 'window' | 'deadline' | 'event' | 'cohort';
/** Which clubs a window applies to. */
export type Audience = 'all' | 'new_head_coach' | 'returning_head_coach' | 'postseason';

export interface WindowDef {
  readonly id: string;
  readonly kind: WindowKind;
  readonly label: string;
  readonly leaf: string;
  /** Anchor that opens the window (or the moment of a deadline, event or cohort). */
  readonly opens: string;
  /** Anchor of the last day (inclusive) or the closing moment. Missing for one-moment kinds. */
  readonly closes?: string;
  /** Phase id for kind "phase"; also the phase a deadline belongs to. */
  readonly phase?: string;
  /** Precedence when phases overlap for a club: the highest order active phase is the club's phase. */
  readonly order?: number;
  readonly audience?: Audience;
  /** Phase that starts the day after the club's own last game (pro Season review, C4.6.1). */
  readonly clubExit?: 'review' | 'after_review';
  /** Name of the check run at a deadline (C4.1.1 rule 4). */
  readonly check?: string;
  /** A deadline that stops time when the user's club has an open decision (C4.2.4, C4.4.4). */
  readonly stopsUser?: boolean;
  /** Recruiting period type (T4.2.1) for kind "window" in the recruiting group. */
  readonly period?: 'contact' | 'evaluation' | 'quiet' | 'dead';
  /** Cohort kind (X11.1.1) for kind "cohort". */
  readonly cohort?: string;
  /** Repeat the window: count (or countKey), stepping stepDays; ids get _1.._n. */
  readonly repeat?: { readonly count?: number; readonly countKey?: string; readonly untilAnchor?: string; readonly stepDays: number; readonly lengthDays: number };
}

export interface CalendarFile {
  readonly $comment?: string;
  readonly level: CalendarLevel;
  readonly kind: 'pattern' | 'dated';
  /** Season: pro = the league year that begins in March of this year; college = the season played in the fall of this year. */
  readonly season?: number;
  readonly anchors: readonly Anchor[];
  readonly windows?: readonly WindowDef[];
  /** Window ids of the pattern that this dated year does not have. */
  readonly omit?: readonly string[];
}

/** Rule-key lookup (league-rules files, G-10). Returns undefined when the key is not defined. */
export type RuleLookup = (key: string) => number | undefined;

export interface ResolvedAnchor extends Provenance {
  readonly id: string;
  readonly day: number;
  /** Minutes after midnight Eastern, or undefined for a whole day. */
  readonly minute?: number;
  /** True when the date came from the pattern (no dated value for this year). */
  readonly fromPattern: boolean;
  readonly keysUsed: readonly string[];
}

export interface ResolvedWindow {
  readonly def: WindowDef;
  /** Id after repeat expansion. */
  readonly id: string;
  readonly level: CalendarLevel;
  readonly season: number;
  readonly openDay: number;
  readonly openMinute: number;
  readonly closeDay: number;
  readonly closeMinute: number;
  /** Weakest status among the anchors that place it. */
  readonly status: FactStatus;
  readonly index?: number;
}

export interface ResolvedSeason {
  readonly level: CalendarLevel;
  readonly season: number;
  readonly dated: boolean;
  readonly anchors: ReadonlyMap<string, ResolvedAnchor>;
  readonly windows: readonly ResolvedWindow[];
}
