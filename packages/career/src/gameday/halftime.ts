// Halftime (I8.2): the working minutes after fixed overhead (I8.2.1), the staff phase then the player phase
// with the user in one room (I8.2.2), second-half openers (I8.2.3), and the quick updates of kicking lines, the
// decision book and sheet marks (I8.2.4). The adjustment menu and its costs are I8.1.2's, with the halftime
// limits; uptake per player is I8.1.4's; the record and its three grades are I8.3.1's.
import { gp } from './params.ts';
import { clamp } from './math.ts';

// ---------------------------------------------------------------------------------------------- I8.2.1

/**
 * Working minutes = halftime length minus walk off, walk back and warm-up, and the personal and medical block.
 * A weather delay at halftime adds working time (I11.5.2). Never negative.
 */
export function halftimeWorkingMinutes(halftimeMin: number, delayMin = 0): number {
  const w = halftimeMin + delayMin - gp('half.walkOffMin') - gp('half.returnMin') - gp('half.personalMin');
  return w < 0 ? 0 : w;
}

// ---------------------------------------------------------------------------------------------- I8.1.2 menu

export type Unit = 'offense' | 'defense' | 'special';
export type AdjustmentKind = 'technique' | 'protection' | 'matchup' | 'coverage' | 'sheet_mark' | 'alert' | 'new_call';

const STRUCTURAL: ReadonlySet<AdjustmentKind> = new Set(['protection', 'matchup', 'coverage']);
export const isStructural = (k: AdjustmentKind): boolean => STRUCTURAL.has(k);

/** I8.1.2: minute cost of one menu item. */
export function menuCost(k: AdjustmentKind): number {
  const key: Record<AdjustmentKind, string> = {
    technique: 'menu.technique', protection: 'menu.protection', matchup: 'menu.matchup', coverage: 'menu.coverage',
    sheet_mark: 'menu.sheetMark', alert: 'menu.alert', new_call: 'menu.newCall',
  };
  return gp(key[k]);
}

export interface Adjustment {
  readonly id: string;
  readonly unit: Unit;
  readonly kind: AdjustmentKind;
  /** The installed object it selects or re-points (G1, G2): a rule, tag, call or player. Never a new design. */
  readonly target: string;
  /** The problem it answers (I8.1.3), as the staff cited it. */
  readonly citedProblem: string;
  /** Players it affects (for uptake); empty for sheet marks, which are not taught (I8.1.2). */
  readonly players: readonly string[];
  readonly chosenBy: string;
}

// ---------------------------------------------------------------------------------------------- I8.2.2

export type HalftimeItem =
  | { readonly kind: 'adjustment'; readonly adjustment: Adjustment }
  | { readonly kind: 'send_back'; readonly unit: Unit }
  | { readonly kind: 'team_talk' }
  | { readonly kind: 'openers'; readonly unit: Unit }
  | { readonly kind: 'kicking_lines' }
  | { readonly kind: 'decision_book' }
  | { readonly kind: 'quick_sheet_marks'; readonly unit: Unit };

export interface HalftimeSession {
  readonly workingMin: number;
  readonly staffMin: number;
  readonly playerMin: number;
  readonly staffUsed: number;
  readonly playerUsed: number;
  /** The side whose staff huddle the user sits in (I8.2.2); the other side runs at its coordinator's level. */
  readonly attending: Unit;
  readonly items: readonly HalftimeItem[];
  readonly sentBack: readonly Unit[];
}

export type HalftimeRefusal = 'no_time' | 'structural_limit' | 'new_call_limit' | 'already_sent_back' | 'not_attending' | 'bad_split';

/** I8.2.2: open the session with the starting split (3 staff, rest players); the user can shift it. */
export function openHalftime(workingMin: number, attending: Unit, staffMin = gp('half.staffPhaseMin')): HalftimeSession | HalftimeRefusal {
  if (staffMin < 0 || staffMin > workingMin) return 'bad_split';
  return { workingMin, staffMin, playerMin: workingMin - staffMin, staffUsed: 0, playerUsed: 0, attending, items: [], sentBack: [] };
}

