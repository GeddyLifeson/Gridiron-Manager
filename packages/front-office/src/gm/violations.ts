// K7.7.1 front office and recruiting-staff violations. Each K7 procedure that meets a chance to break a
// rule raises it here. The decision is the one K2.8.2 procedure (`compliance.decideViolation`), with the
// estimated gain from K7.2.2; a committed act enters `compliance.commitAct`, the L8.2.5 pipeline every act
// by the user enters too (K9.5.1). Detection and penalties are that pipeline's; nothing here draws either.
// The owning procedure applies the illegal effect itself when `commit` is true (the early contact counts,
// the extra money counts).
import type { RuleSet, WorldDate, WorldTier } from '@gm/schema';
import { compliance } from '@gm/league';
import { P } from './params.ts';
import { marketReadSd } from './trade.ts';
import { clamp, type PersistentDraw } from './types.ts';

/** The opportunities K7.7.1 lists, each with the L8.2.5 class it belongs to and the K7 procedure that raises it. */
export const OPPORTUNITIES = {
  early_contact_player: { classId: 'tampering_players', raisedBy: 'K7.4.2 (market.checkContact)' },
  early_contact_coach: { classId: 'tampering_coaches', raisedBy: 'K7.6.1, K8 searches' },
  transfer_contact: { classId: 'transfer_tampering', raisedBy: 'K7.5.2 (college.contactIsTampering)' },
  recruiting_contact: { classId: 'recruiting_contact', raisedBy: 'K7.5.1 (recruiting.breachesOf)' },
  pay_above_cap: { classId: 'cap_circumvention', raisedBy: 'K7.4.1' },
  undisclosed_term: { classId: 'cap_circumvention', raisedBy: 'K7.4.1' },
  hidden_injury: { classId: 'injury_report_shading', raisedBy: 'K7.3.1 rule 2' },
  camp_fine: { classId: 'camp_fine_waiver', raisedBy: 'K7.4.1 rule 6 (campFine)' },
  pay_above_budget: { classId: 'pay_rules', raisedBy: 'K7.5.2 (college.validateSheet)' },
  outside_deal: { classId: 'pay_rules', raisedBy: 'K7.5.2 (college.mustReport)' },
  academic: { classId: 'eligibility_academic', raisedBy: 'T5.3.2' },
  medical_retirement: { classId: 'roster_limit', raisedBy: 'K7.5.2 (trimToLimit, T5.1.2)' },
} as const;

export type OpportunityKind = keyof typeof OPPORTUNITIES;
export const OPPORTUNITY_KINDS = Object.keys(OPPORTUNITIES).sort() as OpportunityKind[];

/** K7.2.2 gain in wins on the K2.8.2 desirability scale (0 to 1). */
export function gainFromWins(wins: number): number {
  return clamp(wins / P('violation.winsForFullGain'), 0, 1);
}

/** What the person believes about being caught. Both come from the public record (C10 sanctions news), never from the hidden detection table. */
export interface CaughtBelief {
  /** Share of known acts of this kind that were punished, as the public record suggests, 0 to 1. */
  readonly publicDetectRate: number;
  /** The published penalty on the desirability scale, 0 to 1 (what he would lose against what he gains). */
  readonly penalty: number;
}

/**
 * The K2.8.2 opportunity for one chance to break a rule. His read of the detection chance carries his own
 * persistent `marketRead` error (the same number every time for the same class, so asking again changes nothing).
 */
export function opportunity(kind: OpportunityKind, gainWins: number, belief: CaughtBelief, person: { readonly personId: number; readonly marketRead: number }, draw: PersistentDraw): compliance.Opportunity {
  const classId = OPPORTUNITIES[kind].classId;
  const key = OPPORTUNITY_KINDS.indexOf(kind) + 1;
  const pDetectPerceived = clamp(belief.publicDetectRate * (1 + draw('market', person.personId, -key) * marketReadSd(person.marketRead)), 0, 1);
  return { classId, gain: gainFromWins(gainWins), pDetectPerceived, penaltyPerceived: Math.max(0, belief.penalty) };
}

export interface Raise {
  readonly kind: OpportunityKind;
  /** The gain as the person estimates it, in wins (K7.2.2). */
  readonly gainWins: number;
  readonly belief: CaughtBelief;
  readonly actor: compliance.PartyRef;
  /** Hidden K7.1.1 `marketRead` of the actor (0 for a person with no such record). */
  readonly marketRead: number;
  readonly disposition: compliance.Disposition;
  readonly orderedBy: compliance.PartyRef | null;
  /** Everyone who knows (L6.3.1 holder list): they are the people who can talk. */
  readonly knew: readonly number[];
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run';
  /** A written record of the act exists (a contract term on paper, a medical report). */
  readonly certainTrace?: boolean;
}

/** The act as the pipeline takes it. The user's own act is built by the same function with `source: 'user'`. */
export function actFor(r: Omit<Raise, 'disposition' | 'belief' | 'marketRead' | 'source'> & { readonly source: compliance.Act['source'] }): compliance.Act {
  return {
    classId: OPPORTUNITIES[r.kind].classId, actor: r.actor, orderedBy: r.orderedBy, knew: [...r.knew], date: r.date, competitionId: r.competitionId,
    gain: gainFromWins(r.gainWins), tier: r.tier, source: r.source, ...(r.certainTrace ? { certainTrace: true } : {}),
  };
}

export interface RaiseResult {
  /** True: the owning procedure applies the illegal effect. */
  readonly commit: boolean;
  readonly state: compliance.ComplianceState;
  readonly reason: compliance.DecisionReason | 'class_not_in_rule_set' | 'unknown_class';
  readonly row: compliance.ViolationLogRow | null;
}

/**
 * K7.7.1: one opportunity, start to finish. K2.8.2 decides; a yes is logged through the pipeline. A class
 * the rule set does not have is not a violation there, so nothing is decided or logged and the act is not
 * taken as a violation (`commit` false; the caller does the act as a legal one if its own check allows it).
 */
export function raise(state: compliance.ComplianceState, r: Raise, rules: RuleSet, draw: PersistentDraw, conduct: compliance.StreamFor, sink: compliance.EventSink): RaiseResult {
  const classId = OPPORTUNITIES[r.kind].classId;
  if (!compliance.classApplies(rules, classId)) return { commit: false, state, reason: 'class_not_in_rule_set', row: null };
  const opp = opportunity(r.kind, r.gainWins, r.belief, { personId: r.actor.personId, marketRead: r.marketRead }, draw);
  const decision = compliance.decideViolation(state, opp, r.disposition, r.date, conduct);
  if (!decision.commit) return { commit: false, state, reason: decision.reason, row: null };
  const done = compliance.commitAct(state, actFor(r), rules, sink);
  if (!done.ok) return { commit: false, state, reason: done.reason, row: null };
  return { commit: true, state: done.state, reason: 'commit', row: done.row };
}
