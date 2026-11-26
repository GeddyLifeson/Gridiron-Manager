// E3.4 control and authority clauses: roster say, staff authority and budget, and the smaller lines.
import type { Cents } from './money.ts';
import { cparam } from './params.ts';
import type { CoachContract, OtherClause, RosterAuthority, StaffTerms } from './types.ts';

export type RosterMove = 'cut_or_keep_53' | 'depth_chart' | 'trade' | 'draft_pick' | 'free_agent_signing';
export type Decider = 'coach' | 'general_manager' | 'owner';

/** E3.4.1: whose choice executes when coach and general manager disagree. Shared arrangements send the tie to the owner. */
export function rosterDecider(a: RosterAuthority, move: RosterMove): Decider {
  switch (a) {
    case 'coach_full': return 'coach';
    case 'gm_final': return move === 'depth_chart' ? 'coach' : 'general_manager';
    case 'coach_53_gm_draft_fa': return move === 'draft_pick' || move === 'free_agent_signing' ? 'general_manager' : 'coach';
    case 'shared_owner_ties': return move === 'depth_chart' ? 'coach' : 'owner';
  }
}

export type DisputeOutcome<T> =
  | { readonly executed: T; readonly by: Decider; readonly event: null }
  | { readonly executed: T; readonly by: Decider; readonly event: { readonly kind: 'relationship_event'; readonly with: 'general_manager' | 'owner'; readonly about: RosterMove } };

/** Resolve one disagreement. Without authority the coach's request is a logged relationship event and nothing is
 *  spent (no stored capital exists). The owner's tie-break choice is supplied by the caller (K8 owner model). */
export function resolveRosterDispute<T>(a: RosterAuthority, move: RosterMove, coachChoice: T, gmChoice: T, ownerChoice: T): DisputeOutcome<T> {
  const by = rosterDecider(a, move);
  if (by === 'coach') return { executed: coachChoice, by, event: null };
  const executed = by === 'owner' ? ownerChoice : gmChoice;
  return { executed, by, event: { kind: 'relationship_event', with: by === 'owner' ? 'owner' : 'general_manager', about: move } };
}

export interface HeadCoachRecord { readonly headCoachSeasons: number; readonly winShare: number }

/** E3.4.1 starting rule: full control needs a prior head coach record above the bar, or two competing offers. */
export function fullControlAvailable(rec: HeadCoachRecord, competingOffers: number): boolean {
  const proven = rec.headCoachSeasons >= cparam('fullControlMinSeasons') && rec.winShare >= cparam('fullControlWinShareBar');
  return proven || competingOffers >= cparam('fullControlCompetingOffers');
}

// ---- E3.4.2 staff ----

export interface StaffCheck { readonly ok: boolean; readonly reason: 'ok' | 'over_pool' | 'over_size_cap' }

/** The coach cannot sign assistants whose total salary exceeds the pool (E3.4.2 acceptance 1). */
export function canSignAssistant(staff: StaffTerms, currentSalariesCents: readonly Cents[], newSalaryCents: Cents): StaffCheck {
  const total = currentSalariesCents.reduce((x, y) => x + y, 0) + newSalaryCents;
  if (total > staff.poolCents) return { ok: false, reason: 'over_pool' };
  if (staff.sizeCap > 0 && currentSalariesCents.length + 1 > staff.sizeCap) return { ok: false, reason: 'over_size_cap' };
  return { ok: true, reason: 'ok' };
}

export type ReleaseCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'owner_required_keep' | 'no_replace_authority' };

/** Releasing an inherited assistant: an owner-required keep needs an L5 conversation first; without the right to
 *  replace all, only assistants hired by this coach may go. The owner pays the released contract (owedOnEnd). */
export function canReleaseAssistant(staff: StaffTerms, personId: number, hiredByThisCoach: boolean): ReleaseCheck {
  if (staff.requiredKeepIds.includes(personId)) return { ok: false, reason: 'owner_required_keep' };
  if (!staff.mayReplaceAll && !hiredByThisCoach) return { ok: false, reason: 'no_replace_authority' };
  return { ok: true };
}

// ---- E3.4.3 other clauses ----

/** Each clause maps to at least one consuming rule elsewhere (E3.4.3 acceptance). */
export const CLAUSE_CONSUMERS: Readonly<Record<OtherClause, readonly string[]>> = {
  reports_to_owner: ['L5.1', 'L5.2'],
  play_calling_freedom: ['L5.2', 'L4.1.2'],
  outside_income_rights: ['E6.5'],
  media_obligations: ['L6', 'H7'],
  no_depth_chart_interference: ['L5.2', 'M2'],
  facilities_promise: ['L5.3', 'E3.5.1'],
};

export interface OwnerPromise { readonly clause: OtherClause; readonly dueMonth: number; readonly delivered: boolean }

export type BreachEvent = { readonly kind: 'owner_breach'; readonly clause: OtherClause; readonly month: number; readonly grievance: true };

/** A promise not delivered by its date is a breach: a grievance usable in later talks and lower trust in the owner.
 *  An interfering owner trait is not stopped; its act becomes a breach (E3.4.3 rules). */
export function promiseBreaches(c: CoachContract, promises: readonly OwnerPromise[], month: number): BreachEvent[] {
  return promises.filter((p) => c.otherClauses.includes(p.clause) && !p.delivered && month > p.dueMonth)
    .map((p) => ({ kind: 'owner_breach', clause: p.clause, month, grievance: true }));
}

export function interferenceIsBreach(c: CoachContract, act: 'changed_play_caller' | 'set_depth_chart' | 'bypassed_reporting_line'): boolean {
  const clause: OtherClause = act === 'changed_play_caller' ? 'play_calling_freedom' : act === 'set_depth_chart' ? 'no_depth_chart_interference' : 'reports_to_owner';
  return c.otherClauses.includes(clause);
}
