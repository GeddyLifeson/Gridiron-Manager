// K6.1.2 standing instructions and reserved decisions. An instruction is a filter applied before the
// staff member's own choice: a forbidden option is removed from his candidates, a mandated option
// replaces his choice. A reserved decision comes back to the user. Instructions are data: a
// situation the instruction applies in, and what it does there.
import type { AnyCall, DecisionRequest, DecisionType, FieldGeometry, GameSituation, Side } from './contract.ts';
import type { Duty } from './types.ts';

/** When an instruction applies. Every field given must hold; a field left out matches anything. */
export interface When {
  readonly downs?: readonly number[];
  readonly distanceMinYd?: number;
  readonly distanceMaxYd?: number;
  /** Yards from the ball to the goal line the team attacks. */
  readonly yardsToGoalMin?: number;
  readonly yardsToGoalMax?: number;
  readonly periods?: readonly number[];
  readonly clockMinTenths?: number;
  readonly clockMaxTenths?: number;
  /** Own score minus the opponent's. */
  readonly leadMin?: number;
  readonly leadMax?: number;
  readonly playKinds?: readonly GameSituation['playKind'][];
  readonly insideTwoMinute?: boolean;
}

/** Which calls an instruction speaks about. Every field given must hold. */
export interface CallMatch {
  readonly units?: readonly AnyCall['unit'][];
  /** Offensive play kinds (G1.1.1 `kind`), kick kinds or return kinds, by the call's unit. */
  readonly kinds?: readonly string[];
  readonly rushersMin?: number;
  readonly rushersMax?: number;
  readonly coverageFamilies?: readonly string[];
  /** Matches when the call carries any of these tags. */
  readonly tags?: readonly string[];
  readonly tempos?: readonly string[];
}

export type Effect =
  | { readonly kind: 'forbid_call'; readonly match: CallMatch }
  | { readonly kind: 'require_call'; readonly match: CallMatch }
  | { readonly kind: 'forbid_option'; readonly optionIds: readonly string[] }
  | { readonly kind: 'mandate_option'; readonly optionId: string }
  /** K6.1.2 reserved decision: it comes back to the user and stops a simulation. */
  | { readonly kind: 'reserve' };

export interface StandingInstruction {
  readonly id: string;
  /** The duty it binds (the holder of that duty follows it), and the request types it speaks about. */
  readonly duty: Duty;
  readonly types: readonly DecisionType[];
  readonly when: When;
  readonly effect: Effect;
}

/** Yards from the ball to the goal line the snapping team attacks. */
export function yardsToGoal(geometry: FieldGeometry, s: GameSituation): number {
  return s.attackDir === 1 ? geometry.goalLineEastX - s.ballX : s.ballX - geometry.goalLineWestX;
}

const within = (x: number, lo: number | undefined, hi: number | undefined) => (lo === undefined || x >= lo) && (hi === undefined || x <= hi);

/** Whether the situation is one the instruction applies in, seen from `side`. */
export function applies(w: When, s: GameSituation, side: Side, geometry: FieldGeometry): boolean {
  if (w.downs !== undefined && (s.down === null || !w.downs.includes(s.down))) return false;
  if ((w.distanceMinYd !== undefined || w.distanceMaxYd !== undefined) && (s.distanceYd === null || !within(s.distanceYd, w.distanceMinYd, w.distanceMaxYd))) return false;
  if (!within(yardsToGoal(geometry, s), w.yardsToGoalMin, w.yardsToGoalMax)) return false;
  if (w.periods !== undefined && !w.periods.includes(s.period)) return false;
  if (!within(s.clockTenths, w.clockMinTenths, w.clockMaxTenths)) return false;
  const other: Side = side === 0 ? 1 : 0;
  if (!within(s.score[side] - s.score[other], w.leadMin, w.leadMax)) return false;
  if (w.playKinds !== undefined && !w.playKinds.includes(s.playKind)) return false;
  if (w.insideTwoMinute !== undefined && w.insideTwoMinute !== s.insideTwoMinute) return false;
  return true;
}

