// Fixtures for the quarterback tests: a view that shows him chosen slots exactly, scripted bodies for
// everyone else, the real movement and ball stages, and a test-only dead-ball detector. Rule values
// here are test inputs, not rule data.
import {
  SLOT_COUNT, SLOTS_PER_TEAM, TICK_S, type BallStateKind, type PerceivedEntity, type PerceivedView, type PlayRead, type RuleSet, type TickWorld, type TruthEvent,
} from '@gm/schema';
import * as ball from '../../src/ball/index.ts';
import { PARAMS as CONTEST_PARAMS, createContests } from '../../src/contest/index.ts';
import { DMATH } from '../../src/index.ts';
import { PARAMS as FIELD_PARAMS } from '../../src/field/index.ts';
import { PARAMS as KIN_PARAMS, createMovement } from '../../src/kinematics/index.ts';
import { PARAMS as PERCEPTION_PARAMS } from '../../src/perception/index.ts';
import * as qb from '../../src/qb/index.ts';
import { createTickLoop, paramTableFromFiles, type PlayStage } from '../../src/tick/index.ts';
import { fixtureRules, fixtureWorld, place, type PlayerSpec } from '../tick/support.ts';

export const TABLE = paramTableFromFiles([FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS, ball.PARAMS, CONTEST_PARAMS, qb.PARAMS]);
export const P = qb.qbParams(TABLE);
export const CONTESTS = createContests(TABLE, DMATH);

export const QB = 0;

/** FIXTURE rules: the tick fixture plus the keys the quarterback reads. */
export function rules(over: { spikeNeedsUnderCenter?: boolean; grounding?: boolean } = {}): RuleSet {
  const base = fixtureRules(70.75, { 'score.touchdown': 6, 'try.two_point_points': 2 });
  const bools: Record<string, boolean> = {
    'pass.spike_requires_under_center': over.spikeNeedsUnderCenter ?? true, 'foul.intentional_grounding.exists': over.grounding ?? true,
  };
  return { ...base, bool: (k) => { const v = bools[k]; if (v === undefined) throw new Error(`fixture has no rule key ${k}`); return v; } };
}

/** Shows the quarterback the true position and velocity of every slot not hidden. */
export class TruthView implements PerceivedView {
  readonly hidden = new Set<number>();
  private readonly selfState = { px: 0, py: 0, velPx: 0, velPy: 0, headingRad: 0 };
  private readonly pool: PerceivedEntity[] = [];
  constructor(readonly world: TickWorld, readonly selfSlot: number) {
    for (let s = 0; s < SLOT_COUNT; s++) this.pool.push({ slot: s, px: 0, py: 0, velPx: 0, velPy: 0, staleTicks: 0 } as PerceivedEntity);
  }
  get tSinceSnapS(): number { return this.world.tick * TICK_S; }
  get self() {
    const w = this.world, s = this.selfSlot, d = w.frame.attackDir, o = this.selfState;
    o.px = (w.players.posX[s]! - w.frame.originX) * d; o.py = (w.players.posY[s]! - w.frame.originY) * d;
    o.velPx = w.players.velX[s]! * d; o.velPy = w.players.velY[s]! * d; o.headingRad = w.players.headingRad[s]!;
    return o;
  }
  entity(slot: number): PerceivedEntity | null {
    if (this.hidden.has(slot) || slot === this.selfSlot) return null;
    const w = this.world, d = w.frame.attackDir, e = this.pool[slot] as { px: number; py: number; velPx: number; velPy: number };
    e.px = (w.players.posX[slot]! - w.frame.originX) * d; e.py = (w.players.posY[slot]! - w.frame.originY) * d;
    e.velPx = w.players.velX[slot]! * d; e.velPy = w.players.velY[slot]! * d;
    return this.pool[slot]!;
  }
  ball(): PerceivedEntity | null { return null; }
  ballKind(): BallStateKind | 'unknown' { return this.world.ball.kind; }
  playRead(): { read: PlayRead; side: 'left' | 'right' | 'none'; confidence: number } { return { read: 'unknown', side: 'none', confidence: 0 }; }
  believedCarrierSlot(): number { return this.world.ball.carrierSlot; }
  heard(): boolean { return false; }
  receiverNumber(): number { return 0; }
}