function itemPhaseCost(i: HalftimeItem): { phase: 'staff' | 'player'; min: number } {
  switch (i.kind) {
    case 'adjustment': return { phase: i.adjustment.kind === 'sheet_mark' ? 'staff' : 'player', min: menuCost(i.adjustment.kind) };
    case 'send_back': return { phase: 'staff', min: gp('half.sendBackMin') };
    case 'team_talk': return { phase: 'player', min: gp('half.teamTalkMin') };
    case 'openers': return { phase: 'staff', min: gp('half.openersMin') };
    case 'kicking_lines': case 'decision_book': case 'quick_sheet_marks': return { phase: 'staff', min: gp('half.quickItemMin') };
  }
}

const EPS = 1e-9;

/**
 * I8.2.2: add an item. The phase budgets are hard (acceptance: total never exceeds the phase). At halftime a unit
 * takes up to three structural changes and one new call. Sending the other side's plan back is allowed once
 * per side and costs a minute; it is the only way to touch a side the user is not sitting with.
 */
export function addHalftimeItem(s: HalftimeSession, i: HalftimeItem): HalftimeSession | HalftimeRefusal {
  const { phase, min } = itemPhaseCost(i);
  if (i.kind === 'send_back') {
    if (i.unit === s.attending) return 'not_attending';
    if (s.sentBack.includes(i.unit)) return 'already_sent_back';
  }
  if (i.kind === 'adjustment') {
    const a = i.adjustment;
    const same = s.items.filter((x): x is Extract<HalftimeItem, { kind: 'adjustment' }> => x.kind === 'adjustment' && x.adjustment.unit === a.unit);
    if (isStructural(a.kind) && same.filter((x) => isStructural(x.adjustment.kind)).length >= gp('half.structuralPerUnit')) return 'structural_limit';
    if (a.kind === 'new_call' && same.filter((x) => x.adjustment.kind === 'new_call').length >= gp('half.newCallsPerUnit')) return 'new_call_limit';
  }
  if (phase === 'staff' && s.staffUsed + min > s.staffMin + EPS) return 'no_time';
  if (phase === 'player' && s.playerUsed + min > s.playerMin + EPS) return 'no_time';
  return {
    ...s,
    staffUsed: phase === 'staff' ? s.staffUsed + min : s.staffUsed,
    playerUsed: phase === 'player' ? s.playerUsed + min : s.playerUsed,
    items: [...s.items, i],
    sentBack: i.kind === 'send_back' ? [...s.sentBack, i.unit] : s.sentBack,
  };
}

/** Minutes left in each phase. */
export function halftimeLeft(s: HalftimeSession): { staff: number; player: number } {
  return { staff: s.staffMin - s.staffUsed, player: s.playerMin - s.playerUsed };
}

/** Who decides each side: the user where he sits; the coordinator (AI at his level) elsewhere. */
export function halftimeDecider(s: HalftimeSession, unit: Unit, coordinators: Readonly<Record<Unit, string>>): string {
  return unit === s.attending ? 'user' : coordinators[unit];
}

// ---------------------------------------------------------------------------------------------- I8.2.3

export interface Opener {
  readonly callId: string;
  readonly watchingFor?: string;
  /** Adjustment ids the call depends on (its uptake carries over). */
  readonly dependsOn?: readonly string[];
}

export interface OpenerScript {
  readonly unit: Unit;
  readonly calls: readonly Opener[];
  /** Index of the next scripted call; advances only when a scripted call is used. */
  readonly next: number;
}

/** I8.2.3: three to six calls from the sheet, in order. */
export function makeOpeners(unit: Unit, calls: readonly Opener[], onSheet: ReadonlySet<string>): OpenerScript | 'count' | 'not_on_sheet' {
  if (calls.length < gp('half.openersFewest') || calls.length > gp('half.openersMost')) return 'count';
  if (calls.some((c) => !onSheet.has(c.callId))) return 'not_on_sheet';
  return { unit, calls, next: 0 };
}

/** The suggested call now, or null when the script is spent. */
export function suggestedOpener(s: OpenerScript): Opener | null {
  return s.calls[s.next] ?? null;
}

