// Dead-ball detection for everything no stage module ends itself (J11.3.1). Registered last among the
// detect stages, so it sees this tick's boundary events and ball contacts. It reports physical facts
// only: which rule result follows (touchdown, touchback, safety, turnover on downs) is officiating's.
//
// Ends the play, earliest interpolated time first, when:
//   - the ball in a runner's possession goes out of bounds (B3.2.1 e) or a loose ball does (q);
//   - the ball in possession crosses the goal line its carrier attacks;
//   - a forward pass reaches the ground (g);
//   - a loose ball has come to rest (i).
// A tackle, a kneel, a slide, a sack, forward progress and the kick results are ended by the modules
// that own those acts (carrier, quarterback, kick operation). Kicks dead by rule alone (a kickoff
// short of the landing zone, an untouched kick in the end zone) are NOT built: until they are, such a
// ball is live until it rests or leaves the field, and the handoff says so.
import { SLOT_COUNT, TICK_S, roundSimS, roundYd, type DeadBallReason, type TickWorld } from '@gm/schema';
import { ballFlight } from '../ball/index.ts';
import type { PlayStage } from '../tick/loop.ts';

/** Ends the play. The one place the assembly's own stages write the whistle; every caller passes interpolated time. */
export function declareDead(w: TickWorld, reason: DeadBallReason, t: number, x: number, y: number, carrierSlot: number): void {
  if (w.deadAtTick !== null) return;
  w.deadAtTick = w.tick;
  w.emit({
    type: 'dead_ball', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', reason, spot: { x: roundYd(x), y: roundYd(y) },
    side: carrierSlot >= 0 ? w.slots[carrierSlot]!.side : null, carrierId: carrierSlot >= 0 ? w.slots[carrierSlot]!.playerId : null,
  });
  w.ball.kind = 'dead';
}

export function createFinish(): PlayStage {
  let cursor = 0;
  const slotOfId = (w: TickWorld, id: number): number => { for (let s = 0; s < SLOT_COUNT; s++) if (w.slots[s]!.playerId === id) return s; return -1; };
  return {
    name: 'detect',
    begin(): void { cursor = 0; },
    run(w: TickWorld): void {
      const from = cursor;
      cursor = w.events.length;
      if (w.deadAtTick !== null) { if (w.ball.kind !== 'dead') w.ball.kind = 'dead'; return; }
      if (w.tick < 0) return;
      // Candidates of this tick; the earliest interpolated time wins, the scan order breaks ties.
      let reason: DeadBallReason | null = null, t = Infinity, x = 0, y = 0, carrier = -1;
      for (let i = from; i < cursor; i++) {
        const e = w.events[i]!;
        if (e.type !== 'boundary' || e.t >= t) continue;
        if (e.kind === 'ball_out_of_bounds') {
          carrier = e.playerId === null ? -1 : slotOfId(w, e.playerId);
          reason = carrier >= 0 ? 'runner_out_of_bounds' : 'ball_out_of_bounds'; t = e.t; x = e.spot.x; y = e.spot.y;
        } else if (e.kind === 'ball_crosses_goal_line' && e.playerId !== null) {
          const s = slotOfId(w, e.playerId);
          if (s < 0) continue;
          const attacks = w.players.attackDir[s]! === 1 ? w.geometry.goalLineEastX : w.geometry.goalLineWestX;
          if (roundYd(attacks) === e.spot.x) { reason = 'ball_across_goal_line_in_possession'; carrier = s; t = e.t; x = e.spot.x; y = e.spot.y; }
        }
      }
      const f = ballFlight(w);
      if (f.grounded !== null && f.grounded.t < t) { reason = 'incomplete_pass'; carrier = -1; t = f.grounded.t; x = f.grounded.x; y = f.grounded.y; }
      const end = (w.tick + 1) * TICK_S;
      if (reason === null && w.ball.kind === 'loose' && f.atRest) { reason = 'loose_ball_at_rest'; t = end; x = w.ball.x; y = w.ball.y; }
      if (reason !== null) declareDead(w, reason, t, x, y, carrier);
    },
  };
}
