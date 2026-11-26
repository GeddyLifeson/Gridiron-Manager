// The real stage modules as plugs (ports.ts `StagePlug`). One adapter per work package: it builds the
// module on the resolver's shared services, hands it the play, and does the one thing the module
// leaves to the assembly.
//
//   qb (WP-20, J7)   `createQuarterback`. The module never ends a play: this adapter reads its record
//                    after its Interact stage and blows the whistle on a sack (unless the ball came
//                    out) and on a kneel-down.
//   carrier (WP-21, J8, J6.6, J6.7)   `carrierStages`. The module steers and tackles runners but leaves
//                    alone a man whose assignment makes him a quarterback, kicker, holder or snapper
//                    until it is told he runs. The quarterback module tells it when he scrambles or
//                    keeps. This adapter tells it for everyone else who ends up with the ball and has
//                    no procedure left: a quarterback whose part is over (his own fumble back in his
//                    hands, a batted pass he caught), a direct-snap man with no quarterback procedure,
//                    a holder after a bobble, a punter whose operation failed.
//   foulsInjuries (WP-22, J10)   `foulsInjuriesPlug` as it is: it needs nothing from the assembly but
//                    the shared services, and it keeps the play's one hit-load ledger (resolver.ts).
import { BEHAVIORS, SLOT_COUNT, TICK_S, roundSimS, roundYd, type Assignment, type MovementParams, type ParamTable, type TickWorld } from '@gm/schema';
import { PI, dAtan2, dSqrt } from '../dmath.ts';
import { codZOf, cutMultiplier, kinParams } from '../kinematics/index.ts';
import type { Contests } from '../contest/index.ts';
import { carrierStages, CARRIER_VERSION, type CarrierPlugExtras } from '../carrier/plug.ts';
import type { Carrier } from '../carrier/stage.ts';
import { foulsInjuriesPlug } from '../fouls-injuries/index.ts';
import { createQuarterback, type QbPlay, type QbRead, type QbTarget, type Quarterback } from '../qb/index.ts';
import type { PlayStage } from '../tick/loop.ts';
import { declareDead } from './finish.ts';
import { tickResolverParams } from './params.ts';
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
      // The carrier module is created after this one, so its hooks are read when the module is built
      // (first play), never in `create`. With the carrier stand-in there are none and the quarterback
      // module runs him at the lane itself and rates the lane itself.
      const build = (contests: Contests): Quarterback => createQuarterback({
        view: services.perception.view, contests,
        gaze: { gazeAtSlot: (slot, target) => { services.perception.gazeAtSlot(slot, target); watch(slot, target); }, gazeAtPoint: (slot, px, py) => services.perception.gazeAtPoint(slot, px, py) },
        ballInAir: (world, passer, x, y, ticks) => services.perception.notifyBallInAir(world, passer, x, y, ticks),
        topSpeed: (world, slot, mode) => services.movement.modeTopSpeed(world, slot, mode),
        stripAttempt: (slot) => services.playerAi.stripAttempt(slot),
        onRun: (world, slot, why) => { const r = services.runner(); return r === null ? false : r.onRun(world, slot, why); },
        laneQuality: services.runner() === null ? null : (world, slot) => services.runner()!.laneQuality(world, slot),
      });
      // J7.3.1 inputs: "perceived positions of the receiver and the defenders near the throw lane and
      // catch point". Left alone, the attention set (J3.1.2) fills with the nearest bodies, which for a
      // man in the pocket are his own line and the rush, and he never sees the coverage on the man he
      // throws to. So the receiver he looks at and the defenders nearest that receiver are his keys
      // while he looks. Whom to watch is his choice; what he then knows of them still arrives through
      // perception, late and with its error. Keys the content port gave him are left alone.
      let nowWorld: TickWorld | null = null, ownKeys = false, keyedSlot = -1;
      const keyBuf: number[] = [], pathX = new Float64Array(8), pathY = new Float64Array(8);
      /** The drawn route of a receiver he may throw to this play, play frame, or null. */
      const routeOf = (target: number): QbTarget['route'] | null => {
        const play = services.setup().qb;
        if (!play) return null;
        for (const r of play.reads) { if (r.target.slot === target) return r.target.route; if (r.ifDrives?.slot === target) return r.ifDrives.route; }
        if (play.checkdown?.slot === target) return play.checkdown.route;
        if (play.hot?.target.slot === target) return play.hot.target.route;
        return null;
      };
      const watch = (slot: number, target: number): void => {
        const w = nowWorld;
        if (w === null || !ownKeys) return;
        const pl = w.players, f = w.frame, q = tickResolverParams(w.params), n = q['qb.watchDefenders']!, ahead = q['qb.watchAheadYd']!;
        const rx = (pl.posX[target]! - f.originX) * f.attackDir, ry = (pl.posY[target]! - f.originY) * f.attackDir;
        // Where the ball can go: the receiver, and his route for the next yards.
        const route = routeOf(target);
        let m = 0;
        pathX[m] = rx; pathY[m++] = ry;
        if (route !== null && route.length >= 2) {
          let seg = 0, best = Infinity;
          for (let i = 0; i + 1 < route.length; i++) {
            const a = route[i]!, c = route[i + 1]!, dx = c.px - a.px, dy = c.py - a.py, len2 = dx * dx + dy * dy;
            let u = len2 > 0 ? ((rx - a.px) * dx + (ry - a.py) * dy) / len2 : 0;
            u = u < 0 ? 0 : u > 1 ? 1 : u;
            const ex = a.px + dx * u - rx, ey = a.py + dy * u - ry, d = ex * ex + ey * ey;
            if (d < best) { best = d; seg = i; }
          }
          let left = ahead, x = rx, y = ry;
          for (let i = seg + 1; i < route.length && left > 0 && m < pathX.length; i++) {
            const dx = route[i]!.px - x, dy = route[i]!.py - y, len = dSqrt(dx * dx + dy * dy);
            if (len <= 0) continue;
            const go = len < left ? len : left;
            x += (dx / len) * go; y += (dy / len) * go; left -= go;
            pathX[m] = x; pathY[m++] = y;
          }
        }
        const first = slot < SLOT_COUNT / 2 ? SLOT_COUNT / 2 : 0;
        keyBuf.length = 0; keyBuf.push(target);
        for (let k = 0; k < n; k++) {
          let pick = -1, pickD = Infinity;
          for (let d = first; d < first + SLOT_COUNT / 2; d++) {
            if (keyBuf.includes(d)) continue;
            const px = (pl.posX[d]! - f.originX) * f.attackDir, py = (pl.posY[d]! - f.originY) * f.attackDir;
            let near = Infinity;
            for (let i = 0; i < m; i++) {
              let dd: number;
              if (i + 1 < m) {
                const dx = pathX[i + 1]! - pathX[i]!, dy = pathY[i + 1]! - pathY[i]!, len2 = dx * dx + dy * dy;
                let u = len2 > 0 ? ((px - pathX[i]!) * dx + (py - pathY[i]!) * dy) / len2 : 0;
                u = u < 0 ? 0 : u > 1 ? 1 : u;
                const ex = pathX[i]! + dx * u - px, ey = pathY[i]! + dy * u - py;
                dd = ex * ex + ey * ey;
              } else { const ex = pathX[i]! - px, ey = pathY[i]! - py; dd = ex * ex + ey * ey; }
              if (dd < near) near = dd;
            }
            if (near < pickD) { pickD = near; pick = d; }
          }
          if (pick >= 0) keyBuf.push(pick);
        }
        services.perception.configure(slot, { keys: keyBuf });
      };
      services.claimPasser(() => {
        if (!active || q === null) return -1;
        const ph = q.phase();
        return ph === 'run' || ph === 'over' ? -1 : services.setup().qb!.qbSlot;
      });
      const decide: PlayStage = {
        name: 'decide',
        begin(w: TickWorld): void { ended = false; q!.decide.begin?.(w); },
        run(w: TickWorld, dt: number): void { if (active) { nowWorld = w; q!.decide.run(w, dt); } },
      };
      const interact: PlayStage = {
        name: 'interact',
        run(w: TickWorld, dt: number): void {
          if (!active) return;
          q!.interact.run(w, dt);
          if (w.deadAtTick !== null || q!.phase() !== 'over') return;
          const slot = services.setup().qb!.qbSlot, t = (w.tick + 1) * TICK_S;
          if (ended) {
            // Only with the carrier stand-in, which steers nobody: his procedure is over and the ball is
            // back in his hands (his own fumble, a batted pass). He goes down on it. The real carrier
            // module runs him instead (the carrier adapter below hands him over).
            if (services.runner() === null && w.tick > endedTick && w.ball.kind === 'held' && w.ball.carrierSlot === slot) {
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
        setPlay(w: TickWorld): void {
          const contests = services.contests();
          if (q === null || builtFor !== contests) { q = build(contests); builtFor = contests; }
          const play = services.setup().qb ?? null;
          active = play !== null;
          // His keys of the last play do not carry into this one (J13.1.1), and keys from the content port win.
          if (keyedSlot >= 0 && services.setup().perception[keyedSlot]?.keys === undefined) services.perception.configure(keyedSlot, { keys: [] });
          keyedSlot = -1; ownKeys = false; nowWorld = null;
          if (play !== null && services.setup().perception[play.qbSlot]?.keys === undefined) { ownKeys = true; keyedSlot = play.qbSlot; }
          q.setPlay(play === null ? null : withReceiverLegs(play, w, services.setup().presnap.offense.assignments));
        },
        explain: () => (q === null || !active ? [] : [{ record: q.record(), notes: q.notes().slice() }]),
      };
    },
  };
}

