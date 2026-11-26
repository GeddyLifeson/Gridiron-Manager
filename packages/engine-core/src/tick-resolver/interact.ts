// The Interact stage of the tick (J1.3.1, J6.1.2, J6.2.1, J6.3.1): opens the engagement contests
// between blockers and the defenders they reach, steps each one a tick, and ends it at a bound. The
// contest folder is the library; this file is the stage that runs it on bodies.
//
// What it does each live tick, in a fixed order (J13.3.2):
//   1. Every open contest, in the order it was opened: `A` moves one step of J6.1.2 from the two
//      players' effective z (J6.1.1) and one standard normal from the pair's `contest` stream, keyed
//      [game, play, lowerPlayerId, higherPlayerId, type] (J13.2.1). At A = -1 the defender is free; at
//      A = +1 he is out of the play for the recovery time. A pass rusher held past the counter
//      threshold tries his counter once (J6.2.1). A winning run block moves the defender (J6.3.1).
//   2. Every free blocker, slots 0 to 21: the nearest opponent whose body circle he has reached
//      becomes his contest, or, when a teammate already has that man, he joins as help (J6.2.3, J6.3.2).
// Between the bounds `A` caps the defender's speed through the movement module's engagement limit
// (J2.1.1 step 6): `speedAllowed = vDefender * g(A)`.
//
// Not built here, and said so in the handoff: the technique matrix and leverage terms of J6.1.1 (both
// are 0), stunts, chips, blocks in space as event contests, releases and separation (J6.4), the catch
// point (J6.5). Tackles and ball security belong to the carrier module (WP-21).
import {
  BEHAVIORS, MOVE_MODES, SLOT_COUNT, TICK_S, issToZ, roundSimS, roundYd,
  type Behavior, type ContestInstance, type ContestType, type EngagementParams, type TickWorld,
} from '@gm/schema';
import { dSqrt } from '../dmath.ts';
import type { Contests } from '../contest/index.ts';
import type { EngagementLimit } from '../kinematics/index.ts';
import type { PlayStage } from '../tick/loop.ts';
import { tickResolverParams, type TickResolverParams } from './params.ts';

const DOWN = MOVE_MODES.indexOf('down');
const code = (b: Behavior): number => BEHAVIORS.indexOf(b);
const PASS_BLOCKERS = new Set([code('passSet'), code('protectKick')]);
const RUN_BLOCKERS = new Set([code('runBlock'), code('pull'), code('returnBlock'), code('kickReturnBlock')]);

// D3 grades behind each side of a block (J6.2.1, J6.3.1 inputs). Equal weights until the technique matrix exists.
const PASS_BLOCK_ATTRS = ['pass_set', 'anchor', 'mirror', 'hand_use_in_protection'] as const;
const PASS_RUSH_ATTRS = ['get_off', 'power_rush', 'hand_moves', 'speed_rush_and_bend'] as const;
const RUN_BLOCK_ATTRS = ['zone_run_blocking', 'gap_run_blocking', 'play_strength'] as const;
const RUN_DEFENSE_ATTRS = ['block_shedding', 'taking_on_blocks', 'play_strength'] as const;
const COUNTER_ATTR = 'inside_counter';

export interface Interact {
  readonly stage: PlayStage;
  /** Hand this to `createMovement({ engagementLimit })`. */
  readonly limit: EngagementLimit;
  /**
   * Call before the loop's `begin`. `startAdvantage(blockerSlot, defenderSlot)` gives the J5.6.1
   * get-off term for the first contest of a defender; null when the play has no snap count.
   */
  setPlay(contests: Contests, startAdvantage: ((blocker: number, defender: number) => number) | null): void;
  /** True while contest `index` of `world.contests` is still being fought. */
  isOpen(index: number): boolean;
}

