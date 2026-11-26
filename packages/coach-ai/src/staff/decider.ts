// K6.1.1, K6.1.2, K6.4.1 rule 1, J11.6.1, I2.6.4: the decider of a team whose head coach delegates.
// It answers every decision request of one side. A request goes to whoever owns its duty: the user
// when he kept it, else the staff member holding it, who decides with his own profile through the K4
// and K5 procedures. Standing instructions filter his candidates first. A reserved decision comes
// back to the user. Nothing is rolled differently because the user is watching or not: every draw is
// keyed by the game and the request, so "simulate to end" and "watch with everything delegated"
// reach the same result from the same seed (J14.4.1).
import { flow } from '@gm/engine-game';
import type { Draws } from '../profile/index.ts';
import type { AnyCall, Decider, Decision, DecisionRequest, DecisionView, FieldGeometry, OpposingCall, Side, SnappingCall } from './contract.ts';
import { callPermits, callRules, inForce, isReserved, matches, ruleOptions, type CallMatch, type StandingInstruction } from './instructions.ts';
import { dutyFor, member, ownerOf } from './owners.ts';
import { P } from './params.ts';
import { LAST_DOWN_CHOICES, type CallAnswer, type CallerPort, type LastDownChoice, type ManagerPort, type SheetRef } from './ports.ts';
import { DUTY, type DecisionBasis, type Duty, type OverrideEvent, type Owner, type StaffChart, type StaffDecisionRow, type StaffMember } from './types.ts';

/** What the user does to a delegated call he hears (I2.6.4): veto it with an instruction, or replace it. */
export type OverrideAction =
  | { readonly kind: 'instruction'; readonly require: CallMatch }
  | { readonly kind: 'replace'; readonly call: AnyCall; readonly spokenTenths: number };

/**
 * The user's seat. The shell measures real time and tells the core only that a deadline passed
 * (J13.3.2); the core never reads a clock.
 */
export interface UserSeat {
  /** His answer to a request he owns or reserved, or null while he has not answered. */
  decide(view: DecisionView): Decision | null;
  /** True once the request's deadline has passed without his answer. */
  timedOut(request: DecisionRequest): boolean;
  /** His fourth-down choice when he keeps game management and someone else calls the offense (I2.6.4 edge case). */
  lastDown?(view: DecisionView): LastDownChoice | null;
  /** I2.6.4 rule 1: whether he is on the channel that hears this duty's calls. Default: he is. */
  listening?(duty: Duty): boolean;
  /** Called with a delegated call before it is relayed. Null lets it go. */
  override?(view: DecisionView, proposed: AnyCall, by: StaffMember): OverrideAction | null;
}

export interface StaffDeciderConfig {
  readonly side: Side;
  readonly chart: StaffChart;
  readonly geometry: FieldGeometry;
  /** Last down of a series by the rule set (`series.downs`). */
  readonly lastDown: number;
  readonly instructions: readonly StandingInstruction[];
  readonly caller: CallerPort;
  readonly manager: ManagerPort;
  /** The user's seat, or null for a staff with no user on it (an AI team runs the same code). */
  readonly user: UserSeat | null;
  /** K6.4.1: the user is simulating, so the duties he kept go to the next person in line. Reserved decisions still reach him. */
  readonly simulate?: boolean;
  /** Stream `coachAI` for a scope (J13.2.1). */
  draws(scope: readonly (string | number)[]): Draws;
  /** Sheet in force per calling duty. */
  readonly sheets?: Readonly<Record<string, SheetRef>>;
  /** The conservative call of J11.6.1 for a view, used when the caller's call breaks an instruction. */
  conservative?(view: DecisionView): AnyCall | null;
}

export interface StaffDecider extends Decider {
  /** One row per request answered: the N3 feed with who decided and why. */
  rows(): readonly StaffDecisionRow[];
  overrides(): readonly OverrideEvent[];
}

const NO_SHEET: SheetRef = { sheetId: null, builtById: null };

function kickMatch(choice: LastDownChoice): CallMatch {
  return choice === 'go' ? { units: ['offense'] } : { units: ['kick'], kinds: [choice] };
}

