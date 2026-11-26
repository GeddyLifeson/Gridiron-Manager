// K8.4.1 the firing decision with no built-in bounce, through E4.3.1 (review points, hazard), E4.3.2
// (dead money brake), E4.5.1 (situation and grace) and E4.8.1 (the extension trigger). The same function
// reviews every head coach and general manager in the world.
//
// No bounce (E4.3.5, K8.4.1 rule 2): nothing in this file, or anywhere in the module, returns a modifier
// keyed to a coaching change. A firing produces an event and a vacancy; what follows comes from the new
// coach's real decisions, the install cost, changed relationships and luck redrawn.
import type { RandomStream } from '@gm/schema';
import { P } from './params.ts';
import { clamp } from './mathx.ts';
import type { DeciderModel, DecisionMakerProfile } from './types.ts';

/** E4.3.1 rule 3 (with MA-52): the 0.002 floor at 55 or above, linear to 0.25 at 40, 0.60 at 30, 0.90 at 15 or below. */
export function baseHazard(confidence: number): number {
  const c0 = P('fire.base.c0'), c1 = P('fire.base.c1'), c2 = P('fire.base.c2'), c3 = P('fire.base.c3');
  const p1 = P('fire.base.p1'), p2 = P('fire.base.p2'), p3 = P('fire.base.p3');
  const floor = P('fire.base.floor');
  if (confidence >= c0) return floor;
  if (confidence >= c1) return Math.max(floor, p1 * (c0 - confidence) / (c0 - c1));
  if (confidence >= c2) return p1 + (p2 - p1) * (c1 - confidence) / (c1 - c2);
  if (confidence > c3) return p2 + (p3 - p2) * (c2 - confidence) / (c2 - c3);
  return p3;
}

/** E4.3.1 rule 4. `lowStreak`: confidence below 50 at two straight season-end reviews. `graceShare` halves year-1 grace (win now). */
export function yearFactor(yearOnJob: number, lowStreak: boolean, graceShare = 1): number {
  if (yearOnJob <= 1) {
    const y1 = P('fire.year1');
    return y1 + (1 - y1) * (1 - graceShare);
  }
  if (yearOnJob === 2) return P('fire.year2');
  if (yearOnJob <= 5) return P('fire.year3to5');
  return lowStreak ? P('fire.year6.lowStreak') : P('fire.year6.other');
}

export type Situation = 'rebuild' | 'develop_qb' | 'win_now' | 'steady' | 'legacy';

export interface SituationState {
  readonly situation: Situation;
  readonly yearOnJob: number;
  /** Rebuild: the expectation rose this year (else the factor rises 0.2). */
  readonly expectationRising: boolean;
  /** Develop the quarterback: his public estimate has fallen for a full season. */
  readonly qbEstimateFalling: boolean;
}

/** E4.5.1: the situation at hiring (re-evaluated at each main review). */
export function situationAtHiring(expectedWinShare: number, highQbPickPlanned: boolean, veteranQbAcquired: boolean, legacy: boolean): Situation {
  if (legacy) return 'legacy';
  if (highQbPickPlanned) return 'develop_qb';
  if (expectedWinShare > P('situation.winNow.above') || veteranQbAcquired) return 'win_now';
  if (expectedWinShare < P('situation.rebuild.below')) return 'rebuild';
  return 'steady';
}

/** E4.5.1 table, then times (1.3 - 0.6 patience). */
export function situationFactor(s: SituationState, patience: number): number {
  let f: number;
  switch (s.situation) {
    case 'rebuild':
      f = s.yearOnJob <= 1 ? P('situation.rebuild.y1') : s.yearOnJob === 2 ? P('situation.rebuild.y2') : P('situation.rebuild.later');
      if (s.yearOnJob > 1 && !s.expectationRising) f += P('situation.rebuild.stallAdd');
      break;
    case 'develop_qb': f = s.qbEstimateFalling ? P('situation.developQb.falling') : P('situation.developQb.rising'); break;
    case 'win_now': f = P('situation.winNow'); break;
    case 'legacy': f = P('situation.legacy'); break;
    default: f = P('situation.steady');
  }
  return f * (P('situation.patience.base') - P('situation.patience.slope') * clamp(patience, 0, 1));
}

