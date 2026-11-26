// League calibration (K2.3.1, K2.3.2). Two layers:
// 1. Prior calibration, run here: a generated population's wanted shares (the K2.1.2 priors that
//    K4.3.7 pulls each caller toward) must match the population file, whose means are the real
//    league rates (J15.3.2, J15.8.3) and whose spreads are the real team spreads where sourced.
// 2. Outcome calibration, owed: J15.1.3 orders engine contests first, then the coach population, so
//    the batch harness (J14.6.1) with K4 and K5 must measure the simulated league and move the file's
//    means. `tuneMeans` is that loop; the engine work packages G-58 and G-59 pass it a batch measure.
import { BEHAVIOR_KEYS, DEFENSE_RATE_KEYS, OFFENSE_RATE_KEYS, PERSONNEL_KEYS, ROLE_USES, TENDENCY_KEYS, CALLER_FIELDS, type BehaviorKey } from './keys.ts';
import type { CoachPopulation, FieldSpec } from './population.ts';
import { COACH_EFFECT, DECISION_TARGETS_OWED, type SourceStatus } from './sources.ts';
import type { CoachProfile, PersonnelKey } from './types.ts';

/** J15.1.2 starting tolerances (Assumption, owned by Q2): core rates 3% relative, SDs 5% relative. */
export const TOLERANCE = {
  meanRelative: { value: 0.03, status: 'Assumption' as const, citation: 'J15.1.2' },
  sdRelative: { value: 0.05, status: 'Assumption' as const, citation: 'J15.1.2' },
  /** For z-scored fields, whose mean is 0, a relative tolerance has no meaning: 0.1 SD, the K2.5.1 drift bound. */
  zAbsoluteSd: { value: 0.1, status: 'Assumption' as const, citation: 'K2.5.1 acceptance (0.1 z)' },
};

export interface CalibrationRow {
  readonly path: string;
  readonly kind: 'mean' | 'sd';
  readonly want: number;
  readonly got: number;
  readonly tolerance: number;
  readonly pass: boolean;
  /** Status of the wanted value: register or research status, or Assumption. */
  readonly status: SourceStatus;
  readonly citation: string;
}

export interface OwedRow { readonly target: string; readonly value: number; readonly status: SourceStatus; readonly citation: string; readonly owner: string }

export interface CalibrationReport {
  readonly populationKey: string;
  readonly populationVersion: number;
  readonly n: number;
  readonly rows: readonly CalibrationRow[];
  readonly owed: readonly OwedRow[];
  readonly pass: boolean;
}

function valueAt(p: CoachProfile, path: string): number {
  const [block, key] = path.split('.') as [string, string];
  switch (block) {
    case 'offenseRates': return p.system.offenseRates[key as keyof CoachProfile['system']['offenseRates']];
    case 'defenseRates': return p.system.defenseRates[key as keyof CoachProfile['system']['defenseRates']];
    case 'personnel': return p.system.personnelWeights[key as PersonnelKey];
    case 'tempo': return key === 'noHuddleShare' ? p.system.tempoBase.noHuddleShare : p.system.tempoBase.snapAtPlayClockS;
    case 'sheet': return key === 'offenseCalls' ? p.system.sheetSize.offenseCalls : p.system.sheetSize.defenseCalls;
    case 'tendencies': return p.tendencies[key as keyof CoachProfile['tendencies']];
    case 'behavior': return p.behavior[key as BehaviorKey];
    default: throw new Error(`unknown path ${path}`);
  }
}

export interface Moments { readonly mean: number; readonly sd: number }

/** Mean and SD (population form) of one field over a set of profiles. */
export function moments(profiles: readonly CoachProfile[], path: string): Moments {
  const n = profiles.length;
  if (n === 0) throw new Error('moments of an empty population');
  let s = 0;
  for (const p of profiles) s += valueAt(p, path);
  const mean = s / n;
  let v = 0;
  for (const p of profiles) { const d = valueAt(p, path) - mean; v += d * d; }
  return { mean, sd: Math.sqrt(v / n) };
}

const isZField = (spec: FieldSpec) => spec.min < 0 && Math.abs(spec.mean) < 0.5 && spec.sd >= 0.5;

/**
 * Paths checked for a population: every system rate and tempo share, every tendency, personnel shares,
 * and the behaviour parameters the role uses (K2.6.1). A head coach's calling fields are checked only
 * for a head-coach population generated as callers (`headCoachCalls`).
 */
export function calibrationPaths(pop: CoachPopulation, headCoachCalls = false): string[] {
  const used = new Set<BehaviorKey>(ROLE_USES[pop.role]);
  if (headCoachCalls) for (const k of CALLER_FIELDS) used.add(k);
  return [
    ...OFFENSE_RATE_KEYS.map((k) => `offenseRates.${k}`),
    ...DEFENSE_RATE_KEYS.map((k) => `defenseRates.${k}`),
    'tempo.noHuddleShare',
    ...PERSONNEL_KEYS.map((k) => `personnel.${k}`),
    ...TENDENCY_KEYS.map((k) => `tendencies.${k}`),
    ...BEHAVIOR_KEYS.filter((k) => used.has(k)).map((k) => `behavior.${k}`),
  ];
}

