// The quarterback as tick stages (J7, J6.2.5). `decide` is his post-snap procedure and runs after the
// player AI's Decide stage, whose intent for his slot it replaces while he has the ball. `interact`
// is the truth side: the `pressure` events of J6.2.5 and the arrival contest when a rusher reaches him.
//
// What he may read (Q1.4.1). Decisions use his `PerceivedView`, his own state, his own side's play and
// public facts. Two truth reads of opponents exist in `decide`, both in `sense` and both the leaf's own
// definition of feeling pressure (J7.4.1): whether a rusher is free or winning his block, and the
// position of a rusher he feels without seeing (the blindside draw) or who is in his face. `interact`
// is engine truth, like every contest, and feeds nothing back into his choices but the outcome.
//
// Draws: stream `qb`, keyed [game, play, player] (J13.2.1). A fixed block is taken at `begin`
// (QB_BEGIN_DRAWS); after that exactly four uniforms are taken on every tick he holds the ball, used
// or not, so a decision never shifts a later draw. Arrival and strip-sack draws use `contest`; a ball
// batted at the line draws from the flight's `ball` stream (J9.2.1).
import {
  MOVE_MODES, SLOTS_PER_TEAM, SLOT_COUNT, TICK_S, issToZ, roundSimS, roundYd,
  type MoveMode, type PerceivedView, type RandomStream, type TickWorld, type TruthEvent,
} from '@gm/schema';
import { GRAVITY_YPS2, airDrag, airState, ballParams, ballStream, batChance, batLane, beginLoose, deflect, handsUpChance, setFlightVelocity, gustAimMultiplier, launchPass, passLaunch, solvePassFrom, windFromEnvironment, NO_WIND, type BallParams } from '../ball/index.ts';
import { pickOutcome, type Contests } from '../contest/index.ts';
import { PI, dAtan2, dCos, dSqrt } from '../dmath.ts';
import { cutMultiplier, kinParams } from '../kinematics/index.ts';
import type { PlayStage } from '../tick/loop.ts';
import {
  accuracySdYd, anticipationEarlyS, blindsideFeelChance, clip, depthBand, dropDepthYd, eyesDownfieldChance, falsePressureChance, freePlaySeenChance,
  hotSeenChance, interceptionCeiling, keyReadChance, knowsGroundingChance, maxBallSpeedYps, meshFumbleChance, meshReadChance, platformMultiplier, pumpFakeChance, readTimeS, releaseTimeS,
  riskOffsetEp, riskyDumpChance, scrambleChance, separationSdYd, setTimeS, throwThresholdEp, type Platform,
} from './formulas.ts';
import { TRAJECTORIES, judgeTarget, newEstimate, standInValue, walkRoute, type Estimate, type JudgeContext, type Trajectory } from './judge.ts';
import { qbParams, type QbParams } from './params.ts';
import { qbPlayProblems, type QbPlay, type QbRead, type QbTarget } from './play.ts';

export const QB_PHASES = ['wait', 'mesh', 'drop', 'pocket', 'release', 'extend', 'run', 'scripted', 'over', 'pump'] as const;
export type QbPhase = (typeof QB_PHASES)[number];
const WAIT = 0, MESH = 1, DROP = 2, POCKET = 3, RELEASE = 4, EXTEND = 5, RUN = 6, SCRIPTED = 7, OVER = 8, PUMP = 9;

export const PRESSURE_LEVELS = ['none', 'felt', 'imminent'] as const;
export type PressureLevel = (typeof PRESSURE_LEVELS)[number];
const NONE = 0, FELT = 1, IMMINENT = 2;

/** J7.4.2 options, in the softmax's tie-break order. */
export const PRESSURE_RESPONSES = ['throwNow', 'pocketMovement', 'escape', 'throwAway', 'takeSack'] as const;
export type PressureResponse = (typeof PRESSURE_RESPONSES)[number];

/** Raw draws taken at `begin`, in this order: 17 uniforms (2 raw each) then 19 normals (4 raw each). */
export const QB_BEGIN_UNIFORMS = 17;
export const QB_BEGIN_NORMALS = 19;
export const QB_TICK_UNIFORMS = 4;
const SEP_LOOKS = 16, SCRAMBLE_DRAWS = 4, KEY_DRAWS = 4;
const U_HOT = 0, U_FALSE = 1, U_FREE = 2, U_KNOW = 3, U_DUMP = 4, U_MESH = 5, U_PITCH = 6, U_KEY = 7, U_SCRAMBLE = 11, U_PUMP = 15, U_MESH_FUMBLE = 16;
const N_SEP = 0, N_AIM = 16;

const M_DOWN = MOVE_MODES.indexOf('down');
const EPS = 1e-9;
const RAD = 3.141592653589793 / 180;

export type RunReason = 'scramble' | 'keep' | 'sneak';

export interface QuarterbackOptions {
  /** The perception module's view of a slot (WP-11). */
  view(slot: number): PerceivedView;
  /** The contest library (WP-12): the catch-point shape for his estimate, the arrival contest, ball security. */
  readonly contests: Contests;
  /** J3.4.1 gaze rules of the perception module: his eyes are a signal defenders read (J3.4.2). Without it he writes his own gaze. */
  readonly gaze?: { gazeAtSlot(slot: number, target: number): void; gazeAtPoint(slot: number, px: number, py: number): void } | null;
  /** J3.5.1 `notifyBallInAir` of the perception module. */
  readonly ballInAir?: ((world: TickWorld, passerSlot: number, landingX: number, landingY: number, flightTicks: number) => void) | null;
  /** J8.1.1 best lane score beyond the line, 0 to 1 (WP-21). Without it he judges the lane from his own view. */
  readonly laneQuality?: ((world: TickWorld, slot: number) => number) | null;
  /** Top speed he can reach in a move mode now (the movement module's `modeTopSpeed`), to pace the drop. */
  readonly topSpeed?: ((world: TickWorld, slot: number, mode: number) => number) | null;
  /** K1.3.1 rule 4: this rusher is going for the strip (the player AI's `stripAttempt`). */
  readonly stripAttempt?: ((slot: number) => boolean) | null;
  /**
   * He has become a runner (J7.5.1, J7.7.1, J7.8.1). Return true when a carrier module (J8) steers him
   * from here; otherwise this module runs him straight at the lane.
   */
  readonly onRun?: ((world: TickWorld, slot: number, why: RunReason) => boolean) | null;
  /**
   * J7.6.1 edge case: he pump-faked toward a field point. The perception and player AI modules present the
   * "ball thrown" cue to defenders watching him; whether each bites is their own `mental` draw.
   */
  readonly onPumpFake?: ((world: TickWorld, slot: number, aimX: number, aimY: number) => void) | null;
  /** J7.2.1 acceptance: work the reads and never throw. Never set in a game. */
  readonly test?: { readonly noThrow?: boolean };
}

/** The ball as it left his hand, for the catch point (J6.5), film and the coaching school. Field frame. */
export interface ThrowRecord {
  readonly tick: number;
  /** Seconds from the snap to the release (J15 time to throw). */
  readonly timeS: number;
  readonly targetSlot: number;
  readonly kind: 'pass' | 'throwaway' | 'spike' | 'pitch';
  readonly forward: boolean;
  readonly aimX: number; readonly aimY: number;
  readonly landingX: number; readonly landingY: number;
  /** Horizontal miss from the aim point and the height error, yards (J7.6.2). */
  readonly missYd: number;
  readonly heightErrorYd: number;
  readonly errorSdYd: number;
  readonly trajectory: Trajectory;
  readonly flightS: number;
  readonly inRange: boolean;
  readonly platform: Platform;
  /** Index of the read he was on, -1 for hot, checkdown-less throwaways and scripted throws. */
  readonly readIndex: number;
  readonly hot: boolean;
  /** His estimate when he decided. Engine values: shown only in the coaching school (N5). */
  readonly pHat: number; readonly iHat: number; readonly value: number; readonly threshold: number;
  /** Slot of the defender who batted it at the line (J9.2.1), or -1. The landing spot above is then where it was thrown, not where it went. */
  readonly battedBySlot: number;
}

/** One change of his eyes or mind, for the film overlay (J7.2.1) and the explain record. */
export interface QbNote { readonly tick: number; readonly note: string; readonly slot: number; readonly value: number }

export interface QbPlayRecord {
  readonly tSetS: number;
  readonly launchPx: number; readonly launchPy: number;
  /** Where he was at `tSet`, play frame, or null if the play ended first (J7.1.1 acceptance). */
  readonly setPx: number | null; readonly setPy: number | null;
  readonly throwRecord: ThrowRecord | null;
  readonly sack: { readonly tick: number; readonly x: number; readonly y: number; readonly rusherSlot: number; readonly blindside: boolean; readonly fumble: boolean } | null;
  readonly kneel: { readonly tick: number; readonly x: number; readonly y: number } | null;
  readonly ran: { readonly tick: number; readonly why: RunReason } | null;
  /** The throw met the grounding rule's conditions (J7.5.2): a hazard for J10; whether it is called is B11's. */
  readonly groundingHazard: { readonly tick: number; readonly x: number; readonly y: number } | null;
  readonly restarted: boolean;
  readonly hotSeen: boolean;
  readonly falsePressure: boolean;
  readonly freePlaySeen: boolean;
  readonly everOutsidePocket: boolean;
  readonly response: PressureResponse | null;
  readonly mesh: { readonly decision: 'give' | 'keep' | 'throw'; readonly correct: boolean; readonly ambiguous: boolean; readonly late: boolean; readonly fumbled: boolean } | null;
  /** A designed handoff (kind `handoff`): when it ended, and how. Null on every other play and until it ends. */
  readonly handoff: { readonly tick: number; readonly given: boolean; readonly fumbled: boolean } | null;
  /** Pump fakes this play: when, and at whom. */
  readonly pumps: readonly { readonly tick: number; readonly targetSlot: number }[];
  /** Ticks at which he first looked at each read of the first pass through the progression. */
  readonly readTicks: readonly number[];
}

export interface Quarterback {
  readonly decide: PlayStage;
  readonly interact: PlayStage;
  /** Call before the loop's `begin` for the play. Null: no quarterback procedure this play (a kick). Throws on a play it cannot run. */
  setPlay(play: QbPlay | null): void;
  phase(): QbPhase;
  pressureLevel(): PressureLevel;
  /** Index of the read he is on, -1 when none. */
  currentRead(): number;
  record(): QbPlayRecord;
  notes(): readonly QbNote[];
  /** Per-tick film track from the snap: phase code and the slot he is looking at (-1 for none). */
  track(): { readonly phase: Uint8Array; readonly look: Int8Array; readonly pressure: Uint8Array; readonly ticks: number };
}

function hyp(x: number, y: number): number { return dSqrt(x * x + y * y); }

/**
 * Flight times from the J9 solver in still air, by distance and trajectory, for one arm in one air
 * (J7.6.1: "flight time comes from J9 and was already used in the estimate"). Solving is slow, so a
 * table is built once per (ball speed, drag, ball parameters) and read by straight-line interpolation.
 * A pure function of its inputs: the cache changes speed only, never a result.
 */