/** A call was used: the script advances only when it is the scripted one (acceptance); the user may leave it at any time. */
export function useCall(s: OpenerScript, callId: string): OpenerScript {
  return s.calls[s.next]?.callId === callId ? { ...s, next: s.next + 1 } : s;
}

// ---------------------------------------------------------------------------------------------- I8.2.4

export type SheetMark = 'cross_off' | 'star' | 'none';

/** I8.2.4: a crossed-off call is dimmed and needs a second key; marks never delete a call. */
export function keysToCall(mark: SheetMark): 1 | 2 {
  return mark === 'cross_off' ? 2 : 1;
}

// ---------------------------------------------------------------------------------------------- I8.1.4 uptake

export type UptakeStart = 'contingency' | 'repoint' | 'unpractised';

export type Teacher =
  | { readonly kind: 'ai'; readonly teaching: number }
  | { readonly kind: 'user'; readonly methodFits: boolean; readonly namesTrueCause: boolean };

export interface UptakeInput {
  readonly start: UptakeStart;
  /** D9 knowledge (z) of the rule this week (with the weekly gain) and long term. */
  readonly weeklyKnowledge: number;
  readonly longTermKnowledge: number;
  readonly teacher: Teacher;
  readonly sawPictures: boolean;
  /** Structural changes taught to this unit in the same meeting, and the limit for that meeting. */
  readonly structuralInMeeting: number;
  readonly structuralLimit: number;
  /** 'before': the meeting was cut short before this item (not delivered); 'after': after it, before the next. */
  readonly cut: 'none' | 'before' | 'after';
  /** Later series in which the change has been used. */
  readonly seriesUsed: number;
  readonly roadCrowdNoise: boolean;
  /** False when the player was not at the meeting (with the trainer, or a substitute who came in later). */
  readonly heardIt: boolean;
  /**
   * The player's respect for the head coach's football knowledge, 0 to 100 (L1.1.1), when the change is the head
   * coach's. Omitted: no term (a coordinator's own change, or a caller that does not track relationships).
   */
  readonly respect?: number;
}

/** Zero uptake: the item never reached the player. */
export const NOT_DELIVERED = Number.NEGATIVE_INFINITY;

/**
 * I8.1.4: the day-only knowledge value J4 uses for this player and this adjustment. Starts from what he knew of
 * the thing, then the table's terms. Each later series adds a little, up to a practised contingency's start.
 * Returns NOT_DELIVERED when he did not hear it or the meeting was cut before it.
 */
export function uptake(i: UptakeInput): number {
  if (!i.heardIt || i.cut === 'before') return NOT_DELIVERED;
  let v = i.start === 'contingency' ? i.weeklyKnowledge : i.start === 'repoint' ? i.longTermKnowledge + gp('uptake.repoint') : i.longTermKnowledge;
  if (i.teacher.kind === 'ai') v += gp('uptake.teacherSpan') * (clamp(i.teacher.teaching, 0, 1) - 0.5) * 2;
  else {
    v += i.teacher.methodFits ? gp('uptake.userFit') : gp('uptake.userMisfit');
    if (i.teacher.namesTrueCause) v += gp('uptake.trueCause');
  }
  if (i.sawPictures) v += gp('uptake.pictures');
  if (i.respect !== undefined) v += gp('uptake.respectSpan') * (clamp(i.respect, 0, 100) - 50) / 50;
  const over = i.structuralInMeeting - i.structuralLimit;
  if (over > 0) v += over * gp('uptake.extraStructural');
  if (i.cut === 'after') v += gp('uptake.cutAfter');
  if (i.roadCrowdNoise) v += gp('uptake.crowdNoise');
  const gained = v + i.seriesUsed * gp('uptake.perSeries');
  const ceiling = i.weeklyKnowledge > v ? i.weeklyKnowledge : v;
  return gained > ceiling ? ceiling : gained;
}

export type UptakeWord = 'solid' | 'shaky' | 'risky' | 'not_told';

