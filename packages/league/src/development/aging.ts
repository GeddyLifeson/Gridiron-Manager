// Prime and decline by position (D8.2.1) and permanent losses from injury (D8.3.2). The physical
// index starts at 1 (adult peak) and moves by a yearly percent drawn at the offseason rollover:
// the position curve times the individual aging multiplier, plus noise. Part of the year applies at
// the rollover and one eighth each month in season; body.ts spreads the index over attributes.
import type { PlayingBlock, RandomStream } from '@gm/schema';
import { CURVE_GROUP, type PositionFamily } from './classes.ts';
import { HIDDEN, hiddenNum } from './hidden.ts';
import { bandIndex, num, type DevNumbers } from './params.ts';

/** Expected yearly percent change of the physical index at an age (D8.2.1 table). 0 before the first band. */
export function curvePercent(n: DevNumbers, family: PositionFamily, ageYears: number): number {
  const c = n.tables.curves;
  const row = c.groups[CURVE_GROUP[family]];
  if (!row) throw new Error(`no aging curve for group ${CURVE_GROUP[family]}`);
  const i = bandIndex(c.bandStarts, ageYears);
  return i < 0 ? 0 : row[i]!;
}

/** The aging multiplier for the coming year: the hidden trait plus the heavy-load bump (D8.2.1). */
export function agingMultiplier(n: DevNumbers, p: PlayingBlock): number {
  return hiddenNum(p, HIDDEN.agingTrait, num(n, 'aging.traitMean')) + hiddenNum(p, HIDDEN.heavyLoad, 0) * num(n, 'aging.heavyLoadBump');
}

/** Draw this year's percent change (D8.2.1): curve x multiplier + noise sd 0.4 points. */
export function drawAgingYear(n: DevNumbers, p: PlayingBlock, family: PositionFamily, ageYears: number, stream: RandomStream): number {
  return curvePercent(n, family, ageYears) * agingMultiplier(n, p) + stream.normal() * num(n, 'aging.noiseSdPoints');
}

/** Share of the yearly change applied at the rollover: what the in-season months do not take. */
export function rolloverShare(n: DevNumbers): number {
  return Math.max(0, 1 - num(n, 'aging.seasonMonths') * num(n, 'aging.monthlyShare'));
}

/** Move the physical index by a fraction of this year's drawn change. Returns a new block. */
export function applyAgingFraction(n: DevNumbers, p: PlayingBlock, fraction: number): PlayingBlock {
  return { ...p, hidden: { ...p.hidden, [HIDDEN.agingIndex]: agedIndex(n, p, fraction) } };
}

/** The physical index after a fraction of this year's drawn change. */
export function agedIndex(n: DevNumbers, p: PlayingBlock, fraction: number): number {
  const delta = hiddenNum(p, HIDDEN.agingYearDelta, 0);
  const idx = hiddenNum(p, HIDDEN.agingIndex, 1);
  return Math.min(num(n, 'aging.indexMax'), Math.max(0, idx * (1 + (delta * fraction) / num(n, 'scale.percent'))));
}

/**
 * Offseason rollover (D8.2.1): draw the year, apply the rollover share, and clear the heavy-load flag
 * (the caller sets it again from D10 season load). The new age is the age on September 1 of the
 * coming season.
 */
export function agingRollover(n: DevNumbers, p: PlayingBlock, family: PositionFamily, newAgeYears: number, stream: RandomStream, heavyLoadLastSeason: boolean): PlayingBlock {
  const withLoad: PlayingBlock = { ...p, hidden: { ...p.hidden, [HIDDEN.heavyLoad]: heavyLoadLastSeason ? 1 : 0 } };
  const delta = drawAgingYear(n, withLoad, family, newAgeYears, stream);
  const drawn: PlayingBlock = { ...withLoad, hidden: { ...withLoad.hidden, [HIDDEN.agingYearDelta]: delta } };
  return applyAgingFraction(n, drawn, rolloverShare(n));
}

/** D8.3.2 age factor on a permanent injury loss. */
export function injuryAgeFactor(n: DevNumbers, ageYears: number): number {
  if (ageYears < num(n, 'injury.ageEdge.mid')) return num(n, 'injury.ageFactor.young');
  if (ageYears < num(n, 'injury.ageEdge.old')) return num(n, 'injury.ageFactor.mid');
  return num(n, 'injury.ageFactor.old');
}

/**
 * Permanent loss from a major injury (D8.3.2): `lossPercent` comes from the D11.2 catalogue row and
 * is multiplied by the age factor, and by 1.3 for a repeat injury to the same joint. It lowers the
 * physical index, so speed, burst and strength all fall by their D8.3.1 weights.
 */
export function applyInjuryLoss(n: DevNumbers, p: PlayingBlock, ageYears: number, lossPercent: number, sameJointRepeat: boolean): PlayingBlock {
  const mult = injuryAgeFactor(n, ageYears) * (sameJointRepeat ? num(n, 'injury.sameJointMultiplier') : 1);
  const idx = hiddenNum(p, HIDDEN.agingIndex, 1);
  const next = Math.max(0, idx * (1 - (lossPercent * mult) / num(n, 'scale.percent')));
  return { ...p, hidden: { ...p.hidden, [HIDDEN.agingIndex]: next } };
}
