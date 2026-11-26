// D9.6.1 readiness report and G5.4.1 readiness views. Both read the staff's estimates, never truth.
//
// Two formulas are kept because the leaves differ (raised with the bible thread):
//   D9.6.1 weakest link: readiness for a call = minimum estimated knowledge across the players slated to run it.
//   G5.4.1 play readiness: mean of the players' knowledge minus half the gap between the mean and the lowest.
// The report shows both; `flagged` uses the weakest link against the 70 line, as D9.6.1 states.
import type { CalledPlay } from './items.ts';
import { num, type KnowledgeNumbers } from './params.ts';

/** Estimated knowledge of one player on a list of items (min over the items, D9.1.1). */
export type EstimateOf = (player: number, items: readonly string[]) => number;

export interface SheetCall {
  readonly section: string;
  readonly play: CalledPlay;
}

export interface LowPlayer {
  readonly player: number;
  readonly estimate: number;
}

export interface CallReadiness {
  readonly call: string;
  readonly section: string;
  readonly weakestLink: number;
  readonly playReadiness: number;
  readonly low: readonly LowPlayer[];
  readonly flagged: boolean;
}

/** G5.4.1 starting formula over a list of player values. */
export function playReadiness(n: KnowledgeNumbers, values: readonly number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  let lo = Infinity;
  for (const v of values) { s += v; lo = Math.min(lo, v); }
  const mean = s / values.length;
  return mean - num(n, 'readiness.gapWeight') * (mean - lo);
}

export function callReadiness(n: KnowledgeNumbers, c: SheetCall, est: EstimateOf): CallReadiness {
  const flag = num(n, 'readiness.flagBelow');
  const vals = c.play.assignments.map((a) => ({ player: a.player, estimate: est(a.player, a.items) }));
  const weakest = vals.length ? Math.min(...vals.map((v) => v.estimate)) : 0;
  return {
    call: c.play.id,
    section: c.section,
    weakestLink: weakest,
    playReadiness: playReadiness(n, vals.map((v) => v.estimate)),
    low: vals.filter((v) => v.estimate < flag).sort((a, b) => a.estimate - b.estimate || a.player - b.player),
    flagged: weakest < flag,
  };
}

/** An opponent look and how often it was shown by the scout team or in film this week. */
export interface OpponentLook {
  readonly look: string;
  readonly reps: number;
  /** Preparation knowledge 0 to 100 for the look (its own knowledge item, D9.6.1). */
  readonly prep: number;
}

export interface ReadinessReport {
  readonly calls: readonly CallReadiness[];
  /** Weakest link per call-sheet section. */
  readonly sections: readonly { readonly section: string; readonly weakestLink: number }[];
  readonly flaggedCalls: readonly string[];
  readonly opponent: readonly (OpponentLook & { readonly recognitionBonus: number })[];
}

/** D9.6.1 recognition bonus for a look in this game: up to 20 percent, in proportion to preparation. */
export function recognitionBonus(n: KnowledgeNumbers, prep: number): number {
  return num(n, 'readiness.recognitionMax') * Math.min(1, Math.max(0, prep / num(n, 'scale.max')));
}

/** D9.6.1 after the game: preparation expires except for division or conference opponents, which keep 30 percent. */
export function prepAfterGame(n: KnowledgeNumbers, prep: number, sameDivisionOrConference: boolean): number {
  return sameDivisionOrConference ? prep * num(n, 'readiness.rivalKeep') : 0;
}

/** D9.3.2 a player signed from a team we will face: half the normal scout-team preparation for its families. */
export function formerOpponentPrep(n: KnowledgeNumbers, normalPrep: number): number {
  return normalPrep * num(n, 'carry.formerOpponentShare');
}

export function readinessReport(n: KnowledgeNumbers, sheet: readonly SheetCall[], est: EstimateOf, looks: readonly OpponentLook[] = []): ReadinessReport {
  const calls = sheet.map((c) => callReadiness(n, c, est));
  const bySection = new Map<string, number>();
  for (const c of calls) bySection.set(c.section, Math.min(bySection.get(c.section) ?? Infinity, c.weakestLink));
  return {
    calls,
    sections: [...bySection].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([section, weakestLink]) => ({ section, weakestLink })),
    flaggedCalls: calls.filter((c) => c.flagged).map((c) => c.call),
    opponent: looks.map((l) => ({ ...l, recognitionBonus: recognitionBonus(n, l.prep) })),
  };
}

/**
 * D9.6.1 edge case: a late scratch. Replace a player with his substitute in every call and return the calls
 * that newly fall below the flag line.
 */
export function lateScratch(n: KnowledgeNumbers, sheet: readonly SheetCall[], est: EstimateOf, out: number, sub: number): string[] {
  const before = new Set(readinessReport(n, sheet, est).flaggedCalls);
  const swapped = sheet.map((c) => ({
    section: c.section,
    play: { ...c.play, assignments: c.play.assignments.map((a) => (a.player === out ? { ...a, player: sub } : a)) },
  }));
  return readinessReport(n, swapped, est).flaggedCalls.filter((id) => !before.has(id));
}