/**
 * The quarterback's play with what he knows of each receiver's legs from practice filled in (J7.3.1
 * step 1): a target the content port left without them gets the top speed, acceleration and braking
 * of the man in that slot, and the speed he carries through each cut of his drawn route (J2.1.3).
 * His own side's knowledge only.
 */
export function withReceiverLegs(play: QbPlay, w: TickWorld, offense: readonly Assignment[]): QbPlay {
  const fill = (t: QbTarget): QbTarget => {
    if (t.topSpeedYps !== undefined) return t;
    const info = w.slots[t.slot], a = offense[t.slot];
    if (info === undefined) return t;
    const legs = { movement: info.movement, params: w.params };
    if (a !== undefined && t.route.length >= 2 && t.route.length === a.behavior.path.length + 1) {
      const full = qbTargetOf(t.slot, a, legs);
      return { ...t, topSpeedYps: full.topSpeedYps!, accelTauS: full.accelTauS!, brakeYps2: full.brakeYps2!, ...(full.cutShare ? { cutShare: full.cutShare } : {}) };
    }
    return { ...t, topSpeedYps: info.movement.vMaxYps, accelTauS: info.movement.tauS, brakeYps2: info.movement.aBrakeYps2 };
  };
  const read = (r: QbRead): QbRead => ({ ...r, target: fill(r.target), ...(r.ifDrives ? { ifDrives: fill(r.ifDrives) } : {}) });
  return {
    ...play, reads: play.reads.map(read), correctedReads: play.correctedReads === null ? null : play.correctedReads.map(read),
    checkdown: play.checkdown === null ? null : fill(play.checkdown),
    hot: play.hot === null ? null : { ...play.hot, target: fill(play.hot.target) },
    mesh: play.mesh === null || play.mesh.throwTarget === undefined ? play.mesh : { ...play.mesh, throwTarget: fill(play.mesh.throwTarget) },
  };
}

