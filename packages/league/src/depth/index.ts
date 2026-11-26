// @gm/league, depth chart module (G-56): the depth chart object, package and situational charts, the
// injury cascade and emergency card, building the game-day list, rotation rules and snap plans, snap
// limits and the redshirt tracker, special teams units and specialists, position battles, and role labels
// with role talks (M2, I6.1). The engine's substitution assistant (WP-18) executes the plan in game.
export { PARAMS, P } from './params.ts';
export { RULE_KEYS, depthRules, type DepthRules } from './keys.ts';
export * from './types.ts';
export type { DepthRecordRotation } from './records.ts';
export {
  unitSide, unitDef, resolveUnit, lineupFor, validateChart, toSimDepth, toRecords, unitsFromRecords, changeAllowedAfterLock,
  type ResolvedUnit, type UnitLineup, type RecordRotation,
} from './chart.ts';
export { replaceInjured, lineCapableOnField, lineShort, emergencyKnowledge, emergencyWarnings, type Replacement, type CascadeResult } from './cascade.ts';
export { draftGameDay, healthyScratchStreaks, type GameDayDraft, type GameDayInput, type InactiveReason } from './gameday.ts';
export {
  choosePackage, packageLineup, situationalBack, fillSituational, unfilledSituational,
  type DeadBall, type PackageLineup, type SituationalRole, type SituationalFill,
} from './packages.ts';
export {
  defaultShare, staffShares, holderForNextSnap, waveDue, plannedVersusActual, toEnginePlan, toRecordRotation,
  type ChangeUnit, type RotationException, type RotationRule, type RotationState, type MissedSwap, type EnginePlayerPlan, type EngineRotationPlan,
} from './rotation.ts';
export { limitInSnaps, mustComeOff, medicalSuggestion, developmentSwapIn, redshirtStatus, type LimitKind, type SnapLimit, type LimitContext, type RedshirtStatus } from './limits.ts';
export { specialTeamsCounts, starterCapProblems, lowValueBackups, specialTeamsLoad, timingPenalty, slowOperation } from './specialteams.ts';
export { battleCard, battleClock, battleAfterInjury, decideBattle, type Battle, type BattleEvidence, type BattleCardRow, type BattleClock, type OpponentTier } from './battles.ts';
export { roleOf, roleChanges, talkOutcome, promiseFromTalk, type RoleLabel, type RoleInput, type Delivery, type RoleChangeEvent, type TalkOutcome, type RolePromise } from './roles.ts';
export { installCost, alignmentAllowed, staffDefaultAlignment, type AlignmentRule, type PositionPair, type PairAlignment } from './alignment.ts';