function callKind(c: AnyCall): string {
  return c.unit === 'offense' ? c.kind : c.unit === 'kick' ? c.kickKind : c.unit === 'return' ? c.returnKind : 'defense';
}

export function matches(m: CallMatch, c: AnyCall): boolean {
  if (m.units !== undefined && !m.units.includes(c.unit)) return false;
  if (m.kinds !== undefined && !m.kinds.includes(callKind(c))) return false;
  if (m.rushersMin !== undefined || m.rushersMax !== undefined) {
    if (c.unit !== 'defense' || !within(c.rushers, m.rushersMin, m.rushersMax)) return false;
  }
  if (m.coverageFamilies !== undefined && (c.unit !== 'defense' || !m.coverageFamilies.includes(c.coverageFamily))) return false;
  if (m.tags !== undefined && (c.unit !== 'offense' || !c.tags.some((t) => m.tags!.includes(t)))) return false;
  if (m.tempos !== undefined && (c.unit !== 'offense' || !m.tempos.includes(c.tempo))) return false;
  return true;
}

/** How specific an instruction is: the number of conditions it states. The more specific one wins (K6.1.2 edge case). */
export function specificity(i: StandingInstruction): number {
  let n = Object.values(i.when).filter((v) => v !== undefined).length;
  if (i.effect.kind === 'forbid_call' || i.effect.kind === 'require_call') n += Object.values(i.effect.match).filter((v) => v !== undefined).length;
  return n;
}