/** A scripted body: play-frame position at time t (seconds from the snap). */
export type Script = (t: number) => readonly [number, number];
export const still = (px: number, py: number): Script => () => [px, py];
/** Straight line from a point at a velocity, starting at `from` seconds, stopping after `forS` seconds. */
export const line = (px: number, py: number, vx: number, vy: number, from = 0, forS = Infinity): Script => (t) => {
  const dt = Math.min(Math.max(t - from, 0), forS);
  return [px + vx * dt, py + vy * dt];
};
/** Runs a polyline at a constant speed, then stops (settles) or keeps the last heading. */
export function alongRoute(route: readonly { px: number; py: number }[], speed: number, settles = false): Script {
  const out = new Float64Array(4);
  return (t) => { qb.projectAlongRoute(route, settles, route[0]!.px, route[0]!.py, speed * Math.max(t, 0), out); return [out[0]!, out[1]!]; };
}

export interface SceneSpec {
  seed?: number;
  /** The quarterback's attribute grades over the fixture's 50s. */
  attrs?: Record<string, number>;
  qbSpec?: PlayerSpec;
  /** Other slots' player specs. */
  players?: (slot: number) => PlayerSpec;
  qbAt?: readonly [number, number];
  scripts?: Record<number, Script>;
  /** Defenders who run at him from a point at a speed, from a time: [px, py, speedYps, startS]. */
  chasers?: Record<number, readonly [number, number, number, number]>;
  /** Slots he cannot see. */
  hidden?: readonly number[];
  play: qb.QbPlay;
  rules?: RuleSet;
  noThrow?: boolean;
  options?: Partial<qb.QuarterbackOptions>;
  setup?: (w: TickWorld) => void;
  /** Stop at the release instead of flying the ball. Default true. */
  stopAtThrow?: boolean;
  maxTicks?: number;
}

export interface SceneResult {
  world: TickWorld;
  quarterback: qb.Quarterback;
  record: qb.QbPlayRecord;
  events: TruthEvent[];
  view: TruthView;
  ticks: number;
  /** Play-frame position of a scripted slot at a time. */
  at(slot: number, t: number): readonly [number, number];
}

export function runScene(spec: SceneSpec): SceneResult {
  const scripts = spec.scripts ?? {};
  const w = fixtureWorld({
    seed: spec.seed ?? 1, params: TABLE, rules: spec.rules ?? rules(), ballX: 50,
    players: (s) => (s === QB ? { ...(spec.qbSpec ?? {}), attributes: { ...(spec.qbSpec?.attributes ?? {}), ...(spec.attrs ?? {}) } } : spec.players?.(s) ?? {}),
  });
  const events: TruthEvent[] = [];
  const emit = w.emit;
  (w as { emit: TickWorld['emit'] }).emit = (e) => { events.push(e); emit.call(w, e); };
  const view = new TruthView(w, QB);
  for (let s = 0; s < SLOT_COUNT; s++) {
    if (s === QB) continue;
    if (scripts[s] || spec.chasers?.[s]) continue;
    // Unused bodies stand far from the play and out of his sight.
    place(w, s, s < SLOTS_PER_TEAM ? -40 : 45, -20 + (s % SLOTS_PER_TEAM) * 3);
    view.hidden.add(s);
  }
  for (const h of spec.hidden ?? []) view.hidden.add(h);
  const start = spec.qbAt ?? [spec.play.underCenter ? -1 : -5, 0];
  place(w, QB, start[0], start[1]);
  const pin = (t: number): void => {
    for (const key of Object.keys(scripts)) {
      const s = Number(key), f = scripts[s]!, a = f(t), b = f(t + TICK_S), d = w.frame.attackDir;
      place(w, s, a[0], a[1]);
      w.players.velX[s] = ((b[0] - a[0]) / TICK_S) * d; w.players.velY[s] = ((b[1] - a[1]) / TICK_S) * d;
    }
  };
  const chase: Record<number, [number, number]> = {};
  for (const key of Object.keys(spec.chasers ?? {})) { const c = spec.chasers![Number(key)]!; chase[Number(key)] = [c[0], c[1]]; }
  const pinChasers = (t: number, advance: boolean): void => {
    for (const key of Object.keys(chase)) {
      const s = Number(key), c = spec.chasers![s]!, at = chase[s]!, d = w.frame.attackDir;
      const qx = (w.players.posX[QB]! - w.frame.originX) * d, qy = (w.players.posY[QB]! - w.frame.originY) * d;
      const dx = qx - at[0], dy = qy - at[1], dist = Math.hypot(dx, dy), go = t >= c[3] - 1e-9 && dist > 0.3;
      const vx = go ? (dx / dist) * c[2] : 0, vy = go ? (dy / dist) * c[2] : 0;
      if (advance && go) { const stepYd = Math.min(c[2] * TICK_S, Math.max(dist - 0.3, 0)); at[0] += (dx / dist) * stepYd; at[1] += (dy / dist) * stepYd; }
      place(w, s, at[0], at[1]);
      w.players.velX[s] = vx * d; w.players.velY[s] = vy * d;
    }
  };
  pin(0); pinChasers(0, false);
  w.tick = 0;
  w.ball.kind = 'held'; w.ball.carrierSlot = QB; w.ball.lastPossessorSlot = QB; w.players.hasBall[QB] = 1;
  w.ball.x = w.players.posX[QB]!; w.ball.y = w.players.posY[QB]!;
  spec.setup?.(w);

  const movement = createMovement(), balls = ball.createBallStages();
  const quarterback = qb.createQuarterback({
    view: () => view, contests: CONTESTS, topSpeed: movement.modeTopSpeed, test: { noThrow: spec.noThrow ?? false }, ...(spec.options ?? {}),
  });
  quarterback.setPlay(spec.play);
  const pinBefore: PlayStage = { name: 'perceive', run: (world) => { pin(world.tick * TICK_S); pinChasers(world.tick * TICK_S, false); } };
  const pinAfter: PlayStage = { name: 'interact', run: (world) => { pin((world.tick + 1) * TICK_S); pinChasers(world.tick * TICK_S, true); } };
  // TEST-ONLY dead-ball detector: the real one is the integrator's (WP-23) and reads the same module state.
  const dead: PlayStage = {
    name: 'detect',
    run: (world) => {
      const r = quarterback.record();
      if (r.sack !== null || r.kneel !== null || world.ball.kind === 'dead') world.deadAtTick = world.tick;
    },
  };
  const loop = createTickLoop([pinBefore, quarterback.decide, movement.stage, balls.move, pinAfter, quarterback.interact, balls.detect as PlayStage, dead]);
  const max = spec.maxTicks ?? 120, stopAtThrow = spec.stopAtThrow ?? true;
  const res = loop.run(w, { stopAt: (world) => world.tick >= max || (stopAtThrow && quarterback.record().throwRecord !== null) || world.ball.carrierSlot !== QB && world.ball.kind === 'held' });
  return {
    world: w, quarterback, record: quarterback.record(), events, view, ticks: res.ticksRun,
    at: (slot, t) => scripts[slot]!(t),
  };
}