const FLIGHT_STEP_YD = 2.5;
interface FlightRow { readonly timeS: Float64Array; readonly tan: Float64Array }
interface FlightTable { readonly n: number; readonly releaseH: number; readonly catchH: number; readonly firm: FlightRow; readonly drive: FlightRow; readonly touch: FlightRow }
const flightTables = new WeakMap<BallParams, Map<string, FlightTable>>();
function flightTable(vBallYps: number, k: number, maxRangeYd: number, bp: BallParams): FlightTable {
  let byArm = flightTables.get(bp);
  if (byArm === undefined) { byArm = new Map(); flightTables.set(bp, byArm); }
  // The row count is part of the key: a table first built for a shorter field must not answer a longer
  // one, or a throw's flight would depend on which plays came before it (and on garbage collection).
  const n = Math.floor(maxRangeYd / FLIGHT_STEP_YD) + 2;
  const key = `${vBallYps}|${k}|${n}`;
  const hit = byArm.get(key);
  if (hit !== undefined) return hit;
  const row = (): FlightRow => ({ timeS: new Float64Array(n), tan: new Float64Array(n) });
  const made: FlightTable = { n, releaseH: bp['pass.releaseHeightYd']!, catchH: bp['pass.catchHeightYd']!, firm: row(), drive: row(), touch: row() };
  for (let i = 1; i < n; i++) {
    const d = i * FLIGHT_STEP_YD;
    for (const type of TRAJECTORIES) {
      const sol = solvePassFrom(0, 0, d, 0, vBallYps, type, k, NO_WIND, bp), r = made[type];
      const along = dSqrt(sol.vx * sol.vx + sol.vy * sol.vy);
      r.timeS[i] = sol.flightTimeS;
      r.tan[i] = along > 0 ? sol.vh / along : 0;
    }
  }
  if (byArm.size >= 256) byArm.clear();
  byArm.set(key, made);
  return made;
}
function flightFrom(t: FlightTable, distYd: number, trajectory: Trajectory): number {
  if (distYd <= 0) return 0;
  const row = t[trajectory].timeS, at = distYd / FLIGHT_STEP_YD, i = Math.floor(at);
  if (i >= t.n - 1) return row[t.n - 1]! * (distYd / ((t.n - 1) * FLIGHT_STEP_YD));
  return row[i]! + (row[i + 1]! - row[i]!) * (at - i);
}
/** Height of the ball `alongYd` into a throw of `distYd`, from the nearest table row at or past the distance. */
function heightFrom(t: FlightTable, distYd: number, alongYd: number, trajectory: Trajectory): number {
  let i = Math.ceil(distYd / FLIGHT_STEP_YD);
  if (i < 1) i = 1; else if (i > t.n - 1) i = t.n - 1;
  // A parabola that leaves his hand on the solved launch slope and comes down on the catch height at the
  // catch (J9.1.1). Drag is in the slope the solver chose and in the end point; the middle is within a hand.
  const tan = t[trajectory].tan[i]!;
  if (distYd <= 0) return t.releaseH;
  const drop = (t.releaseH + distYd * tan - t.catchH) / (distYd * distYd);
  return t.releaseH + alongYd * tan - drop * alongYd * alongYd;
}

