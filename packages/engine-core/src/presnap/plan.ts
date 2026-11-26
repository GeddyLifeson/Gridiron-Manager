// The pre-snap planner (J5.1 to J5.8). At the start of the phase every draw is taken in the fixed J5
// order (draws.ts), every decision that the draws and the clock settle is made, and the two lanes are
// scheduled against the play clock (J5.8.1). The result is a plan the tick stages (stages.ts) execute
// over negative ticks, so film shows the pre-snap picture evolving. The play clock runs through the
// whole phase: one tenth per tick, never paused.
import {
  SLOTS_PER_TEAM, TICKS_PER_SECOND, issToZ,
  type Assignment, type PlayPoint, type TickWorld, type TruthEventOf,
} from '@gm/schema';
import { callDeliveryChance, perceptionParams, type PerceptionParams } from '../perception/index.ts';
type FoulPhase = TruthEventOf<'foul_committed'>['phase'];
import { READING, opposingElevenZ } from '../tick/opposition.ts';
import { drawTeam, type TeamDraws } from './draws.ts';

/** Internal skill scale points per standard deviation (schema `issToZ`). */
const ISS_PER_Z = 10;
import {
  alignTravelS, audibleCostS, checkDurationS, checkRecognitionS, classifyDefensiveForm, defenderKeyDelayS, defensiveOffsideChance,
  disguiseQualityOf, falseStartChance, holdEndS, huddleDeliveryChance, noHuddleDeliveryChance, offenseStartS, protectionRecognitionChance,
  relayGarbleChance, relayTimeS, type RelayInput,
  readCorrectChance, runOnS, unitLateS, unitSetS, snapMotionSdS, substitutionErrorChance, targetClockAtSnapS, tightenSplit, unblockedAfterSet,
  type DefensiveForm, type Tempo, type Venue,
  type UnitChange,
} from './formulas.ts';
import { presnapParams, type PresnapFoulId, type PresnapParams } from './params.ts';

// ------------------------------------------------------------------------------------------- inputs

export type PictureTrigger = 'empty' | 'bunch' | 'motion' | 'shift' | 'tempo';
export type ReadTrigger = 'box_loaded' | 'one_high' | 'two_high' | 'zero' | 'man' | 'zone' | 'pressure';

/** A defensive check rule installed in the week (G2, F11, J5.5.2). Checked in priority order. */
export interface DefensiveCheck { readonly name: string; readonly trigger: PictureTrigger }
/** A packaged call or audible at the line (I2.5.1, J5.4.3). `boxAtLeast` is read by `box_loaded`. */
export interface Audible { readonly name: string; readonly trigger: ReadTrigger; readonly kind: 'kill' | 'audible'; readonly boxAtLeast?: number }
/** One disguising defender: where he shows before he stems to his true spot (J5.5.1). */
export interface Disguise { readonly teamSlot: number; readonly shown: PlayPoint }

export interface PresnapSide {
  /** Team-slot order 0 to 10, bound by J4.3: `preSnap.align` is the spot in the play frame. */
  readonly assignments: readonly Assignment[];
  /** Team slots that run on from the bench this play (J5.1.1). */
  readonly substituted: readonly number[];
  /** Seconds the call reached the field after its latest-call mark (I2.1.1); 0 on time. */
  readonly callLateS: number;
  /** Readiness of the package 0 to 100 (D9 knowledge and reps). */
  readonly packageReadiness: number;
  /** Team slot of the player who relays the call: quarterback or defensive signal caller. */
  readonly signalCaller: number;
  /** Crowd noise this side's players hear, 0 to 1 (J12.6.1). */
  readonly noise: number;
  /** J12.8.1 residual familiarity: a z bonus to this side's communication at its home venue. Absent: 0. */
  readonly familiarityZ?: number;
}

export interface PresnapDefense extends PresnapSide {
  readonly coverage: 'man' | 'zone';
  /** Man match: offensive team slot to defensive team slot (J5.3.2). */
  readonly manMatch: Readonly<Record<number, number>>;
  /** Give a false tell on motion in zone ("lock and bluff", J5.3.2). */
  readonly bluff: boolean;
  readonly checks: readonly DefensiveCheck[];
  readonly disguise: readonly Disguise[];
  /** The pressure shows more or fewer than it brings (J5.4.2 step 5). */
  readonly simulatedPressure: boolean;
  /** Get-off aggression in the call (G2, J5.7.1). */
  readonly aggressiveGetOff: boolean;
}

export interface PresnapOffense extends PresnapSide {
  /** Two or more players move together after the first set (J5.3.1). Spots are play frame. */
  readonly shift: readonly { readonly teamSlot: number; readonly to: PlayPoint; readonly onLine: boolean }[] | null;
  /** The motion man and how long before the snap he starts ("snap when he reaches the tackle"). His path is his `preSnap.motion`. */
  readonly motion: { readonly teamSlot: number; readonly leadS: number } | null;
  readonly audibles: readonly Audible[];
  /** Quarterback freedom allows him to redirect the slide (I2.5.2). */
  readonly canRedirect: boolean;
  /** Opponent preparation item 0 to 1 (D9.6.1). */
  readonly prepared: number;
}

