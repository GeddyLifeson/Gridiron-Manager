// The founding curves the team lifecycle draws from (loop/lifecycle.ts), with each curve's status as the
// research read it. Built from real first seasons by test/generation/tools/build-founding-curves.ts.
import data from './data/founding-curves.json' with { type: 'json' };

export interface FoundingCurveRow {
  readonly status: string;
  readonly basis: string;
  readonly points: readonly (readonly [number, number])[];
}

/** Curve rows keyed as the lifecycle keys competitions: 'pro', 'college_top', 'college_second'. */
export function foundingCurveRows(): Readonly<Record<string, FoundingCurveRow>> {
  return data.curves as unknown as Record<string, FoundingCurveRow>;
}

/** Just the points, for `createWorld({ foundingCurves })`. */
export function defaultFoundingCurves(): Readonly<Record<string, FoundingCurveRow['points']>> {
  return Object.fromEntries(Object.entries(foundingCurveRows()).map(([k, r]) => [k, r.points]));
}
