// Every validator of the simulation contract by name, for the schema lints (P3.1.2, Q1.2.1) and the
// truth scan (Q1.4.2). `allSchemas()` in ../registry.ts includes these.
import type { z } from 'zod';
import { TuningParam, ParamFile, RuleKeyManifest } from './params.ts';
import { Environment } from './environment.ts';
import { SimPlayer, SimTeam, ObservedPlayer, FieldedPlayer } from './player.ts';
import { GameSituation, PlayCalls } from './situation.ts';
import { PlayTruth, PlayerDelta } from './truth.ts';
import {
  OfficialsCrew, Ruling, FoulRecord, PlayOutcome, EnforcementOption, CalledPlay, SeriesState, ClockResult,
  PeriodTransition, RestartSetup, OvertimeState, OvertimeStep, ReviewRequest, ReviewResult,
} from './officiating.ts';
import { GameState, DecisionRequest, Decision, DriveRecord, PlayRecord, GameEvent } from './game-state.ts';
import { StatCredit, PlayByPlayRow, GameSummary } from './stats.ts';
import { CalibrationTarget, CalibrationTargetFile, TargetResult } from './calibration.ts';
import { Assignment } from './assignment.ts';

export function simSchemas(): Record<string, z.ZodType> {
  return {
    'sim:TuningParam': TuningParam, 'sim:ParamFile': ParamFile, 'sim:RuleKeyManifest': RuleKeyManifest,
    'sim:Environment': Environment, 'sim:SimPlayer': SimPlayer, 'sim:SimTeam': SimTeam,
    'sim:ObservedPlayer': ObservedPlayer, 'sim:FieldedPlayer': FieldedPlayer,
    'sim:GameSituation': GameSituation, 'sim:PlayCalls': PlayCalls, 'sim:PlayTruth': PlayTruth,
    'sim:PlayerDelta': PlayerDelta, 'sim:OfficialsCrew': OfficialsCrew, 'sim:Ruling': Ruling,
    'sim:FoulRecord': FoulRecord, 'sim:PlayOutcome': PlayOutcome, 'sim:EnforcementOption': EnforcementOption,
    'sim:CalledPlay': CalledPlay, 'sim:SeriesState': SeriesState, 'sim:ClockResult': ClockResult,
    'sim:PeriodTransition': PeriodTransition, 'sim:RestartSetup': RestartSetup, 'sim:OvertimeState': OvertimeState,
    'sim:OvertimeStep': OvertimeStep, 'sim:ReviewRequest': ReviewRequest, 'sim:ReviewResult': ReviewResult,
    'sim:GameState': GameState, 'sim:DecisionRequest': DecisionRequest, 'sim:Decision': Decision,
    'sim:DriveRecord': DriveRecord, 'sim:PlayRecord': PlayRecord, 'sim:GameEvent': GameEvent,
    'sim:StatCredit': StatCredit, 'sim:PlayByPlayRow': PlayByPlayRow, 'sim:GameSummary': GameSummary,
    'sim:CalibrationTarget': CalibrationTarget, 'sim:CalibrationTargetFile': CalibrationTargetFile,
    'sim:TargetResult': TargetResult, 'sim:Assignment': Assignment,
  };
}

/**
 * Contract schemas that may be sent to the interface as they are: no field of class truth anywhere
 * inside them. The schema test proves it. Everything else must pass the observer filter first (P1.1.4).
 */
export function simPublicSchemas(): Record<string, z.ZodType> {
  return {
    'sim:GameSituation': GameSituation, 'sim:PlayCalls': PlayCalls, 'sim:DecisionRequest': DecisionRequest,
    'sim:Decision': Decision, 'sim:DriveRecord': DriveRecord, 'sim:SeriesState': SeriesState,
    'sim:ClockResult': ClockResult, 'sim:PlayOutcome': PlayOutcome, 'sim:StatCredit': StatCredit,
    'sim:PlayByPlayRow': PlayByPlayRow, 'sim:GameSummary': GameSummary, 'sim:ObservedPlayer': ObservedPlayer,
    'sim:Environment': Environment,
  };
}
