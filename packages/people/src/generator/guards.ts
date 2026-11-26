// Drift guards (D13.4): class statistics and the class validator (D13.4.5), and the correction rules
// that adjust only future intake (D13.4.2). Living people are never edited (D13.4.2 rule 1): nothing in
// this file takes or returns a person record to change.
import { param } from './params.ts';
import { proProfile, type ProfileVar } from './profiles.ts';
import type { ProfilePosition } from './catalogue.ts';
import type { GeneratedPlayer } from './generate.ts';

export interface MeanSd { n: number; mean: number; sd: number }

export function meanSd(xs: readonly number[]): MeanSd {
  const n = xs.length;
  if (n === 0) return { n, mean: Number.NaN, sd: Number.NaN };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : 0;
  return { n, mean, sd };
}

/** Statistics of one generated class: counts, adult measurables and primary ceilings by position. */
export interface ClassStats {
  counts: Record<string, number>;
  measurables: Record<string, Partial<Record<ProfileVar, MeanSd>>>;
}

export function classStats(cls: readonly GeneratedPlayer[], profileOfPlayer: (p: GeneratedPlayer) => ProfilePosition): ClassStats {
  const by = new Map<ProfilePosition, GeneratedPlayer[]>();
  for (const p of cls) {
    const k = profileOfPlayer(p);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(p);
  }
  const counts: Record<string, number> = {};
  const measurables: ClassStats['measurables'] = {};
  for (const [pos, list] of by) {
    counts[pos] = list.length;
    const prof = proProfile(pos);
    const m: Partial<Record<ProfileVar, MeanSd>> = {};
    for (const v of prof.vars) m[v] = meanSd(list.map((p) => p.adult[v]).filter((x): x is number => x !== undefined));
    measurables[pos] = m;
  }
  return { counts, measurables };
}

/** Targets a class is checked against (D13.4.5 inputs). Measurable targets are the fixed profile. */
export interface ClassTargets {
  counts: Readonly<Record<string, number>>;
  /** Per position, expected mean and sd of each adult measurable. Defaults to the pro profile. */
  measurables?: Readonly<Record<string, Partial<Record<ProfileVar, { mean: number; sd: number }>>>>;
}

export interface ValidatorProblem { kind: 'count' | 'mean' | 'spread'; position: string; field?: string; value: number; target: number }

/**
 * D13.4.5 class validator: fail when a position count is off by more than 5 percent or 2 players
 * (whichever is larger), a position mean by more than 0.15 sd, or a spread by more than 15 percent, each
 * widened to `classSampleZ` standard errors for small cells (see params: bible conflict).
 * Means and spreads are checked only where the position has at least `minN` players, since a small
 * cell cannot meet a 0.15 sd tolerance by chance (Assumption: minN 30, the D13.4.5 rule is silent).
 */
export function validateClass(stats: ClassStats, targets: ClassTargets, minN = 30): ValidatorProblem[] {
  const out: ValidatorProblem[] = [];
  for (const [pos, target] of Object.entries(targets.counts)) {
    const got = stats.counts[pos] ?? 0;
    const tol = Math.max(param('classCountTolShare') * target, param('classCountTolAbs'));
    if (Math.abs(got - target) > tol) out.push({ kind: 'count', position: pos, value: got, target });
  }
  for (const [pos, m] of Object.entries(stats.measurables)) {
    const prof = proProfile(pos as ProfilePosition);
    for (const v of prof.vars) {
      const s = m[v];
      if (!s || s.n < minN) continue;
      const t = targets.measurables?.[pos]?.[v] ?? { mean: prof.mean(v), sd: prof.sd(v) };
      const zN = param('classSampleZ');
      const meanTol = Math.max(param('classMeanTolSd'), zN / Math.sqrt(s.n)) * t.sd;
      const spreadTol = Math.max(param('classSpreadTolShare'), zN / Math.sqrt(2 * s.n)) * t.sd;
      if (Math.abs(s.mean - t.mean) > meanTol) out.push({ kind: 'mean', position: pos, field: v, value: s.mean, target: t.mean });
      if (Math.abs(s.sd - t.sd) > spreadTol) out.push({ kind: 'spread', position: pos, field: v, value: s.sd, target: t.sd });
    }
  }
  return out;
}

/** D13.4.5: regenerate with the next class seed up to 5 times, then accept the closest and raise an alarm. */
export function generateValidatedClass(
  build: (classAttempt: number) => GeneratedPlayer[],
  check: (cls: GeneratedPlayer[]) => ValidatorProblem[],
): { cls: GeneratedPlayer[]; classAttempt: number; problems: ValidatorProblem[]; alarm: boolean } {
  let best: { cls: GeneratedPlayer[]; classAttempt: number; problems: ValidatorProblem[] } | null = null;
  const tries = param('classMaxRegenerations') + 1;
  for (let a = 0; a < tries; a++) {
    const cls = build(a);
    const problems = check(cls);
    if (problems.length === 0) return { cls, classAttempt: a, problems, alarm: false };
    if (!best || problems.length < best.problems.length) best = { cls, classAttempt: a, problems };
  }
  return { ...best!, alarm: true };
}

/** D13.4.2 rule 2: next intake size from the stock deviation, limited to 0.8 to 1.25 times formula size. */
export function intakeSize(formulaSize: number, stockDeviation: number): number {
  const f = 1 - param('countGain') * stockDeviation;
  const lim = Math.min(param('countMaxFactor'), Math.max(param('countMinFactor'), f));
  return Math.round(formulaSize * lim);
}

/** Correction state per position, in sd of the ceiling distribution (D13.4.2 rule 3). */
export interface TalentCorrection { totalSd: number; alarm: boolean }

/**
 * D13.4.2 rule 3: when the 3-year mean deviation of pro-starter ISS at a position exceeds one tolerance,
 * shift the next class's ceiling means by at most 0.1 sd against it. Corrections accumulate and are capped
 * at 0.5 sd; hitting the cap raises an alarm (the development or aging model is wrong).
 * `deviations` are the census values (starter ISS mean - 50) / tolerance, oldest first.
 */
export function nextTalentCorrection(prev: TalentCorrection, deviations: readonly number[]): TalentCorrection {
  const w = param('talentWindowYears');
  const recent = deviations.slice(-w);
  if (recent.length < w) return prev;
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (Math.abs(mean) <= param('talentTriggerTol')) return prev;
  const step = -Math.sign(mean) * param('talentStepSd');
  const cap = param('talentCapSd');
  const raw = prev.totalSd + step;
  const totalSd = Math.max(-cap, Math.min(cap, raw));
  return { totalSd, alarm: prev.alarm || Math.abs(raw) >= cap - 1e-12 };
}

/** The ISS shift a correction applies to ceiling means (sd of the pro-entrant ceiling distribution). */
export function correctionIss(c: TalentCorrection): number {
  return c.totalSd * param('proEntrantCeilingSd');
}

/** D13.4.2 rule 4: a measurable drifting from its fixed profile is a bug alarm, never a correction. */
export function bodyDriftAlarms(stats: ClassStats, minN = 30): ValidatorProblem[] {
  return validateClass(stats, { counts: {} }, minN).filter((p) => p.kind === 'mean');
}
