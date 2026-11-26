// Final plan edits (I1.4) and the carry-over from the night before (I1.1.2): call sheet edits limited to what
// can be done on game day, the decision book, standing instructions and delegation, the heads-up to the
// officials, and the pregame challenge designee. G7 owns the sheet itself; this module checks and records the
// day's edits on the caller's sheet rows.
import { possible } from '@gm/schema';
import { gp } from './params.ts';
import type { GameDayRules } from './rules.ts';

// ---------------------------------------------------------------------------------------------- I1.1.2

export interface OvernightEvent {
  readonly playerId: string;
  readonly kind: 'illness' | 'curfew';
}

export interface CarryOver {
  /** Players now questionable with a workout required (overnight illness). */
  readonly nowQuestionable: readonly string[];
  /** Discipline decisions owed before the report deadline (L3): play, sit for series, or inactive. */
  readonly disciplineOwed: readonly string[];
  /** Plays the quarterback ranked in his bottom group: marked on the sheet. */
  readonly markedPlays: readonly string[];
  /** Whether the night-before meeting happened (no rankings exist when it did not). */
  readonly meetingHeld: boolean;
}

/** I1.1.2: overnight events and the quarterback's rankings carried into game day. */
export function carryOver(events: readonly OvernightEvent[], qbBottomGroup: readonly string[] | null): CarryOver {
  return {
    nowQuestionable: events.filter((e) => e.kind === 'illness').map((e) => e.playerId).sort(),
    disciplineOwed: events.filter((e) => e.kind === 'curfew').map((e) => e.playerId).sort(),
    markedPlays: qbBottomGroup ? [...qbBottomGroup].sort() : [],
    meetingHeld: qbBottomGroup !== null,
  };
}

/** I1.1.2: the quarterback's decision-quality shift (z, J7) on a play he ranked in his bottom group. */
export function bottomRankedPenaltyZ(playId: string, carry: CarryOver): number {
  return carry.markedPlays.includes(playId) ? -gp('carry.bottomRankedPlayZ') : 0;
}

// ---------------------------------------------------------------------------------------------- I1.4.1

export type SheetEdit =
  | { readonly kind: 'cross_off'; readonly playId: string }
  | { readonly kind: 'reorder'; readonly box: string; readonly order: readonly string[] }
  | { readonly kind: 'replace'; readonly playId: string; readonly withPlayId: string }
  | { readonly kind: 'script_order'; readonly order: readonly string[] }
  | { readonly kind: 'reminder'; readonly text: string }
  | { readonly kind: 'swap_variant'; readonly variant: string }
  | { readonly kind: 'reprint_wristband' };

export type SheetEditProblem = 'not_installed' | 'new_design' | 'reorder_changes_contents' | 'unknown_variant';

export interface SheetContext {
  /** Installed play ids (G5): nothing else may enter the sheet (I1.4.1 rule). */
  readonly installed: ReadonlySet<string>;
  /** Plays practised this week; a replacement outside it carries lower readiness (D9). */
  readonly practisedThisWeek: ReadonlySet<string>;
  readonly boxes: Readonly<Record<string, readonly string[]>>;
  readonly variants: readonly string[];
}

/** I1.4.1: cost in minutes of one edit (1 per edit, 5 to swap a variant or reprint a wristband). */
export function sheetEditCost(e: SheetEdit): number {
  if (e.kind === 'swap_variant') return gp('cost.sheetVariant');
  if (e.kind === 'reprint_wristband') return gp('cost.wristbandReprint');
  return gp('cost.sheetEdit');
}

/** I1.4.1: only installed plays enter; a reorder keeps the box's contents; a variant must exist. */
export function checkSheetEdit(e: SheetEdit, ctx: SheetContext): SheetEditProblem[] {
  if (e.kind === 'replace') return ctx.installed.has(e.withPlayId) ? [] : ['not_installed'];
  if (e.kind === 'reorder') {
    const box = ctx.boxes[e.box] ?? [];
    const same = box.length === e.order.length && [...box].sort().join('|') === [...e.order].sort().join('|');
    return same ? [] : ['reorder_changes_contents'];
  }
  if (e.kind === 'swap_variant') return ctx.variants.includes(e.variant) ? [] : ['unknown_variant'];
  return [];
}

/** I1.4.1: a replacement play not practised this week starts with no weekly readiness gain (D9 reads the flag). */
export function replacementUnpractised(e: SheetEdit, ctx: SheetContext): boolean {
  return e.kind === 'replace' && !ctx.practisedThisWeek.has(e.withPlayId);
}

/**
 * I1.4.1 edge case: a printed wristband keeps its old number-to-play map until reprinted. Returns the play a
 * wristband number calls: the original unless a reprint came after the replacement.
 */
export function wristbandPlay(originalPlay: string, edits: readonly SheetEdit[]): string {
  let printed = originalPlay, current = originalPlay;
  for (const e of edits) {
    if (e.kind === 'replace' && e.playId === current) current = e.withPlayId;
    if (e.kind === 'reprint_wristband') printed = current;
  }
  return printed;
}

// ---------------------------------------------------------------------------------------------- I1.4.2

export type BookChoice = 'go' | 'kick' | 'punt';

