// Fixtures for the carrier tests: a truth view, the real movement and ball stages, scripted or chasing
// defenders, and the carrier module. Rule values are the tick fixture's test inputs, not rule data.
import { SLOT_COUNT, SLOTS_PER_TEAM, TICK_S, type ParamTable, type TickWorld, type TruthEvent } from '@gm/schema';
import * as ball from '../../src/ball/index.ts';
import * as carrier from '../../src/carrier/index.ts';
import { PARAMS as CONTEST_PARAMS, createContests } from '../../src/contest/index.ts';
import { DMATH } from '../../src/index.ts';
import { PARAMS as FIELD_PARAMS } from '../../src/field/index.ts';
import { PARAMS as KIN_PARAMS, createMovement } from '../../src/kinematics/index.ts';
import { PARAMS as PERCEPTION_PARAMS } from '../../src/perception/index.ts';
import { createTickLoop, paramTableFromFiles, type PlayStage } from '../../src/tick/index.ts';
import { createBoundaryWatcher, createHeldBallStage } from '../../src/field/index.ts';
import { createFinish } from '../../src/tick-resolver/finish.ts';
import { TruthView } from '../qb/helpers.ts';
import { fixtureRules, fixtureWorld, place, type PlayerSpec } from '../tick/support.ts';

export const TABLE = paramTableFromFiles([FIELD_PARAMS, KIN_PARAMS, PERCEPTION_PARAMS, ball.PARAMS, CONTEST_PARAMS, carrier.PARAMS]);
export const P = carrier.carrierParams(TABLE);
export function tableWith(over: Record<string, number>): ParamTable {
  return { version: 'test', has: (n) => TABLE.has(n), num: (n) => (over[n] ?? TABLE.num(n)) };
}

export const RB = 1;

export interface Chaser {
  /** Play-frame start. */
  readonly at: readonly [number, number];
  readonly speed: number;
  /** Seconds after the start before he moves. */
  readonly from?: number;
  /** Breaks down near the carrier (J2.3.4) instead of running through. */
  readonly breakdown?: boolean;
  readonly attrs?: Record<string, number>;
  /** Engaged in a block and so not a threat (stand-in for J6.3). */
  readonly blocked?: boolean;
  /** Stands still. */
  readonly still?: boolean;
}

export interface SceneSpec {
  seed?: number;
  attrs?: Record<string, number>;
  rbSpec?: PlayerSpec;
  rbAt?: readonly [number, number];
  rbVel?: readonly [number, number];
  /** Where the assignment points him at the start (play frame). */
  track?: readonly [number, number];
  /** Defensive slots (11 to 21) by slot. */
  chasers?: Record<number, Chaser>;
  /** Offensive teammates (2 to 10), standing or blocking. */
  mates?: Record<number, { at: readonly [number, number]; engagedWith?: number }>;
  play?: carrier.CarrierPlay;
  instruction?: Partial<carrier.CarrierInstruction>;
  style?: carrier.RunStyle;
  params?: ParamTable;
  maxTicks?: number;
  ballX?: number;
  ballY?: number;
  down?: number;
  distanceYd?: number;
  /** Possession event to emit at the start, which tells the module how the carry began. */
  how?: 'exchange' | 'catch' | 'kick_catch';
  behavior?: number;
  setup?: (w: TickWorld) => void;
  strip?: boolean;
}

export interface SceneResult {
  world: TickWorld;
  events: TruthEvent[];
  carrier: carrier.Carrier;
  record: carrier.CarrierRecord;
  ticks: number;
  dead: TruthEvent | null;
  view: TruthView;
}

