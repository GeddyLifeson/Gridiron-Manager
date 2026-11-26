// The model's view (N3.3). Pure functions: the caller supplies estimates from the N2 models (G-07), the
// log stores the result. The game never changes because of a score (N3.3.1 "The score never changes the game").
//
// G-07 contract (PR 35, packages/models/src/wp/): `optionWp(model, outcomes, math)` returns
// `{ value, se, outcomes }` for one option, rolling its outcomes through win probability (N3.3.1 rule 1).
// `evaluateOptions` takes that function as `evaluate`, so this module does not import G-07 directly and
// a test can pass a fixed table. Staff and truth chances are passed separately (N3.3.1 rule 2).
import { addDays, compareIso } from './dates.ts';
import { modelLacks } from './information.ts';
import { param } from './params.ts';
import type {
  DecisionClass, Estimate, GameManagementView, InformationItem, NoModelView, OptionScore, PlayCallView, TruthView,
} from './types.ts';

export class ModelViewError extends Error {}

// ---------------------------------------------------------------- N3.3.1 game management

/** What the evaluator returns for one option: G-07's `OptionValue` satisfies it (sparse is optional). */
export interface OptionValueLike {
  readonly value: number;
  readonly se: number;
  readonly sparse?: boolean;
}

export interface OptionInputs<O> {
  readonly optionId: string;
  /** Outcome chances from the staff's grades of his own players and the scouting view (N3.3.1 rule 2). */
  readonly staffOutcomes: O;
  /** Outcome chances from the engine's true values; stored for N4, shown only in the coaching school. */
  readonly truthOutcomes: O;
  /** Set by the caller when any state the option rolls into is sparse in the model (N2.7.2). */
  readonly sparse?: boolean;
}

export interface EvaluatedOption {
  readonly optionId: string;
  readonly staff: Estimate;
  readonly truth: Estimate;
}

/** Runs the evaluator (normally G-07 `optionWp` with a model and math bound) over staff and truth chances. */
export function evaluateOptions<O>(options: readonly OptionInputs<O>[], evaluate: (outcomes: O) => OptionValueLike): EvaluatedOption[] {
  return options.map((o) => {
    const s = evaluate(o.staffOutcomes);
    const t = evaluate(o.truthOutcomes);
    const sparse = o.sparse === true;
    return {
      optionId: o.optionId,
      staff: { value: s.value, se: s.se, sparse: sparse || s.sparse === true },
      truth: { value: t.value, se: t.se, sparse: sparse || t.sparse === true },
    };
  });
}

function check(e: Estimate, id: string): void {
  if (!Number.isFinite(e.value) || e.value < 0 || e.value > 1) throw new ModelViewError(`option ${id}: win probability ${e.value} is outside 0 to 1`);
  if (!Number.isFinite(e.se) || e.se < 0) throw new ModelViewError(`option ${id}: standard error ${e.se} is negative or not finite`);
}

