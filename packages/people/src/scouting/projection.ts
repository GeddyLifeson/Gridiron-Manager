// Projection: what a player will become (D6.5.1, D6.4.5 rule 5; ruling MA-48). The organisation holds an
// estimate of each ceiling exactly as it holds estimates of current values (estimate.ts); this file turns
// the two into an internal projected mean, band and arrow, and those into the words a card shows.
// MA-48 (Marlon 2026-11-26): potential is never a number or a range. `project` is internal (AI ranking,
// recruiting, the draft board's order); only `potentialRead` output may reach a screen, and it holds no
// projected number. The lint check "D6.5.1 no projected number in UI" keeps `project`, `band` and the rest
// out of the UI layer. No true ceiling is read here.
import type { WorldDate } from '@gm/schema';
import type { Estimate } from './estimate.ts';
import type { Arrow } from './display.ts';
import { skillMultiplier } from './evidence.ts';
import { p } from './params.ts';

/** Projection noise sd for one scouting look: 14 ISS at 17, falling linearly to 6 by 23 (D6.5.1). */
export function projectionLookSd(age: number): number {
  const a0 = p('projection.youngAge');
  const a1 = p('projection.settledAge');
  const s0 = p('projection.noiseSdAt17');
  const s1 = p('projection.noiseSdAt23');
  if (age <= a0) return s0;
  if (age >= a1) return s1;
  return s0 + (s1 - s0) * (age - a0) / (a1 - a0);
}

/** Variance of one ceiling look by an evaluator of the given skill (D6.5.1 with the D6.4.2 skill rule). */
export function ceilingLookVariance(age: number, skill: number): number {
  const sd = projectionLookSd(age) * skillMultiplier(skill);
  return sd * sd;
}

/**
 * Share of the way from current value to ceiling covered after `years`. A D7 curve from the development
 * package (G-20) replaces this; until then the default is linear to `projection.defaultPeakAge`.
 */
export type CurveShare = (age: number, years: number) => number;

export const linearToPeak: CurveShare = (age, years) => {
  const left = p('projection.defaultPeakAge') - age;
  if (left <= 0) return 1;
  const f = years / left;
  return f > 1 ? 1 : f < 0 ? 0 : f;
};

export type Horizon = { readonly kind: 'peak' } | { readonly kind: 'years'; readonly years: number };

export interface Projection {
  readonly mean: number;
  readonly variance: number;
  readonly arrow: Arrow;
  readonly horizon: Horizon;
}

export function arrowFor(projectedMean: number, currentMean: number): Arrow {
  const d = projectedMean - currentMean;
  if (d >= p('projection.arrowIss')) return 'rising';
  if (d <= -p('projection.arrowIss')) return 'falling';
  return 'steady';
}

/**
 * The projected grade (D6.5.1): the median outcome of running the expected curve from the current estimate
 * toward the estimated ceiling, with an 80 percent band. A player moving up `levelsUp` levels has the band's
 * sd widened by 3 ISS per level (D6.4.5 rule 5). Players past 28 show no projection beyond the aging
 * outlook (D8): returns null.
 */
export function project(input: {
  readonly current: Pick<Estimate, 'mean' | 'variance'>;
  readonly ceiling: Pick<Estimate, 'mean' | 'variance'>;
  readonly age: number;
  readonly horizon: Horizon;
  readonly levelsUp?: number;
  readonly curve?: CurveShare;
}): Projection | null {
  if (input.age > p('projection.noneAfterAge')) return null;
  const { current, ceiling } = input;
  // A ceiling read below the current read means no growth is expected, not decline.
  const ceilMean = ceiling.mean > current.mean ? ceiling.mean : current.mean;
  const f = input.horizon.kind === 'peak' ? 1 : (input.curve ?? linearToPeak)(input.age, input.horizon.years);
  const mean = current.mean + f * (ceilMean - current.mean);
  const baseVar = (1 - f) * (1 - f) * current.variance + f * f * ceiling.variance;
  const sd = Math.sqrt(baseVar) + p('projection.levelJumpSd') * (input.levelsUp ?? 0);
  return { mean, variance: sd * sd, arrow: arrowFor(mean, current.mean), horizon: input.horizon };
}

// ---- Words layer (D6.5.1 "what the user sees"): a hunch or an explanation, signed and dated. ----

export type HunchStrength = 'strong' | 'modest' | 'steady' | 'doubt';

/** What an explanation can rest on (D6.5.1: age, frame, trend in graded performance, work habits). */
export type DriverKind = 'age' | 'frame' | 'trend' | 'work';

/** One evidence item behind the projection, with how far it pulls the internal projection (ISS, signed). */
export interface Driver {
  readonly kind: DriverKind;
  readonly pullIss: number;
}

