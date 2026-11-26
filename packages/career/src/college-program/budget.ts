// T9.2.1 the football budget. The AD sets the total; the head coach moves money only between the lines
// he controls. The sum of lines never exceeds the total, and changing a line changes the input of the
// system that reads it (T4 travel, T9.4 and T9.6 staff, T5.3/T8.3 tutoring, T8.1 nutrition, T7).
import type { RandomStream } from '@gm/schema';
import { P } from './params.ts';
import { BUDGET_LINES, COACH_CONTROLLED, type Budget, type BudgetLine, type ProgramTier, type StaffSeat } from './types.ts';

const CENTS = 100;
type SplitLine = Exclude<BudgetLine, 'roster_money'>;
const SPLIT: readonly SplitLine[] = BUDGET_LINES.filter((l): l is SplitLine => l !== 'roster_money');

export function lineShare(line: SplitLine): number { return P(`budget.share.${line}`); }

/** Sum of the non-roster line shares (must be 1; checked in tests). */
export function shareSum(): number { return SPLIT.reduce((s, l) => s + lineShare(l), 0); }

export function lineSum(b: Budget): number {
  return BUDGET_LINES.reduce((s, l) => s + b.lines[l], 0);
}

/** Split a total into lines by share; rounding remainder goes to facilities so the sum is exact. */
function split(totalCents: number, rosterMoneyCents: number): Record<BudgetLine, number> {
  const rest = totalCents - rosterMoneyCents;
  const lines = Object.fromEntries(BUDGET_LINES.map((l) => [l, 0])) as Record<BudgetLine, number>;
  let used = 0;
  for (const l of SPLIT) { lines[l] = Math.floor(rest * lineShare(l)); used += lines[l]; }
  lines.facilities_projects += rest - used;
  lines.roster_money = rosterMoneyCents;
  return lines;
}

/**
 * Opening budget for a program (T9.2.1 rule 1): the staff pool is drawn inside its tier band (rule 3),
 * the total follows from the staff pool share, and the roster money pool is T7's figure passed in.
 */
export function openingBudget(tier: ProgramTier, year: number, rosterMoneyCents: number, rng: RandomStream): Budget {
  const lo = P(`budget.staff_pool_min_usd.${tier}`);
  const hi = P(`budget.staff_pool_max_usd.${tier}`);
  const pool = Math.round((lo + (hi - lo) * rng.uniform()) * CENTS);
  const total = Math.round(pool / lineShare('staff_pool')) + rosterMoneyCents;
  return { year, totalCents: total, lines: split(total, rosterMoneyCents), seatsFrozen: false };
}

export interface YearInputs {
  readonly winsAboveExpectation: number;
  readonly games: number;
  /** Booster giving this year over last year, minus 1 (0.1 = ten percent more). */
  readonly givingChange: number;
  readonly rosterMoneyCents: number;
}

/** Next year's total (T9.2.1 rule 1: moves with results and booster giving), capped per year. */
export function nextYearBudget(b: Budget, y: YearInputs): Budget {
  const prevRest = b.totalCents - b.lines.roster_money;
  const resultMove = y.games > 0 ? P('budget.results_elasticity') * (y.winsAboveExpectation / y.games) : 0;
  const cap = P('budget.max_yearly_change');
  const move = Math.max(-cap, Math.min(cap, resultMove + P('budget.giving_elasticity') * y.givingChange));
  const rest = Math.round(prevRest * (1 + move));
  const total = rest + y.rosterMoneyCents;
  return { year: b.year + 1, totalCents: total, lines: split(total, y.rosterMoneyCents), seatsFrozen: false };
}

export function committedSalaries(staff: readonly StaffSeat[], pool: 'staff_pool' | 'support_staff'): number {
  return staff.filter((s) => s.pool === pool).reduce((t, s) => t + s.salaryCents, 0);
}

export type MoveResult =
  | { readonly ok: true; readonly budget: Budget }
  | { readonly ok: false; readonly reason: 'not_coach_line' | 'not_enough' | 'below_committed_pay' | 'bad_amount' };

/**
 * The coach moves money between two lines he controls (T9.2.1 rule 2). Totals do not change. The staff
 * pool cannot fall below the salaries already promised (money not in the pool cannot be paid, T9.4.1).
 */
export function moveBetweenLines(b: Budget, staff: readonly StaffSeat[], from: BudgetLine, to: BudgetLine, cents: number): MoveResult {
  if (!Number.isInteger(cents) || cents <= 0) return { ok: false, reason: 'bad_amount' };
  if (!COACH_CONTROLLED.includes(from) || !COACH_CONTROLLED.includes(to) || from === to) return { ok: false, reason: 'not_coach_line' };
  if (b.lines[from] < cents) return { ok: false, reason: 'not_enough' };
  if (from === 'staff_pool' && b.lines.staff_pool - cents < committedSalaries(staff, 'staff_pool')) return { ok: false, reason: 'below_committed_pay' };
  return { ok: true, budget: { ...b, lines: { ...b.lines, [from]: b.lines[from] - cents, [to]: b.lines[to] + cents } } };
}

/** The AD grants extra money to a line: the total and the line rise together (sum stays equal). */
export function grantToLine(b: Budget, line: BudgetLine, cents: number): Budget {
  return { ...b, totalCents: b.totalCents + cents, lines: { ...b.lines, [line]: b.lines[line] + cents } };
}

/**
 * Mid-year cut after a revenue shortfall (T9.2.1 edge case): every line the AD controls shrinks by the
 * share; the coach's lines shrink too but never below promised salaries; open seats freeze.
 */
export function midYearCut(b: Budget, staff: readonly StaffSeat[], share: number): Budget {
  const lines = { ...b.lines };
  let cut = 0;
  for (const l of SPLIT) {
    const floor = l === 'staff_pool' ? committedSalaries(staff, 'staff_pool') : l === 'support_staff' ? committedSalaries(staff, 'support_staff') : 0;
    const next = Math.max(floor, Math.round(lines[l] * (1 - share)));
    const taken = Math.max(0, lines[l] - next);
    lines[l] -= taken;
    cut += taken;
  }
  return { ...b, totalCents: b.totalCents - cut, lines, seatsFrozen: true };
}

/** Lines drained, in order, when booster money leaves (facilities first; promised pay is never touched). */
const DRAIN: readonly SplitLine[] = ['facilities_projects', 'equipment_technology', 'recruiting_travel', 'nutrition', 'academic_support'];

/** Money removed when a disassociated booster's giving leaves the budget (T9.3.1 edge case). */
export function removeGiving(b: Budget, cents: number): Budget {
  const lines = { ...b.lines };
  let left = cents;
  for (const l of DRAIN) {
    const take = Math.min(left, lines[l]);
    lines[l] -= take;
    left -= take;
  }
  return { ...b, totalCents: b.totalCents - (cents - left), lines };
}

/** Money not yet promised this year (AD request headroom). */
export function headroom(b: Budget, staff: readonly StaffSeat[]): number {
  return b.lines.staff_pool - committedSalaries(staff, 'staff_pool') + b.lines.support_staff - committedSalaries(staff, 'support_staff');
}