/** Half-width of an option's range: rangeSe standard errors, widened for a sparse state (N3.3.1 edge case). */
export function halfWidth(e: Estimate): number {
  const h = param('rangeSe') * e.se;
  const floor = e.sparse ? param('sparseMinHalfWidth') : 0;
  return h > floor ? h : floor;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function toScore(id: string, e: Estimate): OptionScore {
  const h = halfWidth(e);
  return { optionId: id, value: e.value, low: clamp01(e.value - h), high: clamp01(e.value + h), sparse: e.sparse };
}

/**
 * Floating-point guard for the range comparison: a gap equal to the combined range is inside it, and
 * rounding (0.30 - 0.28 is 0.020000000000000018) must not push it out. Not a football number.
 */
const ROUNDING_GUARD = 1e-9;

interface Classified {
  readonly best: string;
  readonly cost: number;
  readonly margin: number;
  readonly class: DecisionClass;
}

/**
 * N3.3.1 rule 3. "Clearly wrong" only if the chosen option is worse than the best by more than the
 * combined range (the two half-widths added). "Clearly right" if the chosen option is the best and beats
 * every other by more than their combined range. Anything else is a toss-up. A sparse option on either
 * side of a comparison makes it a toss-up (edge case: weak states are never classed clearly wrong).
 */
export function classify(options: readonly { optionId: string; est: Estimate }[], chosen: string): Classified {
  if (options.length < 2) throw new ModelViewError('a scored decision needs at least two options');
  const c = options.find((o) => o.optionId === chosen);
  if (!c) throw new ModelViewError(`chosen option ${chosen} is not among the options`);
  let best = c;
  for (const o of options) if (o.est.value > best.est.value) best = o;
  if (best !== c) {
    const cost = best.est.value - c.est.value;
    const margin = halfWidth(best.est) + halfWidth(c.est);
    const weak = best.est.sparse || c.est.sparse;
    return { best: best.optionId, cost, margin, class: !weak && cost > margin + ROUNDING_GUARD ? 'clearly_wrong' : 'toss_up' };
  }
  // Chosen is (one of) the best. Right only if clear of every other option.
  let margin = 0;
  let clear = true;
  for (const o of options) {
    if (o === c) continue;
    const m = halfWidth(c.est) + halfWidth(o.est);
    if (m > margin) margin = m;
    if (c.est.sparse || o.est.sparse || !(c.est.value - o.est.value > m + ROUNDING_GUARD)) clear = false;
  }
  return { best: c.optionId, cost: 0, margin, class: clear ? 'clearly_right' : 'toss_up' };
}

export interface GameManagementResult {
  readonly view: GameManagementView;
  readonly truth: TruthView;
}

/** Builds the N3.3.1 view (staff version) and its truth companion. */
export function scoreGameManagement(input: {
  readonly modelId: string;
  readonly options: readonly EvaluatedOption[];
  readonly chosen: string;
  readonly information: readonly InformationItem[];
}): GameManagementResult {
  const ids = new Set<string>();
  for (const o of input.options) {
    if (ids.has(o.optionId)) throw new ModelViewError(`option ${o.optionId} listed twice`);
    ids.add(o.optionId);
    check(o.staff, o.optionId);
    check(o.truth, o.optionId);
  }
  const staff = classify(input.options.map((o) => ({ optionId: o.optionId, est: o.staff })), input.chosen);
  const truth = classify(input.options.map((o) => ({ optionId: o.optionId, est: o.truth })), input.chosen);
  return {
    view: {
      kind: 'game_management',
      modelId: input.modelId,
      options: input.options.map((o) => toScore(o.optionId, o.staff)),
      chosen: input.chosen,
      best: staff.best,
      cost: staff.cost,
      margin: staff.margin,
      class: staff.class,
      lacks: modelLacks(input.information),
    },
    truth: {
      kind: 'game_management',
      options: input.options.map((o) => toScore(o.optionId, o.truth)),
      best: truth.best,
      cost: truth.cost,
    },
  };
}

// ---------------------------------------------------------------- N3.3.2 play calls

/** One look of the scouted mix (N3.3.2 rule 2), from the information set. */
export interface ScoutedLook {
  readonly look: string;
  readonly probability: number;
  /** Charted plays behind the probability (shown with the value, N2.1.2). */
  readonly sample: number;
}

/** A value table of concept against look: expected points added at rated execution (N3.3.2 rule 1). */
export type CallValueTable = (concept: string, look: string) => number;

export interface PlayCallInput {
  readonly modelId: string;
  readonly concept: string;
  readonly scoutedMix: readonly ScoutedLook[];
  /** The analytics staff's table, built from league-wide charted plays (N2.1.2, N2.3.1). */
  readonly staffTable: CallValueTable;
  /**
   * Probability the caller's own tendency table (G8, G-07 predictability) gave this call's family in this
   * situation before the snap.
   */
  readonly predictability: number;
}

function mixAverage(concept: string, mix: readonly ScoutedLook[], table: CallValueTable): number {
  if (mix.length === 0) throw new ModelViewError('the scouted mix is empty');
  let total = 0, value = 0;
  for (const l of mix) {
    if (!(l.probability >= 0)) throw new ModelViewError(`look ${l.look}: probability is negative or not a number`);
    total += l.probability;
    value += l.probability * table(concept, l.look);
  }
  if (Math.abs(total - 1) > 1e-9) throw new ModelViewError(`scouted mix sums to ${total}, not 1`);
  return value;
}

/**
 * N3.3.2 foresight view. Its inputs hold no truth: the opponent's actual call and the engine's own table
 * go only to `playCallTruth`, so swapping the actual call cannot change foresight (acceptance).
 */
export function scorePlayCall(input: PlayCallInput): PlayCallView {
  if (!(input.predictability >= 0 && input.predictability <= 1)) throw new ModelViewError(`predictability ${input.predictability} is outside 0 to 1`);
  let sample = 0;
  for (const l of input.scoutedMix) sample += l.sample;
  return {
    kind: 'play_call',
    modelId: input.modelId,
    foresight: mixAverage(input.concept, input.scoutedMix, input.staffTable),
    foresightSample: sample,
    predictability: input.predictability,
  };
}

/** N3.3.2 hindsight (against the true call) and the engine-table foresight. For N4 and the coaching school only. */
export function playCallTruth(input: {
  readonly concept: string;
  readonly scoutedMix: readonly ScoutedLook[];
  readonly actualLook: string;
  readonly engineTable: CallValueTable;
}): TruthView {
  return {
    kind: 'play_call',
    hindsight: input.engineTable(input.concept, input.actualLook),
    engineForesight: mixAverage(input.concept, input.scoutedMix, input.engineTable),
  };
}

// ---------------------------------------------------------------- N3.3.3 no model

/** N3.3.3: no score; follow-up checks at 4 weeks and at the end of the season (whichever dates exist). */
export function noModelView(decisionDate: string, seasonEndDate: string | null): NoModelView {
  const weeks = addDays(decisionDate, param('followUpWeeks') * 7);
  const dates = [weeks];
  if (seasonEndDate !== null && compareIso(seasonEndDate, decisionDate) > 0 && seasonEndDate !== weeks) dates.push(seasonEndDate);
  dates.sort(compareIso);
  return { kind: 'none', followUps: dates };
}

/** Whether two staff grade bands overlapped at the time (N3.3.3 "At the time their bands overlapped"). */
export function bandsOverlap(a: { low: number; high: number }, b: { low: number; high: number }): boolean {
  return a.low <= b.high && b.low <= a.high;
}
