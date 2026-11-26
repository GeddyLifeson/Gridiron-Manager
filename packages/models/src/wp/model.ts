// The win probability model (N2.2.2): fit, evaluate, win probability added, and the option search.
import type { DeterministicMath, RuleSet } from '@gm/schema';
import { compileFeatures, fitStandardiser, standardise, type CompiledFeatures, type VarTable } from '../ep/features.ts';
import { fitGlm } from '../ep/glm.ts';
import { ep, type EpModel } from '../ep/model.ts';
import { param } from './params.ts';
import type { WpModelFile, WpRuleValues, WpState, WpSupportGrid, WpTrainingRow, WpValue } from './types.ts';

/** A state with the derived values the feature terms read. */
export interface WpEval {
  readonly s: WpState;
  readonly ep: number;
  readonly regulationSeconds: number;
  /** Expected margin over the root of minutes left (+1). */
  readonly tsc: number;
}

export const WP_VARS: VarTable<WpEval> = {
  score: (e) => e.s.scoreDiff,
  ep: (e) => e.ep,
  /** Expected margin: the score difference plus the value of the possession. */
  adj: (e) => e.s.scoreDiff + e.ep,
  tmin: (e) => e.s.gameSecondsLeft / 60,
  /** Expected margin over the root of minutes left (+1): a lead matters more as time runs out. */
  tsc: (e) => e.tsc,
  /** Share of regulation left; 0 in overtime. The pregame prior is multiplied by it (N2.2.2 rule 2). */
  fade: (e) => (e.s.overtime ? 0 : e.s.gameSecondsLeft / e.regulationSeconds),
  spread: (e) => e.s.pregameGap,
  to_off: (e) => e.s.field.timeoutsOffense,
  to_def: (e) => e.s.field.timeoutsDefense,
  rec2h_h1: (e) => (e.s.firstHalf && e.s.receivesSecondHalfKickoff ? 1 : 0),
  home: (e) => (e.s.field.home ? 1 : 0),
  ot: (e) => (e.s.overtime ? 1 : 0),
  kickoff: (e) => (e.s.field.kind === 'kickoff' ? 1 : 0),
};

function evalFor(epModel: EpModel, s: WpState, rules: WpRuleValues, math: DeterministicMath): WpEval {
  const e = ep(epModel, s.field, math).value;
  const adj = s.scoreDiff + e;
  return { s, ep: e, regulationSeconds: rules.regulationSeconds, tsc: adj / math.sqrt(s.gameSecondsLeft / 60 + 1) };
}

/** Starting terms. Every term that grows with score difference is held non-negative (N2.2.2 rule 1). */
export const DEFAULT_WP_TERMS: readonly string[] = [
  '1', 'v:adj', 'v:tsc', 'v:score', 'v:adj*hl:tmin:2', 'v:ot*v:tsc', 'v:spread*v:fade', 'v:spread',
  'v:to_off', 'v:to_def', 'v:to_off*hl:tmin:4', 'v:to_def*hl:tmin:4', 'v:rec2h_h1', 'v:home', 'v:ot', 'v:kickoff',
];
export const DEFAULT_MONOTONE_TERMS: readonly string[] = ['v:adj', 'v:tsc', 'v:score', 'v:adj*hl:tmin:2', 'v:ot*v:tsc'];

export const DEFAULT_WP_SUPPORT = { scoreEdges: [-17, -9, -4, -1, 0, 3, 8, 16], secondsEdges: [120, 300, 900, 1800, 2700] } as const;

function bucket(v: number, edges: readonly number[]): number {
  let i = 0;
  while (i < edges.length && v > edges[i]!) i++;
  return i;
}

export function wpSupportIndex(g: Pick<WpSupportGrid, 'scoreEdges' | 'secondsEdges'>, s: WpState): number {
  const ns = g.scoreEdges.length + 1, nt = g.secondsEdges.length + 1;
  return ((s.overtime ? 1 : 0) * ns + bucket(s.scoreDiff, g.scoreEdges)) * nt + bucket(s.gameSecondsLeft, g.secondsEdges);
}

export function wpSupportSize(g: Pick<WpSupportGrid, 'scoreEdges' | 'secondsEdges'>): number {
  return 2 * (g.scoreEdges.length + 1) * (g.secondsEdges.length + 1);
}

