// L7.1 agents: representation, calls, the coach's standing with agents (derived when read, never stored),
// free-agent preference, and agencies with package deals. Agents are generated people in every build; a
// real-imported player gets a generated agent and no real agent is modelled (L7.1.1).
import { ap, clamp, halfLifeFactor, type Draw } from './params.ts';
import { mem, type MemoryWrite, type PromiseEntry } from './shared.ts';

/** `style` 0 cooperative to 100 combative is hidden truth for the AI (L7.1.1); the user sees labels only. */
export interface AgentRecord {
  readonly personId: number;
  readonly agencyId: number | null;
  readonly style: number;
}

export interface Representation {
  readonly playerId: number;
  readonly agentId: number | null;
  readonly selfRepresented: boolean;
}

export interface PlayerToRepresent {
  readonly playerId: number;
  /** A player at a level where agents act (the league-rules or calendar content says so; never a level test). */
  readonly represented: boolean;
}

/**
 * Give every represented player an agent or a self-represented flag (L7.1.1 acceptance). Agents come from the
 * generated pool (U2); an imported player is treated the same, so no real agent is ever attached.
 */
export function assignRepresentation(players: readonly PlayerToRepresent[], agents: readonly AgentRecord[], draw: Draw, selfShare = ap('assign.selfRepresentedShare')): Representation[] {
  const out: Representation[] = [];
  for (const p of players) {
    if (!p.represented) continue;
    if (agents.length === 0 || draw() < selfShare) { out.push({ playerId: p.playerId, agentId: null, selfRepresented: true }); continue; }
    const i = Math.min(agents.length - 1, Math.floor(draw() * agents.length));
    out.push({ playerId: p.playerId, agentId: agents[i]!.personId, selfRepresented: false });
  }
  return out;
}

/** Client lists derived from representation (K7 holds contracts; this is who an agent speaks for). */
export function clientsOf(reps: readonly Representation[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const r of reps) if (r.agentId !== null) { const l = m.get(r.agentId) ?? []; l.push(r.playerId); m.set(r.agentId, l); }
  return m;
}

// ---- Calls (L7.1.1) -------------------------------------------------------------------------------------

export interface CallTrigger {
  readonly agentId: number;
  readonly clientId: number;
  /** Weeks the client's playing-time, role or touches need has been unmet (L1.1.4). */
  readonly unmetRoleWeeks: number;
  /** A contract event is near (L7.2.1: final year, the league's contract dates). */
  readonly contractEventNear: boolean;
}

export type CallReason = 'contract' | 'role';

/** Whether an agent calls this week, and why. */
export function callReason(t: CallTrigger): CallReason | null {
  if (t.contractEventNear) return 'contract';
  if (t.unmetRoleWeeks >= ap('call.unmetWeeks')) return 'role';
  return null;
}

/** L7.4.1 head-coach setting: assistants answer first or every call comes to him. */
export type CallSetting = 'all_to_me' | 'assistants_first';

export interface RoutedCall {
  readonly agentId: number;
  readonly clientId: number;
  readonly reason: CallReason;
  readonly routedTo: 'coach' | 'gm' | 'assistant';
}

/**
 * Route this week's calls: at most one reaches the coach (L7.1.1 acceptance), contract calls first, then the
 * longest-unmet need, then lower ids for a stable order. With "assistants first" the position coach takes
 * the role calls (L7.4.1); contract calls go to the general manager.
 */
export function routeWeeklyCalls(triggers: readonly CallTrigger[], setting: CallSetting = 'all_to_me'): RoutedCall[] {
  const live = triggers
    .map((t) => ({ t, reason: callReason(t) }))
    .filter((x): x is { t: CallTrigger; reason: CallReason } => x.reason !== null)
    .sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'contract' ? -1 : 1)
      || b.t.unmetRoleWeeks - a.t.unmetRoleWeeks || a.t.agentId - b.t.agentId || a.t.clientId - b.t.clientId);
  let toCoach = 0;
  const cap = ap('call.maxPerWeekToCoach');
  return live.map(({ t, reason }) => {
    let routedTo: RoutedCall['routedTo'];
    if (setting === 'assistants_first') routedTo = reason === 'role' ? 'assistant' : 'gm';
    else if (toCoach < cap) { routedTo = 'coach'; toCoach++; } else routedTo = 'gm';
    return { agentId: t.agentId, clientId: t.clientId, reason, routedTo };
  });
}

