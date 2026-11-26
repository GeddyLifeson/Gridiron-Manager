// S4.2.1 the trust score: one number per boss for how far he relies on a junior (the user or an AI
// assistant alike, K6.5.2). It widens or narrows what the junior owns. The junior never sees the number,
// only its effects (perks below) and the boss's words.
import { B, chance, clamp, clampTrust, share } from './params.ts';
import type { Boss, GradeRecord } from './types.ts';

export type HiredHow = 'known' | 'stranger';

/**
 * Starting trust (S4.2.1): 20 to 50 by how he was hired. A known person starts higher; reputation (E5,
 * 0 to 100 as the hiring boss reads it) lifts it inside the band.
 */
export function initialTrust(how: HiredHow, reputation: number): number {
  const base = how === 'known' ? B('trust_start_known') : B('trust_start_stranger');
  return clamp(base + B('trust_start_reputation_span') * share(reputation), B('trust_start_stranger'), 50);
}

/**
 * Trust under a new boss (S4.2.1 edge case): reset to a value seeded by reputation and the old boss's
 * recommendation. `reference` is the old boss's reference strength, -1 (warns off) to +1 (strong), or null.
 */
export function trustUnderNewBoss(how: HiredHow, reputation: number, reference: number | null): number {
  const ref = reference === null ? 0 : clamp(reference, -1, 1);
  return clamp(initialTrust(how, reputation) + B('trust_reference_span') * ref, B('trust_min'), 50 + B('trust_reference_span'));
}

/** One graded product: move toward its grade with a small step; late or missing work moves down with a large step. */
export function trustAfterRecord(trust: number, r: GradeRecord): number {
  if (r.missing) return clampTrust(trust - B('trust_missing_step'));
  let t = trust;
  const g = r.bossScore ?? r.score;
  if (g !== null) t += B('trust_step') * (g - t);
  if (!r.onTime) t -= B('trust_late_step');
  return clampTrust(t);
}

/** Apply a season's (or week's) records in order. */
export function trustAfterRecords(trust: number, records: readonly GradeRecord[]): number {
  let t = trust;
  for (const r of records) t = trustAfterRecord(t, r);
  return t;
}

/** A recommendation the boss rejected that film later proved right (S4.2.1). Wrong ones cost nothing beyond the grade. */
export function trustAfterReview(trust: number, rejectedButRight: boolean): number {
  return rejectedButRight ? clampTrust(trust + B('trust_proved_right_step')) : trust;
}

/** Threshold shift by delegation: a high-delegation boss widens ownership sooner (S4.2.1). */
export function delegationShift(boss: Boss): number {
  return B('delegation_shift') * (2 * share(boss.facets.delegation) - 1);
}

export interface TrustPerks {
  /** 40: his products are used with light edits. */
  readonly lightEdits: boolean;
  /** 60: Recommend duties are accepted by default. */
  readonly recommendAccepted: boolean;
  /** 75: he is given one duty from the next rung up. */
  readonly nextRungDuty: boolean;
  /** 90: the boss names him as his choice for the next opening. */
  readonly namedForOpening: boolean;
}

export function perks(boss: Boss, trust: number): TrustPerks {
  const t = trust + delegationShift(boss);
  return {
    lightEdits: t >= B('trust_light_edits'),
    recommendAccepted: t >= B('trust_recommend_default'),
    nextRungDuty: t >= B('trust_next_rung_duty'),
    namedForOpening: t >= B('trust_named_for_opening'),
  };
}

/** How the boss uses an Own or Recommend product, from trust (S4.2.1: edited less as trust grows). */
export function usedAs(boss: Boss, trust: number, accepted: boolean): 'unchanged' | 'edited' | 'replaced' {
  if (!accepted) return 'replaced';
  return perks(boss, trust).lightEdits ? 'unchanged' : 'edited';
}

/**
 * K6.5.1 rule 4: chance the boss accepts a suggestion. It rises with trust and with how well the
 * suggestion scores in his own estimates (`ownScore`, 0 to 1). At the 60 threshold he accepts by default
 * unless his own estimate is against it.
 */
export function acceptChance(boss: Boss, trust: number, ownScore: number): number {
  const w = B('suggest_trust_weight');
  const t = clamp((trust + delegationShift(boss)) / B('trust_max'), 0, 1);
  const s = clamp(ownScore, 0, 1);
  const base = w * t + (1 - w) * s;
  const lift = perks(boss, trust).recommendAccepted ? (1 - base) * s : 0;
  return chance(base + lift);
}