/** Rule values the model keeps (regulation length, play clock, downs). */
export function wpRuleValues(rules: RuleSet): WpRuleValues {
  return {
    regulationSeconds: rules.num('clock.periods') * rules.num('clock.period_length_s'),
    playClockS: rules.num('clock.play_clock_s'),
    downs: rules.num('series.downs'),
  };
}

export interface WpFitOptions {
  readonly version: string;
  readonly trainedOn: string;
  readonly terms?: readonly string[];
  readonly monotoneTerms?: readonly string[];
  readonly ridge?: number;
  readonly maxIterations?: number;
  readonly tolerance?: number;
}

/** Fit to training plays (N2.2.2 rule 1). Ties are half a win. Pure and deterministic. */
export function fitWpModel(rows: readonly WpTrainingRow[], epModel: EpModel, rules: RuleSet, opt: WpFitOptions, math: DeterministicMath): WpModelFile {
  const terms = opt.terms ?? DEFAULT_WP_TERMS;
  const monotone = opt.monotoneTerms ?? DEFAULT_MONOTONE_TERMS;
  const rv = wpRuleValues(rules);
  const f = compileFeatures(terms, WP_VARS);
  const cols = terms.length, n = rows.length;
  const x = new Float64Array(n * cols);
  const y = new Float64Array(n * 2);
  const tmp = new Float64Array(cols);
  const grid = DEFAULT_WP_SUPPORT;
  const counts = new Array<number>(wpSupportSize(grid)).fill(0);
  for (let i = 0; i < n; i++) {
    const r = rows[i]!;
    f.raw(evalFor(epModel, r.state, rv, math), math, tmp);
    x.set(tmp, i * cols);
    y[i * 2] = 1 - r.result;
    y[i * 2 + 1] = r.result;
    counts[wpSupportIndex(grid, r.state)]! += 1;
  }
  const st = fitStandardiser(x, n, cols, math);
  for (let i = 0; i < n; i++) for (let j = 1; j < cols; j++) x[i * cols + j] = (x[i * cols + j]! - st.mean[j]!) / st.sd[j]!;
  const nonNegative = monotone.map((t) => {
    const j = terms.indexOf(t);
    if (j < 0) throw new Error(`monotone term ${t} is not among the terms`);
    return j;
  });
  const fit = fitGlm({ x, y, rows: n, cols, classes: 2 }, {
    referenceClass: 0,
    ridge: opt.ridge ?? param('ridge'),
    maxIterations: opt.maxIterations ?? param('maxIterations'),
    tolerance: opt.tolerance ?? param('tolerance'),
    nonNegative,
  }, math);
  return {
    format: 'gm.wp-model',
    version: opt.version,
    ruleSetId: rules.id,
    trainedOn: opt.trainedOn,
    epModelVersion: epModel.file.version,
    rules: rv,
    terms: [...terms],
    monotoneTerms: [...monotone],
    mean: st.mean,
    sd: st.sd,
    beta: Array.from(fit.beta.subarray(cols, 2 * cols)),
    trainingPlays: n,
    iterations: fit.iterations,
    converged: fit.converged,
    support: { ...grid, counts },
  };
}

export interface WpModel {
  readonly file: WpModelFile;
  readonly ep: EpModel;
  readonly features: CompiledFeatures<WpEval>;
}

export class WpModelError extends Error {}

export function loadWpModel(file: WpModelFile, epModel: EpModel): WpModel {
  if (file.format !== 'gm.wp-model') throw new WpModelError(`not a win probability model: ${String(file.format)}`);
  const c = file.terms.length;
  if (file.mean.length !== c || file.sd.length !== c || file.beta.length !== c) throw new WpModelError(`coefficient shape does not match ${c} terms`);
  if (file.epModelVersion !== epModel.file.version) throw new WpModelError(`fitted with expected points model ${file.epModelVersion}, given ${epModel.file.version}`);
  if (file.support.counts.length !== wpSupportSize(file.support)) throw new WpModelError('support grid size does not match its edges');
  for (const t of file.monotoneTerms) {
    const j = file.terms.indexOf(t);
    if (j < 0 || file.beta[j]! < 0) throw new WpModelError(`monotone term ${t} has a negative coefficient`);
  }
  return { file, ep: epModel, features: compileFeatures(file.terms, WP_VARS) };
}

