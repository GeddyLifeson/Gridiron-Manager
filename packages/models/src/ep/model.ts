// The expected points model (N2.2.1): fit, evaluate, and expected points added.
import type { DeterministicMath, RuleSet } from '@gm/schema';
import { compileFeatures, fitStandardiser, standardise, type CompiledFeatures, type VarTable } from './features.ts';
import { fitGlm, softmaxRow } from './glm.ts';
import { param } from './params.ts';
import {
  NEXT_SCORE_CLASSES, NO_SCORE_INDEX,
  type EpModelFile, type EpState, type EpSubmodel, type EpTrainingRow, type EpValue, type SupportGrid,
} from './types.ts';

const K = NEXT_SCORE_CLASSES.length;

/** Variables the feature terms may name. */
export const EP_VARS: VarTable<EpState> = {
  yd: (s) => s.yardsToGoalYd,
  dist: (s) => s.distanceYd,
  down: (s) => s.down,
  gtg: (s) => (s.distanceYd >= s.yardsToGoalYd ? 1 : 0),
  half_s: (s) => s.halfSecondsLeft,
  to_off: (s) => s.timeoutsOffense,
  to_def: (s) => s.timeoutsDefense,
  home: (s) => (s.home ? 1 : 0),
};

/**
 * Starting feature terms (N2.2.1 rule 2 names the state features: down, distance, yard line, seconds
 * left in the half, timeouts each side, home or away). Knots are spline joints chosen for this fit.
 */
export const DEFAULT_SCRIMMAGE_TERMS: readonly string[] = [
  '1', 'v:yd', 'h:yd:10', 'h:yd:20', 'h:yd:30', 'h:yd:40', 'h:yd:50', 'h:yd:60', 'h:yd:70', 'h:yd:80', 'h:yd:90', 'h:yd:95', 'hl:yd:5',
  'eq:down:2', 'eq:down:3', 'eq:down:4', 'ln:dist', 'mn:dist:20',
  'eq:down:2*ln:dist', 'eq:down:3*ln:dist', 'eq:down:4*ln:dist', 'eq:down:3*v:yd', 'eq:down:4*v:yd',
  'v:half_s', 'hl:half_s:120', 'hl:half_s:120*v:yd', 'hl:half_s:30', 'v:to_off', 'v:to_def', 'v:home',
];
export const DEFAULT_KICKOFF_TERMS: readonly string[] = ['1', 'v:half_s', 'hl:half_s:120', 'v:to_off', 'v:to_def', 'v:home'];

export const DEFAULT_SUPPORT_EDGES = { distanceEdges: [3, 6, 10], yardEdges: [10, 20, 30, 40, 50, 60, 70, 80, 90], secondsEdges: [120] } as const;

function bucket(v: number, edges: readonly number[]): number {
  let i = 0;
  while (i < edges.length && v > edges[i]!) i++;
  return i;
}

/** Flattened support-grid index. Down 0 is the kickoff row. */
export function supportIndex(g: Pick<SupportGrid, 'distanceEdges' | 'yardEdges' | 'secondsEdges'>, s: EpState): number {
  const down = s.kind === 'kickoff' ? 0 : s.down;
  const nd = g.distanceEdges.length + 1, ny = g.yardEdges.length + 1, nt = g.secondsEdges.length + 1;
  const d = s.kind === 'kickoff' ? 0 : bucket(s.distanceYd, g.distanceEdges);
  const y = s.kind === 'kickoff' ? 0 : bucket(s.yardsToGoalYd, g.yardEdges);
  const t = bucket(s.halfSecondsLeft, g.secondsEdges);
  return ((down * nd + d) * ny + y) * nt + t;
}

export function supportSize(g: Pick<SupportGrid, 'distanceEdges' | 'yardEdges' | 'secondsEdges'>): number {
  return 5 * (g.distanceEdges.length + 1) * (g.yardEdges.length + 1) * (g.secondsEdges.length + 1);
}

/** Class values from the rule set and the model's own average try value (N2.2.1 rule 2). */
export function classValues(rules: RuleSet, tryValue: number): number[] {
  const td = rules.num('score.touchdown') + tryValue;
  const fg = rules.num('score.field_goal');
  const sf = rules.num('score.safety');
  return [td, fg, sf, 0, -sf, -fg, -td];
}

export interface EpFitOptions {
  readonly version: string;
  readonly trainedOn: string;
  /** Average points of a try in the training data (kick and two-point attempts together). */
  readonly tryValue: number;
  readonly scrimmageTerms?: readonly string[];
  readonly kickoffTerms?: readonly string[];
  readonly ridge?: number;
  readonly maxIterations?: number;
  readonly tolerance?: number;
}

function fitSub(rows: readonly EpTrainingRow[], terms: readonly string[], opt: EpFitOptions, math: DeterministicMath): EpSubmodel {
  const f = compileFeatures(terms, EP_VARS);
  const cols = terms.length;
  const n = rows.length;
  const x = new Float64Array(n * cols);
  const y = new Float64Array(n * K);
  const tmp = new Float64Array(cols);
  for (let i = 0; i < n; i++) {
    const r = rows[i]!;
    f.raw(r.state, math, tmp);
    x.set(tmp, i * cols);
    y[i * K + r.nextScore] = 1;
  }
  const st = fitStandardiser(x, n, cols, math);
  for (let i = 0; i < n; i++) for (let j = 1; j < cols; j++) x[i * cols + j] = (x[i * cols + j]! - st.mean[j]!) / st.sd[j]!;
  const fit = fitGlm({ x, y, rows: n, cols, classes: K }, {
    referenceClass: NO_SCORE_INDEX,
    ridge: opt.ridge ?? param('ridge'),
    maxIterations: opt.maxIterations ?? param('maxIterations'),
    tolerance: opt.tolerance ?? param('tolerance'),
  }, math);
  return { terms: [...terms], mean: st.mean, sd: st.sd, beta: Array.from(fit.beta), trainingPlays: n, iterations: fit.iterations, converged: fit.converged };
}

