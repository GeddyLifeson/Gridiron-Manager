// The breakable acts this module owns, handed to the one pipeline (G-28 compliance, L8.2.5): warn once,
// allow, log, detect, punish. This module only builds the act and applies its real gain; it never
// blocks. Each act is offered to the user and to AI alike (K2.8.2) and never to or about an imported
// real person (X14, L9.1.2).
import type { PersonOrigin, WorldTier } from '@gm/schema';
import { toWorldDate } from '../calendar/date.ts';
import type { Act, PartyRef } from '../compliance/types.ts';
import { param } from './params.ts';
import { mayCarryPersonalEvent, type Day } from './types.ts';

/** The college acts and the compliance class each one files under (T9.5.1 classes in G-28 classes.json). */
export const COLLEGE_ACTS = {
  /** T5.3.2: improper academic help for a player at risk. */
  academic_help: 'eligibility_academic',
  /** T5.3.2: playing a player the academic office ruled out. */
  play_ineligible: 'eligibility_academic',
  /** T5.1.2 rule 5: pushing a healthy player into a medical retirement. */
  false_medical_retirement: 'eligibility_academic',
  /** T6.4.1: contact with another team's player who has not entered the database. */
  transfer_tampering: 'transfer_tampering',
  /** T7.4.1: a coach states or promises an outside-deal amount tied to signing or staying. */
  outside_amount_promise: 'pay_rules',
  /** T7.4.1: a staff member gives his own money to an NIL entity, or steers school money or staff to it. */
  staff_nil_donation: 'pay_rules',
  /** T7.2.1: a deal not reported, or paid through a channel that avoids review. */
  unreported_deal: 'pay_rules',
  /** T5.4.1: a coach attends or requires "voluntary" work. */
  forced_voluntary_work: 'countable_hours',
} as const;
export type CollegeActId = keyof typeof COLLEGE_ACTS;

/** T7.4.1 depth pass: acts inside the rules, which carry no warning and write no row. */
export const PERMITTED_NIL_ACTS = ['describe_opportunities', 'refer_to_personnel_office', 'introduce_to_collective', 'attend_collective_fundraiser', 'state_school_amount_with_final_say'] as const;
export type PermittedNilAct = (typeof PERMITTED_NIL_ACTS)[number];

export interface ActContext {
  readonly actor: PartyRef;
  readonly orderedBy?: PartyRef | null;
  readonly day: Day;
  /** Everyone who must take part or learns of it (L8.2.5 `knew`). */
  readonly knew: readonly number[];
  readonly competitionId?: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

export interface Subject { readonly personId: number; readonly origin: PersonOrigin }

/**
 * Whether the act is offered at all. It is never greyed for a generated subject; it does not exist for
 * an imported subject or actor (X14), and a head coach's school amount is permitted, not an act.
 */
export function actOffered(id: CollegeActId, ctx: Pick<ActContext, 'actor'>, subject: Subject | null): boolean {
  if (!mayCarryPersonalEvent(ctx.actor.origin)) return false;
  return subject === null || mayCarryPersonalEvent(subject.origin);
}

const GAIN: Record<CollegeActId, () => number> = {
  academic_help: () => param('academicShortcutGain'),
  play_ineligible: () => param('academicShortcutGain'),
  false_medical_retirement: () => param('academicShortcutGain'),
  transfer_tampering: () => param('tamperingGain'),
  outside_amount_promise: () => param('outsidePromiseGain'),
  staff_nil_donation: () => param('outsidePromiseGain'),
  unreported_deal: () => param('outsidePromiseGain'),
  forced_voluntary_work: () => param('academicShortcutGain'),
};

/**
 * Builds the act handed to `compliance.commitAct`. Returns null when the act is not offered (X14).
 * Playing an ineligible player leaves a participation record but is not certain to be noticed: the
 * weekly rival source applies at the class value (T5.3.2 rule 3), so `certainTrace` stays false.
 */
export function collegeAct(id: CollegeActId, ctx: ActContext, subject: Subject | null): Act | null {
  if (!actOffered(id, ctx, subject)) return null;
  const knew = [...new Set([...ctx.knew, ...(subject ? [subject.personId] : [])])];
  return {
    classId: COLLEGE_ACTS[id],
    actor: ctx.actor,
    orderedBy: ctx.orderedBy ?? null,
    knew,
    date: toWorldDate(ctx.day),
    competitionId: ctx.competitionId ?? null,
    gain: GAIN[id](),
    tier: ctx.tier,
    source: ctx.source,
  };
}