/** What a card shows for potential. Words only: no field holds a projected number or band. */
export interface PotentialRead {
  readonly kind: 'hunch' | 'explanation';
  /** "I think there is more in him." or "I think there is more in him. Young for where he is; works at it." */
  readonly text: string;
  readonly direction: Arrow;
  /** "at his peak" or "in 2 years". */
  readonly horizon: string;
  /** Who wrote it. */
  readonly evaluator: string;
  readonly writtenOn: WorldDate;
}

/** Phrase table keyed by hunch strength; the evaluator picks the wording, so two can word one player differently. */
const HUNCH: Readonly<Record<HunchStrength, readonly string[]>> = {
  strong: ['I think there is a lot more in him.', 'The best of him is well ahead of him.', 'He has not come close to what he will be.'],
  modest: ['I think there is more in him.', 'He should keep getting better.', 'Some growth left in him, I would bet.'],
  steady: ['What you see is about what you get.', 'He is close to what he will be.', 'I do not see much more coming.'],
  doubt: ['I am not sure he holds this level.', 'I worry he has already peaked.', 'I would not count on more from him.'],
};
const TENTATIVE = ['Too early to say much, but', 'Hard to tell this young, but', 'Just a hunch at his age, but'];

/** Explanation phrases by driver and sign (D6.5.1 example: "long frame, 19, ... works at it"). */
const DRIVER: Readonly<Record<DriverKind, { readonly up: string; readonly down: string }>> = {
  age: { up: 'young for where he is', down: 'older than the good ones at his stage' },
  frame: { up: 'frame to add strength', down: 'frame is about filled out' },
  trend: { up: 'graded better each season', down: 'grades have slipped' },
  work: { up: 'works at it', down: 'the work habits worry me' },
};

export function hunchStrength(projection: Pick<Projection, 'mean' | 'variance'>, currentMean: number): HunchStrength {
  const sd = Math.sqrt(projection.variance);
  const z = sd > 0 ? (projection.mean - currentMean) / sd : 0;
  if (z >= p('words.strongHunchZ')) return 'strong';
  if (z >= p('words.modestHunchZ')) return 'modest';
  if (z > p('words.doubtZ')) return 'steady';
  return 'doubt';
}

function pick<T>(xs: readonly T[], key: number): T {
  const i = ((Math.trunc(key) % xs.length) + xs.length) % xs.length;
  return xs[i]!;
}

function lowerFirst(t: string): string {
  // The pronoun "I" keeps its capital.
  return t.length && !/^I\b/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t;
}

function capFirst(t: string): string {
  return t.length ? t[0]!.toUpperCase() + t.slice(1) : t;
}

export function horizonText(h: Horizon): string {
  return h.kind === 'peak' ? 'at his peak' : `in ${h.years} year${h.years === 1 ? '' : 's'}`;
}

/**
 * The words for one evaluator's read of a player's potential (D6.5.1). The internal projection picks the
 * hunch strength and direction; the largest drivers, when any pull at least `words.driverMinIss`, give the
 * explanation. Players past 28 get no read beyond the aging outlook (D8): returns null, as `project` does.
 */
export function potentialRead(input: {
  readonly projection: Projection | null;
  readonly currentMean: number;
  readonly age: number;
  readonly evaluator: { readonly id: number; readonly name: string };
  readonly writtenOn: WorldDate;
  readonly drivers?: readonly Driver[];
}): PotentialRead | null {
  const pr = input.projection;
  if (!pr || input.age > p('projection.noneAfterAge')) return null;
  const strength = hunchStrength(pr, input.currentMean);
  let hunch = pick(HUNCH[strength], input.evaluator.id);
  if (input.age < p('words.tentativeBelowAge')) hunch = `${pick(TENTATIVE, input.evaluator.id)} ${lowerFirst(hunch)}`;
  const min = p('words.driverMinIss');
  const top = [...(input.drivers ?? [])]
    .filter((d) => Math.abs(d.pullIss) >= min)
    .sort((a, b) => Math.abs(b.pullIss) - Math.abs(a.pullIss) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0))
    .slice(0, 2);
  const explanation = top.length ? capFirst(top.map((d) => (d.pullIss > 0 ? DRIVER[d.kind].up : DRIVER[d.kind].down)).join('; ')) + '.' : null;
  return {
    kind: explanation ? 'explanation' : 'hunch',
    text: explanation ? `${hunch} ${explanation}` : hunch,
    direction: pr.arrow,
    horizon: horizonText(pr.horizon),
    evaluator: input.evaluator.name,
    writtenOn: input.writtenOn,
  };
}
