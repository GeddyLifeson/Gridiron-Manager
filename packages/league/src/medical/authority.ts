// Who decides what (D11.3.1, H5.1.1, H5.6.1). Doctors clear; the coach decides use. No control sets a
// clearance while `medical.independent_authority` holds. Using a player past his clearance is never
// greyed out: it is a breakable act, warned, logged and detected through the G-28 pipeline (L8.2.5),
// with the physician's written objection (L8.2.2) as its trace, the same for the user and AI.
import { possible, type RandomStream, type WorldDate, type WorldTier } from '@gm/schema';
import { groupOf, warningFor, type Act, type PartyRef, type Warning } from '../compliance/index.ts';
import type { RuleSet } from '@gm/schema';
import data from './data/medical.json' with { type: 'json' };
import { stepPractice } from './concussion.ts';
import type { MedicalRules } from './keys.ts';
import { P } from './params.ts';
import type { Limits, MedicalCase, MedicalStaff, MedicalState, Participation } from './types.ts';

export interface Decision { readonly id: string; readonly owner: string; readonly userMay: string; readonly leaf: string; readonly basis: string }
export const DECISIONS: readonly Decision[] = data.decisions;

export function decisionOwner(id: string): Decision {
  const d = DECISIONS.find((x) => x.id === id);
  if (!d) throw new Error(`league.medical: no decision ${id}`);
  return d;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The share of recovery the physician believes done: progress over true time seen through his imaging error. */
export function believedShare(c: MedicalCase): number {
  const t = c.truth;
  const believedTotal = t.totalDays * t.imagingFactor;
  return believedTotal > 0 ? t.progressDays / believedTotal : 1;
}

const PRACTICE_ORDER: readonly Participation[] = ['dnp', 'limited', 'full'];
export const practiceAtMost = (a: Participation, b: Participation): boolean => PRACTICE_ORDER.indexOf(a) <= PRACTICE_ORDER.indexOf(b);

/**
 * The physician's state and limits for today (D11.3.1). A cautious physician needs more believed recovery.
 * Pressure on the doctors lowers the "with limits" bar a little, never for a concussion or a structural
 * injury (D11.3.3). A concussion follows the protocol only: not cleared until it clears (D11.4).
 * A hidden injury is unknown to the staff, so the player reads as cleared.
 */
export function physicianState(c: MedicalCase, staff: MedicalStaff): { state: MedicalState; limits: Limits | null } {
  if (!c.shown.known) return { state: 'cleared', limits: null };
  if (c.protocol) {
    return c.protocol.cleared ? { state: 'cleared', limits: null } : { state: 'not_cleared', limits: { snapCap: 0, noContactPractice: true, maxPractice: stepPractice(c.protocol) } };
  }
  const shift = clamp01(staff.caution) * P('cautionShift');
  const pressed = c.doctorsPressed && !c.structural ? P('pressureLimitsAdvance') : 0;
  const b = believedShare(c);
  if (b >= P('clearAt') + shift) return { state: 'cleared', limits: null };
  if (b >= P('clearWithLimitsAt') + shift - pressed) {
    return { state: 'cleared_with_limits', limits: { snapCap: P('snapCapShare'), noContactPractice: true, maxPractice: 'limited' } };
  }
  return { state: 'not_cleared', limits: null };
}

/** Practice the medical staff recommends (H3 participation sheet, H5.2.1 rule 4). */
export function recommendedPractice(c: MedicalCase): Participation {
  if (c.shown.state === 'cleared') return 'full';
  if (c.shown.limits) return c.shown.limits.maxPractice;
  return 'dnp';
}

/**
 * The only way a coach could set a clearance: a rule set where the physician does not hold independent
 * authority (D11.3.1 key `medical_authority`). Under the default rule sets this always refuses.
 */
export function coachSetsClearance(c: MedicalCase, state: MedicalState, mr: MedicalRules): { ok: true; case: MedicalCase } | { ok: false; reason: string } {
  if (mr.independentAuthority) return { ok: false, reason: 'clearance belongs to the team physician (D11.3.1)' };
  if (c.protocol && !c.protocol.cleared) return { ok: false, reason: 'the concussion protocol overrides everything (D11.3.1)' };
  return { ok: true, case: { ...c, shown: { ...c.shown, state, limits: null } } };
}

/** What the coach plans for a player on a day: dress him, his snap share, his practice. */
export interface PlannedUse {
  readonly dress: boolean;
  readonly snapShare: number;
  readonly practice: Participation;
  readonly contact: boolean;
}

export type UseBreach = 'concussion_protocol' | 'not_cleared' | 'past_limits';

/** Is the plan past the clearance? Null when it is inside it. */
export function useBreach(c: MedicalCase, use: PlannedUse): UseBreach | null {
  const playing = use.dress || use.practice !== 'dnp';
  if (!c.shown.known || c.shown.state === 'cleared') return null;
  if (c.protocol && !c.protocol.cleared) {
    if (use.dress || !practiceAtMost(use.practice, stepPractice(c.protocol))) return 'concussion_protocol';
    return use.contact && use.practice !== 'dnp' ? 'concussion_protocol' : null;
  }
  if (c.shown.state === 'not_cleared') return playing ? 'not_cleared' : null;
  const l = c.shown.limits;
  if (!l) return null;
  const overSnaps = use.dress && l.snapCap !== null && use.snapShare > l.snapCap;
  const overPractice = !practiceAtMost(use.practice, l.maxPractice) || (l.noContactPractice && use.contact && use.practice !== 'dnp');
  return overSnaps || overPractice ? 'past_limits' : null;
}

/** Compliance class for each breach (G-28 classes.json). */
export function breachClass(b: UseBreach): string {
  return b === 'concussion_protocol' ? 'concussion_protocol' : 'medical_clearance';
}

export interface UseContext {
  readonly actor: PartyRef;
  readonly orderedBy: PartyRef | null;
  readonly staff: MedicalStaff;
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
  readonly rules: RuleSet;
  /** The real gain on G-28's 0 to 1 desirability scale (the player's value to this game). */
  readonly gain: number;
  /** The player's trust in the coach and toughness, 0 to 1 (D12, D5). */
  readonly trust: number;
  readonly toughness: number;
}

export interface BreakableUse {
  readonly breach: UseBreach;
  readonly warning: Warning;
  /** Hand to compliance.commitAct when the actor chooses "do it anyway". */
  readonly act: Act;
  /** The physician wrote an objection (L8.2.2): always for the protocol, likely when not cleared. */
  readonly objection: boolean;
  /** The player refused; the attempt ends and he does not play (D11.3.1, H5.3.1 rule 4). */
  readonly refused: boolean;
}

/** Chance the player refuses to be used past his clearance: higher with low toughness and low trust. */
export function refusalChance(toughness: number, trust: number): number {
  return possible(P('refusalBase') + (1 - clamp01(toughness)) * P('refusalCautionWeight') + (1 - clamp01(trust)) * P('refusalDistrustWeight'));
}

/**
 * The breakable act of using a player past his clearance (D11.3.1, D11.4.1 rule 8, H5.1.1 rule 2). Never
 * refused by the game. The medical people are on the `knew` list with a duty to report.
 */
export function useAgainstClearance(c: MedicalCase, breach: UseBreach, ctx: UseContext, s: RandomStream): BreakableUse {
  const classId = breachClass(breach);
  const objectionDraw = s.chance(possible(breach === 'past_limits' ? P('objectionWithLimits') : P('objectionNotCleared')));
  const objection = breach === 'concussion_protocol' || objectionDraw;
  const refused = s.chance(possible(refusalChance(ctx.toughness, ctx.trust)));
  const knew = [ctx.staff.physicianId, ctx.staff.trainerId, ...(breach === 'concussion_protocol' ? ctx.staff.consultantIds : []), c.personId];
  const act: Act = {
    classId, actor: ctx.actor, orderedBy: ctx.orderedBy, knew, date: ctx.date, competitionId: ctx.competitionId,
    gain: clamp01(ctx.gain), certainTrace: objection, tier: ctx.tier, source: ctx.source,
  };
  return { breach, warning: warningFor(classId, groupOf(ctx.actor.role), ctx.rules), act, objection, refused };
}