export function createQuarterback(options: QuarterbackOptions): Quarterback {
  const contests = options.contests, catchPoint = contests.catchPoint;
  const uBegin = new Float64Array(QB_BEGIN_UNIFORMS), nBegin = new Float64Array(QB_BEGIN_NORMALS), uTick = new Float64Array(QB_TICK_UNIFORMS);
  const felt = new Uint8Array(SLOT_COUNT), sensed = new Uint8Array(SLOT_COUNT), pressured = new Uint8Array(SLOT_COUNT), hitDone = new Uint8Array(SLOT_COUNT);
  const rearm = new Int32Array(SLOT_COUNT);
  const TRACK = 1024;
  const trackPhase = new Uint8Array(TRACK), trackLook = new Int8Array(TRACK), trackPressure = new Uint8Array(TRACK);
  const est = newEstimate(), estAlt = newEstimate(), estThrow = newEstimate();
  const tgt = { px: 0, py: 0 }, face = { px: 0, py: 0 };
  const noteLog: QbNote[] = [], readTicks: number[] = [], pumps: { tick: number; targetSlot: number }[] = [];
  const batAir = airState(0, 0, 0, 0, 0, 0);

  let next: QbPlay | null = null, cur: QbPlay | null = null;
  let P: QbParams | null = null, BP: BallParams | null = null, rng: RandomStream | null = null, ctx: JudgeContext | null = null;
  let seq: QbRead[] = [];
  // Grades as z, resolved once per play.
  let zFoot = 0, zProc = 0, zCov = 0, zBlitz = 0, zPocket = 0, zComposure = 0, zScramble = 0, zCod = 0, zRelease = 0, zArm = 0;
  let zAccShort = 0, zAccMid = 0, zAccDeep = 0, zMove = 0, zUnderPressure = 0, zAnt = 0, zMeshRead = 0, zFi = 0, zHandling = 0, decisionRisk = 50, composure = 50;
  let tReadS = 0, earlyS = 0, releaseS = 0, vBall = 0, riskOffset = 0, intCeil = 0, gustMult = 1, wet = false;
  let oneScore = 0, groundingExists = true, leftPy = 0, rightPy = 0;
  // Per-play state.
  let phase = WAIT, level = NONE, everHad = false, gotBallT = 0, tSet = 0, launchPx = 0, launchPy = 0, setPx: number | null = null, setPy: number | null = null;
  let idx = 0, look = 0, passes = 0, visitStart = 0, waitStart = 0, evaluating = false, blockUntil = 0, restarted = false, firstPass = true;
  let eyesDown = false, hotSeen = false, hotDone = false, falseDrawn = false, falseDone = false, freeSeen = false, knowsRule = true, deepestRead = -1;
  let threat = -1, threatTtc = Infinity, threatPx = 0, threatPy = 0, respondedTo = -1, pressureNear = false, inFace = false, takeSack = false, dodge = false;
  let response: PressureResponse | null = null, extendSide = 0, everOutside = false, scrambleDraw = 0, keyDraw = 0;
  let releaseAt = 0, relTarget: QbTarget | null = null, relKind: ThrowRecord['kind'] = 'pass', relRead = -1, relHot = false, relAnticipated = false, relUnset = false, relMoving = false;
  let relP = 0, relI = 0, relV = 0, relThr = 0, awayPx = 0, awayPy = 0;
  let underPressureNow = false, carrierOwns = false, runPy = 0, stumbleUntil = 0;
  let meshSum = 0, meshN = 0, meshDecided = false, meshLate = false, pitchDone = false;
  let throwRecord: ThrowRecord | null = null, sack: QbPlayRecord['sack'] = null, kneel: QbPlayRecord['kneel'] = null, ran: QbPlayRecord['ran'] = null;
  let hazard: QbPlayRecord['groundingHazard'] = null, mesh: QbPlayRecord['mesh'] = null;
  let handoff: QbPlayRecord['handoff'] = null;
  let ticksTracked = 0, pumpUntil = 0, pumpFrom = POCKET, pumped = false;

  const note = (w: TickWorld, text: string, slot = -1, value = 0): void => { noteLog.push({ tick: w.tick, note: text, slot, value }); };
  const detail = (w: TickWorld, code: string, value: number | null = null): void => {
    const s = cur!.qbSlot;
    w.emit({ type: 'detail', t: roundSimS(w.tick * TICK_S), code, playerIds: [w.slots[s]!.playerId], spot: { x: roundYd(w.players.posX[s]!), y: roundYd(w.players.posY[s]!) }, value });
  };
  const fieldX = (w: TickWorld, px: number): number => w.frame.originX + px * w.frame.attackDir;
  const fieldY = (w: TickWorld, py: number): number => w.frame.originY + py * w.frame.attackDir;
  const playX = (w: TickWorld, slot: number): number => (w.players.posX[slot]! - w.frame.originX) * w.frame.attackDir;
  const playY = (w: TickWorld, slot: number): number => (w.players.posY[slot]! - w.frame.originY) * w.frame.attackDir;

  function setPlay(play: QbPlay | null): void {
    if (play) { const problems = qbPlayProblems(play); if (problems.length > 0) throw new Error(`quarterback play cannot run: ${problems.join('; ')}`); }
    next = play;
  }

  // ---------------------------------------------------------------------------------------------------
  // begin: grades, parameters and the fixed block of draws

  function begin(w: TickWorld): void {
    cur = next;
    phase = WAIT; level = NONE; everHad = false; setPx = null; setPy = null; ticksTracked = 0;
    idx = 0; look = -1; passes = 0; evaluating = false; blockUntil = 0; restarted = false; firstPass = true; eyesDown = false;
    hotDone = false; falseDone = false; threat = -1; respondedTo = -1; takeSack = false; dodge = false; response = null; extendSide = 0; everOutside = false;
    scrambleDraw = 0; keyDraw = 0; relTarget = null; underPressureNow = false; carrierOwns = false; stumbleUntil = 0;
    meshSum = 0; meshN = 0; meshDecided = false; meshLate = false; pitchDone = false;
    throwRecord = null; sack = null; kneel = null; ran = null; hazard = null; mesh = null; handoff = null;
    noteLog.length = 0; readTicks.length = 0; pumps.length = 0; pumped = false;
    felt.fill(0); sensed.fill(0); pressured.fill(0); hitDone.fill(0); rearm.fill(-2147483648);
    const play = cur;
    if (!play) return;
    const p = P = qbParams(w.params), bp = BP = ballParams(w.params), s = play.qbSlot;
    const info = w.slots[s]!, a = info.player.attributes, pl = w.players;
    const body = pl.dFatigueZ[s]! + pl.dInjuryZ[s]!, mind = body + pl.dKnowledgeZ[s]!;
    const zb = (id: string): number => issToZ(a[id]!) - body, zm = (id: string): number => issToZ(a[id]!) - mind;
    zFoot = zb('footwork_and_drop'); zPocket = zb('pocket_movement'); zScramble = zb('scramble_and_run_skill'); zRelease = zb('release_time'); zArm = zb('arm_strength');
    zAccShort = zb('accuracy_short'); zAccMid = zb('accuracy_intermediate'); zAccDeep = zb('accuracy_deep'); zMove = zb('accuracy_on_the_move'); zUnderPressure = zb('accuracy_under_pressure');
    zCod = info.player.tests.changeOfDirectionZ - body;
    zProc = zm('processing_speed'); zCov = zm('coverage_reading_post_snap'); zBlitz = zm('blitz_recognition'); zAnt = zm('anticipation'); zMeshRead = zm('play_recognition');
    zFi = zm('football_intelligence'); zHandling = zb('play_fake_and_ball_handling'); zComposure = zm('composure');
    decisionRisk = a['decision_risk']!; composure = a['composure']!;
    tReadS = readTimeS(zProc, p); earlyS = anticipationEarlyS(zAnt, p); releaseS = releaseTimeS(zRelease, p); vBall = maxBallSpeedYps(zArm, p);
    riskOffset = riskOffsetEp(decisionRisk, play.instructions.risk, p);
    wet = w.environment.precip !== 'none' || w.environment.derived.grip < 1;
    gustMult = gustAimMultiplier(w.environment, bp['wind.gustAimGain']!);
    const half = p['pocket.defaultHalfWidthYd'];
    leftPy = play.pocket ? play.pocket.leftPy : half; rightPy = play.pocket ? play.pocket.rightPy : -half;

    rng = w.streams('qb', [w.situation.gameId, w.situation.playNumber, info.playerId]);
    for (let i = 0; i < QB_BEGIN_UNIFORMS; i++) uBegin[i] = rng.uniform();
    for (let i = 0; i < QB_BEGIN_NORMALS; i++) nBegin[i] = rng.normal();

    const sit = w.situation;
    hotSeen = play.hot !== null && uBegin[U_HOT]! < hotSeenChance(zBlitz, play.hot.expectedPreSnap, p, w.math);
    falseDrawn = uBegin[U_FALSE]! < falsePressureChance(play.hitsThisGame, composure, p);
    // J7.8.2: no free play in the last two minutes of a half (B4.4.2 item 3).
    freeSeen = play.freePlay && !sit.insideTwoMinute && uBegin[U_FREE]! < freePlaySeenChance(zFi, p, w.math);
    knowsRule = uBegin[U_KNOW]! < knowsGroundingChance(zFi, p, w.math);

    const passing = play.kind === 'pass' || play.kind === 'hailMary' || play.kind === 'mesh';
    groundingExists = play.kind === 'kneel' || play.kind === 'sneak' ? false : w.rules.bool('foul.intentional_grounding.exists');
    oneScore = passing ? w.rules.num('score.touchdown') + w.rules.num('try.two_point_points') : 0;
    const offense = sit.offense, trailing = sit.score[offense === 0 ? 1 : 0]! - sit.score[offense]!;
    intCeil = freeSeen ? 1 : interceptionCeiling(trailing, oneScore, sit.period, sit.clockTenths * TICK_S, p);

    seq = play.reads.slice();
    if (play.checkdown) seq.push({ kind: 'receiver', target: play.checkdown, priorValue: p['resp.throwAwayEp'] });
    deepestRead = -1;
    if (freeSeen) {
      let deep = -Infinity;
      for (let i = 0; i < play.reads.length; i++) {
        const r = play.reads[i]!.target.route, d = r.length > 0 ? r[r.length - 1]!.px : 0;
        if (d > deep) { deep = d; deepestRead = i; }
      }
      // J7.8.2: nothing to lose, so the deepest route is looked at first.
      if (deepestRead > 0) { const r = seq.splice(deepestRead, 1)[0]!; seq.unshift(r); deepestRead = 0; }
    }
    const k = airDrag(bp['pass.dragPerYd']!, w.environment);
    const far = solvePassFrom(0, 0, 300, 0, vBall, 'drive', k, NO_WIND, bp);
    const table = flightTable(vBall, k, far.arrival.x, bp);
    const kp = kinParams(w.params);
    ctx = {
      p, catchPoint, math: w.math, value: play.value ?? standInValue(p, sit.down, sit.distanceYd),
      releaseS, vBallYps: vBall, dragPerYd: k, maxRangeYd: far.arrival.x, wet, allowOutOfRange: play.kind === 'hailMary',
      loPy: Math.min((0 - w.frame.originY) * w.frame.attackDir, (w.geometry.widthYd - w.frame.originY) * w.frame.attackDir),
      hiPy: Math.max((0 - w.frame.originY) * w.frame.attackDir, (w.geometry.widthYd - w.frame.originY) * w.frame.attackDir),
      accuracySdYd: (airYd) => errorSd(airYd, platformNow(false, false)),
      flightS: (distYd, trajectory) => flightFrom(table, distYd, trajectory),
      heightYd: (distYd, alongYd, trajectory) => heightFrom(table, distYd, alongYd, trajectory),
      cutShare: (angleRad) => cutMultiplier(angleRad, 0, kp, PI),
    };
  }

  // ---------------------------------------------------------------------------------------------------
  // his platform and his error (J7.6.2)

  let movingNow = false, toThrowSide = false, unsetNow = false;
  const scratchPlatform = { moving: false, toThrowingSide: false, hit: false, inFace: false, wet: false, unset: false, anticipated: false };
  function platformNow(hit: boolean, anticipated: boolean): Platform {
    scratchPlatform.moving = movingNow; scratchPlatform.toThrowingSide = toThrowSide; scratchPlatform.hit = hit; scratchPlatform.inFace = inFace;
    scratchPlatform.wet = wet; scratchPlatform.unset = unsetNow; scratchPlatform.anticipated = anticipated;
    return scratchPlatform;
  }
  function errorSd(airYd: number, pf: Platform): number {
    const p = P!, band = depthBand(airYd, p);
    return accuracySdYd(band, band === 'deep' ? zAccDeep : band === 'intermediate' ? zAccMid : zAccShort, p) * platformMultiplier(pf, zMove, zUnderPressure, gustMult, p);
  }

  // ---------------------------------------------------------------------------------------------------
  // intents and eyes

  function move(w: TickWorld, px: number, py: number, mode: MoveMode, effort: number, arrival: 'arrive' | 'through'): void {
    const i = w.intents[cur!.qbSlot]!;
    tgt.px = px; tgt.py = py; face.px = px + 20; face.py = py;
    i.target = tgt; i.targetVelPx = 0; i.targetVelPy = 0; i.faceTarget = mode === 'sprint' ? null : face; i.effort = effort; i.moveMode = mode; i.arrival = arrival;
  }
  function stay(w: TickWorld, v: PerceivedView): void { move(w, v.self.px, v.self.py, 'shuffle', 1, 'arrive'); }

  function lookAtSlot(w: TickWorld, slot: number): void {
    look = slot;
    const s = cur!.qbSlot;
    if (!options.gaze) { w.players.gazeRad[s] = dAtan2(w.players.posY[slot]! - w.players.posY[s]!, w.players.posX[slot]! - w.players.posX[s]!); return; }
    options.gaze.gazeAtSlot(s, slot);
    // The eyes follow a man only once he is seen (J3.4.1). Until then he looks where the man should be:
    // down the drawn route for a receiver (J7.3.1 step 1), straight downfield for anyone else.
    const v = options.view(s);
    if (v.entity(slot) !== null) return;
    const t = knownTarget(slot);
    if (t !== null && t.route.length >= 2 && ctx !== null) {
      walkRoute(t, ctx, t.route[0]!.px, t.route[0]!.py, 0, v.tSinceSnapS > 0 ? v.tSinceSnapS : 0, lookBuf);
      options.gaze.gazeAtPoint(s, lookBuf[0]!, lookBuf[1]!);
    } else options.gaze.gazeAtPoint(s, v.self.px + P!['look.downfieldYd'], v.self.py);
  }
  const lookBuf = new Float64Array(4);
  /** The target the play gives for a slot, from the reads he is working, or null. */
  function knownTarget(slot: number): QbTarget | null {
    for (let i = 0; i < seq.length; i++) { const r = seq[i]!; if (r.target.slot === slot) return r.target; if (r.ifDrives && r.ifDrives.slot === slot) return r.ifDrives; }
    const play = cur!;
    if (play.hot && play.hot.target.slot === slot) return play.hot.target;
    if (play.mesh && play.mesh.throwTarget && play.mesh.throwTarget.slot === slot) return play.mesh.throwTarget;
    return null;
  }
  function lookAtPoint(w: TickWorld, px: number, py: number): void {
    look = -1;
    const s = cur!.qbSlot;
    if (options.gaze) options.gaze.gazeAtPoint(s, px, py);
    else w.players.gazeRad[s] = dAtan2(fieldY(w, py) - w.players.posY[s]!, fieldX(w, px) - w.players.posX[s]!);
  }

  // ---------------------------------------------------------------------------------------------------
  // J7.4.1 feeling pressure

  function sense(w: TickWorld, v: PerceivedView): void {
    const p = P!, pl = w.players, s = cur!.qbSlot, qx = v.self.px, qy = v.self.py;
    const feel = blindsideFeelChance(zPocket, p), cosCone = dCos(p['pressure.faceConeDeg'] * RAD), rQ = w.slots[s]!.movement.bodyRadiusYd;
    let blind = 0;
    level = NONE; threat = -1; threatTtc = Infinity; pressureNear = false; inFace = false;
    for (let d = SLOTS_PER_TEAM; d < SLOT_COUNT; d++) {
      sensed[d] = 0;
      if (pl.moveMode[d] === M_DOWN || w.tick < pl.onGroundUntilTick[d]!) continue;
      // Truth read 1 (J7.4.1): the rusher is free, or winning his block by the felt margin.
      const c = pl.engagement[d]!;
      if (c >= 0 && !(c < w.contests.length && w.contests[c]!.advantage < p['pressure.feltAdvantage'])) continue;
      const tx = playX(w, d), ty = playY(w, d), tDist = hyp(tx - qx, ty - qy);
      const e = v.entity(d);
      let ex: number, ey: number, evx: number, evy: number;
      const front = tDist > 0 && (tx - qx) / tDist >= cosCone && tDist <= p['pressure.feltDistYd'];
      if (e !== null) { ex = e.px; ey = e.py; evx = e.velPx; evy = e.velPy; } else {
        // Truth read 2: a rusher in his face is always perceived; one behind him is felt by a draw per tick, and stays felt.
        if (!front && felt[d] === 0) {
          if (tDist > p['pressure.feltDistYd']) continue;
          const u = uTick[blind < 2 ? blind : 1]!;
          blind++;
          if (u >= feel) continue;
          felt[d] = 1;
        }
        ex = tx; ey = ty; evx = pl.velX[d]! * w.frame.attackDir; evy = pl.velY[d]! * w.frame.attackDir;
      }
      sensed[d] = 1;
      const dist = hyp(ex - qx, ey - qy), gap = dist - rQ - w.slots[d]!.movement.bodyRadiusYd;
      const closing = dist > 0 ? -((evx - v.self.velPx) * (ex - qx) + (evy - v.self.velPy) * (ey - qy)) / dist : 0;
      const ttc = gap <= 0 ? 0 : closing > p['pressure.minClosingYps'] ? gap / closing : Infinity;
      if (dist <= p['pressure.feltDistYd'] && level < FELT) level = FELT;
      if (ttc < p['pressure.imminentS']) level = IMMINENT;
      if (ttc < p['risk.pressureWindowS']) pressureNear = true;
      if (front) inFace = true;
      if (ttc < threatTtc || (threat < 0 && dist <= p['pressure.feltDistYd'])) { threat = d; threatTtc = ttc; threatPx = ex; threatPy = ey; }
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // J7.5 leaving the pocket

  function laneQuality(w: TickWorld, v: PerceivedView): number {
    if (options.laneQuality) return clip(options.laneQuality(w, cur!.qbSlot), 0, 1);
    const p = P!, depth = p['scramble.laneDepthYd'], half = p['scramble.laneHalfWidthYd'];
    let q = 1;
    for (let d = SLOTS_PER_TEAM; d < SLOT_COUNT; d++) {
      const e = v.entity(d);
      if (e === null) continue;
      const ahead = e.px - v.self.px, side = e.py - v.self.py;
      if (ahead > 0 && ahead < depth && side < half && side > -half && ahead / depth < q) q = ahead / depth;
    }
    return q;
  }

  function wantsToRun(w: TickWorld, v: PerceivedView): boolean {
    const p = P!, play = cur!;
    let deep = 0, turned = 0, spy = false;
    for (let d = SLOTS_PER_TEAM; d < SLOT_COUNT; d++) {
      const e = v.entity(d);
      if (e === null) continue;
      const speed = hyp(e.velPx, e.velPy), side = e.py - v.self.py;
      if (e.px >= p['scramble.coverageDepthYd']) { deep++; if (e.velPx > p['judge.movingYps']) turned++; }
      if (e.px >= p['scramble.spyMinDepthYd'] && e.px <= p['scramble.spyDepthYd'] && side <= p['scramble.spyWidthYd'] && side >= -p['scramble.spyWidthYd'] && speed < p['judge.movingYps']) spy = true;
    }
    const toGo = w.situation.distanceYd;
    const chance = scrambleChance({
      zScrambleTendency: zScramble, laneQuality: laneQuality(w, v), manCoverageBacksTurned: deep >= 2 && turned / deep >= p['scramble.backsTurnedShare'],
      spyPresent: spy, yardsNeededShort: toGo !== null && toGo <= p['scramble.shortYd'], instruction: play.instructions.scramble,
    }, p, w.math);
    const u = scrambleDraw < SCRAMBLE_DRAWS ? uBegin[U_SCRAMBLE + scrambleDraw]! : uTick[3]!;
    scrambleDraw++;
    return u < chance;
  }

  function startRun(w: TickWorld, v: PerceivedView, why: RunReason): void {
    phase = RUN; relTarget = null;
    runPy = v.self.py;
    ran = { tick: w.tick, why };
    carrierOwns = options.onRun ? options.onRun(w, cur!.qbSlot, why) : false;
    detail(w, `qb.${why}`);
    note(w, why);
  }

  function toExtend(w: TickWorld, v: PerceivedView, side: number): void {
    phase = EXTEND; extendSide = side >= 0 ? 1 : -1; dodge = true; eyesDown = false;
    // J7.5.3 scramble rule: deep to short on his side first, then the rest, deep to short.
    const depthOf = (r: QbRead): number => { const e = v.entity(r.target.slot); return e ? e.px : -Infinity; };
    const sideOf = (r: QbRead): number => { const e = v.entity(r.target.slot); return e && (e.py - v.self.py) * extendSide >= 0 ? 0 : 1; };
    seq = seq.slice().sort((a, b) => sideOf(a) - sideOf(b) || depthOf(b) - depthOf(a));
    idx = 0; visitStart = w.tick * TICK_S; waitStart = visitStart; evaluating = false; firstPass = false;
    note(w, 'extend', -1, extendSide);
  }

  // ---------------------------------------------------------------------------------------------------
  // J7.5.2 throwing it away

  /** Finds the throwaway he would make now. Returns 1 legal, 0 none, -1 one he wrongly believes is legal. */
  function findThrowaway(w: TickWorld, v: PerceivedView): number {
    const p = P!, play = cur!;
    if (everOutside) {
      // Out of bounds past the line on his side: the pocket exception (B5.4.1).
      const south = (0 - w.frame.originY) * w.frame.attackDir, north = (w.geometry.widthYd - w.frame.originY) * w.frame.attackDir;
      const lo = south < north ? south : north, hi = south < north ? north : south;
      const near = hi - v.self.py < v.self.py - lo ? hi + p['throwaway.oobMarginYd'] : lo - p['throwaway.oobMarginYd'];
      awayPx = (v.self.px > 0 ? v.self.px : 0) + p['throwaway.pastLineYd']; awayPy = near;
      return 1;
    }
    // In the direction and vicinity of an eligible receiver: at the feet of the nearest one he can see.
    let best = Infinity, bx = 0, by = 0;
    for (let i = 0; i < play.eligible.length; i++) {
      const e = v.entity(play.eligible[i]!);
      if (e === null) continue;
      const d = hyp(e.px - v.self.px, e.py - v.self.py);
      if (d < best) { best = d; bx = e.px; by = e.py; }
    }
    if (best < Infinity && best > 0) {
      const short = p['throwaway.shortYd'] < best ? p['throwaway.shortYd'] : best / 2;
      awayPx = bx - ((bx - v.self.px) / best) * short; awayPy = by - ((by - v.self.py) / best) * short;
      return 1;
    }
    // Nothing legal. A quarterback who does not know the rule throws it into the ground ahead of him anyway.
    awayPx = v.self.px + p['throwaway.pastLineYd']; awayPy = v.self.py;
    return knowsRule ? 0 : -1;
  }

  // ---------------------------------------------------------------------------------------------------
  // J7.6 the throw

  function startRelease(w: TickWorld, t: number, target: QbTarget | null, kind: ThrowRecord['kind'], readIndex: number, hot: boolean, e: Estimate | null, thr: number): void {
    relMoving = phase === EXTEND || cur!.movement !== null;
    phase = RELEASE; releaseAt = t + releaseS; relTarget = target; relKind = kind; relRead = readIndex; relHot = hot;
    relAnticipated = e !== null && !e.broken; relUnset = unsetNow;
    relP = e ? e.pHat : 0; relI = e ? e.iHat : 0; relV = e ? e.v : 0; relThr = thr;
    if (target) lookAtSlot(w, target.slot);
    note(w, kind === 'throwaway' ? 'throwaway' : hot ? 'hot' : 'throw', target ? target.slot : -1, relV);
  }

  /**
   * J7.6.2 edge case, J9.2.1: a defender at the line gets a hand on it. Engine truth, like any contest.
   * Each defender whose position overlaps the first yards of the flight below his reach takes two
   * uniforms from the flight's `ball` stream, in slot order (hands up, then the bat); the first bat
   * takes the three deflection draws and the pass flies on from his hands, still a forward pass.
   */
  function batAtLine(w: TickWorld, launch: { x: number; y: number; h: number; vx: number; vy: number; vh: number }): number {
    const p = P!, bp = BP!, pl = w.players;
    for (let d = SLOTS_PER_TEAM; d < SLOT_COUNT; d++) {
      if (pl.moveMode[d] === M_DOWN || w.tick < pl.onGroundUntilTick[d]!) continue;
      const lane = batLane(launch.x, launch.y, launch.h, launch.vx, launch.vy, launch.vh, pl.posX[d]!, pl.posY[d]!, bp);
      const info = w.slots[d]!, reach = (info.player.heightIn / 36) * p['bat.reachPerHeight'];
      if (lane.overlap <= 0 || lane.heightYd > reach || lane.heightYd < 0) continue;
      const rng = ballStream(w), uHands = rng.uniform(), uBat = rng.uniform();
      const zBat = issToZ(info.player.attributes['batting_passes']!) - pl.dFatigueZ[d]! - pl.dInjuryZ[d]!;
      const up = uHands < handsUpChance(zBat, bp) ? 1 : 0;
      if (uBat >= batChance(up, lane.overlap, lane.heightYd, reach, bp)) continue;
      // The ball is taken to his hands along the launch line and deflected there.
      const vxy = hyp(launch.vx, launch.vy), along = ((pl.posX[d]! - launch.x) * launch.vx + (pl.posY[d]! - launch.y) * launch.vy) / vxy;
      batAir.x = launch.x + (launch.vx / vxy) * along; batAir.y = launch.y + (launch.vy / vxy) * along; batAir.h = lane.heightYd;
      batAir.vx = launch.vx; batAir.vy = launch.vy; batAir.vh = launch.vh - GRAVITY_YPS2 * (along / vxy);
      deflect(batAir, rng, bp);
      setFlightVelocity(w, batAir);
      w.emit({
        type: 'detail', t: roundSimS(w.tick * TICK_S + along / vxy), code: 'qb.pass_batted', playerIds: [info.playerId, w.slots[cur!.qbSlot]!.playerId],
        spot: { x: roundYd(batAir.x), y: roundYd(batAir.y) }, value: roundYd(lane.heightYd),
      });
      note(w, 'batted', d, lane.heightYd);
      return d;
    }
    return -1;
  }

  function doThrow(w: TickWorld, v: PerceivedView, hit: boolean): void {
    const p = P!, bp = BP!, play = cur!, s = play.qbSlot, pl = w.players, math = w.math, dir = w.frame.attackDir;
    const qx = v.self.px, qy = v.self.py, t = w.tick * TICK_S;
    unsetNow = relUnset;
    const pf = platformNow(hit, relAnticipated);
    let aimPx = awayPx, aimPy = awayPy, trajectory: Trajectory = 'firm', sd = 0, along = 0, across = 0, height = 0;
    if (relTarget !== null && relKind === 'pass') {
      // He aims where his eyes put the receiver at arrival, led away from the nearest defender (J7.6.2).
      // The ball leaves now: no release time is left to add.
      judgeTarget(v, relTarget, ctx!, 0, false, estThrow, 0);
      aimPx = estThrow.aimPx; aimPy = estThrow.aimPy; trajectory = estThrow.trajectory;
      if (play.kind === 'hailMary' && play.landmark) { aimPx = play.landmark.px; aimPy = play.landmark.py; trajectory = 'touch'; }
      else if (estThrow.nearestDefender >= 0 && catchPoint.isContested(estThrow.sepYd)) {
        const e = v.entity(estThrow.nearestDefender);
        if (e !== null) {
          const ox = aimPx - e.px, oy = aimPy - e.py, od = hyp(ox, oy);
          const band = depthBand(estThrow.airYd, p), zAcc = band === 'deep' ? zAccDeep : band === 'intermediate' ? zAccMid : zAccShort;
          const lead = p['acc.leadYd'] * clip(1 + p['acc.leadPerZ'] * zAcc, 0, 2);
          if (od > 0) { aimPx += (ox / od) * lead; aimPy += (oy / od) * lead; }
        }
      }
      const air = aimPx > 0 ? aimPx : 0;
      sd = errorSd(air, pf);
      // Deep balls miss long and short more than wide (J7.6.2).
      along = sd * (depthBand(air, p) === 'deep' ? p['acc.deepAlongRatio'] : 1) * nBegin[N_AIM]!;
      across = sd * nBegin[N_AIM + 1]!;
      height = sd * p['acc.heightSdShare'] * nBegin[N_AIM + 2]!;
    }
    const dx = aimPx - qx, dy = aimPy - qy, dd = hyp(dx, dy), ux = dd > 0 ? dx / dd : 1, uy = dd > 0 ? dy / dd : 0;
    const toPx = aimPx + ux * along - uy * across, toPy = aimPy + uy * along + ux * across;
    const fx = pl.posX[s]!, fy = pl.posY[s]!;
    // He allows for the steady wind; the flight feels the real air (J9.1.1, J9.7.1).
    const sol = solvePassFrom(fx, fy, fieldX(w, toPx), fieldY(w, toPy), vBall, trajectory, ctx!.dragPerYd, windFromEnvironment(w.environment), bp);
    const forward = (sol.arrival.x - fx) * dir > 0;
    const landPx = (sol.arrival.x - w.frame.originX) * dir, landPy = (sol.arrival.y - w.frame.originY) * dir;
    // J7.5.2: the throw meets the grounding rule's conditions. Positions are truth: this is what happened, for J10 and B11.
    let near = Infinity;
    for (let i = 0; i < play.eligible.length; i++) {
      const r = play.eligible[i]!, d = hyp(playX(w, r) - landPx, playY(w, r) - landPy);
      if (d < near) near = d;
    }
    const exception = everOutside && landPx >= 0;
    if (groundingExists && forward && underPressureNow && near > p['throwaway.vicinityYd'] && !exception) {
      hazard = { tick: w.tick, x: roundYd(sol.arrival.x), y: roundYd(sol.arrival.y) };
      detail(w, 'qb.grounding_hazard');
    }
    const launch = passLaunch(fx, fy, sol, bp);
    launchPass(w, s, launch, forward, bp);
    const beyond = qx > 0;
    w.emit({
      type: 'pass_release', t: roundSimS(t), marginYd: roundYd(qx < 0 ? -qx : qx), marginS: null, visibility: 'open',
      passerId: w.slots[s]!.playerId, targetId: relTarget !== null && relKind === 'pass' ? w.slots[relTarget.slot]!.playerId : null, forward,
      releaseSpot: { x: roundYd(fx), y: roundYd(fy) }, aimSpot: { x: roundYd(fieldX(w, aimPx)), y: roundYd(fieldY(w, aimPy)) },
      landingSpot: { x: roundYd(sol.arrival.x), y: roundYd(sol.arrival.y) }, airYd: roundYd(landPx),
      throwaway: relKind === 'throwaway', spike: false, underPressure: underPressureNow, passerOutsidePocket: everOutside, ballBeyondLine: beyond,
    });
    const batted = forward ? batAtLine(w, launch) : -1;
    if (batted < 0 && options.ballInAir) options.ballInAir(w, s, sol.arrival.x, sol.arrival.y, Math.ceil(sol.flightTimeS / TICK_S));
    throwRecord = {
      tick: w.tick, timeS: t, targetSlot: relTarget ? relTarget.slot : -1, kind: relKind, forward,
      aimX: fieldX(w, aimPx), aimY: fieldY(w, aimPy), landingX: sol.arrival.x, landingY: sol.arrival.y,
      missYd: hyp(along, across), heightErrorYd: height, errorSdYd: sd, trajectory, flightS: sol.flightTimeS, inRange: sol.inRange,
      platform: { ...pf }, readIndex: relRead, hot: relHot, pHat: relP, iHat: relI, value: relV, threshold: relThr, battedBySlot: batted,
    };
    phase = OVER;
    void math;
  }

  // ---------------------------------------------------------------------------------------------------
  // J7.2 and J7.3: the progression and the decision

  /** The receiver the current read points at; a coverage read resolves off the key defender (J7.2.1 step 4). */
  let keyChoice: QbTarget | null = null, keyFor = -1;
  function targetOf(w: TickWorld, v: PerceivedView, i: number): QbTarget {
    const r = seq[i]!;
    if (r.kind !== 'coverageKey' || r.keySlot === undefined || !r.ifDrives) return r.target;
    if (keyFor === i && keyChoice) return keyChoice;
    const p = P!, e = v.entity(r.keySlot);
    lookAtSlot(w, r.keySlot);
    // Sinking (gaining depth): throw underneath, the read's own target. Driving: throw behind him.
    const drives = e !== null && e.velPx < -p['read.keySinkYps'];
    const u = uBegin[U_KEY + (keyDraw < KEY_DRAWS ? keyDraw : KEY_DRAWS - 1)]!;
    keyDraw++;
    const right = e !== null && u < keyReadChance(zCov, p, w.math);
    const seesDrive = right ? drives : !drives;
    keyFor = i; keyChoice = seesDrive ? r.ifDrives : r.target;
    return keyChoice;
  }

  function newVisit(w: TickWorld, at: number): void {
    visitStart = at; waitStart = at; evaluating = false; keyFor = -1;
    if (firstPass && readTicks.length === idx) readTicks.push(w.tick);
  }

  function baseOf(i: number): number {
    return i + 1 < seq.length ? seq[i + 1]!.priorValue : P!['resp.throwAwayEp'];
  }

  function noiseOf(i: number): number { return nBegin[N_SEP + ((passes * seq.length + i) % SEP_LOOKS)]! * separationSdYd(zCov, P!); }

  /** Judges read `i` into `out` and returns his threshold for it, or NaN when he cannot judge it yet. */
  function judgeRead(w: TickWorld, v: PerceivedView, i: number, t: number, out: Estimate): number {
    const p = P!, r = seq[i]!;
    judgeTarget(v, targetOf(w, v, i), ctx!, noiseOf(i), r.alert === true, out);
    if (!out.ok) return NaN;
    // J7.1.2: he throws once the receiver has broken, or up to `earlyS` before it if he trusts the timing.
    if (!(out.broken || out.toBreakS <= earlyS)) return NaN;
    if (!out.seen && earlyS <= 0) return NaN;
    if (freeSeen && i === deepestRead) out.v += p['freePlay.deepBonusEp'];
    return throwThresholdEp(baseOf(i), riskOffset, t - tSet, pressureNear, p);
  }

  function exhausted(w: TickWorld, v: PerceivedView, t: number): void {
    const p = P!;
    passes++; firstPass = false;
    if (level === NONE || phase === EXTEND) { if (wantsToRun(w, v)) { startRun(w, v, 'scramble'); return; } }
    if (phase === EXTEND && t - gotBallT >= p['extend.giveUpS'] && findThrowaway(w, v) !== 0) { startRelease(w, t, null, 'throwaway', -1, false, null, 0); return; }
    if (phase === POCKET && passes >= p['read.maxPasses']) { toExtend(w, v, cur!.throwingSidePy); return; }
    idx = 0; newVisit(w, t);
  }

  function readStep(w: TickWorld, v: PerceivedView, t: number): void {
    const p = P!, play = cur!;
    if (seq.length === 0) return;
    // J7.4.2: with pressure felt he keeps his eyes downfield by a draw each tick, or loses one read time.
    const eyes = eyesDownfieldChance(zPocket, p);
    if (eyesDown) { if (uTick[2]! < eyes) { eyesDown = false; newVisit(w, t); blockUntil = t + tReadS; } else return; }
    else if (level >= FELT && phase === POCKET && uTick[2]! >= eyes) { eyesDown = true; lookAtPoint(w, threatPx, threatPy); note(w, 'eyes down'); return; }
    // J7.2.1 step 5: the true coverage shows and he starts again on the right side, one read time late.
    if (!restarted && play.correctedReads !== null && t >= tSet) {
      restarted = true;
      seq = play.correctedReads.slice();
      if (play.checkdown) seq.push({ kind: 'receiver', target: play.checkdown, priorValue: p['resp.throwAwayEp'] });
      idx = 0; newVisit(w, t); blockUntil = t + tReadS;
      note(w, 'restart');
    }
    if (idx >= seq.length) { exhausted(w, v, t); if (phase !== POCKET && phase !== EXTEND) return; }
    lookAtSlot(w, targetOf(w, v, idx).slot);
    if (t < blockUntil - EPS) return;
    const thr = judgeRead(w, v, idx, t, est);
    // A receiver already past his arm's reach only gets farther away: he comes off him at once and does not wait
    // out the read. Waiting cost him the next receiver, who had run out of his window by the time he looked.
    if (thr !== thr && est.outOfRange) { idx++; newVisit(w, t); if (idx < seq.length) note(w, 'read', seq[idx]!.target.slot, idx); return; }
    if (thr === thr) {
      if (!evaluating) { evaluating = true; visitStart = t > blockUntil ? t : blockUntil; }
      if (!options.test?.noThrow && est.v >= thr && est.iHat <= intCeil) { startRelease(w, t, targetOf(w, v, idx), 'pass', idx, false, est, thr); return; }
      // J7.6.1 edge case: a defender sitting on the throw (undercutting it, or in the lane) gets a pump fake, once a play.
      if (!pumped && level === NONE && est.nearestDefender >= 0 && (est.defenderPosition === 'undercut' || est.laneClearYd < p['judge.laneRadiusYd'])
        && uBegin[U_PUMP]! < pumpFakeChance(zHandling, p, w.math)) {
        pumped = true; pumpFrom = phase; phase = PUMP; pumpUntil = t + releaseS;
        pumps.push({ tick: w.tick, targetSlot: seq[idx]!.target.slot });
        detail(w, 'qb.pump_fake', est.nearestDefender);
        note(w, 'pump fake', seq[idx]!.target.slot, est.v);
        if (options.onPumpFake) options.onPumpFake(w, cur!.qbSlot, fieldX(w, est.aimPx), fieldY(w, est.aimPy));
        return;
      }
    }
    const due = evaluating ? visitStart + tReadS : waitStart + p['read.maxWaitS'] + tReadS;
    if (t + TICK_S >= due - EPS) { idx++; newVisit(w, due); if (idx < seq.length) note(w, 'read', seq[idx]!.target.slot, idx); }
  }

  // ---------------------------------------------------------------------------------------------------
  // J7.4.2 response to pressure

  function respond(w: TickWorld, v: PerceivedView, t: number): void {
    const p = P!, play = cur!, temp = p['pressure.softmaxTempEp'];
    respondedTo = threat;
    const scores: number[] = [], which: number[] = [];
    // Throw now: the read he is on, or the checkdown once it is available (J7.3.3).
    let throwIdx = -1, thr = NaN;
    if (phase !== DROP && idx < seq.length) { thr = judgeRead(w, v, idx, t, est); if (thr === thr && est.iHat <= intCeil) throwIdx = idx; }
    if (throwIdx < 0 && play.checkdown && (phase === EXTEND || idx >= p['read.checkdownAfter'])) {
      const cd = seq.length - 1;
      thr = judgeRead(w, v, cd, t, est);
      if (thr === thr && est.iHat <= intCeil) throwIdx = cd;
    }
    if (throwIdx >= 0 && !options.test?.noThrow) { scores.push((est.v - thr) / temp); which.push(0); }
    if (phase === POCKET || phase === DROP) { scores.push((p['resp.pocketEp'] + p['resp.pocketPerZEp'] * zPocket) / temp); which.push(1); }
    // Escape needs somewhere to go: no rusher he senses on the side away from the threat.
    const away = threatPy >= v.self.py ? -1 : 1;
    let open = true;
    for (let d = SLOTS_PER_TEAM; d < SLOT_COUNT; d++) if (sensed[d] === 1 && d !== threat && (playY(w, d) - v.self.py) * away > 0) open = false;
    if (open && phase !== EXTEND) { scores.push((p['resp.escapeEp'] + p['resp.escapePerZEp'] * zScramble + p['resp.escapeCodPerZEp'] * zCod) / temp); which.push(2); }
    const legal = findThrowaway(w, v);
    const dump = legal === 0 && uBegin[U_DUMP]! < riskyDumpChance(zComposure, p, w.math);
    if ((legal !== 0 || dump) && !options.test?.noThrow) { scores.push(p['resp.throwAwayEp'] / temp); which.push(3); }
    scores.push((p['resp.sackEp'] + (play.instructions.protectBall ? p['resp.protectBallEp'] : 0)) / temp); which.push(4);
    const pick = which[pickOutcome(contests.math.outcomeProbabilities(scores, w.math), uTick[3]!)]!;
    response = PRESSURE_RESPONSES[pick]!;
    note(w, `pressure: ${response}`, threat, threatTtc);
    if (pick === 0) startRelease(w, t, targetOf(w, v, throwIdx), 'pass', throwIdx, false, est, thr);
    else if (pick === 1) dodge = true;
    else if (pick === 2) toExtend(w, v, away);
    else if (pick === 3) startRelease(w, t, null, 'throwaway', -1, false, null, 0);
    else takeSack = true;
  }

  /** J7.4.2 pocket movement: the step that leaves him farthest from the rushers he senses, at shuffle speed. */
  function pocketMove(w: TickWorld, v: PerceivedView): void {
    const p = P!, step = p['pocket.stepYd'], qx = v.self.px, qy = v.self.py;
    let bestScore = -Infinity, bx = qx, by = qy;
    for (let k = 0; k < 4; k++) {
      const cx = qx + (k === 0 ? step : k === 3 ? -step : 0), cy = qy + (k === 1 ? step : k === 2 ? -step : 0);
      if (cx > -p['pocket.minBehindLineYd'] || cy > leftPy || cy < rightPy) continue;
      let nearest = Infinity;
      for (let d = SLOTS_PER_TEAM; d < SLOT_COUNT; d++) {
        if (sensed[d] === 0) continue;
        const e = v.entity(d), ex = e ? e.px : playX(w, d), ey = e ? e.py : playY(w, d), dist = hyp(ex - cx, ey - cy);
        if (dist < nearest) nearest = dist;
      }
      if (nearest > bestScore) { bestScore = nearest; bx = cx; by = cy; }
    }
    move(w, bx, by, 'shuffle', 1, 'arrive');
  }

  // ---------------------------------------------------------------------------------------------------
  // J7.7.1 mesh

  /**
   * Distance between two bodies for an exchange (J9.1.2 "within 0.8 yd"): body edge to body edge. Two
   * men cannot stand centre to centre closer than their radii allow (J2.6), so a centre distance of
   * 0.8 yd is never reached once bodies collide.
   */
  function handGap(w: TickWorld, a: number, b: number): number {
    const d = hyp(w.players.posX[b]! - w.players.posX[a]!, w.players.posY[b]! - w.players.posY[a]!) - w.slots[a]!.movement.bodyRadiusYd - w.slots[b]!.movement.bodyRadiusYd;
    return d > 0 ? d : 0;
  }

  function meshStep(w: TickWorld, v: PerceivedView, t: number): void {
    const p = P!, play = cur!, m = play.mesh!, s = play.qbSlot;
    const key = v.entity(m.keySlot);
    lookAtSlot(w, m.keySlot);
    if (t >= m.startS - EPS && t < m.endS - EPS && key !== null) {
      // Evidence: how fast the key closes on the mesh (shoulders turned and coming) against staying square or widening.
      const dist = hyp(key.px - v.self.px, key.py - v.self.py);
      if (dist > 0) { meshSum += -(key.velPx * (key.px - v.self.px) + key.velPy * (key.py - v.self.py)) / dist; meshN++; }
    }
    if (t < m.endS - EPS) return;
    if (!meshDecided) {
      meshDecided = true;
      const mean = meshN > 0 ? meshSum / meshN : 0, crash = mean > 0;
      const ambiguous = meshN === 0 || (mean < p['mesh.ambiguousYps'] && mean > -p['mesh.ambiguousYps']);
      // The defender's discipline is his share of the contest, read as every contest reads grades (J6.1.1).
      const dInfo = w.slots[m.keySlot]!, zDef = issToZ(dInfo.player.attributes['assignment_discipline']!);
      const correct = !ambiguous || uBegin[U_MESH]! < meshReadChance(zMeshRead, zDef, p, w.math);
      const seesCrash = correct ? crash : !crash;
      const decision = seesCrash ? m.onCrash : 'give';
      // A key he could not read cleanly is a decision made late (J7.7.1 edge case).
      meshLate = ambiguous || t > m.endS + p['mesh.lateS'];
      mesh = { decision, correct, ambiguous, late: meshLate, fumbled: false };
      detail(w, `qb.mesh.${decision}`, correct ? 1 : 0);
      note(w, `mesh: ${decision}`, m.keySlot, mean);
    }
    const decision = mesh!.decision;
    // The exchange itself: one draw, made when the ball is pulled or handed (give, keep or throw alike).
    const exchanging = decision !== 'give' || handGap(w, s, m.backSlot) <= BP!['exchange.handoffRangeYd']!;
    if (exchanging && uBegin[U_MESH_FUMBLE]! < meshFumbleChance(zHandling, mesh!.late, wet, p, w.math)) {
      mesh = { ...mesh!, fumbled: true };
      const at = { x: roundYd(w.players.posX[s]!), y: roundYd(w.players.posY[s]!) };
      w.emit({ type: 'fumble', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'crowded', kind: 'fumble', playerId: w.slots[s]!.playerId, side: w.slots[s]!.side, forcedById: null, spot: at });
      detail(w, 'qb.mesh.fumble', mesh.late ? 1 : 0);
      beginLoose(w, s, { x: w.players.posX[s]!, y: w.players.posY[s]!, h: BP!['snap.handHeightYd']!, vx: w.players.velX[s]! / 2, vy: w.players.velY[s]! / 2, vh: 0 }, BP!);
      phase = OVER;
      return;
    }
    if (decision === 'throw') { unsetNow = true; startRelease(w, t, m.throwTarget!, 'pass', -1, false, null, 0); return; }
    const spot = { x: roundYd(w.players.posX[s]!), y: roundYd(w.players.posY[s]!) };
    const qbId = w.slots[s]!.playerId, backId = w.slots[m.backSlot]!.playerId;
    if (decision === 'keep') {
      w.emit({ type: 'exchange', t: roundSimS(t), kind: 'fake', fromId: qbId, toId: backId, spot });
      startRun(w, v, 'keep');
      return;
    }
    // Give: the ball changes hands when the back is inside the handoff range (J9.1.2). A late give is flagged for J6.7.
    const reach = handGap(w, s, m.backSlot);
    if (reach > BP!['exchange.handoffRangeYd']!) {
      if (t > m.endS + p['mesh.lateS']) { meshLate = true; mesh = { ...mesh!, late: true }; }
      if (t > m.endS + p['mesh.lateS'] + p['mesh.lateS']) { mesh = { ...mesh!, decision: 'keep' }; startRun(w, v, 'keep'); }
      return;
    }
    const b = w.ball, pl = w.players;
    pl.hasBall[s] = 0; pl.hasBall[m.backSlot] = 1; b.carrierSlot = m.backSlot; b.lastPossessorSlot = s;
    b.x = pl.posX[m.backSlot]!; b.y = pl.posY[m.backSlot]!;
    w.emit({ type: 'exchange', t: roundSimS(t), kind: 'handoff', fromId: qbId, toId: backId, spot });
    w.emit({ type: 'possession', t: roundSimS(t), side: w.slots[s]!.side, playerId: backId, spot, how: 'exchange' });
    phase = OVER;
  }

  /**
   * A designed handoff (F4): no key and no window. He carries the ball to the meeting point, the ball
   * changes hands when the back is inside the handoff range (J9.1.2), and the exchange takes the same
   * one fumble draw every exchange takes (J6.7). If the back never gets there he keeps it and runs.
   */
  function handoffStep(w: TickWorld, v: PerceivedView, t: number): void {
    const p = P!, bp = BP!, play = cur!, h = play.handoff!, s = play.qbSlot, pl = w.players;
    lookAtSlot(w, h.backSlot);
    if (h.meet !== null) move(w, h.meet.px, h.meet.py, 'run', 1, 'arrive'); else stay(w, v);
    if (handGap(w, s, h.backSlot) > bp['exchange.handoffRangeYd']!) {
      if (t - gotBallT >= p['handoff.giveUpS']) { handoff = { tick: w.tick, given: false, fumbled: false }; detail(w, 'qb.handoff.missed'); note(w, 'handoff missed', h.backSlot); startRun(w, v, 'keep'); }
      return;
    }
    const spot = { x: roundYd(pl.posX[s]!), y: roundYd(pl.posY[s]!) };
    const qbId = w.slots[s]!.playerId, backId = w.slots[h.backSlot]!.playerId;
    if (uBegin[U_MESH_FUMBLE]! < meshFumbleChance(zHandling, false, wet, p, w.math)) {
      handoff = { tick: w.tick, given: false, fumbled: true };
      w.emit({ type: 'fumble', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'crowded', kind: 'fumble', playerId: qbId, side: w.slots[s]!.side, forcedById: null, spot });
      detail(w, 'qb.handoff.fumble');
      beginLoose(w, s, { x: pl.posX[s]!, y: pl.posY[s]!, h: bp['snap.handHeightYd']!, vx: pl.velX[s]! / 2, vy: pl.velY[s]! / 2, vh: 0 }, bp);
      phase = OVER;
      return;
    }
    const b = w.ball;
    pl.hasBall[s] = 0; pl.hasBall[h.backSlot] = 1; b.carrierSlot = h.backSlot; b.lastPossessorSlot = s;
    b.x = pl.posX[h.backSlot]!; b.y = pl.posY[h.backSlot]!;
    w.emit({ type: 'exchange', t: roundSimS(t), kind: 'handoff', fromId: qbId, toId: backId, spot });
    w.emit({ type: 'possession', t: roundSimS(t), side: w.slots[s]!.side, playerId: backId, spot, how: 'exchange' });
    handoff = { tick: w.tick, given: true, fumbled: false };
    detail(w, 'qb.handoff.give');
    note(w, 'handoff', h.backSlot);
    phase = OVER;
  }

  /** Option pitch after a keep: the pitch key commits to him and the ball goes to the pitch man, backward. */
  function pitchStep(w: TickWorld, v: PerceivedView, t: number): void {
    const p = P!, bp = BP!, play = cur!, pitch = play.mesh?.pitch, s = play.qbSlot;
    if (!pitch || pitchDone) return;
    const key = v.entity(pitch.keySlot);
    if (key === null) return;
    const dist = hyp(key.px - v.self.px, key.py - v.self.py);
    const closing = dist > 0 ? -((key.velPx - v.self.velPx) * (key.px - v.self.px) + (key.velPy - v.self.velPy) * (key.py - v.self.py)) / dist : 0;
    if (dist > p['mesh.pitchDistYd'] || closing <= 0) return;
    pitchDone = true;
    // A misread here keeps the ball: the draw only matters when the key is slow-playing him.
    if (closing < p['mesh.ambiguousYps'] && uBegin[U_PITCH]! >= meshReadChance(zMeshRead, issToZ(w.slots[pitch.keySlot]!.player.attributes['assignment_discipline']!), p, w.math)) return;
    const pl = w.players, fx = pl.posX[s]!, fy = pl.posY[s]!, tx = pl.posX[pitch.toSlot]!, ty = pl.posY[pitch.toSlot]!;
    const d = hyp(tx - fx, ty - fy), speed = p['mesh.pitchSpeedYps'], time = d > 0 ? d / speed : TICK_S;
    const h = bp['snap.handHeightYd']!;
    const forward = (tx - fx) * w.frame.attackDir > 0;
    launchPass(w, s, { x: fx, y: fy, h, vx: d > 0 ? ((tx - fx) / d) * speed : 0, vy: d > 0 ? ((ty - fy) / d) * speed : 0, vh: (GRAVITY_YPS2 * time) / 2 }, forward, bp);
    w.emit({
      type: 'pass_release', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', passerId: w.slots[s]!.playerId, targetId: w.slots[pitch.toSlot]!.playerId, forward,
      releaseSpot: { x: roundYd(fx), y: roundYd(fy) }, aimSpot: { x: roundYd(tx), y: roundYd(ty) }, landingSpot: { x: roundYd(tx), y: roundYd(ty) },
      airYd: roundYd((tx - w.frame.originX) * w.frame.attackDir), throwaway: false, spike: false, underPressure: underPressureNow, passerOutsidePocket: everOutside, ballBeyondLine: v.self.px > 0,
    });
    throwRecord = {
      tick: w.tick, timeS: t, targetSlot: pitch.toSlot, kind: 'pitch', forward, aimX: tx, aimY: ty, landingX: tx, landingY: ty, missYd: 0, heightErrorYd: 0, errorSdYd: 0,
      trajectory: 'firm', flightS: time, inRange: true, platform: { ...platformNow(false, false) }, readIndex: -1, hot: false, pHat: 0, iHat: 0, value: 0, threshold: 0, battedBySlot: -1,
    };
    phase = OVER;
  }

  // ---------------------------------------------------------------------------------------------------
  // J7.8.1 clock plays

  function scriptedStep(w: TickWorld, v: PerceivedView, t: number): void {
    const p = P!, bp = BP!, play = cur!, s = play.qbSlot, pl = w.players;
    if (play.kind === 'kneel') {
      move(w, launchPx, launchPy, 'shuffle', 1, 'arrive');
      if (t < gotBallT + p['kneel.liveS'] - EPS) return;
      kneel = { tick: w.tick, x: pl.posX[s]!, y: pl.posY[s]! };
      detail(w, 'qb.kneel');
      phase = OVER;
      return;
    }
    // Spike: a continuous throwing motion straight into the ground ahead of him (B5.5.1 item 4).
    stay(w, v);
    if (t < gotBallT + p['spike.releaseS'] - EPS) return;
    const fx = pl.posX[s]!, fy = pl.posY[s]!, dir = w.frame.attackDir, h = bp['pass.releaseHeightYd']!, speed = p['spike.speedYps'];
    const fall = h / speed, vxPlay = p['spike.aheadYd'] / fall;
    const landX = fx + p['spike.aheadYd'] * dir;
    const legal = play.underCenter || !w.rules.bool('pass.spike_requires_under_center');
    if (!legal && groundingExists) { hazard = { tick: w.tick, x: roundYd(landX), y: roundYd(fy) }; detail(w, 'qb.grounding_hazard'); }
    launchPass(w, s, { x: fx, y: fy, h, vx: vxPlay * dir, vy: 0, vh: -speed }, true, bp);
    w.emit({
      type: 'pass_release', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', passerId: w.slots[s]!.playerId, targetId: null, forward: true,
      releaseSpot: { x: roundYd(fx), y: roundYd(fy) }, aimSpot: { x: roundYd(landX), y: roundYd(fy) }, landingSpot: { x: roundYd(landX), y: roundYd(fy) },
      airYd: roundYd(v.self.px + p['spike.aheadYd']), throwaway: false, spike: true, underPressure: underPressureNow, passerOutsidePocket: false, ballBeyondLine: false,
    });
    throwRecord = {
      tick: w.tick, timeS: t, targetSlot: -1, kind: 'spike', forward: true, aimX: landX, aimY: fy, landingX: landX, landingY: fy, missYd: 0, heightErrorYd: 0, errorSdYd: 0,
      trajectory: 'drive', flightS: fall, inRange: true, platform: { ...platformNow(false, false) }, readIndex: -1, hot: false, pHat: 0, iHat: 0, value: 0, threshold: 0, battedBySlot: -1,
    };
    phase = OVER;
  }

  // ---------------------------------------------------------------------------------------------------
  // the Decide stage

  function onPossession(w: TickWorld, v: PerceivedView, t: number): void {
    const p = P!, play = cur!;
    gotBallT = t;
    launchPx = play.launchPx ?? -dropDepthYd(play.drop, p); launchPy = play.launchPy ?? v.self.py;
    tSet = setTimeS(play.drop, zFoot, play.playActionS, play.badSnapS, p);
    if (tSet < t) tSet = t;
    if (play.kind === 'kneel') { launchPx = v.self.px - p['kneel.lossYd']; launchPy = v.self.py; phase = SCRIPTED; }
    else if (play.kind === 'spike') phase = SCRIPTED;
    else if (play.kind === 'sneak') { startRun(w, v, 'sneak'); runPy = v.self.py; }
    else if (play.kind === 'mesh' || play.kind === 'handoff') phase = MESH;
    else phase = DROP;
  }

  function dropStep(w: TickWorld, v: PerceivedView, t: number): void {
    const p = P!, play = cur!, s = play.qbSlot;
    const path = play.movement ? play.movement.path : null;
    let gx = launchPx, gy = launchPy;
    if (path && path.length > 0) {
      // J7.5.3 designed movement: the launch point moves along the path; he is "set" when the play says, still moving.
      let k = 0;
      while (k < path.length - 1 && hyp(path[k]!.px - v.self.px, path[k]!.py - v.self.py) < p['drop.arriveYd']) k++;
      for (let j = 0; j < k; j++) if (hyp(path[j]!.px - v.self.px, path[j]!.py - v.self.py) < p['drop.arriveYd']) pathAt = j + 1 > pathAt ? j + 1 : pathAt;
      const at = path[pathAt < path.length ? pathAt : path.length - 1]!;
      gx = at.px; gy = at.py;
      move(w, gx, gy, 'run', 1, pathAt >= path.length - 1 ? 'arrive' : 'through');
    } else {
      // Pace: arrive as `tSet` comes, not before (J7.1.1 acceptance).
      const left = hyp(gx - v.self.px, gy - v.self.py), time = tSet - t;
      const backpedal = MOVE_MODES.indexOf('backpedal'), runMode = MOVE_MODES.indexOf('run');
      const vMax = w.slots[s]!.movement.vMaxYps;
      const topBack = options.topSpeed ? options.topSpeed(w, s, backpedal) : vMax / 2, topRun = options.topSpeed ? options.topSpeed(w, s, runMode) : vMax;
      const need = time > TICK_S ? left / time : Infinity;
      const mode: MoveMode = need <= topBack ? 'backpedal' : 'run', top = mode === 'backpedal' ? topBack : topRun;
      move(w, gx, gy, mode, left <= p['drop.arriveYd'] ? 1 : clip((need / top) * PACE_MARGIN, PACE_FLOOR, 1), 'arrive');
    }
    // Play action: his eyes leave the defense for the fake (J7.1.1).
    if (t < gotBallT + play.playActionS - EPS) lookAtPoint(w, gx, gy);
    else if (seq.length > 0) lookAtSlot(w, seq[0]!.target.slot);
    if (t >= tSet - EPS) {
      setPx = v.self.px; setPy = v.self.py;
      phase = path ? EXTEND : POCKET;
      if (path) { extendSide = gy >= v.self.py ? 1 : -1; firstPass = true; }
      idx = 0; newVisit(w, tSet);
      note(w, 'set', seq.length > 0 ? seq[0]!.target.slot : -1, tSet);
    }
  }
  let pathAt = 0;
  /** He leaves a little in hand so the last step lands on time; and never dawdles below a walk. Structural. */
  const PACE_MARGIN = 1.15, PACE_FLOOR = 0.3;

  function hailMaryStep(w: TickWorld, v: PerceivedView, t: number): void {
    const p = P!, play = cur!, lm = play.landmark!;
    stay(w, v);
    let there = seq.length > 0;
    for (let i = 0; i < seq.length; i++) {
      const e = v.entity(seq[i]!.target.slot);
      if (e === null || lm.px - e.px > p['hailMary.arriveYd']) there = false;
    }
    if (seq.length > 0) lookAtSlot(w, seq[0]!.target.slot);
    if (there || level === IMMINENT || t >= gotBallT + p['hailMary.holdMaxS']) startRelease(w, t, seq.length > 0 ? seq[0]!.target : null, seq.length > 0 ? 'pass' : 'throwaway', 0, false, null, 0);
    if (seq.length === 0) { awayPx = lm.px; awayPy = lm.py; }
  }

  function decideRun(w: TickWorld): void {
    const play = cur;
    if (!play || w.tick < 0 || w.deadAtTick !== null || phase === OVER) return;
    const s = play.qbSlot, b = w.ball, t = w.tick * TICK_S;
    const has = b.kind === 'held' && b.carrierSlot === s;
    if (!has) { if (everHad) phase = OVER; return; }
    const v = options.view(s), p = P!;
    if (!everHad) { everHad = true; pathAt = 0; onPossession(w, v, t); }
    for (let i = 0; i < QB_TICK_UNIFORMS; i++) uTick[i] = rng!.uniform();
    if (v.self.py > leftPy || v.self.py < rightPy) everOutside = true;
    const speed = hyp(v.self.velPx, v.self.velPy);
    movingNow = (phase === EXTEND || play.movement !== null || (phase === RELEASE && relMoving)) && speed > p['judge.movingYps'];
    toThrowSide = movingNow && v.self.velPy * play.throwingSidePy > 0;
    unsetNow = phase === DROP;
    sense(w, v);

    if (w.tick < TRACK && w.tick >= 0) { trackPressure[w.tick] = level; ticksTracked = w.tick + 1; }
    if (w.tick < stumbleUntil) { stay(w, v); track(w); return; }

    if (phase === SCRIPTED) { scriptedStep(w, v, t); track(w); return; }
    if (phase === MESH) { if (play.kind === 'handoff') handoffStep(w, v, t); else meshStep(w, v, t); track(w); return; }
    if (phase === RUN) {
      pitchStep(w, v, t);
      if (phase === RUN && !carrierOwns) move(w, v.self.px + p['scramble.runAheadYd'], play.kind === 'sneak' ? runPy : v.self.py, 'sprint', 1, 'through');
      if (play.kind === 'sneak' && phase === RUN && !carrierOwns) move(w, v.self.px + p['sneak.aheadYd'], runPy, 'sprint', 1, 'through');
      track(w);
      return;
    }
    // Past the line he is a runner and may not throw forward (B5, J7.5.1).
    if (v.self.px > 0 && phase !== RELEASE) { startRun(w, v, 'scramble'); track(w); return; }

    // A pump fake is a release started and stopped: it costs the release time, then he is back on the same read.
    if (phase === PUMP) {
      stay(w, v);
      if (t >= pumpUntil - EPS) { phase = pumpFrom; newVisit(w, t); }
      track(w);
      return;
    }

    if (phase === RELEASE) {
      if (movingNow) move(w, tgt.px, tgt.py, 'run', 1, 'arrive'); else stay(w, v);
      if (t >= releaseAt - EPS) doThrow(w, v, false);
      track(w);
      return;
    }

    // J7.3.3 hot: the declared unblocked rusher comes and he saw it, so the ball is out at once.
    if (play.hot && !hotDone && hotSeen) {
      const e = v.entity(play.hot.rusherSlot);
      if (e !== null && e.px < p['hot.comePx'] && e.velPx < -p['hot.comeYps']) {
        hotDone = true;
        judgeTarget(v, play.hot.target, ctx!, 0, false, estAlt);
        startRelease(w, t, play.hot.target, 'pass', -1, true, estAlt, 0);
        stay(w, v); track(w);
        return;
      }
    }

    if (takeSack) { stay(w, v); track(w); return; }
    if (level === IMMINENT && threat !== respondedTo) {
      respond(w, v, t);
      if (phase === RELEASE || takeSack) { stay(w, v); track(w); return; }
    }

    if (phase === DROP) { dropStep(w, v, t); track(w); return; }

    // J7.4.1 false pressure: he feels a rush that is not there and leaves a clean pocket.
    if (phase === POCKET && falseDrawn && !falseDone && level === NONE && t >= tSet + p['pressure.falseAfterSetS']) {
      falseDone = true;
      detail(w, 'qb.false_pressure');
      toExtend(w, v, play.throwingSidePy);
    }

    if (phase === POCKET) {
      if (level >= FELT || dodge) pocketMove(w, v); else stay(w, v);
      if (play.kind === 'hailMary') hailMaryStep(w, v, t); else readStep(w, v, t);
    } else if (phase === EXTEND) {
      const edge = extendSide > 0 ? leftPy : rightPy;
      const path = play.movement ? play.movement.path : null;
      if (path && path.length > 0 && !dodge) { const end = path[path.length - 1]!; move(w, end.px, end.py, 'run', 1, 'arrive'); }
      else move(w, -p['extend.depthYd'], edge + extendSide * p['extend.driftYd'], 'run', 1, 'arrive');
      if (play.kind === 'hailMary') hailMaryStep(w, v, t); else readStep(w, v, t);
    }
    track(w);
  }

  function track(w: TickWorld): void {
    if (w.tick >= 0 && w.tick < TRACK) { trackPhase[w.tick] = phase; trackLook[w.tick] = look; }
  }

  // ---------------------------------------------------------------------------------------------------
  // the Interact stage: J6.2.5 pressure events and the arrival contest (truth)

  function interactRun(w: TickWorld): void {
    const play = cur;
    if (!play || w.tick < 0 || w.deadAtTick !== null || sack !== null || !everHad) return;
    const p = P!, s = play.qbSlot, pl = w.players, b = w.ball, t = w.tick * TICK_S;
    const has = b.kind === 'held' && b.carrierSlot === s;
    const justThrew = !has && throwRecord !== null && throwRecord.kind !== 'pitch' && t - throwRecord.timeS <= p['arrival.hitAfterReleaseS'];
    underPressureNow = false;
    if (!has && !justThrew) return;
    // A runner's tackles belong to the carrier module (J8).
    if (phase === RUN) return;
    const qx = pl.posX[s]!, qy = pl.posY[s]!, rQ = w.slots[s]!.movement.bodyRadiusYd, qbId = w.slots[s]!.playerId;
    for (let d = SLOTS_PER_TEAM; d < SLOT_COUNT; d++) {
      if (pl.moveMode[d] === M_DOWN || w.tick < pl.onGroundUntilTick[d]!) continue;
      const c = pl.engagement[d]!;
      // Free, or winning his block by the margin the quarterback's own read uses (J7.4.1): a man still locked up
      // a yard from an under-center quarterback at the snap is not pressure.
      if (c >= 0 && !(c < w.contests.length && w.contests[c]!.advantage < p['pressure.feltAdvantage'])) continue;
      const dx = pl.posX[d]! - qx, dy = pl.posY[d]! - qy, dist = hyp(dx, dy), gap = dist - rQ - w.slots[d]!.movement.bodyRadiusYd;
      const closing = dist > 0 ? -((pl.velX[d]! - pl.velX[s]!) * dx + (pl.velY[d]! - pl.velY[s]!) * dy) / dist : 0;
      const ttc = gap <= 0 ? 0 : closing > 0 ? gap / closing : Infinity;
      const rusherId = w.slots[d]!.playerId, spot = { x: roundYd(qx), y: roundYd(qy) };
      if (has && contests.passRush.isPressure(dist, ttc, true)) {
        underPressureNow = true;
        if (pressured[d] === 0) { pressured[d] = 1; w.emit({ type: 'pressure', t: roundSimS(t), kind: 'pressure', rusherId, passerId: qbId, spot }); }
      }
      if (gap > p['arrival.contactGapYd'] || w.tick < rearm[d]!) continue;
      if (has && play.kind === 'kneel' && kneel === null) {
        // A kneel-down ends when he is touched: he is going to the ground anyway (J7.8.1), so this is the kneel, not a sack.
        kneel = { tick: w.tick, x: qx, y: qy };
        detail(w, 'qb.kneel');
        phase = OVER;
        return;
      }
      if (!has) {
        // Contact just after the release is a hit on the passer and changes nothing about the throw (J6.2.5).
        if (hitDone[d] === 0) { hitDone[d] = 1; w.emit({ type: 'pressure', t: roundSimS(t), kind: 'hit', rusherId, passerId: qbId, spot }); }
        continue;
      }
      let second = false;
      for (let o = SLOTS_PER_TEAM; o < SLOT_COUNT; o++) {
        if (o === d || pl.moveMode[o] === M_DOWN) continue;
        const oc = pl.engagement[o]!;
        if (oc >= 0 && !(oc < w.contests.length && w.contests[oc]!.advantage < p['pressure.feltAdvantage'])) continue;
        if (hyp(pl.posX[o]! - qx, pl.posY[o]! - qy) <= p['arrival.secondRusherYd']) second = true;
      }
      const dInfo = w.slots[d]!, da = dInfo.player.attributes;
      const zFinish = issToZ(da['tackling']!) - pl.dFatigueZ[d]! - pl.dInjuryZ[d]!;
      const blindside = sensed[d] === 0;
      const lo = qbId < rusherId ? qbId : rusherId, hi = qbId < rusherId ? rusherId : qbId;
      const stream = w.streams('contest', [w.situation.gameId, w.situation.playNumber, lo, hi, 'tackle']);
      let outcome = contests.passRush.resolveArrival({
        dz: zFinish - (zPocket + zScramble) / 2, blindside, qbMovingAway: dodge, secondRusherNear: second, releaseInProgress: phase === RELEASE,
      }, stream);
      // Two hands on the ball, going down: his choice (J7.4.2). The draw above is still taken.
      if (takeSack) outcome = 'sack';
      if (outcome === 'hit') {
        w.emit({ type: 'pressure', t: roundSimS(t), kind: 'hit', rusherId, passerId: qbId, spot });
        hitDone[d] = 1;
        doThrow(w, options.view(s), true);
        return;
      }
      if (outcome === 'escape') {
        w.emit({ type: 'pressure', t: roundSimS(t), kind: 'escape', rusherId, passerId: qbId, spot });
        rearm[d] = w.tick + Math.ceil(p['arrival.rearmS'] / TICK_S);
        stumbleUntil = w.tick + 1 + Math.ceil(p['arrival.stumbleS'] / TICK_S);
        const v = options.view(s);
        toExtend(w, v, playY(w, d) >= playY(w, s) ? -1 : 1);
        continue;
      }
      w.emit({ type: 'pressure', t: roundSimS(t), kind: 'sack', rusherId, passerId: qbId, spot });
      // Strip-sack (J6.7): a draw with the blindside flag.
      const fStream = w.streams('contest', [w.situation.gameId, w.situation.playNumber, lo, hi, 'fumble']);
      const zSecurity = issToZ(w.slots[s]!.player.attributes['ball_security']!) - pl.dFatigueZ[s]! - pl.dInjuryZ[s]! + (takeSack ? p['arrival.twoHandsZ'] : 0);
      const fumble = contests.ballSecurity.resolveFumble({
        zSecurity, zHitPower: issToZ(da['play_strength']!) - pl.dFatigueZ[d]! - pl.dInjuryZ[d]!, hitEnergy: 1, blindside,
        stripAttempt: options.stripAttempt ? options.stripAttempt(d) : false, secondHitter: second, wet, isPasser: true,
      }, fStream);
      sack = { tick: w.tick, x: qx, y: qy, rusherSlot: d, blindside, fumble };
      pl.moveMode[s] = M_DOWN;
      phase = OVER;
      if (fumble) {
        const ev: TruthEvent = {
          type: 'fumble', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'crowded', kind: 'fumble', playerId: qbId, side: w.slots[s]!.side, forcedById: rusherId, spot,
        };
        w.emit(ev);
        beginLoose(w, s, { x: qx, y: qy, h: BP!['snap.handHeightYd']!, vx: pl.velX[d]! / 2, vy: pl.velY[d]! / 2, vh: 1 }, BP!);
      }
      return;
    }
  }

  return {
    decide: { name: 'decide', begin, run: decideRun },
    interact: { name: 'interact', run: interactRun },
    setPlay,
    phase: () => QB_PHASES[phase]!,
    pressureLevel: () => PRESSURE_LEVELS[level]!,
    currentRead: () => (phase === POCKET || phase === EXTEND) && idx < seq.length ? idx : -1,
    record: () => ({
      tSetS: tSet, launchPx, launchPy, setPx, setPy, throwRecord, sack, kneel, ran, groundingHazard: hazard, restarted, hotSeen, falsePressure: falseDone,
      freePlaySeen: freeSeen, everOutsidePocket: everOutside, response, mesh, handoff, readTicks: readTicks.slice(), pumps: pumps.slice(),
    }),
    notes: () => noteLog,
    track: () => ({ phase: trackPhase, look: trackLook, pressure: trackPressure, ticks: ticksTracked }),
  };
}
