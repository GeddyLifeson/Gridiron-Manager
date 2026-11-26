// The concussion protocol (D11.4.1, D11.4.2, H5.4.1). Removal and the in-game evaluation happen in the
// engine (J10, B1); this module owns what the evaluation decides, the next-day follow-up exam, and the
// five-step return with no fixed timeline. No user action changes a step; sending a player back against
// the protocol is a breakable act (authority.ts).
import type { RandomStream } from '@gm/schema';
import data from './data/concussion.json' with { type: 'json' };
import { quantile } from './catalogue.ts';
import type { ConcussionProtocol } from './keys.ts';
import { P } from './params.ts';
import type { Participation } from './types.ts';

export interface ProtocolStep { readonly step: number; readonly name: string; readonly practice: Participation }
export interface ProtocolDef { readonly factId: string; readonly consultantConfirms: boolean; readonly steps: readonly ProtocolStep[] }

export function protocolDef(id: ConcussionProtocol): ProtocolDef {
  const d = (data.protocols as Record<string, ProtocolDef>)[id];
  if (!d) throw new Error(`league.medical: no concussion protocol ${id}`);
  return d;
}

/** No-go signs end the day with no further judgment (D11.4.1 rule 5; ataxia whatever its cause). */
export const NO_GO_SIGNS = ['loss_of_consciousness', 'confusion', 'amnesia', 'ataxia'] as const;
export type NoGoSign = (typeof NO_GO_SIGNS)[number];

export type EvaluationResult = 'out_no_go' | 'out_diagnosed' | 'cleared_to_return';

/**
 * Result of an in-game evaluation (D11.4.1 rules 5 and 6). A shown no-go sign is out; otherwise a true
 * concussion is found with probability 0.9 and a false alarm returns. `missed` marks a true concussion
 * the evaluation did not find, for the follow-up exam.
 */
export function evaluate(signs: readonly NoGoSign[], trueConcussion: boolean, s: RandomStream): { result: EvaluationResult; missed: boolean } {
  const found = s.chance(P('concussionDetection'));
  if (signs.length > 0) return { result: 'out_no_go', missed: false };
  if (!trueConcussion) return { result: 'cleared_to_return', missed: false };
  return found ? { result: 'out_diagnosed', missed: false } : { result: 'cleared_to_return', missed: true };
}

/** The next-day follow-up exam every evaluated player gets (D11.4.1 rule 7) can find a missed concussion. */
export function followUpFinds(missed: boolean, s: RandomStream): boolean {
  const hit = s.chance(P('followUpFindsMissed'));
  return missed && hit;
}

export interface ProtocolState {
  readonly protocol: ConcussionProtocol;
  /** Current step, 1 to the last; `cleared` once the physician (and consultant, if required) sign off. */
  readonly step: number;
  readonly cleared: boolean;
  /** Day step 1 began. */
  readonly startDay: number;
  /** Last day the protocol was run; at most one step per day. */
  readonly lastStepDay: number;
  /** Hidden: symptom days still to clear before step 1 is tolerated (truth). */
  readonly symptomDaysLeft: number;
  /** Diagnosed players do not speak to media until cleared (D11.4.2, 1 of 3). */
  readonly mediaAvailable: boolean;
}

/** Symptom days, lengthened 30 percent per prior concussion in the last 12 months (D11.4.2). */
export function drawSymptomDays(priorDays: readonly number[], today: number, s: RandomStream): number {
  const base = quantile(data.symptomDays.quantiles as [number, number][], s.uniform());
  const recent = priorDays.filter((d) => today - d <= P('priorConcussionWindowDays')).length;
  return Math.round(base * (1 + P('priorConcussionLengthen') * recent));
}

export function startProtocol(protocol: ConcussionProtocol, day: number, symptomDays: number): ProtocolState {
  return { protocol, step: 1, cleared: false, startDay: day, lastStepDay: day, symptomDaysLeft: symptomDays, mediaAvailable: false };
}

/**
 * One day of the protocol. While symptoms last the player stays at step 1. After that he advances one
 * step per day if he tolerates the current one; symptoms returning send him back one step. After the last
 * step the physician clears him, and the consultant confirms when the rule requires it.
 */
export function protocolDay(st: ProtocolState, day: number, consultantConfirms: boolean, consultantAvailable: boolean, s: RandomStream): ProtocolState {
  if (st.cleared || day <= st.lastStepDay) return st;
  const relapse = s.chance(P('stepFailChance'));
  if (st.symptomDaysLeft > 0) return { ...st, symptomDaysLeft: st.symptomDaysLeft - 1, lastStepDay: day };
  const last = protocolDef(st.protocol).steps.length;
  if (relapse && st.step > 1) return { ...st, step: st.step - 1, lastStepDay: day };
  if (st.step < last) return { ...st, step: st.step + 1, lastStepDay: day };
  if (consultantConfirms && !consultantAvailable) return { ...st, lastStepDay: day };
  return { ...st, cleared: true, lastStepDay: day, mediaAvailable: true };
}

/** Practice participation allowed at the player's step (H5.4.1 rule 5). */
export function stepPractice(st: ProtocolState): Participation {
  if (st.cleared) return 'full';
  return protocolDef(st.protocol).steps[st.step - 1]!.practice;
}