export function runScene(spec: SceneSpec): SceneResult {
  const params = spec.params ?? TABLE;
  const w = fixtureWorld({
    seed: spec.seed ?? 1, params, rules: fixtureRules(70.75), ballX: spec.ballX ?? 50, ballY: spec.ballY, distanceYd: spec.distanceYd ?? 10,
    players: (s) => {
      if (s === RB) return { ...(spec.rbSpec ?? {}), attributes: { ...(spec.rbSpec?.attributes ?? {}), ...(spec.attrs ?? {}) } };
      const c = spec.chasers?.[s];
      return c?.attrs ? { attributes: c.attrs } : {};
    },
  });
  if (spec.down !== undefined) (w.situation as { down: number }).down = spec.down;
  const events: TruthEvent[] = [];
  const emit = w.emit;
  (w as { emit: TickWorld['emit'] }).emit = (e) => { events.push(e); emit.call(w, e); };
  const view = new TruthView(w, RB);
  const views = new Map<number, TruthView>();
  const viewOf = (s: number): TruthView => { let v = views.get(s); if (!v) { v = s === RB ? view : new TruthView(w, s); views.set(s, v); } return v; };
  const chasers = spec.chasers ?? {}, mates = spec.mates ?? {};
  for (let s = 0; s < SLOT_COUNT; s++) {
    if (s === RB || chasers[s] || mates[s]) continue;
    // Unused bodies stand far away and out of his sight.
    place(w, s, s < SLOTS_PER_TEAM ? -40 : 45, -24 + (s % SLOTS_PER_TEAM) * 3);
    view.hidden.add(s);
    w.players.moveMode[s] = 6;
    w.players.onGroundUntilTick[s] = 1e9;
  }
  for (const k of Object.keys(mates)) {
    const s = Number(k), m = mates[s]!;
    place(w, s, m.at[0], m.at[1]);
  }
  for (const k of Object.keys(chasers)) { const s = Number(k); place(w, s, chasers[s]!.at[0], chasers[s]!.at[1]); }
  const at = spec.rbAt ?? [-4, 0];
  place(w, RB, at[0], at[1]);
  const v0 = spec.rbVel ?? [6, 0];
  w.players.velX[RB] = v0[0] * w.frame.attackDir; w.players.velY[RB] = v0[1] * w.frame.attackDir;
  w.players.headingRad[RB] = Math.atan2(v0[1], v0[0]);
  w.players.gazeRad[RB] = w.players.headingRad[RB]!;
  w.players.moveMode[RB] = 1;
  if (spec.behavior !== undefined) (w.players.behavior as Uint8Array)[RB] = spec.behavior;
  else (w.players.behavior as Uint8Array)[RB] = 5; // ballCarrier
  w.tick = 0;
  w.ball.kind = 'held'; w.ball.carrierSlot = RB; w.ball.lastPossessorSlot = RB; w.players.hasBall[RB] = 1;
  w.ball.x = w.players.posX[RB]!; w.ball.y = w.players.posY[RB]!;
  // Engagement stand-ins: a contest record so the module sees these defenders as blocked.
  for (const k of Object.keys(mates)) {
    const s = Number(k), m = mates[s]!;
    if (m.engagedWith === undefined) continue;
    const idx = w.contests.length;
    w.contests.push({ type: 'runBlock', offenseSlot: s, defenseSlot: m.engagedWith, advantage: 0.3, startedTick: 0, helperSlots: [], stream: w.streams('contest', [1, 1, 900 + s, 901 + s, 'runBlock']) });
    (w.players.engagement as Int16Array)[s] = idx; (w.players.engagement as Int16Array)[m.engagedWith] = idx;
  }
  for (const k of Object.keys(chasers)) { const s = Number(k); if (chasers[s]!.blocked && (w.players.engagement as Int16Array)[s]! < 0) { const idx = w.contests.length; w.contests.push({ type: 'runBlock', offenseSlot: 2, defenseSlot: s, advantage: 0.3, startedTick: 0, helperSlots: [], stream: w.streams('contest', [1, 1, 950, 951 + s, 'runBlock']) }); (w.players.engagement as Int16Array)[s] = idx; } }
  if (spec.how) {
    const how = spec.how;
    w.events.push({ type: 'possession', t: 0, side: 0, playerId: w.slots[RB]!.playerId, spot: { x: w.ball.x, y: w.ball.y }, how });
  }
  spec.setup?.(w);

  const movement = createMovement(), balls = ball.createBallStages();
  const contests = createContests(params, DMATH);
  const instruction: carrier.CarrierInstruction = { ...carrier.NO_INSTRUCTION, ...(spec.instruction ?? {}) };
  const mod = carrier.createCarrier({
    view: viewOf, contests, movement,
    playerAi: { effortOf: () => 1, stripAttempt: () => spec.strip ?? false, patienceShift: () => 0 },
    instruction: (s) => (s === RB ? instruction : null),
    style: spec.style ? () => spec.style! : null,
  });
  mod.setPlay(spec.play ?? null);
  // Defenders: intents that seek the ball carrier (or stand), written each tick before the carrier decides.
  const track = spec.track ?? [at[0] + 10, at[1]];
  const chase: PlayStage = {
    name: 'decide',
    run: (world) => {
      if (world.tick === 0) {
        const it = world.intents[RB]!;
        it.target = { px: track[0], py: track[1] }; it.moveMode = 'sprint'; it.arrival = 'through'; it.effort = 1;
      }
      const d = world.frame.attackDir, cIdx = world.ball.carrierSlot >= 0 ? world.ball.carrierSlot : -1;
      for (const k of Object.keys(chasers)) {
        const s = Number(k), c = chasers[s]!, it = world.intents[s]!;
        if (c.still || (world.players.engagement[s]! >= 0) || world.tick * TICK_S < (c.from ?? 0) || cIdx < 0) {
          it.target = { px: (world.players.posX[s]! - world.frame.originX) * d, py: (world.players.posY[s]! - world.frame.originY) * d };
          it.moveMode = 'run'; it.arrival = 'arrive'; it.effort = 0.01;
          continue;
        }
        // Lead the carrier by his velocity over the time it would take to get there (a simple intercept angle).
        const cx = (world.players.posX[cIdx]! - world.frame.originX) * d, cy = (world.players.posY[cIdx]! - world.frame.originY) * d;
        const sx = (world.players.posX[s]! - world.frame.originX) * d, sy = (world.players.posY[s]! - world.frame.originY) * d;
        const lead = Math.min(Math.hypot(cx - sx, cy - sy) / Math.max(c.speed, 1), 1.5);
        const tx = cx + world.players.velX[cIdx]! * d * lead, ty = cy + world.players.velY[cIdx]! * d * lead;
        it.target = { px: tx, py: ty }; it.moveMode = 'sprint'; it.arrival = c.breakdown ? 'breakdown' : 'through'; it.effort = Math.min(1, c.speed / 9);
        movement.setChase(s, cIdx);
      }
    },
  };
  const boundary = createBoundaryWatcher();
  const loop = createTickLoop([
    chase, mod.decide, movement.stage, createHeldBallStage(), balls.move, boundary.moveStage, mod.interact, balls.detect as PlayStage, boundary.detectStage as PlayStage, createFinish(),
  ]);
  const res = loop.run(w, { stopAt: (world) => world.tick >= (spec.maxTicks ?? 90) });
  const dead = events.find((e) => e.type === 'dead_ball') ?? null;
  return { world: w, events, carrier: mod, record: mod.record(), ticks: res.ticksRun, dead, view };
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