/** I8.1.4: the teaching coach's word for his estimate against the player's base-rule knowledge. */
export function uptakeWord(estimate: number, baseRuleKnowledge: number): UptakeWord {
  if (estimate === NOT_DELIVERED) return 'not_told';
  const d = estimate - baseRuleKnowledge;
  return d >= gp('uptake.solidWithin') ? 'solid' : d >= gp('uptake.shakyWithin') ? 'shaky' : 'risky';
}

// ---------------------------------------------------------------------------------------------- I8.3.1 record

export type Grade3 = 'yes' | 'partly' | 'no';

export interface AdjustmentTruth {
  /** Causes the engine tagged on plays in the evidence the staff looked at. */
  readonly taggedCauses: readonly string[];
  /** Symptoms of each tagged cause: a cited symptom grades "partly". */
  readonly symptomsOf: Readonly<Record<string, readonly string[]>>;
  /** The object each tagged cause is about (rule, player or formation). */
  readonly causeObject: Readonly<Record<string, string>>;
  /** Later snaps where the adjustment applied, and those where every affected player carried it out (no J4 error). */
  readonly appliedSnaps: number;
  readonly executedSnaps: number;
}

export interface AdjustmentGrades {
  readonly problemReal: Grade3;
  readonly fixAddressed: 'yes' | 'no';
  /** Share executed, or null when never used (stored as untested, edge case). */
  readonly executedShare: number | null;
  readonly executed: boolean | null;
}

/** I8.3.1 truth grades (N4 and the coaching school only). */
export function gradeAdjustment(a: Adjustment, t: AdjustmentTruth): AdjustmentGrades {
  const real = t.taggedCauses.includes(a.citedProblem);
  const symptom = !real && t.taggedCauses.some((c) => (t.symptomsOf[c] ?? []).includes(a.citedProblem));
  const problemReal: Grade3 = real ? 'yes' : symptom ? 'partly' : 'no';
  const fixAddressed = problemReal !== 'no' && t.taggedCauses.some((c) => t.causeObject[c] === a.target) ? 'yes' : 'no';
  const executedShare = t.appliedSnaps > 0 ? t.executedSnaps / t.appliedSnaps : null;
  return { problemReal, fixAddressed, executedShare, executed: executedShare === null ? null : executedShare >= gp('adjust.executedCut') };
}

export interface PlaySample { readonly plays: number; readonly successes: number; readonly yards: number }

export interface VisibleResult {
  readonly before: { readonly plays: number; readonly successRate: number | null; readonly yardsPerPlay: number | null };
  readonly after: { readonly plays: number; readonly successRate: number | null; readonly yardsPerPlay: number | null };
}

/** I8.3.1 visible results: rates with counts; under five plays after, counts only and no verdict. */
export function visibleResult(before: PlaySample, after: PlaySample): VisibleResult {
  const rates = (s: PlaySample, show: boolean) => ({
    plays: s.plays,
    successRate: show && s.plays > 0 ? s.successes / s.plays : null,
    yardsPerPlay: show && s.plays > 0 ? s.yards / s.plays : null,
  });
  const show = after.plays >= gp('adjust.minPlaysForRates');
  return { before: rates(before, show), after: rates(after, show) };
}

export interface AdjustmentRow {
  readonly adjustment: Adjustment;
  readonly when: string;
  readonly evidence: readonly string[];
  readonly uptake: Readonly<Record<string, UptakeWord>>;
  readonly visible: VisibleResult;
  /** The staff's film verdict (N1.3.2, can be wrong); shown in a career. */
  readonly staffVerdict: AdjustmentGrades | null;
  /** Truth grades: N4, L4 and the coaching school only (audit Part 17). */
  readonly truth: AdjustmentGrades;
}

/** I8.3.1: one row per day-only edit (acceptance). */
export function adjustmentRow(a: Adjustment, when: string, evidence: readonly string[], words: Readonly<Record<string, UptakeWord>>, before: PlaySample, after: PlaySample, truth: AdjustmentTruth, staffVerdict: AdjustmentGrades | null = null): AdjustmentRow {
  return { adjustment: a, when, evidence, uptake: words, visible: visibleResult(before, after), staffVerdict, truth: gradeAdjustment(a, truth) };
}
