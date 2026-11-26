// The decision chart the staff builds during the week (N2.4.1): for each field position and distance,
// go, field goal or punt with the edge in win-probability points, a two-point chart by score and time,
// and the head coach's edits stored as offsets so the live recomputation on game day still applies them.
//
// The chart is the staff version of the N2.2.2 rule 4 search: every outcome chance comes from the
// staff's estimates (own short-yardage rate against this front, the kicker's charted make curve with
// forecast weather and surface, own punt net), passed in by the caller. Nothing here reads a true rating.
//
// Conventions follow the win probability model (G-07): a state is seen from the team in possession; a
// kickoff state is seen from the receiving team (nflverse `posteam` on kickoffs).
import type { DeterministicMath, RuleSet } from '@gm/schema';
import { optionWp, wp, type OptionOutcome, type WpModel, type WpState } from '../wp/index.ts';
import type { EpState } from '../ep/index.ts';
import { coachsCall, confidence, type Confidence } from './limits.ts';
import { param } from './params.ts';

export class ChartError extends Error {}

export type FourthDownOption = 'go' | 'field_goal' | 'punt';
export const FOURTH_DOWN_OPTIONS: readonly FourthDownOption[] = ['go', 'field_goal', 'punt'];

export interface ChartRuleValues {
  readonly touchdown: number;
  readonly fieldGoal: number;
  readonly kickTry: number;
  readonly twoPointTry: number;
  readonly yardsToGain: number;
  readonly fieldLength: number;
  readonly fgMissMinYardline: number;
}

export function chartRuleValues(rules: RuleSet): ChartRuleValues {
  return {
    touchdown: rules.num('score.touchdown'),
    fieldGoal: rules.num('score.field_goal'),
    kickTry: rules.num('try.kick_points'),
    twoPointTry: rules.num('try.two_point_points'),
    yardsToGain: rules.num('series.yards_to_gain'),
    fieldLength: rules.num('field.goal_to_goal_yd'),
    fgMissMinYardline: rules.num('fg.miss_spot_min_yardline'),
  };
}

/** The staff's estimates for this matchup (N2.4.1 inputs). Probabilities 0 to 1. */
export interface ChartEstimates {
  /** Chance of converting a fourth down of this distance at this yard line against this front. */
  convert(distanceYd: number, yardsToGoalYd: number): number;
  /** The kicker's make chance from this line of scrimmage with forecast weather and surface; 0 out of range. */
  fieldGoal(yardsToGoalYd: number): number;
  /**
   * Where the opponent takes over after a missed field goal from this line of scrimmage, as the
   * opponent's yards to goal. The caller applies `fg.miss_spot` with its kick-spot geometry.
   */
  missedFieldGoalSpot(yardsToGoalYd: number): number;
  /** Opponent's yards to goal after a punt from here (own punt net and touchbacks); null when the staff would not punt from here. */
  punt(yardsToGoalYd: number): number | null;
  /** Kicked-try and two-point chances (two-point chart, and the value of a touchdown). */
  readonly kickTry: number;
  readonly twoPoint: number;
}

/** The neutral game state of the weekly chart (rule 3) and the base of a live cell. */
export interface ChartBase {
  readonly scoreDiff: number;
  readonly gameSecondsLeft: number;
  readonly halfSecondsLeft: number;
  readonly firstHalf: boolean;
  readonly receivesSecondHalfKickoff: boolean;
  readonly timeoutsOffense: number;
  readonly timeoutsDefense: number;
  readonly home: boolean;
  /** Strength gap in points, positive when the deciding team is stronger (N2.6.1). */
  readonly pregameGap: number;
}

/** Neutral state: tied, start of the second half (`chart.neutralSeconds`), full timeouts. */
export function neutralBase(timeouts: number, pregameGap: number, home: boolean): ChartBase {
  const s = param('chart.neutralSeconds');
  return { scoreDiff: 0, gameSecondsLeft: s, halfSecondsLeft: s, firstHalf: false, receivesSecondHalfKickoff: false, timeoutsOffense: timeouts, timeoutsDefense: timeouts, home, pregameGap };
}

export interface OptionCell {
  readonly option: FourthDownOption;
  readonly wp: number;
  readonly se: number;
}

