// X11.2.2 validate and reseed. D13.4.5 (the generator's class validator) checks football make-up; this
// file adds the X checks: cohort size within 15 percent of target, every person with a trait block, no
// duplicate identity, and trait band shares within 3 points of target for cohorts of 500 or more (widened to
// `bandSampleZ` standard errors where larger; see params for the conflict). On a
// failure the cohort is rebuilt with a derived seed (world seed, season, kind, attempt), at most 3
// times, then accepted with a `cohort_validation_warning`.
import { TraitBlock, type PersonRecord } from '@gm/schema';
import { param } from './params.ts';
import { sizeWithinTolerance } from './targets.ts';

/** X1.2.1 rule 2 bands for a 0 to 100 facet. */
export const FACET_BANDS = ['extreme_low', 'strong_low', 'mild_low', 'neutral', 'mild_high', 'strong_high', 'extreme_high'] as const;
export type FacetBand = (typeof FACET_BANDS)[number];
const BAND_EDGES: readonly (readonly [number, number])[] = [[0, 9], [10, 24], [25, 39], [40, 60], [61, 75], [76, 90], [91, 100]];

export function facetBand(v: number): FacetBand {
  const i = BAND_EDGES.findIndex(([lo, hi]) => v >= lo && v <= hi);
  return FACET_BANDS[i < 0 ? (v < 0 ? 0 : FACET_BANDS.length - 1) : i]!;
}

export type BandShares = Record<string, Record<FacetBand, number>>;

/** Share of people in each band, per facet, over the trait blocks given. */
export function bandShares(blocks: readonly TraitBlock[]): BandShares {
  const out: BandShares = {};
  const counts: Record<string, Record<FacetBand, number>> = {};
  for (const b of blocks) {
    for (const [f, v] of Object.entries(b.facets)) {
      counts[f] ??= Object.fromEntries(FACET_BANDS.map((x) => [x, 0])) as Record<FacetBand, number>;
      counts[f]![facetBand(v)]++;
    }
  }
  for (const [f, c] of Object.entries(counts)) {
    const n = FACET_BANDS.reduce((a, x) => a + c[x], 0);
    out[f] = Object.fromEntries(FACET_BANDS.map((x) => [x, n ? c[x] / n : 0])) as Record<FacetBand, number>;
  }
  return out;
}

export type CohortProblem =
  | { readonly check: 'size'; readonly size: number; readonly target: number }
  | { readonly check: 'trait_block'; readonly personId: number }
  | { readonly check: 'duplicate_identity'; readonly personIds: readonly [number, number] }
  | { readonly check: 'band_share'; readonly facet: string; readonly band: FacetBand; readonly share: number; readonly target: number };

/** Identity key: name plus birth date plus hometown. Two people with all three equal are one identity twice. */
export function identityKey(p: Pick<PersonRecord, 'name' | 'birthDate' | 'hometown'>): string {
  return [p.name.first, p.name.last, p.name.suffix ?? '', p.birthDate.seasonYear, p.birthDate.dayIndex, p.hometown ?? ''].join('|').toLowerCase();
}

/**
 * The X checks of X11.2.2. `bandTargets` are the X1.2.1 target shares for the cohort's population group
 * (from a reference generation of the same group); omitted, the band check is skipped.
 */
export function validateCohort(people: readonly PersonRecord[], target: number, bandTargets?: BandShares): CohortProblem[] {
  const out: CohortProblem[] = [];
  if (!sizeWithinTolerance(people.length, target)) out.push({ check: 'size', size: people.length, target });
  const seen = new Map<string, number>();
  const blocks: TraitBlock[] = [];
  for (const p of people) {
    const b = TraitBlock.safeParse(p.traitBlock);
    if (!b.success) out.push({ check: 'trait_block', personId: p.id });
    else blocks.push(b.data);
    const k = identityKey(p);
    const prev = seen.get(k);
    if (prev !== undefined) out.push({ check: 'duplicate_identity', personIds: [prev, p.id] });
    else seen.set(k, p.id);
  }
  if (bandTargets && people.length >= param('bandCheckMinCohort')) {
    const got = bandShares(blocks);
    for (const [facet, bands] of Object.entries(bandTargets)) {
      for (const band of FACET_BANDS) {
        const share = got[facet]?.[band] ?? 0;
        const t = bands[band];
        const tol = Math.max(param('bandTolPoints'), param('bandSampleZ') * Math.sqrt((t * (1 - t)) / people.length));
        if (Math.abs(share - t) > tol + 1e-12) out.push({ check: 'band_share', facet, band, share, target: bands[band] });
      }
    }
  }
  return out;
}

export interface ValidatedCohort {
  readonly people: PersonRecord[];
  /** 0 for the first build; at most `maxReseeds`. */
  readonly attempt: number;
  readonly problems: CohortProblem[];
  /** True when every attempt failed and the last build was accepted with a warning. */
  readonly warning: boolean;
}

/**
 * Build, check, and reseed (X11.2.2). `build(attempt)` must derive its seed from (world seed, season,
 * kind, attempt), so the same world always reaches the same attempt. After `maxReseeds` failed reseeds
 * the last build is accepted and `warning` is set; the caller logs `cohort_validation_warning`.
 */
export function buildValidatedCohort(
  build: (attempt: number) => PersonRecord[],
  check: (people: readonly PersonRecord[]) => CohortProblem[],
): ValidatedCohort {
  const max = param('maxReseeds');
  let people: PersonRecord[] = [];
  let problems: CohortProblem[] = [];
  for (let attempt = 0; attempt <= max; attempt++) {
    people = build(attempt);
    problems = check(people);
    if (problems.length === 0) return { people, attempt, problems, warning: false };
  }
  return { people, attempt: max, problems, warning: true };
}

/** The scope of the derived seed for one attempt (X11.2.2): pass it to the injected random `open`. */
export function attemptScope(season: number, kind: string, attempt: number): readonly (string | number)[] {
  return [season, kind, attempt];
}