export const CARRIER_PLUG_VERSION = `carrier-adapter-1+${CARRIER_VERSION}`;

/** The carrier of the resolver a plug was built for, for film and tests. Null before `create`. */
export interface BallCarrierPlug extends StagePlug { carrier(): Carrier | null }

/**
 * The real WP-21 ball carrier. `extras` override what the content port does not carry yet (the coach's
 * carrier instructions, run style, personality); the designed run and the return call come from
 * `PlaySetup.carrier` unless `extras.play` is given.
 */
export function ballCarrierPlug(extras: CarrierPlugExtras = {}): BallCarrierPlug {
  let carrier: Carrier | null = null;
  return {
    id: 'carrier', version: CARRIER_PLUG_VERSION,
    carrier: () => carrier,
    create(services: PlayServices): PlugStages {
      const inner = carrierStages(services, { ...extras, play: extras.play ?? ((sv) => sv.setup().carrier ?? null) });
      const c = inner.carrier;
      carrier = c;
      const handed = new Uint8Array(SLOT_COUNT);
      services.claimRunner({ onRun: (w, slot, why) => { handed[slot] = 1; return c.onRun(w, slot, why); }, laneQuality: (w, slot) => c.laneQuality(w, slot) });
      // Registered before the module's own Decide stage, so a man handed over is steered the same tick.
      const orphan: PlayStage = {
        name: 'decide',
        begin(): void { handed.fill(0); },
        run(w: TickWorld): void {
          if (w.tick < 0 || w.deadAtTick !== null || w.ball.kind !== 'held') return;
          const s = w.ball.carrierSlot;
          if (s < 0 || handed[s] === 1 || !NO_PROCEDURE.has(w.players.behavior[s]!)) return;
          // Still somebody's: the passer in his procedure (J6.2.5), the punter or holder before the kick.
          if (s === services.protectedPasser() || s === services.kickOwner()) return;
          handed[s] = 1;
          if (!c.onRun(w, s, 'no_procedure')) return;
          w.emit({ type: 'detail', t: roundSimS(w.tick * TICK_S), code: 'tick.carrier.no_procedure', playerIds: [w.slots[s]!.playerId], spot: { x: roundYd(w.ball.x), y: roundYd(w.ball.y) }, value: null });
        },
      };
      return { stages: [orphan, ...inner.stages], setPlay: inner.setPlay, hitLoad: inner.hitLoad, explain: inner.explain };
    },
  };
}
/** Behaviors the carrier module does not steer until told (carrier/stage.ts `NOT_RUNNERS`). */
const NO_PROCEDURE = new Set([BEHAVIORS.indexOf('quarterback'), BEHAVIORS.indexOf('kicker'), BEHAVIORS.indexOf('holder'), BEHAVIORS.indexOf('snapper')]);

