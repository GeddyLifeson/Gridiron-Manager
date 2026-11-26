// The estimate record and how it moves (D6.1.1, D6.4.1, D6.4.3, D6.4.4).
// An estimate is a normal belief held by one organisation about one attribute of one person, in ISS
// (or real units for measurables). Nothing in this file reads a true value: it combines evidence items
// that observe.ts (or a user's own grade) produced.
import type { WorldDate } from '@gm/schema';
import { p } from './params.ts';

/** Who contributed evidence, kept so the band floor can count independent evaluators (D6.4.3). */
export interface Contributor {
  /** Person id of the evaluator (staff, scout, or the user). */
  readonly id: number;
  /** Reporting line: evaluators on the same line are not independent (D6.4.3). */
  readonly line: string;
}

/** One organisation's belief about one attribute (D6.1.1 outputs). */
export interface Estimate {
  readonly mean: number;
  /** The organisation's variance, never below the band floor of its evaluators (D6.4.3). Shown as the band. */
  readonly variance: number;
  /**
   * Variance from noise alone, before the floor (README S-01). The mean is updated with this one, so it keeps
   * converging on the true value with unbiased evidence (D6.1.1) while the shown band stops at the floor.
   */
  readonly noiseVariance: number;
  /** Evidence units folded in (snaps, reps, sessions...). */
  readonly evidenceCount: number;
  /** Date of the last evidence item, or null for a prior with no look yet. Shown as "last seen". */
  readonly lastEvidence: WorldDate | null;
  /** Date drift was last applied up to (D6.4.4). Never earlier than lastEvidence. */
  readonly agedTo: WorldDate;
  readonly contributors: readonly Contributor[];
  /** Set when the belief rests on public information only (D6.4.1 note). */
  readonly publicOnly: boolean;
}

/** An evidence item in the D6.4.2 output shape: (attribute, observed value, variance), plus who and when. */
export interface EvidenceItem {
  readonly attribute: string;
  readonly value: number;
  readonly variance: number;
  /** Units this item stands for (a film session of 40 snaps is one item with units 40). */
  readonly units: number;
  readonly date: WorldDate;
  readonly evaluator: Contributor;
}

/**
 * Evaluation skill of a contributor, used only for the band floor (D6.4.3). The caller looks it up:
 * skill is a hidden parameter of AI staff (truth), so it is never stored on an estimate. The user's own
 * contributions read `skill.userTerm` (E9.1.3 case 1).
 */
export type SkillOf = (contributorId: number) => number;

export function yearsBetween(from: WorldDate, to: WorldDate): number {
  const y = (to.seasonYear - from.seasonYear) + (to.dayIndex - from.dayIndex) / p('drift.daysPerYear');
  return y > 0 ? y : 0;
}

function laterOf(a: WorldDate, b: WorldDate): WorldDate {
  if (a.seasonYear !== b.seasonYear) return a.seasonYear > b.seasonYear ? a : b;
  return a.dayIndex >= b.dayIndex ? a : b;
}

/** Yearly drift sd by age (D6.4.4). */
export function driftSd(age: number): number {
  if (age < p('drift.youngBelowAge')) return p('drift.sdUnder23');
  if (age >= p('drift.oldFromAge')) return p('drift.sd30Plus');
  return p('drift.sd23to29');
}

/**
 * Inflates variance for time passed since `agedTo` (D6.4.4): drift variance = (yearly drift sd)^2 x years.
 * Called before each update and whenever a band is read, so a player unseen for a year shows a wider band.
 * Age is the person's age at `agedTo`. A retired person's estimates are frozen: pass `frozen`.
 */
export function ageTo(e: Estimate, date: WorldDate, age: number, frozen = false): Estimate {
  const years = yearsBetween(e.agedTo, date);
  if (years === 0 || frozen) return years === 0 ? e : { ...e, agedTo: laterOf(e.agedTo, date) };
  const d = driftSd(age) * driftSd(age) * years;
  return { ...e, variance: e.variance + d, noiseVariance: e.noiseVariance + d, agedTo: laterOf(e.agedTo, date) };
}

/** After a major injury (D11 severity long or above), physical attributes widen at once (D6.4.4). */
export function widenForMajorInjury(e: Estimate): Estimate {
  const sd = p('drift.majorInjurySd');
  return { ...e, variance: e.variance + sd * sd, noiseVariance: e.noiseVariance + sd * sd };
}

function lineCount(cs: readonly Contributor[]): number {
  return new Set(cs.map((c) => c.line)).size;
}

/**
 * The band floor (D6.4.3): floor sd = (base + span x (1 - mean skill / 100)) / sqrt(independent lines),
 * never below the minimum. No contributors, no floor: a prior keeps its own variance.
 */
export function floorSd(contributors: readonly Contributor[], skillOf: SkillOf): number {
  if (contributors.length === 0) return 0;
  let sum = 0;
  for (const c of contributors) sum += skillOf(c.id);
  const meanSkill = sum / contributors.length;
  const raw = (p('floor.base') + p('floor.skillSpan') * (1 - meanSkill / p('skill.divisor'))) / Math.sqrt(lineCount(contributors));
  return raw > p('floor.minimum') ? raw : p('floor.minimum');
}

/** A starting belief (D6.4.1). See prior.ts for how mean and sd are chosen. */
export function makePrior(mean: number, sd: number, date: WorldDate): Estimate {
  return { mean, variance: sd * sd, noiseVariance: sd * sd, evidenceCount: 0, lastEvidence: null, agedTo: date, contributors: [], publicOnly: true };
}

/**
 * Folds one evidence item in with the precision-weighted rule of D6.1.1, after drift (D6.4.4), then holds
 * the shown variance at or above the floor of the contributing evaluators (D6.4.3). The rule runs on the
 * noise variance, so the floor widens the band without making the mean forget old evidence (README S-01).
 * `item.variance` is the variance of the whole item (already divided by its units).
 */
export function update(e0: Estimate, item: EvidenceItem, age: number, skillOf: SkillOf): Estimate {
  if (!(item.variance > 0) || !Number.isFinite(item.value)) throw new Error('evidence needs a finite value and a positive variance');
  const e = ageTo(e0, item.date, age);
  const newVar = 1 / (1 / e.noiseVariance + 1 / item.variance);
  const newMean = newVar * (e.mean / e.noiseVariance + item.value / item.variance);
  const contributors = e.contributors.some((c) => c.id === item.evaluator.id)
    ? e.contributors
    : [...e.contributors, item.evaluator];
  const f = floorSd(contributors, skillOf);
  const variance = newVar > f * f ? newVar : f * f;
  return {
    mean: newMean,
    variance,
    noiseVariance: newVar,
    evidenceCount: e.evidenceCount + item.units,
    lastEvidence: item.date,
    agedTo: laterOf(e.agedTo, item.date),
    contributors,
    publicOnly: false,
  };
}

/** Folds many items in order. */
export function updateAll(e: Estimate, items: readonly EvidenceItem[], age: number, skillOf: SkillOf): Estimate {
  let cur = e;
  for (const it of items) cur = update(cur, it, age, skillOf);
  return cur;
}

/** Band half-width for the shown 80 percent band (D6.1.1). */
export function halfWidth(variance: number): number {
  return p('band.z') * Math.sqrt(variance);
}

/** The shown band: mean plus and minus z sd (D6.1.1). */
export function band(e: Pick<Estimate, 'mean' | 'variance'>): { mean: number; low: number; high: number } {
  const h = halfWidth(e.variance);
  return { mean: e.mean, low: e.mean - h, high: e.mean + h };
}
