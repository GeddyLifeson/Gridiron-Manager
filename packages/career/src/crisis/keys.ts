// Rule keys the crisis engine reads (game build plan section 2). None is in the dictionary yet: they
// are requested from the integrator and the league-values thread (PR body, CR-G50-3) with the bible
// source. A key absent from a rule set means the rule does not exist there, so no code tests a level.
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['career.crisis'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'transfer.window_start_day', type: 'number', unit: 'day_index', meaning: 'Day index the main transfer window opens (L9.4.1; 2025-26 ran January 2 to 16, 2026, Verified there). Year-stamped rule data.', ownerLeaf: 'L9.4.1', readBy: READ_BY },
  { key: 'transfer.window_days', type: 'number', unit: 'days', meaning: 'Length of the main transfer window in days (L9.4.1; 15 in 2025-26, Verified there).', ownerLeaf: 'L9.4.1', readBy: READ_BY },
  { key: 'transfer.coach_change_window_days', type: 'number', unit: 'days', meaning: 'Length of the window after a head coaching change (L9.4.1; 15, 1 of 3).', ownerLeaf: 'L9.4.1', readBy: READ_BY },
  { key: 'transfer.coach_change_window_delay_days', type: 'number', unit: 'days', meaning: 'Days after the new head coach is hired or announced before that window opens (L9.4.1; 5, 1 of 3).', ownerLeaf: 'L9.4.1', readBy: READ_BY },
  { key: 'compliance.staff_must_report', type: 'boolean', unit: 'flag', meaning: 'Staff are required to report violations they witness (L9.5.2; Unverified, ships with the college default on).', ownerLeaf: 'L9.5.2', readBy: READ_BY },
];

export interface TransferWindow { readonly startDay: number; readonly days: number }

/** The main window from rule data, or null where the rule set has none (no window exists there). */
export function transferWindow(rules: Pick<RuleSet, 'keys' | 'num'>): TransferWindow | null {
  const keys = new Set(rules.keys());
  if (!keys.has('transfer.window_start_day') || !keys.has('transfer.window_days')) return null;
  return { startDay: rules.num('transfer.window_start_day'), days: rules.num('transfer.window_days') };
}

/** The window after a head coaching change: opens `delay` days after the hire, lasts `days`. Null where none exists. */
export function coachChangeWindow(rules: Pick<RuleSet, 'keys' | 'num'>, hireDay: number): TransferWindow | null {
  const keys = new Set(rules.keys());
  if (!keys.has('transfer.coach_change_window_days') || !keys.has('transfer.coach_change_window_delay_days')) return null;
  return { startDay: hireDay + rules.num('transfer.coach_change_window_delay_days'), days: rules.num('transfer.coach_change_window_days') };
}

/** Whether staff must report what they witness (L9.5.2). Absent key: no such rule is shown. */
export function staffMustReport(rules: Pick<RuleSet, 'keys' | 'bool'>): boolean {
  return rules.keys().includes('compliance.staff_must_report') ? rules.bool('compliance.staff_must_report') : false;
}
