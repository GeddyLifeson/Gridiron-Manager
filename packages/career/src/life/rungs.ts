// E7.7.2 the budget below head coach and S9.2.1 hours by rung and season. S9.2.1 owns the numbers
// (E7.7.2 holds its values "pending S9"), so the S9 ranges are used; the boss's hours culture (S4.1.1,
// 0 to 1) picks a point inside the range. Out of season the required share is an assumption.
import tablesJson from './tables.json' with { type: 'json' };
import { param } from './params.ts';

export const RUNGS: readonly number[] = tablesJson.rungs.map((r) => r.rung);

/** Required hours a week set by the boss. Head coach rungs return 0: he sets his own. Rung 0 (a career
 *  changer) has a self-set day job (E7.7.2 edge case). */
export function requiredHours(rung: number, inSeason: boolean, hoursCulture: number, hasDayJob = false): number {
  if (rung === 0) return hasDayJob ? param('dayJobHours') : 0;
  if (!RUNGS.includes(rung)) throw new Error(`life: no hour row for rung ${rung}`);
  const lo = param(`rung.${rung}.min`), hi = param(`rung.${rung}.max`);
  const c = Math.max(0, Math.min(1, hoursCulture));
  const inSeasonHours = lo + c * (hi - lo);
  return inSeason ? inSeasonHours : inSeasonHours * param('offseasonRequiredRatio');
}

/** Hours left after required work, sleep need, fixed needs and travel: what the user can move. */
export function discretionaryHours(required: number, sleepPerNight: number, travel: number): number {
  return Math.max(0, 7 * (param('hoursPerDay') - sleepPerNight - param('fixedNeedsHours')) - required - travel);
}