export interface MoneyInputs {
  /** Remaining guaranteed pay to the subject (the buyout at a college, E4.3.2 rule 5), in cents. */
  readonly remainingGuaranteeCents: number;
  /** Remaining guaranteed pay to assistants who would leave with him. */
  readonly assistantsGuaranteeCents: number;
  /** Expected to work again within a year (offset applies). */
  readonly expectedToWorkAgain: boolean;
  /** `owner.dead_money_owed`: still being paid to coaches fired earlier. */
  readonly deadMoneyOwedCents: number;
  /** Club annual football revenue share by revenue tier (per-club config value). */
  readonly revenueShareCents: number;
  /** K8.5.1 rule 3: what boosters will pay toward this firing (from the booster model, G-38 `buyoutFunding`). */
  readonly boosterFundingCents: number;
  /** A for-cause firing costs nothing and skips the brake. */
  readonly forCause: boolean;
}

/** E4.3.2 rule 1. */
export function firingCost(m: MoneyInputs): number {
  if (m.forCause) return 0;
  const offset = m.expectedToWorkAgain ? P('money.offsetShare') * m.remainingGuaranteeCents : 0;
  return Math.max(0, m.remainingGuaranteeCents + m.assistantsGuaranteeCents - offset - m.boosterFundingCents);
}

/** E4.3.2 rules 2 to 4: money_factor = 1 / (1 + sensitivity * burden * 4), floored at 0.4 below confidence 20. */
export function moneyFactor(dm: DecisionMakerProfile, m: MoneyInputs, confidence: number): number {
  if (m.forCause) return 1;
  const burden = (firingCost(m) + m.deadMoneyOwedCents) / Math.max(1, m.revenueShareCents);
  const f = 1 / (1 + dm.moneySensitivity * burden * P('money.scale'));
  return confidence < P('money.floorBelow') ? Math.max(P('money.floor'), f) : f;
}

export type ReviewKind = 'main' | 'emergency';

export interface ReviewInputs {
  readonly kind: ReviewKind;
  readonly confidence: number;
  readonly yearOnJob: number;
  readonly lowStreak: boolean;
  /** E4.3.1 rule 5: the current general manager hired this coach (ignored where the model has none). */
  readonly gmHiredCoach: boolean;
  readonly situation: SituationState;
  readonly money: MoneyInputs;
  /** E4.3.1 edge cases: announced retirement is not reviewed; a conduct investigation goes to E3.3.3. */
  readonly announcedRetirement: boolean;
  readonly underConductInvestigation: boolean;
  /** K8.5.1 rule 4: the president forces a firing (detected violation, academic failure) or vetoes one. */
  readonly presidentForces: boolean;
  readonly presidentVetoes: boolean;
  /** E4.3.3: set for an emergency review in season; null at the main review. */
  readonly inSeason: InSeasonContext | null;
}

export interface InSeasonContext {
  /** Games played this season so far (the review follows game number `gamesPlayed`). */
  readonly gamesPlayed: number;
  readonly gamesInSeason: number;
  /** Games this coach has coached on this job (the first 8 run at a small chance). */
  readonly gamesOnJob: number;
  readonly interimWithHeadCoachExperience: boolean;
  /** Still alive for the postseason: a reduced chance, never zero. */
  readonly aliveForPostseason: boolean;
  /** Kept at an earlier emergency review this season ("keep until the main review"): a reduced chance. */
  readonly keptAtEmergencyThisSeason: boolean;
}

/**
 * E4.3.3: the in-season factor. 0.25 before the midpoint, 0.4 after, 0.15 in the last two weeks, +0.1
 * with an experienced interim on staff. The E4.3.3 edge cases (first 8 games, still alive, kept until the
 * main review) multiply it down instead of ruling a firing out, so no timing has a zero chance. Those
 * three multipliers are fitted to the in-season share (F-stakeholders-0005, 36% at the professional level).
 */
export function inSeasonFactor(c: InSeasonContext): number {
  const left = c.gamesInSeason - c.gamesPlayed;
  let f = left < P('fire.inSeason.finalWeeks') ? P('fire.inSeason.final')
    : c.gamesPlayed * 2 < c.gamesInSeason ? P('fire.inSeason.early') : P('fire.inSeason.late');
  f += c.interimWithHeadCoachExperience ? P('fire.inSeason.interimBonus') : 0;
  if (c.gamesOnJob < P('conf.floor.games')) f *= P('fire.inSeason.firstGames');
  if (c.aliveForPostseason) f *= P('fire.inSeason.alive');
  if (c.keptAtEmergencyThisSeason) f *= P('fire.inSeason.afterKept');
  return f;
}

/**
 * E4.3.1 rule 1: an emergency review follows any in-season game that leaves confidence below 30. A coach
 * kept at an earlier emergency review is reviewed again at a reduced chance (`InSeasonContext`), so every
 * firing timing keeps a nonzero chance (standing rule, 2026-11-26).
 */
