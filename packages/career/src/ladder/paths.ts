// S1.3.1 typical paths and their clocks: the path targets as data and the check a 30-season world run must pass.
// Every figure is 1 of 3 in the bible, so each row carries status Unverified; they are calibration targets
// for K2 coach movement (owned by the soak), never inputs to a draw here.
import pathsJson from './paths.json' with { type: 'json' };

export interface PathTarget {
  readonly id: string;
  readonly measure: string;
  readonly unit: 'share' | 'years' | 'years_range' | 'count';
  readonly value: number | readonly [number, number];
  readonly evidence: string;
  readonly sources: number;
  readonly status: string;
}

export const PATH_TARGETS: readonly PathTarget[] = pathsJson.targets as unknown as PathTarget[];
export const PATH_SHAPES: readonly string[] = pathsJson.shapes;

export function pathTarget(id: string): PathTarget {
  const t = PATH_TARGETS.find((p) => p.id === id);
  if (!t) throw new Error(`ladder: unknown path target ${id}`);
  return t;
}

/** One simulated career, as the world run records it: the rung of each season's job and the age that season. */
export interface CareerTrace {
  /** `topSubdivision`: the season's team is in the college top subdivision (false for pro and lower college teams). */
  readonly seasons: readonly { readonly age: number; readonly rung: number; readonly topSubdivision: boolean }[];
}

export interface PathCheck {
  readonly meanAgeFirstTopHead: number | null;
  readonly shareRung2ReachRung9: number | null;
  readonly ageOk: boolean;
  readonly reachOk: boolean;
}

/** S1.3.1 acceptance over a world run: mean age of first-time top-subdivision head coaches, and few rung 2 starters reach rung 9. */
export function checkPaths(careers: readonly CareerTrace[]): PathCheck {
  const ages: number[] = [];
  let startedAt2 = 0, reached9 = 0;
  for (const c of careers) {
    const firstTop = c.seasons.find((s) => s.rung === 9 && s.topSubdivision);
    if (firstTop) ages.push(firstTop.age);
    if (c.seasons[0]?.rung === 2) { startedAt2++; if (c.seasons.some((s) => s.rung === 9)) reached9++; }
  }
  const mean = ages.length === 0 ? null : ages.reduce((a, b) => a + b, 0) / ages.length;
  const share = startedAt2 === 0 ? null : reached9 / startedAt2;
  const target = pathTarget('age_first_top_head_job').value as number;
  const acc = pathsJson.acceptance;
  return {
    meanAgeFirstTopHead: mean,
    shareRung2ReachRung9: share,
    ageOk: mean !== null && Math.abs(mean - target) <= acc.meanAgeFirstTopHeadToleranceYears,
    reachOk: share !== null && share < acc.maxShareRung2ReachRung9,
  };
}