export type CallAnswer = 'honest' | 'hopeful' | 'nothing';
export type Advice = 'be_patient' | 'unsettled';

export interface CallContext {
  readonly coachId: number;
  readonly agentId: number;
  readonly clientId: number;
  readonly gmId: number | null;
  /** The agent's trust in the coach, 0 to 100 (L1.1.1 record, agent side). */
  readonly agentTrust: number;
  readonly reason: CallReason;
  /** Hopeful answer only: the role stated and the week it must happen by. */
  readonly statedRole?: string;
  readonly byWeek?: number;
  /** L5.2.1 data: the general manager owns all agent contact, and whether he asked the coach to take this one. */
  readonly gmOwnsAgentContact: boolean;
  readonly gmAsked: boolean;
}

export interface CallOutcome {
  readonly agentTrustDelta: number;
  readonly advice: Advice;
  /** Change to the client's role_belief (L1.1.1), at most call.roleBeliefMax either way. */
  readonly roleBeliefDelta: number;
  readonly promise: PromiseEntry | null;
  readonly memories: readonly MemoryWrite[];
  readonly minutes: number;
}

/**
 * Take an agent's call (L7.1.1). Honest: trust +3 and "be patient" at 60 percent. Hopeful: a promise by
 * another route, logged at full strength. Nothing: no trust, a lower patience chance (module assumption).
 * The size of the advice's pull on role_belief scales with the agent's trust in the coach.
 */
export function answerCall(kind: CallAnswer, ctx: CallContext, draw: Draw): CallOutcome {
  const trustDelta = kind === 'honest' ? ap('call.honestTrust') : 0;
  const patientChance = kind === 'honest' ? ap('call.honestPatientChance') : kind === 'hopeful' ? ap('call.hopefulPatientChance') : ap('call.nothingPatientChance');
  const advice: Advice = draw() < patientChance ? 'be_patient' : 'unsettled';
  const trustAfter = clamp(ctx.agentTrust + trustDelta, 0, 100);
  const roleBeliefDelta = adviceEffect(advice, trustAfter);
  const promise: PromiseEntry | null = kind === 'hopeful'
    ? { promiserId: ctx.coachId, holderId: ctx.clientId, about: 'role', statedRole: ctx.statedRole ?? null, byWeek: ctx.byWeek ?? null, strength: 1, keptAtOnce: false, unfunded: false, cause: 'agent_call_hopeful' }
    : null;
  const memories: MemoryWrite[] = [];
  if (ctx.gmOwnsAgentContact && ctx.reason === 'contract' && !ctx.gmAsked && ctx.gmId !== null) {
    memories.push(mem(ctx.gmId, ctx.coachId, ap('call.gmContractMemory'), 'took_agent_contract_call'));
  }
  return { agentTrustDelta: trustDelta, advice, roleBeliefDelta, promise, memories, minutes: ap('call.takeMinutes') };
}

/** What the agent's advice does to his client's role_belief. Low trust reads every benching as a slight. */
export function adviceEffect(advice: Advice, agentTrust: number): number {
  const max = ap('call.roleBeliefMax');
  const t = clamp(agentTrust, 0, 100) / 100;
  return advice === 'be_patient' ? max * t : -max * (1 - t);
}

// ---- The coach's standing with agents (L7.1.2) ---------------------------------------------------------

export type AgentStance = 'favourable' | 'neutral' | 'wary' | 'hostile';

/** Derived when read from the agent's trust and his clients' memories at half strength. Never stored. */
export function agentStanceScore(agentTrust: number, clientMemorySum: number): number {
  return agentTrust + ap('stance.clientMemoryWeight') * clientMemorySum;
}

export function agentStance(agentTrust: number, clientMemorySum: number): AgentStance {
  const s = agentStanceScore(agentTrust, clientMemorySum);
  if (s >= ap('stance.band.favourable')) return 'favourable';
  if (s >= ap('stance.band.neutral')) return 'neutral';
  if (s >= ap('stance.band.wary')) return 'wary';
  return 'hostile';
}

export type ClientOutcome = 'paid_more_after' | 'cut_without_word';

