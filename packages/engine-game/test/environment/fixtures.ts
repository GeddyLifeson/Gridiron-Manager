// FIXTURE DATA for the environment tests. Venues, dates and seeds are made up to drive the formulas; none is a
// football fact. Climate normals are the one real row in the G-11 data (Green Bay, NOAA NCEI 1991-2020);
// rule values come from the repo's real rule sets.
import { readFileSync } from 'node:fs';
import { DMATH, seedFromNumber, streamSource } from '@gm/engine-core';
import { resolveRuleSet } from '@gm/rules-data';
import {
  environmentParamTable, type ClimateNormals, type EnvironmentDeps, type GameEnvironmentInput, type VenueEnvironment,
} from '../../src/environment/index.ts';

export const P = environmentParamTable();
export const PRO = resolveRuleSet('pro_2026');
export const COLLEGE = resolveRuleSet('college_2026');

export function deps(seed = 17, params = P): EnvironmentDeps {
  return { params, rules: PRO, math: DMATH, streams: streamSource(seedFromNumber(seed)) };
}

interface RefLocation { id: string; climate: { normals: ClimateNormals | null } }
const refs = JSON.parse(readFileSync(new URL('../../../football-content/data/world/reference-locations.json', import.meta.url), 'utf8')) as { locations: RefLocation[] };
export const REFERENCE_LOCATIONS = refs.locations;
export const GREEN_BAY = REFERENCE_LOCATIONS.find((l) => l.id === 'greenbay')!.climate.normals!;

export function venue(o: Partial<VenueEnvironment> = {}): VenueEnvironment {
  return {
    roofKind: 'open', surfaceType: 'core:grass', surfaceKind: 'natural', altitudeFt: 600, noiseBase: 0.8,
    windShelter: 0.8, fieldAxisBearingDeg: 90, climate: GREEN_BAY, ...o,
  };
}

export function game(o: Partial<GameEnvironmentInput> = {}): GameEnvironmentInput {
  return { gameId: 'g1', venue: venue(), month: 12, day: 15, kickoffLocalHour: 13, ...o };
}

export function mean(xs: readonly number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }
export function sd(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}
