// L5.4.2 president and board, L5.4.3 boosters and donor groups, L5.4.6 donor share of a buyout, T9.1.1
// rules 2 and 3. The athletic director himself runs through owner.ts (L5.4.1: L5.1.1 to L5.1.5 apply with
// him as the main actor) and his roster authority is the program default in power.ts.
import type { RandomStream } from '@gm/schema';
import { param } from './params.ts';
import type { BossProfile } from './profile.ts';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** L5.4.2: chance the president backs the coach on a case = 0.5 + 0.4 x (football priority - academic strictness), 0.1 to 0.9. */
export function presidentBacksChance(president: BossProfile): number {
  const w = president.weights;
  return clamp(param('president.backBase') + param('president.backSlope') * (w.footballPriority - w.academicStrictness), param('president.backMin'), param('president.backMax'));
}

export function presidentRules(president: BossProfile, stream: RandomStream): 'backs_coach' | 'rules_against' {
  return stream.chance(presidentBacksChance(president)) ? 'backs_coach' : 'rules_against';
}

/** L5.4.2: the board or its delegate approves head coach contracts and buyouts at or above the threshold. */
export function needsBoardApproval(totalValueUsd: number): boolean {
  return totalValueUsd >= param('board.approvalUsd');
}

/** T9.1.1 rule 2: chance the president steps in on a firing, hire or scandal; rises with buyout and any compliance case. */
export function presidentInvolvementChance(buyoutUsd: number, complianceCase: boolean): number {
  return clamp(param('president.involveBase') + param('president.involvePerTenMillion') * buyoutUsd / param('deadMoney.carryUsdUnit')
    + (complianceCase ? param('president.involveCompliance') : 0), 0, 1);
}

/** T9.1.1 rule 3: a new athletic director did not hire the coach; E4 applies the patience reset. */
export function newAdResetsPatience(adHiredCoach: boolean): boolean {
  return !adHiredCoach;
}

// ---- L5.4.3 booster mood -------------------------------------------------------------------------------

/** `booster_mood` 0 to 100 moves only through results against expectation, rivalry games and access (acceptance). */
export type BoosterInput =
  | { readonly kind: 'game'; readonly resultVsExpectation: number; readonly rivalry: boolean }
  | { readonly kind: 'access'; readonly eventsGivenThisSeason: number };

export function boosterMoodAfter(mood: number, input: BoosterInput): number {
  if (input.kind === 'game') {
    const w = input.rivalry ? param('booster.rivalryWeight') : 1;
    return clamp(mood + param('booster.resultStep') * w * clamp(input.resultVsExpectation, -1, 1), 0, 100);
  }
  // Diminishing returns on time given (T9.3.1 rule 2): the step halves after `accessHalfAfter` events.
  const half = param('booster.accessHalfAfter');
  const step = param('booster.accessStep') * half / (half + Math.max(0, input.eventsGivenThisSeason));
  return clamp(mood + step, 0, 100);
}

/**
 * L5.4.6: the share of a buyout a donor group may pay, 0 to 50%, larger for an unhappy mood and a big donor
 * base (T9.3.1 rule 3: a wealthy, unhappy group can fund a buyout). `donorBase` 0 to 1 from the school profile.
 */
export function donorBuyoutShare(mood: number, donorBase: number): number {
  return param('booster.buyoutShareMax') * clamp(donorBase, 0, 1) * (1 - clamp(mood, 0, 100) / 100);
}