/** Instructions in force for a request, most specific first, ties by id so the order never depends on input order. */
export function inForce(
  all: readonly StandingInstruction[], duty: Duty, request: DecisionRequest, s: GameSituation, geometry: FieldGeometry,
): StandingInstruction[] {
  return all
    .filter((i) => i.duty === duty && i.types.includes(request.type) && applies(i.when, s, request.side, geometry))
    .sort((a, b) => specificity(b) - specificity(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface OptionRuling {
  /** Options the holder may still choose from, in the request's order. */
  readonly allowed: readonly string[];
  /** The mandated option, when an instruction names one the request offers. */
  readonly mandated: string | null;
  readonly usedIds: readonly string[];
  /** Instructions that lost to a more specific one. */
  readonly droppedIds: readonly string[];
}

/** K6.1.2 for an option request: the first (most specific) word on each option stands. */
export function ruleOptions(force: readonly StandingInstruction[], request: DecisionRequest): OptionRuling {
  const offered = request.options.map((o) => o.optionId);
  const forbidden = new Set<string>();
  const used: string[] = [];
  const dropped: string[] = [];
  let mandated: string | null = null;
  for (const i of force) {
    const e = i.effect;
    if (e.kind === 'mandate_option') {
      if (mandated === null && offered.includes(e.optionId) && !forbidden.has(e.optionId)) { mandated = e.optionId; used.push(i.id); }
      else if (offered.includes(e.optionId)) dropped.push(i.id);
    } else if (e.kind === 'forbid_option') {
      const hits = e.optionIds.filter((o) => offered.includes(o) && o !== mandated);
      if (hits.length > 0) { hits.forEach((o) => forbidden.add(o)); used.push(i.id); }
      else if (e.optionIds.some((o) => o === mandated)) dropped.push(i.id);
    }
  }
  let allowed = offered.filter((o) => !forbidden.has(o));
  // Instructions cannot leave a coach with no legal answer: with every option forbidden, all stand again.
  if (allowed.length === 0) { allowed = offered; dropped.push(...used.filter((id) => !dropped.includes(id))); }
  return { allowed, mandated, usedIds: used.filter((id) => !dropped.includes(id)), droppedIds: dropped };
}

/** The call instructions in force, as one test. `dropped` leaves out the least specific instructions. */
export function callPermits(force: readonly StandingInstruction[], dropped = 0): (call: AnyCall) => boolean {
  const live = callRules(force).slice(0, Math.max(0, callRules(force).length - dropped));
  return (call) => live.every((i) => (i.effect.kind === 'forbid_call' ? !matches(i.effect.match, call) : i.effect.kind === 'require_call' ? matches(i.effect.match, call) : true));
}

export function callRules(force: readonly StandingInstruction[]): StandingInstruction[] {
  return force.filter((i) => i.effect.kind === 'forbid_call' || i.effect.kind === 'require_call');
}

export function isReserved(force: readonly StandingInstruction[]): StandingInstruction | null {
  return force.find((i) => i.effect.kind === 'reserve') ?? null;
}

function rangesMeet(aLo: number | undefined, aHi: number | undefined, bLo: number | undefined, bHi: number | undefined): boolean {
  return (aLo ?? -Infinity) <= (bHi ?? Infinity) && (bLo ?? -Infinity) <= (aHi ?? Infinity);
}
function setsMeet<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): boolean {
  return a === undefined || b === undefined || a.some((x) => b.includes(x));
}

/** Whether two `When`s can both hold in some situation. */
export function whenOverlaps(a: When, b: When): boolean {
  return setsMeet(a.downs, b.downs) && setsMeet(a.periods, b.periods) && setsMeet(a.playKinds, b.playKinds)
    && rangesMeet(a.distanceMinYd, a.distanceMaxYd, b.distanceMinYd, b.distanceMaxYd)
    && rangesMeet(a.yardsToGoalMin, a.yardsToGoalMax, b.yardsToGoalMin, b.yardsToGoalMax)
    && rangesMeet(a.clockMinTenths, a.clockMaxTenths, b.clockMinTenths, b.clockMaxTenths)
    && rangesMeet(a.leadMin, a.leadMax, b.leadMin, b.leadMax)
    && (a.insideTwoMinute === undefined || b.insideTwoMinute === undefined || a.insideTwoMinute === b.insideTwoMinute);
}

function matchOverlaps(a: CallMatch, b: CallMatch): boolean {
  return setsMeet(a.units, b.units) && setsMeet(a.kinds, b.kinds) && setsMeet(a.coverageFamilies, b.coverageFamilies)
    && setsMeet(a.tempos, b.tempos) && rangesMeet(a.rushersMin, a.rushersMax, b.rushersMin, b.rushersMax);
}

export interface InstructionConflict { readonly winnerId: string; readonly loserId: string; readonly reason: string }

/**
 * Conflicting instructions for the pre-lock review (G7.9.1, K6.1.2 edge case): two instructions on the
 * same duty that can apply at once and pull opposite ways. The more specific one is named the winner.
 */
export function instructionConflicts(all: readonly StandingInstruction[]): InstructionConflict[] {
  const out: InstructionConflict[] = [];
  const sorted = [...all].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let x = 0; x < sorted.length; x++) for (let y = x + 1; y < sorted.length; y++) {
    const a = sorted[x]!, b = sorted[y]!;
    if (a.duty !== b.duty || !a.types.some((t) => b.types.includes(t)) || !whenOverlaps(a.when, b.when)) continue;
    const ea = a.effect, eb = b.effect;
    let reason: string | null = null;
    if (ea.kind === 'mandate_option' && eb.kind === 'mandate_option' && ea.optionId !== eb.optionId) reason = 'two different mandated options';
    else if (ea.kind === 'mandate_option' && eb.kind === 'forbid_option' && eb.optionIds.includes(ea.optionId)) reason = 'one mandates the option the other forbids';
    else if (eb.kind === 'mandate_option' && ea.kind === 'forbid_option' && ea.optionIds.includes(eb.optionId)) reason = 'one mandates the option the other forbids';
    else if (ea.kind === 'require_call' && eb.kind === 'require_call' && !matchOverlaps(ea.match, eb.match)) reason = 'no call can meet both requirements';
    else if (((ea.kind === 'require_call' && eb.kind === 'forbid_call') || (ea.kind === 'forbid_call' && eb.kind === 'require_call')) && matchOverlaps(ea.match, eb.match)) reason = 'one requires calls the other forbids';
    if (reason === null) continue;
    const aWins = specificity(a) >= specificity(b);
    out.push({ winnerId: aWins ? a.id : b.id, loserId: aWins ? b.id : a.id, reason });
  }
  return out;
}
