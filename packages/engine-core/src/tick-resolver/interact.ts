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
  BEHAVIORS, MOVE_MODES, SLOT_COUNT, SLOTS_PER_TEAM, TICK_S, issToZ, roundSimS, roundYd,
  type Behavior, type ContestInstance, type ContestType, type EngagementParams, type TickWorld,
} from '@gm/schema';
import { dSqrt } from '../dmath.ts';
import type { Contests } from '../contest/index.ts';
import type { EngagementLimit } from '../kinematics/index.ts';
import type { PlayStage } from '../tick/loop.ts';
import { tickResolverParams, type TickResolverParams } from './params.ts';
import { NOT_IN_PROTECTION, type ProtectionBinding } from '../protection/bind.ts';

const DOWN = MOVE_MODES.indexOf('down');
const code = (b: Behavior): number => BEHAVIORS.indexOf(b);
const PASS_BLOCKERS = new Set([code('passSet'), code('protectKick')]);
const RUSHERS = new Set([code('passRush'), code('blitz')]);
const RUN_BLOCKERS = new Set([code('runBlock'), code('pull'), code('returnBlock'), code('kickReturnBlock')]);
const COVERING = new Set([code('kickCoverage'), code('gunner')]);

// D3 grades behind each side of a block (J6.2.1, J6.3.1 inputs). Equal weights until the technique matrix exists.
const PASS_BLOCK_ATTRS = ['pass_set', 'anchor', 'mirror', 'hand_use_in_protection'] as const;
const PASS_RUSH_ATTRS = ['get_off', 'power_rush', 'hand_moves', 'speed_rush_and_bend'] as const;
// Pad level is the leverage term of a run block (D3 universal attribute, J6.1.1 mLeverage: "the low man wins"). It
// enters as an equal-weight attribute of the mix, so a player strong everywhere answers exactly as before and pad
// level alone moves a run block a quarter of the way a whole run-block skill does. The weight is an Assumption:
// no public source grades pad level per player (research/tuning/dead-skills.md).
export const RUN_BLOCK_ATTRS = ['zone_run_blocking', 'gap_run_blocking', 'play_strength', 'pad_level'] as const;
export const RUN_DEFENSE_ATTRS = ['block_shedding', 'taking_on_blocks', 'play_strength', 'pad_level'] as const;
const COUNTER_ATTR = 'inside_counter';

export interface Interact {
  readonly stage: PlayStage;
  /** Hand this to `createMovement({ engagementLimit })`. */
  readonly limit: EngagementLimit;
  /** Hand this to `createMovement({ slipping })`: true for a defender in the free time after he shed a block. */
  readonly slipping: (world: TickWorld, slot: number) => boolean;
  /**
   * Call before the loop's `begin`. `startAdvantage(blockerSlot, defenderSlot)` gives the J5.6.1
   * get-off term for the first contest of a defender; null when the play has no snap count.
   */
  setPlay(contests: Contests, startAdvantage: ((blocker: number, defender: number) => number) | null): void;
  /** True while contest `index` of `world.contests` is still being fought. */
  isOpen(index: number): boolean;
  /**
   * The play's bound protection (F5, J5.4.2), or null for none. Call after `setPlay`. With one, a pass blocker in it
   * takes only the man, the gap or the scan list the binding gave him until he is let go to look for work
   * (J6.2.3), and a rusher nobody has runs free unless a blocker with no work reaches him late (J6.2.4).
   * `passer` answers the slot of the passer in the pocket, or -1: unblocked pressures are noted against him.
   */
  setProtection(binding: ProtectionBinding | null, passer: (() => number) | null): void;
  /** The football-lang block target of an offensive slot under the bound protection (`Ctx.blockTarget`). */
  blockTarget(world: TickWorld, slot: number): number;
}

