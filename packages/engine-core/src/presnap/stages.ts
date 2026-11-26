// The pre-snap phase as tick stages (J1.3.2, J5.8.1). A Decide stage moves every slot toward its
// planned target on each negative tick (the Move stage of WP-09 does the moving, so film shows the
// picture evolving at 0.1 s), and a Detect stage commits the planned fouls, checks motion and
// formation legality at the snap tick from the real positions and velocities, and makes the snap
// (J5.6.2). Nothing runs after the snap tick; the live-play stages own tick 0 onward.
import {
  SLOT_COUNT, SLOTS_PER_TEAM, TICK_S, issToZ, roundSimS, roundYd,
  type DeterministicMath, type PlayPoint, type TickWorld, type TruthEvent, type TruthEventOf,
} from '@gm/schema';
type FoulPhase = TruthEventOf<'foul_committed'>['phase'];
import { legality } from '@gm/football-lang';
import { CONTEST_MATH } from '../contest/math.ts';
import type { PlayStage } from '../tick/loop.ts';
import { presnapParams, type PresnapFoulId, type PresnapParams } from './params.ts';
import { snapperOf, snapReceiverOf, type PresnapInput, type PresnapPlan } from './plan.ts';

/** What the snap produced (J5.6.2). `extraS` is the time an off-target snap adds to the quarterback's timing. */
export interface SnapResult { readonly quality: 'clean' | 'off_target' | 'loose'; readonly extraS: number; readonly snapperSlot: number; readonly receiverSlot: number }

export interface PresnapStages {
  readonly stages: readonly PlayStage[];
  /** Set at the snap tick; null before it or when the play died before the snap. */
  snap(): SnapResult | null;
}

/** Finding codes from the legality checker to foul catalogue ids (WP-01 `fouls.json`). */
const CATALOGUE_OF: Readonly<Record<string, PresnapFoulId>> = {
  illegal_formation: 'illegal_formation', illegal_shift: 'illegal_shift', illegal_motion: 'illegal_motion', too_many_players: 'too_many_on_field',
};

/** Keys the legality checker reads that the rule data does not carry yet (WP-10 proposed keys). */
const LEGALITY_KEYS = ['numbering.eligible_low_max', 'numbering.eligible_high_min', 'numbering.eligible_high_max', 'formation.neither_behind_snapper_max', 'formation.t_quarterback_depth_yd'];

