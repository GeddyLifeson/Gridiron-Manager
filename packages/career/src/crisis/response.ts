// L9.3.1 response choices. The coach composes a response from real acts (acts.json, G-32); each act
// resolves through the system that owns it and this file adds no effect size of its own beyond the
// L1.1.2 "told before he found out" timing rule. No act spends a currency and nothing grades a
// response. Rule-breaking responses are offered with a warning and run through G-28 (L8.2.5).
import type { RuleSet, WorldDate } from '@gm/schema';
import { compliance } from '@gm/league';
import { crisisType, type ActDef, type ActsFile, type RuleBreakingResponseDef } from './catalogue.ts';
import { CRISIS_EVENT, draft } from './events.ts';
import type { Crisis, CrisisContext, CrisisState } from './engine.ts';
import type { Order } from './orders.ts';
import { param } from './params.ts';

export interface OfferedAct {
  readonly act: ActDef;
  /** `ask`: above the job's authority, offered as an ask to the person who holds the power (L5.2.1). */
  readonly mode: 'do' | 'ask';
  /** The power the act needs, or null. */
  readonly power: string | null;
  /** Fixed minutes from the act row (background talk), else the owning system charges its own time. */
  readonly minutes: number | null;
}

/**
 * The acts a crisis offers to a person holding these powers (L5.2.1, S3). An act above his authority
 * becomes an ask when the row allows it, and is left out otherwise.
 */
export function offeredActs(crisis: Pick<Crisis, 'typeId'>, ctx: Pick<CrisisContext, 'catalogue'>, acts: ActsFile, powers: ReadonlySet<string>): OfferedAct[] {
  const t = crisisType(ctx.catalogue, crisis.typeId);
  const out: OfferedAct[] = [];
  for (const id of t.acts) {
    const a = acts.acts.find((x) => x.id === id);
    if (!a) continue;
    const held = a.powerNeeded === null || powers.has(a.powerNeeded);
    if (!held && !a.askIfAboveAuthority) continue;
    out.push({ act: a, mode: held ? 'do' : 'ask', power: a.powerNeeded, minutes: a.minutes ? a.minutes.value : null });
  }
  return out;
}

/** The audience a statement-type act reaches, for the timing and honesty rules. */
const AUDIENCE: Readonly<Record<string, string>> = {
  team: 'team', council: 'team', boss: 'upstairs', audience: 'public', reporter: 'public', person: 'person', family_agent: 'person', staff: 'staff',
};
const KNOWN_ROLE: Readonly<Record<string, string>> = { team: 'team', upstairs: 'owner_or_ad', public: 'public', staff: 'staff' };

export interface ActInput {
  readonly actId: string;
  readonly targetIds: readonly number[];
  /** For a statement: does the truth record support it (L6 checks). Undefined for acts that state nothing. */
  readonly truthful?: boolean;
}

/**
 * Take one act on an open crisis. Returns the orders for the owning systems: the act's own event, the
 * fixed time if the row has one, and the timing memory when the coach reaches an audience before the
 * stage does. A false statement is remembered and comes to light when the crisis closes.
 */
