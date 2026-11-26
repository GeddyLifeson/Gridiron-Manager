// Shutting a player down and timing surgery (D11.6.3, H5.3.3). The player decides about surgery with the
// physician; the coach decides use and may ask (asking to delay surgery is pressure, D11.3.3); the holder
// of roster say decides any list move.
import { possible, type RandomStream } from '@gm/schema';
import { P } from './params.ts';
import { surgeryOption } from './catalogue.ts';

export interface ShutdownOption {
  readonly path: 'non_operative' | 'operative';
  /** Chance of worsening per game played (non-operative only). */
  readonly worsenPerGame: number;
  /** Return day for the operative path (surgery date plus the row's months); null for playing through. */
  readonly returnDay: number | null;
  readonly factId: string | null;
}

/** Return day after surgery on `surgeryDay`: earlier surgery returns earlier by exactly the difference. */
export function surgeryReturnDay(surgeryDay: number, operativeMonths: number): number {
  return surgeryDay + Math.round(operativeMonths * P('daysPerMonth'));
}

/** Both paths with dates for a `surgery_optional` row, or none. */
export function shutdownOptions(typeId: string, today: number): ShutdownOption[] {
  const s = surgeryOption(typeId);
  if (!s) return [];
  return [
    { path: 'non_operative', worsenPerGame: P('nonOpWorsenPerGame'), returnDay: null, factId: null },
    { path: 'operative', worsenPerGame: 0, returnDay: surgeryReturnDay(today, s.operativeMonths), factId: s.factId },
  ];
}

/** One game played on the non-operative path: did it worsen (then the operative timeline runs from today)? */
export function worsensThisGame(s: RandomStream): boolean {
  return s.chance(possible(P('nonOpWorsenPerGame')));
}

export interface PlayerSituation {
  readonly contractYear: boolean;
  /** 0 to 1: share of his money that is guaranteed. */
  readonly guaranteedShare: number;
  readonly toughness: number;
  readonly trustInCoach: number;
  readonly gamesLeft: number;
}

/** Chance of worsening over the games left if he plays on. */
export function worsenRisk(gamesLeft: number): number {
  let keep = 1;
  for (let i = 0; i < gamesLeft; i++) keep *= 1 - P('nonOpWorsenPerGame');
  return 1 - keep;
}

/**
 * The player's choice (D11.6.3 rules 2 and 3, H5.3.3): his health always carries the largest weight; a
 * contract year and toughness pull toward playing, guaranteed money toward surgery; the coach's request
 * counts by trust. Returns true for surgery now.
 */
export function choosesSurgery(p: PlayerSituation, coachAsks: 'play' | 'surgery' | null, s: RandomStream): boolean {
  const coach = coachAsks === null ? 0 : (coachAsks === 'surgery' ? 1 : -1) * P('choiceCoachWeight') * p.trustInCoach;
  const lean = P('choiceHealthWeight') * worsenRisk(p.gamesLeft)
    + P('choiceGuaranteedWeight') * p.guaranteedShare
    - P('choiceContractYearWeight') * (p.contractYear ? 1 : 0)
    - P('choiceToughnessWeight') * p.toughness
    + coach
    + P('choiceNoise') * s.normal();
  return lean > 0;
}
