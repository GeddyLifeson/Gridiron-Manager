// The neutral input (plans/engine-build-plan.md WP-17 acceptance: neutral input gives NEUTRAL_ENVIRONMENT).
// A fixed dome at sea level on the neutral surface with no crowd: every derived multiplier is 1.
import type { Contract } from '@gm/engine-core';
import { heatIndexF } from './physics.ts';
import type { GameEnvironmentInput, VenueEnvironment } from './types.ts';

export const NEUTRAL_VENUE: VenueEnvironment = {
  roofKind: 'fixed_dome', surfaceType: 'core:neutral', surfaceKind: 'artificial', altitudeFt: 0, noiseBase: 0,
  windShelter: 0, fieldAxisBearingDeg: 90, climate: null,
};

/** Neutral game input for tests and for callers that have no venue yet. */
export function neutralInput(gameId: string | number = 0): GameEnvironmentInput {
  return { gameId, venue: NEUTRAL_VENUE, month: 1, day: 1, kickoffLocalHour: 13 };
}

/** Heat index of a snapshot (J12.4.2), the `heatIndexF` input of the fatigue module's EnvironmentExposure (D10.5.1). */
export function heatIndexOf(env: Contract.Environment, m: Contract.DeterministicMath): number {
  return heatIndexF(env.tempF, env.humidity, m);
}