/**
 * Fit the model to training plays (N2.2.1 rules 2, 3, 5). Pure: the same rows in the same order and the
 * same options give the same file, bit for bit.
 */
export function fitEpModel(rows: readonly EpTrainingRow[], rules: RuleSet, opt: EpFitOptions, math: DeterministicMath): EpModelFile {
  const scrim = rows.filter((r) => r.state.kind === 'scrimmage');
  const kick = rows.filter((r) => r.state.kind === 'kickoff');
  const grid = DEFAULT_SUPPORT_EDGES;
  const counts = new Array<number>(supportSize(grid)).fill(0);
  for (const r of rows) counts[supportIndex(grid, r.state)]! += 1;
  return {
    format: 'gm.ep-model',
    version: opt.version,
    ruleSetId: rules.id,
    trainedOn: opt.trainedOn,
    classValues: classValues(rules, opt.tryValue),
    tryValue: opt.tryValue,
    scrimmage: fitSub(scrim, opt.scrimmageTerms ?? DEFAULT_SCRIMMAGE_TERMS, opt, math),
    kickoff: fitSub(kick, opt.kickoffTerms ?? DEFAULT_KICKOFF_TERMS, opt, math),
    support: { ...grid, counts },
  };
}

/** A model ready to evaluate: feature terms compiled once. */
export interface EpModel {
  readonly file: EpModelFile;
  readonly scrimmage: CompiledFeatures<EpState>;
  readonly kickoff: CompiledFeatures<EpState>;
}

export class EpModelError extends Error {}

/** Check a loaded file's shape before use (models cannot import zod; core packages stay dependency-free). */
export function loadEpModel(file: EpModelFile): EpModel {
  if (file.format !== 'gm.ep-model') throw new EpModelError(`not an expected points model: ${String(file.format)}`);
  if (file.classValues.length !== K) throw new EpModelError(`expected ${K} class values`);
  for (const [name, sub] of [['scrimmage', file.scrimmage], ['kickoff', file.kickoff]] as const) {
    const c = sub.terms.length;
    if (sub.mean.length !== c || sub.sd.length !== c || sub.beta.length !== c * K) throw new EpModelError(`${name}: coefficient shape does not match ${c} terms`);
  }
  if (file.support.counts.length !== supportSize(file.support)) throw new EpModelError('support grid size does not match its edges');
  return { file, scrimmage: compileFeatures(file.scrimmage.terms, EP_VARS), kickoff: compileFeatures(file.kickoff.terms, EP_VARS) };
}

/** Class probabilities for a state. */
export function epProbabilities(model: EpModel, s: EpState, math: DeterministicMath): Float64Array {
  const sub = s.kind === 'kickoff' ? model.file.kickoff : model.file.scrimmage;
  const f = s.kind === 'kickoff' ? model.kickoff : model.scrimmage;
  const row = standardise(f.raw(s, math), sub);
  return softmaxRow(sub.beta, row, sub.terms.length, K, math, new Float64Array(K));
}

/**
 * Expected points of a state, with a standard error (N2.2.1 outputs). The standard error is the spread of
 * next-score points in the state divided by the root of the training plays in its support bucket: it
 * says how well the training data pins the value, and it grows where plays are few (N2.7.2).
 * End of half: with no time left nothing more can score, so the value is 0 (N2.2.1 edge cases).
 */
export function ep(model: EpModel, s: EpState, math: DeterministicMath): EpValue {
  const support = model.file.support.counts[supportIndex(model.file.support, s)] ?? 0;
  const sparse = support < param('sparseSupport');
  if (s.halfSecondsLeft <= 0) {
    const probabilities = new Array<number>(K).fill(0);
    probabilities[NO_SCORE_INDEX] = 1;
    return { value: 0, se: 0, probabilities, support, sparse };
  }
  const p = epProbabilities(model, s, math);
  const v = model.file.classValues;
  let mean = 0, sq = 0;
  for (let k = 0; k < K; k++) { mean += p[k]! * v[k]!; sq += p[k]! * v[k]! * v[k]!; }
  const variance = sq - mean * mean;
  const se = math.sqrt((variance > 0 ? variance : 0) / (support > 1 ? support : 1));
  return { value: mean, se, probabilities: Array.from(p), support, sparse };
}

/** How a play ended, for expected points added (N2.2.1 rule 4). */
export type PlayEnd =
  | { readonly kind: 'state'; readonly after: EpState; readonly possessionChanged: boolean }
  | { readonly kind: 'score'; readonly scorer: 'offense' | 'defense'; readonly score: 'touchdown' | 'field_goal' | 'safety' }
  | { readonly kind: 'half_over' };

/**
 * Expected points added for the offense at the snap (N2.2.1 rule 4): the value after minus the value
 * before, with the sign flipped on a change of possession, and the class value on a scoring play (a
 * touchdown counts its points plus the model's own average try).
 */
export function epa(model: EpModel, before: EpState, end: PlayEnd, math: DeterministicMath): number {
  const b = ep(model, before, math).value;
  if (end.kind === 'half_over') return -b;
  if (end.kind === 'score') {
    const idx = NEXT_SCORE_CLASSES.indexOf(end.score);
    const own = model.file.classValues[idx]!;
    return (end.scorer === 'offense' ? own : -own) - b;
  }
  const a = ep(model, end.after, math).value;
  return (end.possessionChanged ? -a : a) - b;
}