/** The agent's ledger row for a client outcome under this coach (L7.1.2). */
export function clientOutcomeMemory(agentId: number, coachId: number, outcome: ClientOutcome): MemoryWrite {
  return outcome === 'paid_more_after'
    ? mem(agentId, coachId, ap('client.paidMore'), outcome, 1, ap('client.paidMoreHalfLifeWeeks'))
    : mem(agentId, coachId, ap('client.cutWithoutWord'), outcome);
}

/** A memory's value after `weeks`, with its half-life (null: no decay here; the memory module turns it over). */
export function memoryValueAfter(m: Pick<MemoryWrite, 'delta' | 'strength' | 'halfLifeWeeks'>, weeks: number): number {
  const f = m.halfLifeWeeks === null ? 1 : halfLifeFactor(weeks, m.halfLifeWeeks);
  return m.delta * m.strength * f;
}

export interface Offer {
  readonly teamId: number;
  readonly value: number;
  /** Stance of the player's agent toward that team's coach. */
  readonly stance: AgentStance;
}

/**
 * A free agent's pick between offers (L7.1.2). Only offers within 5 percent of the best get the stance
 * preference (favourable +3 percent, hostile -3 percent); money and role still decide most cases, which the
 * draw stands in for (module assumption `fa.otherFactorsSpread`, tuned so equal offers with one favourable
 * agent go his way more than half the time and never more than 65 percent).
 */
export function chooseOffer(offers: readonly Offer[], draw: Draw): Offer | null {
  if (offers.length === 0) return null;
  let best = offers[0]!.value;
  for (const o of offers) if (o.value > best) best = o.value;
  const close = ap('fa.closeOfferShare');
  const pref = ap('fa.stancePreference');
  const spread = ap('fa.otherFactorsSpread');
  let pick: Offer | null = null;
  let pickScore = -Infinity;
  for (const o of offers) {
    const inBand = best > 0 && o.value >= best * (1 - close);
    const p = inBand ? (o.stance === 'favourable' ? pref : o.stance === 'hostile' ? -pref : 0) : 0;
    const score = o.value * (1 + p) * (1 + spread * (draw() - 0.5));
    if (score > pickScore) { pickScore = score; pick = o; }
  }
  return pick;
}

/** What the coach may see about an agent: incidents with sources, never trust, style or stance (L7.1.2). */
export interface AgentIncident {
  readonly eventId: number;
  readonly kind: 'call' | 'public_complaint' | 'steered_here' | 'steered_away' | 'client_outcome';
  /** Who told the coach, or "seen" for first-hand. */
  readonly source: string;
}

export interface AgentView {
  readonly agentId: number;
  readonly clientsHere: readonly number[];
  readonly clientsElsewhere: readonly number[];
  readonly incidents: readonly AgentIncident[];
}

export function agentView(agentId: number, clientsHere: readonly number[], clientsElsewhere: readonly number[], incidents: readonly AgentIncident[]): AgentView {
  return { agentId, clientsHere: [...clientsHere], clientsElsewhere: [...clientsElsewhere], incidents: incidents.map((i) => ({ ...i })) };
}

// ---- Agencies and package deals (L7.1.3) ----------------------------------------------------------------

export interface Candidate {
  readonly personId: number;
  readonly agencyId: number | null;
  /** The hiring evaluation (L4.3), computed elsewhere. Shared agency never touches it. */
  readonly evaluation: number;
}

/** Weight for drawing interview slots: shared agency with the hirer or with the hiring coach raises it 1.5x. */
export function interviewWeight(c: Candidate, hirerAgencyIds: readonly (number | null)[]): number {
  const shared = c.agencyId !== null && hirerAgencyIds.includes(c.agencyId);
  return shared ? ap('agency.interviewFactor') : 1;
}

/** One agency on both sides of a hire is shown to the user and may become a story (L7.1.3). */
export function conflictFlag(hirerAgencyId: number | null, hiredAgencyId: number | null): boolean {
  return hirerAgencyId !== null && hirerAgencyId === hiredAgencyId;
}

/** Hiring or declining an assistant the coach's own agent proposed: trust in the agent moves +3 or -2. */
export function proposedAssistantTrust(hired: boolean): number {
  return hired ? ap('agency.hireProposedTrust') : ap('agency.declineProposedTrust');
}