export interface PresnapInput {
  readonly tempo: Tempo;
  /** Play-clock reading when the phase starts (the ready signal or the huddle), integer tenths. */
  readonly playClockStartTenths: number;
  /** Spoken length of the call, in words (I2.4.2). */
  readonly callWords: number;
  readonly hardCount: boolean;
  readonly silentCount: boolean;
  readonly longCount: boolean;
  /** Snaps this game on the count being used (J5.6.1 anticipation). */
  readonly snapsOnSameCount: number;
  readonly shotgun: boolean;
  /** Home, road or neutral for the offense; the defense is the other (J5.7.1 venue term). */
  readonly venue: Venue;
  /** Phase a foul at the snap belongs to (B8.1.1), from the call's kind. */
  readonly snapFoulPhase: FoulPhase;
  readonly offense: PresnapOffense;
  readonly defense: PresnapDefense;
  /** I4.1.1 a kicking unit comes on for this snap: its time to set is charged and a change of mind raises the substitution hazard. Null or absent: no unit change. */
  readonly unitChange?: UnitChange | null;
  /**
   * Who takes the snap and how it gets there, when the play says so (F12.7.1: a scrimmage play out of a
   * kicking formation; a direct snap). Null or absent: the quarterback, else the holder, else the punter,
   * and the ball is in his hands at tick 0.
   */
  readonly snap?: SnapSpec | null;
  /**
   * I2.1.1 stages 1 to 3 (spotting, decision, relay) for a play called from the sideline: they run on the play
   * clock before the huddle, so `playClockStartTenths` is then the reading when the ball became dead. Null or
   * absent: the phase starts at `playClockStartTenths` with the call already in.
   */
  readonly relay?: RelayInput | null;
  /** Test switch for J5.4.2 acceptance 1 ("errors disabled"): every recognition and delivery succeeds. Draws are still taken. */
  readonly errorsDisabled?: boolean;
}

/** The snap of a play that names its own (J5.6.2, J9.1.2). */
export interface SnapSpec {
  /** Team slot the ball is snapped to. */
  readonly toTeamSlot: number;
  /** A long snap: the long snapper's grade against the receiver's hands (the holder's holding), at the shotgun and kick base rates. */
  readonly long: boolean;
  /**
   * Speed of the ball through the air, yards per second. The receiver has it when it has covered the
   * distance, and an off-target snap arrives later by its extra time (a slow, high ball). Null: the
   * ball is in his hands at tick 0, as on every other snap.
   */
  readonly flightYps: number | null;
}

// -------------------------------------------------------------------------------------------- plan

export type LaneAction = 'align_and_set' | 'protection' | 'shift' | 'motion' | 'audible' | 'hard_count'
  | 'personnel_match' | 'front_and_coverage' | 'strength' | 'check' | 'disguise';

export interface LogEntry {
  readonly side: 0 | 1;
  readonly action: LaneAction;
  readonly name: string;
  readonly startS: number;
  readonly endS: number;
  readonly status: 'done' | 'unfinished' | 'dropped';
}

/** One timed movement target of a slot. The stage uses the last whose tick has come. */
export interface TimedTarget { readonly fromTick: number; readonly px: number; readonly py: number }

export interface PlannedFoul {
  readonly foulId: PresnapFoulId;
  readonly slot: number | null;
  /** Dead-ball fouls end the play before the snap (J1.6.1 edge case); live ones are committed at the snap. */
  readonly deadBall: boolean;
}

export type Shell = 'zero' | 'one_high' | 'two_high';

export interface QbPreSnap {
  readonly made: boolean;
  readonly shell: Shell; readonly shellCorrect: boolean;
  readonly man: boolean; readonly manCorrect: boolean;
  readonly box: number; readonly boxCorrect: boolean;
  readonly pressure: boolean; readonly pressureCorrect: boolean;
}

export interface ProtectionResult {
  readonly identifierSlot: number;
  readonly recognized: boolean;
  readonly unblockedLeft: number; readonly unblockedRight: number;
  readonly hot: boolean;
  readonly dropped: boolean;
}

export interface CheckResult { readonly name: string; readonly fired: boolean; readonly completed: boolean; readonly atS: number }

export interface PresnapPlan {
  /** Tick 0 is the snap (J1.3.2). */
  readonly firstTick: number;
  readonly playClockStartTenths: number;
  /** Play clock when the ball is snapped, or when the play dies before the snap. */
  readonly playClockAtSnapTenths: number;
  readonly snapS: number;
  readonly targets: readonly (readonly TimedTarget[])[];
  /** Per slot: received the huddle call, a check, an audible (J5.1.3, J3.6). */
  readonly received: readonly (readonly [boolean, boolean, boolean])[];
  readonly log: readonly LogEntry[];
  readonly fouls: readonly PlannedFoul[];
  readonly qb: QbPreSnap;
  readonly protection: ProtectionResult;
  readonly checks: readonly CheckResult[];
  readonly audible: string | null;
  readonly disguiseQuality: number;
  /** J5.6.1 movement start per slot, seconds after the snap. */
  readonly startS: Float64Array;
  /** Slot that follows the motion man (man lock or bluff), or -1. */
  readonly follower: number;
  readonly motionSlot: number;
  readonly motionStartTick: number;
  /** Slots that never reached the field (a missing substitute). */
  readonly missing: readonly number[];
  /** Mental errors to emit: slot and form (J4.5.3). */
  readonly mentalErrors: readonly { readonly slot: number; readonly cause: 'knowledge' | 'communication'; readonly form: string }[];
  readonly offenseSetS: number;
  /** Seconds the call took to reach the huddle (I2.1.1 stages 1 to 3) and how many times it was sent again (I2.4.1 garble). 0 without a relay. */
  readonly relayS: number;
  readonly relayRepeats: number;
  /** Seconds left on the play clock when the offense is set (J5.8.1), the K1.5.1 time to fix a teammate. */
  readonly setClockLeftS: number;
  readonly draws: readonly [TeamDraws, TeamDraws];
}

