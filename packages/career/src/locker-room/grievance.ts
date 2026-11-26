// Grievance and appeal (L3.2.5), labour agreement model only. Filing rates, stays and outcomes have no
// source (Assumption); clocks are rule keys from Art. 43. Remedies come only from the closed list.
import type { DisciplineRules } from './keys.ts';
import { clamp, lp, type Draw } from './params.ts';

export interface FilingInput {
  /** Penalty heavier than others received for the same offence (L3.3.1 case history). */
  readonly aboveOthers: boolean;
  /** Offence not on the published list. */
  readonly offList: boolean;
  /** The amount or length went past a CBA limit (the player always knows, L3.2.2). */
  readonly overLimit: boolean;
  /** Trust in the coach, 0 to 100. */
  readonly trust: number;
  readonly singleActConduct: boolean;
  readonly abilityFlag: boolean;
}

/**
 * Filing probability (L3.2.5): 0.05 + 0.3 above others + 0.3 off the list + 0.1 * (50 - trust)/50,
 * + 0.15 single-act conduct, + 0.2 for an ability deactivation that may be read as discipline. Clamped 0 to 1.
 */
export function filingProbability(i: FilingInput): number {
  const mid = lp('trust.mid');
  let p = lp('grievance.base')
    + (i.aboveOthers ? lp('grievance.aboveOthers') : 0)
    + (i.offList ? lp('grievance.offList') : 0)
    + (i.overLimit ? lp('grievance.overLimit') : 0)
    + lp('grievance.trustSlope') * (mid - clamp(i.trust, 0, lp('scale.max'))) / mid
    + (i.singleActConduct ? lp('grievance.singleAct') : 0)
    + (i.abilityFlag ? lp('grievance.abilityFlag') : 0);
  return clamp(p, 0, 1);
}

/** The closed remedy list (Art. 43). */
export const REMEDIES = [
  'money_award', 'reinstatement', 'suspension_without_pay', 'stay_pending_decision', 'cease_order',
  'benefit_credit', 'compliance_order', 'advisory_opinion',
] as const;
export type Remedy = (typeof REMEDIES)[number];

export type Filer = 'player' | 'club' | 'management_council' | 'union';

export interface Grievance {
  readonly id: number;
  readonly filer: Filer;
  readonly playerId: number;
  readonly occurrenceDay: number;
  readonly filedDay: number;
  readonly suspension: boolean;
  /** Expedited hearing day for a club suspension, or null. */
  readonly hearingDay: number | null;
  /** Decision due by this day. */
  readonly decisionDueDay: number;
  readonly answerDueDay: number;
  /** A suspension appealed at once may be stayed for the coming game. */
  readonly stayed: boolean;
  readonly status: 'open' | 'decided';
  readonly outcome: 'upheld' | 'reduced' | 'overturned' | null;
  readonly remedies: readonly Remedy[];
}

/** Whether a grievance is still in time: within 50 days of the occurrence or of when the facts were known (L3.2.5). */
export function inTime(occurrenceOrKnownDay: number, filedDay: number, d: DisciplineRules): boolean {
  if (d.grievance === null) return false;
  return filedDay - occurrenceOrKnownDay <= d.grievance.fileWithinDays;
}

/**
 * File a grievance. A club suspension gets a hearing within 7 days and a decision within 5 days of it;
 * ordinary cases decide within 30 days of briefs (modelled from the filing day) and close within 60 days.
 * The stay draw happens only for an immediately appealed suspension.
 */
export function fileGrievance(id: number, filer: Filer, playerId: number, occurrenceDay: number, filedDay: number, suspension: boolean, d: DisciplineRules, draw: Draw): Grievance {
  const g = d.grievance;
  if (g === null) throw new Error('career.locker_room: no grievance process under this discipline model (L3.5.1)');
  if (!inTime(occurrenceDay, filedDay, d)) throw new Error('career.locker_room: grievance filed after the time limit (L3.2.5)');
  const hearingDay = suspension ? filedDay + g.suspensionHearingDays : null;
  const decisionDueDay = hearingDay !== null ? hearingDay + g.expeditedDecisionDays : filedDay + Math.min(g.ordinaryDecisionDays, g.recordCloseDays);
  const stayed = suspension && draw() < lp('grievance.stay');
  return { id, filer, playerId, occurrenceDay, filedDay, suspension, hearingDay, decisionDueDay, answerDueDay: filedDay + g.answerDays, stayed, status: 'open', outcome: null, remedies: stayed ? ['stay_pending_decision'] : [] };
}

export interface RulingInput {
  /** The uniformity test failed (heavier than others for the same offence). */
  readonly uniformityFails: boolean;
  /** The publication test failed (not on the published list) or a CBA limit was passed. */
  readonly publicationFails: boolean;
  /** Part of the penalty is above the CBA maximum (arbitrator applies the maximum, Assumption). */
  readonly overLimit: boolean;
}

/** Decide a grievance (Assumption: the outcome favours the player when a test fails). One draw. */
export function rule(g: Grievance, r: RulingInput, decidedDay: number, draw: Draw): Grievance {
  if (decidedDay > g.decisionDueDay) throw new Error('career.locker_room: ruling after the decision clock (L3.2.5)');
  const fails = r.uniformityFails || r.publicationFails;
  const win = draw() < (fails ? lp('grievance.winIfTestFails') : lp('grievance.winIfTestsPass'));
  let outcome: Grievance['outcome'] = 'upheld';
  let remedies: Remedy[] = [];
  if (win) {
    outcome = r.overLimit && !r.publicationFails ? 'reduced' : 'overturned';
    remedies = g.suspension ? ['money_award', 'reinstatement'] : ['money_award'];
  } else if (g.suspension) {
    remedies = ['suspension_without_pay'];
  }
  return { ...g, status: 'decided', outcome, remedies };
}

/** A stayed player may play that week; an upheld suspension is served after the decision (L3.2.5). */
export function eligibleWhilePending(g: Grievance): boolean {
  return g.status === 'open' && g.stayed;
}
