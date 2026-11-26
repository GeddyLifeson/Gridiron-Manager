// In-game freshness (D10.1.1, J11.5.1 step 1) and the environment factors that change it (D10.5.1).
// Freshness has two parts. The short-term part (GameDayState.freshness) is what the player starts the
// next play with; it recovers between plays toward the long-term part. The long-term part
// (GameDayState.freshnessLongTerm) falls slowly with work and recovers only on the bench and at halftime.
// Pure: math comes from the injected DeterministicMath, numbers from the rule set and parameter table.
import type { Contract } from '@gm/engine-core';

type GameDayState = Contract.GameDayState;

export interface FreshnessDeps {
  readonly params: Contract.ParamTable;
  readonly math: Contract.DeterministicMath;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Inputs to the D10.5.1 multipliers. `heatIndexF` comes from the environment module (J12); this module does not compute it. */
export interface EnvironmentExposure {
  readonly heatIndexF: number;
  /** Days the team has practised in similar heat. */
  readonly heatAcclimatisedDays: number;
  readonly altitudeFt: number;
  /** True for the team that does not live at this altitude (D10.5.1 applies altitude to the visitor only). */
  readonly visitingAtAltitude: boolean;
  readonly daysAtAltitude: number;
}

export interface EnvironmentFactors {
  /** Multiplier on between-play and bench recovery rates, 1 = neutral. */
  readonly recovery: number;
  /** Multiplier on in-play energy cost for J2.4.1, 1 = neutral. This module only reports it. */
  readonly energyCost: number;
}

export const NEUTRAL_FACTORS: EnvironmentFactors = { recovery: 1, energyCost: 1 };

/** D10.5.1 heat and altitude multipliers. Cold and rain do not change fatigue (D10.5.1). */
export function environmentFactors(e: EnvironmentExposure, p: Contract.ParamTable): EnvironmentFactors {
  const excessF = Math.max(0, e.heatIndexF - p.num('bench.heat.thresholdF'));
  const heatScale = e.heatAcclimatisedDays >= p.num('bench.heat.acclimatisationDays') ? p.num('bench.heat.acclimatisedScale') : 1;
  const heatLoss = excessF * p.num('bench.heat.recoveryLossPerDegF') * heatScale;
  const steps = e.visitingAtAltitude ? Math.max(0, Math.floor((e.altitudeFt - p.num('bench.altitude.thresholdFt')) / p.num('bench.altitude.stepFt'))) : 0;
  const altScale = e.daysAtAltitude >= p.num('bench.altitude.adaptDays') ? p.num('bench.altitude.adaptedScale') : 1;
  const altLoss = steps * p.num('bench.altitude.recoveryLossPerStep') * altScale;
  const recovery = Math.max(p.num('bench.environment.recoveryFloor'), (1 - heatLoss) * (1 - altLoss));
  return { recovery, energyCost: 1 + excessF * p.num('bench.heat.costGainPerDegF') * heatScale };
}

/** D10.1.1 time constant of short-term recovery, in seconds. */
export function shortTermTauS(conditioning: number, recovery: number, p: Contract.ParamTable): number {
  const base = p.num('bench.shortTerm.tauBaseS') * (p.num('bench.shortTerm.tauOffset') - conditioning / p.num('bench.shortTerm.tauConditioningDivisor'));
  return base / Math.max(recovery, p.num('bench.environment.recoveryFloor'));
}

/** Share of the short-term deficit that returns in `seconds` of rest. */
export function shortTermRecoveredShare(seconds: number, conditioning: number, recovery: number, d: FreshnessDeps): number {
  if (seconds <= 0) return 0;
  return 1 - d.math.exp(-seconds / shortTermTauS(conditioning, recovery, d.params));
}

/** Share of the long-term deficit that returns in `seconds` on the bench (3 percent a minute at neutral conditions). */
export function benchRecoveredShare(seconds: number, recovery: number, d: FreshnessDeps): number {
  if (seconds <= 0) return 0;
  const perMin = clamp01(d.params.num('bench.longTerm.benchRecoveryPerMin') * recovery);
  if (perMin >= 1) return 1;
  return 1 - d.math.exp((seconds / 60) * d.math.log(1 - perMin));
}

/** Spend a play's energy cost: all of it from the short-term part, a share of it from the long-term part. */
export function spendEnergy(day: GameDayState, energyCost: number, p: Contract.ParamTable): GameDayState {
  if (energyCost <= 0) return day;
  const longTerm = clamp01(day.freshnessLongTerm - energyCost * p.num('bench.longTerm.costShare'));
  const freshness = Math.min(longTerm, clamp01(day.freshness - energyCost));
  return { ...day, freshness, freshnessLongTerm: longTerm };
}

/**
 * Rest for `seconds`. Every player's short-term part regains toward his long-term part. A player on the
 * bench also regains long-term freshness toward his ceiling (the long-term value he started the game with).
 */
export function rest(day: GameDayState, seconds: number, onBench: boolean, ceiling: number, recovery: number, d: FreshnessDeps): GameDayState {
  if (seconds <= 0) return day;
  let longTerm = day.freshnessLongTerm;
  if (onBench && longTerm < ceiling) longTerm = clamp01(longTerm + (ceiling - longTerm) * benchRecoveredShare(seconds, recovery, d));
  const share = shortTermRecoveredShare(seconds, day.conditioning, recovery, d);
  const freshness = clamp01(day.freshness + (longTerm - day.freshness) * share);
  if (freshness === day.freshness && longTerm === day.freshnessLongTerm) return day;
  return { ...day, freshness: Math.min(freshness, longTerm), freshnessLongTerm: longTerm };
}

export type BreakKind = 'timeout' | 'period_break' | 'halftime';

/**
 * A stoppage long enough for full short-term recovery (D10.1.1: "A timeout gives everyone a full short-term
 * recovery"). Halftime also returns a quarter of the long-term deficit to the ceiling.
 */
export function restBreak(day: GameDayState, kind: BreakKind, ceiling: number, p: Contract.ParamTable): GameDayState {
  let longTerm = day.freshnessLongTerm;
  if (kind === 'halftime' && longTerm < ceiling) longTerm = clamp01(longTerm + (ceiling - longTerm) * p.num('bench.longTerm.halftimeRecovery'));
  if (longTerm === day.freshnessLongTerm && day.freshness === longTerm) return day;
  return { ...day, freshness: longTerm, freshnessLongTerm: longTerm };
}