export function createStaffDecider(cfg: StaffDeciderConfig): StaffDecider {
  const { side, chart } = cfg;
  const rows = new Map<number, StaffDecisionRow>();
  const overrides = new Map<number, OverrideEvent>();
  /** Request id of our last try choice that chose two points. */
  let tryIsTwo = false;
  const actorKind = chart.userId === null ? 'ai' as const : 'staff' as const;
  const userIsHeadCoach = chart.userId !== null && chart.userId === chart.headCoachId;

  const standIn = cfg.simulate === true;
  const stream = (view: DecisionView, who: number, tag: string) => cfg.draws([view.situation.gameId, view.request.requestId, who, tag]);

  function row(view: DecisionView, duty: Duty, basis: DecisionBasis, kind: StaffDecisionRow['decidedBy']['kind'], personId: number | null, extra: Partial<StaffDecisionRow> = {}): void {
    rows.set(view.request.requestId, {
      gameId: view.situation.gameId, playNumber: view.situation.playNumber, requestId: view.request.requestId, type: view.request.type, duty,
      decidedBy: { kind, personId }, basis, instructionIds: [], absentId: null, errorId: null, droppedInstructionIds: [], ...extra,
    });
  }

  function noteTry(request: DecisionRequest, optionId: string | null): void {
    if (request.type === 'try_choice') tryIsTwo = optionId === flow.OPT.tryTwo;
  }

  function byDefault(view: DecisionView, duty: Duty, basis: DecisionBasis, extra: Partial<StaffDecisionRow> = {}): Decision {
    row(view, duty, basis, 'default', null, extra);
    noteTry(view.request, view.request.defaultOptionId);
    return flow.deadlinePassed(view.request);
  }

  function answer(view: DecisionView, personId: number, kind: 'user' | 'ai' | 'staff', fields: Partial<Decision>): Decision {
    const r = view.request;
    return {
      requestId: r.requestId, type: r.type, side: r.side, optionId: null, snappingCall: null, opposingCall: null,
      acceptedAtPlayClockTenths: null, actor: { kind, personId }, ...fields,
    };
  }

  function late(request: DecisionRequest, at: number | null): boolean {
    return at !== null && request.deadlinePlayClockTenths !== null && at < request.deadlinePlayClockTenths;
  }

  /** The user's own answer to something he owns or reserved. Null while the prompt is still up. */
  function askUser(view: DecisionView, duty: Duty, basis: 'user' | 'reserved_user', ids: readonly string[]): Decision | null | 'timed_out' {
    const user = cfg.user!;
    const d = user.decide(view);
    if (d !== null) {
      row(view, duty, basis, 'user', chart.userId, { instructionIds: ids });
      noteTry(view.request, d.optionId);
      return { ...d, actor: { kind: 'user', personId: chart.userId } };
    }
    return user.timedOut(view.request) ? 'timed_out' : null;
  }

  function decideOption(view: DecisionView, duty: Duty, owner: Owner, who: StaffMember, force: readonly StandingInstruction[], basis: DecisionBasis): Decision {
    const ruling = ruleOptions(force, view.request);
    const extra = { instructionIds: ruling.usedIds, droppedInstructionIds: ruling.droppedIds, absentId: owner.absentId };
    if (ruling.mandated !== null) {
      row(view, duty, basis === 'delegated' ? 'instruction' : basis, actorKind, who.personId, extra);
      noteTry(view.request, ruling.mandated);
      return answer(view, who.personId, actorKind, { optionId: ruling.mandated });
    }
    const a = cfg.manager.choose(view, { decider: who, advisor: advisorFor(who), allowed: ruling.allowed, draws: stream(view, who.personId, 'manage') });
    if (a === null || !ruling.allowed.includes(a.optionId)) return byDefault(view, duty, 'default', extra);
    if (late(view.request, a.acceptedAtPlayClockTenths)) return byDefault(view, duty, 'late', extra);
    row(view, duty, basis, actorKind, who.personId, { ...extra, errorId: a.errorId });
    noteTry(view.request, a.optionId);
    return answer(view, who.personId, actorKind, { optionId: a.optionId, acceptedAtPlayClockTenths: a.acceptedAtPlayClockTenths });
  }

  /** The staff member holding the advice duty (S3.4.4), when it is assigned to someone other than the decider. */
  function advisorFor(who: StaffMember): StaffMember | null {
    if (chart.assignments[DUTY.gameManagementAdvice] === undefined) return null;
    const o = ownerOf(chart, DUTY.gameManagementAdvice, { standIn });
    return o.personId === null || o.isUser || o.personId === who.personId ? null : member(chart, o.personId);
  }

  function askCaller(view: DecisionView, duty: Duty, who: StaffMember, permits: (c: AnyCall) => boolean): CallAnswer<AnyCall> | null {
    const a = chart.assignments[duty];
    const ctx = { caller: who, duty, sheet: cfg.sheets?.[duty] ?? NO_SHEET, mayAdd: a?.mayAdd === true, permits, draws: stream(view, who.personId, 'call') };
    return view.request.type === 'snapping_call' ? cfg.caller.snappingCall(view, ctx) : cfg.caller.opposingCall(view, ctx);
  }

  /** The fourth-down decision (J11.6.1): which unit goes out. Null when nobody decides it apart from the caller. */
  function lastDownChoice(view: DecisionView): { choice: LastDownChoice; errorId: string | null; ids: string[] } | 'pending' | null {
    const s = view.situation;
    if (view.request.type !== 'snapping_call' || s.playKind !== 'scrimmage' || s.down === null || s.down < cfg.lastDown) return null;
    const gmForce = inForce(cfg.instructions, DUTY.gameManagement, view.request, s, cfg.geometry);
    const permits = callPermits(gmForce);
    // A unit is open when the instructions leave it at least one call: a run or a pass for the offense.
    const offense = (kind: 'run' | 'dropback_pass'): AnyCall => ({
      unit: 'offense', playContentId: null, contentHash: null, kind, personnelCode: '11', formationId: null, strength: null,
      motionId: null, protectionId: null, tags: [], runDirection: null, shotgun: false, tempo: 'huddle', players: [],
    });
    const open = (c: LastDownChoice): boolean => (c === 'go'
      ? permits(offense('run')) || permits(offense('dropback_pass'))
      : permits({ unit: 'kick', kickKind: c, callContentId: null, contentHash: null, direction: null, players: [] }));
    let allowed = LAST_DOWN_CHOICES.filter(open);
    if (allowed.length === 0) allowed = [...LAST_DOWN_CHOICES];
    const ids = callRules(gmForce).map((i) => i.id);
    const gm = ownerOf(chart, DUTY.gameManagement, { standIn });
    const reserved = isReserved(gmForce) !== null;
    if (cfg.user !== null && cfg.user.lastDown && ((gm.isUser && !standIn) || reserved)) {
      const c = cfg.user.lastDown(view);
      if (c !== null) return { choice: c, errorId: null, ids };
      if (!cfg.user.timedOut(view.request)) return 'pending';
    }
    const fallback = gm.isUser ? ownerOf(chart, DUTY.gameManagement, { standIn: true }) : gm;
    const who = fallback.isUser ? null : member(chart, fallback.personId);
    if (who === null) return null;
    if (allowed.length === 1) return { choice: allowed[0]!, errorId: null, ids };
    const r = cfg.manager.lastDown(view, { decider: who, advisor: advisorFor(who), allowed: [], allowedUnits: allowed, draws: stream(view, who.personId, 'last_down') });
    if (r === null || !allowed.includes(r.choice)) return null;
    return { choice: r.choice, errorId: r.errorId, ids };
  }

  function decideCall(view: DecisionView, duty0: Duty, owner0: Owner, force0: readonly StandingInstruction[], basis: DecisionBasis): Decision | null {
    let duty = duty0, owner = owner0, force = force0;
    const fourth = lastDownChoice(view);
    if (fourth === 'pending') return null;
    let unit: CallMatch | null = null;
    let errorId: string | null = null;
    const ids: string[] = [];
    if (fourth !== null) {
      unit = kickMatch(fourth.choice);
      errorId = fourth.errorId;
      ids.push(...fourth.ids);
      if (fourth.choice !== 'go') {
        duty = DUTY.callSpecialTeams;
        owner = ownerOf(chart, duty, { standIn: standIn || owner0.isUser });
        force = inForce(cfg.instructions, duty, view.request, view.situation, cfg.geometry);
      }
    }
    const who = owner.isUser ? null : member(chart, owner.personId);
    if (who === null) return byDefault(view, duty, 'default', { absentId: owner.absentId });
    const rules = callRules(force);
    for (let dropped = 0; dropped <= rules.length; dropped++) {
      const base = callPermits(force, dropped);
      const permits = (c: AnyCall) => base(c) && (unit === null || matches(unit, c));
      const live = rules.slice(0, rules.length - dropped).map((i) => i.id);
      const gone = rules.slice(rules.length - dropped).map((i) => i.id);
      const extra = { instructionIds: [...ids, ...live], droppedInstructionIds: gone, absentId: owner.absentId, errorId };
      let a = askCaller(view, duty, who, permits);
      if (a !== null && !permits(a.call)) {
        const safe = cfg.conservative?.(view) ?? null;
        a = safe !== null && permits(safe) ? { call: safe, acceptedAtPlayClockTenths: a.acceptedAtPlayClockTenths } : null;
        if (a === null) continue;
      }
      if (a === null) return byDefault(view, duty, 'default', extra);
      return relay(view, duty, who, a, permits, basis, extra);
    }
    return byDefault(view, duty, 'default', { absentId: owner.absentId, droppedInstructionIds: rules.map((i) => i.id) });
  }

  function callFields(view: DecisionView, call: AnyCall): Partial<Decision> {
    return view.request.type === 'snapping_call' ? { snappingCall: call as SnappingCall } : { opposingCall: call as OpposingCall };
  }

  /** The call goes in, unless the head coach on that channel steps in first (I2.6.4, K6.1.1 rule 5). */
  function relay(
    view: DecisionView, duty: Duty, who: StaffMember, a: CallAnswer<AnyCall>, permits: (c: AnyCall) => boolean, basis: DecisionBasis, extra: Partial<StaffDecisionRow>,
  ): Decision {
    const user = cfg.user;
    const mayOverride = user !== null && !standIn && userIsHeadCoach && user.override !== undefined && user.listening?.(duty) !== false;
    const action = mayOverride ? user.override!(view, a.call, who) : null;
    if (action === null) {
      if (late(view.request, a.acceptedAtPlayClockTenths)) return byDefault(view, duty, 'late', extra);
      row(view, duty, basis, actorKind, who.personId, extra);
      return answer(view, who.personId, actorKind, { ...callFields(view, a.call), acceptedAtPlayClockTenths: a.acceptedAtPlayClockTenths });
    }
    const cost = action.kind === 'instruction' ? P('override_instruction_tenths') : P('override_replace_tenths') + Math.max(0, action.spokenTenths);
    const at = a.acceptedAtPlayClockTenths === null ? null : a.acceptedAtPlayClockTenths - cost;
    let call: AnyCall | null;
    let by: { kind: 'user' | 'ai' | 'staff'; personId: number };
    if (action.kind === 'replace') {
      call = action.call;
      by = { kind: 'user', personId: chart.userId! };
    } else {
      const again = askCaller(view, duty, who, (c) => permits(c) && matches(action.require, c));
      call = again !== null && permits(again.call) && matches(action.require, again.call) ? again.call : null;
      by = { kind: actorKind, personId: who.personId };
    }
    const isLate = call === null || late(view.request, at);
    const prior = overrides.get(view.request.requestId);
    const count = prior ? prior.count : overrides.size + 1;
    overrides.set(view.request.requestId, {
      gameId: view.situation.gameId, playNumber: view.situation.playNumber, requestId: view.request.requestId, coordinatorId: who.personId,
      kind: action.kind, costTenths: cost, count, trustCost: Math.max(0, count - P('override_free_per_game')) * P('override_trust_step'), late: isLate,
    });
    if (isLate) return byDefault(view, duty, 'late', extra);
    row(view, duty, 'override', by.kind, by.personId, extra);
    return answer(view, by.personId, by.kind, { ...callFields(view, call!), acceptedAtPlayClockTenths: at === null ? null : Math.max(0, at) });
  }

  function decide(view: DecisionView): Decision | null {
    const { request, situation } = view;
    if (request.side !== side) return null;
    const duty = dutyFor(request.type, situation, tryIsTwo);
    const force = inForce(cfg.instructions, duty, request, situation, cfg.geometry);
    let owner = ownerOf(chart, duty, { standIn });
    let basis: DecisionBasis = 'delegated';
    const reserved = isReserved(force);
    if (cfg.user !== null && ((owner.isUser && !standIn) || reserved !== null)) {
      const u = askUser(view, duty, owner.isUser ? 'user' : 'reserved_user', reserved ? [reserved.id] : []);
      if (u === null) return null;
      if (u !== 'timed_out') return u;
      // J11.6.1 default order: the standing instruction, then the staff member holding the duty, then the conservative rule.
      basis = owner.isUser ? 'user_timed_out' : 'reserved_timed_out';
      if (owner.isUser) owner = ownerOf(chart, duty, { standIn: true });
    }
    const isCall = request.type === 'snapping_call' || request.type === 'opposing_call';
    if (isCall) return decideCall(view, duty, owner, force, basis);
    const who = owner.isUser ? null : member(chart, owner.personId);
    if (who === null) return byDefault(view, duty, basis === 'delegated' ? 'default' : basis, { absentId: owner.absentId });
    return decideOption(view, duty, owner, who, force, basis);
  }

  return {
    side,
    decide,
    rows: () => [...rows.values()].sort((a, b) => a.requestId - b.requestId),
    overrides: () => [...overrides.values()].sort((a, b) => a.requestId - b.requestId),
  };
}

/**
 * K6.1.1 acceptance and J14.4.1: every decision of a finished game is logged to somebody. Returns the
 * request ids of a game's decisions that have no row, or whose row names nobody though a person decided.
 */
export function unloggedDecisions(decisions: readonly Decision[], side: Side, rows: readonly StaffDecisionRow[]): number[] {
  const byId = new Map(rows.map((r) => [r.requestId, r]));
  const out: number[] = [];
  for (const d of decisions) {
    if (d.side !== side) continue;
    const r = byId.get(d.requestId);
    if (!r || (d.actor.kind !== 'default' && r.decidedBy.personId === null)) out.push(d.requestId);
  }
  return out;
}
