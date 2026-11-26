// Generator constants (G-17). Every number here is either a starting value a bible leaf states
// (basis 'bible', with the leaf) or a named Assumption the bible leaves open (basis 'assumption'). None
// is a measured football fact: the measured facts live in ./data/pro-profiles.ts (computed from the
// project's combine data, D13.2.2) and ./norms.ts (D2.5.1 quantile table).
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

const MODULE = 'people.generator';
const ROWS: readonly Row[] = [
  // D13.2.1 step 9: redraw limit.
  ['maxRedraws', 20, 1, 100, 'count', 'bible', 'D13.2.1', 'D13.2.1 no generated person fails D13.1.2'],
  // D2.1.1 split: forty / ratio. Ratio from Pollock et al. 2021 combine means (CB 4.47 and 1.55, S 4.54 and
  // 1.56; 1 of 3, J2.1.2); no public split data (D2.1.1 open question). Residual sd is a guess.
  ['splitRatio', 2.89, 2.6, 3.1, 'ratio', 'assumption', 'D2.1.1', 'J2.2.1 solver convergence; D2.1.1 split research owed'],
  ['splitResidualSdS', 0.02, 0, 0.06, 's', 'assumption', 'D2.1.1', 'D2.1.1 split research owed'],
  // D1.2.1 arm and hand size are not in the data (Unverified). Linear in height, Assumption.
  ['armPerHeightIn', 0.45, 0.4, 0.5, 'ratio', 'assumption', 'D1.2.1', 'D1.2.1 arm and hand norms research owed'],
  ['armResidualSdIn', 1.0, 0, 2, 'in', 'assumption', 'D1.2.1', 'D1.2.1 arm and hand norms research owed'],
  ['handPerHeightIn', 0.13, 0.11, 0.15, 'ratio', 'assumption', 'D1.2.1', 'D1.2.1 arm and hand norms research owed'],
  ['handResidualSdIn', 0.4, 0, 1, 'in', 'assumption', 'D1.2.1', 'D1.2.1 arm and hand norms research owed'],
  // D1.2.3 handedness (Assumption in the bible).
  ['leftHandedThrowerShare', 0.08, 0, 0.3, 'ratio', 'bible', 'D1.2.3', 'D1.2.3 handedness research owed'],
  ['leftFootedKickerShare', 0.15, 0, 0.4, 'ratio', 'bible', 'D1.2.3', 'D1.2.3 handedness research owed'],
  ['eitherSideShare', 0.1, 0, 0.5, 'ratio', 'assumption', 'D1.2.3', 'D1.2.3 handedness research owed'],
  // D2.3.1 play strength z = 0.5 bench z + 0.3 weight z + 0.2 independent, then restandardised.
  ['playStrengthBench', 0.5, 0, 1, 'ratio', 'bible', 'D2.3.1', 'D2.3.1 bench-to-strength correlation 0.45 to 0.60'],
  ['playStrengthWeight', 0.3, 0, 1, 'ratio', 'bible', 'D2.3.1', 'D2.3.1 bench-to-strength correlation 0.45 to 0.60'],
  ['playStrengthIndependent', 0.2, 0, 1, 'ratio', 'bible', 'D2.3.1', 'D2.3.1 bench-to-strength correlation 0.45 to 0.60'],
  // D2.3.1 conflict: with the starting weights the bench-to-strength correlation is about 0.8, outside the
  // leaf's acceptance (0.45 to 0.60). The generator keeps the 5:3 bench-to-weight ratio and widens the
  // independent part per position so the correlation sits at this target (acceptance midpoint). Logged for the D2 owner.
  ['playStrengthBenchCorrTarget', 0.525, 0.45, 0.6, 'ratio', 'bible', 'D2.3.1', 'D2.3.1 bench-to-strength correlation 0.45 to 0.60'],
  // D2.4.1 stamina correlates -0.3 with weight z inside a position.
  ['staminaWeightCorr', -0.3, -0.8, 0, 'ratio', 'bible', 'D2.4.1', 'D10 snap-share targets'],
  // D2.4.2 durability multiplier: log-normal, sd 0.2 log units, clipped to 0.6 to 1.6.
  ['durabilityLogSd', 0.2, 0.05, 0.5, 'log', 'bible', 'D2.4.2', 'D2.4.2 worst decile misses about twice the games'],
  ['durabilityMin', 0.6, 0.3, 1, 'ratio', 'bible', 'D2.4.2', 'D2.4.2'],
  ['durabilityMax', 1.6, 1, 3, 'ratio', 'bible', 'D2.4.2', 'D2.4.2'],
  // D4.4.1 learning rate and D7.4.1 development rate: hidden, 0.6 to 1.5, mean 1.0. Spread is an Assumption.
  ['rateMin', 0.6, 0.3, 1, 'ratio', 'bible', 'D4.4.1', 'D4.4.1 rep ratio 3 to 2 test'],
  ['rateMax', 1.5, 1, 2, 'ratio', 'bible', 'D4.4.1', 'D4.4.1 rep ratio 3 to 2 test'],
  ['rateSd', 0.18, 0.05, 0.4, 'ratio', 'assumption', 'D7.4.1', 'G-20 development calibration'],
  // D3.9.1 consistency is an attribute on the ISS; the hidden game-to-game spread is not a separate draw.
  // ISS scale (D2.3.1, D3.1.1): 10 ISS = one sd among pro starters.
  ['issPerSd', 10, 10, 10, 'iss', 'bible', 'D2.3.1', 'D13.4.1 metric 3'],
  // Physical ISS 50 = average pro starter at the position. The profile is combine participants who reached
  // the league, not starters; until the census re-anchors (D13.4.2 rule 6) the profile mean maps to 50.
  ['physicalProfileIss', 50, 40, 60, 'iss', 'assumption', 'D2.3.1', 'D13.4.1 census, D13.4.2 rule 6'],
  // D3.1.1 per-attribute offset inside a technique group: sd 3 ISS.
  ['attributeOffsetSd', 3, 0, 10, 'iss', 'bible', 'D3.1.1', 'D3.1.1'],
  // Talent factor: share of a group ceiling explained by one person-level talent draw. Assumption.
  ['talentLoading', 0.6, 0, 0.95, 'ratio', 'assumption', 'D13.2.1', 'D13.4.5 class spread checks'],
  // Pro entrant ceilings for a primary group: the average entrant's ceiling sits at starter level. Assumption.
  ['proEntrantCeilingMean', 50, 30, 70, 'iss', 'assumption', 'D13.3.4', 'D13.4.1 metric 3 starter mean 50'],
  ['proEntrantCeilingSd', 10, 4, 15, 'iss', 'assumption', 'D13.3.4', 'D13.4.1 metric 3 starter sd 10'],
  ['tierCeilingSd', 6, 2, 12, 'iss', 'assumption', 'D13.3.2', 'D13.3.2 draftable count at 22'],
  // Current skill = ceiling - gap(age) + noise (D13.2.1 step 5). Noise sd is an Assumption.
  ['currentNoiseSd', 3, 0, 8, 'iss', 'assumption', 'D13.2.1', 'G-20 development calibration'],
  // D8.1.1 maturity offset: sd 0.7 years, limited to +-1.5.
  ['maturityOffsetSd', 0.7, 0, 1.5, 'y', 'bible', 'D8.1.1', 'D8.1.1 adult values within 1 percent at 23'],
  ['maturityOffsetMax', 1.5, 0, 3, 'y', 'bible', 'D8.1.1', 'D8.1.1'],
  // D8.1.1 late height spurt: 3 percent, up to 1.5 in after 17.
  ['lateSpurtShare', 0.03, 0, 0.1, 'ratio', 'bible', 'D8.1.1', 'D8.1.1'],
  ['lateSpurtMaxIn', 1.5, 0, 3, 'in', 'bible', 'D8.1.1', 'D8.1.1'],
  // D1.2.2 frame weight band: current weight sits within 92 to 110 percent of frame.
  ['frameWeightMin', 0.92, 0.8, 1, 'ratio', 'bible', 'D1.2.2', 'D1.2.2'],
  ['frameWeightMax', 1.10, 1, 1.2, 'ratio', 'bible', 'D1.2.2', 'D1.2.2'],
  // D13.1.2 plausibility: |z| above 3.5 flags; joint probability below 1 in 100,000 flags.
  ['plausibleAbsZ', 3.5, 2, 6, 'z', 'bible', 'D13.1.2', 'D13.1.2 every real combine row passes'],
  ['plausibleJointP', 0.00001, 0, 0.01, 'ratio', 'bible', 'D13.1.2', 'D13.1.2 the 330 lb 4.30 player is flagged'],
  // X1.2.1: a facet is drawn from a two-sided normal around the median, sd = (median - low) / divisor on the
  // low side and (high - median) / divisor on the high side, truncated at low and high. Divisor 6 puts 77.5
  // percent of a 0:50:100 row in the neutral band 40 to 60 (target 75 to 80) and under 0.01 percent in each
  // extreme band (target under 1).
  ['traitSideSdDivisor', 6, 3, 10, 'ratio', 'assumption', 'X1.2.1', 'X1.2.1 band shares within 2 points'],
  // D5.1.1 correlations, X1.1.2 rule_respect with discipline.
  ['corrWorkLove', 0.4, 0, 0.9, 'ratio', 'bible', 'D5.1.1', 'D5.1.1'],
  ['corrMaturityTemperament', 0.3, 0, 0.9, 'ratio', 'bible', 'D5.1.1', 'D5.1.1'],
  ['corrRuleRespectDiscipline', 0.3, 0, 0.9, 'ratio', 'bible', 'X1.1.2', 'X1.1.2'],
  // D5.1.1 maturity rises 1.5 per year from 18 to 26: the drawn value is the age-26 value.
  ['maturityPerYear', 1.5, 0, 5, 'index', 'bible', 'D5.1.1', 'D5.1.1'],
  ['maturityFromAge', 18, 14, 22, 'y', 'bible', 'D5.1.1', 'D5.1.1'],
  ['maturityToAge', 26, 22, 30, 'y', 'bible', 'D5.1.1', 'D5.1.1'],
  // X1.1.1: at most 3 goals; goal by-year horizon. Horizon is an Assumption.
  ['goalHorizonMinYears', 1, 0, 5, 'y', 'assumption', 'X1.1.4', 'X1.1.4 coordinator-goal test'],
  ['goalHorizonMaxYears', 6, 1, 15, 'y', 'assumption', 'X1.1.4', 'X1.1.4 coordinator-goal test'],
  ['goalNoByYearShare', 0.3, 0, 1, 'ratio', 'assumption', 'X1.1.4', 'X1.1.4'],
  // D13.4.5 class validator.
  ['classCountTolShare', 0.05, 0, 0.2, 'ratio', 'bible', 'D13.4.5', 'D13.4.5 under 5 percent regenerated'],
  ['classCountTolAbs', 2, 0, 10, 'count', 'bible', 'D13.4.5', 'D13.4.5'],
  ['classMeanTolSd', 0.15, 0.05, 0.5, 'sd', 'bible', 'D13.4.5', 'D13.4.5'],
  ['classSpreadTolShare', 0.15, 0.05, 0.5, 'ratio', 'bible', 'D13.4.5', 'D13.4.5'],
  // D13.4.5 conflict: a fixed 0.15 sd mean tolerance is about 2 standard errors for a 200-player cell, so a
  // correct class with dozens of checked means fails most of the time (measured: 63 percent of 30 classes; at 3.5 standard errors still 13 percent over about 180 checks a class),
  // against the leaf's own acceptance of under 5 percent regenerated. Tolerances widen to this many
  // standard errors where that is larger. Assumption, logged for the D13 owner.
  ['classSampleZ', 4, 2, 6, 'z', 'assumption', 'D13.4.5', 'D13.4.5 under 5 percent regenerated'],
  ['classMaxRegenerations', 5, 1, 20, 'count', 'bible', 'D13.4.5', 'D13.4.5'],
  // D13.4.2 correction rules.
  ['countGain', 0.5, 0, 1, 'ratio', 'bible', 'D13.4.2', 'D13.4.2 rule 2'],
  ['countMinFactor', 0.8, 0.5, 1, 'ratio', 'bible', 'D13.4.2', 'D13.4.2 rule 2'],
  ['countMaxFactor', 1.25, 1, 2, 'ratio', 'bible', 'D13.4.2', 'D13.4.2 rule 2'],
  ['talentStepSd', 0.1, 0, 0.5, 'sd', 'bible', 'D13.4.2', 'D13.4.2 rule 3'],
  ['talentCapSd', 0.5, 0, 2, 'sd', 'bible', 'D13.4.2', 'D13.4.2 rule 3 cap alarm'],
  ['talentTriggerTol', 1, 0.5, 3, 'tolerance', 'bible', 'D13.4.2', 'D13.4.2 rule 3'],
  ['talentWindowYears', 3, 1, 10, 'y', 'bible', 'D13.4.2', 'D13.4.2 inputs: last 3 years'],
  // Census tolerance for the pro-starter ISS mean (D13.4.1: tolerances live in config, set in calibration).
  ['starterIssMeanTol', 1.5, 0.5, 5, 'iss', 'assumption', 'D13.4.1', 'Q2 calibration'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: 'g17.1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a generator constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown generator parameter ${name}`);
  return v;
}

/** Talent tiers of D13.3.2: shares are the bible's starting values (Assumption, tuned by D13.4). */
export const TIER_SHARES: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = { 5: 0.003, 4: 0.015, 3: 0.08, 2: 0.30, 1: 0.602 };

/**
 * Tier ceiling means for a primary technique group, ISS on the absolute scale (Assumption, D13.3.2 rule 5:
 * "tier means are set so that, after development to 22, the top of the class reproduces the pro-entrant
 * profile"; G-44 tunes them against D13.3.4's draftable count). Tier 5 is "future pro starter level".
 */
export const TIER_CEILING_MEAN: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = { 5: 56, 4: 48, 3: 40, 2: 30, 1: 20 };

/**
 * Body shift and widening of the college-entrant profile by tier (D13.2.2: "the pro profile shifted and
 * widened by tier"). Shift is in profile sd toward the slow, weak end of each test; weight and height
 * shift by half as much. Values are Assumption, tuned by D13.4.5 and G-44.
 */
export const TIER_BODY_SHIFT_SD: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = { 5: 0, 4: 0.15, 3: 0.3, 2: 0.5, 1: 0.7 };
export const TIER_BODY_WIDEN: Readonly<Record<1 | 2 | 3 | 4 | 5, number>> = { 5: 1.0, 4: 1.05, 3: 1.1, 2: 1.2, 1: 1.3 };

/**
 * Expected gap between ceiling and current technique or mental skill by age, ISS (D13.2.1 step 5 runs
 * D7 backward). D7 owns the curve (G-20); this starting table is an Assumption so that a 22-year-old
 * entrant is about half a starter-sd below his ceiling and a 26-year-old is at it.
 */
export const AGE_GAP_ISS: readonly (readonly [number, number])[] = [
  [14, 34], [15, 31], [16, 28], [17, 25], [18, 21], [19, 17], [20, 13], [21, 9], [22, 6], [23, 4], [24, 2], [25, 1], [26, 0],
];

/** D8.1.1 youth growth: share of adult value reached by age (starting values, Assumption in the bible). */
export const GROWTH_TABLE: readonly { age: number; height: number; weight: number; strength: number; speed: number }[] = [
  { age: 14, height: 0.95, weight: 0.72, strength: 0.55, speed: 0.86 },
  { age: 16, height: 0.985, weight: 0.84, strength: 0.72, speed: 0.93 },
  { age: 18, height: 0.997, weight: 0.91, strength: 0.84, speed: 0.97 },
  { age: 20, height: 1, weight: 0.96, strength: 0.93, speed: 0.995 },
  { age: 22, height: 1, weight: 0.99, strength: 0.98, speed: 1 },
  { age: 23, height: 1, weight: 1, strength: 1, speed: 1 },
];

/** Linear interpolation in a sorted [x, y] table, clamped at the ends. */
export function interp(table: readonly (readonly [number, number])[], x: number): number {
  const first = table[0]!, last = table[table.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i]!;
    const [x0, y0] = table[i - 1]!;
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}
