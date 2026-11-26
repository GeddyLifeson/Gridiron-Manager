// Service tests the rules read (C5.1.2, C5.3.1, C5.5.1).
import type { RosterRules } from './keys.ts';
import type { PlayerFacts } from './types.ts';

/** Vested veteran (C5.1.2, C5.5.1). The measure is a rule key because the sources conflict. */
export function isVested(p: PlayerFacts, rules: RosterRules): boolean {
  if (!rules.waivers) return false;
  const seasons = rules.waivers.vestedMeasure === 'accrued' ? p.accruedSeasons : p.pensionCreditedSeasons;
  return seasons >= rules.waivers.vestedMinSeasons;
}

/** A released player goes through waivers unless he is vested and the trade deadline has not passed (C5.5.1 rule 1). */
export function subjectToWaivers(p: PlayerFacts, rules: RosterRules, tradeDeadlinePassed: boolean): boolean {
  if (!rules.waivers) return false;
  return !isVested(p, rules) || tradeDeadlinePassed;
}

export type PracticeSquadGroup = 'A' | 'B' | 'C';

/**
 * Practice squad eligibility group (C5.3.1). A: no accrued season, or the group A maximum with fewer than
 * the key's games on an active list in it. B: up to the group B maximum. C: any veteran.
 */
export function practiceSquadGroup(p: PlayerFacts, rules: RosterRules): PracticeSquadGroup | null {
  const ps = rules.practiceSquad;
  if (!ps) return null;
  if (p.accruedSeasons === 0) return 'A';
  if (p.accruedSeasons <= ps.groupAMaxAccrued && p.activeGamesInLastAccruedSeason < ps.groupAActiveGamesBelow) return 'A';
  if (p.accruedSeasons <= ps.groupBMaxAccrued) return 'B';
  return 'C';
}

/**
 * Group caps (C5.3.1, CBA Article 33 section 4 categories iii and iv with the May 2022 numbers): group A
 * has no cap of its own, group B at most `groupBMax`, group C at most `veteranSlots`, all inside the size.
 */
export function practiceSquadGroupCaps(rules: RosterRules): { B: number; C: number } {
  const ps = rules.practiceSquad;
  return ps ? { B: ps.groupBMax, C: ps.veteranSlots } : { B: 0, C: 0 };
}
