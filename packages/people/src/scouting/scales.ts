// Display scales (D6.2.1). The engine's units never change: a scale is a view, chosen in settings, defined
// as data with a monotonic mapping from ISS and a list of labelled bands. Shipped scales are below; a
// user-made scale file is checked by `parseScale` and loads without a rebuild.
//
// Mapping constants and legend wording are D6.2.1 starting values: the shape of a 5.0 to 9.0 decimal grade
// is Verified (audit Part 8.4, 3 sources), the constants and wording are Assumptions, and color tiers are
// 1 of 3 sources. The 20 to 80 scale is offered as an option, not presented as NFL practice.

/** A numeric scale: piecewise-linear map from ISS, limited, rounded to a step. */
export interface NumericScale {
  readonly id: string;
  readonly name: string;
  readonly kind: 'numeric';
  /** [iss, grade] points with ISS strictly increasing and grade not decreasing; ends extend linearly. */
  readonly points: readonly (readonly [number, number])[];
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly decimals: number;
  /** Legend: lowest grade each wording applies from, highest first. */
  readonly legend: readonly { readonly from: number; readonly label: string }[];
  readonly arrow: boolean;
}

/** A tier scale: labelled ISS bands, highest first. */
export interface TierScale {
  readonly id: string;
  readonly name: string;
  readonly kind: 'tiers';
  readonly tiers: readonly { readonly minIss: number; readonly label: string }[];
  /** Label below the lowest tier. */
  readonly below: string;
  readonly arrow: boolean;
}

export type GradeScale = NumericScale | TierScale;

const DECIMAL_LEGEND = [
  { from: 8.0, label: 'rare talent' },
  { from: 7.5, label: 'perennial all-star' },
  { from: 7.0, label: 'high-level starter' },
  { from: 6.5, label: 'solid starter' },
  { from: 6.0, label: 'backup who can start in a pinch' },
  { from: 5.5, label: 'roster depth and practice squad' },
  { from: 5.0, label: 'not a pro player' },
] as const;

/** Default (D6.2.1): grade = 6.5 + (ISS - 50) / 20, one decimal, limited to 5.0 to 9.0. */
export const DECIMAL_SCALE: NumericScale = {
  id: 'decimal_5_9', name: 'Decimal 5.0 to 9.0', kind: 'numeric',
  points: [[0, 4.0], [100, 9.0]], min: 5.0, max: 9.0, step: 0.1, decimals: 1, legend: DECIMAL_LEGEND, arrow: false,
};

export const TWENTY_EIGHTY_SCALE: NumericScale = {
  id: 'twenty_eighty', name: '20 to 80', kind: 'numeric',
  points: [[0, 0], [100, 100]], min: 20, max: 80, step: 5, decimals: 0, legend: [], arrow: false,
};

export const RAW_SCALE: NumericScale = {
  id: 'raw_0_100', name: '0 to 100', kind: 'numeric',
  points: [[0, 0], [100, 100]], min: 0, max: 100, step: 1, decimals: 0, legend: [], arrow: false,
};

export const COLOR_TIER_SCALE: TierScale = {
  id: 'color_tiers', name: 'Color tiers', kind: 'tiers',
  tiers: [{ minIss: 65, label: 'Blue' }, { minIss: 55, label: 'Red' }, { minIss: 45, label: 'Purple' }, { minIss: 35, label: 'Orange' }],
  below: 'None', arrow: true,
};

const LETTERS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'] as const;
/** A+ to F in 13 steps of 5 ISS from 75 down (D6.2.1). */
export const LETTER_SCALE: TierScale = {
  id: 'letter', name: 'Letter', kind: 'tiers',
  tiers: LETTERS.map((label, i) => ({ minIss: 75 - 5 * i, label })), below: 'F', arrow: false,
};

export const SHIPPED_SCALES: readonly GradeScale[] = [DECIMAL_SCALE, TWENTY_EIGHTY_SCALE, RAW_SCALE, COLOR_TIER_SCALE, LETTER_SCALE];
export const DEFAULT_SCALE_ID = DECIMAL_SCALE.id;

/** The settings record for the grade scale choice (O5, P3.6.1 SettingRecord shape). Display only. */
export const GRADE_SCALE_SETTING = {
  key: 'grades.scale', type: 'enum' as const, default: DEFAULT_SCALE_ID, range: null,
  options: SHIPPED_SCALES.map((s) => s.id), scope: 'user' as const, group: 'grades',
  lockedInCertified: false, explanationKey: 'settings.grades.scale.explain',
};

/** Unrounded, unlimited grade for an ISS value on a numeric scale. */
export function rawGrade(scale: NumericScale, iss: number): number {
  const pts = scale.points;
  let i = 0;
  while (i < pts.length - 2 && iss > pts[i + 1]![0]) i++;
  const [x0, y0] = pts[i]!;
  const [x1, y1] = pts[i + 1]!;
  return y0 + (y1 - y0) * (iss - x0) / (x1 - x0);
}

/** Rounds to the scale's step and fixes the decimals, so 6.4999 reads 6.5. */
export function roundToStep(scale: NumericScale, g: number): number {
  const r = Math.round(g / scale.step) * scale.step;
  return Number(r.toFixed(scale.decimals));
}

export interface Graded {
  /** Grade value on a numeric scale (rounded, limited), or null on a tier scale. */
  readonly value: number | null;
  readonly text: string;
  /** The value fell outside the scale limits and was cut (D6.2.1 edge case). */
  readonly cut: 'low' | 'high' | null;
}

