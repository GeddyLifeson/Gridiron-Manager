// STAND-INS. NOT FOOTBALL. These three stage modules exist only so a play can end while the
// quarterback (WP-20), ball carrier (WP-21) and fouls-and-injuries (WP-22) modules are not plugged in.
// A resolver running on any of them reports `mayProduceSavedResults: false` and names it in
// `report.standIns` (J14.1.2: nothing a stand-in produces may be saved into a career).
//
//   qb            No read, no throw, no scramble. The snap receiver holds the ball where his assignment
//                 takes him. If he still has it after `standIn.qbHoldS` he gives himself up.
//   carrier       No moves, no broken tackles, no fumbles. The first free opponent to touch the man with
//                 the ball makes the tackle. The first player to reach a kicked or loose ball takes it;
//                 the kicking team taking its own kick ends the play.
//   foulsInjuries Nothing happens.
//
// They draw no random number, so plugging a real module in never shifts another module's draws.
import { MOVE_MODES, SLOT_COUNT, SLOTS_PER_TEAM, TICK_S, roundSimS, roundYd, type TickWorld } from '@gm/schema';
import { dSqrt } from '../dmath.ts';
import { declareDead } from './finish.ts';
import { tickResolverParams } from './params.ts';
import type { PlugId, PlugStages, PlayServices, StagePlug } from './ports.ts';

export const STAND_IN_VERSION = 'stand-in-1';
const DOWN = MOVE_MODES.indexOf('down');
const isDown = (w: TickWorld, s: number): boolean => w.players.moveMode[s] === DOWN || w.tick < w.players.onGroundUntilTick[s]!;
const spotOf = (w: TickWorld, s: number) => ({ x: roundYd(w.players.posX[s]!), y: roundYd(w.players.posY[s]!) });

function qbStandIn(services: PlayServices): PlugStages {
  let holder = -1;
  return {
    stages: [{
      name: 'interact',
      begin(): void { holder = -1; },
      run(w: TickWorld): void {
        if (w.tick < 0 || w.deadAtTick !== null) return;
        if (w.tick === 0) { const snap = services.snap(); holder = snap !== null && snap.quality !== 'loose' ? snap.receiverSlot : -1; }
        if (holder < 0) return;
        if (w.ball.kind !== 'held' || w.ball.carrierSlot !== holder) { holder = -1; return; }
        const t = (w.tick + 1) * TICK_S;
        if (t >= tickResolverParams(w.params)['standIn.qbHoldS']!) declareDead(w, 'gave_himself_up', t, w.ball.x, w.ball.y, holder);
      },
    }],
  };
}

function carrierStandIn(): PlugStages {
  return {
    stages: [{
      name: 'interact',
      run(w: TickWorld): void {
        if (w.tick < 0 || w.deadAtTick !== null) return;
        const q = tickResolverParams(w.params), pl = w.players, b = w.ball, t = (w.tick + 1) * TICK_S;
        if (b.kind === 'held' && b.carrierSlot >= 0) {
          const c = b.carrierSlot, side = w.slots[c]!.side;
          for (let s = 0; s < SLOT_COUNT; s++) {
            if (w.slots[s]!.side === side || isDown(w, s) || pl.engagement[s]! >= 0) continue;
            const dx = pl.posX[s]! - pl.posX[c]!, dy = pl.posY[s]! - pl.posY[c]!;
            if (dSqrt(dx * dx + dy * dy) > w.slots[s]!.movement.bodyRadiusYd + w.slots[c]!.movement.bodyRadiusYd + q['standIn.touchGapYd']!) continue;
            w.emit({ type: 'tackle_attempt', t: roundSimS(t), outcome: 'made', carrierId: w.slots[c]!.playerId, tacklerIds: [w.slots[s]!.playerId], spot: spotOf(w, c) });
            pl.moveMode[c] = DOWN;
            declareDead(w, 'down_by_contact', t, b.x, b.y, c);
            return;
          }
          return;
        }
        const kick = b.kickKind !== null;
        // A kick still climbing off the foot or the tee cannot be taken; one coming down, or any loose ball, can.
        const takeable = b.kind === 'loose' || (b.kind === 'kickInFlight' && kick && b.velHeight < 0);
        if (!takeable || b.heightYd > q['standIn.reachHeightYd']!) return;
        // The nearest player whose body reaches the ball takes it; the lower slot wins a tie.
        let best = -1, bestD = Infinity;
        for (let s = 0; s < SLOT_COUNT; s++) {
          if (isDown(w, s) || pl.engagement[s]! >= 0) continue;
          const dx = pl.posX[s]! - b.x, dy = pl.posY[s]! - b.y, d = dSqrt(dx * dx + dy * dy);
          if (d <= w.slots[s]!.movement.bodyRadiusYd + q['standIn.touchGapYd']! && d < bestD) { best = s; bestD = d; }
        }
        if (best < 0) return;
        const info = w.slots[best]!, kickers = kick && best < SLOTS_PER_TEAM, inFlight = b.kind === 'kickInFlight';
        if (kick) w.emit({ type: 'kick_touch', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', kind: kickers ? 'touched_by_kickers' : 'touched_by_receivers', playerId: info.playerId, side: info.side, spot: spotOf(w, best) });
        b.kind = 'held'; b.carrierSlot = best; b.lastPossessorSlot = best; b.heightYd = 0; b.velHeight = 0; b.passForward = null; b.kickKind = null;
        b.x = pl.posX[best]!; b.y = pl.posY[best]!;
        pl.hasBall[best] = 1;
        w.emit({ type: 'possession', t: roundSimS(t), side: info.side, playerId: info.playerId, spot: spotOf(w, best), how: kick ? (inFlight ? 'kick_catch' : 'kick_recovery') : 'fumble_recovery' });
        if (kickers) declareDead(w, 'kick_recovered_by_kickers', t, b.x, b.y, best);
      },
    }],
  };
}

const BUILD: Readonly<Record<PlugId, (services: PlayServices) => PlugStages>> = {
  qb: qbStandIn, carrier: () => carrierStandIn(), foulsInjuries: () => ({ stages: [] }),
};

export function standInPlug(id: PlugId): StagePlug {
  return { id, version: STAND_IN_VERSION, create: BUILD[id] };
}