export function needsEmergencyReview(confidenceAfterGame: number): boolean {
  return confidenceAfterGame < P('fire.emergencyBelow');
}

export interface HazardBreakdown {
  readonly base: number;
  readonly year: number;
  readonly gm: number;
  readonly money: number;
  readonly situation: number;
  readonly scale: number;
  readonly inSeason: number;
  readonly pFire: number;
}

/** E4.3.1 rule 2: p_fire = base * year * gm * money * situation, capped at 0.95, times the decider model's fitted rate scale. */
export function firingHazard(dm: DecisionMakerProfile, model: DeciderModel, r: ReviewInputs): HazardBreakdown {
  const base = baseHazard(r.confidence);
  const grace = r.situation.situation === 'win_now' ? P('situation.winNow.yearOneGraceShare') : 1;
  const year = yearFactor(r.yearOnJob, r.lowStreak, grace);
  const gm = model.hasGeneralManager && !r.gmHiredCoach ? model.gmFactorNotHired : 1;
  const money = moneyFactor(dm, r.money, r.confidence);
  const situation = situationFactor(r.situation, dm.patience);
  const scale = model.hazardScale;
  const inSeason = r.inSeason ? inSeasonFactor(r.inSeason) * model.inSeasonScale : 1;
  return { base, year, gm, money, situation, scale, inSeason, pFire: Math.min(P('fire.cap'), base * year * gm * money * situation) * scale * inSeason };
}

export type ReviewOutcome = 'keep' | 'keep_with_conditions' | 'fire' | 'fire_for_cause' | 'not_reviewed' | 'conduct_process';

export interface FiringReviewResult {
  readonly outcome: ReviewOutcome;
  readonly hazard: HazardBreakdown | null;
  readonly draw: number | null;
  /** Amount added to `owner.dead_money_owed` by a firing (E4.3.2 acceptance 2): the remaining guarantees. */
  readonly deadMoneyAddedCents: number;
}

/**
 * E4.3.1 and K8.4.1: one review. The draw comes from the save's seeded stream handed in by the caller
 * (E4.3.1 rule 8), so a reloaded save gives the same decision.
 */
export function review(dm: DecisionMakerProfile, model: DeciderModel, r: ReviewInputs, rng: RandomStream): FiringReviewResult {
  if (r.announcedRetirement) return { outcome: 'not_reviewed', hazard: null, draw: null, deadMoneyAddedCents: 0 };
  if (r.underConductInvestigation) return { outcome: 'conduct_process', hazard: null, draw: null, deadMoneyAddedCents: 0 };
  if (model.presidentChain && r.presidentForces) return { outcome: 'fire_for_cause', hazard: null, draw: null, deadMoneyAddedCents: 0 };
  const hazard = firingHazard(dm, model, r);
  const draw = rng.uniform();
  const vetoed = model.presidentChain && r.presidentVetoes;
  if (draw < hazard.pFire && !vetoed) {
    const added = r.money.forCause ? 0 : r.money.remainingGuaranteeCents + r.money.assistantsGuaranteeCents;
    return { outcome: 'fire', hazard, draw, deadMoneyAddedCents: added };
  }
  const outcome = r.confidence < P('fire.keepConditionsBelow') ? 'keep_with_conditions' : 'keep';
  return { outcome, hazard, draw, deadMoneyAddedCents: 0 };
}

export interface ExtensionInputs {
  readonly confidence: number;
  readonly contractYearsLeft: number;
  /** Another club formally asked permission to speak with him (E2.4.1). */
  readonly courtedByAnotherClub: boolean;
  readonly wonTitle: boolean;
  /** No offer in the same offseason as a keep-with-conditions outcome (rule 3). */
  readonly keptWithConditionsThisOffseason: boolean;
}

export type ExtensionOutcome = 'offer' | 'lame_duck' | 'none';

/** E4.8.1 rules 2 to 4 and the edge case: a title always forces an offer. */
export function extensionCheck(x: ExtensionInputs): ExtensionOutcome {
  if (x.wonTitle) return 'offer';
  if (x.keptWithConditionsThisOffseason) return 'none';
  if (x.confidence >= P('extend.any')) return 'offer';
  if (x.confidence >= P('extend.secure') && x.contractYearsLeft <= P('extend.secureYearsLeft')) return 'offer';
  if (x.courtedByAnotherClub && x.confidence >= P('extend.courted')) return 'offer';
  if (x.contractYearsLeft <= 1 && x.confidence >= P('extend.lameDuckLow') && x.confidence < P('extend.secure')) return 'lame_duck';
  return 'none';
}
