// One player's development year in order: rollover (age, growth, aging draw), then the D7.7.1
// windows. The world loop (G-81) owns the calendar and the streams; this is the per-person step it
// calls, and the headless default when no practice plan exists.
import type { AttributeId, DeterministicMath, PlayingBlock, RandomStream } from '@gm/schema';
import { agingRollover, applyAgingFraction } from './aging.ts';
import { applyBody } from './body.ts';
import { familyOf, type PositionFamily } from './classes.ts';
import { developSpan, FACET } from './gain.ts';
import { growBody } from './growth.ts';
import { num, type DevNumbers } from './params.ts';
import { defaultWeeklyReps, WINDOWS, type Role, type Window } from './reps.ts';

export interface PersonForDevelopment {
  readonly position: string;
  /** Age on September 1 of the season being entered (D1.1.1). */
  readonly ageYears: number;
  readonly playing: PlayingBlock;
  readonly facets: Readonly<Record<string, number>>;
}

/**
 * Offseason rollover for one player: grow the body (to 23), draw and apply the rollover share of the
 * year's aging, and reapply body factors to attributes and drill results.
 */
export function rollover(n: DevNumbers, who: PersonForDevelopment, stream: RandomStream, heavyLoadLastSeason = false): PlayingBlock {
  const family = familyOf(who.position);
  const body = growBody(n, who.playing, who.ageYears, family);
  const grown: PlayingBlock = { ...who.playing, heightIn: body.heightIn, weightLb: body.weightLb };
  const aged = agingRollover(n, grown, family, who.ageYears, stream, heavyLoadLastSeason);
  return applyBody(n, aged, who.ageYears, family);
}

/** One in-season month of aging (D8.2.1: one eighth of the year), with body factors reapplied. */
export function agingMonth(n: DevNumbers, p: PlayingBlock, ageYears: number, family: PositionFamily): PlayingBlock {
  return applyBody(n, applyAgingFraction(n, p, num(n, 'aging.monthlyShare')), ageYears, family);
}

export interface WindowPlan {
  readonly window: Window;
  readonly weeks: number;
  /** Credited reps per week; omitted = default reps for the role (headless and AI fallback). */
  readonly reps?: Readonly<Partial<Record<AttributeId, number>>>;
  readonly role: Role;
  readonly teaching?: Readonly<Partial<Record<AttributeId, number>>>;
  readonly coachingPoints?: readonly AttributeId[];
  readonly freshness?: number;
}

/** The default year: offseason program, camp, season, time away (weeks from params). */
export function defaultYearPlan(n: DevNumbers, role: Role): WindowPlan[] {
  return WINDOWS.map((w) => ({ window: w, weeks: num(n, `year.weeks.${w}`), role }));
}

/**
 * A full development year for one player. `streamFor(i)` gives the stream for step i: 0 is the
 * rollover, 1.. the windows in order. In-season aging months are applied after the season window.
 */
export function developYear(n: DevNumbers, math: DeterministicMath, who: PersonForDevelopment, plan: readonly WindowPlan[], streamFor: (step: number) => RandomStream, heavyLoadLastSeason = false): PlayingBlock {
  const family = familyOf(who.position);
  let p = rollover(n, who, streamFor(0), heavyLoadLastSeason);
  plan.forEach((w, i) => {
    const reps = w.reps ?? defaultWeeklyReps(n, family, w.window, w.role, who.facets[FACET.workEthic]);
    p = developSpan(n, math, p, {
      ageYears: who.ageYears, weeks: w.weeks, reps, teaching: w.teaching, coachingPoints: w.coachingPoints,
      freshness: w.freshness, facets: who.facets,
    }, streamFor(i + 1));
    if (w.window === 'inSeason') {
      for (let m = 0; m < num(n, 'aging.seasonMonths'); m++) p = agingMonth(n, p, who.ageYears, family);
    }
  });
  return p;
}
