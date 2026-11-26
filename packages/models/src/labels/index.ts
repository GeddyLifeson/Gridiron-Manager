// models/src/labels (G-22): the label engine (X2.2, X2.3, N2.8). Labels are computed from event rows on
// demand and never stored (W-22). The integrator adds the namespace re-export to the package barrel.
export { LABELS_MODULE, PARAMS, LABEL_PARAMS } from './params.ts';
export {
  labelDefProblems, countersFor, matchKey, matchCount, rowMatches, minSampleOf, halfLifeOf, thresholdOnOf, thresholdOffOf,
  TRUTH_FIELD_NAMES, SUMMARY_TYPE,
  type LabelDef, type EventMatch, type LabelKind, type SubjectKind, type Scalar,
} from './define.ts';
export { pow2, decayWeight } from './math.ts';
export {
  evaluateLabel, buildBaseline, measureOf, evidenceItems, labelWeight, strengthOf, seasonTime, subjectsOf, levelKey,
  type Baseline, type EvalContext, type EvidenceItem, type LabelResult, type LabelTransition, type Strength,
} from './evaluate.ts';
export { traceLabel, reversalMap, type TraceResult } from './trace.ts';
export { observerView, witnessedBy, isPublicRow, delayedFor, type Observer, type ViewEntry, type ViewContext } from './observer.ts';