export interface ChartCell {
  readonly yardsToGoalYd: number;
  readonly distanceYd: number;
  /** Options the staff would consider here, with modelled win probability. */
  readonly options: readonly OptionCell[];
  /** Best option by the model alone. */
  readonly model: FourthDownOption;
  /** Best option after the head coach's offsets (what goes on the call sheet). */
  readonly approved: FourthDownOption;
  /** Edge of the approved option over the next best, in win-probability units, after offsets. */
  readonly margin: number;
  /** Margin under the band: shown as "coach's call" (rule 2, N2.7.2). */
  readonly coachsCall: boolean;
  readonly confidence: Confidence;
}

export type EditReason = 'opponent_matchup' | 'weather_or_surface' | 'kicker_or_holder' | 'own_personnel' | 'game_plan_aggression' | 'staff_judgement';
export const EDIT_REASONS: readonly EditReason[] = ['opponent_matchup', 'weather_or_surface', 'kicker_or_holder', 'own_personnel', 'game_plan_aggression', 'staff_judgement'];

/** A head coach's shift of the chart (what the user does), stored as an offset (rule 4). */
export interface ChartEdit {
  readonly id: string;
  /** Inclusive region of the chart: yards to goal and distance. */
  readonly region: { readonly minYardsToGoal: number; readonly maxYardsToGoal: number; readonly minDistance: number; readonly maxDistance: number };
  readonly option: FourthDownOption;
  /** Added to the option's modelled win probability inside the region; positive favours it. */
  readonly offsetWp: number;
  readonly reason: EditReason;
}

/** Decision log entry for one edit (N3.2.2): the caller writes it to the log. */
export interface ChartEditLogEntry {
  readonly decisionType: 'decision_chart_edit';
  readonly editId: string;
  readonly option: FourthDownOption;
  readonly offsetWp: number;
  readonly reason: EditReason;
  readonly cellsChanged: number;
}

function field(base: ChartBase, p: Partial<EpState>): EpState {
  return {
    kind: 'scrimmage', down: 1, distanceYd: 10, yardsToGoalYd: 75,
    halfSecondsLeft: base.halfSecondsLeft, timeoutsOffense: base.timeoutsOffense, timeoutsDefense: base.timeoutsDefense, home: base.home, ...p,
  };
}

/** The game state from the deciding team's view (`mine`) or from the opponent's view. */
function stateFor(base: ChartBase, mine: boolean, scoreDiffMine: number, f: Partial<EpState>): WpState {
  const own = field(base, f);
  const fieldState: EpState = mine ? own : { ...own, timeoutsOffense: base.timeoutsDefense, timeoutsDefense: base.timeoutsOffense, home: !base.home };
  return {
    field: fieldState,
    scoreDiff: mine ? scoreDiffMine : -scoreDiffMine,
    gameSecondsLeft: base.gameSecondsLeft,
    overtime: false,
    firstHalf: base.firstHalf,
    receivesSecondHalfKickoff: mine ? base.receivesSecondHalfKickoff : !base.receivesSecondHalfKickoff,
    pregameGap: mine ? base.pregameGap : -base.pregameGap,
  };
}

function prob(p: number, what: string): number {
  if (!(p >= 0 && p <= 1)) throw new ChartError(`${what}: chance ${p} is outside 0 to 1`);
  return p;
}

/** Outcomes after the deciding team scores `points` and kicks off to the opponent. */
function afterScore(base: ChartBase, points: number, chance: number): OptionOutcome[] {
  return [{ probability: chance, state: stateFor(base, false, base.scoreDiff + points, { kind: 'kickoff', down: 0, distanceYd: 0 }), deciderHasBall: false }];
}

/** Touchdown, then the try by kick: two branches. */
function touchdown(base: ChartBase, r: ChartRuleValues, e: ChartEstimates, chance: number): OptionOutcome[] {
  const k = prob(e.kickTry, 'kicked try');
  return [...afterScore(base, r.touchdown + r.kickTry, chance * k), ...afterScore(base, r.touchdown, chance * (1 - k))];
}

function opponentBall(base: ChartBase, r: ChartRuleValues, opponentYardsToGoal: number, chance: number): OptionOutcome {
  const y = opponentYardsToGoal < 1 ? 1 : opponentYardsToGoal > r.fieldLength - 1 ? r.fieldLength - 1 : opponentYardsToGoal;
  return { probability: chance, state: stateFor(base, false, base.scoreDiff, { yardsToGoalYd: y, distanceYd: y < r.yardsToGain ? y : r.yardsToGain }), deciderHasBall: false };
}

