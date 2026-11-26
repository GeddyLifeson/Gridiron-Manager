// L8.4.2 compliance cases as the coach meets them, and L8.5.1 the lower-rung side of an inquiry.
// The pipeline itself (log, detection, head coach responsibility, penalties, show-cause orders) is
// G-28's (`@gm/league` compliance). This file owns only what L8.4.2 and L8.5.1 add on top: the
// self-report window, the coach's response choices and what they cost, the restriction that follows a
// coach to his next job, and interview answers by assistants.
import type { WorldDate } from '@gm/schema';
import { compliance } from '@gm/league';
import type { Order } from '../crisis/orders.ts';
import type { StreamFor } from '../crisis/events.ts';
import { param } from './params.ts';

// ---- severity at detection ----

/**
 * A minor violation self-reported within the window stays minor. One found by others later has the
 * starting chance of being treated as major (failure to report). A major one stays major.
 */
export function severityAtDetection(row: Pick<compliance.ViolationLogRow, 'id' | 'severity' | 'date'>, reportedOn: WorldDate, selfReported: boolean, stream: StreamFor): compliance.Severity {
  if (row.severity === 'major') return 'major';
  if (selfReported && compliance.daysBetween(row.date, reportedOn) <= param('case.selfReportWindowDays')) return 'minor';
  return stream(['community', 'case_severity', row.id]).chance(param('case.foundLaterMajorChance')) ? 'major' : 'minor';
}

// ---- responses in a major case ----

export type CoachResponse = 'cooperate' | 'minimise' | 'blame_assistant';

/** The response G-28's penalty step reads. Minimising and blaming are not cooperation (no tier reduction). */
export function pipelineResponse(r: CoachResponse): compliance.CaseResponse { return r === 'cooperate' ? 'cooperate' : 'fight'; }

export interface ResponseInput {
  readonly caseId: number;
  readonly teamId: number;
  readonly coachId: number;
  /** For blame: the assistant named. */
  readonly blamedId: number | null;
  /** Truth record: was the named assistant in fact responsible. */
  readonly blameTrue: boolean;
  /** The logs show the coach knew or ordered it (G-28 `orderedBy` or `knew`). */
  readonly logsShowCoach: boolean;
}

export interface ResponseResult {
  /** An added failure-to-cooperate finding (G-28 class `failure_to_cooperate`) for the caller to commit. */
  readonly addedPenalty: boolean;
  readonly orders: Order[];
}

/**
 * What a response costs beyond the finding. Cooperate: nothing more. Minimise: a starting chance of an
 * added penalty. Blame an assistant when untrue and the logs show it: the added penalty, plus "lied to
 * and found out" across the staff and a memory with the man he named.
 */
export function responseConsequences(r: CoachResponse, input: ResponseInput, stream: StreamFor): ResponseResult {
  if (r === 'cooperate') return { addedPenalty: false, orders: [] };
  if (r === 'minimise') return { addedPenalty: stream(['community', 'minimise', input.caseId]).chance(param('case.minimiseAddedPenaltyChance')), orders: [] };
  if (input.blamedId === null) throw new Error('community: blame needs a named assistant');
  const orders: Order[] = [{ kind: 'memory', holderId: input.blamedId, aboutId: input.coachId, memoryClass: input.blameTrue ? 'named_in_case' : 'blamed_falsely', amount: null, halfLifeWeeks: null, sourceEventId: null }];
  const caught = !input.blameTrue && input.logsShowCoach;
  if (caught) orders.push({ kind: 'group_memory', group: 'staff', teamId: input.teamId, aboutId: input.coachId, memoryClass: 'lied_to_found_out', amount: null, sourceEventId: null });
  return { addedPenalty: caught, orders };
}

// ---- the restriction that follows a coach ----

export interface CoachRestriction {
  readonly personId: number;
  readonly kind: 'show_cause';
  readonly caseId: number;
  readonly from: WorldDate;
  readonly years: number;
}

/** Every show-cause order G-28 issued, as person restrictions dated from the case's resolution. */
export function restrictionsFrom(comp: compliance.ComplianceState): CoachRestriction[] {
  const out: CoachRestriction[] = [];
  for (const o of comp.orders) {
    if (o.order.kind !== 'show_cause') continue;
    const c = comp.cases.find((x) => x.id === o.caseId);
    if (!c) continue;
    out.push({ personId: o.order.personId, kind: 'show_cause', caseId: o.caseId, from: c.resolveBy, years: o.order.years });
  }
  return out;
}

/** Restrictions in force for a person on a date. Read by E2 wherever he applies (it persists across jobs). */
export function activeRestrictions(list: readonly CoachRestriction[], personId: number, date: WorldDate): CoachRestriction[] {
  return list.filter((r) => r.personId === personId && compliance.onOrBefore(r.from, date) && compliance.yearsBetween(r.from, date) < r.years);
}

// ---- L8.5.1 interviews in an inquiry ----

export type InterviewAnswer = 'truth' | 'dont_know' | 'cover';

export interface InterviewInput {
  readonly userId: number;
  readonly bossId: number;
  /** The truth harms the boss. */
  readonly harmsBoss: boolean;
  /** The boss learns what he said. */
  readonly bossLearns: boolean;
  /** The logs contradict the answer (he did know, or covered). */
  readonly logsContradict: boolean;
}

export interface InterviewOutcome {
  readonly party: boolean;
  readonly protectedFromParty: boolean;
  readonly orders: Order[];
  /** Dated fact kept at every later rung; some employers value it, some distrust it (K8 profiles). */
  readonly historyFact: string;
}

/**
 * A lower-rung user can become a party only through his own logged act or a contradicted answer
 * (L8.5.1 acceptance). Telling the truth protects him; when it harms the boss and he learns of it, the
 * standing cost is written.
 */
export function interviewOutcome(answer: InterviewAnswer, input: InterviewInput): InterviewOutcome {
  if (answer === 'truth') {
    const orders: Order[] = input.harmsBoss && input.bossLearns ? [{ kind: 'standing_with_boss', personId: input.userId, bossId: input.bossId, delta: param('interview.truthHarmsBossStanding') }] : [];
    return { party: false, protectedFromParty: true, orders, historyFact: 'told_truth_in_case' };
  }
  return { party: input.logsContradict, protectedFromParty: false, orders: [], historyFact: answer === 'cover' ? 'covered_in_case' : 'said_did_not_know' };
}

/** L8.5.1 edge case: a user promoted to interim head coach mid-case answers only for acts after his promotion. */
export function rowsAnswerableAsInterim(rows: readonly compliance.ViolationLogRow[], promotedOn: WorldDate): compliance.ViolationLogRow[] {
  return rows.filter((r) => compliance.daysBetween(promotedOn, r.date) >= 0);
}
