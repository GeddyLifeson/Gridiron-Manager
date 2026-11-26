// Roster lists for injured players (D11.5.2). D11 supplies only the test; C5 (roster module) owns the
// lists and limits, and the holder of roster say decides (L5.2.1; college head coach, T9.1.1).
import type { MedicalRules } from './keys.ts';
import { P } from './params.ts';
import type { MedicalCase } from './types.ts';

/**
 * Recommend injured reserve when the low end of the shown estimate meets the minimum stay (read as
 * "the player will miss the minimum anyway"). Never fires where the level has no list, before imaging,
 * or during a concussion (no set timeline).
 */
export function recommendInjuredReserve(c: MedicalCase, mr: MedicalRules): boolean {
  if (mr.irMinGames === null || c.protocol || !c.shown.rangeDays || c.status !== 'active') return false;
  const lowGames = Math.floor(c.shown.rangeDays[0] / P('daysPerGameWeek'));
  return lowGames >= mr.irMinGames;
}
