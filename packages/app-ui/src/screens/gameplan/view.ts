// The parts of the game plan read model (app-services read-models/gameplan) these screens show, and the
// intents they send back. Declared here because app-ui imports only the app-services entry point, which
// re-exports the read model once the integrator adds its barrel line (CR-G68-S3). Shapes match the read
// model field for field; readiness is always the staff's estimate (MA-48).
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const gpTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function gt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export interface GameplanLock { readonly allowed: boolean; readonly heldBy: string | null; readonly suggest: boolean }

export interface GameplanWarning { readonly leaf: string; readonly code: string; readonly subject: string; readonly text: string; readonly severity: 'warning' | 'note' }

/** O3.4.1 left column: a scouted look in a situation bucket with its rate and sample size. */
export interface LookRow {
  readonly bucket: string; readonly look: string; readonly count: number; readonly n: number;
  /** Rate and its 80% range; null under the counts-only line (G6.1.1). */
  readonly rate: number | null; readonly lo: number | null; readonly hi: number | null;
}

/** O3.4.1 middle column: one plan entry under a situation. */
export interface PlanEntryRow {
  readonly entryId: string; readonly playId: string; readonly call: string;
  /** Staff estimate of readiness at kickoff, 0 to 1; null when the staff has none. */
  readonly readinessEstimate: number | null;
  readonly repsAssigned: number; readonly targetReps: number;
  readonly isNew: boolean;
  /** The play is missing from the book or retired. */
  readonly broken: boolean;
}
export interface PlanSituation { readonly id: string; readonly label: string; readonly entries: readonly PlanEntryRow[] }

/** O3.4.1 right column: a book play that fits the selected situation. */
export interface BookRow { readonly playId: string; readonly call: string; readonly section: string; readonly status: string; readonly inPlan: boolean }

export interface PlanSummary {
  /** Unique plan entries (an entry listed under two situations counts once). */
  readonly total: number;
  readonly newThisWeek: number;
  readonly unitsUsed: number; readonly capacity: number;
  readonly repsAssigned: number; readonly repsAvailable: number;
  readonly runPass: { readonly run: number; readonly pass: number; readonly other: number };
}

export type MatchupRuleKind = 'target' | 'avoid' | 'double';
/** O3.4.1 matchup table: "our X against their Y: target, avoid, or double". */
export interface MatchupRuleRow { readonly id: string; readonly ours: string; readonly theirs: string; readonly rule: MatchupRuleKind }

export interface ApprovalView { readonly state: 'draft' | 'submitted' | 'approved' | 'sent_back'; readonly at: number | null; readonly by: string | null; readonly notes: string | null }

/** A delegated draft plan (K6): shown as a proposal, changes nothing until accepted (O3.4.1 acceptance). */
export interface ProposalView { readonly id: string; readonly from: string; readonly entries: number; readonly added: readonly string[]; readonly removed: readonly string[] }

export interface PlanView {
  readonly looks: readonly LookRow[];
  readonly looksStale: boolean;
  readonly callerChanged: boolean;
  readonly situations: readonly PlanSituation[];
  readonly selected: string | null;
  readonly book: readonly BookRow[];
  readonly summary: PlanSummary;
  readonly matchups: readonly MatchupRuleRow[];
  readonly approval: ApprovalView;
  readonly proposal: ProposalView | null;
  readonly warnings: readonly GameplanWarning[];
}

