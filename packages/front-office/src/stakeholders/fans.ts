// K8.8.1 fan mood: one value per team's public. The coaching-hire hope term is kept apart from the mood
// J12 reads for crowd noise, so no game outcome is keyed to a coaching change (E4.3.5). No mood term
// changes player contests beyond what J12 gives crowd noise.
import { P } from './params.ts';
import { clamp, halfLifeFactor } from './mathx.ts';
import { react, type GameReading, type Result } from './reaction.ts';
import type { Observer } from './types.ts';

export interface FanState {
  readonly teamId: number;
  /** Running mean of reactions (half-life 5 games), in reaction units. */
  readonly running: number;
  /** Hope after a coaching hire, mood points; fades by games played. Never read by J12. */
  readonly hireHope: number;
  /** Size of the fan base, index (new teams start small). */
  readonly base: number;
}

export function fanObserver(teamId: number): Observer {
  return { id: `fans:${teamId}`, outcomeBias: 1, rivalryWeight: P('fans.rivalryWeight') };
}

/** Edge case: a generated team with a new city or school name starts at neutral with a small base. */
export function newFanBase(teamId: number, established: boolean): FanState {
  return { teamId, running: 0, hireHope: 0, base: established ? P('conf.max') : P('fans.newTeamBase') };
}

/** Mood without the hire term: the only value J12 reads for crowd noise. */
export function noiseMood(s: FanState): number {
  return clamp(P('conf.mood.neutral') + P('fans.reactionToMood') * s.running / P('conf.result.size'), 0, P('conf.max'));
}

/** `fanMood` (0 to 100) as K8.3.1, K8.5.1, T4 and K7.4.2 read it: noise mood plus hope. */
export function fanMood(s: FanState): number {
  return clamp(noiseMood(s) + s.hireHope, 0, P('conf.max'));
}

/** One game: mood moves toward the running mean of reactions at full outcome bias; hope fades a game. */
export function fansAfterGame(s: FanState, game: GameReading, recent: readonly Result[]): FanState {
  const keep = halfLifeFactor(P('fans.halfLifeGames'));
  const r = react(fanObserver(s.teamId), game, recent).total;
  return { ...s, running: s.running * keep + r * (1 - keep), hireHope: s.hireHope * halfLifeFactor(P('fans.hireHopeHalfLifeGames')) };
}

/** Stars acquired (+1) or lost (-1): a step in the running mean. */
export function fansAfterStarMove(s: FanState, direction: number): FanState {
  return { ...s, running: s.running + direction * P('fans.starMove') * P('conf.result.size') / P('fans.reactionToMood') };
}

/** Offseason: mood holds, pulled 25% of the way to neutral; a coaching hire adds hope (good news to fans, whether or not it is). */
export function fansOffseason(s: FanState, coachHired: boolean): FanState {
  return { ...s, running: s.running * (1 - P('fans.offseasonHope')), hireHope: coachHired ? P('fans.hireHope') : s.hireHope };
}
