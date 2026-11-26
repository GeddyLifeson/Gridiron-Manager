// K4.8.1 deliberate fouls and gamesmanship.
// Rule 1, tactical fouls inside the playing rules (a delay to give the punter room), is a football
// decision with no rule-respect term: it is a candidate in K5's option search and is chosen on
// estimated win probability after enforcement.
// Rule 2, conduct acts past the playing rules (an ordered feigned injury), is decided only through
// the K2.8.2 violation decision, which arrives as a port: detection and penalty run in L8.2.5 in the
// same code as the user's. Imported real people never order one (X14).
import type { CoachProfile } from '../profile/types.ts';

export interface TacticalFoulOption {
  readonly actId: string;
  /** His estimate of win probability if he takes the foul, after its on-field enforcement. */
  readonly winProbabilityWith: number;
  /** His estimate with the best alternative. */
  readonly winProbabilityWithout: number;
}

/** K4.8.1 rule 1: the tactical fouls that beat the alternative in his own estimate, best first. K5 picks among them. */
export function tacticalFoulCandidates(options: readonly TacticalFoulOption[]): TacticalFoulOption[] {
  return options.filter((o) => o.winProbabilityWith > o.winProbabilityWithout)
    .sort((a, b) => (b.winProbabilityWith - b.winProbabilityWithout) - (a.winProbabilityWith - a.winProbabilityWithout) || (a.actId < b.actId ? -1 : 1));
}

export interface ConductAct {
  /** Row id in the L8.2.5 class table, for example a feigned injury against a no-huddle offense. */
  readonly actId: string;
  /** His estimate of the gain in win probability. */
  readonly estimatedGain: number;
}

/** The K2.8.2 violation decision (rule respect, pressure, gain). It emits `violation_committed` itself when it returns true. */
export type ViolationDecision = (coachPersonId: string, act: ConductAct) => boolean;

/**
 * K4.8.1 rule 2. Returns the act to tag on the call (read by J5 and J10), or null. No act happens
 * unless the K2.8.2 decision said yes, so none happens without its `violation_committed` event.
 */
export function considerConductAct(coach: Pick<CoachProfile, 'personId' | 'imported'>, acts: readonly ConductAct[], decide: ViolationDecision): ConductAct | null {
  if (coach.imported) return null;
  const ranked = [...acts].sort((a, b) => b.estimatedGain - a.estimatedGain || (a.actId < b.actId ? -1 : 1));
  for (const act of ranked) if (decide(coach.personId, act)) return act;
  return null;
}
