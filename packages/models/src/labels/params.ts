// Numbers for the label engine (G-22, X2.2, X2.3, N2.8). Basis per plans/game-build-plan.md section 2:
// `bible` with the leaf that states the starting value, or `assumption` when this module chose it.
import type { ParamFile } from '@gm/schema';

export const LABELS_MODULE = 'models.labels';

const P = {
  /** N2.8.1 rule 2: strength thresholds in standard-error units. */
  zMild: 1.0, zClear: 1.75, zStrong: 2.5,
  /** Assumption: default `thresholdOff`, nearer the baseline than any `thresholdOn` (X2.2.2 rule 2). */
  zOffDefault: 0.5,
  /** N2.8.1 rule 3: minimum weighted samples by label kind. */
  minGameManagement: 20, minPlayCalling: 150, minPerformance: 8, minConduct: 3,
  /** N2.8.1 rule 3: half-lives in seasons. Staff conduct and tendencies follow the coaching values. */
  halfLifeTendency: 2, halfLifeForm: 1, halfLifeConduct: 3,
  /** X2.2.3 rule 2: stale line where a label sets no window. */
  staleSeasonsDefault: 2,
  /** X2.2.3 rule 3: weight 1 fresh, straight line to 0.5 at twice the window; frozen labels fall to 0.3. */
  weightFresh: 1.0, weightHeldFloor: 0.5, weightFrozenFloor: 0.3,
  /** Assumption: a frozen label reaches its floor at four windows (X2.2.3 says only that it keeps falling). */
  frozenFloorAtWindows: 4,
  /** X2.3.1 rule 1: public labels reach the other level a season late at half weight. */
  otherLevelDelaySeasons: 1, otherLevelDiscount: 0.5,
  /** X2.3.1 rule 2: a first-hand impression outweighs a public label 2 to 1. */
  firstHandRatio: 2,
  /** Assumption: a first-hand impression needs half the label's minimum sample (X2.2.2 edge case). */
  impressionSampleShare: 0.5,
  /** X2.2.2 rule 3: accepted false-positive share for calibration. */
  falsePositiveTarget: 0.05,
  /** Assumption: below this many subjects at a level the label uses the all-level baseline (X2.2.1 edge). */
  thinBaselineSubjects: 5,
  /** Design value of the phase 0 calendar (league/data/calendar.json, C4) for day fractions of a season. */
  daysPerSeasonYear: 365,
} as const;

export const LABEL_PARAMS = P;

type Row = { name: string; value: number; unit: string; basis: 'bible' | 'assumption'; leaf: string; by: string };
const rows: Row[] = [
  { name: 'labels.z.mild', value: P.zMild, unit: 'se', basis: 'bible', leaf: 'N2.8.1', by: 'labels test "strength bands"' },
  { name: 'labels.z.clear', value: P.zClear, unit: 'se', basis: 'bible', leaf: 'N2.8.1', by: 'labels test "strength bands"' },
  { name: 'labels.z.strong', value: P.zStrong, unit: 'se', basis: 'bible', leaf: 'N2.8.1', by: 'labels test "strength bands"' },
  { name: 'labels.z.offDefault', value: P.zOffDefault, unit: 'se', basis: 'assumption', leaf: 'X2.2.2', by: 'labels test "behaviour change fades within the window"' },
  { name: 'labels.minSample.gameManagement', value: P.minGameManagement, unit: 'count', basis: 'bible', leaf: 'N2.8.1', by: 'labels test "no label before the minimum sample"; Q2 calibration (X2.2.2 rule 3)' },
  { name: 'labels.minSample.playCalling', value: P.minPlayCalling, unit: 'count', basis: 'bible', leaf: 'N2.8.1', by: 'Q2 calibration (X2.2.2 rule 3)' },
  { name: 'labels.minSample.performance', value: P.minPerformance, unit: 'count', basis: 'bible', leaf: 'N2.8.1', by: 'Q2 calibration (X2.2.2 rule 3)' },
  { name: 'labels.minSample.conduct', value: P.minConduct, unit: 'count', basis: 'bible', leaf: 'N2.8.1', by: 'labels test "conduct count label"' },
  { name: 'labels.halfLife.tendency', value: P.halfLifeTendency, unit: 'seasons', basis: 'bible', leaf: 'N2.8.1', by: 'labels test "behaviour change fades within the window"' },
  { name: 'labels.halfLife.form', value: P.halfLifeForm, unit: 'seasons', basis: 'bible', leaf: 'N2.8.1', by: 'Q2 calibration' },
  { name: 'labels.halfLife.conduct', value: P.halfLifeConduct, unit: 'seasons', basis: 'bible', leaf: 'N2.8.1', by: 'labels test "conduct count label"' },
  { name: 'labels.stale.defaultSeasons', value: P.staleSeasonsDefault, unit: 'seasons', basis: 'bible', leaf: 'X2.2.3', by: 'labels test "weight and staleness"' },
  { name: 'labels.weight.fresh', value: P.weightFresh, unit: 'ratio', basis: 'bible', leaf: 'X2.2.3', by: 'labels test "weight and staleness"' },
  { name: 'labels.weight.heldFloor', value: P.weightHeldFloor, unit: 'ratio', basis: 'bible', leaf: 'X2.2.3', by: 'labels test "weight and staleness"' },
  { name: 'labels.weight.frozenFloor', value: P.weightFrozenFloor, unit: 'ratio', basis: 'bible', leaf: 'X2.2.3', by: 'labels test "weight and staleness"' },
  { name: 'labels.weight.frozenFloorAtWindows', value: P.frozenFloorAtWindows, unit: 'windows', basis: 'assumption', leaf: 'X2.2.3', by: 'labels test "weight and staleness"' },
  { name: 'labels.observer.otherLevelDelaySeasons', value: P.otherLevelDelaySeasons, unit: 'seasons', basis: 'bible', leaf: 'X2.3.1', by: 'labels test "observer views"' },
  { name: 'labels.observer.otherLevelDiscount', value: P.otherLevelDiscount, unit: 'ratio', basis: 'bible', leaf: 'X2.3.1', by: 'labels test "observer views"' },
  { name: 'labels.observer.firstHandRatio', value: P.firstHandRatio, unit: 'ratio', basis: 'bible', leaf: 'X2.3.1', by: 'labels test "observer views"' },
  { name: 'labels.observer.impressionSampleShare', value: P.impressionSampleShare, unit: 'ratio', basis: 'assumption', leaf: 'X2.2.2', by: 'labels test "observer views"' },
  { name: 'labels.calibration.falsePositiveTarget', value: P.falsePositiveTarget, unit: 'ratio', basis: 'bible', leaf: 'X2.2.2', by: 'labels test "baseline coach false-positive share"' },
  { name: 'labels.baseline.thinSubjects', value: P.thinBaselineSubjects, unit: 'count', basis: 'assumption', leaf: 'X2.2.1', by: 'labels test "thin baseline"' },
  { name: 'labels.calendar.daysPerSeasonYear', value: P.daysPerSeasonYear, unit: 'days', basis: 'assumption', leaf: 'C4', by: 'labels test "behaviour change fades within the window"' },
];

export const PARAMS: ParamFile = {
  module: LABELS_MODULE,
  version: '0.1.0',
  params: rows.map((r) => ({
    name: r.name, value: r.value, min: r.value, max: r.value, unit: r.unit, belongsTo: LABELS_MODULE,
    basis: r.basis, leaf: r.leaf, constrainedBy: r.by, status: 'starting' as const,
  })),
};
