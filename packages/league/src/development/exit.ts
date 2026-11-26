// The end of a career (D8.4.1). Two paths: "not wanted" emerges from roster decisions (K7), and
// "chooses to retire" is drawn here as a share of the measured total exit rate by age and position.
import { EXIT_GROUP, type PositionFamily } from './classes.ts';
import { FACET } from './gain.ts';
import { traitMultiplier } from './teaching.ts';
import { interp, num, type DevNumbers } from './params.ts';

/** Measured total exit rate (0 to 1) at an age (D8.4.1 table), linear between the table's ages. */
export function measuredExitRate(n: DevNumbers, family: PositionFamily, ageYears: number): number {
  const t = n.tables.exitRates;
  const row = t.groups[EXIT_GROUP[family]];
  if (!row) throw new Error(`no exit rates for ${EXIT_GROUP[family]}`);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < row.length; i++) {
    const v = row[i];
    if (v === null || v === undefined) continue;
    xs.push(t.ages[i]!);
    ys.push(v / num(n, 'scale.percent'));
  }
  return interp(xs, ys, ageYears);
}

/** Share of the total exit rate that is a choice to retire: 0 at 27, one third from 30 (D8.4.1). */
export function retireShare(n: DevNumbers, ageYears: number): number {
  const a0 = num(n, 'exit.retireShareStartAge');
  const a1 = num(n, 'exit.retireShareFullAge');
  const t = Math.min(1, Math.max(0, (ageYears - a0) / (a1 - a0)));
  return t * num(n, 'exit.retireShareMax');
}

export interface RetireInput {
  readonly family: PositionFamily;
  readonly ageYears: number;
  readonly majorInjuryLastYear: boolean;
  readonly lostStartingJob: boolean;
  readonly contenderWantsHim: boolean;
  readonly facets: Readonly<Record<string, number>>;
}

/** Offseason probability that a player chooses to retire (D8.4.1 path 2, D5.3.1 love of football). */
export function retirementChance(n: DevNumbers, r: RetireInput): number {
  let pr = retireShare(n, r.ageYears) * measuredExitRate(n, r.family, r.ageYears);
  if (r.majorInjuryLastYear) pr *= num(n, 'exit.majorInjury');
  if (r.lostStartingJob) pr *= num(n, 'exit.lostStartingJob');
  if (r.contenderWantsHim) pr *= num(n, 'exit.contenderWants');
  if ((r.facets[FACET.competitiveness] ?? num(n, 'trait.facetMid')) >= num(n, 'trait.competitivenessHigh')) pr *= num(n, 'exit.highCompetitiveness');
  // Love of football: x1.3 at the low end to x0.7 at the high end.
  pr *= traitMultiplier(n, r.facets[FACET.loveOfFootball], -num(n, 'trait.loveOfFootballRetireSwing'));
  return Math.min(1, Math.max(0, pr));
}

/** Mid-season retirement (D8.4.1 path 5): one quarter of the offseason chance. */
export function midSeasonRetirementChance(n: DevNumbers, r: RetireInput): number {
  return retirementChance(n, r) * num(n, 'exit.midSeasonShare');
}

/** Yearly chance a retired player asks to come back (D8.4.1 path 4): under 35 and still good enough to start somewhere. */
export function comebackChance(n: DevNumbers, ageYears: number, wouldStartSomewhere: boolean): number {
  return wouldStartSomewhere && ageYears < num(n, 'exit.comebackMaxAge') ? num(n, 'exit.comebackChance') : 0;
}
