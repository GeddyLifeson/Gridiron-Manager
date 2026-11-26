// The ball carrier as tick stages (bible J8, with the J6.6 tackle and J6.7 ball-security contests run
// on bodies). `decide` runs after the player AI and the quarterback: while a steerable player has the
// ball it replaces his intent with the J8 path (track and read, look-ahead, lane softmax, moves,
// finishing). `interact` is the truth side: tackle attempts, piles, fumbles, loose-ball and kick
// recoveries, and the dead ball when a tackle is made or the carrier gives himself up.
//
// What he may read (Q1.4.1). Path choices read his `PerceivedView` (positions, velocities), his own
// state, his own side's play and public facts. Two truth reads stand in for things J8.1.1 says he
// sees: whether a defender is tied up in a block (engagement state), and each player's movement limits
// (how fast a body can get somewhere). `interact` is engine truth, like every contest.
//
// Draws:
//   - stream `carrier`, keyed [game, play, player] (J13.2.1). At the start of each carry a fixed block of
//     CARRY_UNIFORMS uniforms; then on every tick he is steered exactly LANE_NORMALS normals (lane noise)
//     and TICK_UNIFORMS uniforms (lane pick, move pick), used or not, so a decision never shifts a later draw.
//   - stream `contest`, keyed [game, play, lowerPlayerId, higherPlayerId, type] with type `tackle`, `pile`,
//     `move`, `fumble` or `recovery` (J6.1.3). A pair's stream is opened once per play and continued.
// Ends the play itself on a made tackle (`down_by_contact`, a pile's `forward_progress_stopped`, a push
// out of bounds, forward progress across the goal line), on a slide or a go-down (`gave_himself_up`), on
// a fair catch and on a kick taken by the kicking team. Out of bounds and goal-line crossings while
// running are left to the assembly's finish stage, which reads the boundary events.
import {
  BEHAVIORS, MOVE_MODES, SLOTS_PER_TEAM, SLOT_COUNT, TICK_S, issToZ, roundSimS, roundYd,
  type Behavior, type PerceivedView, type RandomStream, type TickWorld, type TruthEvent,
} from '@gm/schema';
import { ballParams, beginLoose, type BallParams } from '../ball/index.ts';
import { clampProbability, type Contests, type TackleType } from '../contest/index.ts';
import { PI, dAtan2, dCos, dExp, dLog, dSin, dSqrt, logistic } from '../dmath.ts';
import { contactNumbers, kinParams, type ContactNumbers, type KinParams } from '../kinematics/index.ts';
import type { PlayerMind } from '../player-ai/index.ts';
import type { PlayStage } from '../tick/loop.ts';
import { declareDead } from '../tick-resolver/finish.ts';
import {
  accountedDefenders, awarenessChance, bounceBiasYd, clip, competesChance, doNotScoreChance, horizonS, laneNoiseSdYd,
  laneTemperatureYd, pick, pressDurationS, readChance, softmax, turnUpDelayS, zOf,
} from './formulas.ts';
import { carrierParams, type CarrierParams } from './params.ts';

/** Most lane candidates a tick can hold: 13 fan headings, the designed track, and the move's escape. */
export const MAX_LANES = 15;
export const LANE_NORMALS = MAX_LANES;
export const TICK_UNIFORMS = 2;
/** Uniforms taken when a carry starts, in this order. */
export const CARRY_UNIFORMS = 4;
const U_AWARE = 0, U_DNS = 1, U_READ = 2, U_COMPETE = 3;

export const MOVES = ['cut', 'spin', 'stiffArm', 'lowerShoulder', 'speedThrough', 'hurdle'] as const;
export type Move = (typeof MOVES)[number];
const CUT = 0, SPIN = 1, STIFF = 2, SHOULDER = 3, THROUGH = 4, HURDLE = 5;

/** J8.4.2 situation rules from the end-of-game plan (I5, F13). */
export type SituationRule = 'none' | 'stayInBounds' | 'getOutOfBounds' | 'downShortOfGoal' | 'doNotScore';

/** What the coach (or K5) told this carrier for this play (I8, J8.2.2, J8.4). */
export interface CarrierInstruction {
  /** J8.4.1 "ball security first": two hands, no spins or stiff arms. */
  readonly ballSecurity: boolean;
  /** J8.4.3 self-protection: slide or give himself up before the hit. */
  readonly selfProtect: boolean;
  /** J8.2.2 "north-south, get what is blocked". */
  readonly northSouth: boolean;
  readonly rule: SituationRule;
  /** H3: the team ran this situation in practice this week. */
  readonly practicedThisWeek: boolean;
}
export const NO_INSTRUCTION: CarrierInstruction = { ballSecurity: false, selfProtect: false, northSouth: false, rule: 'none', practicedThisWeek: false };

/** J8.2.1 a designed run's back rules (F4), play frame. */
export interface DesignedRun {
  readonly slot: number;
  /** Aiming point, for example the outside leg of the guard. */
  readonly aimPx: number; readonly aimPy: number;
  /** The read defender's slot, or -1 for none (then he presses and goes to the look-ahead). */
  readonly readSlot: number;
  /** Zone: bang or bend on the read. Gap: inside or outside the kick-out. */
  readonly kind: 'zone' | 'gap';
  /** Concept id, the key into his `gameDay.knowledge` (D9.1.1). */
  readonly conceptId?: string;
  /** Press time at grade 50 when the concept states one; else the module default. */
  readonly pressS?: number;
}

/** J8.6.2 return call (F12) and the returner's rules (I4). */
export interface ReturnPlan {
  readonly side: 'left' | 'right' | 'middle';
  /** True: fair-catch when coverage arrives within the threshold. False: never signal. */
  readonly fairCatchAllowed: boolean;
  /** I4.5 returner rule: a punt coming down or bouncing inside this own yard line is left alone. Absent: he fields everything. */
  readonly letGoInsideYd?: number;
}

/** Tendencies J8.2.2 needs that D3.3.1 does not hold yet (routed to D). Internal skill scale, 50 when absent. */
export interface RunStyle { readonly decisiveness: number; readonly creativity: number }

export interface CarrierPlay {
  readonly designed?: DesignedRun | null;
  readonly returnPlan?: ReturnPlan | null;
}

export interface CarrierOptions {
  /** The perception module's view of a slot (WP-11). */
  view(slot: number): PerceivedView;
  /** The contest library (WP-12), or a getter when the caller builds it per play. */
  readonly contests: Contests | (() => Contests);
  /** The movement module (WP-14): top speed in a mode, planted cuts and chase targets. */
  readonly movement?: {
    modeTopSpeed(world: TickWorld, slot: number, mode: number): number;
    requestCut(slot: number, vCutYps: number): void;
  } | null;
  /** The player AI (WP-19): effort, strip choice and the K1.3.2 patience shift. */
  readonly playerAi?: {
    effortOf(slot: number): number;
    stripAttempt(slot: number): boolean;
    patienceShift(slot: number): number;
  } | null;
  readonly instruction?: ((slot: number) => CarrierInstruction | null) | null;
  readonly style?: ((slot: number) => RunStyle | null) | null;
  readonly mind?: ((slot: number) => PlayerMind | null) | null;
}

export type CarryHow = 'exchange' | 'catch' | 'interception' | 'kick' | 'recovery' | 'qbRun' | 'other';

export interface CarryRecord {
  readonly slot: number;
  readonly startTick: number;
  readonly how: CarryHow;
  /** J8.4.2 draw result for his situation rule (true when there is no rule). */
  readonly aware: boolean;
}
export interface TackleRecord {
  readonly tick: number;
  readonly carrierSlot: number;
  readonly tacklerSlot: number;
  readonly tacklers: number;
  readonly type: TackleType | 'pile';
  readonly outcome: 'made' | 'broken' | 'missed';
  readonly move: Move | null;
  readonly moveWon: boolean;
  readonly pTackle: number;
  readonly fumble: boolean;
  readonly progressYd: number;
}
export interface LaneRecord {
  readonly tick: number;
  readonly slot: number;
  /** Chosen heading, play frame radians. */
  readonly headingRad: number;
  /** Index among the candidates: fan from the leftmost heading, then the designed track, then the move's escape. */
  readonly index: number;
  readonly score: number;
  readonly designed: boolean;
}
export interface ReadRecord {
  readonly tick: number;
  readonly slot: number;
  /** What the key showed and what he did: 'bang', 'bend', 'inside', 'outside'. */
  readonly correct: 'bang' | 'bend' | 'inside' | 'outside';
  readonly chosen: 'bang' | 'bend' | 'inside' | 'outside';
  readonly penetration: boolean;
}

export interface CarrierRecord {
  readonly carries: readonly CarryRecord[];
  readonly tackles: readonly TackleRecord[];
  readonly reads: readonly ReadRecord[];
  readonly moves: readonly { readonly tick: number; readonly slot: number; readonly tacklerSlot: number; readonly move: Move }[];
  readonly endings: readonly { readonly tick: number; readonly slot: number; readonly kind: 'slide' | 'goDown' | 'downShort' | 'fairCatch' }[];
}