export interface SheetEntryRow {
  readonly id: string; readonly call: string; readonly playId: string;
  /** Key path on the console, for example "Q1" (I2.6.3). */
  readonly key: string;
  readonly readinessEstimate: number | null;
  /** Times called this season in this box's situation (N3 call records). */
  readonly timesCalled: number;
  readonly notInPlan: boolean; readonly broken: boolean; readonly overLimit: boolean;
  readonly note: string | null; readonly rank: number | null;
  readonly bandNumber: string | null;
}
export interface SheetBoxRow {
  readonly id: string; readonly title: string; readonly side: 0 | 1; readonly col: number; readonly row: number; readonly w: number; readonly h: number;
  readonly situationId: string | null; readonly category: string | null; readonly colour: string; readonly key: string;
  readonly priority: number;
  /** G7.2.3 expected snaps for the box's situation, its table source and game count; null without a table or situation. */
  readonly expectedSnaps: number | null; readonly expectedSource: string | null; readonly expectedGames: number | null;
  readonly depthMark: 'deep' | 'thin' | null;
  readonly entries: readonly SheetEntryRow[];
}
export interface CoverageCell { readonly down: number; readonly distance: string; readonly zone: string; readonly boxId: string | null }
export interface CatalogueRowView { readonly id: string; readonly label: string; readonly status: 'has_box' | 'covered' | 'partly' | 'missing'; readonly tier: number; readonly expectedSnaps: number | null; readonly severity: 'warning' | 'note' | 'info' | null }
export interface ScriptRow { readonly id: string; readonly call: string; readonly purpose: string; readonly purposeText: string | null; readonly watchingFor: string | null }

export interface SheetView {
  readonly unit: string; readonly gameId: string; readonly version: number; readonly lockedAt: number | null;
  readonly page: { readonly orientation: 'landscape' | 'portrait'; readonly cols: number; readonly rows: number };
  readonly situations: readonly { readonly id: string; readonly label: string }[];
  readonly boxes: readonly SheetBoxRow[];
  readonly layoutProblems: readonly { readonly kind: 'overlap' | 'outside'; readonly boxes: readonly string[] }[];
  readonly coverage: readonly CoverageCell[];
  readonly unmatchedStates: number; readonly shadowedStates: number;
  readonly catalogue: readonly CatalogueRowView[];
  readonly density: { readonly entriesBySide: readonly number[]; readonly bandBySide: readonly string[]; readonly smallestTextPt: number; readonly overflow: readonly string[] };
  readonly size: { readonly unique: number; readonly repsAvailable: number; readonly overReps: boolean };
  readonly tooLongKeys: readonly string[];
  readonly warnings: readonly GameplanWarning[];
}

export interface ScriptView {
  readonly mode: string;
  readonly opening: readonly ScriptRow[];
  readonly secondHalf: readonly ScriptRow[];
  readonly variety: { readonly personnel: Readonly<Record<string, number>>; readonly formation: Readonly<Record<string, number>>; readonly runPass: Readonly<Record<string, number>>; readonly direction: Readonly<Record<string, number>> };
  readonly reveals: readonly string[];
  readonly mustCalls: readonly { readonly id: string; readonly call: string; readonly target: string }[];
  readonly notes: readonly { readonly id: string; readonly boxId: string | null; readonly kind: string; readonly text: string }[];
  readonly warnings: readonly GameplanWarning[];
}

export interface WristbandView {
  readonly cells: readonly { readonly label: string; readonly call: string }[];
  readonly problems: readonly string[];
  readonly audibles: readonly { readonly name: string; readonly call: string }[];
  readonly relay: string; readonly qbFreedom: string;
  readonly warnings: readonly GameplanWarning[];
}

export interface CardView {
  readonly fourth: readonly { readonly distanceYd: number; readonly yardsToGoalYd: number; readonly call: string; readonly edited: boolean }[];
  readonly twoPoint: readonly { readonly scoreDiff: number; readonly goForTwo: boolean; readonly edited: boolean }[];
  readonly kneel: readonly { readonly opponentTimeouts: number; readonly kneels: number; readonly secondsKilled: number }[];
  readonly fieldGoalLine: { readonly withWind: number | null; readonly intoWind: number | null };
  readonly inBoundsPlayS: number;
  readonly timeoutRules: readonly string[];
  readonly crewTendencies: readonly string[];
  readonly trickHistory: readonly string[];
  readonly depthCard: readonly string[];
  readonly standingInstructions: readonly string[];
  readonly edits: readonly { readonly block: string; readonly cell: string; readonly from: string; readonly to: string; readonly at: number }[];
  readonly stale: readonly string[];
}