/** One cell's win probabilities (0 to 1) by choice, from N2 with the staff's estimates. Absent means not an option. */
export type CellWp = Partial<Readonly<Record<BookChoice, number>>>;

export interface BookCell {
  readonly choice: BookChoice;
  readonly close: boolean;
  /** Difference in win probability between the best and second-best choices, percentage points. */
  readonly marginPp: number;
}

/**
 * I1.4.2: the analyst's choice per cell is the best win probability; a cell is "close" under 1 point. The
 * variance slider (0 to 1) moves close cells toward go: go is taken when it trails the best by no more than the
 * slider times `book.varianceShiftPp`.
 */
export function bookCell(wp: CellWp, variance = 0): BookCell {
  const opts = (Object.entries(wp) as [BookChoice, number][]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (opts.length === 0) throw new Error('decision book cell with no options');
  const [best, second] = opts;
  const marginPp = second ? (best![1] - second[1]) * 100 : Infinity;
  const close = marginPp < gp('book.closePp');
  let choice = best![0];
  const go = wp.go;
  if (close && go !== undefined && choice !== 'go' && (best![1] - go) * 100 <= variance * gp('book.varianceShiftPp')) choice = 'go';
  return { choice, close, marginPp };
}

/** I1.4.2: build a book from a grid of cells keyed `<yardLine>:<distance>` (or any key the caller uses). */
export function buildBook(cells: Readonly<Record<string, CellWp>>, variance = 0): Record<string, BookCell> {
  const out: Record<string, BookCell> = {};
  for (const k of Object.keys(cells).sort()) out[k] = bookCell(cells[k]!, variance);
  return out;
}

/** Cells whose choice differs between two books (a kicking line move recomputes these, I1.4.2 acceptance). */
export function changedCells(a: Readonly<Record<string, BookCell>>, b: Readonly<Record<string, BookCell>>): string[] {
  return Object.keys(a).filter((k) => b[k] !== undefined && a[k]!.choice !== b[k]!.choice).sort();
}

// ---------------------------------------------------------------------------------------------- I1.4.3

export type Caller = 'user' | string;

export interface StandingInstruction {
  readonly id: string;
  /** Menu rule id (for example 'go_4th_1_past_40'); the condition and action are the menu's. */
  readonly rule: string;
  /** Instructions that share a conflict key and disagree conflict (I1.4.3 edge case). */
  readonly conflictKey?: string;
  readonly action: string;
}

export interface DayDelegation {
  readonly offense: Caller;
  readonly defense: Caller;
  readonly special: Caller;
  readonly qbFreedom: 'none' | 'limited' | 'full';
  /** In priority order: the higher one wins a conflict. */
  readonly instructions: readonly StandingInstruction[];
}

/** I1.4.3: add an instruction; refuses past the cap and reports any conflict it creates. */
export function addInstruction(d: DayDelegation, i: StandingInstruction): { ok: boolean; delegation: DayDelegation; conflictsWith: string[] } {
  if (d.instructions.length >= gp('instructions.max')) return { ok: false, delegation: d, conflictsWith: [] };
  const conflictsWith = i.conflictKey === undefined ? [] : d.instructions.filter((x) => x.conflictKey === i.conflictKey && x.action !== i.action).map((x) => x.id);
  return { ok: true, delegation: { ...d, instructions: [...d.instructions, i] }, conflictsWith };
}

/** I1.4.3: the chance per applicable snap that a coordinator misses one rule: 2% for each beyond 8. */
export function instructionMissChance(active: number): number {
  const extra = active - gp('instructions.free');
  return possible(extra > 0 ? extra * gp('instructions.missPerExtra') : 0);
}

/** I1.4.3 edge case: among instructions that apply to a situation, the one highest in the list wins. */
export function winningInstruction(d: DayDelegation, applies: (i: StandingInstruction) => boolean): StandingInstruction | null {
  return d.instructions.find(applies) ?? null;
}

// ---------------------------------------------------------------------------------------------- I1.4.4

/** I1.4.4: the wrong-flag chance on a legal unusual play, halved when the crew was alerted. Illegal plays unaffected. */
export function wrongFlagChance(base: number, legal: boolean, alerted: boolean): number {
  return legal && alerted ? base * gp('crew.alertFactor') : base;
}

// ---------------------------------------------------------------------------------------------- I1.4.5

export interface ChallengeDesignee {
  readonly staffId: string | null;
}

/** I1.4.5: may this person throw the challenge flag? The head coach always; the designee only when the rule allows and he is on the sideline. */
export function mayThrowChallenge(who: string, headCoachId: string, d: ChallengeDesignee, rules: GameDayRules, onSideline: readonly string[]): boolean {
  if (who === headCoachId) return true;
  return rules.challengeDesigneeAllowed && d.staffId === who && onSideline.includes(who);
}

/** I1.4.5: a designee must be on the sideline staff board (I11.1.1); none is always allowed. */
export function checkDesignee(d: ChallengeDesignee, rules: GameDayRules, sidelineStaff: readonly string[]): 'ok' | 'rule_off' | 'not_on_sideline' {
  if (d.staffId === null) return 'ok';
  if (!rules.challengeDesigneeAllowed) return 'rule_off';
  return sidelineStaff.includes(d.staffId) ? 'ok' : 'not_on_sideline';
}
