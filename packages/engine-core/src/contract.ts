// The only implementations of the simulation contract's randomness and math interfaces (J13.1.1,
// J13.3.1). Packages that may not import @gm/engine-core (officiating, resolver-reference: P1.2.1)
// receive these through their inputs; nobody writes a second generator or a second math library.
import type { StreamSource, DeterministicMath, RandomStream } from '@gm/schema';
import { stream, type WorldSeed } from './streams.ts';
import { dSin, dCos, dAtan2, dExp, dLog, dPow, dSqrt, logistic } from './dmath.ts';

/** A stream source bound to one seed (the game seed of J13.4.1). The same key always restarts the same sequence. */
export function streamSource(seed: WorldSeed): StreamSource {
  return (name, scope): RandomStream => stream(seed, name, scope);
}

export const DMATH: DeterministicMath = {
  sin: dSin, cos: dCos, atan2: dAtan2, exp: dExp, log: dLog, pow: dPow, sqrt: dSqrt, logistic,
};

/**
 * The whole simulation contract under one name, for packages that may import engine-core but not
 * schema (engine-game, P1.2.1): `import { Contract } from '@gm/engine-core'`.
 */
export * as Contract from '@gm/schema';