export function createInteract(): Interact {
  let contests: Contests | null = null;
  let startAdvantage: ((blocker: number, defender: number) => number) | null = null;
  let p: TickResolverParams | null = null;
  const open: boolean[] = [], interior: boolean[] = [], held: number[] = [], countered: boolean[] = [];
  const freeUntil = new Int32Array(SLOT_COUNT), everEngaged = new Uint8Array(SLOT_COUNT);

  const isDown = (w: TickWorld, s: number): boolean => w.players.moveMode[s] === DOWN || w.tick < w.players.onGroundUntilTick[s]!;
  const meanZ = (w: TickWorld, s: number, attrs: readonly string[]): number => {
    const a = w.slots[s]!.player.attributes;
    let sum = 0;
    for (let i = 0; i < attrs.length; i++) sum += issToZ(a[attrs[i]!] ?? 50);
    return sum / attrs.length;
  };
  /** J6.1.1 effective z. The fatigue penalty is refreshed here so every reader of `dFatigueZ` sees this tick's value. */
  const zEff = (w: TickWorld, s: number, attrs: readonly string[]): number => {
    const c = contests!, pl = w.players;
    pl.dFatigueZ[s] = c.fatiguePenaltyZ(pl.fatigueNow[s]!);
    return c.math.effectiveZ({ zAttr: meanZ(w, s, attrs), dFatigue: pl.dFatigueZ[s]!, dInjury: pl.dInjuryZ[s]!, dKnowledge: pl.dKnowledgeZ[s]!, mTechnique: 0, mLeverage: 0 });
  };
  const gap = (w: TickWorld, a: number, b: number): number => {
    const pl = w.players, dx = pl.posX[a]! - pl.posX[b]!, dy = pl.posY[a]! - pl.posY[b]!;
    return dSqrt(dx * dx + dy * dy) - w.slots[a]!.movement.bodyRadiusYd - w.slots[b]!.movement.bodyRadiusYd;
  };
  const paramsOf = (i: number, c: ContestInstance): EngagementParams =>
    c.type === 'passBlock' ? contests!.passRush.engagement(interior[i] ? 'interior' : 'edge') : contests!.runBlock.engagement('oneGap');

  const close = (w: TickWorld, i: number): void => {
    const c = w.contests[i]!, pl = w.players;
    open[i] = false;
    if (pl.engagement[c.offenseSlot] === i) pl.engagement[c.offenseSlot] = -1;
    if (pl.engagement[c.defenseSlot] === i) pl.engagement[c.defenseSlot] = -1;
    for (const h of c.helperSlots) if (pl.engagement[h] === i) pl.engagement[h] = -1;
    c.helperSlots.length = 0;
  };

  const won = (w: TickWorld, i: number, winner: number, loser: number): void => {
    const c = w.contests[i]!;
    w.emit({
      type: 'contest', t: roundSimS((w.tick + 1) * TICK_S), contest: c.type, winnerId: w.slots[winner]!.playerId, loserId: w.slots[loser]!.playerId,
      spot: { x: roundYd(w.players.posX[c.defenseSlot]!), y: roundYd(w.players.posY[c.defenseSlot]!) },
    });
    close(w, i);
  };

  const step = (w: TickWorld, i: number, q: TickResolverParams): void => {
    const c = w.contests[i]!, o = c.offenseSlot, d = c.defenseSlot, pl = w.players, lib = contests!;
    if (isDown(w, o) || isDown(w, d) || pl.hasBall[o] === 1 || pl.hasBall[d] === 1 || gap(w, o, d) > q['interact.breakGapYd']!) { close(w, i); return; }
    // Help that has drifted off or gone down stops counting; the contest itself goes on.
    for (let k = c.helperSlots.length - 1; k >= 0; k--) {
      const h = c.helperSlots[k]!;
      if (isDown(w, h) || gap(w, h, d) > q['interact.breakGapYd']!) { if (pl.engagement[h] === i) pl.engagement[h] = -1; c.helperSlots.splice(k, 1); }
    }
    const pass = c.type === 'passBlock';
    let dz = zEff(w, o, pass ? PASS_BLOCK_ATTRS : RUN_BLOCK_ATTRS) - zEff(w, d, pass ? PASS_RUSH_ATTRS : RUN_DEFENSE_ATTRS);
    if (c.helperSlots.length > 0) dz += pass ? lib.passRush.helpZ('double', (w.tick - c.startedTick) * TICK_S) : lib.runBlock.comboZ();
    // Exactly one normal per open contest per tick, whatever happens next.
    let a = lib.math.stepEngagement(c.advantage, dz, paramsOf(i, c), c.stream.normal());
    if (pass && !countered[i]) {
      held[i] = lib.passRush.counterClock(a, held[i]!);
      if (lib.passRush.counterReady(held[i]!)) {
        countered[i] = true;
        const r = lib.passRush.resolveCounter(a, issToZ(w.slots[d]!.player.attributes[COUNTER_ATTR] ?? 50), c.stream);
        a = r.advantage;
        if (r.won) w.emit({ type: 'detail', t: roundSimS((w.tick + 1) * TICK_S), code: 'interact.counter', playerIds: [w.slots[d]!.playerId], spot: null, value: null });
      }
    }
    c.advantage = a;
    if (a <= -1) { freeUntil[d] = w.tick + Math.round(q['interact.shedFreeS']! / TICK_S); won(w, i, d, o); return; }
    if (a >= 1) { pl.onGroundUntilTick[d] = w.tick + 1 + Math.round(q['interact.wonRecoveryS']! / TICK_S); won(w, i, o, d); return; }
    if (!pass && a > 0) {
      // J6.3.1: the blocker moves the defender along the block's direction, taken here as blocker to defender.
      const dx = pl.posX[d]! - pl.posX[o]!, dy = pl.posY[d]! - pl.posY[o]!, len = dSqrt(dx * dx + dy * dy);
      if (len > 0) { const m = lib.runBlock.displacementYps(a) * TICK_S / len; pl.posX[d] = pl.posX[d]! + dx * m; pl.posY[d] = pl.posY[d]! + dy * m; }
    }
  };

  const tryOpen = (w: TickWorld, b: number, q: TickResolverParams): void => {
    const pl = w.players, beh = pl.behavior[b]!, pass = PASS_BLOCKERS.has(beh);
    if (!pass && !RUN_BLOCKERS.has(beh)) return;
    if (pl.engagement[b]! >= 0 || pl.hasBall[b] === 1 || isDown(w, b)) return;
    const side = w.slots[b]!.side, reach = q['interact.contactGapYd']!;
    let best = -1, bestGap = reach;
    for (let d = 0; d < SLOT_COUNT; d++) {
      if (w.slots[d]!.side === side || pl.hasBall[d] === 1 || isDown(w, d) || w.tick < freeUntil[d]!) continue;
      const e = pl.engagement[d]!;
      // An opponent who is himself blocking someone, or who already has two men on him, is not picked up.
      if (e >= 0 && (w.contests[e]!.defenseSlot !== d || w.contests[e]!.helperSlots.length > 0)) continue;
      const g = gap(w, b, d);
      if (g <= bestGap) { if (g < bestGap || best < 0) { best = d; bestGap = g; } }
    }
    if (best < 0) return;
    const existing = pl.engagement[best]!;
    if (existing >= 0) { w.contests[existing]!.helperSlots.push(b); pl.engagement[b] = existing; return; }
    const type: ContestType = pass ? 'passBlock' : 'runBlock';
    const idB = w.slots[b]!.playerId, idD = w.slots[best]!.playerId, sit = w.situation;
    const first = everEngaged[best] === 0;
    everEngaged[best] = 1;
    const index = w.contests.length;
    w.contests.push({
      type, offenseSlot: b, defenseSlot: best, advantage: first && startAdvantage !== null ? startAdvantage(b, best) : 0, startedTick: w.tick, helperSlots: [],
      stream: w.streams('contest', [sit.gameId, sit.playNumber, idB < idD ? idB : idD, idB < idD ? idD : idB, type]),
    });
    const py = (pl.posY[best]! - w.frame.originY) * w.frame.attackDir;
    open[index] = true; interior[index] = (py < 0 ? -py : py) <= q['interact.interiorHalfWidthYd']!; held[index] = 0; countered[index] = false;
    pl.engagement[b] = index; pl.engagement[best] = index;
  };

  const stage: PlayStage = {
    name: 'interact',
    begin(w: TickWorld): void {
      p = tickResolverParams(w.params);
      open.length = 0; interior.length = 0; held.length = 0; countered.length = 0;
      freeUntil.fill(-2147483648); everEngaged.fill(0);
    },
    run(w: TickWorld): void {
      if (w.tick < 0 || w.deadAtTick !== null || contests === null) return;
      const q = p ?? (p = tickResolverParams(w.params));
      const n = w.contests.length;
      for (let i = 0; i < n; i++) if (open[i]) step(w, i, q);
      for (let b = 0; b < SLOT_COUNT; b++) tryOpen(w, b, q);
    },
  };

  const limit: EngagementLimit = (w, slot, out) => {
    const i = w.players.engagement[slot]!;
    if (i < 0 || contests === null || !open[i]) return false;
    const c = w.contests[i]!;
    if (c.defenseSlot !== slot) return false;
    const g = c.type === 'passBlock' ? contests.passRush.rushSpeedFactor(c.advantage) : contests.runBlock.defenderSpeedFactor(c.advantage);
    out[0] = w.slots[slot]!.movement.vMaxYps * g; out[1] = 0; out[2] = 0;
    return true;
  };

  return {
    stage, limit,
    setPlay(c, start) { contests = c; startAdvantage = start; },
    isOpen: (index) => open[index] === true,
  };
}
