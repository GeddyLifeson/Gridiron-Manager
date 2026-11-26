// The crowd on one play (J12.6.1, J12.8.1): what each unit on the field hears, the J5.7.1 venue of the
// snapping team, whether the visiting offense goes to a silent count (J5.6.1, I2.5.3), the D9.4.1 noise
// factor on knowledge errors, and the J12.8.1 residual familiarity term. Side 0 is the home team (or the
// team listed first at a neutral site, schema primitives `Side`). Pure: the same snapshot and situation
// give the same crowd, so replays reproduce it. Nothing here adds points; each value acts through J3, J4, J5.
import { Contract } from '@gm/engine-core';
import { noiseForPlay } from './play.ts';

/** A game at the home team's venue, or at a neutral site (no venue term, no familiarity, noise by fan mix). */
export type Site = 'home' | 'neutral';

export interface CrowdSituation {
  /** The snapping or kicking team. */
  readonly offense: 0 | 1;
  /** Down of a scrimmage play; null on kicks and tries. */
  readonly down: number | null;
  /** Score by side: [home, visitor]. */
  readonly score: readonly [number, number];
}

export interface CrowdForPlay {
  /** The play's crowd level 0 to 1 (J12.6.1): the presentation's crowd bed (MB-6) and the strip's meter. */
  readonly noise: number;
  /** Noise each unit hears, [snapping team, other team] (the order of J4 PlayContext.noise and J5 PresnapSide.noise). */
  readonly unitNoise: readonly [number, number];
  /** J5.7.1 venue of the snapping team. */
  readonly venue: 'home' | 'road' | 'neutral';
  /** The visiting offense snaps on a silent count (J5.6.1): its own calls cannot be heard over the crowd. */
  readonly silentCount: boolean;
  /** D9.4.1 noise factor on knowledge errors, [snapping team, other team]; 1 is neutral. */
  readonly noiseFactor: readonly [number, number];
  /** J12.8.1 residual familiarity, a z bonus to composure and communication, [snapping team, other team]. */
  readonly familiarityZ: readonly [number, number];
}

/** No crowd: what a play hears with `noiseBase` 0 at a neutral site. */
export const QUIET: CrowdForPlay = { noise: 0, unitNoise: [0, 0], venue: 'neutral', silentCount: false, noiseFactor: [1, 1], familiarityZ: [0, 0] };

/**
 * J12.6.1 noise for the play with the J12.8.1 composition. At home the visiting unit hears the full level and
 * the home unit hears `environment.noise.homeUnitShare` of it (its crowd goes quiet for its offense and plays to
 * its defense's rhythm). At a neutral site both units hear the level, which the caller has already split by the
 * fan mix in `noiseBase`; there is no venue term and no familiarity there.
 */
export function crowdForPlay(env: Contract.Environment, sit: CrowdSituation, site: Site, rules: Contract.RuleSet, p: Contract.ParamTable): CrowdForPlay {
  const home = site === 'home';
  const margin = sit.score[0] - sit.score[1];
  const noise = noiseForPlay(env, { offenseFavoured: home && sit.offense === 0, down: sit.down ?? 0, margin }, rules, p);
  const share = home ? p.num('environment.noise.homeUnitShare') : 1;
  const hears = (side: 0 | 1): number => (home && side === 0 ? noise * share : noise);
  const other: 0 | 1 = sit.offense === 0 ? 1 : 0;
  const unitNoise: [number, number] = [hears(sit.offense), hears(other)];
  const visitorSnaps = home && sit.offense === 1;
  const silentCount = visitorSnaps && sit.down !== null && unitNoise[0] >= p.num('environment.noise.silentCountAt');
  // D9.4.1: knowledge errors multiplied "by the noise factor for the offense on the road".
  const roadOffense = 1 + p.num('environment.noise.roadKnowledgeErrorPerNoise') * unitNoise[0];
  const noiseFactor: [number, number] = [visitorSnaps || !home ? roadOffense : 1, 1];
  const fam = home ? p.num('environment.home.familiarityZ') : 0;
  const familiarityZ: [number, number] = [sit.offense === 0 ? fam : 0, other === 0 ? fam : 0];
  const venue = home ? (sit.offense === 0 ? 'home' : 'road') : 'neutral';
  return { noise, unitNoise, venue, silentCount, noiseFactor, familiarityZ };
}

/** The gate's venue `noiseBase` for a level (J15 and T12 calibration games are played at a home venue). */
export function gateNoiseBase(level: string, p: Contract.ParamTable): number {
  return p.num(level === 'college' ? 'environment.gate.noiseBaseCollege' : 'environment.gate.noiseBasePro');
}