export interface Carrier {
  readonly decide: PlayStage;
  readonly interact: PlayStage;
  /** Call before the loop's `begin` for each play. */
  setPlay(play?: CarrierPlay | null): void;
  /** For the quarterback module's `onRun` (WP-20): from here this module steers him. */
  onRun(world: TickWorld, slot: number, why: string): boolean;
  /** For the quarterback module's `laneQuality` (WP-20): best lane beyond the line, 0 to 1. Draws nothing. */
  laneQuality(world: TickWorld, slot: number): number;
  /** J10.6.2 hit energy the slot took and gave this play, in typical hits. */
  hitLoad(slot: number): number;
  record(): CarrierRecord;
  /** The lane he took on each steered tick (engine values: coaching school only, N5). */
  lanes(): readonly LaneRecord[];
}

const B = (b: Behavior): number => BEHAVIORS.indexOf(b);
const NOT_RUNNERS = new Set([B('quarterback'), B('kicker'), B('holder'), B('snapper')]);
const M_DOWN = MOVE_MODES.indexOf('down');
const M_SPRINT = MOVE_MODES.indexOf('sprint');
const RAD = PI / 180;

export function createCarrier(options: CarrierOptions): Carrier {
  const contestsOf = (): Contests => (typeof options.contests === 'function' ? options.contests() : options.contests);
  let contests: Contests = null as unknown as Contests;
  let p: CarrierParams | null = null, kp: KinParams | null = null, bp: BallParams | null = null;
  let play: CarrierPlay = {};

  // Per-play state, reset in begin. Typed arrays so nothing is allocated per tick (P6.3.1).
  const ran = new Uint8Array(SLOT_COUNT);
  const rearm = new Int32Array(SLOT_COUNT);
  /** A receiver has touched this kick (a muff): the returner's let-it-go rule no longer applies. */
  let receiversTouched = false;
  const hit = new Float64Array(SLOT_COUNT);
  const moveVs = new Int8Array(SLOT_COUNT); // move chosen against this tackler, -1 none
  const carrierStreams: (RandomStream | null)[] = new Array<RandomStream | null>(SLOT_COUNT).fill(null);
  const pairStreams = new Map<string, RandomStream>();
  const carries: CarryRecord[] = [], tackles: TackleRecord[] = [], reads: ReadRecord[] = [], moveLog: { tick: number; slot: number; tacklerSlot: number; move: Move }[] = [];
  const endings: { tick: number; slot: number; kind: 'slide' | 'goDown' | 'downShort' | 'fairCatch' }[] = [];
  const laneLog: LaneRecord[] = [];

  // Current carry.
  let cur = -1, carryTick = 0, turnUntil = 0, how: CarryHow = 'other';
  let aware = true, dnsAware = false, competes = false, uRead = 0, zTough = 0;
  let zVision = 0, zDecisive = 0, zCreative = 0, zPatience = 0, temp = 0.8, horizon = 0.7, kAccount = 3, noiseSd = 1.5;
  let instr: CarrierInstruction = NO_INSTRUCTION;
  // Designed run phases: 0 none, 1 press, 2 committed.
  let runPhase = 0, pressUntil = 0, commitTick = 0, choicePx = 0, choicePy = 0, hasChoice = false;
  // The track the assignment gave him when the carry began (fallback designed lane).
  let trackPx = 0, trackPy = 0, hasTrack = false;
  // Escape heading after a cut move, play frame.
  let escapeHeading = 0, escapeUntil = 0;
  let prevBallKind = '';

  const laneHead = new Float64Array(MAX_LANES), laneScore = new Float64Array(MAX_LANES), laneProb = new Float64Array(MAX_LANES);
  const laneEndPx = new Float64Array(MAX_LANES), laneEndPy = new Float64Array(MAX_LANES);
  const noise = new Float64Array(LANE_NORMALS);
  const threat = new Int16Array(SLOT_COUNT), threatD = new Float64Array(SLOT_COUNT);
  const aim = new Array<{ px: number; py: number }>(SLOT_COUNT);
  for (let s = 0; s < SLOT_COUNT; s++) aim[s] = { px: 0, py: 0 };
  const contact: ContactNumbers = { closingSpeedYps: 0, momentumRatio: 1, hitEnergy: 0, blindside: false };

  // ---- small helpers --------------------------------------------------------------------------
  const P = (): CarrierParams => p!;
  const fd = (w: TickWorld): number => w.frame.attackDir;
  const px = (w: TickWorld, s: number): number => (w.players.posX[s]! - w.frame.originX) * fd(w);
  const py = (w: TickWorld, s: number): number => (w.players.posY[s]! - w.frame.originY) * fd(w);
  const vpx = (w: TickWorld, s: number): number => w.players.velX[s]! * fd(w);
  const vpy = (w: TickWorld, s: number): number => w.players.velY[s]! * fd(w);
  /** +1 when the slot attacks the play frame's +px goal, -1 after a change of possession. */
  const goalDir = (w: TickWorld, s: number): number => w.players.attackDir[s]! * fd(w);
  const hyp = (x: number, y: number): number => dSqrt(x * x + y * y);
  const isDown = (w: TickWorld, s: number): boolean => w.players.moveMode[s] === M_DOWN || w.tick < w.players.onGroundUntilTick[s]!;
  const attr = (w: TickWorld, s: number, a: string): number => w.slots[s]!.player.attributes[a] ?? 50;
  /** J6.1.1 effective z of one grade, with this play's fatigue, injury and knowledge penalties. */
  const zEff = (w: TickWorld, s: number, a: string): number => {
    const pl = w.players;
    return issToZ(attr(w, s, a)) - pl.dFatigueZ[s]! - pl.dInjuryZ[s]! - pl.dKnowledgeZ[s]!;
  };
  const topSpeed = (w: TickWorld, s: number): number =>
    options.movement ? options.movement.modeTopSpeed(w, s, M_SPRINT) : w.slots[s]!.movement.vMaxYps;
  const tNow = (w: TickWorld): number => (w.tick + 1) * TICK_S;
  const spot = (x: number, y: number) => ({ x: roundYd(x), y: roundYd(y) });
  const pairStream = (w: TickWorld, a: number, b: number, type: 'tackle' | 'pile' | 'move' | 'fumble' | 'recovery'): RandomStream => {
    const ia = w.slots[a]!.playerId, ib = w.slots[b]!.playerId, lo = ia < ib ? ia : ib, hi = ia < ib ? ib : ia;
    const key = `${lo}:${hi}:${type}`;
    let s = pairStreams.get(key);
    if (s === undefined) { s = w.streams('contest', [w.situation.gameId, w.situation.playNumber, lo, hi, type]); pairStreams.set(key, s); }
    return s;
  };
  const carrierStream = (w: TickWorld, s: number): RandomStream => {
    let st = carrierStreams[s] ?? null;
    if (st === null) { st = w.streams('carrier', [w.situation.gameId, w.situation.playNumber, w.slots[s]!.playerId]); carrierStreams[s] = st; }
    return st;
  };
  const steerable = (w: TickWorld, s: number): boolean => ran[s] === 1 || !NOT_RUNNERS.has(w.players.behavior[s]!);
  const isKicker = (s: number): boolean => s < SLOTS_PER_TEAM;
  /** Inside the sidelines and end lines. A man out of bounds cannot take a kicked or loose ball, and an out-of-bounds ball is not takeable. */
  const inField = (w: TickWorld, x: number, y: number): boolean => x > 0 && x < w.geometry.lengthYd && y > 0 && y < w.geometry.widthYd;

  function begin(w: TickWorld): void {
    p = carrierParams(w.params); kp = kinParams(w.params); bp = ballParams(w.params); contests = contestsOf();
    ran.fill(0); rearm.fill(0); hit.fill(0); moveVs.fill(-1); carrierStreams.fill(null); pairStreams.clear();
    carries.length = 0; tackles.length = 0; reads.length = 0; moveLog.length = 0; endings.length = 0; laneLog.length = 0;
    cur = -1; prevBallKind = w.ball.kind; runPhase = 0; hasChoice = false; hasTrack = false; escapeUntil = 0; receiversTouched = false;
  }

  // ---- starting a carry -----------------------------------------------------------------------
  function howBegan(w: TickWorld, s: number): CarryHow {
    if (ran[s] === 1) return 'qbRun';
    const id = w.slots[s]!.playerId;
    for (let i = w.events.length - 1; i >= 0; i--) {
      const e = w.events[i]!;
      if (e.type !== 'possession' || e.playerId !== id) continue;
      if (e.how === 'exchange' || e.how === 'snap' || e.how === 'backward_pass') return 'exchange';
      if (e.how === 'catch') return 'catch';
      if (e.how === 'interception') return 'interception';
      if (e.how === 'kick_catch' || e.how === 'kick_recovery') return 'kick';
      return 'recovery';
    }
    return prevBallKind === 'passInFlight' ? 'catch' : 'other';
  }

  function startCarry(w: TickWorld, c: number): void {
    const q = P();
    cur = c; carryTick = w.tick; how = howBegan(w, c);
    const st = carrierStream(w, c);
    const u0 = st.uniform(), u1 = st.uniform(), u2 = st.uniform(), u3 = st.uniform();
    const u = [u0, u1, u2, u3];
    instr = options.instruction?.(c) ?? NO_INSTRUCTION;
    const style = options.style?.(c) ?? null, mind = options.mind?.(c) ?? null;
    const zFb = zEff(w, c, 'football_intelligence');
    aware = instr.rule === 'none' || u[U_AWARE]! < awarenessChance(zFb, instr.practicedThisWeek, q);
    dnsAware = aware && instr.rule === 'doNotScore' && u[U_DNS]! < doNotScoreChance(zFb, instr.practicedThisWeek, q);
    zTough = issToZ(mind?.competitiveness ?? 50);
    competes = u[U_COMPETE]! < competesChance(zTough, q);
    uRead = u[U_READ]!;
    const d = play.designed ?? null;
    // J8.1.1 inputs: which vision grade applies to this carry.
    if (how === 'catch' || how === 'interception') zVision = zEff(w, c, 'run_after_catch');
    else if (how === 'kick') zVision = zEff(w, c, 'return_vision');
    else if (d !== null && d.slot === c) zVision = zEff(w, c, d.kind === 'zone' ? 'vision_zone' : 'vision_gap');
    else { const a = zEff(w, c, 'vision_zone'), b = zEff(w, c, 'vision_gap'); zVision = a > b ? a : b; }
    zDecisive = zOf(style?.decisiveness); zCreative = zOf(style?.creativity);
    zPatience = zEff(w, c, 'patience_and_tempo');
    temp = laneTemperatureYd(zDecisive, q); horizon = horizonS(zVision, q); kAccount = accountedDefenders(zVision, q); noiseSd = laneNoiseSdYd(zVision, q);
    // Designed run: press then read (J8.2.1). Otherwise the assignment's current target is his track.
    runPhase = 0; hasChoice = false; escapeUntil = 0;
    if (d !== null && d.slot === c && how === 'exchange') {
      runPhase = 1;
      const shift = options.playerAi?.patienceShift(c) ?? 0;
      pressUntil = w.tick + Math.ceil(((d.pressS ?? q['read.pressS']) / q['read.pressS']) * pressDurationS(zPatience, shift, q) / TICK_S);
    }
    const it = w.intents[c]!;
    hasTrack = it.target !== null;
    if (it.target !== null) { trackPx = it.target.px; trackPy = it.target.py; }
    // J8.6.1 turn-up after a catch.
    turnUntil = w.tick;
    if (how === 'catch') {
      const vx = vpx(w, c) * goalDir(w, c), vy = vpy(w, c), sp = hyp(vx, vy);
      const inStride = sp >= q['yac.inStrideMinYps'] && vx >= sp * dCos(q['yac.inStrideDeg'] * RAD);
      turnUntil = w.tick + Math.ceil(turnUpDelayS(inStride, zEff(w, c, 'run_after_catch'), q) / TICK_S);
    }
    carries.push({ slot: c, startTick: w.tick, how, aware });
  }

  // ---- J8.1.1 look-ahead ----------------------------------------------------------------------
  /** Threats he accounts for: unblocked, upright opponents he can see, in his cone, nearest first. Returns how many. */
  function threats(w: TickWorld, c: number, view: PerceivedView, heading: number, k: number): number {
    const q = P(), side = w.slots[c]!.side, cx = px(w, c), cy = py(w, c), cone = dCos(q['look.coneHalfDeg'] * RAD);
    const early = view.tSinceSnapS < q['look.screenS'] && cx * goalDir(w, c) < 0;
    let n = 0;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (w.slots[s]!.side === side || isDown(w, s)) continue;
      const e = view.entity(s);
      if (e === null) continue;
      const eng = w.players.engagement[s]!;
      if (eng >= 0 && eng < w.contests.length && w.contests[eng]!.advantage > -0.5 && tiedUp(w, s)) continue;
      const dx = e.px - cx, dy = e.py - cy, d = hyp(dx, dy);
      if (d > 0.5 && (dCos(heading) * dx + dSin(heading) * dy) / d < cone) continue;
      // J8.1.1 rule 5: in the first moments the line screens defenders at the line who are off his line of sight.
      if (early && (e.px < 0 ? -e.px : e.px) < q['look.screenDepthYd'] && d > 0.5 && (dCos(heading) * dx + dSin(heading) * dy) / d < dCos(30 * RAD)) continue;
      // Insert sorted by distance; ties keep the lower slot.
      let i = n;
      while (i > 0 && threatD[i - 1]! > d) { threat[i] = threat[i - 1]!; threatD[i] = threatD[i - 1]!; i--; }
      threat[i] = s; threatD[i] = d; n++;
    }
    return n < k ? n : k;
  }

  /**
   * How far a defender can get in `t` seconds: what he keeps of his current speed plus the rest of his top
   * speed reached at his acceleration (J2.2.1 sprint model, closed form).
   */
  function reachYd(w: TickWorld, s: number, vx: number, vy: number, t: number): number {
    const m = w.slots[s]!.movement, v = hyp(vx, vy), vMax = m.vMaxYps, tau = m.tauS > 0 ? m.tauS : 0.5;
    const v0 = v < vMax ? v : vMax;
    return v0 * t + (vMax - v0) * (t - tau * (1 - dExp(-t / tau)));
  }

  /** J8.3.2 chance that a free teammate ahead blocks threat `s` before it reaches a point at time `tHit`. */
  function blockCover(w: TickWorld, c: number, view: PerceivedView, s: number, sx: number, sy: number, tHit: number): number {
    const q = P(), side = w.slots[c]!.side, cx = px(w, c);
    let best = 0;
    for (let b = 0; b < SLOT_COUNT; b++) {
      if (b === c || w.slots[b]!.side !== side || isDown(w, b) || w.players.engagement[b]! >= 0) continue;
      const e = view.entity(b);
      if (e === null || (e.px - cx) * goalDir(w, c) < -1) continue;
      const tb = hyp(e.px - sx, e.py - sy) / w.slots[b]!.movement.vMaxYps;
      if (tb >= tHit) continue;
      const pb = logistic(q['block.beta0'] + q['block.perZ'] * (zEff(w, b, 'open_field_blocking') - zEff(w, s, 'block_shedding')));
      if (pb > best) best = pb;
    }
    return best;
  }

  /**
   * Scores lanes into laneScore and returns the count. `noisy` adds the J8.1.1 noise and the designed and
   * style terms; without it the scores are the plain look-ahead (for `laneQuality`).
   */
  let lastDesigned = -1;
  function scoreLanes(w: TickWorld, c: number, view: PerceivedView, noisy: boolean, zv: number): number {
    const q = P(), cx = px(w, c), cy = py(w, c), gd = goalDir(w, c);
    const vx = vpx(w, c), vy = vpy(w, c), sp = hyp(vx, vy);
    const up = gd > 0 ? 0 : PI;
    const centre = sp > 1 ? dAtan2(vy, vx) : up;
    const nFan = clip(Math.round(q['look.lanes']), 3, 13), fan = q['look.fanDeg'] * RAD;
    let n = 0;
    for (let i = 0; i < nFan; i++) laneHead[n++] = centre + fan / 2 - (i * fan) / (nFan - 1);
    let designedIdx = -1, escapeIdx = -1;
    if (noisy && (hasChoice || (runPhase !== 1 && hasTrack))) {
      const tx = hasChoice ? choicePx : trackPx, ty = hasChoice ? choicePy : trackPy;
      if (hyp(tx - cx, ty - cy) > 0.5) { designedIdx = n; laneHead[n++] = dAtan2(ty - cy, tx - cx); }
    }
    if (noisy && w.tick < escapeUntil) { escapeIdx = n; laneHead[n++] = escapeHeading; }
    lastDesigned = designedIdx;
    const H = noisy ? horizon : horizonS(zv, q), k = noisy ? kAccount : accountedDefenders(zv, q);
    const vTop = topSpeed(w, c);
    const nThreat = threats(w, c, view, centre, k);
    const samples = clip(Math.round(q['look.pathSamples']), 2, 8);
    const g = w.geometry, r = w.slots[c]!.movement.bodyRadiusYd;
    const sit = w.situation, offense = w.slots[c]!.side === sit.offense;
    const ltgPx = w.frame.lineToGainPx, goalPx = w.frame.goalLinePx;
    // J8.1.1 self-preservation: earliest clear hit among the threats he accounts for.
    let tHitMin = Infinity;
    for (let j = 0; j < nThreat; j++) {
      const s = threat[j]!, e = view.entity(s)!;
      const gap = hyp(e.px - cx, e.py - cy) - w.slots[s]!.movement.bodyRadiusYd - w.slots[c]!.movement.bodyRadiusYd;
      const th = (gap > 0 ? gap : 0) / w.slots[s]!.movement.vMaxYps;
      if (th < tHitMin) tHitMin = th;
    }
    // A carrier who knows the plan says stay in bounds does not take the sideline to dodge the hit.
    const hitAvoid = !(aware && instr.rule === 'stayInBounds') && tHitMin <= q['lane.hitAvoidS'] ? q['lane.hitAvoid'] * clip(1 - q['lane.hitAvoidToughPerZ'] * (noisy ? zTough : 0), 0, 2) : 0;
    const shortYardage = offense && ((sit.down ?? 0) >= 3 && (sit.distanceYd ?? 99) <= 2);
    const fourthShort = offense && (sit.down ?? 0) === 4 && (sit.distanceYd ?? 99) <= 2;
    for (let i = 0; i < n; i++) {
      const h = laneHead[i]!, ch = dCos(h), sh = dSin(h);
      // A cut away from his current direction keeps cos of the angle of his speed, floored (J2.1.3, simplified).
      const turn = sp > 1 ? ch * (vx / sp) + sh * (vy / sp) : 1;
      const keep = turn > q['look.cutKeepMin'] ? turn : q['look.cutKeepMin'];
      const full = H * vTop * (0.5 + 0.5 * keep);
      // A lane that leaves the field ends the run where it crosses the sideline: no yards or hits beyond it.
      const endFy = w.frame.originY + (cy + sh * full) * fd(w);
      const startFy = w.players.posY[c]!;
      let fOut = 1;
      if (endFy < r && startFy > r) fOut = (startFy - r) / (startFy - endFy);
      else if (endFy > g.widthYd - r && startFy < g.widthYd - r) fOut = (g.widthYd - r - startFy) / (endFy - startFy);
      const out = fOut < 1, dist = full * fOut, Hl = H * fOut;
      const ex = cx + ch * dist, ey = cy + sh * dist;
      laneEndPx[i] = ex; laneEndPy[i] = ey;
      let score = q['look.gainPerYd'] * (ex - cx) * gd;
      // Threats who can reach the path within the horizon, discounted by a blocker who gets there first.
      for (let j = 0; j < nThreat; j++) {
        const s = threat[j]!, e = view.entity(s)!;
        let tHit = -1;
        for (let m = 1; m <= samples; m++) {
          const f = m / samples, qx = cx + ch * dist * f, qy = cy + sh * dist * f, tq = Hl * f;
          if (hyp(e.px - qx, e.py - qy) - q['lane.reachSlackYd'] <= reachYd(w, s, e.velPx, e.velPy, tq)) { tHit = tq; break; }
        }
        if (tHit < 0) continue;
        score -= q['look.threatYd'] * (1 - blockCover(w, c, view, s, e.px, e.py, tHit));
      }
      // Bodies in the lane.
      for (let s = 0; s < SLOT_COUNT; s++) {
        if (s === c) continue;
        const e = view.entity(s);
        if (e === null) continue;
        for (let m = 1; m <= samples; m++) {
          const f = m / samples;
          if (hyp(e.px - (cx + ch * dist * f), e.py - (cy + sh * dist * f)) <= q['look.crowdRadiusYd']) { score -= q['look.crowdYd']; break; }
        }
      }
      // Sideline and situation terms (J8.4.2).
      const fy = w.frame.originY + ey * fd(w);
      const toSide = (fy < g.widthYd / 2 ? fy : g.widthYd - fy);
      if (out) score -= q['look.outOfBoundsYd'];
      if (out && hitAvoid > 0 && dist <= q['lane.hitAvoidOutYd']) score += hitAvoid;
      if (aware && instr.rule === 'getOutOfBounds') {
        // Out is the goal: full term for a lane that gets there, part of it for one that closes on the sideline.
        const nowSide = startFy < g.widthYd / 2 ? startFy : g.widthYd - startFy;
        score += out ? q['look.outOfBoundsYd'] + q['aware.sidelineTermYd'] : 0.5 * q['aware.sidelineTermYd'] * clip((nowSide - toSide) / (nowSide > 1 ? nowSide : 1), 0, 1);
      }
      if (aware && instr.rule === 'stayInBounds' && toSide < q['aware.sidelineZoneYd']) score -= q['aware.sidelineTermYd'];
      if (noisy) {
        // J8.2.2 bounce bias on outside lanes, by his time edge over the nearest threat to the lane's end.
        const off = ch * (gd > 0 ? 1 : -1);
        if (off < dCos(q['style.outsideDeg'] * RAD) && (ex - cx) * gd > 0) {
          let tDef = Infinity;
          for (let j = 0; j < nThreat; j++) { const e = view.entity(threat[j]!)!; const t = hyp(e.px - ex, e.py - ey) / w.slots[threat[j]!]!.movement.vMaxYps; if (t < tDef) tDef = t; }
          const edge = tDef === Infinity ? q['style.bounceMaxEdgeTenths'] : (tDef - H) * 10;
          if (!instr.northSouth) score += bounceBiasYd(edge > 0 ? edge : 0, zCreative, q);
        }
        if (offense && (instr.northSouth || shortYardage) && (i === designedIdx || ex >= ltgPx)) score += q['style.shortYardageYd'];
        if (fourthShort && ex >= ltgPx) score += q['style.sticksYd'];
        if (i === designedIdx) {
          const since = runPhase === 2 ? (w.tick - commitTick) * TICK_S : (w.tick - carryTick) * TICK_S;
          score += q['read.designedBonusYd'] * clip(1 - since / q['read.fadeS'], 0, 1);
        }
        if (i === escapeIdx) score += q['move.winYd'];
        if (dnsAware && offense && ex >= goalPx) score -= q['aware.sidelineTermYd'];
        score += noiseSd * noise[i]!;
      }
      laneScore[i] = score;
    }
    return n;
  }

  // ---- J8.2.1 the read ------------------------------------------------------------------------
  function doRead(w: TickWorld, c: number, view: PerceivedView, penetration: boolean): void {
    const q = P(), d = play.designed!;
    runPhase = 2; commitTick = w.tick;
    if (penetration || d.readSlot < 0) { reads.push({ tick: w.tick, slot: c, correct: 'bang', chosen: 'bang', penetration }); return; }
    const e = view.entity(d.readSlot);
    // Playside is the side of the aim point from where he took the ball.
    const playside = d.aimPy - py(w, c) >= 0 ? 1 : -1;
    const keyPy = e === null ? d.aimPy - playside : e.py;
    let correct: ReadRecord['correct'];
    if (d.kind === 'zone') correct = (keyPy - d.aimPy) * playside > 0 ? 'bend' : 'bang';
    else correct = (keyPy - d.aimPy) * playside > 0 ? 'inside' : 'outside';
    const knowledge = d.conceptId === undefined ? 0.5 : (w.slots[c]!.player.gameDay.knowledge[d.conceptId] ?? 50) / 100;
    const right = uRead < readChance(zVision, knowledge, q);
    const flip: Record<ReadRecord['correct'], ReadRecord['correct']> = { bang: 'bend', bend: 'bang', inside: 'outside', outside: 'inside' };
    const chosen = right ? correct : flip[correct];
    // The choice point: bang and inside hit the aim; bend cuts back as far again; outside bounces past it.
    const far = q['choice.pointYd'];
    choicePx = d.aimPx + 1;
    choicePy = chosen === 'bend' ? d.aimPy - playside * far : chosen === 'outside' ? d.aimPy + playside * far : d.aimPy;
    hasChoice = true;
    reads.push({ tick: w.tick, slot: c, correct, chosen, penetration: false });
  }

  // ---- J8.3.1 moves ---------------------------------------------------------------------------
  function moveValue(w: TickWorld, c: number, s: number, m: number, room: number, headOn: boolean, brokeDown: boolean, traffic: boolean): number {
    const q = P();
    if (traffic && m !== SHOULDER && m !== THROUGH) return -Infinity;
    if (instr.ballSecurity && (m === SPIN || m === STIFF)) return -Infinity;
    const zTackle = zEff(w, s, 'tackling');
    const win = (dz: number, ctx: number): number => logistic(q['move.beta0'] + q['move.beta1'] * dz + ctx);
    switch (m) {
      case CUT: return room <= 0.2 ? -Infinity
        : win(zEff(w, c, 'elusiveness') - w.slots[s]!.player.tests.changeOfDirectionZ, (brokeDown ? q['move.brokeDown'] : 0) + q['move.room'] * room) * q['move.winYd'] - q['move.cutCostYd'];
      case SPIN: return win((zEff(w, c, 'elusiveness') + zEff(w, c, 'contact_balance')) / 2 - zTackle, headOn ? 0 : q['move.brokeDown']) * q['move.winYd'] - q['move.spinCostYd'];
      case STIFF: return headOn ? -Infinity
        : win(zEff(w, c, 'play_strength') + q['move.armPerIn'] * (w.slots[c]!.player.heightIn - w.slots[s]!.player.heightIn) - zTackle, 0) * q['move.winYd'] - q['move.stiffArmCostYd'];
      case SHOULDER: return headOn ? q['move.shoulderYd'] + q['move.shoulderPerZYd'] * (zEff(w, c, 'power_finish') - zTackle) : -Infinity;
      case THROUGH: return 0;
      case HURDLE: {
        const sit = w.situation, ltgClose = w.frame.lineToGainPx - px(w, c) < 2 && w.slots[c]!.side === sit.offense;
        return ltgClose || w.frame.goalLinePx - px(w, c) < 2 ? q['move.hurdleYd'] - q['move.hurdleCostYd'] : -Infinity;
      }
      default: return -Infinity;
    }
  }

  const moveScores = new Float64Array(MOVES.length), moveProbs = new Float64Array(MOVES.length);
  /** Free room to the sides of the carrier, 0 (boxed in) to 1 (open). */
  function roomToCut(w: TickWorld, c: number): number {
    const q = P(), cx = px(w, c), cy = py(w, c);
    let minLat = q['move.roomYd'];
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (s === c) continue;
      const dx = px(w, s) - cx, dy = py(w, s) - cy;
      if ((dx < 0 ? -dx : dx) > 2) continue;
      const lat = dy < 0 ? -dy : dy;
      if (lat < minLat) minLat = lat;
    }
    const fy = w.players.posY[c]!, toSide = fy < w.geometry.widthYd / 2 ? fy : w.geometry.widthYd - fy;
    if (toSide < minLat) minLat = toSide;
    return clip(minLat / q['move.roomYd'], 0, 1);
  }

  function traffic(w: TickWorld, c: number): boolean {
    const q = P(), side = w.slots[c]!.side;
    let n = 0;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (w.slots[s]!.side === side || isDown(w, s)) continue;
      if (hyp(w.players.posX[s]! - w.players.posX[c]!, w.players.posY[s]! - w.players.posY[c]!) <= q['secure.trafficYd']) n++;
    }
    return n >= q['secure.trafficCount'];
  }

  function chooseMove(w: TickWorld, c: number, view: PerceivedView, u: number): void {
    const q = P(), side = w.slots[c]!.side, cx = px(w, c), cy = py(w, c), cvx = vpx(w, c), cvy = vpy(w, c);
    let best = -1, bestT = Infinity;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (w.slots[s]!.side === side || isDown(w, s) || w.players.engagement[s]! >= 0 || moveVs[s] !== -1) continue;
      const e = view.entity(s);
      if (e === null) continue;
      const dx = e.px - cx, dy = e.py - cy, d = hyp(dx, dy);
      const gap = d - w.slots[s]!.movement.bodyRadiusYd - w.slots[c]!.movement.bodyRadiusYd;
      const closing = d > 0 ? ((cvx - e.velPx) * dx + (cvy - e.velPy) * dy) / d : 0;
      if (closing <= 0) continue;
      const ttc = gap / closing;
      if (ttc >= q['move.windowMinS'] && ttc <= q['move.windowMaxS'] && ttc < bestT) { best = s; bestT = ttc; }
    }
    if (best < 0) return;
    const s = best, e = view.entity(s)!;
    const dx = e.px - cx, dy = e.py - cy, d = hyp(dx, dy), sp = hyp(cvx, cvy);
    const headOn = sp > 0.5 && d > 0 ? (cvx * dx + cvy * dy) / (sp * d) > dCos(45 * RAD) : true;
    const brokeDown = w.intents[s]!.arrival === 'breakdown' || hyp(e.velPx, e.velPy) < q['tackle.breakdownYps'];
    const room = roomToCut(w, c), tr = traffic(w, c);
    for (let m = 0; m < MOVES.length; m++) moveScores[m] = moveValue(w, c, s, m, room, headOn, brokeDown, tr);
    softmax(moveScores, MOVES.length, q['move.tempYd'], dExp, moveProbs);
    const m = pick(moveProbs, MOVES.length, u);
    moveVs[s] = m;
    moveLog.push({ tick: w.tick, slot: c, tacklerSlot: s, move: MOVES[m]! });
    if (m === CUT) {
      // Cut away from the tackler's side, upfield.
      const awaySide = dy >= 0 ? -1 : 1, gd = goalDir(w, c);
      escapeHeading = dAtan2(awaySide * 1, gd * 1); escapeUntil = w.tick + Math.ceil(q['move.windowMaxS'] / TICK_S);
      options.movement?.requestCut(c, sp * 0.6);
    } else if (m === SPIN) {
      const keep = 1 - q['move.spinS'];
      w.players.velX[c] = w.players.velX[c]! * keep; w.players.velY[c] = w.players.velY[c]! * keep;
    }
  }

  // ---- finishing (J8.4) -----------------------------------------------------------------------
  /** Shortest time for an upright, unblocked opponent to reach him. */
  function nearestThreatS(w: TickWorld, c: number): number {
    const side = w.slots[c]!.side;
    let best = Infinity;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (w.slots[s]!.side === side || isDown(w, s) || w.players.engagement[s]! >= 0) continue;
      const gap = hyp(w.players.posX[s]! - w.players.posX[c]!, w.players.posY[s]! - w.players.posY[c]!) - w.slots[s]!.movement.bodyRadiusYd - w.slots[c]!.movement.bodyRadiusYd;
      const t = (gap > 0 ? gap : 0) / w.slots[s]!.movement.vMaxYps;
      if (t < best) best = t;
    }
    return best;
  }

  function giveUp(w: TickWorld, c: number, kind: 'slide' | 'goDown' | 'downShort'): void {
    endings.push({ tick: w.tick, slot: c, kind });
    w.players.moveMode[c] = M_DOWN;
    declareDead(w, 'gave_himself_up', tNow(w), w.ball.x, w.ball.y, c);
  }

  /** Returns true when the play ended. */
  function finishing(w: TickWorld, c: number): boolean {
    const q = P(), sit = w.situation, offense = w.slots[c]!.side === sit.offense, cx = px(w, c);
    const tThreat = nearestThreatS(w, c);
    // J8.4.3 slide.
    if (instr.selfProtect && tThreat < q['slide.threatS']) {
      const highLeverage = offense && (sit.down ?? 0) >= 3 && w.frame.lineToGainPx - cx <= q['slide.leverageYd'] && w.frame.lineToGainPx - cx > 0;
      const goalClose = offense && w.frame.goalLinePx - cx <= q['slide.leverageYd'];
      if (!((highLeverage || goalClose) && competes)) { giveUp(w, c, 'slide'); return true; }
    }
    if (!aware || !offense) return false;
    // J8.4.2 do not score / get down short of the goal line.
    if ((instr.rule === 'downShortOfGoal' || dnsAware) && w.frame.goalLinePx - cx <= q['aware.downShortYd']) { giveUp(w, c, 'downShort'); return true; }
    // J8.4.2 stay in bounds: go down rather than be driven out.
    if (instr.rule === 'stayInBounds' && tThreat < q['aware.goDownS']) {
      const fy = w.players.posY[c]!, toSide = fy < w.geometry.widthYd / 2 ? fy : w.geometry.widthYd - fy;
      if (toSide < q['aware.sidelineZoneYd']) { giveUp(w, c, 'goDown'); return true; }
    }
    return false;
  }

  // ---- Decide ---------------------------------------------------------------------------------
  function decideRun(w: TickWorld): void {
    const kindNow = w.ball.kind;
    try {
      if (w.tick < 0 || w.deadAtTick !== null) return;
      const b = w.ball;
      if (b.kind !== 'held' || b.carrierSlot < 0 || !steerable(w, b.carrierSlot)) { cur = -1; return; }
      const c = b.carrierSlot;
      if (c !== cur) startCarry(w, c);
      const q = P(), st = carrierStream(w, c);
      for (let i = 0; i < LANE_NORMALS; i++) noise[i] = st.normal();
      const uLane = st.uniform(), uMove = st.uniform();
      if (w.tick < turnUntil) return;
      if (finishing(w, c)) return;
      const view = options.view(c);
      // J8.2.1 press and read.
      if (runPhase === 1) {
        const d = play.designed!;
        let penetration = false;
        const side = w.slots[c]!.side;
        for (let s = 0; s < SLOT_COUNT && !penetration; s++) {
          if (w.slots[s]!.side === side || w.players.engagement[s]! >= 0 || isDown(w, s)) continue;
          const e = view.entity(s);
          if (e !== null && e.px * goalDir(w, c) < 0 && hyp(e.px - px(w, c), e.py - py(w, c)) < q['read.penetrationYd']) penetration = true;
        }
        if (penetration || w.tick >= pressUntil) doRead(w, c, view, penetration);
        else { writeIntent(w, c, d.aimPx, d.aimPy); return; }
      }
      chooseMove(w, c, view, uMove);
      const n = scoreLanes(w, c, view, true, zVision);
      softmax(laneScore, n, temp, dExp, laneProb);
      const k = pick(laneProb, n, uLane);
      const h = laneHead[k]!, ah = q['look.aimYd'];
      writeIntent(w, c, px(w, c) + dCos(h) * ah, py(w, c) + dSin(h) * ah);
      laneLog.push({ tick: w.tick, slot: c, headingRad: h, index: k, score: laneScore[k]!, designed: k === lastDesigned });
    } finally {
      prevBallKind = kindNow;
    }
  }

  function writeIntent(w: TickWorld, c: number, tx: number, ty: number): void {
    const it = w.intents[c]!, a = aim[c]!;
    a.px = tx; a.py = ty;
    it.target = a; it.targetVelPx = 0; it.targetVelPy = 0; it.faceTarget = null;
    const effort = options.playerAi?.effortOf(c) ?? 1;
    it.effort = clip(effort * (instr.ballSecurity ? P()['secure.instructionSpeed'] : 1), 0, 1);
    it.moveMode = 'sprint'; it.arrival = 'through';
  }

  // ---- Interact: contact ----------------------------------------------------------------------
  function tackleType(w: TickWorld, c: number, s: number): TackleType {
    const vx = w.players.velX[c]!, vy = w.players.velY[c]!, sp = hyp(vx, vy);
    if (sp < 0.5) return 'headOn';
    const dx = w.players.posX[s]! - w.players.posX[c]!, dy = w.players.posY[s]! - w.players.posY[c]!, d = hyp(dx, dy);
    const cosA = d > 0 ? (vx * dx + vy * dy) / (sp * d) : 1, lim = dCos(45 * RAD);
    return cosA > lim ? 'headOn' : cosA < -lim ? 'behind' : 'side';
  }

  function angleQuality(w: TickWorld, c: number, s: number): number {
    const q = P(), vx = w.players.velX[s]!, vy = w.players.velY[s]!, sp = hyp(vx, vy);
    if (sp < 1) return q['tackle.standingAngleQuality'];
    const dx = w.players.posX[c]! - w.players.posX[s]!, dy = w.players.posY[c]! - w.players.posY[s]!, d = hyp(dx, dy);
    return d > 0 ? (1 + (vx * dx + vy * dy) / (sp * d)) / 2 : 1;
  }

  /**
   * A defender in a block cannot get to the carrier, with one exception (J6.3.1 gap control): a run defender who
   * is holding his ground in the block (advantage under the gap-control line) still has his gap, and comes off
   * onto a carrier who runs into it.
   */
  function tiedUp(w: TickWorld, s: number): boolean {
    const e = w.players.engagement[s]!;
    if (e < 0) return false;
    const k = e < w.contests.length ? w.contests[e]! : null;
    return !(k !== null && k.type === 'runBlock' && k.defenseSlot === s && contests.runBlock.controlsGap(true, k.advantage));
  }

  function contactsOf(w: TickWorld, c: number, out: Int16Array): number {
    const q = P(), side = w.slots[c]!.side;
    let n = 0;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (w.slots[s]!.side === side || isDown(w, s) || tiedUp(w, s) || w.tick < rearm[s]!) continue;
      const gap = hyp(w.players.posX[s]! - w.players.posX[c]!, w.players.posY[s]! - w.players.posY[c]!) - w.slots[s]!.movement.bodyRadiusYd - w.slots[c]!.movement.bodyRadiusYd;
      if (gap > q['tackle.contactGapYd']) continue;
      let i = n;
      threatD[s] = gap;
      while (i > 0 && threatD[out[i - 1]!]! > gap) { out[i] = out[i - 1]!; i--; }
      out[i] = s; n++;
    }
    return n;
  }
  const contactList = new Int16Array(SLOT_COUNT);

  /** Opponents who are not in contact now but arrive within the J6.6.1 window. */
  function arrivingSoon(w: TickWorld, c: number): number {
    const q = P(), side = w.slots[c]!.side;
    let n = 0;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (w.slots[s]!.side === side || isDown(w, s) || w.players.engagement[s]! >= 0) continue;
      const dx = w.players.posX[s]! - w.players.posX[c]!, dy = w.players.posY[s]! - w.players.posY[c]!, d = hyp(dx, dy);
      const gap = d - w.slots[s]!.movement.bodyRadiusYd - w.slots[c]!.movement.bodyRadiusYd;
      if (gap <= q['tackle.contactGapYd']) continue;
      const closing = d > 0 ? -((w.players.velX[s]! - w.players.velX[c]!) * dx + (w.players.velY[s]! - w.players.velY[c]!) * dy) / d : 0;
      if (closing > 0 && gap / closing <= q['tackle.windowS']) n++;
    }
    return n;
  }

  function engagedBothSides(w: TickWorld, c: number): boolean {
    const side = w.slots[c]!.side, cy = py(w, c), cx = px(w, c);
    let left = false, right = false;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (w.slots[s]!.side !== side || s === c || w.players.engagement[s]! < 0) continue;
      const dx = px(w, s) - cx, dy = py(w, s) - cy;
      if ((dx < 0 ? -dx : dx) > 3 || (dy < 0 ? -dy : dy) > 4) continue;
      if (dy >= 0) left = true; else right = true;
    }
    return left && right;
  }

  /** J6.6.2 surge: mean advantage of his side's engaged run blocks near him. */
  function surge(w: TickWorld, c: number): number {
    const side = w.slots[c]!.side, cy = py(w, c);
    let sum = 0, n = 0;
    for (let i = 0; i < w.contests.length; i++) {
      const k = w.contests[i]!;
      if (k.type !== 'runBlock' || w.slots[k.offenseSlot]!.side !== side) continue;
      const dy = py(w, k.offenseSlot) - cy;
      if ((dy < 0 ? -dy : dy) > 4) continue;
      sum += k.advantage; n++;
    }
    return n > 0 ? sum / n : 0;
  }

  function fumbleDraw(w: TickWorld, c: number, s: number, energyRel: number, blindside: boolean, move: number, moveWon: boolean, covered: boolean): boolean {
    const q = P(), bs = contests.ballSecurity;
    let second = false;
    for (let o = 0; o < SLOT_COUNT; o++) {
      if (o === s || w.slots[o]!.side === w.slots[c]!.side || isDown(w, o)) continue;
      if (hyp(w.players.posX[o]! - w.players.posX[c]!, w.players.posY[o]! - w.players.posY[c]!) <= q['tackle.secondHitterYd']) { second = true; break; }
    }
    const zSec = zEff(w, c, 'ball_security') + (covered ? q['secure.coverZ'] : 0) + (instr.ballSecurity ? q['secure.instructionZ'] : 0);
    const env = w.environment;
    let pr = bs.fumbleProbability({
      zSecurity: zSec, zHitPower: zEff(w, s, 'play_strength'), hitEnergy: energyRel, blindside,
      stripAttempt: options.playerAi?.stripAttempt(s) ?? false, secondHitter: second, wet: env.precip !== 'none' || env.derived.grip < 1, isPasser: false,
    });
    // J8.3.1: a spin, or a stiff arm that loses, carries the ball in one arm away from the body.
    const extra = move === SPIN ? q['move.spinFumble'] : move === STIFF && !moveWon ? q['move.stiffArmFumble'] : 0;
    if (extra !== 0) pr = clampProbability(logistic(dLog(pr / (1 - pr)) + extra));
    return pairStream(w, c, s, 'fumble').uniform() < pr;
  }

  function looseFrom(w: TickWorld, c: number, s: number): void {
    const q = P(), pl = w.players;
    beginLoose(w, c, {
      x: pl.posX[c]!, y: pl.posY[c]!, h: q['fumble.handHeightYd'],
      vx: (pl.velX[c]! + pl.velX[s]!) * q['fumble.launchShare'], vy: (pl.velY[c]! + pl.velY[s]!) * q['fumble.launchShare'], vh: q['fumble.launchUpYps'],
    }, bp!);
  }

  function emitTackle(w: TickWorld, c: number, outcome: 'made' | 'broken' | 'missed', ids: number[]): void {
    w.emit({ type: 'tackle_attempt', t: roundSimS(tNow(w)), outcome, carrierId: w.slots[c]!.playerId, tacklerIds: ids, spot: spot(w.ball.x, w.ball.y) });
  }

  function contactRun(w: TickWorld, c: number): void {
    const q = P(), pl = w.players;
    const n = contactsOf(w, c, contactList);
    if (n === 0) return;
    const s = contactList[0]!, t = tNow(w);
    const cInfo = w.slots[c]!, sInfo = w.slots[s]!;
    const gd = goalDir(w, c), cx = px(w, c);
    contactNumbers(pl.posX[c]!, pl.posY[c]!, pl.velX[c]!, pl.velY[c]!, cInfo.player.weightLb, pl.gazeRad[c]!,
      pl.posX[s]!, pl.posY[s]!, pl.velX[s]!, pl.velY[s]!, sInfo.player.weightLb, kp!, contact);
    // contactNumbers already reports hit energy in typical open-field tackles (J2.6.1, kinematics.typical*).
    const energyRel = clip(contact.hitEnergy, 0, q['secure.maxHitEnergyRel']);
    const covered = traffic(w, c);
    const tacklers = n + arrivingSoon(w, c);
    const losDist = (cx < 0 ? -cx : cx);
    const offense = cInfo.side === w.situation.offense;
    // J6.6.2 pile.
    if (offense && contests.tackle.pileApplies(n, losDist, engagedBothSides(w, c))) {
      let free = 0;
      for (let o = 0; o < SLOT_COUNT; o++) if (o !== s && w.slots[o]!.side !== cInfo.side && pl.engagement[o]! < 0 && !isDown(w, o) && hyp(px(w, o) - cx, py(w, o) - py(w, c)) < 2) free++;
      const gain = contests.tackle.resolvePile({ surge: surge(w, c), zPower: zEff(w, c, 'power_finish'), freeDefenders: free, pushers: 0 }, pairStream(w, c, s, 'pile'));
      const ids: number[] = [];
      for (let i = 0; i < n; i++) ids.push(w.slots[contactList[i]!]!.playerId);
      const fumble = fumbleDraw(w, c, s, energyRel, contact.blindside, -1, false, true);
      for (let i = 0; i < n; i++) hit[contactList[i]!] = hit[contactList[i]!]! + energyRel / n;
      hit[c] = hit[c]! + energyRel;
      emitTackle(w, c, 'made', ids);
      tackles.push({ tick: w.tick, carrierSlot: c, tacklerSlot: s, tacklers: n, type: 'pile', outcome: 'made', move: null, moveWon: false, pTackle: 1, fumble, progressYd: gain });
      pl.moveMode[c] = M_DOWN;
      if (fumble) { emitFumble(w, c, s); looseFrom(w, c, s); return; }
      endAtProgress(w, c, gain, 'forward_progress_stopped', t);
      return;
    }
    const type = tackleType(w, c, s);
    const m = moveVs[s]!, move = m >= 0 ? m : -1;
    let moveWon = false;
    if (move === CUT || move === SPIN || move === STIFF || move === HURDLE) {
      const zC = move === CUT ? zEff(w, c, 'elusiveness') : move === SPIN ? (zEff(w, c, 'elusiveness') + zEff(w, c, 'contact_balance')) / 2 : move === STIFF ? zEff(w, c, 'play_strength') : zEff(w, c, 'explosiveness');
      const zD = move === CUT ? sInfo.player.tests.changeOfDirectionZ : zEff(w, s, 'tackling');
      const brokeDown = w.intents[s]!.arrival === 'breakdown';
      const pw = logistic(q['move.beta0'] + q['move.beta1'] * (zC - zD) + (brokeDown ? q['move.brokeDown'] : 0) + (move === HURDLE ? -2 : 0));
      moveWon = pairStream(w, c, s, 'move').uniform() < clampProbability(pw);
      w.emit({ type: 'contest', t: roundSimS(t), contest: `move.${MOVES[move]!}`, winnerId: moveWon ? cInfo.playerId : sInfo.playerId, loserId: moveWon ? sInfo.playerId : cInfo.playerId, spot: spot(w.ball.x, w.ball.y) });
    }
    const zCarrier = move === SHOULDER ? zEff(w, c, 'power_finish') : type === 'headOn' ? zEff(w, c, 'contact_balance') : zEff(w, c, 'elusiveness');
    const ratio = clip(contact.momentumRatio * (move === SHOULDER ? 1 + q['move.shoulderMomentum'] : 1), 0, q['tackle.momentumRatioMax']);
    const speed = hyp(pl.velX[s]!, pl.velY[s]!);
    const input = {
      dz: zEff(w, s, 'tackling') - zCarrier,
      angleQuality: angleQuality(w, c, s),
      lunging: w.intents[s]!.arrival !== 'breakdown' && speed > q['tackle.breakdownYps'] && type !== 'behind',
      momentumRatio: ratio, tacklers, roomToCut: covered ? 0 : roomToCut(w, c), moveWon,
      stripAttempt: options.playerAi?.stripAttempt(s) ?? false,
      zContactBalance: zEff(w, c, 'contact_balance'), type,
    };
    const pTackle = contests.tackle.tackleProbability(input);
    const res = contests.tackle.resolveTackle(input, pairStream(w, c, s, 'tackle'));
    const fumble = res.outcome !== 'missed' && fumbleDraw(w, c, s, energyRel, contact.blindside, move, moveWon, covered);
    if (res.outcome !== 'missed') { hit[c] = hit[c]! + energyRel; hit[s] = hit[s]! + energyRel; }
    const ids = [sInfo.playerId];
    emitTackle(w, c, res.outcome, ids);
    tackles.push({ tick: w.tick, carrierSlot: c, tacklerSlot: s, tacklers, type, outcome: res.outcome, move: move >= 0 ? MOVES[move]! : null, moveWon, pTackle, fumble, progressYd: res.progressYd });
    if (res.outcome === 'made') {
      pl.moveMode[c] = M_DOWN;
      if (fumble) { emitFumble(w, c, s); looseFrom(w, c, s); return; }
      // J6.6.1 edge case: within a yard of the sideline a side hit toward it pushes him out.
      const fy = pl.posY[c]!, W = w.geometry.widthYd, toSouth = fy, toNorth = W - fy;
      const push = pl.velY[s]!;
      if (type === 'side' && ((toSouth < q['tackle.sidelineYd'] && push < 0) || (toNorth < q['tackle.sidelineYd'] && push > 0))) {
        declareDead(w, 'runner_out_of_bounds', t, pl.posX[c]!, toSouth < toNorth ? 0 : W, c);
        return;
      }
      endAtProgress(w, c, res.progressYd, 'down_by_contact', t);
      return;
    }
    if (fumble) { emitFumble(w, c, s); looseFrom(w, c, s); }
    if (res.outcome === 'broken') {
      pl.velX[c] = pl.velX[c]! * res.speedKept; pl.velY[c] = pl.velY[c]! * res.speedKept;
      rearm[s] = w.tick + Math.ceil(q['tackle.brokenDownS'] / TICK_S);
      pl.onGroundUntilTick[s] = rearm[s]!;
    } else {
      rearm[s] = w.tick + Math.ceil(q['tackle.missDownS'] / TICK_S);
      pl.onGroundUntilTick[s] = rearm[s]!;
    }
  }

  function emitFumble(w: TickWorld, c: number, s: number): void {
    const ev: TruthEvent = {
      type: 'fumble', t: roundSimS(tNow(w)), marginYd: null, marginS: null, visibility: 'crowded', kind: 'fumble',
      playerId: w.slots[c]!.playerId, side: w.slots[c]!.side, forcedById: w.slots[s]!.playerId, spot: spot(w.ball.x, w.ball.y),
    };
    w.emit(ev);
  }

  /** Made tackle: the ball is dead at the spot of forward progress, along the direction he attacks. */
  function endAtProgress(w: TickWorld, c: number, progressYd: number, reason: 'down_by_contact' | 'forward_progress_stopped', t: number): void {
    const dirX = w.players.attackDir[c]!;
    let x = w.ball.x + dirX * progressYd;
    const goalX = dirX === 1 ? w.geometry.goalLineEastX : w.geometry.goalLineWestX;
    if ((x - goalX) * dirX >= 0 && (w.ball.x - goalX) * dirX < 0) {
      declareDead(w, 'ball_across_goal_line_in_possession', t, goalX, w.ball.y, c);
      return;
    }
    if ((w.ball.x - goalX) * dirX >= 0) x = w.ball.x;
    declareDead(w, reason, t, x, w.ball.y, c);
  }

  // ---- Interact: taking a kicked or loose ball ------------------------------------------------
  function takeBall(w: TickWorld, s: number, how: 'kick_catch' | 'kick_recovery' | 'fumble_recovery'): void {
    const b = w.ball, pl = w.players, info = w.slots[s]!;
    b.kind = 'held'; b.carrierSlot = s; b.lastPossessorSlot = s; b.heightYd = 0; b.velHeight = 0; b.passForward = null; b.kickKind = null;
    b.x = pl.posX[s]!; b.y = pl.posY[s]!; b.velX = 0; b.velY = 0;
    pl.hasBall[s] = 1;
    w.emit({ type: 'possession', t: roundSimS(tNow(w)), side: info.side, playerId: info.playerId, spot: spot(b.x, b.y), how });
  }

  /** True when the receivers leave this punt alone: it is inside the yard line their returner's rule names, and none of them has touched it. */
  function leftAlone(w: TickWorld): boolean {
    const lim = play.returnPlan?.letGoInsideYd, b = w.ball;
    if (lim === undefined || b.kickKind !== 'punt' || receiversTouched) return false;
    const dir = w.snappingAttackDir;
    return (dir === 1 ? w.geometry.goalLineEastX - b.x : b.x - w.geometry.goalLineWestX) < lim;
  }

  function kickRun(w: TickWorld): void {
    const q = P(), b = w.ball, pl = w.players;
    // The ball is catchable on the tick it comes down through catching height, at the place it does so: a punt falls
    // about 2 yd and travels more than a yard in a tick, so asking for it to be under that height at a tick boundary let
    // four in ten punts hit the ground at a waiting returner's feet.
    if (!(b.velHeight < 0) || b.heightYd + b.velHeight * TICK_S > q['ret.catchHeightYd'] || !inField(w, b.x, b.y)) return;
    const fall = b.heightYd > q['ret.catchHeightYd'] ? (b.heightYd - q['ret.catchHeightYd']) / -b.velHeight : 0;
    const cx = b.x + b.velX * fall, cy = b.y + b.velY * fall;
    const leave = leftAlone(w);
    let best = -1, bestD = Infinity;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (isDown(w, s) || pl.engagement[s]! >= 0 || w.tick < rearm[s]! || !inField(w, pl.posX[s]!, pl.posY[s]!)) continue;
      if (leave && !isKicker(s)) continue;
      const d = hyp(pl.posX[s]! - cx, pl.posY[s]! - cy);
      if (d <= w.slots[s]!.movement.bodyRadiusYd + q['ret.touchGapYd'] && d < bestD) { best = s; bestD = d; }
    }
    if (best < 0) return;
    const info = w.slots[best]!, kickers = isKicker(best), t = tNow(w);
    w.emit({ type: 'kick_touch', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', kind: kickers ? 'touched_by_kickers' : 'touched_by_receivers', playerId: info.playerId, side: info.side, spot: spot(pl.posX[best]!, pl.posY[best]!) });
    if (kickers) { takeBall(w, best, 'kick_recovery'); declareDead(w, 'kick_recovered_by_kickers', t, b.x, b.y, best); return; }
    receiversTouched = true;
    // J8.6.2 fair catch: coverage arriving within the threshold of the catch.
    const plan = play.returnPlan ?? null;
    let tCover = Infinity, crowd = 0;
    for (let s = 0; s < SLOTS_PER_TEAM; s++) {
      if (isDown(w, s)) continue;
      const d = hyp(pl.posX[s]! - pl.posX[best]!, pl.posY[s]! - pl.posY[best]!) - w.slots[s]!.movement.bodyRadiusYd - info.movement.bodyRadiusYd;
      const ts = (d > 0 ? d : 0) / w.slots[s]!.movement.vMaxYps;
      if (ts < tCover) tCover = ts;
      if (d < 2) crowd++;
    }
    const fair = plan !== null && plan.fairCatchAllowed && tCover <= q['ret.fairCatchS'];
    if (fair) w.emit({ type: 'kick_touch', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', kind: 'fair_catch_signal', playerId: info.playerId, side: info.side, spot: spot(pl.posX[best]!, pl.posY[best]!) });
    // A muff (J6.7 edge case of J8.6.2): hands, and coverage in his face.
    const zHands = zEff(w, best, b.kickKind === 'punt' ? 'catching_punts' : 'catching_kickoffs');
    const pMuff = clampProbability(logistic(q['ret.muffBeta0'] + q['ret.muffPerZ'] * zHands + (crowd > 0 ? q['ret.muffCrowd'] : 0)));
    // One uniform from the returner's own stream at each catch he attempts.
    const muff = carrierStream(w, best).uniform() < pMuff;
    if (muff) {
      w.emit({ type: 'fumble', t: roundSimS(t), marginYd: null, marginS: null, visibility: 'open', kind: 'muff', playerId: info.playerId, side: info.side, forcedById: null, spot: spot(b.x, b.y) });
      beginLoose(w, -1, { x: b.x, y: b.y, h: b.heightYd, vx: b.velX * 0.3, vy: b.velY * 0.3, vh: 0 }, bp!);
      rearm[best] = w.tick + Math.ceil(q['recover.retryS'] / TICK_S);
      return;
    }
    takeBall(w, best, 'kick_catch');
    if (fair) { endings.push({ tick: w.tick, slot: best, kind: 'fairCatch' }); declareDead(w, 'fair_catch', t, b.x, b.y, best); }
  }

  function nearestOpponent(w: TickWorld, s: number): number {
    let best = -1, bestD = Infinity;
    for (let o = 0; o < SLOT_COUNT; o++) {
      if (w.slots[o]!.side === w.slots[s]!.side) continue;
      const d = hyp(w.players.posX[o]! - w.players.posX[s]!, w.players.posY[o]! - w.players.posY[s]!);
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  const contender = new Int16Array(SLOT_COUNT);
  function looseRun(w: TickWorld): void {
    const q = P(), b = w.ball, pl = w.players, bs = contests.ballSecurity;
    if (b.heightYd > q['recover.heightYd'] || !inField(w, b.x, b.y)) return;
    const reach = bs.recoveryReachYd();
    const leave = leftAlone(w);
    let n = 0;
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (isDown(w, s) || pl.engagement[s]! >= 0 || w.tick < rearm[s]! || !inField(w, pl.posX[s]!, pl.posY[s]!)) continue;
      if (leave && !isKicker(s)) continue;
      const d = hyp(pl.posX[s]! - b.x, pl.posY[s]! - b.y) - w.slots[s]!.movement.bodyRadiusYd;
      if (d <= reach) contender[n++] = s;
    }
    if (n === 0) return;
    // Opponents together at the ball: the J6.7.2 contest picks who gets it.
    let sides = 0;
    for (let i = 0; i < n; i++) sides |= 1 << w.slots[contender[i]!]!.side;
    let s = contender[0]!;
    if (sides === 3) {
      const list = [];
      for (let i = 0; i < n; i++) {
        const o = contender[i]!, d = hyp(pl.posX[o]! - b.x, pl.posY[o]! - b.y) - w.slots[o]!.movement.bodyRadiusYd, v = hyp(pl.velX[o]!, pl.velY[o]!);
        list.push({ arrivalS: d > 0 ? d / (v > 1 ? v : 1) : 0, zHands: zEff(w, o, 'hands') });
      }
      let a = contender[0]!, z = -1;
      for (let i = 1; i < n; i++) if (w.slots[contender[i]!]!.side !== w.slots[a]!.side) { z = contender[i]!; break; }
      const idx = bs.resolveContest(list, pairStream(w, a, z, 'recovery'));
      s = contender[idx]!;
    } else {
      let bestD = Infinity;
      for (let i = 0; i < n; i++) { const o = contender[i]!, d = hyp(pl.posX[o]! - b.x, pl.posY[o]! - b.y); if (d < bestD) { bestD = d; s = o; } }
      const mode = hyp(b.velX, b.velY) < q['recover.fallBelowYps'] ? 'fall' : 'scoop';
      const other = b.lastPossessorSlot >= 0 && b.lastPossessorSlot !== s ? b.lastPossessorSlot : nearestOpponent(w, s);
      const r = bs.resolveRecovery(mode, zEff(w, s, 'hands'), n - 1, pairStream(w, s, other, 'recovery'));
      if (r !== 'recovered') { rearm[s] = w.tick + Math.ceil(q['recover.retryS'] / TICK_S); return; }
      if (mode === 'fall') {
        takeBall(w, s, b.kickKind !== null ? 'kick_recovery' : 'fumble_recovery');
        pl.moveMode[s] = M_DOWN;
        // On the ground with the ball: dead if an opponent is on him; otherwise he may get up (B3 rule per rule set).
        const o = nearestOpponent(w, s);
        if (o >= 0 && hyp(pl.posX[o]! - pl.posX[s]!, pl.posY[o]! - pl.posY[s]!) < 2) declareDead(w, 'down_by_contact', tNow(w), b.x, b.y, s);
        else pl.onGroundUntilTick[s] = w.tick + Math.ceil(q['recover.retryS'] / TICK_S);
        return;
      }
    }
    const kicked = b.kickKind !== null;
    takeBall(w, s, kicked ? 'kick_recovery' : 'fumble_recovery');
    if (kicked && isKicker(s)) declareDead(w, 'kick_recovered_by_kickers', tNow(w), b.x, b.y, s);
  }

  function interactRun(w: TickWorld): void {
    if (w.tick < 0 || w.deadAtTick !== null || p === null) return;
    const b = w.ball;
    if (b.kind === 'held') {
      if (b.carrierSlot >= 0 && steerable(w, b.carrierSlot)) contactRun(w, b.carrierSlot);
      return;
    }
    if (b.kind === 'kickInFlight') { kickRun(w); return; }
    if (b.kind === 'loose') looseRun(w);
  }

  return {
    decide: { name: 'decide', begin, run: decideRun },
    interact: { name: 'interact', run: interactRun },
    setPlay(pl) { play = pl ?? {}; },
    onRun(_w, slot) { ran[slot] = 1; return true; },
    laneQuality(w, slot) {
      if (p === null) return 0;
      const view = options.view(slot);
      const saveAware = aware, saveInstr = instr;
      aware = false; instr = NO_INSTRUCTION;
      const zv = zEff(w, slot, 'scramble_and_run_skill');
      const n = scoreLanes(w, slot, view, false, zv);
      aware = saveAware; instr = saveInstr;
      let best = -Infinity;
      for (let i = 0; i < n; i++) if (laneScore[i]! > best) best = laneScore[i]!;
      const scale = horizonS(zv, p) * topSpeed(w, slot);
      return clip(best / (scale > 0 ? scale : 1), 0, 1);
    },
    hitLoad: (slot) => hit[slot] ?? 0,
    record: () => ({ carries: carries.slice(), tackles: tackles.slice(), reads: reads.slice(), moves: moveLog.slice(), endings: endings.slice() }),
    lanes: () => laneLog,
  };
}

