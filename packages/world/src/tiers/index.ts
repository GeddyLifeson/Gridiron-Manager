// Fidelity tiers (G-82; X13, P6.4). Who is near the user, what is recorded for them, how they move
// between tiers, and the checks that no tier changes the simulation (A3.1.1 row 20).
export { MODULE, PARAMS, param } from './params.ts';
export { TIER_CHANGED, TIER_EVENT_TYPES } from './events.ts';
export {
  TIERS, SIM_SYSTEMS, RECORDING, simCadence, recordingFor, gameTier, policyProblems, executionOrder,
  type SimSystem, type TierRecording,
} from './policy.ts';
export {
  SHORT_REASONS, NO_USER, teamMembers, teamOfPeople, competitionScope, computeMembership,
  type TeamReason, type PersonReason, type CompetitionScope, type Edge, type TierInputs, type Placement, type Membership,
} from './membership.ts';
export {
  createTierState, teamTier, personTier, recomputeTiers, tierRows,
  type RecomputeAt, type SubjectKind, type TierState, type TierChange, type RecomputeResult,
} from './moves.ts';
export {
  gamePortSeamProblems, resimProblems, outcomeHash, pairedWatchTest, ratesByTier, rateProblems,
  type PairedReport, type TierRates,
} from './seam.ts';
export {
  THINNING_ORDER, RULED_OUT_STEPS, METRICS, configLadder, configProblems, median3, spread, agrees, buildReport, reportProblems,
  chooseShipping, diffReports, needsRerun,
  type ThinningStep, type TierConfig, type Metric, type Triple, type MeasuredNumber, type TierReport, type Budgets, type ShippingChoice, type ReportDiff,
} from './measure.ts';