export interface ReviewView {
  readonly items: readonly { readonly code: string; readonly subject: string; readonly text: string; readonly blocks: boolean }[];
  readonly canLock: boolean;
  readonly locked: boolean;
}

export interface PrintView {
  readonly paper: 'letter' | 'legal' | 'tabloid';
  readonly keyHints: boolean;
  readonly widthIn: number; readonly heightIn: number;
  readonly boxes: readonly { readonly id: string; readonly side: 0 | 1; readonly xIn: number; readonly yIn: number; readonly wIn: number; readonly hIn: number; readonly textPt: number; readonly lines: readonly string[]; readonly overflow: boolean }[];
  readonly overflow: number;
}

export interface GameplanView {
  readonly teamId: number;
  readonly unit: 'offense' | 'defense' | 'special_teams';
  /** `card` is the head coach's alone (G7 career rung: the head coach card belongs to the head coach). */
  readonly locks: { readonly build: GameplanLock; readonly approve: GameplanLock; readonly card: GameplanLock };
  readonly plan: PlanView;
  readonly sheet: SheetView;
  readonly script: ScriptView;
  readonly wristband: WristbandView;
  readonly card: CardView | null;
  readonly review: ReviewView;
  readonly print: PrintView;
}

/** What the screens ask the host to do. The host turns each into an app-services gameplan command, which
 * checks the user's job first; the screens send the same intent from a locked control and show the refusal. */
export type GameplanIntent =
  | { kind: 'add_to_plan'; playId: string; situationId: string }
  | { kind: 'remove_from_plan'; entryId: string }
  | { kind: 'set_matchup'; rule: MatchupRuleRow }
  | { kind: 'remove_matchup'; id: string }
  | { kind: 'submit_plan' } | { kind: 'approve_plan' } | { kind: 'send_back_plan'; notes: string }
  | { kind: 'accept_proposal' } | { kind: 'reject_proposal' }
  | { kind: 'add_entry'; boxId: string; playId: string }
  | { kind: 'remove_entry'; boxId: string; entryId: string }
  | { kind: 'move_entry'; boxId: string; entryId: string; by: -1 | 1 }
  | { kind: 'remove_box'; boxId: string }
  | { kind: 'edit_fourth'; distanceYd: number; yardsToGoalYd: number; call: 'go' | 'field_goal' | 'punt' }
  | { kind: 'edit_two_point'; scoreDiff: number; goForTwo: boolean }
  | { kind: 'refresh_card_block'; block: string }
  | { kind: 'fill_band' }
  | { kind: 'lock_sheet' }
  | { kind: 'export_sheet' }
  | { kind: 'print'; paper: PrintView['paper']; keyHints: boolean };

export const PLAN_TABS = ['plan', 'matchups', 'review'] as const;
export type PlanTab = (typeof PLAN_TABS)[number];
export const SHEET_TABS = ['layout', 'coverage', 'script', 'wristband', 'card', 'review', 'print'] as const;
export type SheetTab = (typeof SHEET_TABS)[number];
export const UNITS = ['offense', 'defense', 'special_teams'] as const;
export type Unit = (typeof UNITS)[number];
export const PAPERS = ['letter', 'legal', 'tabloid'] as const;

/** A readiness estimate as the staff states it: a percentage, or "no estimate". */
export function readinessText(x: number | null): string {
  return x === null ? gt('gp.noEstimate') : `${Math.round(x * 100)}%`;
}
/** A scouted look: always the raw count and sample, with the rate and range only above the counts-only line (G6.1.1). */
export function lookText(l: LookRow): string {
  const counts = gt('gp.look.counts', { count: l.count, n: l.n });
  if (l.rate === null) return counts;
  return gt('gp.look.rate', { counts, rate: Math.round(l.rate * 100), lo: Math.round((l.lo ?? 0) * 100), hi: Math.round((l.hi ?? 0) * 100) });
}
