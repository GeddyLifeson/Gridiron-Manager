// Keeping the violation log bounded over a long history (the 1869 master run).
//
// 1. Appending without copying. `commitAct` used to copy the whole log for every new row, so a history of
//    n rows cost n squared. A caller that holds the state alone for a while (the recruiting week, a GM pass)
//    takes the log with `ownLog`: one copy, then every `commitAct` on that state pushes onto the same array.
//    `releaseLog` ends the hold before the state is stored. A state whose log is not held is never changed:
//    `commitAct` copies it as before. Both ways give the same rows in the same order, so results match.
// 2. Retiring spent acts. A row the pipeline can never read again leaves the live log for the archive:
//    no case holds it, it is past the detection window (the rule set's `compliance.detect_window_years`, the
//    statute of limitations: T9.5.1 rule 4, NCAA Bylaw 19.5.11 four years; L8.2.5 starting five) and past the
//    K2.8.2 cooldown. Detection, the inquiry sweep, the cooldown check and case resolution read only rows
//    inside those bounds, so retiring changes no draw and no result. The archive keeps every retired row (N4
//    certified mode, history and reporters), in chunks appended once per sweep, so nothing is copied twice.
//    Closed cases whose window has also passed move to the archive the same way.
import type { WorldDate } from '@gm/schema';
import { K, P } from './params.ts';
import { weeksBetween, yearsBetween } from './dates.ts';
import type { CaseRow, ComplianceArchive, ComplianceState, ViolationLogRow } from './types.ts';
import type { RuleSet } from '@gm/schema';

const HELD = new WeakSet<readonly ViolationLogRow[]>();

/** Take the state's log for appending in place: one copy now, no copy per act after. */
export function ownLog(state: ComplianceState): ComplianceState {
  if (HELD.has(state.log)) return state;
  const log = [...state.log];
  HELD.add(log);
  return { ...state, log };
}

/** End the hold: later acts on this state copy the log again. Call before the state is stored or shared. */
export function releaseLog(state: ComplianceState): ComplianceState {
  HELD.delete(state.log);
  return state;
}

/** True while the log is held for in-place appends. */
export function isLogHeld(state: ComplianceState): boolean {
  return HELD.has(state.log);
}

/** The log with one more row: pushed in place when held, else a copy. */
export function appendRow(log: readonly ViolationLogRow[], row: ViolationLogRow): readonly ViolationLogRow[] {
  if (HELD.has(log)) { (log as ViolationLogRow[]).push(row); return log; }
  return [...log, row];
}

/** Years an act stays detectable under a rule set: its `compliance.detect_window_years`, else the L8.2.5 start. */
export function windowYearsOf(rules: RuleSet): number {
  return rules.keys().includes(K.detectWindowYears) ? rules.num(K.detectWindowYears) : P('detect_window_years_default');
}

/** True when no step can read this row again on or after `date`. */
function spent(r: ViolationLogRow, date: WorldDate, windowYears: number, openCases: ReadonlySet<number>): boolean {
  if (r.caseId !== null && openCases.has(r.caseId)) return false;
  return yearsBetween(r.date, date) > windowYears && weeksBetween(r.date, date) >= P('cooldown_weeks');
}

function emptyArchive(): ComplianceArchive {
  return { rows: [], cases: [] };
}

/**
 * Move every spent row (and every closed case past the window) to the archive. Returns the same state object
 * when nothing is spent. A held log stays held (the new array is held in its place).
 */
export function retireSpent(state: ComplianceState, date: WorldDate, windowYears: number): ComplianceState {
  const openCases = new Set<number>();
  for (const c of state.cases) if (c.status === 'open') openCases.add(c.id);
  const keep: ViolationLogRow[] = [];
  const gone: ViolationLogRow[] = [];
  for (const r of state.log) (spent(r, date, windowYears, openCases) ? gone : keep).push(r);
  const liveCases: CaseRow[] = [];
  const goneCases: CaseRow[] = [];
  for (const c of state.cases) (c.status === 'closed' && yearsBetween(c.resolveBy, date) > windowYears ? goneCases : liveCases).push(c);
  const retireAt = Math.max(P('retire_min_rows'), keep.length * P('retire_growth_factor'));
  if (gone.length === 0 && goneCases.length === 0) return state.retireAt === retireAt ? state : { ...state, retireAt };
  const held = HELD.has(state.log);
  if (held) { HELD.delete(state.log); HELD.add(keep); }
  const a = state.archive ?? emptyArchive();
  return {
    ...state,
    log: keep,
    cases: goneCases.length ? liveCases : state.cases,
    archive: {
      rows: gone.length ? [...a.rows, gone] : a.rows,
      cases: goneCases.length ? [...a.cases, goneCases] : a.cases,
    },
    retireAt,
  };
}

/**
 * The sweep `commitAct` runs as the log grows: only once the live log has doubled since the last sweep (and
 * is past a floor), so its cost per act stays constant. Deterministic: it depends on lengths and dates only.
 * The act's rule set may not be the one the weekly detection step reads (CO-03: one set for the world), so
 * this sweep keeps every act younger than `retire_window_floor_years` as well, whatever the act's own window.
 */
export function retireIfGrown(state: ComplianceState, date: WorldDate, rules: RuleSet): ComplianceState {
  if (state.log.length < (state.retireAt ?? P('retire_min_rows'))) return state;
  return retireSpent(state, date, Math.max(windowYearsOf(rules), P('retire_window_floor_years')));
}

/** Every retired row, oldest sweep first. */
export function archivedRows(state: ComplianceState): readonly ViolationLogRow[] {
  return (state.archive?.rows ?? []).flat();
}

/** Every archived (closed, past the window) case, oldest sweep first. */
export function archivedCases(state: ComplianceState): readonly CaseRow[] {
  return (state.archive?.cases ?? []).flat();
}

/** One row by id, live or archived. */
export function findRow(state: ComplianceState, id: number): ViolationLogRow | undefined {
  const live = state.log.find((r) => r.id === id);
  if (live) return live;
  for (const chunk of state.archive?.rows ?? []) {
    const r = chunk.find((x) => x.id === id);
    if (r) return r;
  }
  return undefined;
}
