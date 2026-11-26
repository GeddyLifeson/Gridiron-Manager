// X11.2.3 stock balance: entries against exits, exit ages and career lengths against the references,
// and the starting coach retirement hazard. This file checks aggregates; retirement decisions belong to
// the people themselves (D, X5).
import { possible } from '@gm/schema';
import { param } from './params.ts';
import { median } from './day-one.ts';

export interface StockSeason {
  readonly season: number;
  readonly entries: number;
  readonly exits: number;
  /** Net change in chairs or roster spots this season (era limits, B12). */
  readonly netChange: number;
}

/**
 * X11.2.3 rule 1: over every window of `stockWindowSeasons`, entries equal exits plus net change within
 * `stockTolShare` of entries. Returns the windows that fail.
 */
export function stockProblems(seasons: readonly StockSeason[]): { from: number; to: number; entries: number; needed: number }[] {
  const w = param('stockWindowSeasons');
  const out: { from: number; to: number; entries: number; needed: number }[] = [];
  for (let i = 0; i + w <= seasons.length; i++) {
    const win = seasons.slice(i, i + w);
    const entries = win.reduce((a, s) => a + s.entries, 0);
    const needed = win.reduce((a, s) => a + s.exits + s.netChange, 0);
    if (Math.abs(entries - needed) > param('stockTolShare') * Math.max(entries, needed)) {
      out.push({ from: win[0]!.season, to: win[w - 1]!.season, entries, needed });
    }
  }
  return out;
}

/** X11.2.3 acceptance: each population within the tolerance of its season-10 size. */
export function populationStable(sizes: readonly number[], referenceIndex = 9): boolean {
  const ref = sizes[referenceIndex];
  if (ref === undefined || ref === 0) return false;
  return sizes.slice(referenceIndex).every((n) => Math.abs(n - ref) <= param('stockTolShare') * ref);
}

export interface ProSoakAges {
  readonly finalSeasonAges: readonly number[];
  readonly careerSeasons: readonly number[];
  readonly rosterAges: readonly number[];
}

/** X11.2.3 rows 2 to 4: soak medians inside their bands. */
export function proAgeBandProblems(a: ProSoakAges): string[] {
  const out: string[] = [];
  const check = (name: string, xs: readonly number[], lo: string, hi: string) => {
    const m = median(xs);
    if (!(m >= param(lo) && m <= param(hi))) out.push(`${name} median ${m} outside ${param(lo)} to ${param(hi)}`);
  };
  check('final season age', a.finalSeasonAges, 'proFinalAgeMedianLow', 'proFinalAgeMedianHigh');
  check('career length', a.careerSeasons, 'proCareerMedianLow', 'proCareerMedianHigh');
  check('roster age', a.rosterAges, 'proRosterAgeMedianLow', 'proRosterAgeMedianHigh');
  return out;
}

/**
 * X11.2.3 rule 6 starting coach retirement hazard by choice: 0 before 55, 3 percent at 55 rising 2 points
 * a year, capped at 40 percent (reached at 74 to 75). Firing paths are separate (X8.4.1).
 */
export function coachRetirementChance(age: number): number {
  const start = param('coachRetireStartAge');
  if (age < start) return possible(0);
  return possible(Math.min(param('coachRetireCap'), param('coachRetireStartChance') + (age - start) * param('coachRetireStepPerYear')));
}
