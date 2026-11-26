// The people above a college head coach (T9.1.1, L5.4.1, L5.4.2): power arrangement, the athletic
// director's answers to requests, and the president and board. The AD decides totals; the coach
// decides what to ask for. Every grant or refusal is logged with a reason code (T9.1.1 acceptance).
import { possible, type RandomStream } from '@gm/schema';
import { P } from './params.ts';
import type {
  AdExchange, AdRequest, AthleticDirector, PowerArrangement, PresidentBody, ReasonCode, RequestOutcome,
} from './types.ts';

/** The college default (T9.1.1 rule 1): the head coach holds roster, school payments and staff. */
export const DEFAULT_POWER: PowerArrangement = {
  roster: 'head_coach', contracts: 'head_coach', staff: 'head_coach', draft: null,
  reports: 'athletic_director', generalManagerReportsTo: 'head_coach',
};

/** Draw a program's arrangement with the variant odds of `power_arrangement_odds.college` (T9.1.1). */
export function drawPowerArrangement(rng: RandomStream): PowerArrangement {
  const adPays = rng.chance(P('power.ad_holds_payments_odds'));
  const gmToAd = rng.chance(P('power.gm_reports_to_ad_odds'));
  return { ...DEFAULT_POWER, contracts: adPays ? 'athletic_director' : 'head_coach', generalManagerReportsTo: gmToAd ? 'athletic_director' : 'head_coach' };
}

/** A contract can move a field to or from the head coach (E3.8, as in L5.2.1). */
export function withContractField(p: PowerArrangement, field: 'roster' | 'contracts' | 'staff', holder: PowerArrangement['roster']): PowerArrangement {
  return { ...p, [field]: holder };
}

/** A new athletic director: dispositions drawn 0 to 1; he did not hire the sitting coach (T9.1.1 rule 3). */
export function newAthleticDirector(personId: number, year: number, rng: RandomStream, opts: { interim?: boolean; hiredCurrentCoach?: boolean } = {}): AthleticDirector {
  const mean = P('ad.tenure_mean_years');
  const spread = P('ad.tenure_spread_years');
  const tenure = Math.max(1, Math.round(mean - spread + 2 * spread * rng.uniform()));
  return {
    personId,
    patience: rng.uniform(), footballKnowledge: rng.uniform(), riskAppetite: rng.uniform(), boosterCloseness: rng.uniform(),
    interim: opts.interim ?? false,
    hiredCurrentCoach: opts.hiredCurrentCoach ?? false,
    startYear: year,
    plannedEndYear: year + tenure,
  };
}

/** What the AD weighs when he answers (T9.1.1 inputs: finances, results, boosters). */
export interface RequestContext {
  readonly year: number;
  readonly week: number;
  readonly totalBudgetCents: number;
  /** Money not yet committed this year, in cents. */
  readonly headroomCents: number;
  /** Results against expectation, -1 (far below) to +1 (far above). E4 owns the expectation. */
  readonly resultsVsExpectation: number;
  /** Mean booster mood 0 to 100 (L5.4.3). */
  readonly boosterMood: number;
}

export interface RequestAnswer { readonly outcome: RequestOutcome; readonly reason: ReasonCode }

function clamp(x: number, lo: number, hi: number): number { return x < lo ? lo : x > hi ? hi : x; }

/** True when a request is large enough that an interim AD defers it and the board may need to see it. */
export function isLargeRequest(r: AdRequest, totalBudgetCents: number): boolean {
  if (r.kind === 'facility_project' || r.kind === 'staff_seat') return true;
  return (r.amountCents ?? 0) >= P('ad.large_request_share') * totalBudgetCents;
}

/**
 * The AD's answer to one request (T9.1.1). Deterministic: same inputs, same answer. A head coach cannot
 * set his own budget; a request for more money than exists is refused for money, never granted.
 */
export function answerRequest(ad: AthleticDirector, r: AdRequest, c: RequestContext): RequestAnswer {
  if (r.kind === 'set_budget_total') return { outcome: 'refused', reason: 'not_coach_decision' };
  const money = r.kind === 'budget_line' || r.kind === 'staff_seat' || r.kind === 'facility_project';
  if (money && r.amountCents === undefined) return { outcome: 'refused', reason: 'no_amount' };
  if (ad.interim && isLargeRequest(r, c.totalBudgetCents)) return { outcome: 'deferred', reason: 'interim_ad' };
  const amount = r.amountCents ?? 0;
  if (money && amount > c.headroomCents) {
    return { outcome: c.resultsVsExpectation > 0 ? 'deferred' : 'refused', reason: 'no_money' };
  }
  const results = (clamp(c.resultsVsExpectation, -1, 1) + 1) / 2;
  const mood = clamp(c.boosterMood, 0, 100) / 100;
  const headroom = money && c.headroomCents > 0 ? 1 - amount / c.headroomCents : 1;
  const score = P('ad.weight_results') * results + P('ad.weight_boosters') * mood + P('ad.weight_headroom') * headroom;
  const bar = P('ad.grant_score') - P('ad.risk_appetite_shift') * ad.riskAppetite;
  const strongest: ReasonCode = results >= mood && results >= headroom ? 'strong_results' : mood >= headroom ? 'boosters_pleased' : 'money_available';
  const weakest: ReasonCode = results <= mood ? 'poor_results' : 'boosters_unhappy';
  if (score >= bar) return { outcome: 'granted', reason: strongest };
  if (score >= P('ad.defer_score')) return { outcome: 'deferred', reason: weakest };
  return { outcome: 'refused', reason: weakest };
}

/** Answer and append to the exchange history (the relationship shown as a history, T9.1.1). */
export function raiseRequest(history: readonly AdExchange[], ad: AthleticDirector, r: AdRequest, c: RequestContext): { readonly history: readonly AdExchange[]; readonly answer: RequestAnswer } {
  const answer = answerRequest(ad, r, c);
  return { history: [...history, { year: c.year, week: c.week, request: r, outcome: answer.outcome, reason: answer.reason }], answer };
}

/** L5.4.2 depth pass: chance the president backs the coach when a case reaches him. */
export function presidentBackingChance(p: PresidentBody): number {
  const raw = P('president.back_base') + P('president.back_slope') * (p.footballPriority - p.academicStrictness);
  return clamp(raw, P('president.back_min'), P('president.back_max'));
}

/** L5.4.2: the board approves head coach contracts and buyouts at or above the threshold. */
export function boardMustApprove(totalValueCents: number): boolean {
  return totalValueCents >= P('president.board_threshold_usd') * 100;
}

/** T9.1.1 rule 2: chance the president steps into a firing, hire or scandal. */
export function presidentInvolvementChance(buyoutCents: number, openComplianceCase: boolean): number {
  const millions = buyoutCents / 100 / 1_000_000;
  const raw = P('president.involve_base') + P('president.involve_per_million_buyout') * millions + (openComplianceCase ? P('president.involve_open_case') : 0);
  return possible(Math.min(raw, P('president.involve_max')));
}
