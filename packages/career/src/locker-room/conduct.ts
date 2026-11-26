// Playing time, sending home and deactivation (L3.2.3) and conduct detrimental with suspension (L3.2.4).
// "Plays less" while active is the unrestricted lever. Deactivation in response to conduct is discipline
// under Art. 42 Sec. 1(b)(xvii): it needs the predicate or a qualifying single act, and its weeks count
// with any suspension for the same conduct toward the four-week maximum. Past any limit: warn, allow, log.
import type { DisciplineRules } from './keys.ts';
import { offence } from './rules.ts';
import { lp } from './params.ts';

export type BenchLength = 'series' | 'half' | 'game';

/**
 * Memory strength for a benched player (L3.2.3): series -4, half -8, game -12; halved when the published
 * list said so in advance, doubled when a teammate did the same thing unpunished within eight weeks.
 */
export function benchMemory(length: BenchLength, listedInAdvance: boolean, teammateUnpunishedRecently: boolean): number {
  let m = lp(`bench.${length}`);
  if (listedInAdvance) m *= lp('bench.listedKeep');
  if (teammateUnpunishedRecently) m *= lp('bench.unpunishedMult');
  return m;
}

/** Whether an earlier unpunished teammate case falls inside the doubling window (L3.2.3). */
export function withinUnpunishedWindow(day: number, teammateDay: number): boolean {
  return day - teammateDay >= 0 && day - teammateDay <= lp('bench.unpunishedWeeks') * 7;
}

export interface DeactivationRecord {
  readonly playerId: number;
  readonly day: number;
  readonly weeks: number;
  readonly reason: 'conduct' | 'ability';
  /** An ability deactivation within two weeks of a logged violation by the same player (L3.2.3). */
  readonly mayBeReadAsDiscipline: boolean;
  /** The football cost: replacement's grade and the gap, logged for N3 (L3.2.3 acceptance). */
  readonly replacementId: number | null;
  readonly replacementGrade: number | null;
  readonly gradeGap: number | null;
}

export function deactivationRecord(
  playerId: number, day: number, weeks: number, reason: 'conduct' | 'ability', lastViolationDay: number | null,
  replacement: { readonly id: number; readonly grade: number } | null, playerGrade: number | null,
): DeactivationRecord {
  const flag = reason === 'ability' && lastViolationDay !== null && day - lastViolationDay >= 0 && day - lastViolationDay <= lp('bench.abilityFlagWeeks') * 7;
  return {
    playerId, day, weeks, reason, mayBeReadAsDiscipline: flag,
    replacementId: replacement?.id ?? null, replacementGrade: replacement?.grade ?? null,
    gradeGap: replacement && playerGrade !== null ? playerGrade - replacement.grade : null,
  };
}

/** One logged lesser violation for the predicate count. */
export interface PredicateEntry { readonly offenceId: string; readonly day: number }

/**
 * Occasions toward the predicate (Art. 42 Sec. 3(a)): listed lesser categories only (not overweight),
 * several violations on one day count as one occasion. Same league year assumed by the caller.
 */
export function predicateOccasions(entries: readonly PredicateEntry[]): number {
  const days = new Set<number>();
  for (const e of entries) if (offence(e.offenceId).predicate) days.add(e.day);
  return days.size;
}

export type ConductRoute = 'predicate' | 'single_act' | 'none';

export interface ConductAvailability {
  readonly route: ConductRoute;
  /** Occasions so far including the current one, and how many the predicate needs. */
  readonly occasions: number;
  readonly needed: number;
  /** Text key of the reason shown ("fourth makes this available", "available now"). */
  readonly reasonText: string;
}

/**
 * Whether the CBA allows conduct-detrimental discipline now (L3.2.4). `entries` includes the current
 * violation. A single act that is itself conduct detrimental is available at once.
 */
export function conductAvailability(currentOffenceId: string, entries: readonly PredicateEntry[], d: DisciplineRules): ConductAvailability {
  const needed = d.conductPredicateViolation ?? 0;
  const occasions = predicateOccasions(entries);
  if (offence(currentOffenceId).conductSingleAct === true) return { route: 'single_act', occasions, needed, reasonText: 'locker_room.conduct.single_act_available' };
  if (d.model !== 'labour_agreement' || occasions >= needed) return { route: d.model === 'labour_agreement' ? 'predicate' : 'none', occasions, needed, reasonText: 'locker_room.conduct.predicate_met' };
  return { route: 'none', occasions, needed, reasonText: 'locker_room.conduct.predicate_short' };
}

export interface ConductDecision {
  readonly fineWeeksSalary: number;
  readonly suspensionWeeks: number;
  /** Earlier conduct-deactivation weeks for the same conduct (they count toward the maximum, L3.2.3). */
  readonly priorDeactivationWeeks: number;
}

export type ConductBreach = 'no_route' | 'suspension_over_max' | 'fine_over_max';

/** Limits a conduct decision breaks (each warned, allowed and logged, L3.2.4 acceptance). Only under the labour agreement. */
export function conductBreaches(dec: ConductDecision, avail: ConductAvailability, d: DisciplineRules): ConductBreach[] {
  if (d.model !== 'labour_agreement') return [];
  const out: ConductBreach[] = [];
  if (avail.route === 'none' && (dec.suspensionWeeks > 0 || dec.fineWeeksSalary > 0 || dec.priorDeactivationWeeks > 0)) out.push('no_route');
  if (dec.suspensionWeeks + dec.priorDeactivationWeeks > (d.conductSuspensionMaxWeeks ?? Infinity)) out.push('suspension_over_max');
  if (dec.fineWeeksSalary > (d.conductFineMaxWeeks ?? Infinity)) out.push('fine_over_max');
  return out;
}

/** A conduct deactivation (inactive as punishment) is treated as a suspension-class action (L3.2.3). */
export function deactivationAsConduct(weeks: number, priorSuspensionWeeks: number): ConductDecision {
  return { fineWeeksSalary: 0, suspensionWeeks: weeks, priorDeactivationWeeks: priorSuspensionWeeks };
}

/** Relationship effects of conduct discipline (L3.2.4): -25 for the player; witnesses +5 if fair, -10 if not. */
export function conductMemories(fairInWitnessEyes: boolean): { readonly player: number; readonly witness: number } {
  return { player: lp('conduct.playerMemory'), witness: fairInWitnessEyes ? lp('conduct.witnessFair') : lp('conduct.witnessUnfair') };
}

/** Suspension pay: withheld only once the appeal is exhausted; until then the amount is pending (L3.2.4, L3.2.5). */
export function suspensionPay(weeks: number, weeklySalaryUsd: number, appealOpen: boolean): { readonly withheldUsd: number; readonly pendingUsd: number } {
  const amount = Math.max(0, weeks) * weeklySalaryUsd;
  return appealOpen ? { withheldUsd: 0, pendingUsd: amount } : { withheldUsd: amount, pendingUsd: 0 };
}