/** Defenders this close to the line are down linemen for the offside hazard. Geometry, not a football number. */
const ON_LINE_DEPTH = 1;
/** Even split between the two misalignment forms. */
const HALF = 0.5;

function roleIs(a: Assignment, type: string): boolean { return a.behavior.type === type; }

/** Snap receiver: the man the play names, else the quarterback, else the holder or kicker (punter), else -1. Team slot. */
export function snapReceiverOf(as: readonly Assignment[], spec: SnapSpec | null = null): number {
  if (spec !== null && Number.isInteger(spec.toTeamSlot) && spec.toTeamSlot >= 0 && spec.toTeamSlot < as.length) return spec.toTeamSlot;
  for (const t of ['quarterback', 'holder', 'kicker']) { const i = as.findIndex((a) => roleIs(a, t)); if (i >= 0) return i; }
  return -1;
}

/** Snapper: the snapper behavior, else the player on the line nearest the ball laterally. Team slot. */
export function snapperOf(as: readonly Assignment[]): number {
  const i = as.findIndex((a) => roleIs(a, 'snapper'));
  if (i >= 0) return i;
  let best = -1;
  for (let k = 0; k < as.length; k++) {
    const al = as[k]!.preSnap;
    if (!al.onLine) continue;
    if (best < 0 || Math.abs(al.align.py) < Math.abs(as[best]!.preSnap.align.py)) best = k;
  }
  return best;
}

const iss = (w: TickWorld, slot: number, attr: string): number => w.slots[slot]!.player.attributes[attr] ?? 50;
/** D4.2.2 foul discipline as the pre-snap fouls read it: against how sharp the other eleven is (`foul.opposedShare`). */
const testedDiscipline = (w: TickWorld, slot: number, p: PresnapParams): number =>
  iss(w, slot, 'foul_discipline') - p['foul.opposedShare']! * 10 * opposingElevenZ(w, slot, READING);

function shellOf(depths: readonly number[], highDepth: number): Shell {
  let n = 0;
  for (const d of depths) if (d >= highDepth) n++;
  return n === 0 ? 'zero' : n === 1 ? 'one_high' : 'two_high';
}
/** A wrong read with an honest look takes the nearest other shell. */
const NEIGHBOUR: Readonly<Record<Shell, Shell>> = { zero: 'one_high', one_high: 'two_high', two_high: 'one_high' };

