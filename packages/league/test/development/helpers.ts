// Test fixtures for G-20. `makePlayer` is a stand-in for the G-17 person generator (being built in
// parallel): it fills a full PlayingBlock against the G-00 contract with plausible values. Its
// numbers are test fixtures, not game data.
import { ATTRIBUTE_IDS, type AttributeId, type PlayingBlock, type RandomStream } from '@gm/schema';
import { DMATH, seedFromNumber, stream } from '@gm/engine-core';
import { devNumbers, drawDevelopmentTraits, WORKED, HIDDEN, applyBody, type PositionFamily } from '../../src/development/index.ts';

export const N = devNumbers();
export const MATH = DMATH;

export function rng(seed: number, ...scope: (number | string)[]): RandomStream {
  return stream(seedFromNumber(seed), 'development', scope);
}

/** Fixture adult drill means by family (rough combine levels; fixture only). */
const FORTY: Record<PositionFamily, number> = { QB: 4.8, RB: 4.52, WR: 4.48, TE: 4.7, OL: 5.25, DL: 5.0, EDGE: 4.75, LB: 4.68, CB: 4.46, S: 4.53, K: 4.9, P: 4.95, LS: 5.0 };
const HEIGHT: Record<PositionFamily, number> = { QB: 75, RB: 70, WR: 73, TE: 76, OL: 77, DL: 75, EDGE: 76, LB: 74, CB: 71, S: 72, K: 72, P: 74, LS: 74 };
const WEIGHT: Record<PositionFamily, number> = { QB: 220, RB: 213, WR: 200, TE: 250, OL: 312, DL: 300, EDGE: 258, LB: 238, CB: 193, S: 205, K: 195, P: 210, LS: 240 };

export interface MakeOpts {
  readonly family: PositionFamily;
  readonly ageYears: number;
  /** Mean of the ceiling of worked attributes (50 = average pro starter). */
  readonly ceilingMean?: number;
  /** Mean gap below ceiling for worked attributes. */
  readonly gapMean?: number;
  readonly hidden?: Record<string, number>;
  /** Skip the hidden-trait draw and use neutral traits. */
  readonly neutral?: boolean;
}

export function makePlayer(s: RandomStream, o: MakeOpts): PlayingBlock {
  const worked = new Set<AttributeId>(WORKED[o.family]);
  const attributes: Record<string, number> = {};
  const ceilings: Record<string, number> = {};
  const cMean = o.ceilingMean ?? 50;
  const gMean = o.gapMean ?? 10;
  for (const a of ATTRIBUTE_IDS) {
    const isWorked = worked.has(a);
    const ceil = clamp(isWorked ? cMean + s.normal() * 8 : 25 + s.normal() * 5);
    const gap = Math.max(0, isWorked ? gMean + s.normal() * 3 : 2);
    ceilings[a] = ceil;
    attributes[a] = clamp(ceil - gap);
  }
  const traits = o.neutral
    ? { [HIDDEN.devRate]: 1, [HIDDEN.agingTrait]: 1, [HIDDEN.maturityOffset]: 0, [HIDDEN.growthDisposition]: 1, [HIDDEN.lateSpurtIn]: 0, [HIDDEN.form]: 1, [HIDDEN.agingIndex]: 1, [HIDDEN.agingYearDelta]: 0, [HIDDEN.heavyLoad]: 0 }
    : drawDevelopmentTraits(N, MATH, s);
  const forty = FORTY[o.family] + s.normal() * 0.08;
  const p: PlayingBlock = {
    position: o.family,
    lastJersey: null,
    heightIn: HEIGHT[o.family],
    weightLb: WEIGHT[o.family],
    attributes,
    tests: { fortyS: forty, tenSplitS: forty * 0.355, threeConeS: 7.1, shuttleS: 4.35, verticalIn: 33, broadIn: 118, changeOfDirectionZ: 0 },
    ceilings,
    hidden: {
      ...traits,
      [HIDDEN.adultHeightIn]: HEIGHT[o.family],
      [HIDDEN.adultWeightLb]: WEIGHT[o.family],
      ...o.hidden,
    },
    conditioning: 70,
    freshnessLongTerm: 1,
    eligibility: {
      college: { seasonsOfCompetitionUsed: 0, clockStartYear: null, redshirtUsed: false },
      pro: { seasonsOnRoster: 0, accruedSeasons: 0, creditedSeasons: 0 },
    },
  };
  // Set body factors and adult drill targets for the starting age.
  return applyBody(N, p, o.ageYears, o.family);
}

export function clamp(v: number): number { return Math.min(100, Math.max(0, v)); }

export function meanOf(xs: readonly number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }
export function sdOf(xs: readonly number[]): number { const m = meanOf(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); }
