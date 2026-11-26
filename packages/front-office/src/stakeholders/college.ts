// K8.5.1 the college chain of pressure: the athletic director decides (his record is a DecisionMaker
// profile run through the same K8.1 to K8.4 code), a president above him can force or veto a firing,
// and boosters whose money carries a voice. Booster group records, giving, buyout funding and booster
// pay acts live in career/src/college-program (G-38); front-office may not import career (P1.2.1), so the
// world runner hands their state in and this file supplies the reaction side.
import { P } from './params.ts';
import { clamp } from './mathx.ts';
import { react, type GameReading, type Result } from './reaction.ts';
import type { Observer } from './types.ts';

/** A booster group as an observer: full outcome bias (rule 1), extra weight on rivalry. */
export function boosterObserver(groupId: number): Observer {
  return { id: `booster:${groupId}`, outcomeBias: 1, rivalryWeight: P('college.booster.rivalryWeight') };
}

export interface BoosterWeek {
  readonly games: readonly { readonly reading: GameReading; readonly recent: readonly Result[] }[];
  /** Recruits this group cares about: +1 signed with us, -1 lost to another program, per recruit. */
  readonly petRecruits: readonly number[];
  /** H7 obligations to this group kept (true) or missed (false) this week. */
  readonly obligations: readonly boolean[];
}

/**
 * Rule 1: booster mood from reactions at full outcome bias, extra weight on rivalry and recruits they care
 * about, and the coach's attention to them. Returns the mood change in points (0 to 100 scale).
 */
export function boosterMoodChange(groupId: number, w: BoosterWeek): number {
  const obs = boosterObserver(groupId);
  const fromGames = w.games.reduce((s, g) => s + react(obs, g.reading, g.recent).total, 0) * P('college.booster.perReaction') / P('conf.result.size');
  const fromRecruits = w.petRecruits.reduce((s, r) => s + r, 0) * P('college.booster.recruitWeight');
  const fromAttention = w.obligations.reduce((s, kept) => s + (kept ? P('college.booster.attentionGain') : -P('college.booster.neglectCost')), 0);
  return fromGames + fromRecruits + fromAttention;
}

export function applyBoosterMood(mood: number, change: number): number {
  return clamp(mood + change, 0, P('conf.max'));
}

/**
 * Rule 2: giving index for next year's budget (1 = this group's usual share). Losing costs money, which
 * costs players: the budget module (G-38 `nextYearBudget`) multiplies by this within T7 rules.
 */
export function givingIndex(mood: number): number {
  return Math.max(0, 1 + P('college.booster.givingSlope') * (mood - P('conf.mood.neutral')));
}

export interface PresidentView {
  /** Weight on clean program and academics, 0 to 1 (T5.3.1). */
  readonly cleanProgramWeight: number;
  readonly academicsWeight: number;
}

/**
 * Rule 4: the president can force a firing after a detected violation or an academic failure regardless of
 * record. Deterministic threshold on his weights: the higher his weight, the smaller the finding it takes.
 */
export function presidentForcesFiring(p: PresidentView, detectedMajorViolation: boolean, academicFailure: boolean): boolean {
  return (detectedMajorViolation && p.cleanProgramWeight >= P('college.president.forceFrom')) || (academicFailure && p.academicsWeight >= P('college.president.forceFrom'));
}
