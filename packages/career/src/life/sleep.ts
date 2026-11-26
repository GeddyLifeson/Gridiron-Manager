// E7.4.1 sleep debt and E7.4.2 what overwork costs, and what it never costs. Sleep owed in hours is
// the only "energy" value in the game. Readers: this file, week.ts (rule 3, slow work), load.ts
// (E8.1.1) and the display. Nothing in areas J, D or L reads it (dependency test).
import { param, toQ, fromQ } from './params.ts';
import { lifeFactNumber, FACT_SLEEP_MIN } from './facts.ts';
import type { LifeRealism } from './realism.ts';

export type SleepBand = 'rested' | 'tired' | 'wornDown' | 'exhausted';

/** Nightly need, the same for every coach (rule 1). Never below the recommended adult minimum. */
export function sleepNeedHours(): number {
  return Math.max(param('sleepNeedHours'), lifeFactNumber(FACT_SLEEP_MIN));
}

export interface Night {
  readonly sleptHours: number;
  /** A night flight, or a time-zone change (hours, either direction) on this day (H8). */
  readonly nightFlight?: boolean;
  readonly zoneShiftHours?: number;
}

/** One night of rules 2, 3, 4 and 6. Debt and hours in quarter hours internally. */
export function nightDebt(debtHours: number, night: Night): number {
  const need = toQ(sleepNeedHours());
  const slept = toQ(night.sleptHours);
  let d = toQ(debtHours);
  if (slept < need) d += need - slept;
  else d -= Math.min(slept - need, toQ(param('sleepRepayMaxPerNight')));
  if (night.nightFlight || Math.abs(night.zoneShiftHours ?? 0) >= param('travelZoneShift')) d += toQ(param('travelDebtHours'));
  d = Math.max(0, Math.min(toQ(param('sleepDebtCap')), d));
  return fromQ(d);
}

/** Rule 5 bands: 0 to 5 rested, over 5 to 12 tired, over 12 to 24 worn down, over 24 exhausted. */
export function sleepBand(debtHours: number): SleepBand {
  if (debtHours > param('sleepBand.exhausted')) return 'exhausted';
  if (debtHours > param('sleepBand.wornDown')) return 'wornDown';
  if (debtHours > param('sleepBand.tired')) return 'tired';
  return 'rested';
}

export interface GameDayEffects {
  /** Seconds added to items that reach the coach through people (I7). The play clock is untouched. */
  readonly infoDelayS: number;
  /** Halftime items removed from the I8 budget. */
  readonly halftimeActionsLost: number;
  /** Plain notice shown before the game and in the dry run, or null. */
  readonly notice: string | null;
}

/** E7.4.2 rules 1 and 2, from the band at kickoff. With the switch off both are zero. */
export function gameDayEffects(debtHours: number, realism: LifeRealism): GameDayEffects {
  const band = sleepBand(debtHours);
  if (!realism.gameDayTiredness || (band !== 'wornDown' && band !== 'exhausted')) return { infoDelayS: 0, halftimeActionsLost: 0, notice: null };
  const infoDelayS = param(`infoDelay.${band}`);
  const halftimeActionsLost = param(`halftimeLoss.${band}`);
  const short = Math.round(debtHours);
  return {
    infoDelayS, halftimeActionsLost,
    notice: `You are short ${short} hours of sleep. Sideline information will reach you more slowly and you will get less done at halftime.`,
  };
}

/** E7.4.2 rule 3: fixed needs on a day that starts exhausted. */
export function fixedNeedsHours(debtHoursAtStartOfDay: number): number {
  return sleepBand(debtHoursAtStartOfDay) === 'exhausted' ? param('exhaustedFixedNeedsHours') : param('fixedNeedsHours');
}
