// Every place a relationship or morale value touches the simulation, each with a hard bound (L1.6.1,
// D12.5.1). This is the only door from this module into football: no channel changes physical ability and
// none changes a contest outcome directly, except the one D12.5.1 confidence penalty. With every multiplier
// at its neutral value (`NEUTRAL_EFFECTS`) the engine's output is unchanged. No momentum meter exists.
import { clamp, through3 } from './math.ts';
import { pp } from './params.ts';
import type { RelationshipRecord } from './record.ts';

/** `buy_in = 0.5 * trust + 0.3 * respect + 0.2 * role_belief`, 0 to 100 (L1.6.1). */
export function buyIn(r: Pick<RelationshipRecord, 'trust' | 'respect' | 'roleBelief'>): number {
  return clamp(pp('buyIn.trust') * r.trust + pp('buyIn.respect') * r.respect + pp('buyIn.roleBelief') * r.roleBelief, 0, 100);
}

/** The L1.6.1 channels. Game-day assignment discipline is owned by L3.4.1 at team level and is not here. */
export interface RelationshipEffects {
  /** Knowledge gain per rep in meetings (D9, H4). */
  readonly attention: number;
  /** Development gain and practice rep quality (D7, H3). */
  readonly practiceEffort: number;
  /** Points added to injury report propensity (H5, L1.4.2). */
  readonly reportShift: number;
  /** Size of the morale hit from a reduced role (D12). */
  readonly reducedRoleHit: number;
  /** Brings problems to the coach early (L9.1.3). */
  readonly earlyWord: number;
  /** Leak propensity (L6.3). */
  readonly leak: number;
}

export const NEUTRAL_EFFECTS: RelationshipEffects = { attention: 1, practiceEffort: 1, reportShift: 0, reducedRoleHit: 1, earlyWord: 1, leak: 1 };

/** The L1.6.1 table at a buy-in, linear through the points at 0, 50 and 100. */
export function relationshipEffects(b: number): RelationshipEffects {
  return {
    attention: through3(b, pp('effect.attention.at0'), 1, pp('effect.attention.at100')),
    practiceEffort: through3(b, pp('effect.effort.at0'), 1, pp('effect.effort.at100')),
    reportShift: through3(b, pp('effect.report.at0'), 0, pp('effect.report.at100')),
    reducedRoleHit: through3(b, pp('effect.reducedRole.at0'), 1, pp('effect.reducedRole.at100')),
    earlyWord: through3(b, pp('effect.earlyWord.at0'), 1, pp('effect.earlyWord.at100')),
    leak: through3(b, pp('effect.leak.at0'), 1, pp('effect.leak.at100')),
  };
}

/** The D12.5.1 multipliers. */
export interface MoraleEffects {
  /** Multiplies D7 development gains. */
  readonly development: number;
  /** Multiplies the K1 effort when a game is decided. */
  readonly decidedGameEffort: number;
  /** Execution-noise penalty on his main contest (J6): 0 or 0.02. */
  readonly confidencePenalty: number;
}

export const NEUTRAL_MORALE: MoraleEffects = { development: 1, decidedGameEffort: 1, confidencePenalty: 0 };

/**
 * D12.5.1: satisfaction below -40 multiplies development by 0.9, above +40 by 1.03; below -60 lowers effort
 * in a decided game a further 5 percent; losing most of his contests for 3 straight games carries a 2
 * percent execution-noise penalty until a winning game.
 */
export function moraleEffects(satisfaction: number, losingGamesInRow: number): MoraleEffects {
  const development = satisfaction < pp('morale.dev.lowBelow') ? pp('morale.dev.low') : satisfaction > pp('morale.dev.highAbove') ? pp('morale.dev.high') : 1;
  const decidedGameEffort = satisfaction < pp('morale.effort.below') ? 1 - pp('morale.effort.drop') : 1;
  const confidencePenalty = losingGamesInRow >= pp('morale.confidence.games') ? pp('morale.confidence.penalty') : 0;
  return { development, decidedGameEffort, confidencePenalty };
}

/**
 * Losing streak in contests for the confidence effect (D12.5.1): a game where he lost most of his contests
 * adds one; a winning game ends it. Nothing changes within a game.
 */
export function nextLosingStreak(streak: number, contestsWon: number, contestsLost: number): number {
  if (contestsWon + contestsLost === 0) return streak;
  return contestsLost > contestsWon ? streak + 1 : 0;
}

/** All bounds of L1.6.1 and D12.5.1, for the clamp property test and the tuning screen. */
export function effectBounds(): { readonly [K in keyof RelationshipEffects]: readonly [number, number] } {
  const span = (a: string, b: string): readonly [number, number] => { const x = pp(a); const y = pp(b); return [Math.min(x, y), Math.max(x, y)]; };
  return {
    attention: span('effect.attention.at0', 'effect.attention.at100'),
    practiceEffort: span('effect.effort.at0', 'effect.effort.at100'),
    reportShift: span('effect.report.at0', 'effect.report.at100'),
    reducedRoleHit: span('effect.reducedRole.at0', 'effect.reducedRole.at100'),
    earlyWord: span('effect.earlyWord.at0', 'effect.earlyWord.at100'),
    leak: span('effect.leak.at0', 'effect.leak.at100'),
  };
}
