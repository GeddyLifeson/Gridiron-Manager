// E8.1.1 sustained load, computed from the hour ledger's weekly summaries. There is no hidden stress
// number: if a builder needs "stress", it is heavyWeeks52 (rule 1). Load never reads results (rule 4).
import { param } from './params.ts';
import { lifeFactNumber, FACT_LONG_HOURS } from './facts.ts';

export interface WeekSummary {
  readonly week: number;
  readonly workHours: number;
  /** Mean sleep per night that week. */
  readonly meanSleepHours: number;
}

export type LoadBand = 'light' | 'normal' | 'heavy' | 'veryHeavy';

export interface Load {
  /** `load_12w`: mean weekly work hours and mean nightly sleep over the trailing window. */
  readonly meanWorkHours: number;
  readonly meanSleepHours: number;
  readonly band: LoadBand;
  /** `heavy_weeks_52`: weeks in the trailing 52 with work above 90 h or mean sleep under 5.5 h. */
  readonly heavyWeeks52: number;
  readonly weeksUsed: number;
}

/** True for a heavy week (E8.1.1 outputs). */
export function isHeavyWeek(w: WeekSummary): boolean {
  return w.workHours > param('heavyWorkHours') || w.meanSleepHours < param('heavySleepHours');
}

/** Rule 2 bands. The light/normal cut is the WHO/ILO long-working-hours threshold (F-life-0002), which
 *  equals the bible's starting cut point. */
export function loadBand(meanWorkHours: number): LoadBand {
  if (meanWorkHours > param('loadBand.veryHeavy')) return 'veryHeavy';
  if (meanWorkHours > param('loadBand.heavy')) return 'heavy';
  if (meanWorkHours >= lifeFactNumber(FACT_LONG_HOURS)) return 'normal';
  return 'light';
}

/** Load as of the last week in `weeks` (sorted or not). The first weeks of a career use what exists. */
export function computeLoad(weeks: readonly WeekSummary[], asOfWeek: number): Load {
  const w12 = weeks.filter((w) => w.week <= asOfWeek && w.week > asOfWeek - param('loadWindowWeeks'));
  const w52 = weeks.filter((w) => w.week <= asOfWeek && w.week > asOfWeek - param('heavyWindowWeeks'));
  const n = w12.length;
  const meanWorkHours = n === 0 ? 0 : w12.reduce((s, w) => s + w.workHours, 0) / n;
  const meanSleepHours = n === 0 ? 0 : w12.reduce((s, w) => s + w.meanSleepHours, 0) / n;
  return { meanWorkHours, meanSleepHours, band: loadBand(meanWorkHours), heavyWeeks52: w52.filter(isHeavyWeek).length, weeksUsed: n };
}

/** The personal page line (E8.1.1 "what the user sees"). */
export function loadLine(l: Load): string {
  const word = { light: 'light', normal: 'normal', heavy: 'heavy', veryHeavy: 'very heavy' }[l.band];
  return `Load: ${word}. ${Math.round(l.meanWorkHours)} working hours a week and ${l.meanSleepHours.toFixed(1)} hours of sleep a night over the last ${l.weeksUsed} weeks.`;
}
