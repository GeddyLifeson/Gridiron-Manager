// Saving the job (E4.6.1 owner meetings, conditions and commitments; E4.6.2 staff sacrifices). Every
// condition carries a test evaluable from saved data and a deadline. Confidence and the firing hazard are
// G-77's; this file returns the changes and multipliers for the world runner to apply.
import { clamp, param } from './params.ts';

export const CONDITION_KINDS = ['replace_coordinator', 'give_up_play_calling', 'give_up_authority', 'start_player', 'reach_result', 'change_team_rule'] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

export interface Condition {
  readonly id: number;
  readonly kind: ConditionKind;
  /** Person, seat or clause the condition names. */
  readonly targetId: number | null;
  /** Owner goal key the condition serves (G-77 GoalKey), whose weight doubles on failure. */
  readonly goal: string;
  /** Size by the goal weights, used for bargaining swaps. */
  readonly size: number;
  /** For reach_result: wins over games required by the deadline, as a share. */
  readonly threshold: number | null;
  readonly deadlineWeek: number;
  /** Takes authority away: public within weeks and costs player regard (rule 6). */
  readonly takesAuthority: boolean;
}

/** Saved facts a condition test reads. */
export interface ConditionFacts {
  readonly week: number;
  readonly releasedPersonIds: ReadonlySet<number>;
  readonly playCallerIsHeadCoach: boolean;
  readonly authorityHeld: ReadonlySet<number>;
  readonly startedPersonIds: ReadonlySet<number>;
  readonly winShare: number;
  readonly teamRuleChanged: ReadonlySet<number>;
}

export type TestResult = 'pending' | 'passed' | 'failed';

/** E4.6.1 acceptance: every condition has a test from saved data and a deadline. */
export function testCondition(c: Condition, f: ConditionFacts): TestResult {
  const t = c.targetId ?? -1;
  let ok: boolean;
  switch (c.kind) {
    case 'replace_coordinator': ok = f.releasedPersonIds.has(t); break;
    case 'give_up_play_calling': ok = !f.playCallerIsHeadCoach; break;
    case 'give_up_authority': ok = !f.authorityHeld.has(t); break;
    case 'start_player': ok = f.startedPersonIds.has(t); break;
    case 'reach_result': ok = f.winShare >= (c.threshold ?? 0.5); break;
    case 'change_team_rule': ok = f.teamRuleChanged.has(t); break;
  }
  if (ok) return 'passed';
  return f.week > c.deadlineWeek ? 'failed' : 'pending';
}

/** A condition may not require an act against league rules or the collective agreement (edge case). */
export function conditionAllowed(c: Condition, breaksLeagueRule: (c: Condition) => boolean): boolean {
  return !breaksLeagueRule(c);
}

export type MeetingAnswer = 'accept_all' | 'refuse';

export interface MeetingOutcome {
  readonly fired: boolean;
  readonly confidenceChange: number;
  /** Player regard change and the week by which the taken authority goes public (rule 6). */
  readonly playerRegard: number;
  readonly publicByWeek: number | null;
}

/** E4.6.1 rules 2, 4, 6. */
export function meeting(answer: MeetingAnswer, confidence: number, conditions: readonly Condition[], week: number): MeetingOutcome {
  if (answer === 'refuse') {
    if (confidence < param('cond.refuseFireBelow')) return { fired: true, confidenceChange: 0, playerRegard: 0, publicByWeek: null };
    return { fired: false, confidenceChange: param('cond.refuseConfidence'), playerRegard: 0, publicByWeek: null };
  }
  const authority = conditions.filter((c) => c.takesAuthority).length;
  return {
    fired: false,
    confidenceChange: param('cond.acceptConfidence'),
    playerRegard: authority * param('cond.playerRegard'),
    publicByWeek: authority > 0 ? week + param('cond.publicWeeks') : null,
  };
}

/** E4.6.1 rule 2: hazard multiplier at the next review (0.8 when every accepted test passed, else 1). */
export function nextReviewHazard(results: readonly TestResult[]): number {
  return results.length > 0 && results.every((r) => r === 'passed') ? param('cond.allPassedHazard') : 1;
}

/** E4.6.1 rule 2: a failed test doubles its goal's weight in the confidence table. Returns the multiplier per goal. */
export function failedGoalMultipliers(conds: readonly Condition[], results: readonly TestResult[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  conds.forEach((c, i) => { if (results[i] === 'failed') out[c.goal] = (out[c.goal] ?? 1) * param('cond.failedGoalWeight'); });
  return out;
}

/**
 * E4.6.1 rule 3: swap one condition for another of similar size. Chance from his relationship with the
 * owner (0..100) times how equal the sizes are. The caller draws the chance.
 */
export function bargainChance(relationship: number, offered: Condition, replaced: Condition): number {
  const big = Math.max(offered.size, replaced.size);
  const equal = big <= 0 ? 1 : 1 - Math.abs(offered.size - replaced.size) / big;
  return clamp(relationship / 100, 0, 1) * clamp(equal, 0, 1);
}

/** E4.6.1 rule 5: a written plan raises confidence 0 to 4 by the share of its claims the data supports; costs hours. */
export function planEffect(claimsSupported: number, claimsMade: number): { confidenceChange: number; hours: number } {
  const share = claimsMade <= 0 ? 0 : clamp(claimsSupported / claimsMade, 0, 1);
  return { confidenceChange: share * param('cond.planMax'), hours: param('cond.planHours') };
}

// ---------- staff sacrifices (E4.6.2) ----------

export interface SacrificeInput {
  /** His unit was in the bottom third of the league by the public measures the owner sees. */
  readonly unitBottomThird: boolean;
  /** Sacrifices already made this season. */
  readonly earlierThisSeason: number;
  /** How well liked the released coach was, 0 to 1 (staff relationship records). */
  readonly liked: number;
  readonly ownerRequired: boolean;
  /** Released coach's unit ranked above the head coach's own side of the ball. */
  readonly releasedRankedAboveOwnSide: boolean;
  readonly remainingStaffIds: readonly number[];
}

export interface SacrificeResult {
  readonly confidenceChange: number;
  /** Loyalty change for every remaining assistant (acceptance: one row each). */
  readonly loyalty: ReadonlyMap<number, number>;
  readonly peerRegard: number;
}

export function sacrifice(x: SacrificeInput): SacrificeResult {
  const confidenceChange = x.earlierThisSeason > 0 ? 0 : x.unitBottomThird ? param('sac.confidenceBottomThird') : param('sac.confidenceOther');
  const lo = param('sac.loyaltyMin'); const hi = param('sac.loyaltyMax');
  const severity = clamp(x.liked, 0, 1) * (x.unitBottomThird ? 0.5 : 1);
  let drop = lo + (hi - lo) * severity;
  if (x.ownerRequired) drop *= param('sac.ownerRequiredShare');
  const loyalty = new Map(x.remainingStaffIds.map((id) => [id, -drop] as const));
  return { confidenceChange, loyalty, peerRegard: x.releasedRankedAboveOwnSide ? param('sac.blameShiftPeers') : 0 };
}
