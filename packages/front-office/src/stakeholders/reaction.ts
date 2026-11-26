// K8.2.1 reactions to results, including noise. Every observer (decider, outlet, booster group, fans)
// runs this one function on what the public saw. No input can carry a true win probability, a luck
// measure or a hidden rating (rule 4); `pPublic` is the public pregame model (N2), not the engine's truth.
import { P } from './params.ts';
import type { Observer } from './types.ts';

export type GameStage = 'regular' | 'marquee' | 'postseason';
export type Result = 'W' | 'L' | 'T';

/** A visible decision the broadcast and media saw (fourth-down go, two-point try, timeout use). */
export interface VisibleDecision {
  readonly id: string;
  /** Unconventional by the public's yardstick (the league's usual call), not by the engine's truth. */
  readonly unconventional: boolean;
  readonly succeeded: boolean;
}

/** One game as the public saw it. */
export interface GameReading {
  readonly gameId: number;
  readonly result: Result;
  /** Public pregame win probability (N2 public model), 0 to 1. */
  readonly pPublic: number;
  /** Points for minus points against. */
  readonly margin: number;
  /** E4.2.2 game weight: marquee is a rivalry game, a national broadcast or a game the owner named. */
  readonly stage: GameStage;
  readonly rivalry: boolean;
  /** K8.2.1 edge case: the starting quarterback's injury was public and before or early in the game. */
  readonly starterQbOutPublicEarly: boolean;
  /** E4.2.2 injury allowance: games lost by starters to injury are in the league's top quarter. */
  readonly injuryAllowance: boolean;
  readonly decisions: readonly VisibleDecision[];
}

export interface ReactionTerm {
  readonly term: 'result' | 'margin' | 'decision';
  readonly value: number;
  readonly ref: string;
}

export interface Reaction {
  readonly observerId: string;
  readonly gameId: number;
  readonly total: number;
  readonly terms: readonly ReactionTerm[];
}

/** E4.2.2 result against expectation: win +6(1 - p), loss -6p, a tie half of each. */
export function resultTerm(result: Result, pPublic: number): number {
  const size = P('conf.result.size');
  const win = size * (1 - pPublic);
  const loss = -size * pPublic;
  return result === 'W' ? win : result === 'L' ? loss : (win + loss) / 2;
}

/** E4.2.2 margin: losing by 21 or more costs 2 extra, winning by 21 or more adds 1. */
export function marginTerm(margin: number): number {
  const b = P('conf.margin.blowout');
  if (margin <= -b) return P('conf.margin.lossExtra');
  if (margin >= b) return P('conf.margin.winExtra');
  return 0;
}

export function stageWeight(stage: GameStage): number {
  return stage === 'postseason' ? P('conf.weight.postseason') : stage === 'marquee' ? P('conf.weight.marquee') : 1;
}

/** K8.2.1 rule 5: three straight results in one direction (this game included) are over-read. */
export function streakMultiplier(recent: readonly Result[], current: Result): number {
  const n = P('react.streakLength');
  if (current === 'T') return 1;
  const run = [...recent.slice(-(n - 1)), current];
  return run.length >= n && run.every((r) => r === current) ? P('react.streakMultiplier') : 1;
}

/**
 * K8.2.1 rules 2 and 3: outcome-biased judgment of one visible decision. An unconventional decision that
 * fails is judged at full weight, one that succeeds at half, a conventional failure barely noticed, and a
 * conventional success not at all. The observer's `outcomeBias` (0.2 to 1.0) scales the whole judgment,
 * which narrows the gap between the success and failure versions for process-minded observers.
 */
export function judgeDecision(d: VisibleDecision, outcomeBias: number): number {
  const size = P('react.decisionSize');
  let w = 0;
  if (d.unconventional) w = d.succeeded ? P('react.unconventionalSuccessWeight') : -P('react.unconventionalFailWeight');
  else if (!d.succeeded) w = -P('react.conventionalFailWeight');
  const v = size * w * outcomeBias;
  const cap = P('react.decisionSizeMax');
  return v < -cap ? -cap : v > cap ? cap : v;
}

/** K8.2.1 rules 1 to 5 and the edge case. `recent` is this team's earlier results, oldest first. */
export function react(observer: Observer, game: GameReading, recent: readonly Result[]): Reaction {
  let weight = stageWeight(game.stage) * streakMultiplier(recent, game.result);
  if (game.rivalry) weight *= observer.rivalryWeight;
  let result = resultTerm(game.result, game.pPublic);
  let margin = marginTerm(game.margin);
  if (game.result === 'L') {
    let lossKeep = 1;
    if (game.starterQbOutPublicEarly) lossKeep *= 1 - P('react.qbInjuryDiscount');
    if (game.injuryAllowance) lossKeep *= 1 - P('conf.injury.discount');
    result *= lossKeep;
    margin *= lossKeep;
  }
  const terms: ReactionTerm[] = [
    { term: 'result', value: result * weight, ref: `game:${game.gameId}` },
    { term: 'margin', value: margin * weight, ref: `game:${game.gameId}` },
    ...game.decisions.map((d) => ({ term: 'decision' as const, value: judgeDecision(d, observer.outcomeBias), ref: `decision:${d.id}` })),
  ];
  return { observerId: observer.id, gameId: game.gameId, total: terms.reduce((s, t) => s + t.value, 0), terms };
}