/** Builds the plan. Call once per play, before the first pre-snap tick. */
export function planPresnap(w: TickWorld, input: PresnapInput): PresnapPlan {
  const p: PresnapParams = presnapParams(w.params);
  const pp: PerceptionParams = perceptionParams(w.params);
  const rules = w.rules, math = w.math, sit = w.situation, ok = input.errorsDisabled === true;
  const O = input.offense, D = input.defense;
  if (O.assignments.length !== SLOTS_PER_TEAM || D.assignments.length !== SLOTS_PER_TEAM) throw new Error('pre-snap needs eleven assignments per side');
  const dO = drawTeam(w.streams, sit.gameId, sit.playNumber, w.slots[0]!.side);
  const dD = drawTeam(w.streams, sit.gameId, sit.playNumber, w.slots[SLOTS_PER_TEAM]!.side);
  const log: LogEntry[] = [];
  const mentalErrors: { slot: number; cause: 'knowledge' | 'communication'; form: string }[] = [];
  const fouls: PlannedFoul[] = [];
  const setPeriod = rules.num('formation.shift_set_seconds');
  // I2.1.1 stages 1 to 3: the call's way in runs on the play clock before the huddle; noise garbles it (I2.4.1).
  const relay = input.relay
    ? relayTimeS(input.relay, O.noise, relayGarbleChance(O.noise, input.callWords, p), dO.get('relay', 0, 0), dO.get('relay', 0, 1), dO.get('relay', 0, 2), math, p)
    : { totalS: 0, repeats: 0 };
  const clockStartTenths = Math.max(0, input.playClockStartTenths - Math.round(relay.totalS * TICKS_PER_SECOND));
  const clockStartS = clockStartTenths / TICKS_PER_SECOND;
  const minPy = (0 - w.frame.originY) * w.frame.attackDir, maxPy = (w.geometry.widthYd - w.frame.originY) * w.frame.attackDir;
  const loPy = Math.min(minPy, maxPy), hiPy = Math.max(minPy, maxPy);

  // --- J5.1.1 substitution errors (both sides) and run-on.
  const missing: number[] = [];
  let offenseExtra = false, defenseExtra = false;
  const subDur = [0, 0];
  let subTravelS = 0;
  for (const [side, S, dr] of [[0, O, dO], [1, D, dD]] as const) {
    const pErr = substitutionErrorChance(input.tempo, S.callLateS + (side === 0 ? unitLateS(input.unitChange, p) : 0), S.packageReadiness, p);
    for (const ts of S.substituted) {
      const slot = side * SLOTS_PER_TEAM + ts, a = S.assignments[ts]!;
      const sidelinePy = a.preSnap.align.py >= 0 ? hiPy : loPy;
      const d = Math.abs(sidelinePy - a.preSnap.align.py) + Math.abs(a.preSnap.align.px);
      subDur[side] = Math.max(subDur[side]!, runOnS(d, p));
      if (side === 0) subTravelS = Math.max(subTravelS, alignTravelS(d, p));
      const u = dr.get('substitution', ts);
      if (!ok && u < pErr) {
        if (u < pErr * p['sub.extraShare']!) { if (side === 0) offenseExtra = true; else defenseExtra = true; }
        else missing.push(slot);
        mentalErrors.push({ slot, cause: 'knowledge', form: u < pErr * p['sub.extraShare']! ? 'substitution_extra' : 'substitution_missing' });
      }
    }
  }

  // --- Offensive spots (J5.2.1) with alignment errors (J4.5.3).
  const spot: { px: number; py: number; onLine: boolean }[] = [];
  for (let side = 0; side < 2; side++) {
    const S = side === 0 ? O : D, dr = side === 0 ? dO : dD;
    for (let ts = 0; ts < SLOTS_PER_TEAM; ts++) {
      const a = S.assignments[ts]!;
      let px = a.preSnap.align.px, py = a.preSnap.align.py, onLine = a.preSnap.onLine;
      if (side === 0) py = tightenSplit(py, loPy, hiPy, p);
      const knowledge = w.slots[side * SLOTS_PER_TEAM + ts]!.player.gameDay.knowledge[a.conceptId] ?? S.packageReadiness;
      const pErr = p['align.errorBase']! * Math.max(p['sub.readinessFloor']!, p['sub.readinessIntercept']! - knowledge / p['sub.readinessDivisor']!);
      if (!ok && dr.get('alignment', ts, 0) < pErr) {
        const off = dr.get('alignment', ts, 1) < HALF;
        if (off) { px += (side === 0 ? -1 : 1) * p['align.errorOffYd']!; onLine = false; }
        else py = -py;
        mentalErrors.push({ slot: side * SLOTS_PER_TEAM + ts, cause: 'knowledge', form: off ? 'alignment_depth' : 'alignment_side' });
      }
      spot.push({ px, py, onLine });
    }
  }
  const disguiseBy = new Map<number, Disguise>();
  for (const d of D.disguise) disguiseBy.set(SLOTS_PER_TEAM + d.teamSlot, d);

  // --- J5.8.1 offense lane: break, align and set.
  const breakS = input.tempo === 'huddle' ? p['huddle.breakS']! : 0;
  let alignDur = Math.max(subDur[0]!, subTravelS);
  for (let s = 0; s < SLOTS_PER_TEAM; s++) {
    const dx = spot[s]!.px - (w.players.posX[s]! - w.frame.originX) * w.frame.attackDir;
    const dy = spot[s]!.py - (w.players.posY[s]! - w.frame.originY) * w.frame.attackDir;
    alignDur = Math.max(alignDur, alignTravelS(math.sqrt(dx * dx + dy * dy), p));
  }
  // I4.1.1 a kicking unit is set no sooner than its dead-ball-to-set time (it is "set" after the set period).
  const unitS = input.unitChange ? unitSetS(input.unitChange, p) : 0;
  if (input.unitChange) {
    alignDur = Math.max(alignDur, unitS - setPeriod - breakS);
    log.push({ side: 0, action: 'align_and_set', name: input.unitChange.reversed ? 'kicking_unit_on_after_reversal' : input.unitChange.alerted ? 'kicking_unit_on' : 'kicking_unit_on_not_alerted', startS: 0, endS: unitS, status: unitS <= clockStartS ? 'done' : 'unfinished' });
  }
  const alignEnd = breakS + alignDur;
  const readyS = alignEnd + setPeriod;
  const marginS = p['sched.forcedMarginS']!;

  // J5.1.2 hold: the defense starts its match when the offense's personnel leaves the bench.
  const holdEnd = holdEndS(O.substituted.length > 0, rules.bool('substitution.match_window'), sit.insideTwoMinute, 0, subDur[1]!, p);
  const targetS = clockStartS - targetClockAtSnapS(input.tempo, p);
  let delay = false;
  let snapS: number;
  if (alignEnd > clockStartS) { delay = true; snapS = clockStartS; }
  else snapS = Math.min(Math.max(targetS, readyS, Math.min(holdEnd, clockStartS)), clockStartS - marginS);
  if (!delay && snapS < alignEnd) snapS = alignEnd;
  // Snap on a whole tick: the first one at or after the moment chosen, so a snap that waits for the set period
  // (J5.8.1, B4.3.3) is never rounded to a tick before the offense is set. The clock's own readings are whole ticks.
  const N = Math.max(1, Math.ceil(snapS * TICKS_PER_SECOND - 1e-9));
  snapS = N / TICKS_PER_SECOND;
  const tickAt = (s: number) => -N + Math.round(s * TICKS_PER_SECOND);
  log.push({ side: 0, action: 'align_and_set', name: 'align_and_set', startS: breakS, endS: readyS, status: delay ? 'unfinished' : readyS <= snapS ? 'done' : 'unfinished' });
  const offenseSet = !delay && readyS <= snapS + 1e-9;

  // Remaining offense actions, laid in sequence after the set, dropped from the lowest priority up (J5.8.1).
  const motionSlot = O.motion ? O.motion.teamSlot : -1;
  const motionLead = O.motion ? O.motion.leadS : 0;
  const shiftDur = O.shift ? Math.max(...O.shift.map((m) => {
    const a = spot[m.teamSlot]!; const dx = m.to.px - a.px, dy = m.to.py - a.py; return alignTravelS(math.sqrt(dx * dx + dy * dy), p);
  })) + setPeriod : 0;
  const wanted: { action: LaneAction; dur: number; prio: number }[] = [
    { action: 'protection', dur: p['prot.setS']!, prio: 0 },
    ...(O.shift ? [{ action: 'shift' as const, dur: shiftDur, prio: 1 }] : []),
    { action: 'audible', dur: 0, prio: 3 },
    ...(input.hardCount ? [{ action: 'hard_count' as const, dur: p['audible.hardCountS']!, prio: 4 }] : []),
    ...(O.motion ? [{ action: 'motion' as const, dur: motionLead, prio: 2 }] : []),
  ];

  // --- Picture, disguise and reads need the defensive spots.
  const shownDepth = (s: number) => (disguiseBy.get(s)?.shown.px ?? spot[s]!.px);
  const shownPy = (s: number) => (disguiseBy.get(s)?.shown.py ?? spot[s]!.py);
  const behaviorOf = (s: number) => (s < SLOTS_PER_TEAM ? O.assignments[s]! : D.assignments[s - SLOTS_PER_TEAM]!).behavior.type;

  // J5.5.1 stem times and disguise quality.
  const stemS = new Map<number, number>();
  let qSum = 0;
  for (const [s, d] of disguiseBy) {
    const lead = Math.max(0, p['disguise.leadBaseS']! + p['disguise.leadSdS']! * dD.get('disguiseTiming', d.teamSlot));
    stemS.set(s, Math.max(0, snapS - lead));
    qSum += disguiseQualityOf(iss(w, s, 'disguise'), lead, p);
  }
  const disguiseQuality = disguiseBy.size > 0 ? qSum / disguiseBy.size : 0;

  const qbTs = snapReceiverOf(O.assignments), qbSlot = qbTs;
  const highDepth = p['read.highSafetyDepthYd']!;
  const defSlots = Array.from({ length: SLOTS_PER_TEAM }, (_, i) => SLOTS_PER_TEAM + i);
  const trueShell = shellOf(defSlots.map((s) => spot[s]!.px), highDepth);
  const shownShell = shellOf(defSlots.map(shownDepth), highDepth);
  const inBox = (px: number, py: number) => px <= p['read.boxDepthYd']! && Math.abs(py) <= p['read.boxWidthYd']!;
  const trueBox = defSlots.filter((s) => inBox(spot[s]!.px, spot[s]!.py)).length;
  const rushers = defSlots.filter((s) => behaviorOf(s) === 'passRush' || behaviorOf(s) === 'blitz');
  const truePressure = rushers.length > 4;

  // J5.3.2 who follows the motion man.
  let follower = -1;
  if (O.motion) {
    const m = D.manMatch[O.motion.teamSlot];
    if (D.coverage === 'man' && m !== undefined) follower = SLOTS_PER_TEAM + m;
    else if (D.coverage === 'zone' && D.bluff) {
      let best = -1, bd = Infinity;
      for (const s of defSlots) {
        if (rushers.includes(s)) continue;
        const dy = spot[s]!.py - spot[motionSlot]!.py, dx = spot[s]!.px - spot[motionSlot]!.px, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = s; }
      }
      follower = best;
    }
  }
  const honestTell = D.coverage === 'man' ? follower >= 0 : follower < 0;

  // --- J5.4.1 the quarterback's read.
  const timeAtLine = snapS - alignEnd;
  let qb: QbPreSnap;
  if (qbSlot < 0 || timeAtLine < p['read.minTimeS']!) {
    qb = { made: false, shell: shownShell, shellCorrect: shownShell === trueShell, man: D.coverage === 'man', manCorrect: false, box: trueBox, boxCorrect: true, pressure: false, pressureCorrect: !truePressure };
  } else {
    const cr = iss(w, qbSlot, 'coverage_reading_pre_snap');
    const pc = readCorrectChance(cr, disguiseQuality, O.prepared, math, p);
    const shellOk = ok || dO.get('preSnapRead', qbTs, 0) < pc;
    const shell = shellOk ? trueShell : shownShell !== trueShell ? shownShell : NEIGHBOUR[trueShell];
    let pm = pc;
    if (O.motion) pm = math.logistic(p['read.intercept']! + p['read.perZ']! * issToZ(cr) + p['read.preparedK']! * O.prepared + (honestTell ? 1 : -1) * p['read.motionTellK']!);
    const manOk = ok || dO.get('preSnapRead', qbTs, 1) < pm;
    const boxOk = ok || dO.get('preSnapRead', qbTs, 2) < math.logistic(p['read.boxIntercept']!);
    const presOk = ok || dO.get('preSnapRead', qbTs, 3) < pc;
    qb = {
      made: true, shell, shellCorrect: shell === trueShell,
      man: manOk ? D.coverage === 'man' : D.coverage !== 'man', manCorrect: manOk,
      box: boxOk ? trueBox : trueBox + 1, boxCorrect: boxOk,
      pressure: presOk ? truePressure : !truePressure, pressureCorrect: presOk,
    };
  }

  // --- J5.4.3 audible on what he believes.
  let audible: string | null = null, audibleDur = 0;
  for (const a of O.audibles) {
    const fire = a.trigger === 'box_loaded' ? qb.box >= (a.boxAtLeast ?? SLOTS_PER_TEAM) : a.trigger === 'man' ? qb.man : a.trigger === 'zone' ? !qb.man
      : a.trigger === 'pressure' ? qb.pressure : qb.shell === a.trigger;
    if (qb.made && fire) { audible = a.name; audibleDur = audibleCostS(a.kind, p); break; }
  }
  for (const x of wanted) if (x.action === 'audible') x.dur = audibleDur;

  // Fit the lane: drop lowest priority first until the kept actions fit before the snap.
  const avail = offenseSet ? snapS - readyS : 0;
  const kept = new Set(wanted.filter((x) => x.dur > 0).map((x) => x.action));
  const byPrioDesc = [...wanted].filter((x) => x.dur > 0).sort((a, b) => b.prio - a.prio);
  let total = byPrioDesc.reduce((t, x) => t + x.dur, 0);
  for (const x of byPrioDesc) {
    if (total <= avail + 1e-9) break;
    kept.delete(x.action); total -= x.dur;
  }
  if (audible !== null && !kept.has('audible')) audible = null;
  let t = readyS;
  const startOf = new Map<LaneAction, number>();
  for (const x of wanted) {
    if (x.dur <= 0) continue;
    if (!kept.has(x.action)) { log.push({ side: 0, action: x.action, name: x.action, startS: snapS, endS: snapS, status: 'dropped' }); continue; }
    const st = x.action === 'motion' ? snapS - x.dur : t;
    startOf.set(x.action, st);
    log.push({ side: 0, action: x.action, name: x.action, startS: st, endS: st + x.dur, status: 'done' });
    if (x.action !== 'motion') t += x.dur;
  }

  // Motion timing error (J5.3.1): the snap point moves by the draw; the motion man starts earlier or later.
  let motionStartS = -1;
  if (O.motion && startOf.has('motion')) {
    const centre = snapperOf(O.assignments);
    const sd = snapMotionSdS(iss(w, qbSlot >= 0 ? qbSlot : 0, 'cadence'), iss(w, centre >= 0 ? centre : 0, input.shotgun ? 'snap_shotgun' : 'snap_under_center'), p);
    motionStartS = Math.max(readyS, startOf.get('motion')! + sd * dO.get('snapMotion', O.motion.teamSlot));
  }

  // --- J5.4.2 protection.
  const centreTs = snapperOf(O.assignments);
  const identifier = [centreTs, qbTs].filter((x) => x >= 0).sort((a, b) => iss(w, b, 'protection_calls') - iss(w, a, 'protection_calls'))[0] ?? 0;
  const blockers = Array.from({ length: SLOTS_PER_TEAM }, (_, i) => i).filter((s) => behaviorOf(s) === 'passSet');
  const sideOf = (py: number) => (py > 0 ? 0 : py < 0 ? 1 : -1);
  let bL = 0, bR = 0, spare = 0;
  for (const s of blockers) { const k = sideOf(spot[s]!.py); if (k === 0) bL++; else if (k === 1) bR++; else spare++; }
  let rL = 0, rR = 0, sL = 0, sR = 0;
  for (const s of rushers) { if (spot[s]!.py >= 0) rL++; else rR++; }
  for (const s of defSlots) if (shownDepth(s) <= p['prot.rusherDepthYd']!) { if (shownPy(s) >= 0) sL++; else sR++; }
  const pRec = protectionRecognitionChance(iss(w, identifier, 'protection_calls') + (O.familiarityZ ?? 0) * ISS_PER_Z, disguiseQuality, D.simulatedPressure ? 1 : 0, O.noise, math, p);
  const recognized = ok || dO.get('protection', identifier) < pRec;
  const protDropped = !kept.has('protection');
  // The spare (centre) goes to the side the identifier believes is heavier.
  const believedL = recognized ? rL : sL, believedR = recognized ? rR : sR;
  if (believedL - bL >= believedR - bR) bL += spare; else bR += spare;
  let [uL, uR] = unblockedAfterSet(rL, rR, bL, bR, recognized && !protDropped, O.canRedirect);
  if (!recognized || protDropped) {
    // Set against the shown picture: blockers slid toward the believed threat, true rushers beyond them are free.
    [uL, uR] = unblockedAfterSet(rL, rR, bL, bR, false, false);
  }
  const protection: ProtectionResult = { identifierSlot: identifier, recognized, unblockedLeft: uL, unblockedRight: uR, hot: recognized && uL + uR > 0, dropped: protDropped };

  // --- Delivery (J5.1.3, J3.6.1) for every slot: huddle call, check, audible.
  const received: [boolean, boolean, boolean][] = [];
  const radioOk = clockStartS > rules.num('comm.c2p_cutoff_seconds');
  for (let s = 0; s < 2 * SLOTS_PER_TEAM; s++) {
    const side = s < SLOTS_PER_TEAM ? 0 : 1, ts = s % SLOTS_PER_TEAM, S = side === 0 ? O : D, dr = side === 0 ? dO : dD;
    const caller = side * SLOTS_PER_TEAM + S.signalCaller;
    const dist = Math.abs(spot[s]!.py - spot[caller]!.py) + Math.abs(spot[s]!.px - spot[caller]!.px);
    const fam = S.familiarityZ ?? 0;
    const live = callDeliveryChance(S.noise, dist, issToZ(iss(w, caller, 'football_intelligence')) + fam, issToZ(iss(w, s, 'football_intelligence')) + fam, 0, pp);
    // J5.1.3: the play call in a huddle is heard near 1 whatever the crowd; without one it comes by signal and the
    // quarterback's voice at the line, which noise cuts. `live` (J3.6.1) is the chance of a call made at the line.
    const hud = input.tempo === 'huddle'
      ? huddleDeliveryChance(input.callWords, ts / (SLOTS_PER_TEAM - 1), iss(w, caller, 'clock_and_situation_command'), p)
      : noHuddleDeliveryChance(S.noise, p);
    // The signal caller hears the sideline on his helmet radio until it cuts off (B2.5.1); after that he reads signals.
    const callerHears = input.tempo === 'huddle' || radioOk || dr.get('callDelivery', ts, 0) < live;
    const r: [boolean, boolean, boolean] = s === caller
      ? [ok || callerHears, true, true]
      : [ok || dr.get('callDelivery', ts, 0) < hud, ok || dr.get('callDelivery', ts, 1) < live, ok || dr.get('callDelivery', ts, 2) < live];
    received.push(r);
    if (!r[0] && !missing.includes(s)) mentalErrors.push({ slot: s, cause: 'communication', form: 'old_assignment' });
    if (side === 0 && audible !== null && !r[2]) mentalErrors.push({ slot: s, cause: 'communication', form: 'old_play' });
  }

  // --- Defense lane (J5.8.1): personnel match, front and coverage, strength, checks, disguise.
  if (D.substituted.length > 0) log.push({ side: 1, action: 'personnel_match', name: 'personnel_match', startS: 0, endS: subDur[1]!, status: subDur[1]! <= snapS ? 'done' : 'unfinished' });
  const defAlignStart = Math.max(breakS, subDur[1]!) + p['align.defCommS']!;
  log.push({ side: 1, action: 'front_and_coverage', name: 'front_and_coverage', startS: breakS, endS: defAlignStart, status: defAlignStart <= snapS ? 'done' : 'unfinished' });
  const strengthEnd = alignEnd + p['sched.strengthS']!;
  log.push({ side: 1, action: 'strength', name: 'strength', startS: alignEnd, endS: strengthEnd, status: strengthEnd <= snapS ? 'done' : 'dropped' });

  // Picture flags the checks key on (J5.5.2).
  const offSlots = Array.from({ length: SLOTS_PER_TEAM }, (_, i) => i);
  const backs = offSlots.filter((s) => s !== qbSlot && spot[s]!.px <= -p['check.emptyDepthYd']!);
  const offLine = offSlots.filter((s) => !spot[s]!.onLine && s !== qbSlot && spot[s]!.px > -p['check.emptyDepthYd']!).map((s) => spot[s]!.py).sort((a, b) => a - b);
  let bunch = false;
  for (let i = 0; i + 2 < offLine.length; i++) if (offLine[i + 2]! - offLine[i]! <= p['check.bunchWidthYd']!) bunch = true;
  const picture: Record<PictureTrigger, number | null> = {
    empty: backs.length === 0 ? alignEnd : null,
    bunch: bunch ? alignEnd : null,
    tempo: input.tempo !== 'huddle' ? alignEnd : null,
    shift: startOf.has('shift') ? startOf.get('shift')! : null,
    motion: motionStartS >= 0 ? motionStartS : null,
  };
  const callerSlot = SLOTS_PER_TEAM + D.signalCaller;
  const ci = iss(w, callerSlot, 'front_and_coverage_checks');
  const checks: CheckResult[] = [];
  let anyCheck = false;
  const recognizedCheck = ok || dD.get('defensiveCheck', D.signalCaller) < math.logistic(p['check.recognizeIntercept']! + p['check.recognizePerZ']! * issToZ(ci));
  for (const c of D.checks) {
    const seen = picture[c.trigger];
    if (anyCheck || seen === null || !recognizedCheck) { checks.push({ name: c.name, fired: false, completed: false, atS: -1 }); continue; }
    anyCheck = true;
    const st = seen + checkRecognitionS(ci, p), end = st + checkDurationS(ci, p);
    const completed = end <= snapS;
    checks.push({ name: c.name, fired: true, completed, atS: st });
    log.push({ side: 1, action: 'check', name: c.name, startS: st, endS: completed ? end : snapS, status: completed ? 'done' : st < snapS ? 'unfinished' : 'dropped' });
    if (completed) for (const s of defSlots) if (!received[s]![1]) mentalErrors.push({ slot: s, cause: 'communication', form: 'missed_check' });
  }
  for (const [s, st] of stemS) log.push({ side: 1, action: 'disguise', name: `stem_${s}`, startS: disguiseBy.has(s) ? defAlignStart : st, endS: st, status: 'done' });

  // --- Targets per slot.
  const targets: TimedTarget[][] = [];
  const startTick = -N;
  for (let s = 0; s < 2 * SLOTS_PER_TEAM; s++) {
    const list: TimedTarget[] = [];
    const sp = spot[s]!;
    if (missing.includes(s)) {
      list.push({ fromTick: startTick, px: (w.players.posX[s]! - w.frame.originX) * w.frame.attackDir, py: sp.py >= 0 ? hiPy + 1 : loPy - 1 });
    } else if (s < SLOTS_PER_TEAM) {
      list.push({ fromTick: tickAt(breakS), px: sp.px, py: sp.py });
      const sh = O.shift?.find((m) => m.teamSlot === s);
      if (sh && startOf.has('shift')) list.push({ fromTick: tickAt(startOf.get('shift')!), px: sh.to.px, py: sh.to.py });
      if (s === motionSlot && motionStartS >= 0) {
        const path = O.assignments[s]!.preSnap.motion;
        const end = path.length > 0 ? path[path.length - 1]! : { px: sp.px, py: -sp.py };
        list.push({ fromTick: tickAt(motionStartS), px: end.px, py: end.py });
      }
    } else {
      const d = disguiseBy.get(s);
      if (d) {
        list.push({ fromTick: tickAt(defAlignStart), px: d.shown.px, py: d.shown.py });
        list.push({ fromTick: tickAt(stemS.get(s)!), px: sp.px, py: sp.py });
      } else {
        const cost = s === follower && D.coverage === 'zone' ? p['check.bluffAlignCostYd']! : 0;
        list.push({ fromTick: tickAt(defAlignStart), px: sp.px + cost, py: sp.py });
      }
    }
    list.sort((a, b) => a.fromTick - b.fromTick);
    targets.push(list);
  }

  // --- J5.6.1 get-off.
  const startS = new Float64Array(2 * SLOTS_PER_TEAM);
  for (let s = 0; s < 2 * SLOTS_PER_TEAM; s++) {
    startS[s] = s < SLOTS_PER_TEAM ? offenseStartS(input.silentCount, received[s]![0], iss(w, s, 'snap_count_get_off'), p)
      : defenderKeyDelayS(iss(w, s, 'get_off'), input.snapsOnSameCount, p);
  }

  // --- J5.7.1 foul hazards, one draw per stream (game, play, player, foul type).
  const exists = (id: PresnapFoulId) => rules.bool(`foul.${id}.exists`);
  if (delay) fouls.push({ foulId: 'delay_of_game', slot: null, deadBall: true });
  if (offenseExtra) fouls.push({ foulId: 'too_many_in_formation', slot: null, deadBall: true });
  if (defenseExtra) fouls.push({ foulId: 'too_many_on_field', slot: null, deadBall: false });
  if (!delay && !offenseSet) {
    // B4.3.5: with the clock running after the two-minute warning, not set is a dead-ball false start.
    const late = sit.insideTwoMinute && sit.clockStatus === 'running';
    fouls.push({ foulId: late ? 'false_start' : 'illegal_shift', slot: null, deadBall: late });
  }
  const venueD: Venue = input.venue === 'home' ? 'road' : input.venue === 'road' ? 'home' : 'neutral';
  const stemming = disguiseBy.size > 0;
  // Interior linemen are the players on the line inside its two ends.
  let lineMinPy = Infinity, lineMaxPy = -Infinity;
  for (let s = 0; s < SLOTS_PER_TEAM; s++) if (spot[s]!.onLine) { lineMinPy = Math.min(lineMinPy, spot[s]!.py); lineMaxPy = Math.max(lineMaxPy, spot[s]!.py); }
  if (!delay) {
    for (let s = 0; s < SLOTS_PER_TEAM; s++) {
      if (s === qbSlot || missing.includes(s)) continue;
      const a = O.assignments[s]!;
      const interior = a.preSnap.onLine && spot[s]!.py > lineMinPy && spot[s]!.py < lineMaxPy;
      const base = interior ? p['foul.baseFalseStartLine']! : p['foul.baseFalseStartOther']!;
      const pr = falseStartChance(base, testedDiscipline(w, s, p), input.venue, {
        // I2.5.3: a silent count removes the crowd from the line's false-start risk (they move on the centre, not a voice).
        noise: input.silentCount ? 0 : O.noise, hardCountOwn: input.hardCount, defensiveMovement: stemming, rushedSnap: input.tempo === 'hurry_up',
        longCount: input.longCount, fatigue: w.players.fatigueNow[s]!,
      }, math, p);
      const u = w.streams('foul', [sit.gameId, sit.playNumber, w.slots[s]!.playerId, 'false_start']).uniform();
      if (!ok && u < pr && exists('false_start')) fouls.push({ foulId: 'false_start', slot: s, deadBall: true });
    }
    for (const s of defSlots) {
      if (missing.includes(s)) continue;
      const exposed = spot[s]!.px <= ON_LINE_DEPTH || rushers.includes(s);
      if (!exposed) continue;
      const pr = defensiveOffsideChance(p['foul.baseDefOffside']!, testedDiscipline(w, s, p), venueD, {
        hardCountOpp: input.hardCount, anticipated: input.snapsOnSameCount >= p['getoff.anticipationSnaps']!, aggression: D.aggressiveGetOff, fatigue: w.players.fatigueNow[s]!,
      }, math, p);
      const id = w.slots[s]!.playerId;
      const u = w.streams('foul', [sit.gameId, sit.playNumber, id, 'defensive_offside']).uniform();
      if (ok || u >= pr) continue;
      // Nearest offensive player decides close proximity for a flinch (B4.4.2 item 4).
      let near = Infinity;
      for (let o = 0; o < SLOTS_PER_TEAM; o++) { const dx = spot[o]!.px - spot[s]!.px, dy = spot[o]!.py - spot[s]!.py; near = Math.min(near, math.sqrt(dx * dx + dy * dy)); }
      const form: DefensiveForm = classifyDefensiveForm(w.streams('foul', [sit.gameId, sit.playNumber, id, 'defensive_offside.form']).uniform(), near, sit.insideTwoMinute, p);
      if (form === 'false_start') {
        let o = 0, bd = Infinity;
        for (let k = 0; k < SLOTS_PER_TEAM; k++) { const dx = spot[k]!.px - spot[s]!.px, dy = spot[k]!.py - spot[s]!.py, d = dx * dx + dy * dy; if (d < bd) { bd = d; o = k; } }
        if (exists('false_start')) fouls.push({ foulId: 'false_start', slot: o, deadBall: true });
      } else if (exists(form)) fouls.push({ foulId: form, slot: s, deadBall: form !== 'offside' });
    }
  }

  return {
    firstTick: startTick, playClockStartTenths: clockStartTenths, playClockAtSnapTenths: clockStartTenths - N,
    snapS, targets, received, log, fouls, qb, protection, checks, audible, disguiseQuality, startS,
    follower, motionSlot, motionStartTick: motionStartS >= 0 ? tickAt(motionStartS) : 1, missing, mentalErrors,
    offenseSetS: readyS, relayS: relay.totalS, relayRepeats: relay.repeats, setClockLeftS: Math.max(0, clockStartS - readyS), draws: [dO, dD],
  };
}

/** Play-clock reading at a pre-snap tick, integer tenths: one tenth per tick from the start, never paused (I2.1.2). */
export function playClockAt(plan: PresnapPlan, tick: number): number {
  return plan.playClockStartTenths - (tick - plan.firstTick);
}