export function tierLabel(scale: TierScale, iss: number): string {
  for (const t of scale.tiers) if (iss >= t.minIss) return t.label;
  return scale.below;
}

/** Maps one ISS value to the scale (D6.2.1). */
export function grade(scale: GradeScale, iss: number): Graded {
  if (scale.kind === 'tiers') return { value: null, text: tierLabel(scale, iss), cut: null };
  const g = rawGrade(scale, iss);
  const cut = g < scale.min ? 'low' : g > scale.max ? 'high' : null;
  const v = roundToStep(scale, cut === 'low' ? scale.min : cut === 'high' ? scale.max : g);
  return { value: v, text: v.toFixed(scale.decimals), cut };
}

/** Legend wording for a numeric grade (D6.2.1), or null when the scale has none. */
export function legendFor(scale: GradeScale, iss: number): string | null {
  if (scale.kind !== 'numeric' || scale.legend.length === 0) return null;
  const g = grade(scale, iss).value!;
  for (const l of scale.legend) if (g >= l.from) return l.label;
  return scale.legend[scale.legend.length - 1]!.label;
}

/**
 * The "relative to his level" view (D6.2.1, D6.4.5): the same formula with the average starter at the
 * team's own level in place of the pro starter mean (ISS 50). `levelStarterMean` comes from the census.
 */
export function relativeIss(iss: number, levelStarterMean: number): number {
  return iss - levelStarterMean + 50;
}

// ---------------------------------------------------------------------------------------------------
// User-made scale files (D6.2.1: a custom scale file loads without a rebuild; a non-monotonic one is
// rejected). Hand-checked, because core packages take no validation library.

export type ParseResult = { ok: true; scale: GradeScale } | { ok: false; problems: string[] };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

export function parseScale(input: unknown): ParseResult {
  const problems: string[] = [];
  if (!isObj(input)) return { ok: false, problems: ['scale file must be an object'] };
  if (!isStr(input.id) || !/^[a-z0-9_]+$/.test(input.id)) problems.push('id must be lower-case letters, digits and underscores');
  if (!isStr(input.name)) problems.push('name is required');
  const arrow = input.arrow === undefined ? false : input.arrow;
  if (typeof arrow !== 'boolean') problems.push('arrow must be true or false');

  if (input.kind === 'numeric') {
    const pts = input.points;
    if (!Array.isArray(pts) || pts.length < 2 || !pts.every((q) => Array.isArray(q) && q.length === 2 && isNum(q[0]) && isNum(q[1]))) {
      problems.push('points must be at least two [iss, grade] pairs of numbers');
    } else {
      let rising = false;
      for (let i = 1; i < pts.length; i++) {
        if (!(pts[i][0] > pts[i - 1][0])) problems.push(`points: ISS must strictly increase (point ${i})`);
        if (pts[i][1] < pts[i - 1][1]) problems.push(`points: grade must not decrease (point ${i}); the mapping must be monotonic`);
        if (pts[i][1] > pts[i - 1][1]) rising = true;
      }
      if (!rising) problems.push('points: grade must rise somewhere');
    }
    if (!isNum(input.min) || !isNum(input.max) || !(input.max > input.min)) problems.push('min and max must be numbers with max above min');
    if (!isNum(input.step) || !(input.step > 0)) problems.push('step must be a positive number');
    if (!Number.isInteger(input.decimals) || (input.decimals as number) < 0 || (input.decimals as number) > 3) problems.push('decimals must be an integer 0 to 3');
    const legend = input.legend === undefined ? [] : input.legend;
    if (!Array.isArray(legend) || !legend.every((l) => isObj(l) && isNum(l.from) && isStr(l.label))) problems.push('legend must be a list of { from, label }');
    else for (let i = 1; i < legend.length; i++) if (!(legend[i].from < legend[i - 1].from)) problems.push('legend must run from highest to lowest');
    if (problems.length) return { ok: false, problems };
    return {
      ok: true,
      scale: {
        id: input.id as string, name: input.name as string, kind: 'numeric',
        points: (pts as [number, number][]).map(([a, b]) => [a, b] as const),
        min: input.min as number, max: input.max as number, step: input.step as number, decimals: input.decimals as number,
        legend: (legend as { from: number; label: string }[]).map((l) => ({ from: l.from, label: l.label })), arrow: arrow as boolean,
      },
    };
  }
  if (input.kind === 'tiers') {
    const tiers = input.tiers;
    if (!Array.isArray(tiers) || tiers.length < 1 || !tiers.every((t) => isObj(t) && isNum(t.minIss) && isStr(t.label))) {
      problems.push('tiers must be a list of { minIss, label }');
    } else {
      for (let i = 1; i < tiers.length; i++) if (!(tiers[i].minIss < tiers[i - 1].minIss)) problems.push(`tiers: minIss must strictly decrease (tier ${i}); the mapping must be monotonic`);
    }
    if (!isStr(input.below)) problems.push('below is required');
    if (problems.length) return { ok: false, problems };
    return {
      ok: true,
      scale: {
        id: input.id as string, name: input.name as string, kind: 'tiers',
        tiers: (tiers as { minIss: number; label: string }[]).map((t) => ({ minIss: t.minIss, label: t.label })),
        below: input.below as string, arrow: arrow as boolean,
      },
    };
  }
  problems.push('kind must be numeric or tiers');
  return { ok: false, problems };
}

/** Finds a scale by id among shipped and loaded scales, falling back to the default. */
export function scaleById(id: string, loaded: readonly GradeScale[] = []): GradeScale {
  return [...loaded, ...SHIPPED_SCALES].find((s) => s.id === id) ?? DECIMAL_SCALE;
}
