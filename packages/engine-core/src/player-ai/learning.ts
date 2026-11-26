// K1.4.1 matchup learning within a game. One memory per game, held by the caller and handed to the
// player AI each play. A pair's counts hold only what the observer met in his own contests with that
// opponent, so reading them is reading his own experience (K1.6.1).
import type { ContestType } from '@gm/schema';
import { clip, issZ } from './formulas.ts';
import type { PlayerAiParams } from './params.ts';

interface Pair { total: number; readonly counts: Map<string, number> }

export class MatchupMemory {
  private readonly pairs = new Map<string, Pair>();

  private static key(observerId: number, opponentId: number, type: ContestType): string { return `${observerId}:${opponentId}:${type}`; }

  /** The observer met `technique` from this opponent once (or `weight` times: a film-study prior, H2.3.3). */
  record(observerId: number, opponentId: number, type: ContestType, technique: string, weight = 1): void {
    const k = MatchupMemory.key(observerId, opponentId, type);
    let pair = this.pairs.get(k);
    if (pair === undefined) { pair = { total: 0, counts: new Map() }; this.pairs.set(k, pair); }
    pair.total += weight;
    pair.counts.set(technique, (pair.counts.get(technique) ?? 0) + weight);
  }

  reps(observerId: number, opponentId: number, type: ContestType): number {
    return this.pairs.get(MatchupMemory.key(observerId, opponentId, type))?.total ?? 0;
  }

  /**
   * Rule 1: the z bonus the observer has against `technique`. Positive against the opponent's
   * most-used technique, negative against the others. The leaf writes the size as `b * share * g(n)`.
   * Here `share` is the LEAD of the most-used technique over the next one (its share minus the
   * runner-up's): for an opponent who uses one move it is the leaf's formula exactly, and for one who
   * alternates two it is near zero, which rule 2 and the acceptance test require ("a player who
   * varies gives little away"). With the plain share an alternating rusher would gain every other
   * rep. This reading is listed in the WP report. A substitute has no read (edge case).
   */
  read(observerId: number, opponentId: number, type: ContestType, technique: string, footballIntelligence: number, p: PlayerAiParams): number {
    const pair = this.pairs.get(MatchupMemory.key(observerId, opponentId, type));
    if (pair === undefined || pair.total <= 0) return 0;
    let top = '', topCount = 0, second = 0;
    for (const [name, count] of pair.counts) {
      if (count > topCount) { second = topCount; top = name; topCount = count; } else if (count > second) second = count;
    }
    const b = p.learnMax * clip(p.learnIqBase + p.learnIqPerZ * issZ(footballIntelligence), 0, 1);
    const size = b * ((topCount - second) / pair.total) * (pair.total / (pair.total + p.learnHalfReps));
    return technique === top ? size : -size * p.learnOthersFrac;
  }

  /** The strongest read he has on this opponent: what feeds his confidence to sit on something (K1.3.1 inputs). */
  strongest(observerId: number, opponentId: number, type: ContestType, footballIntelligence: number, p: PlayerAiParams): number {
    const pair = this.pairs.get(MatchupMemory.key(observerId, opponentId, type));
    if (pair === undefined) return 0;
    let best = 0;
    for (const name of pair.counts.keys()) { const r = this.read(observerId, opponentId, type, name, footballIntelligence, p); if (r > best) best = r; }
    return best;
  }

  /** Rule 3: the memory that starts the next meeting of these teams in the season, through film. */
  carryOver(p: PlayerAiParams): MatchupMemory {
    const next = new MatchupMemory();
    for (const [k, pair] of this.pairs) {
      const counts = new Map<string, number>();
      for (const [name, count] of pair.counts) counts.set(name, count * p.learnCarry);
      next.pairs.set(k, { total: pair.total * p.learnCarry, counts });
    }
    return next;
  }
}