export function createInteract(): Interact {
  let contests: Contests | null = null;
  let startAdvantage: ((blocker: number, defender: number) => number) | null = null;
  let p: TickResolverParams | null = null;
  const open: boolean[] = [], interior: boolean[] = [], held: number[] = [], countered: boolean[] = [];
  const freeUntil = new Int32Array(SLOT_COUNT), everEngaged = new Uint8Array(SLOT_COUNT);
  let binding: ProtectionBinding | null = null, passer: (() => number) | null = null;
  // Per defender: 1 once an unblocked pressure was noted for him this play.
  const freeNoted = new Uint8Array(SLOT_COUNT);
  /** `beaten[blocker * SLOT_COUNT + coverMan]`: this blocker's hold-up of this cover man is over for the play. */
  const beaten = new Uint8Array(SLOT_COUNT * SLOT_COUNT);

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
    // A protector on a kicking unit who has gone to cover the kick has let go of his man: the block is over.
    if (isDown(w, o) || isDown(w, d) || pl.hasBall[o] === 1 || pl.hasBall[d] === 1 || gap(w, o, d) > q['interact.breakGapYd']! || COVERING.has(pl.behavior[o]!)) { close(w, i); return; }
    // Help that has drifted off or gone down stops counting; the contest itself goes on.
    for (let k = c.helperSlots.length - 1; k >= 0; k--) {
      const h = c.helperSlots[k]!;
      if (isDown(w, h) || gap(w, h, d) > q['interact.breakGapYd']!) { if (pl.engagement[h] === i) pl.engagement[h] = -1; c.helperSlots.splice(k, 1); }
    }
    const pass = c.type === 'passBlock';
    // The players' own difference is scaled by the contest's rating response; help is a fact of numbers, not of skill, and is not.
    let dz = (pass ? lib.passRush.skillGain() : lib.runBlock.skillGain()) * (zEff(w, o, pass ? PASS_BLOCK_ATTRS : RUN_BLOCK_ATTRS) - zEff(w, d, pass ? PASS_RUSH_ATTRS : RUN_DEFENSE_ATTRS));
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
    // A block on a man covering a kick is a hold-up, not a sustained block (F12): in the open field a blocker cannot
    // stay on a man running past him without holding. The cover man is off it after `interact.coverHoldS`, later when
    // the blocker is winning and sooner when he is losing, and that blocker does not get him a second time.
    if (!pass && COVERING.has(pl.behavior[d]!) && a > -1 && a < 1 && (w.tick - c.startedTick) * TICK_S >= q['interact.coverHoldS']! * (1 + a)) {
      freeUntil[d] = w.tick + Math.round(q['interact.shedFreeS']! / TICK_S);
      beaten[o * SLOT_COUNT + d] = 1;
      for (let k = 0; k < c.helperSlots.length; k++) beaten[c.helperSlots[k]! * SLOT_COUNT + d] = 1;
      close(w, i);
      return;
    }
    if (a <= -1) { freeUntil[d] = w.tick + Math.round(q['interact.shedFreeS']! / TICK_S); won(w, i, d, o); return; }
    if (a >= 1) { pl.onGroundUntilTick[d] = w.tick + 1 + Math.round(q['interact.wonRecoveryS']! / TICK_S); won(w, i, o, d); return; }
    if (!pass && a > 0) {
      // J6.3.1: the blocker moves the defender along the block's direction, taken here as blocker to defender.
      const dx = pl.posX[d]! - pl.posX[o]!, dy = pl.posY[d]! - pl.posY[o]!, len = dSqrt(dx * dx + dy * dy);
      if (len > 0) { const m = lib.runBlock.displacementYps(a) * TICK_S / len; pl.posX[d] = pl.posX[d]! + dx * m; pl.posY[d] = pl.posY[d]! + dy * m; }
    }
    // Two men locked up are bodies (J6.1.2): a blocker does not run through his man, and a defender working
    // through a block carries the blocker with him. The blocker is the one moved, back to contact.
    standOff(w, o, d);
    for (let k = 0; k < c.helperSlots.length; k++) standOff(w, c.helperSlots[k]!, d);
  };

  const standOff = (w: TickWorld, o: number, d: number): void => {
    const pl = w.players, dx = pl.posX[o]! - pl.posX[d]!, dy = pl.posY[o]! - pl.posY[d]!, len = dSqrt(dx * dx + dy * dy);
    const min = w.slots[o]!.movement.bodyRadiusYd + w.slots[d]!.movement.bodyRadiusYd;
    if (len >= min) return;
    if (len > 0) { pl.posX[o] = pl.posX[d]! + (dx / len) * min; pl.posY[o] = pl.posY[d]! + (dy / len) * min; }
    else pl.posX[o] = pl.posX[d]! - min * pl.attackDir[o]!;
  };

  const lateral = (w: TickWorld, s: number): number => { const y = w.players.posY[s]! - w.frame.originY; return y < 0 ? -y : y; };
  const centres = (w: TickWorld, a: number, b: number): number => {
    const dx = w.players.posX[a]! - w.players.posX[b]!, dy = w.players.posY[a]! - w.players.posY[b]!;
    return dSqrt(dx * dx + dy * dy);
  };
  /** True when no other free pass protector is nearer rusher `d` than `b` is. A tie goes to the man nearer the ball. */
  const ownsRusher = (w: TickWorld, b: number, d: number): boolean => {
    const pl = w.players, side = w.slots[b]!.side, mine = centres(w, b, d);
    for (let o = 0; o < SLOT_COUNT; o++) {
      if (o === b || w.slots[o]!.side !== side || !PASS_BLOCKERS.has(pl.behavior[o]!) || pl.engagement[o]! >= 0 || pl.hasBall[o] === 1 || isDown(w, o)) continue;
      const his = centres(w, o, d);
      if (his < mine || (his === mine && lateral(w, o) < lateral(w, b))) return false;
    }
    return true;
  };
  /** True when a free opponent within `rangeYd` of protector `b` is his to block. */
  const hasOwnRusher = (w: TickWorld, b: number, rangeYd: number): boolean => {
    const pl = w.players, side = w.slots[b]!.side;
    for (let d = 0; d < SLOT_COUNT; d++) {
      if (w.slots[d]!.side === side || pl.engagement[d]! >= 0 || pl.hasBall[d] === 1 || isDown(w, d)) continue;
      if (centres(w, b, d) <= rangeYd && ownsRusher(w, b, d)) return true;
    }
    return false;
  };

  // ---- The bound protection (F5, J5.4.2, J6.2.4).
  const depthOf = (w: TickWorld, d: number): number => (w.players.posX[d]! - w.frame.originX) * w.frame.attackDir;
  const lateralOf = (w: TickWorld, d: number): number => (w.players.posY[d]! - w.frame.originY) * w.frame.attackDir;
  /** He is rushing: across the line, or closing on it from depth. */
  const coming = (w: TickWorld, d: number, q: TickResolverParams): boolean => {
    if (isDown(w, d)) return false;
    const px = depthOf(w, d), closing = -w.players.velX[d]! * w.frame.attackDir;
    // On the line he is a rusher until he backs off it; from depth he is one when he closes on it.
    if (px <= q['interact.onLineDepthYd']!) return closing > -q['interact.comingYps']!;
    return px <= q['interact.comingDepthYd']! && closing > q['interact.comingYps']!;
  };
  const lookingForWork = (w: TickWorld): boolean => contests !== null && contests.passRush.slideHelpReady((w.tick + 1) * TICK_S);
  /**
   * Who blocker `b` has right now under the binding: a world slot; -1 nobody, free to help; -2 nobody yet, waiting
   * (a back whose scan has not shown a rusher); -3 he is not in the protection.
   */
  const assigned = (w: TickWorld, b: number, q: TickResolverParams): number => {
    if (binding === null || b >= binding.man.length) return NOT_IN_PROTECTION;
    const m = binding.man[b]!;
    if (m === NOT_IN_PROTECTION) return NOT_IN_PROTECTION;
    const z = binding.zone[b];
    const slides = z !== null && z !== undefined;
    // His man, while he comes. A man blocker waits on him until the look-for-work time (J6.2.3); a slide man
    // has the gap, not the man, so he lets a dropper go at once.
    if (m >= 0 && !isDown(w, m) && (coming(w, m, q) || w.players.engagement[b]! >= 0 || (!slides && !lookingForWork(w)))) return m;
    if (m >= 0 && !slides) return -1;
    const list = binding.scan[b];
    if (list !== null && list !== undefined) {
      // F5.5.1: the first on his list who comes; with two coming he has the inside one.
      for (let i = 0; i < list.length; i++) if (coming(w, list[i]!, q) && everEngaged[list[i]!] === 0) return list[i]!;
      return lookingForWork(w) ? -1 : -2;
    }
    if (slides) {
      // F5.4.1: whoever enters his gap, the nearest the line first.
      let best = -1, bestPx = Infinity;
      for (let d = SLOTS_PER_TEAM; d < SLOT_COUNT; d++) {
        if (!coming(w, d, q) || w.players.engagement[d]! >= 0) continue;
        const py = lateralOf(w, d), px = depthOf(w, d);
        if (py >= z[0] - q['interact.zoneSlackYd']! && py <= z[1] + q['interact.zoneSlackYd']! && px < bestPx) { best = d; bestPx = px; }
      }
      return best;
    }
    return -1;
  };
  /** Some blocker of the protection has defender `d` as his man right now. */
  const accountedFor = (w: TickWorld, d: number, q: TickResolverParams): boolean => {
    if (binding === null) return true;
    for (let b = 0; b < binding.man.length; b++) if (binding.man[b] !== NOT_IN_PROTECTION && assigned(w, b, q) === d) return true;
    return false;
  };

  const tryOpen = (w: TickWorld, b: number, q: TickResolverParams): void => {
    const pl = w.players, beh = pl.behavior[b]!, pass = PASS_BLOCKERS.has(beh);
    if (!pass && !RUN_BLOCKERS.has(beh)) return;
    if (pl.engagement[b]! >= 0 || pl.hasBall[b] === 1 || isDown(w, b)) return;
    const side = w.slots[b]!.side, reach = q['interact.contactGapYd']!;
    // Under a bound protection he takes his own man at once; anyone else only as help on a block already made, or,
    // once he is let go to look for work, late (J6.2.3, J6.2.4).
    const mine = pass && b < SLOTS_PER_TEAM ? assigned(w, b, q) : NOT_IN_PROTECTION;
    const bound = mine !== NOT_IN_PROTECTION, work = bound && mine === -1 && lookingForWork(w);
    let best = -1, bestGap = reach;
    for (let d = 0; d < SLOT_COUNT; d++) {
      if (w.slots[d]!.side === side || pl.hasBall[d] === 1 || isDown(w, d) || w.tick < freeUntil[d]! || beaten[b * SLOT_COUNT + d] === 1) continue;
      const e = pl.engagement[d]!;
      if (bound && d !== mine && (mine >= 0 || (e < 0 && (!work || accountedFor(w, d, q))))) continue;
      // An opponent who is himself blocking someone, or who already has two men on him, is not picked up.
      if (e >= 0 && (w.contests[e]!.defenseSlot !== d || w.contests[e]!.helperSlots.length > 0)) continue;
      const g = gap(w, b, d);
      if (g > bestGap) continue;
      // Pass protection (J6.2.1): the rusher belongs to the free protector nearest him, so two men do not
      // take one rusher at the snap while the man beside him comes free. Help goes to a blocked rusher only
      // from a protector who has no free rusher of his own near.
      if (pass && (e < 0 ? !ownsRusher(w, b, d) : hasOwnRusher(w, b, q['interact.helpClearYd']!))) continue;
      if (g < bestGap || best < 0) { best = d; bestGap = g; }
    }
    if (best < 0) return;
    const existing = pl.engagement[best]!;
    if (existing >= 0) { w.contests[existing]!.helperSlots.push(b); pl.engagement[b] = existing; return; }
    const type: ContestType = pass ? 'passBlock' : 'runBlock';
    const idB = w.slots[b]!.playerId, idD = w.slots[best]!.playerId, sit = w.situation;
    const first = everEngaged[best] === 0;
    everEngaged[best] = 1;
    // J6.2.4: a rusher the protection did not expect (not a line threat, the Mike or on a scan list when it was set)
    // is picked up late, whether he lands in a slider's gap or on a man looking for work.
    const late = bound && RUSHERS.has(pl.behavior[best]!) && !binding!.expected.includes(best);
    const index = w.contests.length;
    w.contests.push({
      type, offenseSlot: b, defenseSlot: best, advantage: late ? contests!.passRush.startAdvantage('lateRecognition') : first && startAdvantage !== null ? startAdvantage(b, best) : 0, startedTick: w.tick, helperSlots: [],
      stream: w.streams('contest', [sit.gameId, sit.playNumber, idB < idD ? idB : idD, idB < idD ? idD : idB, type]),
    });
    const py = (pl.posY[best]! - w.frame.originY) * w.frame.attackDir;
    open[index] = true; interior[index] = (py < 0 ? -py : py) <= q['interact.interiorHalfWidthYd']!; held[index] = 0; countered[index] = false;
    pl.engagement[b] = index; pl.engagement[best] = index;
    if (late) w.emit({ type: 'detail', t: roundSimS((w.tick + 1) * TICK_S), code: 'protection.late_pickup', playerIds: [idB, idD], spot: null, value: null });
  };

  /** J6.2.4: a rusher no blocker ever touched who reaches the passer's pressure distance is an unblocked pressure. Noted once each. */
  const noteFree = (w: TickWorld, q: TickResolverParams): void => {
    const c = w.ball.kind === 'held' ? w.ball.carrierSlot : -1;
    if (c < 0 || passer === null || c !== passer() || depthOf(w, c) > 0) return;
    const pl = w.players, reach = q['interact.freePressureYd']!;
    for (let d = SLOTS_PER_TEAM; d < SLOT_COUNT; d++) {
      if (everEngaged[d] === 1 || freeNoted[d] === 1 || isDown(w, d) || !RUSHERS.has(pl.behavior[d]!)) continue;
      const dx = pl.posX[d]! - pl.posX[c]!, dy = pl.posY[d]! - pl.posY[c]!;
      if (dSqrt(dx * dx + dy * dy) > reach) continue;
      freeNoted[d] = 1;
      w.emit({ type: 'detail', t: roundSimS((w.tick + 1) * TICK_S), code: 'protection.unblocked_pressure', playerIds: [w.slots[d]!.playerId], spot: null, value: null });
    }
  };

  const stage: PlayStage = {
    name: 'interact',
    begin(w: TickWorld): void {
      p = tickResolverParams(w.params);
      open.length = 0; interior.length = 0; held.length = 0; countered.length = 0;
      freeUntil.fill(-2147483648); everEngaged.fill(0); freeNoted.fill(0); beaten.fill(0);
    },
    run(w: TickWorld): void {
      if (w.tick < 0 || w.deadAtTick !== null || contests === null) return;
      const q = p ?? (p = tickResolverParams(w.params));
      const n = w.contests.length;
      for (let i = 0; i < n; i++) if (open[i]) step(w, i, q);
      for (let b = 0; b < SLOT_COUNT; b++) tryOpen(w, b, q);
      if (binding !== null) noteFree(w, q);
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
    slipping: (w, slot) => w.tick >= 0 && w.tick < freeUntil[slot]!,
    setPlay(c, start) { contests = c; startAdvantage = start; binding = null; passer = null; },
    setProtection(b, who) { binding = b; passer = who; },
    blockTarget: (w, slot) => { const t = assigned(w, slot, p ?? (p = tickResolverParams(w.params))); return t === NOT_IN_PROTECTION ? -1 : t; },
    isOpen: (index) => open[index] === true,
  };
}
