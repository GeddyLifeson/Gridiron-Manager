// Steps 1 to 3 of L8.2.5: warn, allow, log. One entry for the user and every AI person: the user's
// acts skip only the K2.8.2 decision (he chooses), then enter here exactly as an AI act does.
// Nothing is blocked for a person whose job could take the act (L8.2.5 acceptance). The only refusal
// is the real-person guard: an imported AI person never breaks a rule (L8.2.5, K2.8.1 rule 2, X14).
import type { RuleSet } from '@gm/schema';
import { violationClass, type EnforcingBody, type ViolationClass } from './catalogue.ts';
import { K, PENALTY_FIELDS, type FineGroup } from './params.ts';
import { EVENT, draft, mayCarry } from './events.ts';
import type { Act, ComplianceState, EventSink, ViolationLogRow } from './types.ts';
import { groupOf } from './roles.ts';
import { appendRow, archivedRows, retireIfGrown } from './log.ts';

/** Does the class exist under this rule set (`compliance.<id>.applies`, absent means yes). Never a level word. */
export function classApplies(rules: RuleSet, classId: string): boolean {
  const key = K.classField(classId, 'applies');
  return rules.keys().includes(key) ? rules.bool(key) : true;
}

export interface Warning {
  readonly classId: string;
  /** Text key of the rule in plain words (template engine, P4.6.1). */
  readonly ruleText: string;
  readonly body: EnforcingBody;
  /** Known amounts for this role and the club; null where the rule set publishes none ("league default"). */
  readonly personFineFirstCents: number | null;
  readonly clubFineFirstCents: number | null;
  readonly pickRoundFirst: number | null;
  readonly penaltyText: 'known' | 'league_default';
  /** Always both. Nothing is greyed out (L8.2.5). */
  readonly choices: readonly ['go_back', 'do_it_anyway'];
}

function optNum(rules: RuleSet, key: string): number | null {
  return rules.keys().includes(key) ? rules.num(key) : null;
}

/** True when the rule set publishes any penalty amount for the class. */
export function hasPenaltyTable(rules: RuleSet, c: ViolationClass): boolean {
  return PENALTY_FIELDS.some((f) => f.field !== 'applies' && rules.keys().includes(K.classField(c.id, f.field)));
}

/** Step 1: the warning shown before any act that breaks a clear rule (L8.2.5 "What the user sees"). */
export function warningFor(classId: string, group: FineGroup, rules: RuleSet): Warning {
  const c = violationClass(classId);
  const person = optNum(rules, K.classField(c.id, `fine_${group}_first_cents`));
  const club = optNum(rules, K.classField(c.id, 'club_fine_first_cents'));
  const pick = optNum(rules, K.classField(c.id, 'pick_round_first'));
  return {
    classId: c.id,
    ruleText: `compliance.rule.${c.id}`,
    body: c.body,
    personFineFirstCents: person,
    clubFineFirstCents: club,
    pickRoundFirst: pick,
    penaltyText: hasPenaltyTable(rules, c) ? 'known' : 'league_default',
    choices: ['go_back', 'do_it_anyway'],
  };
}

export type CommitResult =
  | { readonly ok: true; readonly state: ComplianceState; readonly row: ViolationLogRow }
  | { readonly ok: false; readonly reason: 'protected_person' | 'class_not_in_rule_set' | 'unknown_class'; readonly state: ComplianceState };

/**
 * Steps 2 and 3: the act happens (the owning leaf applies its real gain) and exactly one log row is
 * written, with one hidden `violation_committed` event. Same code for the user and for AI.
 */
export function commitAct(state: ComplianceState, act: Act, rules: RuleSet, sink: EventSink): CommitResult {
  let c: ViolationClass;
  try { c = violationClass(act.classId); } catch { return { ok: false, reason: 'unknown_class', state }; }
  if (!classApplies(rules, c.id)) return { ok: false, reason: 'class_not_in_rule_set', state };
  // Real-person guard (W-28): the hidden row is a personal-class event on the actor.
  if (!mayCarry(act.actor.origin, EVENT.committed)) return { ok: false, reason: 'protected_person', state };
  const id = state.nextLogId;
  const severity = act.severity ?? c.defaultSeverity;
  const witnesses = [act.actor.personId, ...(act.orderedBy ? [act.orderedBy.personId] : [])];
  const eventId = sink.append(draft(EVENT.committed,
    { date: act.date, competitionId: act.competitionId, teamId: act.actor.teamId, tier: act.tier, source: act.source },
    [{ personId: act.actor.personId, role: act.actor.role }, ...(act.orderedBy ? [{ personId: act.orderedBy.personId, role: `ordered:${act.orderedBy.role}` }] : [])],
    [{ kind: 'team', id: act.actor.teamId }],
    { classId: c.id, severity, gain: act.gain, logId: id, knewCount: act.knew.length },
    { kind: 'people', personIds: [...new Set(witnesses)] },
    null));
  const row: ViolationLogRow = {
    id, classId: c.id, actor: act.actor, orderedBy: act.orderedBy, knew: [...act.knew], date: act.date,
    competitionId: act.competitionId, gain: act.gain, severity, certainTrace: act.certainTrace === true,
    actSourcesDrawn: false, caseId: null, eventId,
  };
  // No copy when the caller holds the log (log.ts); then spent acts leave once the live log has doubled.
  const next: ComplianceState = { ...state, log: appendRow(state.log, row), nextLogId: id + 1 };
  return { ok: true, row, state: retireIfGrown(next, act.date, rules) };
}

/** Certified mode (N4): every logged act by a person, detected or not, live or archived, in log order. */
export function certifiedViolations(state: ComplianceState, personId: number): readonly ViolationLogRow[] {
  const mine = (r: ViolationLogRow) => r.actor.personId === personId || r.orderedBy?.personId === personId;
  return [...archivedRows(state).filter(mine), ...state.log.filter(mine)].sort((a, b) => a.id - b.id);
}

export { groupOf };
