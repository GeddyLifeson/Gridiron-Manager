// Per-play environment: the wind field for ball flight (J12.3.1, to J9.7.1), crowd noise for the play
// (J12.6.1), and footing slips (J12.5.1 edge case). Each draw uses its own J13 stream so that changing a
// play call never changes the gust or a slip (J13 counterfactual rule; J12.3.1 acceptance 1).
import type { Contract } from '@gm/engine-core';
import { YD_PER_S_PER_MPH } from './physics.ts';

const DEG_TO_RAD = Math.PI / 180;
const MAX_DIR_DEG = 359;
const FULL_TURN_DEG = 360;

export interface PlayWind {
  /** Steady field-level component (snapshot windMph times shelter). The coach's displayed number is the snapshot's windMph. */
  readonly steadyMph: number;
  /** This play's gust, never shown before the snap (J12.3.1 edge case). */
  readonly gustMph: number;
  readonly speedMph: number;
  /** Field frame, counter-clockwise from +x (contract D-12). */
  readonly dirDeg: number;
  /** Wind velocity in the field frame, yards per second (J1.2.1 units). */
  readonly vxYdS: number;
  readonly vyYdS: number;
}

export const CALM: PlayWind = { steadyMph: 0, gustMph: 0, speedMph: 0, dirDeg: 0, vxYdS: 0, vyYdS: 0 };

/**
 * J12.3.1 wind for one play: `windMph * shelter` plus a half-normal gust scaled by `gustMph` (also open-field,
 * so also sheltered), with direction jittered uniformly by up to the jitter parameter. Draws from
 * gust[game, play]: one normal, then one uniform, always, so the stream position never depends on the weather.
 */
export function windForPlay(
  env: Contract.Environment, windShelter: number, gameId: string | number, play: number,
  streams: Contract.StreamSource, p: Contract.ParamTable, m: Contract.DeterministicMath,
): PlayWind {
  const s = streams('gust', [gameId, play]);
  const zGust = s.normal();
  const uDir = s.uniform();
  if (env.windMph <= 0 && env.gustMph <= 0) return CALM;
  const shelter = Math.min(1, Math.max(0, windShelter));
  const steadyMph = env.windMph * shelter;
  const gustMph = Math.abs(zGust) * env.gustMph * shelter;
  const speedMph = steadyMph + gustMph;
  const jitter = (2 * uDir - 1) * p.num('environment.wind.dirJitterDeg');
  const raw = (((env.windDirDeg + jitter) % FULL_TURN_DEG) + FULL_TURN_DEG) % FULL_TURN_DEG;
  const dirDeg = Math.min(MAX_DIR_DEG, raw);
  const v = speedMph * YD_PER_S_PER_MPH;
  return { steadyMph, gustMph, speedMph, dirDeg, vxYdS: v * m.cos(raw * DEG_TO_RAD), vyYdS: v * m.sin(raw * DEG_TO_RAD) };
}

export type WindBin = 'under10' | 'from10to15' | 'over15';

/** J12.3.1 wind bins for calibration and display (J15.2.1 reads them), by the steady pre-game windMph. */
export function windBin(windMph: number): WindBin {
  if (windMph < 10) return 'under10';
  if (windMph <= 15) return 'from10to15';
  return 'over15';
}

export interface NoiseSituation {
  /** True when the team the crowd backs has the ball (the home team in a normal game; J12.6.1). */
  readonly offenseFavoured: boolean;
  readonly down: number;
  /** Score of the crowd's team minus its opponent. */
  readonly margin: number;
}

/** One-score margin from the rule set: a touchdown plus a two-point try (B7). */
export function oneScoreMargin(rules: Contract.RuleSet): number {
  return rules.num('score.touchdown') + rules.num('try.two_point_points');
}

/**
 * J12.6.1 `noise = clamp(noiseBase * situationFactor * moodFactor)`. Situation: 1.0 when the visiting
 * offense has the ball on third or fourth down in a one-score game, 0.7 on other downs, 0.2 when the
 * crowd's own offense has the ball, 0.4 in a blowout. Mood falls when the crowd's team is losing badly.
 * At a neutral site the caller passes a `noiseBase` already split by the fan mix.
 */
export function noiseForPlay(env: Contract.Environment, sit: NoiseSituation, rules: Contract.RuleSet, p: Contract.ParamTable): number {
  let situation: number;
  if (sit.offenseFavoured) situation = p.num('environment.noise.ownOffense');
  else if (Math.abs(sit.margin) >= p.num('environment.noise.blowoutMargin')) situation = p.num('environment.noise.blowout');
  else if (sit.down >= 3 && Math.abs(sit.margin) <= oneScoreMargin(rules)) situation = p.num('environment.noise.lateDownClose');
  else situation = p.num('environment.noise.earlyDown');
  const mood = sit.margin <= -p.num('environment.noise.moodDeficit') ? p.num('environment.noise.moodFactor') : 1;
  return Math.min(1, Math.max(0, env.noiseBase * situation * mood));
}

/** J12.5.1 chance of a slip on one hard cut: zero at or above the footing threshold, rising below it. */
export function slipChancePerCut(footing: number, p: Contract.ParamTable): number {
  const below = p.num('environment.slip.footingBelow') - footing;
  return below > 0 ? Math.min(1, below * p.num('environment.slip.chancePerCutPerFootingPoint')) : 0;
}

/** Opens footing[game, play, player] (J13.2.1). Draw `slipOnCut` from it once per hard cut, in cut order. */
export function footingStream(streams: Contract.StreamSource, gameId: string | number, play: number, playerId: number): Contract.RandomStream {
  return streams('footing', [gameId, play, playerId]);
}

/** One slip check. Always draws exactly one uniform, so the stream position is the cut count. */
export function slipOnCut(s: Contract.RandomStream, footing: number, p: Contract.ParamTable): boolean {
  return s.uniform() < slipChancePerCut(footing, p);
}