/**
 * Every real stage module: quarterback, ball carrier, fouls and injuries. A resolver built on all
 * three runs no stand-in. The parameter table of a play must hold the `qb`, `carrier` and
 * `foulsInjuries` modules' rows, and the rule set the foul keys `foul.<id>.exists`.
 */
export function availablePlugs(): StagePlug[] { return [quarterbackPlug(), ballCarrierPlug(), foulsInjuriesPlug()]; }

/**
 * A `QbTarget` from a receiver's own assignment: the route as drawn (alignment first), the first cut
 * as the break he is thrown to, and whether the route ends by sitting down. For content ports.
 */
/**
 * A quarterback target from a drawn route. With `legs` (the receiver's movement parameters and the
 * kinematics rows) it also carries what the quarterback knows of his own receiver from practice: his
 * top speed, how he accelerates and brakes, and the speed he carries through each cut (J2.1.3), so
 * the throw is timed to the man who runs the route (J7.3.1 step 1).
 */
export function qbTargetOf(slot: number, a: Assignment, legs?: { readonly movement: MovementParams; readonly params: ParamTable }): QbTarget {
  const route = [{ px: a.preSnap.align.px, py: a.preSnap.align.py }];
  let breakIndex = -1;
  for (const pt of a.behavior.path) { route.push({ px: pt.px, py: pt.py }); if (breakIndex < 0 && pt.kind === 'cut') breakIndex = route.length - 1; }
  const last = a.behavior.path[a.behavior.path.length - 1];
  const base = { slot, route: route.length > 1 ? route : [], breakIndex, settles: last !== undefined && last.kind === 'settle' };
  if (legs === undefined || route.length < 2) return base;
  const kp = kinParams(legs.params), z = codZOf(legs.movement, kp), cutShare: number[] = [1];
  for (let i = 1; i < route.length; i++) {
    let share = 1;
    if (i + 1 < route.length && a.behavior.path[i - 1]!.kind === 'cut') {
      const ax = route[i]!.px - route[i - 1]!.px, ay = route[i]!.py - route[i - 1]!.py, cx = route[i + 1]!.px - route[i]!.px, cy = route[i + 1]!.py - route[i]!.py;
      if ((ax !== 0 || ay !== 0) && (cx !== 0 || cy !== 0)) share = cutMultiplier(dAtan2(ax * cy - ay * cx, ax * cx + ay * cy), z, kp, PI);
    }
    cutShare.push(share);
  }
  return { ...base, topSpeedYps: legs.movement.vMaxYps, accelTauS: legs.movement.tauS, brakeYps2: legs.movement.aBrakeYps2, cutShare };
}
