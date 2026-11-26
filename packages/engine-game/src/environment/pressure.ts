// D4.3.1 pressure of the moment, 0 to 1: how big the snap is. The leaf names its inputs (leverage, crowd noise,
// and the player's own experience, which the player AI applies per player) and gives no formula for the level.
// Until the N2 win-probability swing is wired to the play, leverage is read off the scoreboard, the clock and
// the down: a close game, late, on a down that decides the series. Every number is an Assumption (params.ts).
// The level is public (K1.6.1): it describes the situation, not a player. At composure 50 it changes nothing.
import { Contract } from '@gm/engine-core';

export interface MomentSituation {
  /** Period from 1; overtime continues the count. */
  readonly period: number;
  /** Game clock left in the period, integer tenths. */
  readonly clockTenths: number;
  /** Down of a scrimmage play; null on kicks and tries. */
  readonly down: number | null;
  readonly goalToGo: boolean;
  readonly score: readonly [number, number];
}

/** Pressure of the moment for one snap. `noise` is the play's crowd level (J12.6.1). */
export function pressureOfMoment(sit: MomentSituation, noise: number, rules: Contract.RuleSet, p: Contract.ParamTable): number {
  const margin = Math.abs(sit.score[0] - sit.score[1]);
  const close = p.num('environment.pressure.closeMargin'), far = p.num('environment.pressure.farMargin');
  const closeness = margin <= close ? 1 : margin >= far ? 0 : (far - margin) / (far - close);
  const periods = rules.num('clock.periods'), lengthTenths = rules.num('clock.period_length_s') * 10;
  const elapsed = sit.period > periods ? 1 : Math.min(1, Math.max(0, (sit.period - 1 + 1 - sit.clockTenths / lengthTenths) / periods));
  const early = p.num('environment.pressure.earlyGame');
  const lateness = early + (1 - early) * elapsed * elapsed;
  // A kick or a try is a deciding snap for the men on it, like a down that ends the series.
  const deciding = sit.down === null || sit.goalToGo || sit.down >= rules.num('series.downs') - 1;
  const downFactor = deciding ? 1 : p.num('environment.pressure.earlyDown');
  const level = closeness * lateness * downFactor * (1 + p.num('environment.pressure.noiseK') * Math.min(1, Math.max(0, noise)));
  return Math.min(1, Math.max(0, level));
}