/** Outcome lists of each option for a fourth down (staff version of N2.2.2 rule 4). */
export function fourthDownOutcomes(base: ChartBase, r: ChartRuleValues, e: ChartEstimates, yardsToGoal: number, distance: number): Partial<Record<FourthDownOption, OptionOutcome[]>> {
  if (distance < 1 || distance > yardsToGoal) throw new ChartError(`distance ${distance} at ${yardsToGoal} yards to goal is not a legal fourth down`);
  const out: Partial<Record<FourthDownOption, OptionOutcome[]>> = {};
  const c = prob(e.convert(distance, yardsToGoal), 'conversion');
  const fail = opponentBall(base, r, r.fieldLength - yardsToGoal, 1 - c);
  if (distance === yardsToGoal) out.go = [...touchdown(base, r, e, c), fail];
  else {
    const y = yardsToGoal - distance;
    out.go = [{ probability: c, state: stateFor(base, true, base.scoreDiff, { yardsToGoalYd: y, distanceYd: y < r.yardsToGain ? y : r.yardsToGain }), deciderHasBall: true }, fail];
  }
  const fg = prob(e.fieldGoal(yardsToGoal), 'field goal');
  if (fg > 0) {
    const miss = e.missedFieldGoalSpot(yardsToGoal);
    const maxOpp = r.fieldLength - r.fgMissMinYardline;
    out.field_goal = [...afterScore(base, r.fieldGoal, fg), opponentBall(base, r, miss > maxOpp ? maxOpp : miss, 1 - fg)];
  }
  const punt = e.punt(yardsToGoal);
  if (punt !== null) out.punt = [opponentBall(base, r, punt, 1)];
  return out;
}

function applyEdits(cells: OptionCell[], ytg: number, dist: number, edits: readonly ChartEdit[]): Map<FourthDownOption, number> {
  const adj = new Map<FourthDownOption, number>(cells.map((c) => [c.option, c.wp]));
  for (const ed of edits) {
    const g = ed.region;
    if (ytg < g.minYardsToGoal || ytg > g.maxYardsToGoal || dist < g.minDistance || dist > g.maxDistance) continue;
    const v = adj.get(ed.option);
    if (v !== undefined) adj.set(ed.option, v + ed.offsetWp);
  }
  return adj;
}

function best(m: Map<FourthDownOption, number>): { top: FourthDownOption; margin: number } {
  let top: FourthDownOption | null = null, a = -Infinity, b = -Infinity;
  for (const o of FOURTH_DOWN_OPTIONS) {
    const v = m.get(o);
    if (v === undefined) continue;
    if (v > a) { b = a; a = v; top = o; } else if (v > b) b = v;
  }
  if (top === null) throw new ChartError('no option available in a chart cell');
  return { top, margin: b === -Infinity ? 1 : a - b };
}

/** One cell, for the weekly chart or the live game-day recomputation (rule 3) with the real score and clock. */
export function chartCell(model: WpModel, base: ChartBase, r: ChartRuleValues, e: ChartEstimates, yardsToGoal: number, distance: number, edits: readonly ChartEdit[], math: DeterministicMath): ChartCell {
  const outs = fourthDownOutcomes(base, r, e, yardsToGoal, distance);
  const options: OptionCell[] = [];
  for (const o of FOURTH_DOWN_OPTIONS) {
    const list = outs[o];
    if (!list) continue;
    const v = optionWp(model, list, math);
    options.push({ option: o, wp: v.value, se: v.se });
  }
  const raw = best(new Map(options.map((c) => [c.option, c.wp])));
  const adj = best(applyEdits(options, yardsToGoal, distance, edits));
  const top = options.find((c) => c.option === adj.top)!;
  const next = options.filter((c) => c.option !== adj.top).sort((x, y) => y.wp - x.wp)[0];
  const density = wp(model, stateFor(base, true, base.scoreDiff, { down: 4, yardsToGoalYd: yardsToGoal, distanceYd: distance }), math).support;
  const call = next ? coachsCall(adj.margin, top.se, next.se, math.sqrt) : false;
  return {
    yardsToGoalYd: yardsToGoal, distanceYd: distance, options, model: raw.top, approved: adj.top, margin: adj.margin, coachsCall: call,
    confidence: confidence({ se: top.se, density }),
  };
}