/**
 * The kneel-out rule: the offense leads, has the ball in the second half or overtime, and can let the
 * clock run out by kneeling on every remaining down, even if the defense stops the clock with every
 * timeout and one more stop (N2.2.2 acceptance: such a state returns at least 0.99; here exactly 1).
 */
export function canKneelOut(s: WpState, rules: WpRuleValues): boolean {
  if (s.scoreDiff <= 0 || s.firstHalf || s.field.kind !== 'scrimmage') return false;
  const kneels = rules.downs - s.field.down + 1;
  if (kneels < 1) return false;
  if (s.field.yardsToGoalYd > 100 - kneels * param('kneel.lossYd')) return false;
  const stops = s.field.timeoutsDefense + param('kneel.extraStops');
  const runs = kneels - 1 - stops;
  return runs >= 0 && runs * rules.playClockS >= s.gameSecondsLeft;
}

/** Win probability of the offense, with a standard error from the support grid (N2.2.2 outputs). */
export function wp(model: WpModel, s: WpState, math: DeterministicMath): WpValue {
  const support = model.file.support.counts[wpSupportIndex(model.file.support, s)] ?? 0;
  const sparse = support < param('sparseSupport');
  if (s.gameSecondsLeft <= 0) {
    const value = s.scoreDiff > 0 ? 1 : s.scoreDiff < 0 ? 0 : 0.5;
    return { value, se: 0, support, sparse, ruled: 'game_over' };
  }
  if (canKneelOut(s, model.file.rules)) return { value: 1, se: 0, support, sparse, ruled: 'kneel_out' };
  const row = standardise(model.features.raw(evalFor(model.ep, s, model.file.rules, math), math), model.file);
  let z = 0;
  for (let j = 0; j < row.length; j++) z += model.file.beta[j]! * row[j]!;
  const value = math.logistic(z);
  const se = math.sqrt(value * (1 - value) / (support > 1 ? support : 1));
  return { value, se, support, sparse, ruled: null };
}

/** How a play ended, for win probability added (N2.2.2 rule 3). */
export type WpEnd =
  | { readonly kind: 'state'; readonly after: WpState; readonly possessionChanged: boolean }
  | { readonly kind: 'final'; readonly offenseResult: number };

/** Win probability added for the team in possession at the snap. */
export function wpa(model: WpModel, before: WpState, end: WpEnd, math: DeterministicMath): number {
  const b = wp(model, before, math).value;
  if (end.kind === 'final') return end.offenseResult - b;
  const a = wp(model, end.after, math).value;
  return (end.possessionChanged ? 1 - a : a) - b;
}

/** One outcome of a decision option: its chance and the state (or final result) it leads to. */
export type OptionOutcome =
  | { readonly probability: number; readonly state: WpState; readonly deciderHasBall: boolean }
  | { readonly probability: number; readonly final: number };

export interface OptionValue {
  readonly value: number;
  readonly se: number;
  readonly outcomes: readonly { readonly probability: number; readonly wp: number; readonly se: number }[];
}

/**
 * Win probability of a decision option by the short search of N2.2.2 rule 4: the outcome-weighted mean of
 * the win probability of each resulting state, from the deciding team's view. The outcome chances come
 * from the caller, which is what separates the two versions: the staff version passes the staff's
 * estimates (D6 grades, the scouted view, the kicker's charted range); the truth version passes the
 * engine's contest-model chances and is stored for N3 and N4 only. The standard error treats the outcome
 * errors as independent.
 */
export function optionWp(model: WpModel, outcomes: readonly OptionOutcome[], math: DeterministicMath): OptionValue {
  let total = 0;
  for (const o of outcomes) {
    if (!(o.probability >= 0)) throw new WpModelError('an outcome probability is negative or not a number');
    total += o.probability;
  }
  if (Math.abs(total - 1) > 1e-9) throw new WpModelError(`outcome probabilities sum to ${total}, not 1`);
  let value = 0, varSum = 0;
  const detail: { probability: number; wp: number; se: number }[] = [];
  for (const o of outcomes) {
    let w: number, se: number;
    if ('final' in o) { w = o.final; se = 0; }
    else {
      const v = wp(model, o.state, math);
      w = o.deciderHasBall ? v.value : 1 - v.value;
      se = v.se;
    }
    value += o.probability * w;
    varSum += o.probability * o.probability * se * se;
    detail.push({ probability: o.probability, wp: w, se });
  }
  return { value, se: math.sqrt(varSum), outcomes: detail };
}