export function takeAct(state: CrisisState, crisisId: number, input: ActInput, date: WorldDate, ctx: CrisisContext, acts: ActsFile, powers: ReadonlySet<string>): Order[] {
  const c = state.open.find((x) => x.id === crisisId);
  if (!c) throw new Error(`crisis: ${crisisId} is not open`);
  const offer = offeredActs(c, ctx, acts, powers).find((o) => o.act.id === input.actId);
  if (!offer) throw new Error(`crisis: act ${input.actId} is not offered on ${c.typeId}`);
  const coach = ctx.coachOf(c.teamId);
  const orders: Order[] = [];
  const ask = offer.mode === 'ask';
  orders.push({ kind: 'owner_event', ownerSystem: offer.act.ownerSystem, event: offer.act.event, crisisId: c.id, targetIds: [...input.targetIds], ask });
  if (offer.minutes !== null && coach !== null) orders.push({ kind: 'hours', personId: coach, minutes: offer.minutes, what: `crisis:${offer.act.id}` });
  const ev = ctx.sink.append(draft(CRISIS_EVENT.act, { date, competitionId: null, teamId: c.teamId, tier: ctx.tier, source: ctx.source },
    coach !== null ? [{ personId: coach, role: 'head_coach' }] : [], [], { crisisId: c.id, actId: offer.act.id, ask }, { kind: 'team', teamId: c.teamId }, null));
  c.actIds.push(offer.act.id);
  c.log.push({ date, kind: 'act', detail: ask ? `ask:${offer.act.id}` : offer.act.id, eventId: ev });
  if (ask || coach === null) return orders;
  const audience = AUDIENCE[offer.act.involves];
  if (audience === undefined) return orders;
  if (audience === 'person') {
    if (!c.public) for (const id of input.targetIds) orders.push({ kind: 'memory', holderId: id, aboutId: coach, memoryClass: 'told_before_found_out', amount: param('memory.toldBefore'), halfLifeWeeks: null, sourceEventId: ev });
  } else if (!c.told.includes(audience) && !c.knownTo.includes(KNOWN_ROLE[audience] ?? audience)) {
    c.told.push(audience);
    if (audience === 'team' || audience === 'upstairs' || audience === 'staff') orders.push({ kind: 'group_memory', group: audience, teamId: c.teamId, aboutId: coach, memoryClass: 'told_before_found_out', amount: param('memory.toldBefore'), sourceEventId: ev });
  } else if (!c.told.includes(audience)) c.told.push(audience);
  if (input.truthful === false) c.lies.push({ audience: audience === 'person' ? 'knowers' : audience, actId: offer.act.id });
  return orders;
}

/**
 * The violation classes (G-28 `classes.json`) a rule-breaking response may commit, by response id.
 * The owning leaf names the class from this list; the pipeline decides whether it applies.
 */
export const RULE_BREAKING_CLASSES: Readonly<Record<string, readonly string[]>> = {
  hide_case: ['failure_to_cooperate'],
  shade_report: ['injury_report_shading'],
  improper_benefit: ['pay_rules', 'cap_circumvention', 'eligibility_academic'],
};

/** Rule-breaking responses offered on this crisis type, each with its warning (L9.3.1, L8.2.5). */
export function ruleBreakingOffered(acts: ActsFile, typeId: string): RuleBreakingResponseDef[] {
  return acts.ruleBreakingResponses.filter((r) => r.offeredIn.includes(typeId));
}

/**
 * Take a rule-breaking response: the act is allowed (nothing here blocks it), logged and made
 * detectable by G-28's one entry point. The crisis log records that it was taken.
 */
export function commitRuleBreaking(
  state: CrisisState, crisisId: number, responseId: string, act: compliance.Act,
  comp: compliance.ComplianceState, rules: RuleSet, sink: compliance.EventSink, acts: ActsFile,
): compliance.CommitResult {
  const c = state.open.find((x) => x.id === crisisId);
  if (!c) throw new Error(`crisis: ${crisisId} is not open`);
  if (!ruleBreakingOffered(acts, c.typeId).some((r) => r.id === responseId)) throw new Error(`crisis: ${responseId} is not offered on ${c.typeId}`);
  if (!(RULE_BREAKING_CLASSES[responseId] ?? []).includes(act.classId)) throw new Error(`crisis: ${responseId} cannot commit class ${act.classId}`);
  const res = compliance.commitAct(comp, act, rules, sink);
  c.log.push({ date: act.date, kind: 'act', detail: res.ok ? `rule_breaking:${responseId}` : `rule_breaking_refused:${responseId}:${res.reason}`, eventId: null });
  if (res.ok) c.actIds.push(`rule_breaking:${responseId}`);
  return res;
}