export function createPresnapStages(plan: PresnapPlan, input: PresnapInput): PresnapStages {
  const targets: { px: number; py: number }[] = [];
  for (let s = 0; s < SLOT_COUNT; s++) targets.push({ px: 0, py: 0 });
  let snapResult: SnapResult | null = null;
  const qbTs = snapReceiverOf(input.offense.assignments), centreTs = snapperOf(input.offense.assignments);

  const decide: PlayStage = {
    name: 'decide',
    begin(w: TickWorld): void {
      if (w.tick !== 0 && w.tick !== plan.firstTick) throw new Error(`pre-snap phase starts at tick ${plan.firstTick}; a fresh world is at 0, this one is at ${w.tick}`);
      w.tick = plan.firstTick;
      snapResult = null;
    },
    run(w: TickWorld): void {
      if (w.tick >= 0 || w.deadAtTick !== null) return;
      const jog = presnapParams(w.params)['sub.jogSpeedYps']!;
      const ms = w.players, f = w.frame;
      for (let s = 0; s < SLOT_COUNT; s++) {
        const list = plan.targets[s]!;
        let cur = -1;
        for (let i = 0; i < list.length; i++) if (list[i]!.fromTick <= w.tick) cur = i;
        const it = w.intents[s]!;
        if (cur < 0) { it.target = null; it.targetVelPx = 0; it.targetVelPy = 0; it.moveMode = 'stance'; continue; }
        const tg = targets[s]!;
        tg.px = list[cur]!.px; tg.py = list[cur]!.py;
        if (s === plan.follower && plan.motionSlot >= 0 && w.tick >= plan.motionStartTick) {
          // J5.3.2: a man defender (or a bluffing zone defender) runs with the motion man.
          tg.py = (ms.posY[plan.motionSlot]! - f.originY) * f.attackDir;
        }
        const px = (ms.posX[s]! - f.originX) * f.attackDir, py = (ms.posY[s]! - f.originY) * f.attackDir;
        const dx = tg.px - px, dy = tg.py - py;
        const isMotion = s === plan.motionSlot && w.tick >= plan.motionStartTick;
        const vmax = w.slots[s]!.movement.vMaxYps;
        it.target = tg as PlayPoint;
        it.faceTarget = null;
        it.effort = isMotion ? 1 : (jog < vmax ? jog / vmax : 1);
        it.arrival = isMotion ? 'through' : 'arrive';
        it.moveMode = dx * dx + dy * dy > 0 || isMotion ? 'run' : 'stance';
      }
    },
  };

  const emitFoul = (w: TickWorld, foulId: PresnapFoulId, slot: number | null, t: number, deadBall: boolean, phase: FoulPhase): void => {
    const side = slot === null
      ? (foulId === 'too_many_on_field' || foulId === 'offside' || foulId === 'encroachment' || foulId === 'neutral_zone_infraction' ? (w.situation.offense === 0 ? 1 : 0) : w.situation.offense)
      : w.slots[slot]!.side;
    const x = slot === null ? w.ball.x : w.players.posX[slot]!, y = slot === null ? w.ball.y : w.players.posY[slot]!;
    w.emit({
      type: 'foul_committed', t: roundSimS(t), foulId, side, playerId: slot === null ? null : w.slots[slot]!.playerId,
      spot: { x: roundYd(x), y: roundYd(y) }, timing: deadBall ? 'before_snap' : 'live', phase, severity: presnapParams(w.params)['foul.severity']!,
      visibility: 'open', atPointOfAttack: false, flagrant: false, borderline: false, ordered: false,
    });
  };

  const detect: PlayStage = {
    name: 'detect',
    run(w: TickWorld): void {
      if (w.tick >= 0 || w.deadAtTick !== null) return;
      const t = w.tick * TICK_S;
      // Mental errors are part of the truth record from the phase start (J4.5.3).
      if (w.tick === plan.firstTick) {
        for (const m of plan.mentalErrors) w.emit({ type: 'mental_error', t: roundSimS(t), playerId: w.slots[m.slot]!.playerId, cause: m.cause, form: m.form });
        for (const e of plan.log) {
          if (e.status === 'done') continue;
          w.emit({ type: 'detail', t: roundSimS(t), code: `presnap.${e.status}.${e.action}`, playerIds: [], spot: null, value: e.side });
        }
        for (const s of plan.missing) w.emit({ type: 'detail', t: roundSimS(t), code: 'presnap.short_handed', playerIds: [w.slots[s]!.playerId], spot: null, value: null });
      }
      if (w.tick !== -1) return;
      // Last pre-snap tick. Dead-ball fouls kill the play before it starts.
      const dead = plan.fouls.filter((x) => x.deadBall);
      if (dead.length > 0) {
        for (const fl of dead) emitFoul(w, fl.foulId, fl.slot, fl.foulId === 'delay_of_game' ? 0 : t, true, input.snapFoulPhase);
        w.deadAtTick = w.tick;
        w.emit({ type: 'dead_ball', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', reason: 'pre_snap_foul', spot: { x: roundYd(w.ball.x), y: roundYd(w.ball.y) }, side: null, carrierId: null });
        return;
      }
      // Live fouls at the snap.
      for (const fl of plan.fouls) emitFoul(w, fl.foulId, fl.slot, 0, false, input.snapFoulPhase);
      // B4.3.3 and B4.2.1 from the real positions and velocities of the offense at the snap tick.
      const have = new Set(w.rules.keys());
      if (LEGALITY_KEYS.every((k) => have.has(k))) {
        const f = w.frame, ms = w.players, stillYps = w.params.num('legality.motion.stationaryYps');
        const players: legality.AlignedPlayer[] = [];
        const slotOf: number[] = [];
        for (let s = 0; s < SLOTS_PER_TEAM; s++) {
          if (plan.missing.includes(s)) continue;
          const vpx = ms.velX[s]! * f.attackDir, vpy = ms.velY[s]! * f.attackDir;
          const a = input.offense.assignments[s]!;
          players.push({
            role: a.role, px: (ms.posX[s]! - f.originX) * f.attackDir, py: (ms.posY[s]! - f.originY) * f.attackDir,
            onLine: a.preSnap.onLine && (ms.posX[s]! - f.originX) * f.attackDir > -w.params.num('legality.line.clearlyOffYd'),
            jersey: w.slots[s]!.player.jersey, inMotion: vpx * vpx + vpy * vpy > stillYps * stillYps, velPx: vpx, velPy: vpy,
          });
          slotOf.push(s);
        }
        const report = legality.analyseAlignment(players, w.rules, w.params);
        // B4.2.1, B5: who is an eligible receiver on this down, by position and number, for every later stage (`SimArrays.eligible`).
        for (let k = 0; k < slotOf.length; k++) ms.eligible[slotOf[k]!] = report.eligible[k] ? 1 : 0;
        const seen = new Set<string>();
        for (const fd of report.findings) {
          const id = fd.foul ? CATALOGUE_OF[fd.foul] : undefined;
          if (!id || seen.has(id) || !w.rules.bool(`foul.${id}.exists`)) continue;
          if (id === 'illegal_shift' && plan.fouls.some((x) => x.foulId === 'illegal_shift')) continue;
          seen.add(id);
          const k = players.findIndex((x) => x.role === fd.role);
          emitFoul(w, id, k >= 0 ? slotOf[k]! : null, 0, false, input.snapFoulPhase);
        }
      } else {
        w.emit({ type: 'detail', t: 0, code: 'presnap.legality_keys_missing', playerIds: [], spot: null, value: null });
      }
      snapResult = makeSnap(w, input, qbTs, centreTs);
    },
  };

  return { stages: [decide, detect], snap: () => snapResult };
}

/** J5.6.2 snap exchange: an event contest on stream `contest` (centre, receiver, `snap`), J6.1.3. Two uniforms, always. */
function makeSnap(w: TickWorld, input: PresnapInput, qbTs: number, centreTs: number): SnapResult {
  const p = presnapParams(w.params), sit = w.situation;
  const snapper = centreTs >= 0 ? centreTs : 0, receiver = qbTs >= 0 ? qbTs : snapper;
  const a = w.slots[snapper]!, b = w.slots[receiver]!;
  const lo = Math.min(a.playerId, b.playerId), hi = Math.max(a.playerId, b.playerId);
  const st = w.streams('contest', [sit.gameId, sit.playNumber, lo, hi, 'snap']);
  const u1 = st.uniform(), u2 = st.uniform();
  const kicking = input.offense.assignments[receiver]!.behavior.type !== 'quarterback';
  const snapAttr = kicking ? 'long_snap' : input.shotgun ? 'snap_shotgun' : 'snap_under_center';
  const handAttr = input.offense.assignments[receiver]!.behavior.type === 'holder' ? 'holding' : 'snap_handling';
  const dz = (issToZ(a.player.attributes[snapAttr] ?? 50) + issToZ(b.player.attributes[handAttr] ?? 50)) / 2;
  const wet = w.environment.precip !== 'none' || w.environment.surfaceCondition !== 'dry';
  const [pLoose, pOff] = badSnapChances(dz, wet, input.silentCount, input.shotgun || kicking, p, w.math);
  const quality: SnapResult['quality'] = u1 < pLoose ? 'loose' : u1 < pLoose + pOff ? 'off_target' : 'clean';
  const extraS = quality === 'off_target' ? p['snap.offTargetMinS']! + u2 * (p['snap.offTargetMaxS']! - p['snap.offTargetMinS']!) : 0;
  const spot = { x: roundYd(w.players.posX[receiver]!), y: roundYd(w.players.posY[receiver]!) };
  const ev: TruthEvent[] = [{ type: 'snap', t: 0, snapperId: a.playerId, toPlayerId: b.playerId, quality }];
  const ball = w.ball;
  ball.lastPossessorSlot = snapper;
  if (quality === 'loose') {
    ball.kind = 'loose'; ball.carrierSlot = -1;
    ev.push({ type: 'fumble', t: 0, marginYd: null, marginS: null, visibility: 'crowded', kind: 'bad_snap', playerId: b.playerId, side: b.side, forcedById: null, spot });
  } else {
    ball.kind = 'held'; ball.carrierSlot = receiver; ball.lastPossessorSlot = receiver; w.players.hasBall[receiver] = 1;
    ball.x = w.players.posX[receiver]!; ball.y = w.players.posY[receiver]!;
    ev.push({ type: 'possession', t: 0, side: b.side, playerId: b.playerId, spot, how: 'snap' });
  }
  for (const e of ev) w.emit(e);
  return { quality, extraS, snapperSlot: snapper, receiverSlot: receiver };
}

/**
 * J5.6.2 bad-snap chances [loose, off target] for a pairing `dz` (mean z of the snap and handling
 * grades), as event contests (J6.1.3). Better pairs make bad snaps rarer; a wet ball and a silent
 * count make them more common. Under centre the off-target rate is lower (starting values, Assumption).
 */
export function badSnapChances(dz: number, wet: boolean, silent: boolean, shotgunOrKick: boolean, p: PresnapParams, math: DeterministicMath): [number, number] {
  const ctx = { wet: wet ? 1 : 0, silent: silent ? 1 : 0 };
  const gamma = { wet: p['snap.wetGamma']!, silent: p['snap.silentGamma']! };
  const offBase = p['snap.offTargetShotgun']! * (shotgunOrKick ? 1 : p['snap.underCenterOffTargetMult']!);
  const looseBase = p['snap.looseShotgun']! * (shotgunOrKick ? 1 : p['snap.underCenterLooseMult']!);
  const logit = (q: number) => math.log(q / (1 - q));
  const pOff = CONTEST_MATH.eventProbability(-dz, ctx, { beta0: logit(offBase), beta1: p['snap.beta1']!, gamma }, math);
  const pLoose = CONTEST_MATH.eventProbability(-dz, ctx, { beta0: logit(looseBase), beta1: p['snap.beta1']!, gamma }, math);
  return [pLoose, pOff];
}
