// The reference resolver (J1.6.3, J14.1.2; build plan WP-08): a simple outcome model behind the one
// `Resolver` interface. It classifies the two calls into families, draws the result from league rates
// with a small rating shift, and writes the same truth events the tick engine will write.
//
// It exists so the game state machine, officiating and the season loop can be built before the tick
// engine, and afterwards as a cross-check. It cannot simulate a drawn play on its merits, so its results
// may never be saved into a career: `mayProduceSavedResults` is false and J14.1.2 has no exception.
//
// Purity (J13, P1.1.1): every draw comes from the `resolver` stream of the play (game, play) in the
// input, every transcendental from the input's math, every number from the input's parameter table.
import type { PlayerDelta, PlayInput, PlayResult, PlayTruth, Resolver, TruthEvent } from '@gm/schema';
import { configFor } from './config.ts';
import { Ctx } from './context.ts';
import { liveFouls, preSnapFoul } from './fouls.ts';
import { resolveKick } from './kicks.ts';
import { REFERENCE_RESOLVER_VERSION } from './params.ts';
import { resolveScrimmage } from './scrimmage.ts';

export { PARAMS, RULE_KEYS, FOUL_ROWS, REFERENCE_RESOLVER_VERSION, referenceParamTable } from './params.ts';
export type { FoulRow, FoulWindow } from './params.ts';

/** Sort rank inside one timestamp: play events, then the dead ball, then fouls after the play. */
function rank(e: TruthEvent): number {
  if (e.type === 'dead_ball') return 1;
  if (e.type === 'foul_committed' && e.timing === 'dead_ball') return 2;
  return 0;
}

export function simulateReferencePlay(input: PlayInput): PlayResult {
  const cfg = configFor(input.params, input.math);
  const c = new Ctx(input, cfg);
  const call = input.calls.snapping;
  // Plays that start with a snap can be killed by a foul before it. Free kicks have no such draw.
  const snapped = call.unit === 'offense' || call.kickKind === 'punt' || call.kickKind === 'field_goal' || call.kickKind === 'try_kick';
  if (!(snapped && preSnapFoul(c))) {
    if (call.unit === 'offense') resolveScrimmage(c, call); else resolveKick(c, call);
    liveFouls(c);
  }
  // Order by time; the events were appended in order within each timestamp, and the sort is stable.
  const order = c.events.map((e, i) => ({ e, i }));
  order.sort((a, b) => (a.e.t - b.e.t) || (rank(a.e) - rank(b.e)) || (a.i - b.i));
  const liveDurationTenths = c.live ? Math.max(0, Math.round(c.deadT * 10)) : 0;
  const s = input.situation;
  const truth: PlayTruth = {
    resolverId: 'reference', resolverVersion: REFERENCE_RESOLVER_VERSION,
    gameId: s.gameId, playNumber: s.playNumber,
    originX: s.ballX, originY: s.ballY, attackDir: s.attackDir,
    liveDurationTenths,
    endZoneImpetus: c.endZoneImpetus,
    events: order.map((o) => o.e),
  };
  // The resolver has no movement, so the cost of a play is one flat value per player on the field.
  const deltas: PlayerDelta[] = [];
  const energy = c.live ? cfg.energyPerPlay : 0;
  for (const id of c.snapIds) deltas.push({ playerId: id, energyCost: energy, hitLoad: 0, onField: true });
  for (const id of c.oppIds) deltas.push({ playerId: id, energyCost: energy, hitLoad: 0, onField: true });
  return { truth, deltas, liveDurationTenths, trajectory: null, explain: null };
}

/** The reference resolver. Stateless: one shared instance serves every game. */
export const REFERENCE_RESOLVER: Resolver = {
  id: 'reference',
  version: REFERENCE_RESOLVER_VERSION,
  mayProduceSavedResults: false,
  simulatePlay: simulateReferencePlay,
};

export function createReferenceResolver(): Resolver { return REFERENCE_RESOLVER; }
