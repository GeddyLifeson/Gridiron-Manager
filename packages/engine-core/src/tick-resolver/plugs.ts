// The real stage modules as plugs (ports.ts `StagePlug`). One adapter per work package: it builds the
// module on the resolver's shared services, hands it the play, and does the one thing the module
// leaves to the assembly.
//
//   qb (WP-20, J7)   `createQuarterback`. The module never ends a play: this adapter reads its record
//                    after its Interact stage and blows the whistle on a sack (unless the ball came
//                    out) and on a kneel-down.
//
// The carrier (WP-21) and fouls-and-injuries (WP-22) adapters join this file when those modules merge.
import { TICK_S, roundSimS, roundYd, type Assignment, type TickWorld } from '@gm/schema';
import type { Contests } from '../contest/index.ts';
import { createQuarterback, type QbTarget, type Quarterback } from '../qb/index.ts';
import type { PlayStage } from '../tick/loop.ts';
import { declareDead } from './finish.ts';
import type { PlayServices, PlugStages, StagePlug } from './ports.ts';

export const QB_PLUG_VERSION = 'qb-adapter-1';

/** The quarterback of the resolver a plug was built for, for film and tests. Null before the first play. */
export interface QuarterbackPlug extends StagePlug { quarterback(): Quarterback | null }

export function quarterbackPlug(): QuarterbackPlug {
  let q: Quarterback | null = null;
  return {
    id: 'qb', version: QB_PLUG_VERSION,
    quarterback: () => q,
    create(services: PlayServices): PlugStages {
      // The contest library is built per parameter table, so the module is built on first use and
      // rebuilt only when the table changes (P6.3.1: nothing is built per play).
      let builtFor: Contests | null = null, active = false, ended = false, endedTick = 0;
      const build = (contests: Contests): Quarterback => createQuarterback({
        view: services.perception.view, contests,
        gaze: { gazeAtSlot: (slot, target) => services.perception.gazeAtSlot(slot, target), gazeAtPoint: (slot, px, py) => services.perception.gazeAtPoint(slot, px, py) },
        ballInAir: (world, passer, x, y, ticks) => services.perception.notifyBallInAir(world, passer, x, y, ticks),
        topSpeed: (world, slot, mode) => services.movement.modeTopSpeed(world, slot, mode),
        stripAttempt: (slot) => services.playerAi.stripAttempt(slot),
        // No carrier module steers him yet (WP-21): the quarterback module runs him at the lane itself.
        onRun: () => false,
      });
      services.claimPasser(() => {
        if (!active || q === null) return -1;
        const ph = q.phase();
        return ph === 'run' || ph === 'over' ? -1 : services.setup().qb!.qbSlot;
      });
      const decide: PlayStage = {
        name: 'decide',
        begin(w: TickWorld): void { ended = false; q!.decide.begin?.(w); },
        run(w: TickWorld, dt: number): void { if (active) q!.decide.run(w, dt); },
      };
      const interact: PlayStage = {
        name: 'interact',
        run(w: TickWorld, dt: number): void {
          if (!active) return;
          q!.interact.run(w, dt);
          if (w.deadAtTick !== null || q!.phase() !== 'over') return;
          const slot = services.setup().qb!.qbSlot, t = (w.tick + 1) * TICK_S;
          if (ended) {
            // INTERIM until the carrier module (WP-21) steers every man with the ball: his procedure is
            // over and the ball is back in his hands (his own fumble, a batted pass). He goes down on it.
            if (w.tick > endedTick && w.ball.kind === 'held' && w.ball.carrierSlot === slot) {
              w.emit({ type: 'detail', t: roundSimS(t), code: 'tick.qb.down_on_ball', playerIds: [w.slots[slot]!.playerId], spot: { x: roundYd(w.ball.x), y: roundYd(w.ball.y) }, value: null });
              declareDead(w, 'gave_himself_up', t, w.ball.x, w.ball.y, slot);
            }
            return;
          }
          const rec = q!.record();
          // Once his part is over nothing he does later can end the play: look at the record once.
          ended = true; endedTick = w.tick;
          if (rec.sack !== null) {
            // A strip-sack leaves the ball loose and the play live (J6.7); otherwise he is down where he was hit.
            if (!rec.sack.fumble) declareDead(w, 'down_by_contact', t, rec.sack.x, rec.sack.y, slot);
          } else if (rec.kneel !== null) {
            declareDead(w, 'kneel', t, rec.kneel.x, rec.kneel.y, slot);
          }
        },
      };
      return {
        stages: [decide, interact],
        setPlay(): void {
          const contests = services.contests();
          if (q === null || builtFor !== contests) { q = build(contests); builtFor = contests; }
          const play = services.setup().qb ?? null;
          active = play !== null;
          q.setPlay(play);
        },
        explain: () => (q === null || !active ? [] : [{ record: q.record(), notes: q.notes().slice() }]),
      };
    },
  };
}

/** Every real stage module that exists today. The ids missing from it still run on stand-ins. */
export function availablePlugs(): StagePlug[] { return [quarterbackPlug()]; }

/**
 * A `QbTarget` from a receiver's own assignment: the route as drawn (alignment first), the first cut
 * as the break he is thrown to, and whether the route ends by sitting down. For content ports.
 */
export function qbTargetOf(slot: number, a: Assignment): QbTarget {
  const route = [{ px: a.preSnap.align.px, py: a.preSnap.align.py }];
  let breakIndex = -1;
  for (const pt of a.behavior.path) { route.push({ px: pt.px, py: pt.py }); if (breakIndex < 0 && pt.kind === 'cut') breakIndex = route.length - 1; }
  const last = a.behavior.path[a.behavior.path.length - 1];
  return { slot, route: route.length > 1 ? route : [], breakIndex, settles: last !== undefined && last.kind === 'settle' };
}
