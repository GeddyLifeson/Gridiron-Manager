// Whole-player value (D8.2.1 calibration, K7 grades): the mean of the attributes a position works plus
// a speed term. Speed lives in the drill results (body.ts moves the forty with the physical index), not
// in an attribute, so an attribute mean alone does not see a player lose a step. The speed term turns
// the forty's change against the player's own adult forty into ISS: one standard deviation of the
// position's combine forty is 10 ISS (one ISS standard deviation), times the position's speed weight.
import type { PlayingBlock } from '@gm/schema';
import { WORKED, type PositionFamily } from './classes.ts';
import { adultTestKey, hiddenNum } from './hidden.ts';
import { num, type DevNumbers } from './params.ts';

/** Speed term in ISS: 0 at the adult forty, negative when slower. */
export function speedTerm(n: DevNumbers, p: PlayingBlock, family: PositionFamily): number {
  const sv = n.tables.speedValue;
  const weight = sv.weight[family] ?? 0;
  if (weight === 0) return 0;
  const forty = p.tests.fortyS;
  const adult = hiddenNum(p, adultTestKey('fortyS'), forty);
  if (!(adult > 0)) return 0;
  const issPerPercent = num(n, 'value.issPerSd') / sv.fortySdPercent[family]!;
  return -weight * (forty / adult - 1) * num(n, 'scale.percent') * issPerPercent;
}

/** Mean of the attributes the position works (classes.ts WORKED). */
export function workedMean(p: PlayingBlock, family: PositionFamily): number {
  const xs = WORKED[family];
  let s = 0;
  for (const a of xs) s += p.attributes[a] ?? 0;
  return xs.length === 0 ? 0 : s / xs.length;
}

/** The whole-player value a scout's overall look reads: worked attributes plus the speed term. */
export function wholePlayerValue(n: DevNumbers, p: PlayingBlock, family: PositionFamily): number {
  return workedMean(p, family) + speedTerm(n, p, family);
}