export interface DecisionChart {
  readonly base: ChartBase;
  readonly cells: readonly ChartCell[];
  readonly twoPoint: readonly TwoPointCell[];
  readonly edits: readonly ChartEdit[];
}

/** Builds the weekly chart (rule 1): every yard line by every distance up to `chart.maxDistanceYd`, in a neutral state. */
export function buildDecisionChart(model: WpModel, base: ChartBase, r: ChartRuleValues, e: ChartEstimates, edits: readonly ChartEdit[], math: DeterministicMath): DecisionChart {
  const cells: ChartCell[] = [];
  const step = param('chart.yardStep');
  const maxD = param('chart.maxDistanceYd');
  for (let ytg = 1; ytg < r.fieldLength; ytg += step) {
    for (let d = 1; d <= maxD && d <= ytg; d++) cells.push(chartCell(model, base, r, e, ytg, d, edits, math));
  }
  return { base, cells, twoPoint: buildTwoPointChart(model, base, r, e, math), edits: [...edits] };
}

/** Log entries for the head coach's edits (N3.2.2), each with its reason and how many cells it flipped. */
export function editLog(chart: DecisionChart): ChartEditLogEntry[] {
  return chart.edits.map((ed) => {
    let changed = 0;
    for (const c of chart.cells) {
      const g = ed.region;
      if (c.yardsToGoalYd < g.minYardsToGoal || c.yardsToGoalYd > g.maxYardsToGoal || c.distanceYd < g.minDistance || c.distanceYd > g.maxDistance) continue;
      if (c.model !== c.approved) changed++;
    }
    return { decisionType: 'decision_chart_edit', editId: ed.id, option: ed.option, offsetWp: ed.offsetWp, reason: ed.reason, cellsChanged: changed };
  });
}

// ---------------------------------------------------------------- two-point chart

export interface TwoPointCell {
  /** Deciding team's lead after the touchdown, before the try (negative: trailing). */
  readonly scoreDiffBeforeTry: number;
  readonly gameSecondsLeft: number;
  readonly kickWp: number;
  readonly twoWp: number;
  readonly choice: 'kick' | 'two';
  readonly margin: number;
  readonly coachsCall: boolean;
}

/** Score differences and times of the two-point chart rows (N2.4.1 "by score difference and time"). */
export const TWO_POINT_DIFFS: readonly number[] = [-15, -14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const TWO_POINT_SECONDS: readonly number[] = [3000, 1800, 900, 480, 240, 120];

export function twoPointCell(model: WpModel, base: ChartBase, r: ChartRuleValues, e: ChartEstimates, diff: number, seconds: number, math: DeterministicMath): TwoPointCell {
  const b: ChartBase = { ...base, scoreDiff: diff, gameSecondsLeft: seconds, halfSecondsLeft: seconds < base.halfSecondsLeft ? seconds : base.halfSecondsLeft, firstHalf: false };
  const k = prob(e.kickTry, 'kicked try'), t = prob(e.twoPoint, 'two-point try');
  const kick = optionWp(model, [...afterScore(b, r.kickTry, k), ...afterScore(b, 0, 1 - k)], math);
  const two = optionWp(model, [...afterScore(b, r.twoPointTry, t), ...afterScore(b, 0, 1 - t)], math);
  const choice = two.value > kick.value ? 'two' : 'kick';
  const margin = choice === 'two' ? two.value - kick.value : kick.value - two.value;
  return { scoreDiffBeforeTry: diff, gameSecondsLeft: seconds, kickWp: kick.value, twoWp: two.value, choice, margin, coachsCall: coachsCall(margin, kick.se, two.se, math.sqrt) };
}

export function buildTwoPointChart(model: WpModel, base: ChartBase, r: ChartRuleValues, e: ChartEstimates, math: DeterministicMath): TwoPointCell[] {
  const out: TwoPointCell[] = [];
  for (const s of TWO_POINT_SECONDS) for (const d of TWO_POINT_DIFFS) out.push(twoPointCell(model, base, r, e, d, s, math));
  return out;
}
