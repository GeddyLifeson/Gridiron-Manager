// Crew tendencies (B11.4.1): each crew has a multiplier per foul family and an accuracy value, drawn
// once when the crew is created. The caller owns the stream (crew creation is a world event, not a
// play), so this module names no stream of its own.
import { FoulFamily, type OfficialPosition, type OfficialsCrew, type ParamTable, type RandomStream } from '@gm/schema';
import { CREW } from './params.ts';
import { OFFICIAL_POSITIONS } from './zones.ts';

const FAMILIES: readonly string[] = FoulFamily.options;

/** A crew that calls every family at the league rate with league-average accuracy. */
export function neutralCrew(crewId: number, positions: readonly OfficialPosition[] = OFFICIAL_POSITIONS): OfficialsCrew {
  const crewFactor: Record<string, number> = {};
  for (const f of FAMILIES) crewFactor[f] = 1;
  return { crewId, positions: [...positions], crewFactor, accuracy: 1, pace: 1 };
}

/**
 * Draws a crew (B11.4.1 rules 2 and 3). A regular crew: each family multiplier is normal around 1,
 * kept inside a floor and a ceiling; accuracy is uniform in its range. A postseason crew: neutral
 * tendencies and accuracy from the better, narrower range (B11.4.1 edge case).
 */
export function drawCrew(crewId: number, stream: RandomStream, params: ParamTable, kind: 'regular' | 'postseason', positions: readonly OfficialPosition[] = OFFICIAL_POSITIONS): OfficialsCrew {
  const crew = neutralCrew(crewId, positions);
  const lo = params.num(kind === 'postseason' ? CREW.postseasonAccuracyMin : CREW.accuracyMin);
  const hi = params.num(kind === 'postseason' ? CREW.postseasonAccuracyMax : CREW.accuracyMax);
  if (kind === 'regular') {
    const sd = params.num(CREW.crewFactorSd);
    const floor = params.num(CREW.crewFactorMin);
    const ceiling = params.num(CREW.crewFactorMax);
    for (const f of FAMILIES) {
      const v = 1 + stream.normal() * sd;
      crew.crewFactor[f] = v < floor ? floor : v > ceiling ? ceiling : v;
    }
  }
  return { ...crew, accuracy: lo + stream.uniform() * (hi - lo) };
}
