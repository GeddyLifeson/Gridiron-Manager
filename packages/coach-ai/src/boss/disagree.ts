// S4.4.1 disagreeing with the boss. The junior picks how; the boss decides whether to change his mind.
// Whatever happens, the advice is logged (N3), so later grading credits him for being right. The same
// rules run for an AI assistant disagreeing with the user as boss (L4, K6).
import type { Draws } from '../profile/index.ts';
import { B, chance, clamp, share } from './params.ts';
import type { Boss } from './types.ts';

export type DisagreeWay = 'comply' | 'private' | 'meeting' | 'around' | 'quiet';
export type DutyOwnership = 'own' | 'recommend' | 'observe';

export interface Disagreement {
  readonly workerId: number;
  readonly pointId: string;
  readonly way: DisagreeWay;
  /** Evidence strength 0 to 1 (sample sizes and grades behind his view). */
  readonly evidence: number;
  readonly trust: number;
  /** His ownership of the duty in question (quiet defiance is his right only on an Own duty). */
  readonly ownership: DutyOwnership;
  /** Going around: the head coach's trust in the junior and in the boss, 0 to 100. */
  readonly headCoachTrustInWorker?: number;
  readonly headCoachTrustInBoss?: number;
}

export interface DisagreeOutcome {
  readonly workerId: number;
  readonly pointId: string;
  readonly way: DisagreeWay;
  /** The boss (or head coach, going around) adopts the junior's view. */
  readonly changed: boolean;
  /** The junior's own way is what happens on the field (quiet defiance not stopped). */
  readonly ownWayRuns: boolean;
  readonly trustDelta: number;
  readonly relationshipDelta: number;
  /** Standing with the rest of the room (meeting). */
  readonly roomDelta: number;
  /** Going around leaves a permanent mark on the relationship (S4.4.1). */
  readonly permanentDamage: boolean;
  readonly insubordination: boolean;
  /** N3 row: what he advised, so later grading can credit him. Always written. */
  readonly logged: { readonly pointId: string; readonly advisedOwnView: boolean; readonly way: DisagreeWay };
}

/** Chance the boss changes his mind: evidence x trust, cut by ego when challenged in public. */
export function changeChance(boss: Boss, evidence: number, trust: number, publicly: boolean): number {
  const base = clamp(evidence, 0, 1) * clamp(trust / B('trust_max'), 0, 1);
  const cut = publicly ? 1 - B('ego_public_cut') * share(boss.facets.ego) : 1;
  return chance(base * cut);
}

/** Chance a boss notices quiet defiance: a demanding, detail-minded boss notices more. */
export function noticeChance(boss: Boss): number {
  return chance(B('quiet_notice_base') + B('quiet_notice_span') * share(boss.facets.standards));
}

export function disagree(boss: Boss, d: Disagreement, draws: Draws): DisagreeOutcome {
  const base = { workerId: d.workerId, pointId: d.pointId, way: d.way, logged: { pointId: d.pointId, advisedOwnView: d.way !== 'comply', way: d.way } };
  const none = { changed: false, ownWayRuns: false, trustDelta: 0, relationshipDelta: 0, roomDelta: 0, permanentDamage: false, insubordination: false };
  switch (d.way) {
    case 'comply': return { ...base, ...none };
    case 'private': {
      // Costs nothing with most bosses; the respect gain comes later, when film proves him right (provedRight).
      const changed = draws.uniform() < changeChance(boss, d.evidence, d.trust, false);
      return { ...base, ...none, changed, ownWayRuns: changed };
    }
    case 'meeting': {
      const changed = draws.uniform() < changeChance(boss, d.evidence, d.trust, true);
      return {
        ...base, ...none, changed, ownWayRuns: changed,
        relationshipDelta: -B('public_relationship_cost') * share(boss.facets.ego),
        roomDelta: B('public_room_gain') * clamp(d.evidence, 0, 1),
      };
    }
    case 'around': {
      const w = d.headCoachTrustInWorker ?? 0, b = d.headCoachTrustInBoss ?? B('trust_max');
      // Succeeds only if the head coach trusts the junior more than the boss; a chance, never certain (MA-52).
      const p = chance(w > b ? clamp(d.evidence, 0, 1) : 0);
      const changed = draws.uniform() < p;
      return { ...base, ...none, changed, ownWayRuns: changed, relationshipDelta: -B('around_relationship_cost'), permanentDamage: true };
    }
    case 'quiet': {
      if (d.ownership === 'own') return { ...base, ...none, ownWayRuns: true };
      if (d.ownership === 'observe') return { ...base, ...none };
      const caught = draws.uniform() < noticeChance(boss);
      return { ...base, ...none, ownWayRuns: !caught, insubordination: caught, trustDelta: caught ? -B('insubordination_trust_cost') : 0 };
    }
  }
}

/** Film later shows who was right. A private, evidence-based disagreement proved right gains respect (S4.4.1). */
export function provedRight(o: DisagreeOutcome, right: boolean): number {
  if (!right || o.way !== 'private') return 0;
  return B('private_respect_gain');
}

export type SafetyChoice = 'comply' | 'refuse' | 'report';

export interface SafetyOutcome {
  /** Complying is a rule-breaking act through L8.2.5 (G-28 compliance) with both coaches in the log. */
  readonly ruleBreak: { readonly actors: readonly number[]; readonly pointId: string } | null;
  readonly relationshipDelta: number;
  readonly reported: boolean;
}

/**
 * S4.4.1 edge case: a safety or rules issue (a hidden concussion, a recruiting violation he is told to
 * commit). The act, its detection and its penalty belong to compliance (G-28); this returns what to log.
 */
export function safetyIssue(boss: Boss, workerId: number, pointId: string, choice: SafetyChoice): SafetyOutcome {
  switch (choice) {
    case 'comply': return { ruleBreak: { actors: [boss.personId, workerId], pointId }, relationshipDelta: 0, reported: false };
    case 'refuse': return { ruleBreak: null, relationshipDelta: -B('public_relationship_cost') * share(boss.facets.ego), reported: false };
    case 'report': return { ruleBreak: null, relationshipDelta: -B('around_relationship_cost'), reported: true };
  }
}
