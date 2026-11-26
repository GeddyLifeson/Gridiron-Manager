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
 * Most group C players a practice squad may hold: the veteran places, and never into the places that must
 * go to players with at most two accrued seasons (G-10 key meaning). C5.3.1's prose says "at most 10 from
 * groups B and C together"; that conflicts with the key meaning and is reported in the PR, not coded.
 */
export function practiceSquadVeteranCap(rules: RosterRules): number {
  const ps = rules.practiceSquad;
  if (!ps) return 0;
  return Math.min(ps.veteranSlots, ps.size - ps.youngMin);
}
