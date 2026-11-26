// Trait fit between two people (X7.2.1). Computed on demand, never stored, never shown.
// Fit = closeness on a content list of facets, minus friction terms for named pairings, plus a seeded
// per-pair term. A pair with a protected person or the user has fit 0 and draws no pair term: only
// shared history moves their edge.
import type { PersonOrigin } from '@gm/schema';
import { rp, type PairDraw } from './params.ts';

/** The facets fit compares (X7.2.1 content list; Assumption, open until research R26). */
export const FIT_FACETS = ['work_habits', 'discipline', 'candor'] as const;

/** How the two people stand to each other, for the friction terms. */
export type PairRole = 'peers' | 'boss_and_subordinate' | 'head_coach_and_play_caller';

export interface FitPerson {
  readonly id: number;
  readonly origin: PersonOrigin;
  /** True for a protected person (A6.3.1, X14): no facets are read. */
  readonly protected: boolean;
  /** X1.1.1 facets, 0 to 100. Empty for the user and for imported people. */
  readonly facets: Readonly<Record<string, number>>;
}

export interface FitInput {
  readonly a: FitPerson;
  readonly b: FitPerson;
  /** When `role` names a boss, `a` is the boss (head coach for the play caller pair). */
  readonly role: PairRole;
  readonly pairDraw: PairDraw;
}

/** Whether a person's facets may be read for fit (X7.2.1: generated people only; not the user; not protected). */
export function fitReadable(p: FitPerson): boolean {
  return !p.protected && p.origin === 'generated';
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function facet(p: FitPerson, name: string): number {
  return p.facets[name] ?? rp('fit.facet.middle');
}

/** Mean closeness on the content list, mapped from 0..1 to -1..+1 (Assumption: the leaf gives the range only). */
export function closeness(a: FitPerson, b: FitPerson, facets: readonly string[] = FIT_FACETS): number {
  const span = rp('fit.facet.span');
  let sum = 0;
  for (const f of facets) sum += 1 - Math.abs(facet(a, f) - facet(b, f)) / span;
  const mean = facets.length > 0 ? sum / facets.length : 0;
  return 2 * mean - 1;
}

/** Friction for the named pairings of X7.2.1. Returns a non-negative amount to subtract. */
export function friction(boss: FitPerson, other: FitPerson, role: PairRole): number {
  const high = rp('fit.high');
  const low = rp('fit.low');
  let f = 0;
  if (role === 'boss_and_subordinate' || role === 'head_coach_and_play_caller') {
    if (facet(boss, 'ego') >= high && facet(other, 'ego') >= high) f += rp('fit.friction.egoPair');
    if (facet(other, 'candor') >= high && facet(boss, 'candor') <= low) f += rp('fit.friction.candorUnderLow');
  }
  if (role === 'head_coach_and_play_caller') {
    if (Math.abs(facet(boss, 'risk_tolerance') - facet(other, 'risk_tolerance')) >= rp('fit.riskGap.far')) f += rp('fit.friction.riskGap');
  }
  return f;
}

/** The hidden per-pair chemistry term, uniform in [-range, +range), keyed by the two ids in order. */
export function pairTerm(aId: number, bId: number, draw: PairDraw): number {
  const lo = aId < bId ? aId : bId;
  const hi = aId < bId ? bId : aId;
  const range = rp('fit.pairTerm.range');
  return (2 * draw(lo, hi) - 1) * range;
}

/** Fit -1 to +1 (X7.2.1). */
export function fit(input: FitInput): number {
  const { a, b, role, pairDraw } = input;
  if (!fitReadable(a) || !fitReadable(b)) return 0;
  return clamp(closeness(a, b) - friction(a, b, role) + pairTerm(a.id, b.id, pairDraw), -1, 1);
}