/** K2.3.1 prior calibration of a generated population against its file. */
export function calibrationReport(profiles: readonly CoachProfile[], pop: CoachPopulation, opts: { headCoachCalls?: boolean } = {}): CalibrationReport {
  const rows: CalibrationRow[] = [];
  for (const path of calibrationPaths(pop, opts.headCoachCalls)) {
    const got = moments(profiles, path);
    if (path.startsWith('personnel.')) {
      const k = path.slice('personnel.'.length) as PersonnelKey;
      const want = pop.personnel[k];
      const tol = Math.max(TOLERANCE.meanRelative.value * want, 0.002);
      rows.push({ path, kind: 'mean', want, got: got.mean, tolerance: tol, pass: Math.abs(got.mean - want) <= tol, status: k === 'other' ? 'Assumption' : personnelStatus(pop), citation: 'J15.8.3 personnel shares (other = remainder)' });
      continue;
    }
    const spec = pop.fields[path]!;
    // J15.1.2: the generated sample's own noise must not decide a row, so the band is never narrower
    // than three sampling standard errors of the generated population.
    const n = profiles.length;
    const meanTol = Math.max(isZField(spec) ? TOLERANCE.zAbsoluteSd.value * spec.sd : TOLERANCE.meanRelative.value * Math.abs(spec.mean), 3 * spec.sd / Math.sqrt(n));
    rows.push({ path, kind: 'mean', want: spec.mean, got: got.mean, tolerance: meanTol, pass: Math.abs(got.mean - spec.mean) <= meanTol, status: spec.meanStatus, citation: spec.citation });
    const sdTol = Math.max(TOLERANCE.sdRelative.value * spec.sd, 3 * spec.sd / Math.sqrt(2 * n));
    rows.push({ path, kind: 'sd', want: spec.sd, got: got.sd, tolerance: sdTol, pass: Math.abs(got.sd - spec.sd) <= sdTol, status: spec.sdStatus, citation: spec.citation });
  }
  const owed: OwedRow[] = [
    ...Object.entries(DECISION_TARGETS_OWED).map(([target, s]) => ({ target, value: s.value, status: s.status, citation: s.citation, owner: 'K5 batch run (G-59)' })),
    { target: 'coach effect, wins per 16 games (band low)', value: COACH_EFFECT.winsPer16GamesLow.value, status: COACH_EFFECT.winsPer16GamesLow.status, citation: COACH_EFFECT.winsPer16GamesLow.citation, owner: 'K2.3.2 batch run once K3 to K5 exist (G-58, G-59)' },
    { target: 'coach effect, wins per 16 games (band high)', value: COACH_EFFECT.winsPer16GamesHigh.value, status: COACH_EFFECT.winsPer16GamesHigh.status, citation: COACH_EFFECT.winsPer16GamesHigh.citation, owner: 'K2.3.2 batch run once K3 to K5 exist (G-58, G-59)' },
    { target: 'simulated neutral pass, play action, personnel, blitz shares after the K4.3.7 lean', value: Number.NaN, status: '1 of 3', citation: 'K4.3.7 rule 6, J15.8.3', owner: 'K4 batch run (G-58)' },
  ];
  return { populationKey: pop.key, populationVersion: pop.version, n: profiles.length, rows, owed, pass: rows.every((r) => r.pass) };
}

function personnelStatus(pop: CoachPopulation): SourceStatus {
  // Personnel shares are pro register rows (1 of 3); a population that borrows them is Assumption.
  return pop.fields['offenseRates.shotgun']!.meanStatus === 'Assumption' ? 'Assumption' : '1 of 3';
}

/**
 * K2.3.1 rule 2: move population means until the measured league means are inside tolerance.
 * `measure` returns the measured value per path for a candidate population: here the generated prior
 * mean, later the batch harness's simulated league rate. Returns the tuned file (version + 1) and the
 * iterations, so the run that justified it can be kept with it (K2.3.1 outputs).
 */
export function tuneMeans(
  pop: CoachPopulation,
  wants: Readonly<Record<string, number>>,
  measure: (candidate: CoachPopulation) => Readonly<Record<string, number>>,
  opts: { maxIterations?: number; relTolerance?: number; gain?: number } = {},
): { population: CoachPopulation; iterations: { iteration: number; worstRelError: number }[]; converged: boolean } {
  const maxIt = opts.maxIterations ?? 20;
  const tol = opts.relTolerance ?? TOLERANCE.meanRelative.value;
  const gain = opts.gain ?? 1;
  let cur = pop;
  const log: { iteration: number; worstRelError: number }[] = [];
  for (let it = 0; it < maxIt; it++) {
    const got = measure(cur);
    let worst = 0;
    const fields: Record<string, FieldSpec> = { ...cur.fields };
    for (const [path, want] of Object.entries(wants)) {
      const g = got[path];
      const spec = fields[path];
      if (g === undefined || !spec) throw new Error(`tuneMeans: no measure or field for ${path}`);
      const rel = Math.abs(g - want) / Math.max(Math.abs(want), 1e-9);
      if (rel > worst) worst = rel;
      const mean = Math.min(Math.max(spec.mean + gain * (want - g), spec.min), spec.max);
      fields[path] = { ...spec, mean };
    }
    log.push({ iteration: it, worstRelError: worst });
    if (worst <= tol) return { population: it === 0 ? cur : { ...cur, version: pop.version + 1 }, iterations: log, converged: true };
    cur = { ...cur, fields };
  }
  return { population: { ...cur, version: pop.version + 1 }, iterations: log, converged: false };
}

/** K2.3.2 rule 3: scale the spread of every behaviour parameter (never a direct win modifier). */
export function scaleBehaviorSpread(pop: CoachPopulation, factor: number): CoachPopulation {
  if (!(factor > 0)) throw new Error('spread factor must be positive');
  const fields: Record<string, FieldSpec> = { ...pop.fields };
  for (const k of BEHAVIOR_KEYS) { const f = fields[`behavior.${k}`]!; fields[`behavior.${k}`] = { ...f, sd: f.sd * factor }; }
  return { ...pop, fields, version: pop.version + 1 };
}
