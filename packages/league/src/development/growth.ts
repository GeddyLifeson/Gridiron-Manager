// Body growth from 14 to 23 (D8.1.1) with the college-age parameters of T8.1.1: height, weight and
// strength move toward hidden adult targets; speed is nearly fixed from 18. Shares are read from
// tables.json; effective age is age minus the maturity offset, so late developers grow later.
import { possible, type DeterministicMath, type PlayingBlock, type RandomStream } from '@gm/schema';
import { GROWTH_GROUP, type PositionFamily } from './classes.ts';
import { HIDDEN, hiddenNum } from './hidden.ts';
import { interp, num, type DevNumbers } from './params.ts';

export interface GrowthShares {
  readonly height: number;
  readonly weight: number;
  readonly speed: number;
  readonly strength: number;
}

/** Cumulative share of the four-year college strength gain after `years` college years (T8.1.1 rule 1). */
export function collegeStrengthProgress(n: DevNumbers, years: number): number {
  const shares = n.tables.collegeYearShare.shares;
  if (years <= 0) return 0;
  let cum = 0;
  for (let i = 0; i < shares.length; i++) {
    const s = shares[i]!;
    if (years >= i + 1) cum += s;
    else return cum + s * (years - i);
  }
  return cum;
}

/** Shares of adult values at an effective age (D8.1.1 table, T8.1.1 from 18). */
export function growthShares(n: DevNumbers, effectiveAge: number, family: PositionFamily): GrowthShares {
  const g = n.tables.growth;
  const gain = num(n, `growth.collegeStrengthGain.${GROWTH_GROUP[family]}`);
  const start = num(n, 'growth.collegeStartAge');
  const at18 = 1 / (1 + gain);
  const strength = effectiveAge < start
    ? at18 * interp(g.ages, g.strengthRel, effectiveAge)
    : at18 * (1 + gain * collegeStrengthProgress(n, effectiveAge - start));
  return {
    height: interp(g.ages, g.height, effectiveAge),
    weight: interp(g.ages, g.weight, effectiveAge),
    speed: interp(g.ages, g.speed, effectiveAge),
    strength: Math.min(1, strength),
  };
}

export function effectiveAge(n: DevNumbers, p: PlayingBlock, ageYears: number): number {
  return ageYears - hiddenNum(p, HIDDEN.maturityOffset, 0);
}

/** Draw the D7/D8 hidden parameters a new person needs (for G-17 and for people created without them). */
export function drawDevelopmentTraits(n: DevNumbers, math: DeterministicMath, stream: RandomStream): Record<string, number> {
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  // Development rate: mean 1, log-normal, uncapped (D7.4.2 ruling).
  const sdLog = num(n, 'devRate.sdLog');
  const devRate = math.exp(sdLog * stream.normal() - (sdLog * sdLog) / (1 + 1));
  const agingTrait = Math.max(num(n, 'aging.traitMin'), num(n, 'aging.traitMean') + stream.normal() * num(n, 'aging.traitSd'));
  const mMax = num(n, 'growth.maturityOffsetMax');
  const maturity = clamp(stream.normal() * num(n, 'growth.maturityOffsetSd'), -mMax, mMax);
  const swing = num(n, 'growth.programSwing');
  // Triangular on [-1, 1]: most programs are near average.
  const disposition = 1 + swing * (stream.uniform() + stream.uniform() - 1);
  const spurt = stream.chance(possible(num(n, 'growth.lateSpurtChance'))) ? stream.uniform() * num(n, 'growth.lateSpurtMaxIn') : 0;
  return {
    [HIDDEN.devRate]: devRate,
    [HIDDEN.agingTrait]: agingTrait,
    [HIDDEN.maturityOffset]: maturity,
    [HIDDEN.growthDisposition]: disposition,
    [HIDDEN.lateSpurtIn]: spurt,
    [HIDDEN.form]: 1,
    [HIDDEN.surroundings]: 1,
    [HIDDEN.agingIndex]: 1,
    [HIDDEN.agingYearDelta]: 0,
    [HIDDEN.heavyLoad]: 0,
  };
}

/**
 * Height and weight for this year (D8.1.1). Height follows the share table plus any late spurt
 * spread from 17 to the adult age. Weight gain toward the share target is multiplied by the growth
 * disposition (program and work ethic, 0.85 to 1.15) and never passes the adult target. After the
 * adult age the body is left to weight plans (D1.2), which this module does not own.
 */
export function growBody(n: DevNumbers, p: PlayingBlock, ageYears: number, family: PositionFamily): { heightIn: number; weightLb: number } {
  const eff = effectiveAge(n, p, ageYears);
  const adultAge = num(n, 'growth.adultAge');
  const adultH = hiddenNum(p, HIDDEN.adultHeightIn, p.heightIn);
  const adultW = hiddenNum(p, HIDDEN.adultWeightLb, p.weightLb);
  const sh = growthShares(n, eff, family);
  const spurtStart = num(n, 'growth.lateSpurtMinAge');
  const spurt = hiddenNum(p, HIDDEN.lateSpurtIn, 0);
  const spurtShare = eff <= spurtStart ? 0 : Math.min(1, (eff - spurtStart) / (adultAge - spurtStart));
  const heightIn = Math.max(p.heightIn, adultH * sh.height - spurt * (1 - spurtShare));
  if (eff >= adultAge) return { heightIn, weightLb: p.weightLb };
  const target = adultW * sh.weight;
  const disp = hiddenNum(p, HIDDEN.growthDisposition, 1);
  const weightLb = target > p.weightLb ? Math.min(adultW, p.weightLb + (target - p.weightLb) * disp) : p.weightLb;
  return { heightIn, weightLb };
}
