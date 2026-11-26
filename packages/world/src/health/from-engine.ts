// The bridge a game port uses to report injuries (GamePlayed.injuries): the engine's J10.6.1 `injury` truth
// events, with each engine player id mapped to the world person who played in that slot. A port whose
// rosters are not world people (the placeholder rosters of today's real game) has no such map and must
// leave `injuries` absent rather than guess who was hurt.
import type { GameInjury } from '../loop/types.ts';

/** The world person and team behind one engine player id of a game. */
export interface EnginePlayer { readonly personId: number; readonly teamId: number }

/** Only the fields of an engine truth event this reads; other event types are skipped. */
interface TruthLike {
  readonly type: string;
  readonly playerId?: number; readonly mechanism?: string; readonly region?: string; readonly severitySeed?: number; readonly headImpact?: boolean;
}

/**
 * Injury events of one game, in event order. `missedConcussions` holds engine player ids whose true
 * concussion the in-game evaluation did not find (J10.7.2 record). An injured player the map does not
 * know is an error: the port built the rosters and must know every player in them.
 */
export function injuriesFromTruth(
  events: readonly TruthLike[], playerOf: (enginePlayerId: number) => EnginePlayer | undefined, missedConcussions: ReadonlySet<number> = new Set(),
): GameInjury[] {
  const out: GameInjury[] = [];
  for (const e of events) {
    if (e.type !== 'injury') continue;
    const id = e.playerId!;
    const who = playerOf(id);
    if (!who) throw new Error(`injury report: engine player ${id} has no world person`);
    out.push({
      personId: who.personId, teamId: who.teamId, mechanism: e.mechanism!, region: e.region!, severitySeed: e.severitySeed!,
      headImpact: e.headImpact === true, evaluationMissed: e.headImpact === true && missedConcussions.has(id),
    });
  }
  return out;
}
