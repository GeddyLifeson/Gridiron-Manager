// Roster planning by class (T8.4.1) and the count against the limit (T5.1.1, T5.1.2): the class grid,
// expected departures, and the declaration-date check. The cut itself is a roster transaction (G-15).
import type { EligibilityRecord } from './eligibility.ts';
import { eligibilityStatus } from './eligibility.ts';
import type { CollegeRules } from './keys.ts';

export interface PlanPlayer {
  readonly personId: number;
  readonly position: string;
  readonly record: EligibilityRecord;
  /** Exempt from the count under the 2025 rule for the rest of his eligibility; follows him on transfer (T5.1.1). */
  readonly countExempt: boolean;
  /** Medically retired: stays in school on aid; leaves the count when the rule set says so (T5.1.2 rule 5). */
  readonly medicallyRetired: boolean;
}

export interface GridCell { readonly position: string; readonly lastSeason: number; readonly count: number }

/** Each player's expected last season by position (the class-by-position grid). */
export function classGrid(players: readonly PlanPlayer[], season: number, rules: CollegeRules): readonly GridCell[] {
  const m = new Map<string, GridCell>();
  for (const p of players) {
    const st = eligibilityStatus(p.record, season, rules);
    if (!st.eligible) continue;
    const key = `${p.position}|${st.lastSeason}`;
    const c = m.get(key);
    m.set(key, { position: p.position, lastSeason: st.lastSeason, count: (c?.count ?? 0) + 1 });
  }
  return [...m.values()].sort((a, b) => a.position.localeCompare(b.position) || a.lastSeason - b.lastSeason);
}

/** Players whose eligibility runs out after `season` (the eligibility part of yearly departures). */
export function eligibilityDepartures(players: readonly PlanPlayer[], season: number, rules: CollegeRules): readonly number[] {
  return players.filter((p) => {
    const now = eligibilityStatus(p.record, season, rules);
    return now.eligible && now.lastSeason === season;
  }).map((p) => p.personId);
}

/** Players who count against the roster limit: not exempt, and not medically retired where that leaves the count. */
export function countedPlayers(players: readonly PlanPlayer[], medicalRetirementLeavesCount: boolean): readonly PlanPlayer[] {
  return players.filter((p) => !p.countExempt && !(p.medicallyRetired && medicalRetirementLeavesCount));
}

export type DeclarationVerdict = { readonly ok: true; readonly counted: number } | { readonly ok: false; readonly counted: number; readonly over: number };

/** T5.1.1 acceptance: on the declaration date a roster over the limit is refused (the governing body does not accept it). */
export function declarationCheck(players: readonly PlanPlayer[], rules: CollegeRules, medicalRetirementLeavesCount: boolean): DeclarationVerdict {
  const counted = countedPlayers(players, medicalRetirementLeavesCount).length;
  return counted <= rules.rosterLimit ? { ok: true, counted } : { ok: false, counted, over: counted - rules.rosterLimit };
}
