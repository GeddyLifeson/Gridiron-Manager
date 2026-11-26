// L5.2.2 daily requests and the contract word, L5.2.3 roster meetings, L5.2.4 the trust value. The general
// manager's trust is the standard L1 record; tolerance is a function of trust only (no hidden bonus by
// reputation). K7 supplies the value gap, measured in draft rounds of value.
import { memory, signal, type BossEvent, type BossPromise, type BossRecord } from './events.ts';
import { param } from './params.ts';
import { holderOf, type Power, type PowerField, type Seat } from './power.ts';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * L5.2.4: request tolerance rises linearly with trust, 0 rounds of value at trust 20 to one round at trust 80
 * (continuing past 80). Acceptance: a function of trust only.
 */
export function requestTolerance(trust: number): number {
  const lo = param('gm.toleranceZeroAtTrust');
  const hi = param('gm.toleranceOneRoundAtTrust');
  return Math.max(0, (trust - lo) / (hi - lo));
}

export type GmAnswer =
  | { readonly kind: 'order'; readonly objects: boolean; readonly events: readonly BossEvent[] }
  | { readonly kind: 'granted'; readonly reason: 'valuation_agrees' | 'trust_covers_gap'; readonly events: readonly BossEvent[] }
  | { readonly kind: 'refused'; readonly reason: 'valuation_gap'; readonly gapRounds: number; readonly toleranceRounds: number; readonly events: readonly BossEvent[] };

/**
 * L5.2.2: a request on a player. Where the coach holds the field it is his own order and the general
 * manager's disagreement becomes a memory (edge case). Otherwise granted when K7's valuation agrees or trust
 * covers the gap; every refusal carries the K7 reason (acceptance).
 */
export function gmRequest(power: Power, field: PowerField, coachSeat: Seat, gmPersonId: number, gm: BossRecord, gapRounds: number, day: number): GmAnswer {
  const tol = requestTolerance(gm.trust);
  if (holderOf(power, field) === coachSeat) {
    const objects = gapRounds > tol;
    return { kind: 'order', objects, events: objects ? [memory(gmPersonId, null, 'overruled', -Math.min(5, Math.ceil(gapRounds - tol)), day, `order with K7 gap ${gapRounds} rounds`)] : [] };
  }
  if (gapRounds <= 0) return { kind: 'granted', reason: 'valuation_agrees', events: [] };
  if (gapRounds <= tol) return { kind: 'granted', reason: 'trust_covers_gap', events: [memory(gmPersonId, null, 'backed_him', 0, day, `granted inside tolerance ${tol.toFixed(2)}`)] };
  return { kind: 'refused', reason: 'valuation_gap', gapRounds, toleranceRounds: tol, events: [] };
}

/**
 * L5.2.2 contract word. Promising to ask is kept by making the request; promising an outcome the coach does
 * not control breaks on him if the general manager refuses. Acceptance: no outcome promise without the warning.
 */
export function contractPromiseWarning(power: Power, coachSeat: Seat): string | null {
  return holderOf(power, 'contracts') === coachSeat ? null
    : 'You do not have final say on contracts. Promise to ask for it, or the promise breaks on you if the answer is no.';
}

export interface ContractPromiseInput { readonly playerPersonId: number; readonly outcome: boolean; readonly warningShown: boolean; readonly day: number }

export function contractPromise(power: Power, coachSeat: Seat, p: ContractPromiseInput): BossPromise {
  if (p.outcome && contractPromiseWarning(power, coachSeat) !== null && !p.warningShown) {
    throw new Error('bosses: an outcome promise on a contract needs the L5.2.2 warning first');
  }
  return { type: 'promise', toPersonId: p.playerPersonId, kind: p.outcome ? 'contract_outcome' : 'contract_ask', text: p.outcome ? 'will get the extension done' : 'will go to bat for the extension', day: p.day, testSeason: null };
}

/** Whether a contract promise holds after the request: an ask is kept by asking; an outcome needs a yes. */
export function contractPromiseKept(kind: 'contract_ask' | 'contract_outcome', requested: boolean, granted: boolean): boolean {
  return kind === 'contract_ask' ? requested : granted;
}

/**
 * L5.2.2: the general manager's pick, healthy and behind a lesser draft investment, costs -2 trust per month
 * unless the coach has shown him the film case.
 */
export function unplayedPickTrust(monthsHealthyBehindLesser: number, filmCaseShown: boolean): number {
  return filmCaseShown ? 0 : param('gm.unplayedPickPerMonth') * Math.max(0, Math.floor(monthsHealthyBehindLesser));
}

/** L5.2.2: a trade made without the coach is a "not consulted" memory, and a hot-seat sign when repeated. */
export function tradeWithoutCoach(day: number, timesThisSeason: number): BossEvent[] {
  const out: BossEvent[] = [signal('e4', 'not_consulted', day, 'trade made without the coach')];
  if (timesThisSeason >= 2) out.push(signal('hot_seat', 'gm_stops_consulting', day, 'repeated trades without the coach'));
  return out;
}

/** L5.2.4: going over his head to the owner writes strength 50 on the general manager. */
export function endRunToOwner(gmPersonId: number, day: number): BossEvent[] {
  return [memory(gmPersonId, null, 'end_run_to_owner', -param('memory.endRun'), day, 'coach went over his head (L5.2.4)')];
}

// ---- L5.2.3 roster meetings: logged evaluations --------------------------------------------------------

export const PREDICTED_ROLES = ['starter', 'rotation', 'special_teams', 'practice_squad', 'cut'] as const;
export type PredictedRole = (typeof PREDICTED_ROLES)[number];

/** Acceptance: every evaluation the user states is stored with a date and, later, its outcome. */
export interface Evaluation {
  readonly playerPersonId: number;
  readonly day: number;
  readonly predicted: PredictedRole;
  /** Filled after one season from snaps played; null until then. */
  readonly actual: PredictedRole | null;
}

/**
 * L5.2.3: after a season the general manager compares each prediction with the role played. +1 per hit,
 * -1 per clear miss (two or more steps apart), capped at plus or minus 5 a season.
 */
export function scoreEvaluations(evals: readonly Evaluation[]): number {
  let sum = 0;
  for (const e of evals) {
    if (e.actual === null) continue;
    const d = Math.abs(PREDICTED_ROLES.indexOf(e.predicted) - PREDICTED_ROLES.indexOf(e.actual));
    if (d === 0) sum += param('gm.evalHit');
    else if (d >= 2) sum += param('gm.evalMiss');
  }
  const cap = param('gm.evalSeasonCap');
  return clamp(sum, -cap, cap);
}
