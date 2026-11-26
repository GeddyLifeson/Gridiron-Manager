// Keys of the player's hidden truth map (`playing.hidden`, W-10) that D7 and D8 read and write.
// Parameters are drawn once (development rate, aging trait, maturity offset); state moves (form,
// physical index, peaks, applied body factors). All are class truth: never shown in a career.
import type { AttributeId, PlayingBlock } from '@gm/schema';
import type { BodyAttribute } from './classes.ts';

export const HIDDEN = {
  /** D7.4.1 development rate trait (mean 1, uncapped). */
  devRate: 'dev.rate',
  /** D7.4.2 development form term (mean 1, uncapped). */
  form: 'dev.form',
  /** D7.4.2 ruling: this year's surroundings multiplier (mean 1, uncapped), drawn at the rollover. */
  surroundings: 'dev.surroundings',
  /** D8.2.1 individual aging trait (mean 1, sd 0.25). */
  agingTrait: 'aging.trait',
  /** D8.2.1 physical index: 1 at the adult peak, falls with age. */
  agingIndex: 'aging.index',
  /** D8.2.1 this year's drawn percent change, applied at the rollover and monthly in season. */
  agingYearDelta: 'aging.yearDelta',
  /** D8.2.1 1 when last season's load was heavy (above the position's 80th percentile, D10). */
  heavyLoad: 'aging.heavyLoad',
  /** D8.1.1 maturity offset in years (positive = late developer). */
  maturityOffset: 'growth.maturityOffset',
  /** D8.1.1 growth disposition: multiplier on yearly weight and strength gain (T8.1.1 rule 6). */
  growthDisposition: 'growth.disposition',
  /** D8.1.1 edge case: extra height from a late spurt after 17, in inches (0 for most). */
  lateSpurtIn: 'growth.lateSpurtIn',
  adultHeightIn: 'growth.adultHeightIn',
  adultWeightLb: 'growth.adultWeightLb',
} as const;

/** Adult drill results (D8.1.1 hidden targets), by TrueTests key. */
export const adultTestKey = (test: string): string => `growth.adult.${test}`;
const PEAK_KEYS = new Map<string, string>();
/** Highest value ever held per attribute (D7.5.1 decay floor and relearning). */
export function peakKey(a: AttributeId): string {
  let k = PEAK_KEYS.get(a);
  if (k === undefined) { k = `peak.${a}`; PEAK_KEYS.set(a, k); }
  return k;
}
/** Body factor last applied to an attribute (growth share times aging), so the next change is a difference. */
export const bodyKey = (a: BodyAttribute | AttributeId): string => `body.${a}`;

export function hiddenNum(p: PlayingBlock, key: string, fallback: number): number {
  const v = p.hidden[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