/** A receiver target whose designed route is the script the body runs. */
export function target(slot: number, route: readonly { px: number; py: number }[], breakIndex = -1, settles = false): qb.QbTarget {
  return { slot, route, breakIndex, settles };
}
export function read(t: qb.QbTarget, priorValue = 0.3): qb.QbRead { return { kind: 'receiver', target: t, priorValue }; }

/**
 * TEST-ONLY catch-point resolver (the real one is J6.5 in the integration): the chance the throw on
 * record is caught, from where the receiver and the nearest shown defender truly are at arrival.
 */
export function catchChance(r: SceneResult, defenders: readonly number[]): { p: number; int: number; sepYd: number; offTargetYd: number } {
  const th = r.record.throwRecord!, w = r.world, d = w.frame.attackDir;
  const tArr = th.timeS + th.flightS;
  const landPx = (th.landingX - w.frame.originX) * d, landPy = (th.landingY - w.frame.originY) * d;
  const rec = r.at(th.targetSlot, tArr);
  const off = Math.hypot(rec[0] - landPx, rec[1] - landPy);
  let sep = Infinity;
  for (const s of defenders) { const a = r.at(s, tArr); sep = Math.min(sep, Math.hypot(a[0] - landPx, a[1] - landPy)); }
  // The receiver adjusts to the ball in flight (J6.5 reach test); the resolver grants the same reach the quarterback assumes.
  const cp = CONTESTS.catchPoint, radius = cp.catchRadiusYd(0, false) + P['judge.reachAdjustYd'];
  if (off > radius) return { p: 0, int: sep < radius ? 0.3 : 0, sepYd: sep, offTargetYd: off };
  if (cp.isContested(sep)) {
    const pr = cp.contestedProbabilities({ zContestedCatch: 0, zBallSkills: 0, position: 'inPhase', ballLocated: true, placementError: off / radius, hitAtCatch: false, wet: false });
    return { p: pr[0]!, int: pr[2]!, sepYd: sep, offTargetYd: off };
  }
  return { p: cp.uncontestedCatchProbability({ zHands: 0, placementError: off / radius, hitAtCatch: false, wet: false }), int: 0, sepYd: sep, offTargetYd: off };
}

export function share(n: number, f: (seed: number) => boolean): number {
  let k = 0;
  for (let i = 1; i <= n; i++) if (f(i)) k++;
  return k / n;
}
export function mean(n: number, f: (seed: number) => number | null): number {
  let sum = 0, k = 0;
  for (let i = 1; i <= n; i++) { const v = f(i); if (v !== null) { sum += v; k++; } }
  return k > 0 ? sum / k : NaN;
}
