// K6.3.2 candor and disagreement (with L4.3.3). A staff member weighs the head coach's choice
// against his own estimate and either says so or stays quiet. His opinion is only as good as his
// estimates. A quiet staff feels smooth and hides problems.
//
// The bible states the rule as a line: speak when gap x candorFactor x safety > threshold. Marlon's
// ruling of 2026-11-25 21:32 says anything possible keeps a chance, so the line is read as the
// half-way mark of a chance: p = x / (x + threshold), x = gap x candorFactor x safety. At x equal to
// the threshold he speaks half the time; far above it nearly always; far below it rarely, never never.
import type { Draws } from '../profile/index.ts';
import { P, clamp, facetShare } from './params.ts';
import type { StaffMember } from './types.ts';

/** How the head coach answered an objection (L4.3.3). */
export type CandorResponse = 'accepted' | 'overruled_with_reason' | 'overruled_without_reason' | 'ignored' | 'punished';

/** What a staff member remembers about speaking up to this head coach (X6 memory rows, kept by the caller). */
export interface CandorHistory {
  /** 0 to 1: how safe he feels speaking. Starts at 1; falls each time candor is punished or ignored. */
  readonly safety: number;
  /** Responses to his objections, oldest first. */
  readonly responses: readonly CandorResponse[];
  /** Pushes he has made on the headset this series (L4.3.3: one per series at most). */
  readonly pushesThisSeries: number;
}

export const FRESH_HISTORY: CandorHistory = { safety: 1, responses: [], pushesThisSeries: 0 };

export function candorFactor(m: StaffMember): number {
  // Median candor gives 1; the quietest person keeps a small factor.
  return Math.max(P('candor_factor_floor'), 2 * facetShare(m.facets.candor));
}

/** L4.3.3: the threshold rises when the last objections in a row were all dismissed without reason. */
export function dismissedRun(h: CandorHistory): boolean {
  const n = P('candor_dismissed_run');
  if (h.responses.length < n) return false;
  return h.responses.slice(-n).every((r) => r === 'overruled_without_reason' || r === 'ignored' || r === 'punished');
}

export interface Objection {
  /** How much worse he thinks the head coach's choice is than his own, in win-probability share, by his own estimates. */
  readonly gap: number;
  /** True when the answer he prefers is his own system's (a high-ego coach pushes it, K6.3.2). */
  readonly ownSystem: boolean;
  /** True on the headset during a game, false in a meeting (H4). */
  readonly headset: boolean;
}

/** Chance he voices the objection. Zero only when there is no gap or the headset rule stops a second push. */
export function speakChance(m: StaffMember, h: CandorHistory, o: Objection): number {
  if (o.gap <= 0) return 0;
  if (o.headset && h.pushesThisSeries >= P('headset_pushes_per_series')) return 0;
  const ego = o.ownSystem ? 1 + P('candor_ego_push') * facetShare(m.facets.ego) : 1;
  const safety = clamp(h.safety, P('candor_safety_floor'), 1) * (dismissedRun(h) ? P('candor_dismissed_run_factor') : 1);
  const x = o.gap * ego * candorFactor(m) * safety;
  return x / (x + P('candor_threshold'));
}

export interface CandorOutcome {
  readonly staffId: number;
  readonly spoke: boolean;
  /** A memory row is written either way (K6.3.2 outputs): what he thought and whether he said it. */
  readonly memory: { readonly kind: 'objection_voiced' | 'objection_withheld'; readonly gap: number };
  readonly history: CandorHistory;
}

/** K6.3.2: he speaks or stays silent. One uniform. */
export function voice(m: StaffMember, h: CandorHistory, o: Objection, d: Draws): CandorOutcome {
  const spoke = d.uniform() < speakChance(m, h, o);
  const history = spoke && o.headset ? { ...h, pushesThisSeries: h.pushesThisSeries + 1 } : h;
  return { staffId: m.personId, spoke, memory: { kind: spoke ? 'objection_voiced' : 'objection_withheld', gap: o.gap }, history };
}

/** The head coach's response moves how safe he feels (K6.3.2, L4.3.3). */
export function respond(h: CandorHistory, r: CandorResponse): CandorHistory {
  const drop = r === 'punished' || r === 'ignored' || r === 'overruled_without_reason';
  const gain = r === 'accepted';
  const safety = drop ? h.safety * (1 - P('candor_safety_drop')) : gain ? h.safety + (1 - h.safety) * P('candor_safety_gain') : h.safety;
  return { ...h, safety: clamp(safety, P('candor_safety_floor'), 1), responses: [...h.responses, r] };
}

export function newSeries(h: CandorHistory): CandorHistory {
  return { ...h, pushesThisSeries: 0 };
}

/** L4.3.3: "no objections raised in N weeks", for the weekly staff summary. A staff that never objects is a warning sign. */
export function quietWeeks(voicedByWeek: readonly number[]): number {
  let n = 0;
  for (let i = voicedByWeek.length - 1; i >= 0 && voicedByWeek[i] === 0; i--) n++;
  return n;
}
