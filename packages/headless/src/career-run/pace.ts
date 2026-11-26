// S10.1.1 week modes in a headless season: which weeks are played, how a simulated duty draws its grade,
// and the flag every simulated record carries. Nothing grows from any duty (rule 4, E9.1.3): the running
// distribution only describes what the user has shown, it never raises a value on him.
import type { RandomStream } from '@gm/schema';
import { dSqrt } from '@gm/engine-core';
import { clamp, param } from './params.ts';

export type WeekMode = 'full' | 'key_weeks' | 'season_summary';

/** One duty family's running record of played grades (mean and spread of what he has demonstrated). */
export interface Running { readonly n: number; readonly mean: number; readonly m2: number }
export const EMPTY_RUNNING: Running = { n: 0, mean: 0, m2: 0 };

/** Welford update with a played grade. Simulated grades never enter (they would feed on themselves). */
export function addPlayed(r: Running, grade: number): Running {
  const n = r.n + 1;
  const d = grade - r.mean;
  const mean = r.mean + d / n;
  return { n, mean, m2: r.m2 + d * (grade - mean) };
}

export function spreadOf(r: Running): number {
  if (r.n < 2) return param('careerRun.pace.unplayedSpread');
  return Math.max(param('careerRun.pace.minSpread'), dSqrt(r.m2 / (r.n - 1)));
}

/**
 * S10.1.1 rules 1 and 2: a simulated duty draws from his running distribution with the mean pulled down
 * 5 points. A family never played draws around `user_term_constant`, the median AI coach for the seat, with
 * a wider spread.
 */
export function simulatedGrade(r: Running, stream: RandomStream): number {
  if (r.n === 0) return clamp(param('careerRun.pace.unplayedMedian') + param('careerRun.pace.unplayedSpread') * stream.normal(), 0, 100);
  return clamp(r.mean - param('careerRun.pace.simPull') + spreadOf(r) * stream.normal(), 0, 100);
}

/**
 * Which weeks of the season are played by hand. Key weeks: the opener, the biggest game, one mid-season week
 * and the last game (S10.1.1 starting value 4). Season summary plays none. Certified mode (N4) forces full.
 * Held weeks are always played.
 */
export function playedWeeks(mode: WeekMode, weeks: number, biggestGame: number, held: readonly number[], certified: boolean): readonly number[] {
  const all = Array.from({ length: weeks }, (_, i) => i);
  if (certified || mode === 'full') return all;
  const set = new Set<number>(held.filter((w) => w >= 0 && w < weeks));
  if (mode === 'key_weeks') {
    const picks = [0, clamp(biggestGame, 0, weeks - 1), Math.floor(weeks / 2), weeks - 1];
    for (const w of picks.slice(0, param('careerRun.pace.keyWeeks'))) set.add(w);
  }
  return all.filter((w) => set.has(w));
}

/** Season summary: three to five decision events (an offer, a boss conflict, a recruiting battle, family). */
export function summaryEventCount(stream: RandomStream): number {
  const lo = param('careerRun.pace.summaryEventsMin');
  const hi = param('careerRun.pace.summaryEventsMax');
  return lo + Math.floor(stream.uniform() * (hi - lo + 1));
}

export interface DutyGrade {
  readonly week: number;
  readonly family: string;
  readonly grade: number;
  /** S10.1.1 acceptance 3: every simulated grade record carries the flag. */
  readonly simulated: boolean;
}

export interface PacedSeason { readonly grades: readonly DutyGrade[]; readonly running: Readonly<Record<string, Running>>; readonly mean: number }

/**
 * Run one season of duties at a pace. `played(family, stream)` is the script's hand-played grade. A family
 * never played before has its first instance played when the week mode plays anything, else simulated at
 * the median (rule 2). The season's mean grade is what the boss and the results see (rule 3: simulated work
 * has the same consequences as played work at that grade).
 */
export function paceSeason(
  mode: WeekMode, families: readonly string[], running: Readonly<Record<string, Running>>,
  played: (family: string, stream: RandomStream) => number, stream: RandomStream,
  opts: { readonly weeks?: number; readonly biggestGame?: number; readonly held?: readonly number[]; readonly certified?: boolean } = {},
): PacedSeason {
  const weeks = opts.weeks ?? param('careerRun.pace.seasonWeeks');
  const handWeeks = new Set(playedWeeks(mode, weeks, opts.biggestGame ?? Math.floor(weeks * 0.75), opts.held ?? [], opts.certified ?? false));
  const run: Record<string, Running> = { ...running };
  const grades: DutyGrade[] = [];
  for (let w = 0; w < weeks; w++) {
    for (const f of families) {
      const r = run[f] ?? EMPTY_RUNNING;
      if (handWeeks.has(w)) {
        const g = clamp(played(f, stream), 0, 100);
        run[f] = addPlayed(r, g);
        grades.push({ week: w, family: f, grade: g, simulated: false });
      } else {
        grades.push({ week: w, family: f, grade: simulatedGrade(r, stream), simulated: true });
      }
    }
  }
  const mean = grades.length ? grades.reduce((s, g) => s + g.grade, 0) / grades.length : 0;
  return { grades, running: run, mean };
}
