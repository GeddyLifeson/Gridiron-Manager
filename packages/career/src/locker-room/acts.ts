// Hand-off of the coach's or club's own rule-breaking to the single L8.2.5 pipeline (G-28,
// `@gm/league` compliance.commitAct). L3 never blocks: it warns, lets the act happen, and writes exactly one
// log row through the pipeline. Same code for the user and for AI coaches (K2.8.2 rule 6).
//
// The labour-agreement acts here have the player's grievance as their detection step (L3.2.2, L3.2.5): the
// player always knows. The classes below are NOT yet rows of league/src/compliance/classes.json; they are
// requested from the compliance owner (CR-G45-1 in the PR body). Until they land, commitAct answers
// `unknown_class` and L3 still keeps its own decision record, so nothing is lost.
import type { compliance } from '@gm/league';
import type { PersonOrigin, WorldDate, WorldTier } from '@gm/schema';

/** Proposed compliance class ids (CR-G45-1). */
export const DISCIPLINE_CLASSES = {
  /** A club fine above the step maximum, the schedule maximum, the daily cap, or for an offence outside the CBA list (L3.1.1, L3.2.2). */
  fineOverLimit: 'club_fine_over_limit',
  /** Conduct-detrimental discipline without the predicate or a qualifying single act, past four weeks or one week's salary, or a conduct deactivation outside those limits (L3.2.3, L3.2.4). */
  conductOverLimit: 'club_conduct_discipline_over_limit',
  /** Waiving or reimbursing a mandatory (`waivable` false) camp fine (L3.1.2). Already a class: `camp_fine_waiver`. */
  campFineWaiver: 'camp_fine_waiver',
  /** A school mandatory-minimum offence closed with less than the minimum, or not reported to the school (L3.5.1, T9.5). */
  mandatoryMinimumUndercut: 'school_mandatory_minimum_undercut',
} as const;
export type DisciplineClass = (typeof DISCIPLINE_CLASSES)[keyof typeof DISCIPLINE_CLASSES];

export interface CoachRef {
  readonly personId: number;
  readonly teamId: number;
  readonly origin: PersonOrigin;
  readonly role: compliance.ActorRole;
}

export interface ActContext {
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

/** Build the L8.2.5 act for one over-limit discipline decision. `knew` always holds the disciplined player. */
export function disciplineAct(classId: DisciplineClass, actor: CoachRef, playerId: number, gain: number, ctx: ActContext, orderedBy: CoachRef | null = null): compliance.Act {
  return {
    classId,
    actor: { personId: actor.personId, role: actor.role, teamId: actor.teamId, origin: actor.origin },
    orderedBy: orderedBy ? { personId: orderedBy.personId, role: orderedBy.role, teamId: orderedBy.teamId, origin: orderedBy.origin } : null,
    knew: [playerId],
    date: ctx.date,
    competitionId: ctx.competitionId,
    gain: Math.max(0, Math.min(1, gain)),
    certainTrace: true,
    tier: ctx.tier,
    source: ctx.source,
  };
}

/** What L3 needs back from the pipeline. A caller wires `compliance.commitAct` with its state, rule set and sink. */
export type ActSink = (act: compliance.Act) => { readonly ok: boolean };
