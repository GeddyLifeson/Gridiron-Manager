// Priors: what an organisation believes before it has looked (D6.4.1).
import type { WorldDate } from '@gm/schema';
import { makePrior, type Estimate } from './estimate.ts';
import { p } from './params.ts';

/** How much public information there is about a person on this attribute (D6.4.1). */
export type PublicInformation = 'none' | 'production' | 'established_starter';

export interface PriorInput {
  /** Population mean of the attribute at the person's position and level (D13.2.2 profile, census). */
  readonly positionLevelMean: number;
  /**
   * What public facts imply (age, size, ranking, statistics, awards), already turned into ISS by the
   * caller's regression on public facts, or null when there are none. A public ranking is itself an
   * estimate by generated media scouts with their own noise (D6.4.1 edge case).
   */
  readonly publicImplied: number | null;
  readonly information: PublicInformation;
  readonly date: WorldDate;
}

export function priorSd(information: PublicInformation): number {
  if (information === 'established_starter') return p('prior.sdEstablishedStarter');
  if (information === 'production') return p('prior.sdPublicProduction');
  return p('prior.sdNoInformation');
}

/**
 * Prior mean = the position and level average, moved toward what public facts imply by the configured
 * regression share; prior sd = 12, 8 or 6 ISS by how much is public (D6.4.1). Every organisation starts
 * from the same public prior.
 */
export function priorFor(input: PriorInput): Estimate {
  const mean = input.publicImplied === null
    ? input.positionLevelMean
    : input.positionLevelMean + p('prior.publicRegression') * (input.publicImplied - input.positionLevelMean);
  return makePrior(mean, priorSd(input.information), input.date);
}
