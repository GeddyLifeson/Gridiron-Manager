// Building and validating decision records (N3.1.1) and attributing them (S3, N3.2.1 edge case).
import { decisionType, isDecisionType } from './catalogue.ts';
import { freezeJson } from './information.ts';
import type { Attribution, DecisionActor, DecisionRecord } from './types.ts';

const ISO_DAY = /^-?\d{4,}-\d{2}-\d{2}$/;

/** Every problem with a record, empty when it validates (N3.1.1 acceptance). */
export function recordProblems(r: DecisionRecord): string[] {
  const p: string[] = [];
  if (!r.id) p.push('id is empty');
  if (!ISO_DAY.test(r.time.worldDate)) p.push(`time.worldDate ${r.time.worldDate} is not an ISO day`);
  if (!isDecisionType(r.type)) p.push(`type ${r.type} is not in the N3.2 catalogue`);
  else {
    const def = decisionType(r.type);
    if (!def.owners.includes(r.owner)) p.push(`owner ${r.owner} does not own type ${r.type} (owners ${def.owners.join(', ')})`);
    if (def.scope === 'game' && r.time.gameId === null) p.push(`game decision ${r.type} has no game id`);
    if (r.notMade && !def.flaggedNotMade) p.push(`type ${r.type} does not log decisions not made (N3.2.1)`);
    if (r.type === 'rule_breaking_act' && !r.violationLogId) p.push('a rule-breaking act names its violation_log row (N3.2.2)');
  }
  if (r.time.gameId === null && (r.time.playIndex !== null || r.time.gameClockTenths !== null || r.time.period !== null)) p.push('game clock fields set outside a game');
  if (!r.rung) p.push('rung is empty');
  if (r.options.length < 1) p.push('no options: "do nothing" counts as an option');
  const ids = new Set<string>();
  for (const o of r.options) {
    if (!o.optionId) p.push('an option id is empty');
    if (ids.has(o.optionId)) p.push(`option ${o.optionId} listed twice`);
    ids.add(o.optionId);
  }
  if (!ids.has(r.chosen)) p.push(`chosen ${r.chosen} is not among the options`);
  const sources = new Set<string>();
  for (const i of r.information) {
    if (sources.has(i.source)) p.push(`information source ${i.source} listed twice`);
    sources.add(i.source);
  }
  if (!(r.timeTaken.tenthsFromPrompt >= 0) || !Number.isInteger(r.timeTaken.tenthsFromPrompt)) p.push('timeTaken.tenthsFromPrompt is not a whole number of tenths at or above 0');
  const pc = r.timeTaken.playClockLeftTenths;
  if (pc !== null && (!(pc >= 0) || !Number.isInteger(pc))) p.push('timeTaken.playClockLeftTenths is not a whole number of tenths at or above 0');
  if ((r.actor.kind === 'user' || r.actor.kind === 'ai' || r.actor.kind === 'staff') && r.actor.personId === null) p.push(`actor of kind ${r.actor.kind} names no person`);
  const a = r.attribution;
  if ((a.basis === 'suggestion_taken' || a.basis === 'delegated') && a.viaPersonId === null) p.push(`attribution ${a.basis} names no person it came through`);
  if (r.supersedes === r.id) p.push('a record cannot supersede itself');
  return p;
}

export class RecordError extends Error {}

/** Freezes a record by value (N3.1.2: stored by value, never by reference) after validating it. */
export function makeRecord(r: DecisionRecord): DecisionRecord {
  const problems = recordProblems(r);
  if (problems.length) throw new RecordError(`invalid decision record ${r.id}: ${problems.join('; ')}`);
  return freezeJson(r) as unknown as DecisionRecord;
}

export interface AttributionInput {
  readonly type: string;
  readonly actor: DecisionActor;
  /** Decision types the decider's rung owns (S3). For a head coach, every type his power arrangement holds. */
  readonly rungOwns: ReadonlySet<string>;
  /** The decider (the user, or the AI coach whose log this is). */
  readonly deciderPersonId: number;
  /** The decider's boss, who is credited with types the rung does not own (S5). */
  readonly bossPersonId: number | null;
  /** A coordinator whose suggestion the decider accepted. */
  readonly suggestionFromPersonId?: number | null;
}

/**
 * Who is credited (N3.1.1 `attribution`).
 * - A type the rung does not own is logged under the boss (N3.2.1 edge case).
 * - A delegated staff actor acts for the decider, who is credited for his choice of delegate (N3.4.1 edge case).
 * - An accepted suggestion is credited to the decider, through the person who suggested it.
 */
export function attribute(i: AttributionInput): Attribution {
  if (!i.rungOwns.has(i.type)) {
    if (i.bossPersonId === null) throw new RecordError(`type ${i.type} is not owned by the rung and there is no boss to log it under`);
    return { creditedPersonId: i.bossPersonId, basis: 'logged_under_boss', viaPersonId: i.deciderPersonId };
  }
  if (i.actor.kind === 'staff' && i.actor.personId !== null && i.actor.personId !== i.deciderPersonId) {
    return { creditedPersonId: i.deciderPersonId, basis: 'delegated', viaPersonId: i.actor.personId };
  }
  if (i.suggestionFromPersonId != null) {
    return { creditedPersonId: i.deciderPersonId, basis: 'suggestion_taken', viaPersonId: i.suggestionFromPersonId };
  }
  return { creditedPersonId: i.deciderPersonId, basis: 'own_decision', viaPersonId: null };
}
