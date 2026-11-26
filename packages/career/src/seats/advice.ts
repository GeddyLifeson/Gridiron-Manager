// S5.3.3 game-management advice. At a decision point a prompt opens with a short timer; advice reaches the head
// coach's channel only if confirmed before it ends. The AI head coach follows with a chance set by his trust in
// analytics and in the user. The log keeps advice and outcome apart, so luck and judgment show separately.
import { chance, clamp, type Draw } from '../gameday/math.ts';
import { sp } from './params.ts';

export type DecisionKind = 'fourth_down' | 'two_point' | 'timeout' | 'end_of_half' | 'challenge';

export interface DecisionMoment {
  readonly id: number;
  readonly kind: DecisionKind;
  readonly openedAtS: number;
  /** Play clock left when the prompt opens (fourth down, two-point). */
  readonly playClockLeftS?: number;
  /** Seconds until the next snap (challenge). */
  readonly untilNextSnapS?: number;
}

/** Seconds the advisor has (S5.3.3 depth pass). Timeout and end-of-half prompts open 20 s before the moment. */
export function promptTimerS(m: DecisionMoment): number {
  switch (m.kind) {
    case 'fourth_down':
    case 'two_point':
      return Math.max(sp('advice.minTimerS'), (m.playClockLeftS ?? 0) - sp('advice.playClockMinusS'));
    case 'timeout':
    case 'end_of_half':
      return sp('advice.clockLeadS');
    case 'challenge':
      return Math.max(0, (m.untilNextSnapS ?? 0) - sp('advice.challengeMinusS'));
  }
}

export interface Advice { readonly momentId: number; readonly choice: string; readonly reason: string; readonly confirmedAtS: number | null }

export interface AdviceOutcome {
  readonly delivered: boolean;
  readonly followed: boolean | null;
  /** The advice matched the model's preferred choice (N2/N3). */
  readonly matchedModel: boolean | null;
}

/** Whether the advice arrived (confirmed before the timer ended), and whether the AI head coach followed it. */
export function resolveAdvice(m: DecisionMoment, a: Advice | null, modelChoice: string, hc: { analyticsTrust: number; userTrust: number }, draw: Draw): AdviceOutcome {
  const deadline = m.openedAtS + promptTimerS(m);
  const delivered = a !== null && a.confirmedAtS !== null && a.confirmedAtS <= deadline;
  if (!delivered || !a) return { delivered: false, followed: null, matchedModel: null };
  return { delivered, followed: chance(followChance(hc.analyticsTrust, hc.userTrust), draw), matchedModel: a.choice === modelChoice };
}

export const followChance = (analyticsTrust: number, userTrust: number): number =>
  clamp(sp('advice.followBase') + sp('advice.followAnalytics') * clamp(analyticsTrust, 0, 1) + sp('advice.followUser') * clamp(userTrust, 0, 1), 0, 1);
