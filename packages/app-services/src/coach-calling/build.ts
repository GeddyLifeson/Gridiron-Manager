// From a sheet call to the engine's call object (I2.3.1, G2.1.1, J11.6.1). The family fields the resolver and
// the scout read (kind, personnel, formation, run direction, coverage family, rushers, box count) are copied
// from the content; the players are whoever the depth chart sends (the host's `LineupFor`, I6). The tempo is
// set by the K4 port after the call is chosen.
import type { calling, staff } from '@gm/coach-ai';
import type { DefenseCall, OffenseCall } from '@gm/schema';
import type { LineupFor } from '../commands/game-calling/decision.ts';
import type { ContentBook } from './content.ts';

type PlayDef = ContentBook['plays'] extends ReadonlyMap<string, infer P> ? P : never;
type DefenseDef = ContentBook['defense'] extends ReadonlyMap<string, infer D> ? D : never;

/** The offensive call object for a play, players filled by the lineup for its personnel group. */
export function offenseCall(play: PlayDef, lineup: LineupFor): OffenseCall {
  return {
    unit: 'offense', playContentId: play.id, contentHash: null, kind: play.kind, personnelCode: play.personnel,
    formationId: play.formationId, strength: null, motionId: null, protectionId: null, tags: [],
    // A run with no called side ("dir: any") is sent to the middle, as the flow default run is (engine-game flow/defaults.ts).
    runDirection: play.kind === 'run' ? play.runDirection ?? 'middle' : play.runDirection,
    shotgun: play.shotgun, tempo: 'huddle', players: lineup('offense', play.personnel),
  };
}

/** The defensive call object for a content call, players filled by the lineup for the defense. */
export function defenseCall(def: DefenseDef, lineup: LineupFor): DefenseCall {
  return {
    unit: 'defense', callContentId: def.id, contentHash: null, packageId: def.package, frontId: null, coverageId: def.id, pressureId: null,
    coverageFamily: def.coverageFamily, rushers: def.rushers, boxCount: def.boxCount, players: lineup('defense', null),
  };
}

/**
 * The port's `build` hook: the engine call for a sheet call, or null when the id is not in the book or is on
 * the wrong side of the ball (an offensive caller is never handed a defensive call, K4.1.1 rule 3).
 */
export function contentBuilder(book: ContentBook, lineupFor: (view: staff.DecisionView) => LineupFor): calling.CallerPortConfig['build'] {
  return (call, view, side) => {
    if (side === 'offense') { const p = book.plays.get(call.callId); return p ? offenseCall(p, lineupFor(view)) : null; }
    const d = book.defense.get(call.callId);
    return d ? defenseCall(d, lineupFor(view)) : null;
  };
}
